const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '..', 'data');
const CENTERLINES = path.join(DATA_DIR, 'centerlines.geojson');
const UNMATCHED_OUT = path.join(DATA_DIR, 'unmatched-permits.json');

// node scripts/build-permit-layer.js          -> test area only (permit-test.geojson)
// node scripts/build-permit-layer.js --city   -> whole city     (permit-city.geojson)
const CITY_MODE = process.argv.includes('--city');
const OUTPUT = path.join(
  __dirname, '..', 'client', 'public',
  CITY_MODE ? 'permit-city.geojson' : 'permit-test.geojson'
);

// Test area (lon/lat), only used without --city
const BBOX = { west: -87.68, south: 41.90, east: -87.63, north: 41.95 };

// true = full-block ranges (logiclf...), false = actual ranges (l_f_add...)
const USE_LOGICAL_RANGES = true;

// ---------- helpers ----------
function findPermitFile() {
  const files = fs.readdirSync(DATA_DIR);
  const match = files.find(f => /permit.*\.csv$/i.test(f));
  if (!match) {
    console.error('No permit CSV found in data/. Files there:', files);
    process.exit(1);
  }
  return path.join(DATA_DIR, match);
}

// Minimal CSV parser (handles quoted fields, CRLF, BOM)
function parseCSV(text) {
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
  const rows = [];
  let row = [];
  let field = '';
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; }
        else inQuotes = false;
      } else field += c;
    } else if (c === '"') inQuotes = true;
    else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\n') { row.push(field); rows.push(row); row = []; field = ''; }
    else if (c !== '\r') field += c;
  }
  if (field.length || row.length) { row.push(field); rows.push(row); }
  return rows;
}

const normHeader = h =>
  h.trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
const clean = s => String(s ?? '').toUpperCase().replace(/\s+/g, ' ').trim();
const streetKey = (dir, name, type) =>
  [clean(dir), clean(name), clean(type)].filter(Boolean).join(' ');

function points(geometry) {
  if (!geometry) return [];
  if (geometry.type === 'LineString') return geometry.coordinates;
  if (geometry.type === 'MultiLineString') return geometry.coordinates.flat();
  return [];
}
function inBox([lon, lat]) {
  return lon >= BBOX.west && lon <= BBOX.east && lat >= BBOX.south && lat <= BBOX.north;
}

// Left/right address ranges of a centerline segment (skips sides with no addresses)
function sidesOf(p) {
  const L = USE_LOGICAL_RANGES ? [p.logiclf, p.logiclt] : [p.l_f_add, p.l_t_add];
  const R = USE_LOGICAL_RANGES ? [p.logicrf, p.logicrt] : [p.r_f_add, p.r_t_add];
  return [
    { lo: Math.min(+L[0], +L[1]), hi: Math.max(+L[0], +L[1]), parity: clean(p.l_parity) },
    { lo: Math.min(+R[0], +R[1]), hi: Math.max(+R[0], +R[1]), parity: clean(p.r_parity) }
  ].filter(s => Number.isFinite(s.lo) && Number.isFinite(s.hi) && s.hi > 0);
}

const topN = (map, n) =>
  [...map.entries()].sort((x, y) => y[1] - x[1]).slice(0, n);

// ---------- load permits ----------
console.log(CITY_MODE ? 'Mode: WHOLE CITY' : 'Mode: test area only');
const permitFile = findPermitFile();
console.log('Permit file:', permitFile);
const rows = parseCSV(fs.readFileSync(permitFile, 'utf8')).filter(r => r.length > 1);
const headers = rows[0].map(normHeader);
console.log('Permit headers:', headers);

const REQUIRED = [
  'address_range_low', 'address_range_high', 'odd_even',
  'street_direction', 'street_name', 'street_type',
  'buffer', 'status', 'zone'
];
const missing = REQUIRED.filter(h => !headers.includes(h));
if (missing.length) {
  console.error('Missing columns:', missing);
  process.exit(1);
}

const permits = rows.slice(1).map(r => {
  const o = {};
  headers.forEach((h, i) => { o[h] = r[i]; });
  return o;
});
const active = permits.filter(
  p => clean(p.buffer) === 'N' && clean(p.status) === 'ACTIVE'
);
console.log(
  `Permit rows: ${permits.length} total, ${active.length} after Buffer=N and Status=ACTIVE`
);

const permitParity = {};
active.forEach(p => {
  const v = clean(p.odd_even) || '(blank)';
  permitParity[v] = (permitParity[v] || 0) + 1;
});
console.log('Permit odd_even values:', permitParity);

// ---------- load + index centerlines ----------
console.log('Loading centerlines (this can take a few seconds)...');
const centerlines = JSON.parse(fs.readFileSync(CENTERLINES, 'utf8'));
console.log('Centerline segments:', centerlines.features.length);

const byKey = new Map();
centerlines.features.forEach((f, idx) => {
  const p = f.properties;
  const key = streetKey(p.pre_dir, p.street_nam, p.street_typ);
  if (!byKey.has(key)) byKey.set(key, []);
  byKey.get(key).push(idx);
});

const sideParity = {};
centerlines.features.forEach(f => {
  ['l_parity', 'r_parity'].forEach(k => {
    const v = clean(f.properties[k]) || '(blank)';
    sideParity[v] = (sideParity[v] || 0) + 1;
  });
});
console.log('Centerline side parity values:', sideParity);

// ---------- join: street + range overlap + parity, per side ----------
const hits = new Map(); // feature index -> { odd, even, zones }
const unmatchedRows = [];
const reasonCounts = { street_not_found: 0, no_range_overlap: 0 };
const unmatchedByKey = new Map();
let matchedPermits = 0;
let skippedPermits = 0;

for (const permit of active) {
  const a = parseFloat(permit.address_range_low);
  const b = parseFloat(permit.address_range_high);
  if (!Number.isFinite(a) || !Number.isFinite(b)) { skippedPermits++; continue; }
  const lo = Math.min(a, b);
  const hi = Math.max(a, b);
  const parity = clean(permit.odd_even); // 'O' or 'E'
  const key = streetKey(permit.street_direction, permit.street_name, permit.street_type);

  const candidates = byKey.get(key) || [];
  let matched = false;
  for (const idx of candidates) {
    const p = centerlines.features[idx].properties;
    for (const side of sidesOf(p)) {
      if (side.parity !== parity) continue;
      if (Math.max(lo, side.lo) > Math.min(hi, side.hi)) continue; // no overlap
      matched = true;
      const h = hits.get(idx) || { odd: false, even: false, zones: new Set() };
      if (parity === 'O') h.odd = true;
      if (parity === 'E') h.even = true;
      h.zones.add(permit.zone);
      hits.set(idx, h);
    }
  }

  if (matched) {
    matchedPermits++;
  } else {
    const reason = candidates.length ? 'no_range_overlap' : 'street_not_found';
    reasonCounts[reason]++;
    unmatchedByKey.set(key, (unmatchedByKey.get(key) || 0) + 1);
    unmatchedRows.push({
      row_id: permit.row_id,
      zone: permit.zone,
      street: key,
      low: lo,
      high: hi,
      parity,
      reason
    });
  }
}

console.log(`Permit rows matched to a segment: ${matchedPermits} of ${active.length}`);
if (skippedPermits) console.log(`Skipped (bad address range): ${skippedPermits}`);
console.log('Unmatched by reason:', reasonCounts);
console.log('Top unmatched street keys:', topN(unmatchedByKey, 15));

fs.writeFileSync(UNMATCHED_OUT, JSON.stringify(unmatchedRows, null, 2));
console.log(`Wrote ${unmatchedRows.length} unmatched rows -> ${UNMATCHED_OUT}`);

// ---------- write the layer ----------
const features = [];
let oddOnly = 0, evenOnly = 0, both = 0;
for (const [idx, h] of hits) {
  const f = centerlines.features[idx];
  if (!CITY_MODE && !points(f.geometry).some(inBox)) continue;
  if (h.odd && h.even) both++;
  else if (h.odd) oddOnly++;
  else evenOnly++;
  const p = f.properties;
  features.push({
    type: 'Feature',
    properties: {
      street: `${p.pre_dir || ''} ${p.street_nam || ''} ${p.street_typ || ''}`.trim(),
      odd_hit: h.odd,
      even_hit: h.even,
      zones: [...h.zones].join(',')
    },
    geometry: f.geometry
  });
}

fs.writeFileSync(OUTPUT, JSON.stringify({ type: 'FeatureCollection', features }));
const mb = (fs.statSync(OUTPUT).size / 1024 / 1024).toFixed(1);
console.log(
  `Segments written: ${features.length} (odd only ${oddOnly}, even only ${evenOnly}, both ${both}), ${mb} MB -> ${OUTPUT}`
);
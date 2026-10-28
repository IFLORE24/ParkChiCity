const fs = require('fs');
const path = require('path');

const INPUT = path.join(__dirname, '..', 'data', 'centerlines.geojson');
const OUTPUT = path.join(__dirname, '..', 'client', 'public', 'centerlines-test.geojson');

// Test area (lon/lat): west, south, east, north
const BBOX = { west: -87.68, south: 41.90, east: -87.63, north: 41.95 };

// Flatten LineString / MultiLineString into a list of [lon, lat] points
function points(geometry) {
  if (!geometry) return [];
  if (geometry.type === 'LineString') return geometry.coordinates;
  if (geometry.type === 'MultiLineString') return geometry.coordinates.flat();
  return [];
}

function inBox([lon, lat]) {
  return lon >= BBOX.west && lon <= BBOX.east && lat >= BBOX.south && lat <= BBOX.north;
}

const data = JSON.parse(fs.readFileSync(INPUT, 'utf8'));
console.log('Total features:', data.features.length);
console.log('Sample properties:', data.features[0]?.properties);

const kept = data.features.filter(f => points(f.geometry).some(inBox));

fs.writeFileSync(
  OUTPUT,
  JSON.stringify({ type: 'FeatureCollection', features: kept })
);
console.log(`Kept ${kept.length} features -> ${OUTPUT}`);
require('dotenv').config({ path: '../.env' });
const db = require('../db');
const { isInChicago } = require('../lib/chicago');

const fetch = (...args) => import('node-fetch').then(({ default: f }) => f(...args));

const HIGHWAY_TYPES = [
  'residential',
  'primary',
  'secondary',
  'tertiary',
  'unclassified',
  'living_street'
];

const overpassQuery = `
  [out:json][timeout:300];
  (
    ${HIGHWAY_TYPES.map(t => `way["highway"="${t}"](41.644,-87.868,42.023,-87.524);`).join('\n    ')}
  );
  out geom;
`;

async function seedChicagoStreets() {
  console.log('Querying Overpass for all Chicago drivable streets...');
  console.log('This will take 1-3 minutes. Overpass is doing real work here.');

  const start = Date.now();
  const response = await fetch('https://overpass-api.de/api/interpreter', {
    method: 'POST',
    body: overpassQuery
  });

  if (!response.ok) {
    throw new Error(`Overpass returned ${response.status}: ${await response.text()}`);
  }

  const data = await response.json();
  const elapsed = ((Date.now() - start) / 1000).toFixed(1);
  console.log(`Overpass returned ${data.elements.length} ways in ${elapsed}s.`);

  console.log('Clearing existing chicago_streets table...');
  await db.query('TRUNCATE chicago_streets RESTART IDENTITY');

  console.log('Filtering and inserting...');

  let inserted = 0;
  let skippedOutside = 0;
  let skippedTooShort = 0;
  let totalPointsBefore = 0;
  let totalPointsAfter = 0;

  for (const way of data.elements) {
    if (!way.geometry) {
      skippedTooShort++;
      continue;
    }

    totalPointsBefore += way.geometry.length;

    // Filter to Chicago-only points.
    const filtered = way.geometry.filter(pt => isInChicago(pt.lon, pt.lat));
    totalPointsAfter += filtered.length;

    if (filtered.length < 2) {
      // Either the entire way is outside Chicago, or only one point survived.
      // Either way, can't draw a line from it.
      if (filtered.length === 0) skippedOutside++;
      else skippedTooShort++;
      continue;
    }

    const geometryJson = filtered.map(pt => ({ lon: pt.lon, lat: pt.lat }));
    const streetName = way.tags?.name || null;
    const highwayType = way.tags?.highway;

    await db.query(
      `INSERT INTO chicago_streets (osm_way_id, street_name, highway_type, geometry)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (osm_way_id) DO NOTHING`,
      [way.id, streetName, highwayType, JSON.stringify(geometryJson)]
    );
    inserted++;

    if (inserted % 500 === 0) {
      console.log(`  Inserted ${inserted}...`);
    }
  }

  console.log('\n=== Seed Complete ===');
  console.log(`Ways inserted:        ${inserted.toLocaleString()}`);
  console.log(`Ways outside Chicago: ${skippedOutside.toLocaleString()}`);
  console.log(`Ways too short:       ${skippedTooShort.toLocaleString()}`);
  console.log(`Points before filter: ${totalPointsBefore.toLocaleString()}`);
  console.log(`Points after filter:  ${totalPointsAfter.toLocaleString()}`);
  console.log(`Points removed:       ${(totalPointsBefore - totalPointsAfter).toLocaleString()} (${((1 - totalPointsAfter / totalPointsBefore) * 100).toFixed(1)}%)`);

  process.exit(0);
}

seedChicagoStreets().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
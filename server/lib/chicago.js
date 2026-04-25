const fs = require('fs');
const path = require('path');
const booleanPointInPolygon = require('@turf/boolean-point-in-polygon').default;
const { point } = require('@turf/helpers');

const boundaryPath = path.join(__dirname, '..', 'data', 'chicago_boundaries.geojson');
const boundaryGeoJSON = JSON.parse(fs.readFileSync(boundaryPath, 'utf8'));

const chicagoBoundary = boundaryGeoJSON.features[0];

if (!chicagoBoundary || !chicagoBoundary.geometry) {
  throw new Error('chicago-boundary.json did not contain an expected Feature');
}

function isInChicago(lon, lat) {
  const pt = point([lon, lat]);
  return booleanPointInPolygon(pt, chicagoBoundary);
}

module.exports = { isInChicago };
const { REPORT_TYPES } = require('./constants');

// Rough bounding box around Chicago
const BOUNDS = { west: -87.95, east: -87.5, south: 41.6, north: 42.05 };

const CONTROL_STRICT = /[\u0000-\u001f\u007f]/;
const CONTROL_MULTILINE = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/; // allows tab and newlines

function cleanText(value, { max, required, multiline }, field, errors) {
  if (value === undefined || value === null || value === '') {
    if (required) errors.push(`${field} is required`);
    return '';
  }
  if (typeof value !== 'string') {
    errors.push(`${field} must be text`);
    return '';
  }
  const text = value.trim();
  if (required && !text) {
    errors.push(`${field} is required`);
    return '';
  }
  if (text.length > max) {
    errors.push(`${field} must be ${max} characters or fewer`);
    return '';
  }
  if ((multiline ? CONTROL_MULTILINE : CONTROL_STRICT).test(text)) {
    errors.push(`${field} contains invalid characters`);
    return '';
  }
  return text;
}

// Only the fields listed here are ever copied from the request.
// status, createdAt, and _id are never accepted from the client.
function validateReport(body) {
  const errors = [];

  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return { ok: false, errors: ['Body must be a JSON object'] };
  }

  const address = cleanText(body.address, { max: 200, required: true }, 'address', errors);
  const note = cleanText(body.note, { max: 500, multiline: true }, 'note', errors);

  if (!REPORT_TYPES.includes(body.reportType)) {
    errors.push(`reportType must be one of: ${REPORT_TYPES.join(', ')}`);
  }

  let lon;
  let lat;
  const coords = body.location && body.location.coordinates;
  if (
    !Array.isArray(coords) ||
    coords.length !== 2 ||
    !coords.every(n => typeof n === 'number' && Number.isFinite(n))
  ) {
    errors.push('location.coordinates must be [longitude, latitude]');
  } else {
    [lon, lat] = coords;
    if (lon < BOUNDS.west || lon > BOUNDS.east || lat < BOUNDS.south || lat > BOUNDS.north) {
      errors.push('location must be inside Chicago');
    }
  }

  let appResult = { zones: '', oddHit: false, evenHit: false };
  const ar = body.appResult;
  if (ar !== undefined) {
    if (!ar || typeof ar !== 'object' || Array.isArray(ar)) {
      errors.push('appResult must be an object');
    } else {
      const zones = cleanText(ar.zones, { max: 100 }, 'appResult.zones', errors);
      if (ar.oddHit !== undefined && typeof ar.oddHit !== 'boolean') {
        errors.push('appResult.oddHit must be true or false');
      }
      if (ar.evenHit !== undefined && typeof ar.evenHit !== 'boolean') {
        errors.push('appResult.evenHit must be true or false');
      }
      appResult = { zones, oddHit: ar.oddHit === true, evenHit: ar.evenHit === true };
    }
  }

  if (errors.length) return { ok: false, errors };

  return {
    ok: true,
    value: {
      address,
      location: { type: 'Point', coordinates: [lon, lat] },
      reportType: body.reportType,
      note,
      appResult
    }
  };
}

module.exports = { validateReport };
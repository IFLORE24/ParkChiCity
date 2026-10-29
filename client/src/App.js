import { useEffect, useRef, useState } from 'react';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import Sidebar from './components/Sidebar';
import AboutPage from './components/AboutPage';

mapboxgl.accessToken = process.env.REACT_APP_MAPBOX_TOKEN;

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:3001';

// Rough bounding box around Chicago: west, south, east, north
const CHICAGO_BBOX = [-87.95, 41.6, -87.5, 42.05];

// How far (in meters) from a geocoded point a permit street can be and still count
const MAX_DISTANCE_M = 35;

const EMPTY = { type: 'FeatureCollection', features: [] };

// Values must match REPORT_TYPES in server/constants.js
const REPORT_TYPE_OPTIONS = [
  { value: 'wrong_zone', label: 'The permit zone shown is wrong' },
  { value: 'missing_zone', label: 'A permit zone is missing here' },
  { value: 'zone_removed', label: 'This zone no longer exists' },
  { value: 'other', label: 'Something else' }
];

// ---------- geometry helpers ----------
function flattenLines(geometry) {
  if (!geometry) return [];
  if (geometry.type === 'LineString') return [geometry.coordinates];
  if (geometry.type === 'MultiLineString') return geometry.coordinates;
  return [];
}

// Distance in meters from a point to a set of polylines. Uses a flat local
// projection centered on the point, which is accurate enough at city scale.
function distanceToLines(point, lines) {
  const [lon0, lat0] = point;
  const kx = 111320 * Math.cos((lat0 * Math.PI) / 180);
  const ky = 110540;
  let best = Infinity;

  for (const line of lines) {
    for (let i = 0; i < line.length - 1; i++) {
      const ax = (line[i][0] - lon0) * kx;
      const ay = (line[i][1] - lat0) * ky;
      const bx = (line[i + 1][0] - lon0) * kx;
      const by = (line[i + 1][1] - lat0) * ky;
      const dx = bx - ax;
      const dy = by - ay;
      const len2 = dx * dx + dy * dy;
      let t = len2 === 0 ? 0 : -(ax * dx + ay * dy) / len2;
      t = Math.max(0, Math.min(1, t));
      const d = Math.hypot(ax + t * dx, ay + t * dy);
      if (d < best) best = d;
    }
  }
  return best;
}

// QUICK VERSION: nearest permit segment within MAX_DISTANCE_M.
// The exact version will replace this function with a house-number
// range and parity check.
function findNearestPermit(point, permitData) {
  if (!permitData) return null;
  let nearest = null;
  let nearestDist = Infinity;

  for (const feature of permitData.features) {
    const d = distanceToLines(point, flattenLines(feature.geometry));
    if (d < nearestDist) {
      nearestDist = d;
      nearest = feature;
    }
  }
  if (!nearest || nearestDist > MAX_DISTANCE_M) return null;
  return { feature: nearest, distance: nearestDist };
}

function sidesText(p) {
  if (p.odd_hit && p.even_hit) return 'Both sides of the street';
  if (p.odd_hit) return 'Odd-numbered side only';
  return 'Even-numbered side only';
}

function zonesText(zones) {
  const list = String(zones || '')
    .split(',')
    .map(z => z.trim())
    .filter(Boolean);
  if (list.length === 0) return 'Zone unknown';
  return `${list.length > 1 ? 'Zones' : 'Zone'} ${list.join(', ')}`;
}

// ---------- component ----------
function App() {
  const mapContainer = useRef(null);
  const map = useRef(null);
  const marker = useRef(null);
  const permitData = useRef(null);
  const [isAboutOpen, setIsAboutOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);

  // Report form state
  const [reportOpen, setReportOpen] = useState(false);
  const [reportType, setReportType] = useState('wrong_zone');
  const [reportNote, setReportNote] = useState('');
  const [reportStatus, setReportStatus] = useState('idle'); // idle | sending | sent | error
  const [reportError, setReportError] = useState('');

  useEffect(() => {
    if (map.current) return;
    map.current = new mapboxgl.Map({
      container: mapContainer.current,
      style: 'mapbox://styles/mapbox/streets-v12',
      center: [-87.6553, 41.9242],
      zoom: 14
    });

    map.current.on('load', async () => {
      try {
        const res = await fetch('/permit-city.geojson');
        if (!res.ok) throw new Error(`Failed to load permit layer (${res.status})`);
        const geojson = await res.json();
        permitData.current = geojson;
        console.log('Permit segments:', geojson.features.length);

        map.current.addSource('permit-streets', { type: 'geojson', data: geojson });
        map.current.addLayer({
          id: 'permit-streets-layer',
          type: 'line',
          source: 'permit-streets',
          paint: {
            'line-color': [
              'case',
              ['all', ['==', ['get', 'odd_hit'], true], ['==', ['get', 'even_hit'], true]],
              '#FF4444', // both sides restricted: red
              '#FFD400'  // only one side restricted: yellow
            ],
            'line-width': 3,
            'line-opacity': 0.85
          }
        });

        // Halo under the permit line for the street matched by a search
        map.current.addSource('selected-segment', { type: 'geojson', data: EMPTY });
        map.current.addLayer(
          {
            id: 'selected-segment-layer',
            type: 'line',
            source: 'selected-segment',
            paint: {
              'line-color': '#1a73e8',
              'line-width': 9,
              'line-opacity': 0.55
            }
          },
          'permit-streets-layer'
        );
      } catch (err) {
        console.error('Failed to load permit layer:', err);
      }
    });
  }, []);

  function resetReport() {
    setReportOpen(false);
    setReportType('wrong_zone');
    setReportNote('');
    setReportStatus('idle');
    setReportError('');
  }

  function clearSearch() {
    if (marker.current) {
      marker.current.remove();
      marker.current = null;
    }
    const source = map.current && map.current.getSource('selected-segment');
    if (source) source.setData(EMPTY);
    setResult(null);
    resetReport();
  }

  async function handleSearch(e) {
    e.preventDefault();
    const q = query.trim();
    if (!q || loading) return;

    setLoading(true);
    setResult(null);
    resetReport();

    try {
      const url =
        'https://api.mapbox.com/search/geocode/v6/forward' +
        `?q=${encodeURIComponent(q)}` +
        '&country=us&types=address&limit=1&autocomplete=false' +
        `&bbox=${CHICAGO_BBOX.join(',')}` +
        `&access_token=${mapboxgl.accessToken}`;

      const res = await fetch(url);
      if (!res.ok) throw new Error(`Geocoding failed (${res.status})`);
      const data = await res.json();
      const found = data.features && data.features[0];

      if (!found) {
        setResult({ kind: 'notfound' });
        return;
      }

      const [lon, lat] = found.geometry.coordinates;
      const address =
        (found.properties && (found.properties.full_address || found.properties.name)) || q;

      if (marker.current) marker.current.remove();
      marker.current = new mapboxgl.Marker().setLngLat([lon, lat]).addTo(map.current);
      map.current.flyTo({ center: [lon, lat], zoom: 17 });

      const match = findNearestPermit([lon, lat], permitData.current);
      const selected = map.current.getSource('selected-segment');

      if (match) {
        if (selected) selected.setData({ type: 'FeatureCollection', features: [match.feature] });
        setResult({ kind: 'permit', address, coords: [lon, lat], match });
      } else {
        if (selected) selected.setData(EMPTY);
        setResult({ kind: 'none', address, coords: [lon, lat] });
      }
    } catch (err) {
      console.error('Search failed:', err);
      setResult({ kind: 'error' });
    } finally {
      setLoading(false);
    }
  }

  async function submitReport(e) {
    e.preventDefault();
    if (!result || !result.coords || reportStatus === 'sending') return;

    const p = result.kind === 'permit' ? result.match.feature.properties : null;
    const payload = {
      address: result.address,
      location: { type: 'Point', coordinates: result.coords },
      reportType,
      note: reportNote.trim(),
      appResult: {
        zones: p ? String(p.zones || '') : '',
        oddHit: p ? !!p.odd_hit : false,
        evenHit: p ? !!p.even_hit : false
      }
    };

    setReportStatus('sending');
    setReportError('');

    try {
      const res = await fetch(`${API_URL}/api/reports`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (res.status === 201) {
        setReportStatus('sent');
        setReportOpen(false);
        return;
      }

      let message = 'Could not send your report. Please try again.';
      if (res.status === 429) {
        message = 'Too many reports from your connection. Please try again later.';
      } else if (res.status === 400) {
        try {
          const body = await res.json();
          if (Array.isArray(body.details) && body.details.length) {
            message = body.details.join('. ');
          }
        } catch (parseErr) {
          // keep the generic message
        }
      }
      setReportError(message);
      setReportStatus('error');
    } catch (err) {
      console.error('Report failed:', err);
      setReportError('Could not reach the server. Please try again later.');
      setReportStatus('error');
    }
  }

  const cardStyle = {
    position: 'absolute',
    left: 'calc(260px + 16px)',
    bottom: 24,
    width: 340,
    maxWidth: 'calc(100vw - 292px)',
    maxHeight: 'calc(100vh - 120px)',
    overflowY: 'auto',
    background: '#fff',
    color: '#1b1f27',
    borderRadius: 10,
    padding: '14px 16px',
    boxShadow: '0 4px 18px rgba(0,0,0,0.25)',
    fontSize: 14,
    lineHeight: 1.4,
    zIndex: 5
  };

  const linkButton = {
    background: 'none',
    border: 'none',
    color: '#1a73e8',
    cursor: 'pointer',
    padding: 0,
    fontSize: 13
  };

  const fieldStyle = {
    width: '100%',
    boxSizing: 'border-box',
    padding: '8px 10px',
    borderRadius: 6,
    border: '1px solid #c9ced6',
    fontSize: 14,
    fontFamily: 'inherit'
  };

  const canReport = result && (result.kind === 'permit' || result.kind === 'none');

  return (
    <div style={{ width: '100vw', height: '100vh', position: 'relative' }}>
      <Sidebar onAboutClick={() => setIsAboutOpen(true)} />
      <div ref={mapContainer} style={{
        position: 'absolute',
        top: 0,
        left: '260px',
        right: 0,
        bottom: 0
      }} />

      <form
        onSubmit={handleSearch}
        style={{
          position: 'absolute',
          top: 16,
          left: 'calc(260px + 16px)',
          display: 'flex',
          gap: 8,
          zIndex: 5
        }}
      >
        <input
          type="text"
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder="Search a Chicago address, e.g. 3250 N Lincoln Ave"
          aria-label="Search a Chicago address"
          style={{
            width: 340,
            maxWidth: 'calc(100vw - 420px)',
            padding: '10px 12px',
            borderRadius: 8,
            border: '1px solid #c9ced6',
            fontSize: 14,
            boxShadow: '0 2px 8px rgba(0,0,0,0.2)'
          }}
        />
        <button
          type="submit"
          disabled={loading}
          style={{
            padding: '10px 16px',
            borderRadius: 8,
            border: 'none',
            background: '#1a73e8',
            color: '#fff',
            fontSize: 14,
            cursor: loading ? 'default' : 'pointer',
            opacity: loading ? 0.7 : 1
          }}
        >
          {loading ? 'Searching…' : 'Search'}
        </button>
      </form>

      {result && (
        <div style={cardStyle}>
          {result.kind === 'permit' && (
            <>
              <div style={{ fontWeight: 600, marginBottom: 4 }}>{result.address}</div>
              <div style={{ fontSize: 16, fontWeight: 700, color: '#c62828' }}>
                Permit parking found nearby
              </div>
              <div>{zonesText(result.match.feature.properties.zones)}</div>
              <div>{sidesText(result.match.feature.properties)}</div>
              <div style={{ color: '#555', marginTop: 4 }}>
                Nearest permit street: {result.match.feature.properties.street} (
                {Math.round(result.match.distance)} m from this point)
              </div>
            </>
          )}
          {result.kind === 'none' && (
            <>
              <div style={{ fontWeight: 600, marginBottom: 4 }}>{result.address}</div>
              <div style={{ fontSize: 16, fontWeight: 700 }}>No permit zone found nearby</div>
              <div style={{ color: '#555' }}>
                Nothing in the city's permit data within {MAX_DISTANCE_M} m of this address.
              </div>
            </>
          )}
          {result.kind === 'notfound' && (
            <div>No Chicago address found for that search. Try adding the street type, like "Ave" or "St".</div>
          )}
          {result.kind === 'error' && (
            <div>Something went wrong with the search. Please try again.</div>
          )}

          {canReport && (
            <div style={{ color: '#777', fontSize: 12, marginTop: 8 }}>
              This match is approximate and covers residential permit zones only. Always check
              the posted signs.
            </div>
          )}

          {canReport && reportStatus === 'sent' && (
            <div style={{ marginTop: 10, color: '#2e7d32', fontWeight: 600 }}>
              Thanks. Your report was submitted for review.
            </div>
          )}

          {canReport && reportStatus !== 'sent' && !reportOpen && (
            <div style={{ marginTop: 10 }}>
              <button type="button" onClick={() => setReportOpen(true)} style={linkButton}>
                Report a problem with this result
              </button>
            </div>
          )}

          {canReport && reportOpen && (
            <form onSubmit={submitReport} style={{ marginTop: 10 }}>
              <label style={{ display: 'block', fontSize: 13, marginBottom: 4 }}>
                What's wrong?
              </label>
              <select
                value={reportType}
                onChange={e => setReportType(e.target.value)}
                style={fieldStyle}
              >
                {REPORT_TYPE_OPTIONS.map(opt => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>

              <label style={{ display: 'block', fontSize: 13, margin: '10px 0 4px' }}>
                Details (optional)
              </label>
              <textarea
                value={reportNote}
                onChange={e => setReportNote(e.target.value)}
                maxLength={500}
                rows={3}
                placeholder="For example: signs on this block say Zone 142."
                style={{ ...fieldStyle, resize: 'vertical' }}
              />
              <div style={{ color: '#777', fontSize: 12, marginTop: 2 }}>
                Please don't include names or other personal information.
              </div>

              {reportStatus === 'error' && (
                <div style={{ color: '#c62828', marginTop: 8 }}>{reportError}</div>
              )}

              <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginTop: 10 }}>
                <button
                  type="submit"
                  disabled={reportStatus === 'sending'}
                  style={{
                    padding: '8px 14px',
                    borderRadius: 6,
                    border: 'none',
                    background: '#1a73e8',
                    color: '#fff',
                    fontSize: 14,
                    cursor: reportStatus === 'sending' ? 'default' : 'pointer',
                    opacity: reportStatus === 'sending' ? 0.7 : 1
                  }}
                >
                  {reportStatus === 'sending' ? 'Sending…' : 'Send report'}
                </button>
                <button type="button" onClick={resetReport} style={linkButton}>
                  Cancel
                </button>
              </div>
            </form>
          )}

          <button type="button" onClick={clearSearch} style={{ ...linkButton, marginTop: 10 }}>
            Clear
          </button>
        </div>
      )}

      {isAboutOpen && <AboutPage onClose={() => setIsAboutOpen(false)} />}
    </div>
  );
}

export default App;
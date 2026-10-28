import { useEffect, useRef, useState } from 'react';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import Sidebar from './components/Sidebar';
import AboutPage from './components/AboutPage';

mapboxgl.accessToken = process.env.REACT_APP_MAPBOX_TOKEN;

function App() {
  const mapContainer = useRef(null);
  const map = useRef(null);
  const [isAboutOpen, setIsAboutOpen] = useState(false);

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
      } catch (err) {
        console.error('Failed to load permit layer:', err);
      }
    });
  }, []);

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
      {isAboutOpen && <AboutPage onClose={() => setIsAboutOpen(false)} />}
    </div>
  );
}

export default App;
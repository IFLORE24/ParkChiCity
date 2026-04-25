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

    map.current.on('load', () => {
      Promise.all([
        fetch(`${process.env.REACT_APP_API_URL}/api/streets`).then(res => res.json()),
        fetch(`${process.env.REACT_APP_API_URL}/api/street-geometry`).then(res => res.json())
      ]).then(([streetsGeoJSON, permitGeoJSON]) => {
        console.log('Loaded streets:', streetsGeoJSON.features.length);
        console.log('Loaded permit zones:', permitGeoJSON.features.length);

        // === Base layer: all Chicago streets ===
        map.current.addSource('chicago-streets', {
          type: 'geojson',
          data: streetsGeoJSON
        });

        map.current.addLayer({
          id: 'chicago-streets-layer',
          type: 'line',
          source: 'chicago-streets',
          paint: {
            'line-color': '#6b7785',
            'line-width': 1,
            'line-opacity': 0.7
          }
        });

        // === Overlay: permit zones ===
        map.current.addSource('permit-zones', {
          type: 'geojson',
          data: permitGeoJSON
        });

        // Invisible wide touch target (kept for future click handling)
        map.current.addLayer({
          id: 'permit-zones-touch',
          type: 'line',
          source: 'permit-zones',
          paint: {
            'line-color': 'transparent',
            'line-width': 20
          }
        });

        // Visible red line
        map.current.addLayer({
          id: 'permit-zones-layer',
          type: 'line',
          source: 'permit-zones',
          paint: {
            'line-color': '#FF4444',
            'line-width': 3,
            'line-opacity': 0.8
          }
        });
      }).catch(err => {
        console.error('Failed to load map data:', err);
      });
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
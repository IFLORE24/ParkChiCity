const db = require('./db');
const express = require('express');
const cors = require('cors');
require ('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3001;
const compression = require('compression');
app.use(compression());

app.use(cors());
app.use(express.json());

app.get('/api/permit-zones', async (req, res) => {
  try {
    const fetch = (await import('node-fetch')).default;
    const response = await fetch(
      'https://data.cityofchicago.org/resource/u9xt-hiju.json?$limit=5000&status=ACTIVE'
    );
    const data = await response.json();
    res.json(data);
  } catch (error) {
    console.error('Error fetching permit zones:', error);
    res.status(500).json({ error: 'Failed to fetch permit zones' });
  }
});

app.get('/api/street-geometry', async (req, res) => {
  try {
    const result = await db.query('SELECT street_name, zone, geojson FROM street_geometry');
    
    const features = [];
    
    result.rows.forEach(row => {
      const data = JSON.parse(row.geojson);
      
      data.elements.forEach(element => {
        if (element.geometry && element.geometry.length > 1) {
          // Filter out coordinates outside Chicago bounds
          const filteredCoords = element.geometry
            .filter(point => 
              point.lon >= -87.800 &&  // western border
              point.lon <= -87.524 &&  // eastern border
              point.lat >= 41.644 &&   // southern border
              point.lat <= 42.023      // northern border
            )
            .map(point => [point.lon, point.lat]);

          if (filteredCoords.length > 1) {
            features.push({
              type: 'Feature',
              properties: {
                street_name: row.street_name,
                zone: row.zone
              },
              geometry: {
                type: 'LineString',
                coordinates: filteredCoords
              }
            });
          }
        }
      });
    });
    
    res.json({
      type: 'FeatureCollection',
      features
    });
    
  } catch (error) {
    console.error('Error fetching street geometry:', error);
    res.status(500).json({ error: 'Failed to fetch street geometry' });
  }
});

app.get('/api/streets', async (req, res) => {
  try {
    const result = await db.query(
      'SELECT osm_way_id, street_name, highway_type, geometry FROM chicago_streets'
    );

    const features = result.rows.map(row => ({
      type: 'Feature',
      properties: {
        osm_way_id: row.osm_way_id,
        street_name: row.street_name,
        highway_type: row.highway_type
      },
      geometry: {
        type: 'LineString',
        coordinates: row.geometry.map(point => [point.lon, point.lat])
      }
    }));

    res.json({
      type: 'FeatureCollection',
      features
    });

  } catch (error) {
    console.error('Error fetching Chicago streets:', error);
    res.status(500).json({ error: 'Failed to fetch streets' });
  }
});
app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});
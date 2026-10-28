# ParkChiCity

An interactive map of Chicago's residential parking permit zones. Built to help drivers — myself included, as a DePaul commuter — quickly see where permit-only restrictions apply.


**Live demo:** [park-chi-city.vercel.app](https://park-chi-city.vercel.app)

## What it does

Chicago publishes its residential permit parking zones as open data, but the raw dataset is just rows of street names and address ranges. ParkChiCity joins that data with OpenStreetMap geometry to show permit zones visually on a map of the city.

The map distinguishes:
- **Red lines** — streets in a permit zone (Chicago Parking Permit Program)
- **Gray lines** — Chicago streets without permit data
- Everything outside Chicago city limits is intentionally omitted

## Tech stack

- **Frontend:** React, Mapbox GL JS — deployed on Vercel
- **Backend:** Node.js, Express — deployed on Render
- **Database:** PostgreSQL — hosted on Neon
- **Geospatial:** Turf.js (point-in-polygon), OpenStreetMap via the Overpass API
- **Data sources:** [Chicago Data Portal](https://data.cityofchicago.org/), [OpenStreetMap](https://www.openstreetmap.org/)

## Architecture

The app's data pipeline has three stages, all of which were non-trivial to get right:

**1. Permit zone data → street geometry.** Chicago's permit dataset records zones by street name and address range (e.g., "N Kenmore Ave, 2400–2459, Zone 47"). For each unique street, the seed script queries the Overpass API for the corresponding OpenStreetMap geometry and stores both together in Postgres.

**2. Boundary-aware filtering.** A naive bounding box around Chicago captures large parts of neighboring suburbs. To get a precise fit, the app loads Chicago's official boundary polygon from the city's GIS dataset and filters every coordinate through Turf's `booleanPointInPolygon`. This correctly handles the lakefront curve, the irregular southwest border, and detached pieces like O'Hare.

**3. Base layer for ground truth.** A separate seed pulls every drivable Chicago street from OpenStreetMap (~34,000 ways) so the map shows a complete picture, not just streets that happen to have permit data. This made debugging permit data gaps dramatically easier.


## Known limitations

This is a V1. The most significant limitation is that **permit zones are currently shown at the full-street level, not block-by-block.** Chicago's permit data is recorded per address range and per side of the street, but V1 simplifies this by coloring an entire street red if any block of it is in a permit zone.

In practice, this means some streets show as permit-required when only a few blocks actually are. Notably, my own DePaul-area parking on Kenmore Ave between Fullerton and Belden shows red on this map but is, in fact, free parking.

V2 will use Chicago's Address Points dataset to translate address ranges into precise coordinates for block-level accuracy. The disclaimer modal in the app mentions this explicitly so users don't rely on V1 for parking decisions.

## Local development

You'll need Node.js 20+, PostgreSQL, and a free [Mapbox account](https://account.mapbox.com/) for an access token.

```bash
# Clone and install
git clone https://github.com/IFLORE24/ParkChiCity.git
cd ParkChiCity

# Set up the backend
cd server
cp .env.example .env       # then fill in DATABASE_URL
npm install
npm run seed:streets       # one-time, ~1 minute
npm start                  # runs on port 3001

# Set up the frontend (in a new terminal)
cd client
cp .env.example .env       # then fill in REACT_APP_MAPBOX_TOKEN and REACT_APP_API_URL
npm install
npm start                  # runs on port 3000
```

The `client/.env` and `server/.env` files are gitignored. Use the `.env.example` files as templates.

## Deployment

The live version uses three separate free-tier services:
- **Vercel** for the React frontend (auto-deploys on push to `main`)
- **Render** for the Express backend (auto-deploys on push to `main`)
- **Neon** for the Postgres database (serverless, scales to zero when idle)

This means a cold first request after a few minutes of idle can take 30–60 seconds (Render spins the server back up + Neon wakes the database). Subsequent requests are near-instant.

## License

MIT — see [LICENSE](./LICENSE).

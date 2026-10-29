# ParkChiCity

A map of Chicago's residential permit parking zones. Search an address to see whether the block has a permit zone nearby, which zone it is, and which side of the street it covers.
<img width="1919" height="910" alt="preview_app" src="https://github.com/user-attachments/assets/72267d55-b924-4745-9d29-f7d4476441fd" />

**Live site:** https://park-chi-city.vercel.app

> **Disclaimer:** This project is informational and is not affiliated with the City of Chicago. It covers residential permit zones only. It has no hours, street cleaning, snow routes, meters, or other restrictions. Always check the posted signs.

## What it does

- Draws permit-zone streets on a Mapbox map. **Red** means both sides of the street are restricted, and **yellow** means only one side is.
- Address search (Mapbox Geocoding) flies to the address, highlights the nearest permit street, and shows the zone number(s) and which side is restricted.
- A "Report a problem with this result" form lets visitors flag wrong, missing, or removed zones. Reports are stored for manual review. They never change the map automatically.

## How the data is built

The map layer is precomputed by a script and shipped as a static file, not queried at request time.

**Sources** (City of Chicago Data Portal):

| Dataset | ID | Used for |
|---|---|---|
| Street Center Lines | `6imu-meau` | Street geometry, address ranges, and odd/even parity per side |
| Parking Permit Zones | `u9xt-hiju` | Zone numbers, address ranges, and odd/even flags (no geometry) |

**The join** (`scripts/build-permit-layer.js`):

1. Keep permit rows with `Buffer = N` and `Status = ACTIVE`.
2. Normalize street names on both sides (direction + name + type, uppercase) and index the centerlines by that key.
3. For each permit row, find centerline segments on the same street whose address range **overlaps** the permit range. Both datasets store block-level ranges, so ranges are compared, never single addresses.
4. Check **parity per side**. A permit's `ODD_EVEN` flag has to match the segment side's `l_parity` or `r_parity`, which is how a one-sided restriction lands on the correct side. Sides with no addresses are skipped.
5. Record `odd_hit` and `even_hit` on each matched segment. The map colors a segment red when both are true and yellow otherwise.

Joining on street name alone produces a Cartesian explosion (more than a million features instead of about six thousand), so the range overlap and parity checks are what make the result usable.

**Result of the October 2026 run:**

| | Count |
|---|---|
| Street Center Lines segments | 56,338 |
| Permit rows (active, non-buffer) | 8,530 |
| Permit rows matched to a segment | 8,479 (99.4%) |
| Permit rows left unmatched | 51 |
| Segments in the output layer | 6,006 (about 2.6 MB) |

Counts change as the city updates the permit dataset.

## Known limitations

- **51 permit rows (about 0.6%) don't match.** The causes are naming quirks (a stray punctuation mark, a missing street type, a spelled-out suffix), zero-address or single-address ranges, and ranges that fall outside the centerline data. The script writes them to `data/unmatched-permits.json` with a reason for each. I chose not to loosen the match to catch them, because ignoring the street type could put a restriction on the wrong street, and a wrong highlight is worse than a missing one.
- **Buffer rows are excluded** from the layer, so an address on one of those blocks reports no permit zone.
- **Address search is approximate.** It finds the nearest permit street within 35 meters of the geocoded point and doesn't read the house number. A house on a side street next to a permit corner can be matched to the permit street, and both sides of a one-sided block get the same answer. See the roadmap.
- **Permit zones only.** Nothing here covers time restrictions or other parking rules.

## Architecture

```
Browser (React + Mapbox GL JS)  --static file-->  Vercel
        |
        |-- address search --> Mapbox Geocoding API
        |
        '-- report form -----> Express API (Render) --> MongoDB Atlas
```

- **The map layer is static.** The data is small (about 2.6 MB) and only changes when the pipeline is rerun, so serving a file is simpler and more reliable than running a database for it. An earlier version used Postgres for the geometry. It was removed when the data shrank to this size.
- **The backend exists because of the reports feature.** Collecting user input needs somewhere to write, which a static site can't do.

### Reports API

| Endpoint | Access | Purpose |
|---|---|---|
| `POST /api/reports` | Public, rate-limited | Validate and store a report |
| `GET /api/reports` | Admin only (`Authorization: Bearer <token>`) | List reports, newest first, optional `?status=` filter |
| `GET /api/health` | Public | Server and database status |

Design choices worth noting:

- The server copies only whitelisted fields from the request. `status`, `createdAt`, and `_id` are always set by the server and ignored if a client sends them.
- Every field is validated: length limits, an allowed list of report types, and coordinates that must fall inside a Chicago bounding box.
- The submit endpoint is rate-limited to 10 requests per hour per IP (with `trust proxy` set for the hosting platform), the JSON body is capped at 10 KB, and CORS only allows the configured origins.
- Reports carry an `appResult` field with what the map showed at the time. It comes from the client, so it is context for a human reviewer, not something to trust automatically.
- The admin check is a shared secret compared in constant time. It is simple on purpose and isn't a user authentication system.

## Tech stack

- **Frontend:** React (Create React App), Mapbox GL JS, Mapbox Geocoding API v6
- **Backend:** Node.js, Express, Mongoose, `express-rate-limit`, `cors`
- **Database:** MongoDB Atlas
- **Hosting:** Vercel (frontend), Render (API)
- **Data processing:** Node.js scripts

## Project structure

```
client/                 React app
  public/
    permit-city.geojson   generated permit layer (committed)
  src/App.js              map, search, result card, report form
server/                 Reports API
  main.js  validate.js  constants.js  models/Report.js
scripts/
  build-permit-layer.js   the join (--city for the whole city)
  slice-centerlines.js    cuts a small test area from the centerlines
data/                   raw exports (git-ignored)
```

## Running it locally

**Prerequisites:** Node.js, a Mapbox access token, and (for the reports API) a MongoDB Atlas cluster.

### Frontend

```bash
cd client
npm install
npm start
```

Create `client/.env`:

```
REACT_APP_MAPBOX_TOKEN=your_public_mapbox_token
REACT_APP_API_URL=http://localhost:3001
```

If the token has URL restrictions in your Mapbox account, add every domain the app runs on, including Vercel preview URLs, or the base map tiles will return 403.

### Reports API

```bash
cd server
npm install
npm start
```

Create `server/.env` (see `server/.env.example`):

```
PORT=3001
MONGODB_URI=your_atlas_connection_string
ADMIN_TOKEN=a_long_random_string
ALLOWED_ORIGINS=http://localhost:3000
```

In production, `ALLOWED_ORIGINS` must be the exact origin of the frontend, with no trailing slash.

### Rebuilding the permit layer

1. From each dataset page on the data portal, use **Export** to save Street Center Lines as GeoJSON and Parking Permit Zones as CSV.
2. Save them as `data/centerlines.geojson` and `data/permit_zones.csv`.
3. From the repo root, run:

```bash
node scripts/build-permit-layer.js --city
```

This rewrites `client/public/permit-city.geojson` and `data/unmatched-permits.json`, and prints match counts and the most common unmatched streets. Commit the new layer file to deploy it. Running the script without `--city` builds a small test area only.

## Deployment

- **Vercel:** root directory `client`. Set `REACT_APP_MAPBOX_TOKEN` and `REACT_APP_API_URL` (the Render URL, no trailing slash). These are read at build time, so changing them needs a redeploy.
- **Render:** root directory `server`, build command `npm install`, start command `npm start`. Set `MONGODB_URI`, `ADMIN_TOKEN`, and `ALLOWED_ORIGINS`. On the free tier the service sleeps when idle, so the first request after a quiet period can be slow.
- **Atlas:** allow the API host in network access, and use a strong database password.

## Roadmap

- **Exact address check:** carry each segment's address ranges and parities into the layer, then match the geocoded house number against them. This would give odd and even addresses on the same block different answers and avoid false matches at corners.
- A small admin view for working through reports.
- A scheduled job to refresh the data from the portal.

## Data and attribution

Permit zone and street data: City of Chicago Data Portal. Basemap: Mapbox and OpenStreetMap contributors.

## License

MIT

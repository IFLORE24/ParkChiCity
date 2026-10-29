require('dotenv').config();
const crypto = require('crypto');
const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');
const rateLimit = require('express-rate-limit');

const Report = require('./models/Report');
const { STATUSES } = require('./constants');
const { validateReport } = require('./validate.js');

const app = express();
const PORT = process.env.PORT || 3001;

// Hosts like Render sit behind a proxy; without this, every visitor shares one IP
// and the rate limiter would treat everyone as the same person.
app.set('trust proxy', 1);

const allowedOrigins = (process.env.ALLOWED_ORIGINS || 'http://localhost:3000')
  .split(',')
  .map(s => s.trim())
  .filter(Boolean);

app.use(
  cors({
    origin: allowedOrigins,
    methods: ['GET', 'POST'],
    allowedHeaders: ['Content-Type', 'Authorization']
  })
);
app.use(express.json({ limit: '10kb' }));

// At most 10 submissions per hour per IP
const submitLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 10,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: 'Too many reports from this connection. Please try again later.' }
});

// Admin routes need: Authorization: Bearer <ADMIN_TOKEN>
function requireAdmin(req, res, next) {
  const expected = process.env.ADMIN_TOKEN;
  if (!expected) {
    return res.status(503).json({ error: 'Admin access is not configured' });
  }
  const header = req.get('Authorization') || '';
  const provided = header.startsWith('Bearer ') ? header.slice(7) : '';
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  next();
}

app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    db: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected'
  });
});

app.post('/api/reports', submitLimiter, async (req, res) => {
  const result = validateReport(req.body);
  if (!result.ok) {
    return res.status(400).json({ error: 'Invalid report', details: result.errors });
  }
  try {
    const report = await Report.create(result.value);
    res.status(201).json({ id: report._id });
  } catch (err) {
    console.error('Error saving report:', err);
    res.status(500).json({ error: 'Failed to save report' });
  }
});

app.get('/api/reports', requireAdmin, async (req, res) => {
  const filter = {};
  if (req.query.status !== undefined) {
    // includes() on a fixed list also rejects query-injection attempts like ?status[$ne]=x
    if (!STATUSES.includes(req.query.status)) {
      return res.status(400).json({ error: `status must be one of: ${STATUSES.join(', ')}` });
    }
    filter.status = req.query.status;
  }
  const limit = Math.min(parseInt(req.query.limit, 10) || 50, 100);

  try {
    const reports = await Report.find(filter)
      .sort({ createdAt: -1 })
      .limit(limit)
      .lean();
    res.json({ count: reports.length, reports });
  } catch (err) {
    console.error('Error listing reports:', err);
    res.status(500).json({ error: 'Failed to list reports' });
  }
});

// JSON errors for oversized or malformed bodies
app.use((err, req, res, next) => {
  if (err.type === 'entity.too.large') {
    return res.status(413).json({ error: 'Request too large' });
  }
  if (err.type === 'entity.parse.failed') {
    return res.status(400).json({ error: 'Malformed JSON' });
  }
  console.error(err);
  res.status(500).json({ error: 'Server error' });
});

async function start() {
  if (!process.env.MONGODB_URI) {
    console.error('MONGODB_URI is not set. Copy .env.example to .env and fill it in.');
    process.exit(1);
  }
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected to MongoDB');
  } catch (err) {
    console.error('MongoDB connection failed:', err.message);
    process.exit(1);
  }
  app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
  });
}

start();
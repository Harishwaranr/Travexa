require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');

const hotelsRoute   = require('./routes/hotels');
const aiRoute       = require('./routes/ai');
const guidesRoute   = require('./routes/guides');
const bookingsRoute = require('./routes/bookings');
const paymentsRoute = require('./routes/payments');
const weatherRoute  = require('./routes/weather');
const conditionsRoute = require('./routes/conditions');

const db = require('./lib/db');
const rzp = require('./lib/razorpay');

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());

// The Razorpay webhook must see the raw bytes to verify its HMAC, so it is
// mounted before express.json() would consume and re-serialise the body.
app.use('/api/payments/webhook', paymentsRoute);

app.use(express.json());

// Static frontend. Uploaded identity documents live outside this directory
// and are never served from here.
app.use(express.static(path.join(__dirname, '..')));

// API routes. hotelsRoute is the single Foursquare search, mounted twice.
app.use('/api/hotels', hotelsRoute);
app.use('/api/places', hotelsRoute);
app.use('/api/ai', aiRoute);
app.use('/api/guides', guidesRoute);
app.use('/api/bookings', bookingsRoute);
app.use('/api/payments', paymentsRoute);
// Open-Meteo proxy: no key needed, cached server-side for 15 minutes.
app.use('/api/weather', weatherRoute);
// Hazards (USGS + GDACS) and festival crowd pressure for a destination.
app.use('/api/conditions', conditionsRoute);

/** What is wired up — booleans only, never a key value. */
app.get('/api/status', async (req, res) => {
  const dbHealth = await db.health();
  res.json({
    foursquare: !!process.env.FOURSQUARE_API_KEY,
    gemini: !!process.env.GEMINI_API_KEY,
    database: dbHealth,
    auth: !!(process.env.JWT_SECRET && process.env.JWT_SECRET.length >= 16),
    razorpay: rzp.isConfigured(),
    razorpayWebhook: !!process.env.RAZORPAY_WEBHOOK_SECRET
  });
});

// Fallback: serve index.html for any non-API route
app.get('*', (req, res) => {
  if (!req.path.startsWith('/api')) {
    res.sendFile(path.join(__dirname, '..', 'index.html'));
  }
});

app.listen(PORT, () => {
  console.log(`✦ Travexa server running at http://localhost:${PORT}`);
  const missing = [];
  if (!process.env.FOURSQUARE_API_KEY) missing.push('FOURSQUARE_API_KEY');
  if (!process.env.GEMINI_API_KEY) missing.push('GEMINI_API_KEY');
  if (!process.env.DATABASE_URL) missing.push('DATABASE_URL');
  if (!process.env.JWT_SECRET) missing.push('JWT_SECRET');
  if (!rzp.isConfigured()) missing.push('RAZORPAY_KEY_ID + RAZORPAY_KEY_SECRET');
  if (missing.length) {
    console.log('  Not configured yet: ' + missing.join(', '));
  }
});

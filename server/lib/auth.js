/**
 * Guide authentication. Passwords are bcrypt-hashed and never returned;
 * sessions are stateless JWTs signed with JWT_SECRET.
 */
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const TOKEN_TTL = '7d';

function secret() {
  const s = process.env.JWT_SECRET;
  if (!s || s.length < 16) {
    const err = new Error('JWT_SECRET not configured (need at least 16 characters)');
    err.code = 'NO_JWT_SECRET';
    throw err;
  }
  return s;
}

function hashPassword(plain) {
  return bcrypt.hash(plain, 12);
}

function checkPassword(plain, hash) {
  return bcrypt.compare(plain, hash);
}

function issueToken(guide) {
  return jwt.sign({ sub: guide.id, email: guide.email }, secret(), { expiresIn: TOKEN_TTL });
}

/** Express middleware: requires a valid guide bearer token. */
function requireGuide(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'AUTH_REQUIRED', message: 'Sign in to continue.' });

  try {
    req.guide = jwt.verify(token, secret());
    next();
  } catch (err) {
    if (err.code === 'NO_JWT_SECRET') {
      return res.status(503).json({ error: 'NO_JWT_SECRET', message: 'Server auth is not configured.' });
    }
    return res.status(401).json({ error: 'AUTH_INVALID', message: 'Session expired. Sign in again.' });
  }
}

/** Strips anything that must never reach a client. */
function publicGuide(row) {
  if (!row) return null;
  return {
    id: row.id,
    fullName: row.full_name,
    city: row.city,
    languages: row.languages || [],
    specialties: row.specialties || [],
    areas: row.areas || [],
    yearsExperience: row.years_experience,
    bio: row.bio,
    hourlyRatePaise: Number(row.hourly_rate_paise || 0),
    currency: row.currency || 'INR',
    verification: row.verification,
    availability: row.availability,
    payoutReady: !!row.razorpay_account_id,
    avgStars: row.avg_stars != null ? Number(row.avg_stars) : null,
    reviewCount: row.review_count != null ? Number(row.review_count) : 0,
    completedTrips: row.completed_trips != null ? Number(row.completed_trips) : 0
  };
}

module.exports = { hashPassword, checkPassword, issueToken, requireGuide, publicGuide };

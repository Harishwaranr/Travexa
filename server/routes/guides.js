const express = require('express');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const router = express.Router();

const db = require('../lib/db');
const { hashPassword, checkPassword, issueToken, requireGuide, publicGuide } = require('../lib/auth');

// Identity documents live outside the served directory and are never
// exposed by express.static. Only an authenticated owner sees the metadata.
const DOC_ROOT = process.env.DOC_STORAGE_DIR ||
                 path.join(__dirname, '..', '..', '..', 'travexa-private-uploads');

fs.mkdirSync(DOC_ROOT, { recursive: true });

const ALLOWED_DOC_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];

const upload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => cb(null, DOC_ROOT),
    filename: (req, file, cb) => {
      const safe = Date.now() + '-' + Math.random().toString(36).slice(2, 10) +
                   path.extname(file.originalname || '').slice(0, 8);
      cb(null, safe);
    }
  }),
  limits: { fileSize: 8 * 1024 * 1024, files: 4 },
  fileFilter: (req, file, cb) => cb(null, ALLOWED_DOC_TYPES.indexOf(file.mimetype) >= 0)
});

function dbGuard(req, res, next) {
  if (!db.isConfigured()) {
    return res.status(503).json({
      error: 'NO_DB',
      message: 'Guide accounts are not available yet — the database is not configured.'
    });
  }
  next();
}

function toArray(value) {
  if (Array.isArray(value)) return value.map(String);
  if (typeof value === 'string' && value.trim()) {
    return value.split(',').map(s => s.trim()).filter(Boolean);
  }
  return [];
}

/* ------------------------------------------------------------- signup */
router.post('/signup', dbGuard, async (req, res) => {
  const b = req.body || {};
  const email = String(b.email || '').trim().toLowerCase();
  const password = String(b.password || '');

  if (!b.fullName || !email || password.length < 8) {
    return res.status(400).json({
      error: 'INVALID',
      message: 'Full name, email and a password of at least 8 characters are required.'
    });
  }

  try {
    const hash = await hashPassword(password);
    const { rows } = await db.query(
      `INSERT INTO guides (full_name, email, phone, password_hash, city,
                           languages, specialties, areas, years_experience,
                           bio, hourly_rate_paise, currency)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
       RETURNING *`,
      [String(b.fullName).trim(), email, b.phone || null, hash, b.city || null,
       toArray(b.languages), toArray(b.specialties), toArray(b.areas),
       parseInt(b.yearsExperience, 10) || 0, b.bio || null,
       Math.max(0, parseInt(b.hourlyRatePaise, 10) || 0), b.currency || 'INR']
    );

    const guide = rows[0];
    res.status(201).json({
      token: issueToken(guide),
      guide: publicGuide(guide),
      // Stated plainly: signing up does not make anyone verified.
      notice: 'Your account is PENDING VERIFICATION until your documents are reviewed.'
    });

  } catch (err) {
    if (err.code === '23505') {
      return res.status(409).json({ error: 'EMAIL_TAKEN', message: 'That email is already registered.' });
    }
    if (err.code === 'NO_JWT_SECRET') {
      return res.status(503).json({ error: 'NO_JWT_SECRET', message: 'Server auth is not configured.' });
    }
    console.error('Guide signup failed:', err.message);
    res.status(500).json({ error: 'INTERNAL', message: 'Could not create the account.' });
  }
});

/* -------------------------------------------------------------- login */
router.post('/login', dbGuard, async (req, res) => {
  const email = String((req.body || {}).email || '').trim().toLowerCase();
  const password = String((req.body || {}).password || '');

  try {
    const { rows } = await db.query('SELECT * FROM guides WHERE email = $1', [email]);
    const guide = rows[0];
    // Same message either way, so the response cannot enumerate accounts.
    const ok = guide && await checkPassword(password, guide.password_hash);
    if (!ok) {
      return res.status(401).json({ error: 'BAD_CREDENTIALS', message: 'Email or password is incorrect.' });
    }
    res.json({ token: issueToken(guide), guide: publicGuide(guide) });

  } catch (err) {
    if (err.code === 'NO_JWT_SECRET') {
      return res.status(503).json({ error: 'NO_JWT_SECRET', message: 'Server auth is not configured.' });
    }
    console.error('Guide login failed:', err.message);
    res.status(500).json({ error: 'INTERNAL', message: 'Could not sign in.' });
  }
});

/* ------------------------------------------------------------ profile */
router.get('/me', dbGuard, requireGuide, async (req, res) => {
  try {
    const { rows } = await db.query(
      `SELECT g.*, r.avg_stars, r.review_count, r.completed_trips
         FROM guides g LEFT JOIN guide_ratings r ON r.guide_id = g.id
        WHERE g.id = $1`, [req.guide.sub]);
    if (!rows[0]) return res.status(404).json({ error: 'NOT_FOUND' });

    const docs = await db.query(
      `SELECT id, kind, status, mime_type, byte_size, uploaded_at
         FROM guide_documents WHERE guide_id = $1 ORDER BY uploaded_at DESC`,
      [req.guide.sub]);

    res.json({ guide: publicGuide(rows[0]), documents: docs.rows });
  } catch (err) {
    console.error('Guide profile failed:', err.message);
    res.status(500).json({ error: 'INTERNAL', message: 'Could not load the profile.' });
  }
});

router.patch('/me', dbGuard, requireGuide, async (req, res) => {
  const b = req.body || {};
  // verification and razorpay_account_id are deliberately absent: a guide
  // cannot verify themselves or attach their own payout account.
  try {
    const { rows } = await db.query(
      `UPDATE guides SET
         city = COALESCE($2, city),
         lat = COALESCE($3, lat),
         lng = COALESCE($4, lng),
         languages = COALESCE($5, languages),
         specialties = COALESCE($6, specialties),
         areas = COALESCE($7, areas),
         years_experience = COALESCE($8, years_experience),
         bio = COALESCE($9, bio),
         hourly_rate_paise = COALESCE($10, hourly_rate_paise),
         availability = COALESCE($11, availability),
         updated_at = now()
       WHERE id = $1 RETURNING *`,
      [req.guide.sub, b.city ?? null,
       b.lat ?? null, b.lng ?? null,
       b.languages ? toArray(b.languages) : null,
       b.specialties ? toArray(b.specialties) : null,
       b.areas ? toArray(b.areas) : null,
       b.yearsExperience != null ? parseInt(b.yearsExperience, 10) : null,
       b.bio ?? null,
       b.hourlyRatePaise != null ? Math.max(0, parseInt(b.hourlyRatePaise, 10)) : null,
       ['available', 'busy', 'offline'].indexOf(b.availability) >= 0 ? b.availability : null]
    );
    res.json({ guide: publicGuide(rows[0]) });
  } catch (err) {
    console.error('Guide update failed:', err.message);
    res.status(500).json({ error: 'INTERNAL', message: 'Could not save the profile.' });
  }
});

/* ------------------------------------------------------- verification */
router.post('/me/documents', dbGuard, requireGuide,
  upload.fields([
    { name: 'government_id', maxCount: 1 },
    { name: 'certification', maxCount: 1 },
    { name: 'experience_proof', maxCount: 1 },
    { name: 'photo', maxCount: 1 }
  ]),
  async (req, res) => {
    const files = req.files || {};
    const kinds = Object.keys(files);
    if (!kinds.length) {
      return res.status(400).json({ error: 'NO_FILES', message: 'Attach at least one document.' });
    }

    try {
      for (const kind of kinds) {
        const f = files[kind][0];
        await db.query(
          `INSERT INTO guide_documents (guide_id, kind, stored_path, mime_type, byte_size)
           VALUES ($1,$2,$3,$4,$5)`,
          [req.guide.sub, kind, f.filename, f.mimetype, f.size]
        );
        if (kind === 'photo') {
          await db.query('UPDATE guides SET photo_path = $2 WHERE id = $1',
                         [req.guide.sub, f.filename]);
        }
      }

      // Uploading proves nothing on its own. Status stays 'pending' until a
      // human reviews it out-of-band; no client route can set 'verified'.
      res.status(201).json({
        uploaded: kinds,
        verification: 'pending',
        message: 'PENDING VERIFICATION — documents received and awaiting review.'
      });

    } catch (err) {
      console.error('Document upload failed:', err.message);
      res.status(500).json({ error: 'INTERNAL', message: 'Could not store the documents.' });
    }
  });

/* ------------------------------------ public discovery for tourists */
/**
 * GET /api/guides/nearby?lat=&lng=&languages=&specialty=
 * Travexa's own marketplace — never Foursquare. Distance is great-circle
 * from the guide's last known position.
 */
router.get('/nearby', dbGuard, async (req, res) => {
  const lat = parseFloat(req.query.lat);
  const lng = parseFloat(req.query.lng);
  const hasFix = Number.isFinite(lat) && Number.isFinite(lng);

  try {
    const { rows } = await db.query(
      `SELECT g.*, r.avg_stars, r.review_count, r.completed_trips,
              CASE WHEN $1::boolean AND g.lat IS NOT NULL THEN
                6371 * acos(LEAST(1, GREATEST(-1,
                  cos(radians($2)) * cos(radians(g.lat)) *
                  cos(radians(g.lng) - radians($3)) +
                  sin(radians($2)) * sin(radians(g.lat)))))
              END AS distance_km
         FROM guides g
         LEFT JOIN guide_ratings r ON r.guide_id = g.id
        WHERE g.availability = 'available'
          AND g.verification = 'verified'
        ORDER BY distance_km NULLS LAST, r.avg_stars DESC NULLS LAST
        LIMIT 20`,
      [hasFix, hasFix ? lat : 0, hasFix ? lng : 0]
    );

    res.json({
      source: 'travexa-guides',
      count: rows.length,
      guides: rows.map(row => Object.assign(publicGuide(row), {
        distanceKm: row.distance_km != null ? Number(row.distance_km.toFixed(1)) : null
      }))
    });
  } catch (err) {
    console.error('Nearby guides failed:', err.message);
    res.status(500).json({ error: 'INTERNAL', message: 'Could not load guides.' });
  }
});

module.exports = router;

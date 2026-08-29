const express = require('express');
const router = express.Router();

const db = require('../lib/db');
const { requireGuide } = require('../lib/auth');
const { canTransition, nextStates, TOURIST_LABEL } = require('../lib/bookingState');

function dbGuard(req, res, next) {
  if (!db.isConfigured()) {
    return res.status(503).json({
      error: 'NO_DB',
      message: 'Bookings are not available yet — the database is not configured.'
    });
  }
  next();
}

function shape(row) {
  return {
    id: row.id,
    guideId: row.guide_id,
    status: row.status,
    statusLabel: TOURIST_LABEL[row.status] || row.status,
    hours: Number(row.hours),
    amountPaise: Number(row.amount_paise),
    currency: row.currency,
    meetingNote: row.meeting_note,
    createdAt: row.created_at,
    nextForTourist: nextStates(row.status, 'tourist'),
    nextForGuide: nextStates(row.status, 'guide')
  };
}

/** Records every transition so payout decisions are auditable. */
async function logEvent(client, bookingId, from, to, actor, note) {
  await client.query(
    `INSERT INTO booking_events (booking_id, from_status, to_status, actor, note)
     VALUES ($1,$2,$3,$4,$5)`, [bookingId, from, to, actor, note || null]);
}

/* ------------------------------------------------- tourist creates one */
router.post('/', dbGuard, async (req, res) => {
  const b = req.body || {};
  const touristRef = String(b.touristRef || '').trim();
  if (!touristRef || !b.guideId) {
    return res.status(400).json({ error: 'INVALID', message: 'Missing guide or tourist reference.' });
  }

  try {
    const g = await db.query('SELECT * FROM guides WHERE id = $1', [b.guideId]);
    const guide = g.rows[0];
    if (!guide) return res.status(404).json({ error: 'NO_GUIDE', message: 'That guide no longer exists.' });

    // Price comes from the guide's stored rate, never from the request body.
    const hours = Math.max(0.5, Math.min(12, parseFloat(b.hours) || 1));
    const amountPaise = Math.round(Number(guide.hourly_rate_paise) * hours);

    const out = await db.tx(async client => {
      const { rows } = await client.query(
        `INSERT INTO bookings (guide_id, tourist_ref, tourist_name, tourist_lat,
                               tourist_lng, meeting_note, hours, amount_paise, currency)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
        [guide.id, touristRef, b.touristName || null,
         b.lat ?? null, b.lng ?? null, b.meetingNote || null,
         hours, amountPaise, guide.currency || 'INR']);
      await logEvent(client, rows[0].id, null, 'REQUESTED', 'tourist', null);
      return rows[0];
    });

    res.status(201).json({ booking: shape(out) });
  } catch (err) {
    console.error('Create booking failed:', err.message);
    res.status(500).json({ error: 'INTERNAL', message: 'Could not create the booking.' });
  }
});

/* ---------------------------------------------------- read a booking */
router.get('/:id', dbGuard, async (req, res) => {
  try {
    const { rows } = await db.query('SELECT * FROM bookings WHERE id = $1', [req.params.id]);
    if (!rows[0]) return res.status(404).json({ error: 'NOT_FOUND' });
    const events = await db.query(
      `SELECT from_status, to_status, actor, created_at
         FROM booking_events WHERE booking_id = $1 ORDER BY id`, [req.params.id]);
    res.json({ booking: shape(rows[0]), events: events.rows });
  } catch (err) {
    console.error('Read booking failed:', err.message);
    res.status(500).json({ error: 'INTERNAL' });
  }
});

/**
 * Shared transition handler.
 *
 * The state machine decides legality; `actor` is derived from which route
 * was used and, for guides, from a verified token. A request body can never
 * name its own actor, so a tourist cannot act as 'system' and force a payout.
 */
async function applyTransition(bookingId, to, actor, note, res, guardFn) {
  try {
    const out = await db.tx(async client => {
      const { rows } = await client.query(
        'SELECT * FROM bookings WHERE id = $1 FOR UPDATE', [bookingId]);
      const booking = rows[0];
      if (!booking) return { error: 404, body: { error: 'NOT_FOUND' } };

      if (guardFn) {
        const denied = guardFn(booking);
        if (denied) return { error: 403, body: denied };
      }

      if (!canTransition(booking.status, to, actor)) {
        return { error: 409, body: {
          error: 'ILLEGAL_TRANSITION',
          message: `A booking that is ${booking.status} cannot move to ${to}.`,
          allowed: nextStates(booking.status, actor)
        } };
      }

      const upd = await client.query(
        'UPDATE bookings SET status = $2, updated_at = now() WHERE id = $1 RETURNING *',
        [bookingId, to]);
      await logEvent(client, bookingId, booking.status, to, actor, note);
      return { booking: upd.rows[0] };
    });

    if (out.error) return res.status(out.error).json(out.body);
    res.json({ booking: shape(out.booking) });

  } catch (err) {
    console.error('Transition failed:', err.message);
    res.status(500).json({ error: 'INTERNAL', message: 'Could not update the booking.' });
  }
}

/* ------------------------------------------------- guide-side actions */
router.post('/:id/guide-action', dbGuard, requireGuide, (req, res) => {
  const to = String((req.body || {}).to || '');
  applyTransition(req.params.id, to, 'guide', (req.body || {}).note, res,
    booking => booking.guide_id !== req.guide.sub
      ? { error: 'NOT_YOURS', message: 'That booking belongs to another guide.' }
      : null);
});

/* ----------------------------------------------- tourist-side actions */
router.post('/:id/tourist-action', dbGuard, (req, res) => {
  const to = String((req.body || {}).to || '');
  const ref = String((req.body || {}).touristRef || '');
  applyTransition(req.params.id, to, 'tourist', (req.body || {}).note, res,
    booking => booking.tourist_ref !== ref
      ? { error: 'NOT_YOURS', message: 'That booking belongs to another traveller.' }
      : null);
});

/* --------------------------------------------------------- guide list */
router.get('/', dbGuard, requireGuide, async (req, res) => {
  try {
    const { rows } = await db.query(
      `SELECT b.*, p.status AS payment_status, p.transfer_id
         FROM bookings b
         LEFT JOIN payments p ON p.booking_id = b.id
        WHERE b.guide_id = $1
        ORDER BY b.created_at DESC LIMIT 100`, [req.guide.sub]);

    const earned = rows
      .filter(r => r.status === 'PAYOUT_RELEASED')
      .reduce((sum, r) => sum + Number(r.amount_paise), 0);
    const pending = rows
      .filter(r => ['PAYMENT_AUTHORIZED', 'IN_PROGRESS', 'COMPLETED'].indexOf(r.status) >= 0)
      .reduce((sum, r) => sum + Number(r.amount_paise), 0);

    res.json({
      bookings: rows.map(r => Object.assign(shape(r), {
        paymentStatus: r.payment_status || null
      })),
      earnings: { releasedPaise: earned, pendingPaise: pending, currency: 'INR' }
    });
  } catch (err) {
    console.error('List bookings failed:', err.message);
    res.status(500).json({ error: 'INTERNAL' });
  }
});

/* ------------------------------------------------------------ ratings */
router.post('/:id/rating', dbGuard, async (req, res) => {
  const stars = parseInt((req.body || {}).stars, 10);
  const ref = String((req.body || {}).touristRef || '');
  if (!(stars >= 1 && stars <= 5)) {
    return res.status(400).json({ error: 'INVALID', message: 'Rating must be 1 to 5 stars.' });
  }

  try {
    const { rows } = await db.query('SELECT * FROM bookings WHERE id = $1', [req.params.id]);
    const booking = rows[0];
    if (!booking) return res.status(404).json({ error: 'NOT_FOUND' });
    if (booking.tourist_ref !== ref) {
      return res.status(403).json({ error: 'NOT_YOURS' });
    }
    // Only a genuinely completed experience can be rated.
    if (['COMPLETED', 'PAYOUT_RELEASED'].indexOf(booking.status) < 0) {
      return res.status(409).json({
        error: 'NOT_COMPLETED',
        message: 'You can rate a guide once the experience is completed.'
      });
    }

    await db.query(
      `INSERT INTO ratings (booking_id, guide_id, stars, review)
       VALUES ($1,$2,$3,$4)
       ON CONFLICT (booking_id) DO UPDATE SET stars = EXCLUDED.stars, review = EXCLUDED.review`,
      [booking.id, booking.guide_id, stars, (req.body || {}).review || null]);

    res.status(201).json({ ok: true });
  } catch (err) {
    console.error('Rating failed:', err.message);
    res.status(500).json({ error: 'INTERNAL' });
  }
});

module.exports = router;

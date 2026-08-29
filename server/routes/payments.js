const express = require('express');
const router = express.Router();

const db = require('../lib/db');
const rzp = require('../lib/razorpay');

function guards(req, res, next) {
  if (!db.isConfigured()) {
    return res.status(503).json({ error: 'NO_DB',
      message: 'Payments are unavailable — the database is not configured.' });
  }
  if (!rzp.isConfigured()) {
    return res.status(503).json({ error: 'NO_RAZORPAY',
      message: 'Payment integration pending configuration.' });
  }
  next();
}

/** Publishable key only. The secret never appears in any response. */
router.get('/config', (req, res) => {
  res.json({
    configured: rzp.isConfigured(),
    keyId: rzp.isConfigured() ? process.env.RAZORPAY_KEY_ID : null,
    currency: 'INR'
  });
});

/* ------------------------------------------------- create an order */
router.post('/order', guards, async (req, res) => {
  const bookingId = String((req.body || {}).bookingId || '');
  const ref = String((req.body || {}).touristRef || '');

  try {
    const { rows } = await db.query('SELECT * FROM bookings WHERE id = $1', [bookingId]);
    const booking = rows[0];
    if (!booking) return res.status(404).json({ error: 'NOT_FOUND' });
    if (booking.tourist_ref !== ref) return res.status(403).json({ error: 'NOT_YOURS' });

    // Pay only once the guide has actually accepted.
    if (booking.status !== 'ACCEPTED') {
      return res.status(409).json({ error: 'NOT_PAYABLE',
        message: 'Payment opens once the guide accepts the request.' });
    }

    const order = await rzp.createOrder({
      amountPaise: Number(booking.amount_paise),
      currency: booking.currency,
      bookingId: booking.id
    });

    await db.query(
      `INSERT INTO payments (booking_id, razorpay_order_id, amount_paise, currency, status)
       VALUES ($1,$2,$3,$4,'created')
       ON CONFLICT (razorpay_order_id) DO NOTHING`,
      [booking.id, order.id, Number(booking.amount_paise), booking.currency]);

    res.json({
      orderId: order.id,
      amountPaise: Number(booking.amount_paise),
      currency: booking.currency,
      keyId: process.env.RAZORPAY_KEY_ID
    });
  } catch (err) {
    console.error('Create order failed:', err.message);
    res.status(502).json({ error: 'PAYMENT_ERROR', message: 'Could not start the payment.' });
  }
});

/* ------------------------------------------- verify checkout result */
/**
 * The browser reports what Checkout returned. It is believed only if the
 * HMAC signature matches — a forged body cannot move the booking forward.
 */
router.post('/verify', guards, async (req, res) => {
  const b = req.body || {};
  const ok = rzp.verifyPaymentSignature({
    orderId: b.razorpay_order_id,
    paymentId: b.razorpay_payment_id,
    signature: b.razorpay_signature
  });

  if (!ok) {
    return res.status(400).json({ error: 'BAD_SIGNATURE',
      message: 'Payment could not be verified.' });
  }

  try {
    const { rows } = await db.query(
      `SELECT p.*, b.status AS booking_status, b.guide_id
         FROM payments p JOIN bookings b ON b.id = p.booking_id
        WHERE p.razorpay_order_id = $1`, [b.razorpay_order_id]);
    const payment = rows[0];
    if (!payment) return res.status(404).json({ error: 'NOT_FOUND' });

    // Capture the authorised payment, then hold the guide's share.
    await rzp.capturePayment(b.razorpay_payment_id,
                             Number(payment.amount_paise), payment.currency);

    let transferId = null;
    let holdNote = null;
    const g = await db.query('SELECT razorpay_account_id FROM guides WHERE id = $1',
                             [payment.guide_id]);
    const accountId = g.rows[0] && g.rows[0].razorpay_account_id;

    if (accountId) {
      try {
        const t = await rzp.transferOnHold({
          paymentId: b.razorpay_payment_id, accountId: accountId,
          amountPaise: Number(payment.amount_paise), currency: payment.currency,
          bookingId: payment.booking_id
        });
        transferId = (t.items && t.items[0] && t.items[0].id) || null;
      } catch (tErr) {
        // Route not enabled, or account not ready. The payment is still real;
        // the payout simply cannot be routed yet, and we say so.
        console.warn('Route transfer failed:', tErr.message);
        holdNote = 'Payment captured. Guide payout pending Razorpay Route setup.';
      }
    } else {
      holdNote = 'Payment captured. Guide has no linked payout account yet.';
    }

    await db.tx(async client => {
      await client.query(
        `UPDATE payments SET razorpay_payment_id = $2, razorpay_signature = $3,
                transfer_id = $4, status = $5, updated_at = now()
           WHERE id = $1`,
        [payment.id, b.razorpay_payment_id, b.razorpay_signature, transferId,
         transferId ? 'on_hold' : 'captured']);

      await client.query(
        `UPDATE bookings SET status = 'PAYMENT_AUTHORIZED', updated_at = now()
           WHERE id = $1 AND status = 'ACCEPTED'`, [payment.booking_id]);

      await client.query(
        `INSERT INTO booking_events (booking_id, from_status, to_status, actor, note)
         VALUES ($1,'ACCEPTED','PAYMENT_AUTHORIZED','system',$2)`,
        [payment.booking_id, holdNote]);
    });

    res.json({ ok: true, held: !!transferId, note: holdNote });

  } catch (err) {
    console.error('Verify failed:', err.message);
    res.status(502).json({ error: 'PAYMENT_ERROR', message: 'Could not confirm the payment.' });
  }
});

/* ------------------------------------------------------ release payout */
/**
 * POST /api/payments/release  { bookingId }
 *
 * Deliberately has no tourist or guide authorisation path: a payout is
 * released only because the booking already reached COMPLETED on the server
 * and Razorpay confirmed the release. Clicking a button is not sufficient.
 */
router.post('/release', guards, async (req, res) => {
  const bookingId = String((req.body || {}).bookingId || '');

  try {
    const { rows } = await db.query(
      `SELECT b.*, p.id AS payment_id, p.transfer_id, p.status AS payment_status
         FROM bookings b LEFT JOIN payments p ON p.booking_id = b.id
        WHERE b.id = $1`, [bookingId]);
    const row = rows[0];
    if (!row) return res.status(404).json({ error: 'NOT_FOUND' });

    if (row.status !== 'COMPLETED') {
      return res.status(409).json({
        error: 'NOT_COMPLETED',
        message: 'Payout is released only after the experience is completed.'
      });
    }
    if (!row.transfer_id) {
      return res.status(409).json({
        error: 'NO_TRANSFER',
        message: 'No held transfer exists for this booking. Razorpay Route must be ' +
                 'active and the guide must have a linked account.'
      });
    }

    await rzp.releaseTransfer(row.transfer_id);

    await db.tx(async client => {
      await client.query(
        `UPDATE payments SET status = 'released', updated_at = now() WHERE id = $1`,
        [row.payment_id]);
      await client.query(
        `UPDATE bookings SET status = 'PAYOUT_RELEASED', updated_at = now() WHERE id = $1`,
        [bookingId]);
      await client.query(
        `INSERT INTO booking_events (booking_id, from_status, to_status, actor, note)
         VALUES ($1,'COMPLETED','PAYOUT_RELEASED','system','Razorpay transfer released')`,
        [bookingId]);
    });

    res.json({ ok: true });
  } catch (err) {
    console.error('Release failed:', err.message);
    res.status(502).json({ error: 'PAYMENT_ERROR', message: 'Could not release the payout.' });
  }
});

/* ----------------------------------------------------------- webhook */
/**
 * Mounted with express.raw in server/index.js: the signature is computed over
 * the exact bytes Razorpay sent, so it must not be JSON-parsed beforehand.
 */
router.post('/webhook', express.raw({ type: '*/*' }), async (req, res) => {
  const signature = req.headers['x-razorpay-signature'];
  const raw = Buffer.isBuffer(req.body) ? req.body.toString('utf8') : String(req.body || '');

  if (!rzp.verifyWebhookSignature(raw, signature)) {
    return res.status(400).json({ error: 'BAD_SIGNATURE' });
  }

  let event;
  try { event = JSON.parse(raw); } catch (e) {
    return res.status(400).json({ error: 'BAD_PAYLOAD' });
  }

  try {
    const kind = event.event;
    const paymentEntity = event.payload && event.payload.payment &&
                          event.payload.payment.entity;

    if (paymentEntity && db.isConfigured()) {
      const orderId = paymentEntity.order_id;
      if (kind === 'payment.captured') {
        await db.query(
          `UPDATE payments SET status = 'captured', razorpay_payment_id = $2,
                  updated_at = now()
             WHERE razorpay_order_id = $1 AND status = 'created'`,
          [orderId, paymentEntity.id]);
      }
      if (kind === 'payment.failed') {
        await db.query(
          `UPDATE payments SET status = 'failed', updated_at = now()
             WHERE razorpay_order_id = $1`, [orderId]);
      }
      if (kind === 'refund.processed') {
        await db.query(
          `UPDATE payments SET status = 'refunded', updated_at = now()
             WHERE razorpay_order_id = $1`, [orderId]);
      }
    }
    // Always 200 on a verified event, so Razorpay stops retrying.
    res.json({ received: true });

  } catch (err) {
    console.error('Webhook handling failed:', err.message);
    res.status(500).json({ error: 'INTERNAL' });
  }
});

module.exports = router;

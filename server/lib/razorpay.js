/**
 * Razorpay access. The secret never leaves the server; only RAZORPAY_KEY_ID
 * (a publishable value, required by Checkout) is exposed to the browser.
 *
 * Payout model — what Razorpay actually supports:
 *   Razorpay Route lets a captured payment be transferred to a linked
 *   sub-account with `on_hold: true`. The money sits with Razorpay until the
 *   transfer is released. That is the mechanism used here: hold at capture,
 *   release only after the booking reaches COMPLETED server-side.
 *
 *   This is NOT legal escrow. It is Razorpay's on-hold transfer feature, and
 *   it requires Route to be activated on the account.
 */
const crypto = require('crypto');
const Razorpay = require('razorpay');

let client = null;

function isConfigured() {
  return !!(process.env.RAZORPAY_KEY_ID && process.env.RAZORPAY_KEY_SECRET);
}

function getClient() {
  if (!isConfigured()) {
    const err = new Error('Razorpay not configured');
    err.code = 'NO_RAZORPAY';
    throw err;
  }
  if (!client) {
    client = new Razorpay({
      key_id: process.env.RAZORPAY_KEY_ID,
      key_secret: process.env.RAZORPAY_KEY_SECRET
    });
  }
  return client;
}

/** Amounts are integer paise everywhere — never floats. */
function createOrder({ amountPaise, currency, bookingId }) {
  return getClient().orders.create({
    amount: amountPaise,
    currency: currency || 'INR',
    receipt: 'booking_' + bookingId,
    // Authorise now, capture when the guide accepts.
    payment_capture: false,
    notes: { bookingId: bookingId }
  });
}

/**
 * Verifies the Checkout handler payload. Without a matching signature the
 * payment is not treated as real, no matter what the browser claims.
 */
function verifyPaymentSignature({ orderId, paymentId, signature }) {
  if (!orderId || !paymentId || !signature) return false;
  const expected = crypto
    .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET)
    .update(orderId + '|' + paymentId)
    .digest('hex');
  const a = Buffer.from(expected);
  const b = Buffer.from(String(signature));
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

/** Verifies an inbound webhook against RAZORPAY_WEBHOOK_SECRET. */
function verifyWebhookSignature(rawBody, signature) {
  const wh = process.env.RAZORPAY_WEBHOOK_SECRET;
  if (!wh || !signature) return false;
  const expected = crypto.createHmac('sha256', wh).update(rawBody).digest('hex');
  const a = Buffer.from(expected);
  const b = Buffer.from(String(signature));
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function capturePayment(paymentId, amountPaise, currency) {
  return getClient().payments.capture(paymentId, amountPaise, currency || 'INR');
}

/** Route transfer held until the booking completes. */
function transferOnHold({ paymentId, accountId, amountPaise, currency, bookingId }) {
  return getClient().payments.transfer(paymentId, {
    transfers: [{
      account: accountId,
      amount: amountPaise,
      currency: currency || 'INR',
      on_hold: true,
      notes: { bookingId: bookingId }
    }]
  });
}

/** Releases a held transfer so Razorpay settles it to the guide. */
function releaseTransfer(transferId) {
  return getClient().transfers.edit(transferId, { on_hold: false });
}

function refund(paymentId, amountPaise) {
  return getClient().payments.refund(paymentId, { amount: amountPaise });
}

module.exports = {
  isConfigured, createOrder, verifyPaymentSignature, verifyWebhookSignature,
  capturePayment, transferOnHold, releaseTransfer, refund
};

/**
 * The booking state machine.
 *
 * A client may *request* a transition; only this table decides whether it is
 * legal, and only the listed actor may make it. Nothing here lets a tourist
 * jump a booking to COMPLETED or PAYOUT_RELEASED to force a payout.
 */

const TRANSITIONS = {
  REQUESTED:          [
    { to: 'ACCEPTED',           actors: ['guide'] },
    { to: 'DECLINED',           actors: ['guide'] },
    { to: 'CANCELLED',          actors: ['tourist'] }
  ],
  ACCEPTED:           [
    // Only a signature-verified payment callback or webhook may do this.
    { to: 'PAYMENT_AUTHORIZED', actors: ['system', 'webhook'] },
    { to: 'CANCELLED',          actors: ['tourist', 'guide'] }
  ],
  PAYMENT_AUTHORIZED: [
    { to: 'IN_PROGRESS',        actors: ['guide'] },
    { to: 'CANCELLED',          actors: ['tourist', 'guide'] },
    { to: 'REFUNDED',           actors: ['system', 'webhook'] },
    { to: 'DISPUTED',           actors: ['tourist', 'guide'] }
  ],
  IN_PROGRESS:        [
    // The tourist confirms the experience actually happened.
    { to: 'COMPLETED',          actors: ['tourist'] },
    { to: 'DISPUTED',           actors: ['tourist', 'guide'] }
  ],
  COMPLETED:          [
    // Payout is a server action after a real Razorpay release, never a click.
    { to: 'PAYOUT_RELEASED',    actors: ['system', 'webhook'] },
    { to: 'DISPUTED',           actors: ['tourist', 'guide'] }
  ],
  PAYOUT_RELEASED:    [
    { to: 'DISPUTED',           actors: ['tourist', 'guide'] }
  ],
  DISPUTED:           [
    { to: 'REFUNDED',           actors: ['system', 'webhook'] },
    { to: 'PAYOUT_RELEASED',    actors: ['system', 'webhook'] }
  ],
  CANCELLED: [], DECLINED: [], REFUNDED: []
};

/** Human-facing labels for the tourist's booking status view. */
const TOURIST_LABEL = {
  REQUESTED:          'Guide requested',
  ACCEPTED:           'Guide accepted',
  PAYMENT_AUTHORIZED: 'Payment authorised — guide arriving',
  IN_PROGRESS:        'Experience in progress',
  COMPLETED:          'Experience completed',
  PAYOUT_RELEASED:    'Completed — guide paid',
  CANCELLED:          'Cancelled',
  DECLINED:           'Guide declined',
  REFUNDED:           'Refunded',
  DISPUTED:           'Under review'
};

function canTransition(from, to, actor) {
  const allowed = TRANSITIONS[from] || [];
  return allowed.some(t => t.to === to && t.actors.indexOf(actor) >= 0);
}

function nextStates(from, actor) {
  return (TRANSITIONS[from] || [])
    .filter(t => !actor || t.actors.indexOf(actor) >= 0)
    .map(t => t.to);
}

module.exports = { TRANSITIONS, TOURIST_LABEL, canTransition, nextStates };

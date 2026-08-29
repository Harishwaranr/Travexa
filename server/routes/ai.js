const express = require('express');
const router = express.Router();
const { searchPlaces } = require('../lib/foursquare');
const { generate } = require('../lib/gemini');
const { decorate } = require('../lib/images');

/* ---------- step 1: natural language -> structured constraints ---------- */

const EXTRACTION_SCHEMA = {
  type: 'object',
  properties: {
    searchTerm:    { type: 'string', description: 'Short Foursquare search term, e.g. "vegetarian restaurant"' },
    location:      { type: 'string', description: 'City or region ONLY (e.g. "Chennai"). Never a landmark, beach, street or neighbourhood.' },
    landmark:      { type: 'string', description: 'Any landmark/neighbourhood the user named (e.g. "Marina Beach"), else empty' },
    useMyLocation: { type: 'boolean', description: 'True if the user said "near me" or similar' },
    budget:        { type: 'string', enum: ['low', 'mid', 'high', 'unknown'] },
    budgetNote:    { type: 'string', description: 'Any explicit amount the user gave, verbatim' },
    cuisine:       { type: 'string' },
    party:         { type: 'string', description: 'e.g. family, couple, solo' },
    languages:     { type: 'array', items: { type: 'string' } },
    durationHours: { type: 'number' },
    attributes:    { type: 'array', items: { type: 'string' } },
    needsWebKnowledge: { type: 'boolean' },
    webQuestion:   { type: 'string' }
  },
  required: ['searchTerm', 'budget', 'attributes', 'needsWebKnowledge']
};

const EXTRACTION_SYSTEM = [
  'You turn a travellers request into search constraints for the Foursquare Places API.',
  'Only record what the user actually said or clearly implied. Never invent a location.',
  'searchTerm must be a short, literal place-search phrase, not a sentence.',
  'location must be a city or region that a maps service would recognise as a place to search near.',
  'Include the country when the name is ambiguous (write "Goa, India", not "Goa").',
  'Put beaches, streets, neighbourhoods and landmarks in landmark, never in location.',
  'Set useMyLocation true only when the user refers to their current position.',
  'Set needsWebKnowledge true only when answering needs current web information',
  '(opening hours today, events this weekend, which area is best), not for ordinary place search.'
].join(' ');

/* ---------- step 3: rank the REAL results ---------- */

const RANKING_SCHEMA = {
  type: 'object',
  properties: {
    summary:  { type: 'string', description: 'One short sentence introducing the matches.' },
    tradeoff: { type: 'string', description: 'If constraints could not all be met, say so. Else empty.' },
    matches: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          id:  { type: 'string', description: 'The exact id of one supplied place' },
          why: { type: 'string', description: 'One sentence, only from the supplied fields' }
        },
        required: ['id', 'why']
      }
    }
  },
  required: ['summary', 'matches']
};

const RANKING_SYSTEM = [
  'You rank real places returned by the Foursquare Places API. Rules you must not break:',
  'Only reference places from the supplied list, by their exact id.',
  'Only cite facts present in the supplied fields. If rating or price is null,',
  'do not mention it and never guess it.',
  'Never invent addresses, prices, ratings, reviews or amenities.',
  'If the results do not satisfy a constraint the user gave, say so in tradeoff.',
  'Keep every sentence short.'
].join(' ');

/**
 * POST /api/ai/recommend
 * { type, destination, userQuery, location: {lat,lng} }
 */
router.post('/recommend', async (req, res) => {
  const { type, destination, userQuery, location } = req.body || {};

  if (!userQuery || !String(userQuery).trim()) {
    return res.status(400).json({ error: 'Missing "userQuery"' });
  }
  // 'place' is the open-ended Assistant search; it is not a guide lookup.
  const kind = ['hotel', 'restaurant', 'guide', 'place'].indexOf(type) >= 0 ? type : 'hotel';

  try {
    // --- 1. understand the request -------------------------------------
    const extraction = await generate({
      system: EXTRACTION_SYSTEM,
      schema: EXTRACTION_SCHEMA,
      prompt: 'Service: ' + kind + '\n' +
              'Destination already chosen by the traveller: ' + (destination || '(none)') + '\n' +
              'Travellers request: ' + userQuery
    });

    const prefs = extraction.json || {};

    // Guides are Travexa's own marketplace, not Foursquare venues.
    if (kind === 'guide') {
      return res.json({
        type: kind,
        preferences: prefs,
        places: [],
        guideCriteria: {
          languages: prefs.languages || [],
          durationHours: prefs.durationHours || null,
          attributes: prefs.attributes || [],
          nearMe: !!prefs.useMyLocation
        },
        summary: 'Matched against Travexa guide profiles.',
        source: 'travexa-guides'
      });
    }

    // --- 2. decide where to search -------------------------------------
    const coords = (location && location.lat != null && location.lng != null)
      ? location.lat + ',' + location.lng : null;

    // A location named in the request wins over the stored destination, so
    // "hotels in Lisbon" works while the trip is still set to somewhere else.
    const area = (prefs.useMyLocation && coords) ? coords
               : (prefs.location || destination || coords || '');

    if (!area) {
      return res.status(400).json({
        error: 'NO_AREA',
        message: 'Pick a destination, or allow location access, so places can be found.',
        preferences: prefs
      });
    }

    // --- 3. real places from Foursquare --------------------------------
    // A landmark sharpens the search term; Foursquare's `near` only
    // understands cities, so the landmark must not go into the area.
    const term = [prefs.searchTerm || kind, prefs.landmark]
      .filter(Boolean).join(' ').trim();

    const runSearch = where => searchPlaces({
      location: where,
      query: term,
      budget: prefs.budget !== 'unknown' ? prefs.budget : undefined,
      limit: 12
    });

    let searchedArea = area;
    let found = await runSearch(searchedArea);

    // If a compound area still came through and found nothing, fall back to
    // its city component rather than reporting a dead end.
    if (!found.places.length && /,/.test(searchedArea) && !/^-?\d/.test(searchedArea)) {
      const city = searchedArea.split(',').pop().trim();
      if (city && city !== searchedArea) {
        const retry = await runSearch(city);
        if (retry.places.length) { found = retry; searchedArea = city; }
      }
    }
    const places = found.places;

    if (!places.length) {
      return res.json({
        type: kind, preferences: prefs, places: [], area,
        summary: 'No places matched that search.', source: 'foursquare'
      });
    }

    // --- 4. rank/explain, strictly from the real fields -----------------
    let ranking = { json: null };
    try {
      ranking = await generate({
        system: RANKING_SYSTEM,
        schema: RANKING_SCHEMA,
        prompt: 'Traveller asked: ' + userQuery + '\n\n' +
                'Constraints understood: ' + JSON.stringify(prefs) + '\n\n' +
                'Places returned by Foursquare (the only places you may use):\n' +
                JSON.stringify(places.map(function (p) {
                  return {
                    id: p.id, name: p.name, category: p.category, address: p.address,
                    rating: p.rating, priceLevel: p.priceLevel, distance: p.distance,
                    openNow: p.openNow, popularity: p.popularity
                  };
                }), null, 1) +
                '\n\nPick the best matches (at most 5) in order.'
      });
    } catch (rankErr) {
      console.warn('Ranking step failed, returning unranked results:',
                   rankErr.status || '', rankErr.detail || rankErr.message);
    }

    const rank = ranking.json;
    const byId = new Map(places.map(function (p) { return [p.id, p]; }));
    const used = new Set();
    const ordered = [];

    if (rank && Array.isArray(rank.matches)) {
      rank.matches.forEach(function (m) {
        const place = byId.get(m.id);
        if (place && !used.has(m.id)) {
          used.add(m.id);
          ordered.push(Object.assign({}, place, { why: m.why }));
        }
      });
    }
    // Anything the model did not rank is still shown, just lower down.
    places.forEach(function (p) {
      if (!used.has(p.id)) ordered.push(Object.assign({}, p, { why: null }));
    });

    // --- 5. optional grounded answer for web-knowledge questions --------
    let webAnswer = null;
    if (prefs.needsWebKnowledge && prefs.webQuestion) {
      try {
        const grounded = await generate({
          googleSearch: true,
          prompt: prefs.webQuestion + (area ? ' (context: ' + area + ')' : '')
        });
        if (grounded.text) webAnswer = { text: grounded.text, grounded: !!grounded.grounding };
      } catch (gErr) {
        console.warn('Grounded answer failed:', gErr.message);
      }
    }

    await decorate(ordered, kind);

    res.json({
      type: kind,
      area: searchedArea,
      preferences: prefs,
      summary: (rank && rank.summary) || 'Here are the closest matches.',
      tradeoff: (rank && rank.tradeoff) || '',
      ranked: !!rank,
      webAnswer: webAnswer,
      places: ordered,
      source: 'foursquare'
    });

  } catch (err) {
    if (err.code === 'NO_GEMINI_KEY') {
      return res.status(503).json({ error: 'NO_GEMINI_KEY',
        message: 'AI assistant not configured. Add GEMINI_API_KEY to .env and restart the server.' });
    }
    if (err.code === 'NO_FSQ_KEY') {
      return res.status(503).json({ error: 'NO_FSQ_KEY',
        message: 'Place search is not configured.' });
    }
    if (err.code === 'GEMINI_ERROR') {
      console.error('Gemini error:', err.status, err.detail);
      return res.status(502).json({ error: 'AI_ERROR',
        message: err.transient
          ? 'The assistant is busy right now. Please try again in a moment.'
          : 'Recommendations are temporarily unavailable.' });
    }
    if (err.code === 'FSQ_ERROR') {
      console.error('Foursquare error:', err.status, err.detail);
      return res.status(502).json({ error: 'PLACES_ERROR',
        message: 'Place search is temporarily unavailable.' });
    }
    console.error('AI recommend error:', err);
    res.status(500).json({ error: 'INTERNAL',
      message: 'Something went wrong while finding recommendations.' });
  }
});

/** GET /api/ai/status — lets the UI show a configuration notice, never a key. */
router.get('/status', function (req, res) {
  res.json({
    gemini: !!process.env.GEMINI_API_KEY,
    foursquare: !!process.env.FOURSQUARE_API_KEY
  });
});

/* ------------------------------------------------------------------ plan */

const PLAN_SCHEMA = {
  type: 'object',
  properties: {
    title: { type: 'string', description: 'Short title for the day, e.g. "A day in Chennai"' },
    stops: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          id:     { type: 'string', description: 'The exact id of one supplied place' },
          time:   { type: 'string', description: 'Suggested 24h time, e.g. "09:30"' },
          reason: { type: 'string', description: 'One short sentence on why it sits here in the day' }
        },
        required: ['id', 'time', 'reason']
      }
    },
    note: { type: 'string', description: 'One line on anything the order could not account for' }
  },
  required: ['title', 'stops']
};

const PLAN_SYSTEM = [
  'You order places the traveller has ALREADY chosen into a sensible single day.',
  'Use only the supplied places, each exactly once, referenced by its exact id.',
  'Never invent a place, an address, a price or a rating.',
  'Put the hotel first as the starting point, meals at plausible meal times,',
  'and sightseeing in between. Keep reasons to one short sentence.',
  'If travel time between them is unknown, do not guess distances.'
].join(' ');

/**
 * POST /api/ai/plan
 * { destination, hotel, restaurant, others: [] }
 * Orders real, already-selected places. It never adds new ones.
 */
router.post('/plan', async (req, res) => {
  const b = req.body || {};
  const items = [];

  if (b.hotel && b.hotel.id) items.push(Object.assign({ kind: 'hotel' }, b.hotel));
  if (b.restaurant && b.restaurant.id) items.push(Object.assign({ kind: 'restaurant' }, b.restaurant));
  (Array.isArray(b.others) ? b.others : []).forEach(o => {
    if (o && o.id) items.push(Object.assign({ kind: 'place' }, o));
  });

  if (!items.length) {
    return res.status(400).json({ error: 'NOTHING_TO_PLAN',
      message: 'Choose a hotel, a restaurant or some places first.' });
  }

  // A single stop needs no model call.
  if (items.length === 1) {
    return res.json({
      title: b.destination ? 'A day in ' + b.destination : 'Your day',
      ordered: items.map(i => Object.assign({}, i, { time: '10:00', reason: 'Your only stop so far.' })),
      note: 'Add more places to build a fuller day.',
      ranked: false
    });
  }

  try {
    const out = await generate({
      system: PLAN_SYSTEM,
      schema: PLAN_SCHEMA,
      prompt: 'Destination: ' + (b.destination || 'unspecified') + '\n\n' +
              'Places the traveller chose (order these, all of them, no additions):\n' +
              JSON.stringify(items.map(i => ({
                id: i.id, kind: i.kind, name: i.name,
                address: i.address || '', category: i.category || ''
              })), null, 1)
    });

    const plan = out.json;
    const byId = new Map(items.map(i => [i.id, i]));
    const ordered = [];
    const used = new Set();

    if (plan && Array.isArray(plan.stops)) {
      plan.stops.forEach(s => {
        const item = byId.get(s.id);
        if (item && !used.has(s.id)) {
          used.add(s.id);
          ordered.push(Object.assign({}, item, { time: s.time, reason: s.reason }));
        }
      });
    }
    // Anything the model dropped still belongs to the traveller — keep it.
    items.forEach(i => {
      if (!used.has(i.id)) ordered.push(Object.assign({}, i, { time: null, reason: null }));
    });

    res.json({
      title: (plan && plan.title) || ('A day in ' + (b.destination || 'your destination')),
      ordered: ordered,
      note: (plan && plan.note) || '',
      ranked: !!plan
    });

  } catch (err) {
    // Falling back to the selection order is better than showing nothing.
    console.warn('Plan ordering failed:', err.status || '', err.detail || err.message);
    res.json({
      title: 'A day in ' + (b.destination || 'your destination'),
      ordered: items.map(i => Object.assign({}, i, { time: null, reason: null })),
      note: 'Shown in the order you picked — the assistant could not sequence them just now.',
      ranked: false
    });
  }
});

module.exports = router;

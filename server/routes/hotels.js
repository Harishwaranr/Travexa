const express = require('express');
const router = express.Router();
const { searchPlaces } = require('../lib/foursquare');
const { decorate } = require('../lib/images');

/**
 * GET /api/hotels?location=Lisbon&budget=mid&limit=8
 * GET /api/places?location=Paris&query=restaurant&limit=12
 *
 * Plain (non-AI) place search. Both paths run the same Foursquare
 * integration in ../lib/foursquare.js.
 *  - location: city name, or "lat,lng" for a browser geolocation fix
 *  - query:    what to search for (default "hotel")
 *  - budget:   low | mid | high  (maps to Foursquare price 1-4)
 *  - limit:    number of results (default 8, max 50)
 */
router.get('/', async (req, res) => {
  const { location, budget, limit, query } = req.query;

  if (!location) {
    return res.status(400).json({ error: 'Missing "location" parameter' });
  }

  try {
    const { places, query: usedQuery } = await searchPlaces({
      location, budget, limit, query
    });

    // Attach imagery: the venue's own photo when it exists, otherwise an
    // attributed stock photograph clearly marked as such.
    await decorate(places, /restaurant|food|eat/i.test(usedQuery) ? 'restaurant' : 'hotel');

    res.json({
      location: location,
      query: usedQuery,
      count: places.length,
      hotels: places,   // original key, kept for existing consumers
      places: places
    });

  } catch (err) {
    if (err.code === 'NO_FSQ_KEY') {
      return res.status(500).json({ error: 'Foursquare API key not configured' });
    }
    if (err.code === 'FSQ_ERROR') {
      console.error('Foursquare error:', err.status, err.detail);
      return res.status(err.status).json({ error: 'Place search failed', detail: err.detail });
    }
    console.error('Place search error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;

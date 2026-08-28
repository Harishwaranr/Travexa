const express = require('express');
const router = express.Router();

const FSQ_KEY = process.env.FOURSQUARE_API_KEY;
const FSQ_BASE = 'https://places-api.foursquare.com/places/search';
const FSQ_VERSION = '2025-06-17';

/**
 * GET /api/hotels?location=Lisbon&budget=mid&limit=8
 * GET /api/places?location=Paris&query=restaurant&limit=12
 *
 * One Foursquare integration, mounted at both paths. Returns real places
 * near the given location.
 *  - location: city name, or "lat,lng" for a browser geolocation fix
 *  - query:    what to search for (default "hotel"); e.g. restaurant,
 *              museum, park, cafe, landmark
 *  - budget:   low | mid | high  (maps to Foursquare price 1-4)
 *  - limit:    number of results (default 8, max 50)
 */
router.get('/', async (req, res) => {
  try {
    const { location, budget, limit, query } = req.query;

    if (!location) {
      return res.status(400).json({ error: 'Missing "location" parameter' });
    }

    if (!FSQ_KEY) {
      return res.status(500).json({ error: 'Foursquare API key not configured' });
    }

    // Build Foursquare query
    const params = new URLSearchParams({
      query: (query && String(query).trim()) || 'hotel',
      limit: String(Math.min(parseInt(limit) || 8, 50)),
      sort: 'RELEVANCE'
    });

    // A "lat,lng" location is a geolocation fix and must go through `ll`;
    // anything else is a place name and goes through `near`.
    const asCoords = String(location).trim()
      .match(/^(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)$/);

    if (asCoords) {
      params.append('ll', `${asCoords[1]},${asCoords[2]}`);
      params.append('radius', '8000');
    } else {
      params.append('near', location);
    }

    // Map budget to Foursquare price filter (1=cheap, 4=expensive)
    if (budget === 'low') { params.append('min_price', '1'); params.append('max_price', '2'); }
    if (budget === 'mid') { params.append('min_price', '2'); params.append('max_price', '3'); }
    if (budget === 'high') { params.append('min_price', '3'); params.append('max_price', '4'); }

    const url = `${FSQ_BASE}?${params.toString()}`;

    const response = await fetch(url, {
      headers: {
        'Authorization': 'Bearer ' + FSQ_KEY,
        'Accept': 'application/json',
        'X-Places-Api-Version': FSQ_VERSION
      }
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error('Foursquare error:', response.status, errText);
      return res.status(response.status).json({
        error: 'Hotel search failed',
        detail: errText
      });
    }

    const data = await response.json();

    // Transform Foursquare results into a clean format for the frontend
    const hotels = (data.results || []).map(place => {
      // Build photo URL from category icon as fallback
      let photoUrl = null;
      if (place.photos && place.photos.length > 0) {
        const photo = place.photos[0];
        photoUrl = `${photo.prefix}400x300${photo.suffix}`;
      } else if (place.categories && place.categories.length > 0) {
        const icon = place.categories[0].icon;
        if (icon) photoUrl = `${icon.prefix}120${icon.suffix}`;
      }

      return {
        id: place.fsq_place_id || place.fsq_id || null,
        name: place.name,
        address: place.location?.formatted_address || place.location?.address || '',
        city: place.location?.locality || '',
        rating: place.rating ? (place.rating / 2).toFixed(1) : null,
        priceLevel: place.price || null,
        category: place.categories?.[0]?.name || 'Hotel',
        distance: place.distance || null,
        photo: photoUrl,
        phone: place.tel || null,
        website: place.website || null,
        email: place.email || null
      };
    });

    // `hotels` is kept for the original /api/hotels consumers; `places` is
    // the same array under a neutral name for restaurant / attraction searches.
    res.json({
      location: location,
      query: params.get('query'),
      count: hotels.length,
      hotels: hotels,
      places: hotels
    });

  } catch (err) {
    console.error('Hotel search error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;

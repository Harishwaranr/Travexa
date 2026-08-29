const express = require('express');
const router = express.Router();

const { hazardsNear } = require('../lib/hazards');
const { festivalsNear } = require('../lib/festivals');

/**
 * GET /api/conditions?lat=&lon=&place=Chennai&name=...
 *
 * Everything that feeds the safety score for one place, in one call:
 * natural hazards (USGS + GDACS) and festival/crowd pressure (utsav.gov.in).
 * Weather stays on /api/weather, which is already cached separately.
 *
 * Any source that fails contributes nothing and reports why.
 */
router.get('/', async (req, res) => {
  const lat = parseFloat(req.query.lat);
  const lon = parseFloat(req.query.lon);
  const place = (req.query.place || req.query.name || '').trim();

  if (isNaN(lat) || isNaN(lon)) {
    return res.status(400).json({ error: 'Provide numeric lat and lon.' });
  }

  // Festival indexing crawls a slow third-party site; never let it hold up
  // the hazard answer.
  const withTimeout = (p, ms, fallback) => Promise.race([
    p, new Promise(r => setTimeout(() => r(fallback), ms))
  ]);

  const [hazards, festivals] = await Promise.all([
    hazardsNear(lat, lon, 400).catch(e => ({
      earthquakes: { ok: false, events: [], error: e.message },
      gdacs: { ok: false, events: [], error: e.message }
    })),
    place
      ? withTimeout(
          festivalsNear(place, 7).catch(e => ({
            available: false, events: [], crowdLevel: null, reason: e.message })),
          9000,
          { available: false, events: [], crowdLevel: null,
            reason: 'Festival listing still indexing — try again shortly.' })
      : Promise.resolve({ available: false, events: [], crowdLevel: null,
                          reason: 'No destination name supplied.' })
  ]);

  res.json({
    place: place || null,
    coordinates: { lat, lon },
    hazards,
    festivals,
    sources: {
      earthquakes: 'USGS',
      disasters: 'GDACS',
      festivals: 'utsav.gov.in (unofficial listing, historical dates)'
    },
    fetchedAt: new Date().toISOString()
  });
});

module.exports = router;

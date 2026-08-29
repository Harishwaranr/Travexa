const express = require('express');
const router = express.Router();

// Simple in-memory cache: key = "lat_lon" -> { timestamp, data }
const weatherCache = new Map();
const CACHE_TTL_MS = 15 * 60 * 1000; // 15 minutes

router.get('/', async (req, res) => {
  try {
    const lat = parseFloat(req.query.lat);
    const lon = parseFloat(req.query.lon);
    const name = req.query.name || 'Destination';

    if (isNaN(lat) || isNaN(lon)) {
      return res.status(400).json({
        error: 'Invalid coordinates. Please provide numeric lat and lon parameters.'
      });
    }

    const cacheKey = `${lat.toFixed(3)}_${lon.toFixed(3)}`;
    const cached = weatherCache.get(cacheKey);

    if (cached && (Date.now() - cached.timestamp < CACHE_TTL_MS)) {
      return res.json({
        ...cached.data,
        cached: true
      });
    }

    const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,relative_humidity_2m,apparent_temperature,is_day,precipitation,rain,weather_code,wind_speed_10m,wind_direction_10m,wind_gusts_10m&hourly=temperature_2m,relative_humidity_2m,apparent_temperature,precipitation_probability,precipitation,rain,weather_code,wind_speed_10m,wind_gusts_10m,visibility&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_sum,precipitation_probability_max,wind_speed_10m_max,wind_gusts_10m_max&timezone=auto`;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 7000);

    const response = await fetch(url, { signal: controller.signal });
    clearTimeout(timeout);

    if (!response.ok) {
      throw new Error(`Open-Meteo responded with HTTP ${response.status}`);
    }

    const rawData = await response.json();

    const payload = {
      location: {
        name,
        latitude: lat,
        longitude: lon,
        timezone: rawData.timezone || 'auto'
      },
      raw: rawData,
      source: 'Open-Meteo',
      fetchedAt: new Date().toISOString(),
      cached: false
    };

    weatherCache.set(cacheKey, {
      timestamp: Date.now(),
      data: payload
    });

    return res.json(payload);
  } catch (error) {
    console.error('Weather API error:', error.message);
    return res.status(502).json({
      error: 'Weather service temporarily unavailable',
      message: error.message
    });
  }
});

module.exports = router;

/**
 * Natural-hazard signals near a coordinate.
 *
 * Two free, keyless public sources:
 *   USGS  — earthquakes (authoritative, well-documented API)
 *   GDACS — floods, cyclones, volcanoes, droughts (UN/EC alert feed)
 *
 * Both are advisory. When a source is unreachable it contributes nothing
 * rather than a guessed value, and says so.
 */

const cache = new Map();
const TTL_MS = 30 * 60 * 1000;

function cached(key) {
  const hit = cache.get(key);
  return (hit && Date.now() - hit.at < TTL_MS) ? hit.value : null;
}

function put(key, value) {
  cache.set(key, { at: Date.now(), value });
  return value;
}

async function getJson(url, ms) {
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), ms || 8000);
  try {
    const res = await fetch(url, {
      signal: ac.signal,
      headers: { 'User-Agent': 'Travexa/1.0 (travel safety prototype)' }
    });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

/** Recent significant earthquakes within `radiusKm`. */
async function earthquakes(lat, lng, radiusKm) {
  const key = 'eq:' + lat.toFixed(2) + ',' + lng.toFixed(2);
  const hit = cached(key);
  if (hit) return hit;

  const since = new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString().slice(0, 10);
  const url = 'https://earthquake.usgs.gov/fdsnws/event/1/query?format=geojson' +
              '&latitude=' + lat + '&longitude=' + lng +
              '&maxradiuskm=' + (radiusKm || 300) +
              '&starttime=' + since + '&minmagnitude=4.0&orderby=magnitude';
  try {
    const d = await getJson(url);
    const events = (d.features || []).slice(0, 5).map(f => ({
      magnitude: f.properties.mag,
      place: f.properties.place,
      time: f.properties.time,
      url: f.properties.url
    }));
    return put(key, { ok: true, events });
  } catch (err) {
    console.warn('USGS lookup failed:', err.message);
    return put(key, { ok: false, events: [], error: err.message });
  }
}

/** Active GDACS alerts (floods, cyclones, volcanoes) near the point. */
async function gdacs(lat, lng, radiusKm) {
  const key = 'gd:' + lat.toFixed(1) + ',' + lng.toFixed(1);
  const hit = cached(key);
  if (hit) return hit;

  const url = 'https://www.gdacs.org/gdacsapi/api/events/geteventlist/SEARCH' +
              '?fromDate=&toDate=&alertlevel=Orange;Red&country=';
  try {
    const d = await getJson(url, 9000);
    const feats = (d && d.features) || [];
    const near = feats.filter(f => {
      const c = f.geometry && f.geometry.coordinates;
      if (!c) return false;
      // Rough degree box; precise geodesics are unnecessary at this scale.
      const dLat = Math.abs(c[1] - lat);
      const dLng = Math.abs(c[0] - lng);
      const deg = (radiusKm || 400) / 111;
      return dLat <= deg && dLng <= deg / Math.max(0.2, Math.cos(lat * Math.PI / 180));
    }).slice(0, 5).map(f => ({
      type: f.properties && (f.properties.eventtype || f.properties.eventname),
      name: f.properties && (f.properties.htmldescription || f.properties.description || f.properties.name),
      level: f.properties && f.properties.alertlevel,
      from: f.properties && f.properties.fromdate
    }));
    return put(key, { ok: true, events: near });
  } catch (err) {
    console.warn('GDACS lookup failed:', err.message);
    return put(key, { ok: false, events: [], error: err.message });
  }
}

/** Combined hazard picture for one coordinate. */
async function hazardsNear(lat, lng, radiusKm) {
  const [eq, gd] = await Promise.all([
    earthquakes(lat, lng, radiusKm),
    gdacs(lat, lng, radiusKm)
  ]);
  return { earthquakes: eq, gdacs: gd };
}

module.exports = { hazardsNear, earthquakes, gdacs };

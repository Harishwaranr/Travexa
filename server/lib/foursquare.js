/**
 * The single Foursquare Places integration.
 *
 * Both the plain search route (routes/hotels.js) and the AI pipeline
 * (routes/ai.js) call searchPlaces() — there is no second integration
 * and no second copy of the response transform.
 */

const FSQ_BASE = 'https://places-api.foursquare.com/places/search';
const FSQ_VERSION = '2025-06-17';

// Core fields are included in the standard tier.
const CORE_FIELDS = [
  'fsq_place_id', 'name', 'location', 'categories', 'distance',
  'tel', 'website', 'email', 'latitude', 'longitude'
].join(',');

// rating / price / photos / hours / popularity are Foursquare *Premium*
// fields. Requesting them on an account without credits fails the whole
// call, so they are opt-in and we fall back to CORE_FIELDS automatically.
const RICH_FIELDS = CORE_FIELDS + ',rating,price,photos,hours,popularity';

const WANT_RICH = String(process.env.FOURSQUARE_PREMIUM || '').toLowerCase() === 'true';

// Flipped to false at runtime the first time Foursquare reports no credits,
// so one failed premium call does not cost every later search a retry.
let richAvailable = WANT_RICH;

function looksLikeCreditError(detail) {
  return /no API credits|exceeded your free|billing/i.test(String(detail || ''));
}

const PRICE_BY_BUDGET = {
  low:  { min: '1', max: '2' },
  mid:  { min: '2', max: '3' },
  high: { min: '3', max: '4' }
};

function isCoordinatePair(value) {
  return /^(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)$/.test(String(value).trim());
}

/** Foursquare returns 0-10; Travexa shows 0-5. */
function toFiveStar(rating) {
  return typeof rating === 'number' ? (rating / 2).toFixed(1) : null;
}

/** A real venue photograph, or null. Premium field — often absent. */
function pickPhoto(place) {
  if (place.photos && place.photos.length) {
    const p = place.photos[0];
    if (p.prefix && p.suffix) return `${p.prefix}400x300${p.suffix}`;
  }
  return null;
}

/**
 * The category glyph. Kept separate from `photo` so the UI can draw a proper
 * tile with it instead of stretching a 120px icon into a photo slot.
 */
function pickIcon(place) {
  const icon = place.categories && place.categories[0] && place.categories[0].icon;
  return icon ? `${icon.prefix}88${icon.suffix}` : null;
}

/** Foursquare shape -> the shape the Travexa frontend renders. */
function normalize(place) {
  return {
    id: place.fsq_place_id || place.fsq_id || null,
    name: place.name,
    address: (place.location && (place.location.formatted_address || place.location.address)) || '',
    city: (place.location && place.location.locality) || '',
    rating: toFiveStar(place.rating),
    priceLevel: place.price || null,
    popularity: typeof place.popularity === 'number' ? place.popularity : null,
    category: (place.categories && place.categories[0] && place.categories[0].name) || null,
    distance: typeof place.distance === 'number' ? place.distance : null,
    // Needed to score weather / disaster risk at the place itself.
    lat: typeof place.latitude === 'number' ? place.latitude
       : (place.geocodes && place.geocodes.main ? place.geocodes.main.latitude : null),
    lng: typeof place.longitude === 'number' ? place.longitude
       : (place.geocodes && place.geocodes.main ? place.geocodes.main.longitude : null),
    photo: pickPhoto(place),
    icon: pickIcon(place),
    phone: place.tel || null,
    website: place.website || null,
    email: place.email || null,
    openNow: (place.hours && typeof place.hours.open_now === 'boolean') ? place.hours.open_now : null
  };
}

/**
 * @param {object} opts
 * @param {string} opts.location  city name, or "lat,lng" for a geolocation fix
 * @param {string} [opts.query]   search term (default "hotel")
 * @param {string} [opts.budget]  low | mid | high
 * @param {number} [opts.limit]
 * @param {number} [opts.radius]  metres, only used with coordinates
 * @returns {Promise<{places: object[], query: string}>}
 */
async function searchPlaces(opts) {
  const key = process.env.FOURSQUARE_API_KEY;
  if (!key) {
    const err = new Error('Foursquare API key not configured');
    err.code = 'NO_FSQ_KEY';
    throw err;
  }
  if (!opts || !opts.location) {
    const err = new Error('Missing "location"');
    err.code = 'NO_LOCATION';
    throw err;
  }

  const params = new URLSearchParams({
    query: (opts.query && String(opts.query).trim()) || 'hotel',
    limit: String(Math.min(parseInt(opts.limit, 10) || 8, 50)),
    sort: 'RELEVANCE'
  });

  if (isCoordinatePair(opts.location)) {
    params.append('ll', String(opts.location).trim().replace(/\s+/g, ''));
    params.append('radius', String(opts.radius || 8000));
  } else {
    params.append('near', opts.location);
  }

  const price = PRICE_BY_BUDGET[opts.budget];
  if (price) {
    params.append('min_price', price.min);
    params.append('max_price', price.max);
  }

  async function call(fields) {
    const qs = new URLSearchParams(params);
    if (fields) qs.set('fields', fields);
    return fetch(`${FSQ_BASE}?${qs.toString()}`, {
      headers: {
        'Authorization': 'Bearer ' + key,
        'Accept': 'application/json',
        'X-Places-Api-Version': FSQ_VERSION
      }
    });
  }

  let usedRich = richAvailable;
  let response = await call(usedRich ? RICH_FIELDS : CORE_FIELDS);

  // Premium fields cost credits. If the account has none, drop back to the
  // core field set rather than failing the search outright.
  if (!response.ok && usedRich) {
    const firstDetail = await response.text();
    if (looksLikeCreditError(firstDetail) || response.status === 402) {
      console.warn('Foursquare premium fields unavailable; using core fields.');
      richAvailable = false;
      usedRich = false;
      response = await call(CORE_FIELDS);
    } else {
      const err = new Error('Foursquare search failed');
      err.code = 'FSQ_ERROR';
      err.status = response.status;
      err.detail = firstDetail;
      throw err;
    }
  }

  if (!response.ok) {
    const detail = await response.text();
    const err = new Error('Foursquare search failed');
    err.code = 'FSQ_ERROR';
    err.status = response.status;
    err.detail = detail;
    throw err;
  }

  const data = await response.json();
  return {
    query: params.get('query'),
    // Tells the UI that rating/price are genuinely unavailable rather than
    // simply absent for these particular venues.
    richFields: usedRich,
    places: (data.results || []).map(normalize)
  };
}

module.exports = { searchPlaces, normalize };

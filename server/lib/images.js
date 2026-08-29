/**
 * Imagery for place cards.
 *
 * Order of preference:
 *   1. The venue's own Foursquare photograph (premium field, often absent).
 *   2. A category-matched, CC-licensed photograph from Openverse.
 *
 * The second is a picture of *a* restaurant, not *this* restaurant, so every
 * such image is returned with source:'stock' and its attribution. The UI is
 * expected to label it — we never present stock imagery as the venue itself.
 */

const OPENVERSE = 'https://api.openverse.org/v1/images/';

// One fetch per search term serves every venue in that category.
const cache = new Map();          // term -> { at, results: [] }
const inflight = new Map();       // term -> Promise
const TTL_MS = 6 * 60 * 60 * 1000;

// Foursquare category names are long and specific; collapse them to a search
// term that actually returns good photography.
const TERM_RULES = [
  [/coffee|caf|tea|bakery|dessert|ice cream/i, 'cafe interior'],
  [/pizza/i,        'pizzeria'],
  [/sushi|japanese/i, 'sushi restaurant'],
  [/chinese|asian|thai|noodle/i, 'asian restaurant'],
  [/italian/i,      'italian restaurant'],
  [/indian|biryani|south indian|vegetarian/i, 'indian restaurant'],
  [/seafood/i,      'seafood restaurant'],
  [/bar|pub|brewery|lounge/i, 'bar interior'],
  [/breakfast|diner|snack/i, 'diner interior'],
  [/restaurant|food|dining|eatery/i, 'restaurant interior'],
  [/resort/i,       'resort building'],
  [/hostel/i,       'hostel room'],
  [/hotel|inn|lodge|motel|guest/i, 'hotel building'],
  [/museum/i,       'museum interior'],
  [/park|garden|trail|lake|scenic|lookout/i, 'park landscape'],
  [/temple|church|mosque|monument|historic/i, 'historic landmark'],
  [/shop|mall|market|store/i, 'shopping street']
];

function termFor(category, kind) {
  const c = String(category || '');
  for (const [re, term] of TERM_RULES) if (re.test(c)) return term;
  if (kind === 'restaurant') return 'restaurant interior';
  if (kind === 'hotel') return 'hotel building';
  return 'travel destination';
}

async function fetchTerm(term, cacheKey) {
  const key = cacheKey || term;
  const hit = cache.get(key);
  if (hit && (Date.now() - hit.at) < TTL_MS) return hit.results;
  if (inflight.has(key)) return inflight.get(key);

  const p = (async () => {
    try {
      const url = OPENVERSE + '?q=' + encodeURIComponent(term) +
                  '&page_size=20&license_type=all-cc&mature=false';
      const ac = new AbortController();
      const timer = setTimeout(() => ac.abort(), 8000);
      const res = await fetch(url, {
        headers: { 'User-Agent': 'Travexa/1.0 (prototype)' },
        signal: ac.signal
      });
      clearTimeout(timer);
      if (!res.ok) throw new Error('HTTP ' + res.status);

      const data = await res.json();
      const results = (data.results || [])
        .filter(r => r.url)
        .map(r => ({
          url: r.thumbnail || r.url,
          full: r.url,
          title: r.title || null,
          creator: r.creator || null,
          license: r.license ? String(r.license).toUpperCase() : null,
          link: r.foreign_landing_url || null
        }));

      cache.set(key, { at: Date.now(), results });
      return results;
    } catch (err) {
      console.warn('Openverse lookup failed for "' + term + '":', err.message);
      cache.set(key, { at: Date.now(), results: [] });   // don't retry in a loop
      return [];
    } finally {
      inflight.delete(key);
    }
  })();

  inflight.set(key, p);
  return p;
}

/**
 * Does this photo plausibly depict this venue?
 *
 * A name search for "Vortex" happily returns a physics diagram. Requiring a
 * meaningful word from the venue name to appear in the photo's title keeps
 * only results that are actually about the place.
 */
function nameMatches(venueName, title) {
  if (!title) return false;
  const t = String(title).toLowerCase();
  const stop = /^(the|and|for|with|hotel|cafe|caf|restaurant|park|museum|centre|center|city|house|club|bar)$/;
  const words = String(venueName).toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(w => w.length >= 4 && !stop.test(w));
  if (!words.length) return false;
  // Two-word names need both; longer names need at least two hits.
  const hits = words.filter(w => t.includes(w)).length;
  return words.length <= 2 ? hits === words.length : hits >= 2;
}

/** Looks for a photograph of this specific venue. Returns null when unsure. */
async function fetchByName(name) {
  const key = 'name:' + name;
  const hit = cache.get(key);
  if (hit && (Date.now() - hit.at) < TTL_MS) return hit.results[0] || null;

  const results = await fetchTerm(name, key);
  const match = results.find(r => nameMatches(name, r.title));
  return match || null;
}

/** Stable per-venue index so a place keeps the same picture between loads. */
function seedIndex(id, len) {
  if (!len) return -1;
  let h = 0;
  const s = String(id || '');
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h % len;
}

/**
 * Fills place.image for a list of places. Mutates in place and resolves once
 * every distinct category has been looked up (a handful of requests at most).
 */
/**
 * A generic photo of a hotel lobby reads as plausible. A generic photo of "a
 * park" standing in for Tokyo DisneySea reads as broken — so attractions get a
 * name lookup only, and fall back to the UI's designed tile when there is no
 * genuine match.
 */
const STAY_OR_FOOD = /hotel|inn\b|lodge|motel|resort|hostel|guest ?house|restaurant|caf[eé]|coffee|bar\b|pub\b|diner|bakery|bistro|food|dining|eatery|steakhouse|pizzeria/i;

function allowsCategoryStock(category, kind) {
  const c = String(category || '').trim();
  // The venue's own category is the reliable signal; the caller's `kind` is
  // only a guess (a search for "attractions" still arrives as kind 'hotel').
  if (c) return STAY_OR_FOOD.test(c);
  return kind === 'hotel' || kind === 'restaurant';
}

async function decorate(places, kind) {
  if (!Array.isArray(places) || !places.length) return places;

  const needsName = places.filter(p => !p.photo && !allowsCategoryStock(p.category, kind));
  const needsTerm = places.filter(p => !p.photo && allowsCategoryStock(p.category, kind));

  // Category pools: one lookup serves every venue sharing that term.
  const terms = [...new Set(needsTerm.map(p => termFor(p.category, kind)))];
  const sets = {};
  const byName = new Map();

  await Promise.all([
    ...terms.map(async t => { sets[t] = await fetchTerm(t); }),
    ...needsName.map(async p => { byName.set(p.id, await fetchByName(p.name)); })
  ]);

  const used = {};
  places.forEach(p => {
    if (p.photo) {
      p.image = { url: p.photo, source: 'venue' };
      return;
    }

    if (!allowsCategoryStock(p.category, kind)) {
      const m = byName.get(p.id);
      // A name match is a photo *of this place*, so it needs no caveat badge.
      p.image = m ? {
        url: m.url, source: 'named', creator: m.creator,
        license: m.license, link: m.link
      } : null;
      return;
    }

    const term = termFor(p.category, kind);
    const pool = sets[term] || [];
    if (!pool.length) { p.image = null; return; }

    // Spread picks across the pool so neighbouring cards differ.
    used[term] = (used[term] || 0);
    let idx = seedIndex(p.id, pool.length);
    idx = (idx + used[term]) % pool.length;
    used[term]++;

    const img = pool[idx];
    p.image = {
      url: img.url, source: 'stock', term: term,
      creator: img.creator, license: img.license, link: img.link
    };
  });

  return places;
}

module.exports = { decorate, termFor };

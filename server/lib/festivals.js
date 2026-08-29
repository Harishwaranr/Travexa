/**
 * Festival / crowd signal from utsav.gov.in (Ministry of Tourism).
 *
 * IMPORTANT — this is not an official API. utsav.gov.in publishes no
 * documented endpoint. Its /all-events route returns JSON only when sent an
 * XMLHttpRequest header, and the payload is an HTML fragment that has to be
 * parsed. It can change or break without notice; every failure path here
 * degrades to "no data" rather than to a guess.
 *
 * The cards carry a title, description, category and a single date, but no
 * state or city field — that lives on 2,843 separate detail pages. So a
 * destination is matched against the event's own text.
 */

const BASE = 'https://utsav.gov.in/all-events';
const PER_PAGE = 12;
const TTL_MS = 12 * 60 * 60 * 1000;
const CONCURRENCY = 6;

let index = null;          // { at, events: [] }
let building = null;

function decode(s) {
  return String(s || '')
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#0?39;|&apos;/g, "'").replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ').trim();
}

const MONTHS = { jan:0, feb:1, mar:2, apr:3, may:4, jun:5,
                 jul:6, aug:7, sep:8, oct:9, nov:10, dec:11 };

function parseDate(text) {
  const m = String(text).match(/(\d{1,2})\s+([A-Za-z]{3})[a-z]*\s+(\d{4})/);
  if (!m) return null;
  const mo = MONTHS[m[2].toLowerCase()];
  if (mo === undefined) return null;
  const d = new Date(Date.UTC(+m[3], mo, +m[1]));
  // 1 Jan 1970 is this dataset's "no date" placeholder.
  return d.getUTCFullYear() <= 1970 ? null : d;
}

/** Pulls the event cards out of one HTML fragment. */
function parseCards(html) {
  const out = [];
  const chunks = String(html).split('<div class="cardarea">').slice(1);
  for (const c of chunks) {
    const title = (c.match(/<div class="eventtitle"><a[^>]*>([\s\S]*?)<\/a>/) || [])[1];
    const href  = (c.match(/<div class="eventtitle"><a href="([^"]+)"/) || [])[1];
    const desc  = (c.match(/<\/ul>\s*<\/div>\s*<p>([\s\S]*?)<\/p>/) || [])[1];
    const cats  = (c.match(/<div class="category_inline">[\s\S]*?<a[^>]*>([\s\S]*?)<\/a>/) || [])[1];
    const date  = (c.match(/<span class="event-date">[\s\S]*?<span>([\s\S]*?)<\/span>/) || [])[1];
    if (!title) continue;
    out.push({
      title: decode(title),
      url: href || null,
      text: decode((desc || '') + ' ' + (title || '') + ' ' + (cats || '')),
      date: parseDate(date || '')
    });
  }
  return out;
}

async function fetchPage(page) {
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), 12000);
  try {
    const res = await fetch(BASE + '?page=' + page, {
      signal: ac.signal,
      headers: {
        'X-Requested-With': 'XMLHttpRequest',
        'User-Agent': 'Travexa/1.0 (travel planning prototype)'
      }
    });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const data = await res.json();
    return { cards: parseCards(data.view || ''), total: data.total || 0 };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Crawls every page once, keeping only events that still have a usable date.
 * Runs at most once per TTL and is shared by concurrent callers.
 */
async function buildIndex() {
  if (index && Date.now() - index.at < TTL_MS) return index;
  if (building) return building;

  building = (async () => {
    const started = Date.now();
    try {
      const first = await fetchPage(1);
      const pages = Math.min(260, Math.ceil((first.total || 0) / PER_PAGE));
      const events = first.cards.slice();

      let next = 2;
      async function worker() {
        while (next <= pages) {
          const p = next++;
          try {
            const r = await fetchPage(p);
            events.push(...r.cards);
          } catch (e) { /* one bad page must not sink the crawl */ }
        }
      }
      await Promise.all(Array.from({ length: CONCURRENCY }, worker));

      const dated = events.filter(e => e.date);
      index = { at: Date.now(), events: dated, scanned: events.length, pages };
      console.log('utsav.gov.in: indexed ' + dated.length + ' dated events from ' +
                  events.length + ' cards in ' + Math.round((Date.now() - started) / 1000) + 's');
      return index;
    } catch (err) {
      console.warn('utsav.gov.in index failed:', err.message);
      index = { at: Date.now(), events: [], scanned: 0, pages: 0, error: err.message };
      return index;
    } finally {
      building = null;
    }
  })();

  return building;
}

function dayOfYear(d) {
  return Math.floor((Date.UTC(2001, d.getUTCMonth(), d.getUTCDate()) -
                     Date.UTC(2001, 0, 1)) / 86400000);
}

/** Words worth matching a destination on — drops noise like "India". */
function placeTokens(destination) {
  const skip = /^(india|city|district|state|the|and|near|of)$/i;
  return String(destination || '')
    .split(/[,\s]+/)
    .map(w => w.trim())
    .filter(w => w.length >= 4 && !skip.test(w));
}

/**
 * Festivals near a destination within `windowDays` of today.
 * Returns { available, events, crowdLevel } — never a fabricated crowd number.
 */
async function festivalsNear(destination, windowDays) {
  const idx = await buildIndex();
  const tokens = placeTokens(destination);

  if (!idx.events.length) {
    return { available: false, reason: idx.error || 'No festival data could be indexed.',
             events: [], crowdLevel: null };
  }
  if (!tokens.length) {
    return { available: true, events: [], crowdLevel: null,
             reason: 'Destination too general to match festival listings.' };
  }

  // The listing is an archive: only a handful of its 2,800+ entries carry a
  // future date. Indian festivals are annual, so the useful signal is the
  // day-of-year — "this window is festival season here", not "this is on now".
  const days = windowDays || 5;
  const today = new Date();
  const todayDoy = dayOfYear(today);

  const withinWindow = e => {
    const d = Math.abs(dayOfYear(e.date) - todayDoy);
    return Math.min(d, 365 - d) <= days;   // wrap around the year boundary
  };

  const matched = idx.events.filter(e =>
    withinWindow(e) && tokens.some(t => e.text.toLowerCase().includes(t.toLowerCase()))
  );

  // Collapse repeats of the same annual festival into one entry.
  const seen = new Map();
  matched.forEach(e => {
    const k = e.title.toLowerCase().replace(/\s*\d{4}\s*$/, '').trim();
    const prev = seen.get(k);
    if (!prev) seen.set(k, { title: e.title, url: e.url, years: [e.date.getUTCFullYear()],
                             around: e.date.toISOString().slice(5, 10) });
    else if (prev.years.indexOf(e.date.getUTCFullYear()) < 0) prev.years.push(e.date.getUTCFullYear());
  });

  const events = [...seen.values()]
    .sort((a, b) => b.years.length - a.years.length)
    .slice(0, 5)
    .map(e => ({ title: e.title, url: e.url, around: e.around,
                 seenInYears: e.years.sort() }));

  const crowdLevel = events.length >= 3 ? 'High'
                   : events.length === 2 ? 'Elevated'
                   : events.length === 1 ? 'Some' : 'None listed';

  return {
    available: true, events, crowdLevel,
    basis: 'historical',      // never claim these are confirmed to run this year
    indexedEvents: idx.events.length, windowDays: days
  };
}

module.exports = { festivalsNear, buildIndex, parseCards, parseDate, fetchPage };

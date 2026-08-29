/**
 * Gemini Flash access. Server-side only — the key never reaches the browser.
 *
 * Called over REST so the project keeps its three-dependency footprint.
 */

const BASE = 'https://generativelanguage.googleapis.com/v1beta/models';

// The free tier caps requests *per day, per project, per model* — so when one
// model is exhausted another still has headroom. This chain is tried in order.
// GEMINI_MODEL puts your own choice at the front.
const MODEL = process.env.GEMINI_MODEL || 'gemini-3.5-flash';
const MODELS = [
  MODEL,
  'gemini-3.5-flash-lite',
  'gemini-3.1-flash-lite',
  'gemini-3-flash-preview',
  'gemini-flash-lite-latest',
  'gemini-flash-latest'
].filter((m, i, a) => a.indexOf(m) === i);

function requireKey() {
  const key = process.env.GEMINI_API_KEY;
  if (!key) {
    const err = new Error('Gemini API key not configured');
    err.code = 'NO_GEMINI_KEY';
    throw err;
  }
  return key;
}

/**
 * @param {object} opts
 * @param {string} opts.prompt
 * @param {string} [opts.system]        system instruction
 * @param {object} [opts.schema]        responseSchema for JSON-mode output
 * @param {boolean} [opts.googleSearch] enable Google Search grounding
 * @returns {Promise<{text: string, json: object|null, grounding: object|null}>}
 */
async function generate(opts) {
  const key = requireKey();

  const body = {
    contents: [{ role: 'user', parts: [{ text: opts.prompt }] }],
    generationConfig: { temperature: 0.2 }
  };

  if (opts.system) {
    body.systemInstruction = { parts: [{ text: opts.system }] };
  }

  // JSON mode and tool use are mutually exclusive on this API.
  if (opts.schema) {
    body.generationConfig.responseMimeType = 'application/json';
    body.generationConfig.responseSchema = opts.schema;
  } else if (opts.googleSearch) {
    body.tools = [{ google_search: {} }];
  }

  // API keys go in x-goog-api-key regardless of prefix. AI Studio issues both
  // the older AIza... format and the newer AQ.... format, and both authenticate
  // this way — verified against the live API. Only a real OAuth access token
  // (ya29...) uses the bearer header.
  const headers = { 'Content-Type': 'application/json' };
  if (/^ya29\./.test(key)) headers['Authorization'] = 'Bearer ' + key;
  else headers['x-goog-api-key'] = key;

  // 429/503 are load, not misuse: retry with backoff, then try the next model.
  // 429 = quota/rate limit, 503 = overloaded. Both mean "try the next model".
  const RETRY_ON = [429, 503];
  // A daily quota will not clear in seconds, so do not burn retries on it.
  const isDailyQuota = d => /PerDay|per day/i.test(String(d || ''));
  const payload = JSON.stringify(body);
  let res = null;
  let detail = '';

  // A hung model call must not hold a request open forever.
  const TIMEOUT_MS = parseInt(process.env.GEMINI_TIMEOUT_MS, 10) || 25000;

  outer:
  for (const model of MODELS) {
    for (let attempt = 0; attempt < 3; attempt++) {
      const ac = new AbortController();
      const timer = setTimeout(() => ac.abort(), TIMEOUT_MS);
      try {
        res = await fetch(`${BASE}/${model}:generateContent`, {
          method: 'POST', headers: headers, body: payload, signal: ac.signal
        });
      } catch (netErr) {
        clearTimeout(timer);
        detail = netErr.name === 'AbortError'
          ? 'timed out after ' + TIMEOUT_MS + 'ms'
          : netErr.message;
        res = { ok: false, status: 504 };
        if (attempt < 2) { await new Promise(r => setTimeout(r, 400)); continue; }
        break;
      }
      clearTimeout(timer);
      if (res.ok) break outer;

      detail = await res.text();
      if (RETRY_ON.indexOf(res.status) < 0) break;          // real error: stop
      if (isDailyQuota(detail)) break;                      // move to next model
      if (attempt < 2) await new Promise(r => setTimeout(r, 600 * Math.pow(2, attempt)));
    }
  }

  if (!res.ok) {
    const err = new Error('Gemini request failed');
    err.code = 'GEMINI_ERROR';
    err.status = res.status;
    err.detail = detail;
    err.transient = RETRY_ON.indexOf(res.status) >= 0;
    throw err;
  }

  const data = await res.json();
  const candidate = (data.candidates && data.candidates[0]) || {};
  const text = ((candidate.content && candidate.content.parts) || [])
    .map(p => p.text || '').join('').trim();

  let json = null;
  if (opts.schema && text) {
    try { json = JSON.parse(text); } catch (e) { json = null; }
  }

  return {
    text,
    json,
    grounding: candidate.groundingMetadata || null
  };
}

module.exports = { generate, MODEL };

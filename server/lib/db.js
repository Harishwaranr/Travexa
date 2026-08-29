/**
 * Postgres access. A single pool for the process.
 *
 * Every route degrades gracefully when DATABASE_URL is absent, so the
 * existing site keeps working before the database is provisioned.
 */
const { Pool } = require('pg');

let pool = null;

function isConfigured() {
  return !!process.env.DATABASE_URL;
}

function getPool() {
  if (!isConfigured()) {
    const err = new Error('Database not configured');
    err.code = 'NO_DB';
    throw err;
  }
  if (!pool) {
    pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      // Managed Postgres (Supabase, Neon, RDS) generally requires TLS.
      ssl: /localhost|127\.0\.0\.1/.test(process.env.DATABASE_URL)
        ? false
        : { rejectUnauthorized: false },
      max: 8,
      idleTimeoutMillis: 30000,
      // Without this the pool waits forever on a blocked port and the caller
      // gets an empty error, which says nothing useful.
      connectionTimeoutMillis: 10000
    });
    pool.on('error', e => console.error('Postgres pool error:', e.message));
  }
  return pool;
}

function query(text, params) {
  return getPool().query(text, params);
}

/** Runs fn inside a transaction, rolling back on any throw. */
async function tx(fn) {
  const client = await getPool().connect();
  try {
    await client.query('BEGIN');
    const out = await fn(client);
    await client.query('COMMIT');
    return out;
  } catch (err) {
    try { await client.query('ROLLBACK'); } catch (e) {}
    throw err;
  } finally {
    client.release();
  }
}

async function health() {
  if (!isConfigured()) return { configured: false, reachable: false };
  try {
    await query('SELECT 1');
    return { configured: true, reachable: true };
  } catch (err) {
    // A bare "timeout expired" almost always means the network is blocking
    // the Postgres port rather than anything being wrong with the URL.
    let hint = null;
    if (/timeout/i.test(err.message || '') || !err.message) {
      hint = 'Could not reach the database port. Many networks block outbound ' +
             '5432/6543 — try another network, or run Postgres locally.';
    } else if (/password|authentication/i.test(err.message)) {
      hint = 'The database rejected the credentials in DATABASE_URL.';
    } else if (/ENOTFOUND|EAI_AGAIN/i.test(err.code || '')) {
      hint = 'The database host in DATABASE_URL could not be resolved.';
    }
    return {
      configured: true,
      reachable: false,
      error: err.message || err.code || 'connection failed',
      hint: hint
    };
  }
}

module.exports = { query, tx, isConfigured, health, getPool };

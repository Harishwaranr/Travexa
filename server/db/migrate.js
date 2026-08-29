#!/usr/bin/env node
/**
 * Applies server/db/schema.sql to DATABASE_URL.
 *
 *   npm run db:setup
 *
 * Exists so the project does not depend on the psql client being installed.
 * schema.sql is written to be safe to re-run.
 */
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { Client } = require('pg');

const url = process.env.DATABASE_URL;
if (!url) {
  console.error('DATABASE_URL is not set in .env');
  process.exit(1);
}

const schemaPath = path.join(__dirname, 'schema.sql');
const sql = fs.readFileSync(schemaPath, 'utf8');
const local = /localhost|127\.0\.0\.1/.test(url);

const client = new Client({
  connectionString: url,
  ssl: local ? false : { rejectUnauthorized: false },
  connectionTimeoutMillis: 20000
});

(async () => {
  try {
    await client.connect();
    const who = await client.query('SELECT current_database() db, current_user usr');
    console.log('Connected to "' + who.rows[0].db + '" as "' + who.rows[0].usr + '"');

    await client.query(sql);
    console.log('Schema applied.');

    const { rows } = await client.query(
      `SELECT table_name FROM information_schema.tables
        WHERE table_schema = 'public' ORDER BY table_name`);
    console.log('Tables now present: ' + rows.map(r => r.table_name).join(', '));

    await client.end();
  } catch (err) {
    console.error('Migration failed: ' + err.message);
    if (/password authentication/i.test(err.message)) {
      console.error('  The DATABASE_URL password was rejected. Reset it in your');
      console.error('  database dashboard and update .env.');
    }
    if (/timeout/i.test(err.message)) {
      console.error('  Could not reach the database port. Some networks block 5432/6543.');
    }
    process.exit(1);
  }
})();

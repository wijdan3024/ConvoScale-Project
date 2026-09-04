import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { query } from './connection.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Execute schema migrations
 */
export async function runMigrations() {
  const schemaPath = path.join(__dirname, 'schema.sql');
  const sql = fs.readFileSync(schemaPath, 'utf8');

  try {
    await query(sql);
    console.log('[Migration] Database schema and indexes verified successfully.');
  } catch (err) {
    console.error(`[Migration] Error running migration script: ${err.message}`);
    throw err;
  }
}


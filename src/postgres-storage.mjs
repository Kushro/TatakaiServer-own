import pg from 'pg';
import { DocumentStore } from './storage.mjs';

/** Shared durable storage for Node hosts with ephemeral filesystems (Heroku). */
export async function nodePostgresStorage(connectionString, suppliedPool) {
  const pool = suppliedPool || new pg.Pool({ connectionString, max: 5, connectionTimeoutMillis: 10000, idleTimeoutMillis: 30000 });
  await pool.query('CREATE TABLE IF NOT EXISTS server_state (id INTEGER PRIMARY KEY, version BIGINT NOT NULL, data TEXT NOT NULL)');
  await pool.query('CREATE TABLE IF NOT EXISTS server_artifacts (key TEXT PRIMARY KEY, value TEXT NOT NULL)');
  const store = new DocumentStore({
    read: async () => {
      const row = (await pool.query('SELECT version, data FROM server_state WHERE id = 1')).rows[0];
      return row ? { version: Number(row.version), data: row.data } : null;
    },
    cas: async (version, data) => (version < 0
      ? await pool.query('INSERT INTO server_state(id, version, data) VALUES(1, 0, $1) ON CONFLICT DO NOTHING RETURNING id', [data])
      : await pool.query('UPDATE server_state SET version = version + 1, data = $1 WHERE id = 1 AND version = $2 RETURNING id', [data, version])).rowCount === 1,
  });
  const artifacts = {
    put: async (key, value) => {
      if (typeof value !== 'string' || Buffer.byteLength(value) > 16 * 1024 * 1024) throw Error('Artifact exceeds Postgres storage limit');
      await pool.query('INSERT INTO server_artifacts(key, value) VALUES($1, $2)', [key, value]);
    },
    get: async key => {
      const row = (await pool.query('SELECT value FROM server_artifacts WHERE key = $1', [key])).rows[0];
      if (!row) throw Error('Extension artifact missing'); return row.value;
    },
    remove: async key => { await pool.query('DELETE FROM server_artifacts WHERE key = $1', [key]); },
  };
  return { store, artifacts, close: () => pool.end() };
}

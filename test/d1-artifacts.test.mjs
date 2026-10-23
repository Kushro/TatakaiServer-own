import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFile } from 'node:fs/promises';
import { d1Artifacts } from '../src/d1-artifacts.mjs';
async function fixture() {
  const sqlite = new DatabaseSync(':memory:');
  sqlite.exec(await readFile(new URL('../migrations/0002_artifacts.sql', import.meta.url), 'utf8'));
  const db = {
    prepare: sql => ({ bind: (...args) => ({ execute: () => {
      const statement = sqlite.prepare(sql);
      return { results: statement.columns().length ? statement.all(...args) : (statement.run(...args), []) };
    } }) }),
    batch: async statements => {
      sqlite.exec('BEGIN');
      try { const rows = statements.map(statement => statement.execute()); sqlite.exec('COMMIT'); return rows; }
      catch (error) { sqlite.exec('ROLLBACK'); throw error; }
    },
  };
  return { sqlite, db, artifacts: d1Artifacts(db) };
}
test('D1-only artifacts preserve multi-chunk Unicode and survive adapter recreation', async () => {
  const f = await fixture();
  try {
    const value = 'a'.repeat(131071) + '😀' + '日本語'.repeat(120000);
    await f.artifacts.put('source', value);
    assert.equal(await d1Artifacts(f.db).get('source'), value);
    const rows = f.sqlite.prepare('SELECT value FROM server_artifact_chunks').all();
    assert.ok(rows.length > 1); assert.ok(rows.every(row => Buffer.byteLength(row.value) < 2000000));
    await assert.rejects(f.artifacts.put('source', 'replacement'));
    assert.equal(await f.artifacts.get('source'), value);
    await f.artifacts.remove('source'); await assert.rejects(f.artifacts.get('source'), /missing/);
    await f.artifacts.put('empty', ''); assert.equal(await f.artifacts.get('empty'), '');
  } finally { f.sqlite.close(); }
});
test('D1-only artifact failures roll back all chunks and reject oversized packages', async () => {
  const f = await fixture();
  try {
    f.sqlite.exec("CREATE TRIGGER reject_chunk BEFORE INSERT ON server_artifact_chunks WHEN NEW.ordinal = 1 BEGIN SELECT RAISE(ABORT, 'fixture failure'); END");
    await assert.rejects(f.artifacts.put('failed', 'a'.repeat(200000)), /fixture failure/);
    assert.equal(f.sqlite.prepare('SELECT COUNT(*) AS count FROM server_artifacts').get().count, 0);
    assert.equal(f.sqlite.prepare('SELECT COUNT(*) AS count FROM server_artifact_chunks').get().count, 0);
    await assert.rejects(f.artifacts.put('oversized', 'x'.repeat(4 * 1024 * 1024 + 1)), /4 MiB/);
  } finally { f.sqlite.close(); }
});

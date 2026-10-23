import { fail } from './security.mjs';

/** Durable artifacts without an R2 subscription. Each value stays below D1's
 * row limit, and a transactional batch publishes all chunks together. */
export function d1Artifacts(db) {
  return {
    async put(key, value) {
      if (typeof value !== 'string') fail(400, 'invalid_artifact');
      const bytes = new TextEncoder().encode(value).length;
      if (bytes > 4 * 1024 * 1024) fail(413, 'artifact_too_large', 'D1 artifacts must be at most 4 MiB');
      const chunks = [];
      for (let offset = 0; offset < value.length;) {
        let end = Math.min(value.length, offset + 128 * 1024);
        const last = value.charCodeAt(end - 1);
        if (end < value.length && last >= 0xd800 && last <= 0xdbff) end--;
        chunks.push(value.slice(offset, end)); offset = end;
      }
      if (!chunks.length) chunks.push('');
      await db.batch([
        db.prepare('INSERT INTO server_artifacts(key, chunks, bytes) VALUES(?, ?, ?)').bind(key, chunks.length, bytes),
        ...chunks.map((chunk, index) => db.prepare('INSERT INTO server_artifact_chunks(key, ordinal, value) VALUES(?, ?, ?)').bind(key, index, chunk)),
      ]);
    },
    async get(key) {
      const [metadata, content] = await db.batch([
        db.prepare('SELECT chunks, bytes FROM server_artifacts WHERE key = ?').bind(key),
        db.prepare('SELECT ordinal, value FROM server_artifact_chunks WHERE key = ? ORDER BY ordinal').bind(key),
      ]);
      const info = metadata.results[0], chunks = content.results;
      if (!info || chunks.length !== info.chunks || chunks.some((chunk, index) => chunk.ordinal !== index)) throw Error('Extension artifact missing or incomplete');
      const value = chunks.map(chunk => chunk.value).join('');
      if (new TextEncoder().encode(value).length !== info.bytes) throw Error('Extension artifact is incomplete');
      return value;
    },
    async remove(key) {
      await db.batch([
        db.prepare('DELETE FROM server_artifact_chunks WHERE key = ?').bind(key),
        db.prepare('DELETE FROM server_artifacts WHERE key = ?').bind(key),
      ]);
    },
  };
}

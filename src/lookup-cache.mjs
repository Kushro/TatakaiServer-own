/** Bounded process-local cache for large, unproxied lookup results. */
export function createLookupCache({ maxBytes = 8 * 1024 * 1024, maxEntryBytes = 2 * 1024 * 1024, maxEntries = 64, maxPending = 32 } = {}) {
  const entries = new Map(), pending = new Map();
  let bytes = 0, generation = 0;
  const remove = key => { const row = entries.get(key); if (row) { bytes -= row.bytes; entries.delete(key); } };
  const wait = (promise, signal) => {
    if (!signal) return promise;
    signal.throwIfAborted();
    return new Promise((resolve, reject) => {
      const abort = () => reject(signal.reason || Error('Lookup cancelled'));
      signal.addEventListener('abort', abort, { once: true });
      promise.then(resolve, reject).finally(() => signal.removeEventListener('abort', abort));
    });
  };
  return {
    clear() { generation++; entries.clear(); bytes = 0; },
    async get(key, load, ttl, signal) {
      signal?.throwIfAborted();
      const now = Date.now();
      for (const [id, row] of entries) if (row.expires <= now) remove(id);
      const hit = entries.get(key);
      if (hit) { entries.delete(key); entries.set(key, hit); return JSON.parse(hit.value); }
      let flight = pending.get(key);
      if (!flight) {
        if (pending.size >= maxPending) throw Object.assign(Error('Lookup queue is full'), { status: 503, code: 'lookup_queue_full' });
        const version = generation;
        flight = Promise.resolve().then(load).then(result => {
          const value = JSON.stringify(result), size = value ? new TextEncoder().encode(value).byteLength : 0;
          // Progressive snapshots must not freeze an incomplete provider list.
          if (version === generation && size && size <= maxEntryBytes && size <= maxBytes && !result?.partial && result?.complete !== false) {
            while (entries.size && (entries.size >= maxEntries || bytes + size > maxBytes)) remove(entries.keys().next().value);
            const empty = Array.isArray(result) ? !result.length : Array.isArray(result?.chapters) && !result.chapters.length;
            entries.set(key, { value, bytes: size, expires: Date.now() + Math.min(ttl, empty ? 30000 : ttl) }); bytes += size;
          }
          return result;
        }).finally(() => pending.delete(key));
        pending.set(key, flight);
      }
      // Each client owns its cancellation. A cancelled waiter cannot cancel
      // another client's shared lookup; load has its own bounded deadline.
      return wait(flight, signal);
    },
  };
}

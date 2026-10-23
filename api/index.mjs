import { neon } from '@neondatabase/serverless';
import { put, get, del } from '@vercel/blob';
import { Readable } from 'node:stream';
import { createServer } from '../src/core.mjs';
import { postgresStore } from '../src/storage.mjs';
import { interpreter } from '../dist/interpreter.mjs';
import { nodeNetwork } from '../src/node-network.mjs';
export default async function handler(req, res) {
  try {
  const app = await createServer({ platform: 'vercel', store: postgresStore(neon(process.env.DATABASE_URL)),
    secret: process.env.SERVER_SECRET, bootstrapSecret: process.env.BOOTSTRAP_SECRET, interpreter, network: nodeNetwork(),
    artifacts: { put: (key, value) => put(`extensions/${key}`, value, { access: 'private', addRandomSuffix: false }),
      get: async key => { const result = await get(`extensions/${key}`, { access: 'private' }); if (!result) throw Error('Extension artifact missing'); return new Response(result.stream).text(); },
      remove: key => del(`extensions/${key}`) } });
  const abort = new AbortController(); req.on('aborted', () => abort.abort());
  res.on('close', () => { if (!res.writableEnded) abort.abort(); });
  const target = new URL(req.url, process.env.PUBLIC_URL);
  if (target.searchParams.has('serverPath')) {
    target.pathname = '/api/server/' + target.searchParams.get('serverPath');
    target.searchParams.delete('serverPath');
  }
  const parsedBody = req.body !== undefined ? (typeof req.body === 'string' || Buffer.isBuffer(req.body) ? req.body : JSON.stringify(req.body)) : Readable.toWeb(req);
  const request = new Request(target, { method: req.method, headers: req.headers, signal: abort.signal,
    ...(!['GET', 'HEAD'].includes(req.method) ? { body: parsedBody, duplex: 'half' } : {}) });
  const response = await app(request); res.writeHead(response.status, Object.fromEntries(response.headers));
  if (response.body) Readable.fromWeb(response.body).on('error', () => res.destroy()).pipe(res); else res.end();
  } catch {
    if (res.headersSent) { res.destroy(); return; }
    res.writeHead(500, { 'content-type': 'application/json', 'cache-control': 'no-store' });
    res.end(JSON.stringify({ success: false, error: { code: 'deployment_configuration', message: 'Check this deployment’s database, Blob storage, PUBLIC_URL and secrets.' } }));
  }
}

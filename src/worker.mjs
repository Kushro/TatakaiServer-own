import { createServer } from './core.mjs';
import { d1Store } from './storage.mjs';
import { interpreter } from '../dist/interpreter-worker.mjs';
import { d1Artifacts } from './d1-artifacts.mjs';
export default {
  async fetch(request, env) {
    const handler = await createServer({ platform: 'workers', store: d1Store(env.DB), secret: env.SERVER_SECRET,
      bootstrapSecret: env.BOOTSTRAP_SECRET, interpreter,
      artifacts: env.ARTIFACTS ? { put: (key, value) => env.ARTIFACTS.put(key, value), get: async key => {
        const object = await env.ARTIFACTS.get(key); if (!object) throw Error('Extension artifact missing'); return object.text();
      }, remove: key => env.ARTIFACTS.delete(key) } : d1Artifacts(env.DB),
      staticResponse: request => env.ASSETS.fetch(request) });
    return handler(request);
  },
};

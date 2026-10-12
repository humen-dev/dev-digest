/**
 * OWASP A06 — the CI routes that hit GitHub carry a per-route rate limit. `buildApp`
 * skips the rate-limit plugin when NODE_ENV is "test", so this mounts the real CI
 * routes on a bare Fastify with the plugin registered and a stub container.
 */
import { describe, expect, it } from 'vitest';
import Fastify from 'fastify';
import rateLimit from '@fastify/rate-limit';
import { serializerCompiler, validatorCompiler } from 'fastify-type-provider-zod';
import ciRoutes from '../src/modules/ci/routes.js';
import type { Container } from '../src/platform/container.js';

async function mk() {
  const app = Fastify();
  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);
  await app.register(rateLimit, { max: 1000, timeWindow: '1 minute' });
  const container = {
    auth: { currentUser: async () => ({ id: 'u' }), currentWorkspace: async () => ({ id: 'w' }) },
    ciRefreshService: {
      refresh: async () => ({ checked: 0, ingested: 0, failed: 0, skipped_debounced: 0, degraded: false, reason: null }),
    },
    ciService: {
      archive: async () => new Uint8Array(),
      exportToGithub: async () => ({ status: 200, body: {} }),
    },
  } as unknown as Container;
  app.decorate('container', container);
  await app.register(ciRoutes);
  await app.ready();
  return app;
}

describe('CI route rate limits (S-1)', () => {
  it('answers 429 on the 11th POST /ci/refresh within a minute', async () => {
    const app = await mk();
    const codes: number[] = [];
    for (let i = 0; i < 11; i++) codes.push((await app.inject({ method: 'POST', url: '/ci/refresh', payload: { force: true } })).statusCode);
    expect(codes.slice(0, 10).every((c) => c === 200)).toBe(true);
    expect(codes[10]).toBe(429);
    await app.close();
  });

  it('answers 429 on the 11th POST /agents/:id/export-ci/archive within a minute', async () => {
    const app = await mk();
    const id = '11111111-1111-4111-8111-111111111111';
    const codes: number[] = [];
    for (let i = 0; i < 11; i++) {
      codes.push((await app.inject({ method: 'POST', url: `/agents/${id}/export-ci/archive`, payload: { repo: 'a/b' } })).statusCode);
    }
    expect(codes[10]).toBe(429);
    expect(codes[9]).not.toBe(429);
    await app.close();
  });
});

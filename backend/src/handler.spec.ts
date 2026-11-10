import type { APIGatewayProxyEventV2 } from 'aws-lambda';
import { beforeEach, describe, expect, it } from 'vitest';
import { createHandler, MAX_PRESETS_PER_PROFILE } from './handler.js';
import { hashKey, KeyRecord, Store, StoredPreset } from './store.js';

const KEY_A = 'a'.repeat(43);
const KEY_B = 'b'.repeat(43);
const NOW = new Date('2026-01-01T00:00:00.000Z');

class MemoryStore implements Store {
  keys = new Map<string, KeyRecord>();
  presets = new Map<string, Map<string, StoredPreset>>();

  async getKey(keyHash: string) {
    return this.keys.get(keyHash);
  }
  async listPresets(profile: string) {
    return [...(this.presets.get(profile)?.values() ?? [])];
  }
  async putPreset(profile: string, preset: StoredPreset, maxPresets: number) {
    if (!this.presets.has(profile)) {
      this.presets.set(profile, new Map());
    }
    const presets = this.presets.get(profile)!;
    if (!presets.has(preset.name) && presets.size >= maxPresets) {
      return false;
    }
    presets.set(preset.name, preset);
    return true;
  }
  async deletePreset(profile: string, name: string) {
    this.presets.get(profile)?.delete(name);
  }
}

function event(
  method: string,
  path: string,
  options: { key?: string; body?: unknown; rawBody?: string; query?: Record<string, string> } = {},
): APIGatewayProxyEventV2 {
  return {
    rawPath: path,
    headers: options.key ? { authorization: `Bearer ${options.key}` } : {},
    queryStringParameters: options.query,
    body: options.rawBody ?? (options.body === undefined ? undefined : JSON.stringify(options.body)),
    isBase64Encoded: false,
    requestContext: { http: { method } },
  } as unknown as APIGatewayProxyEventV2;
}

const preset = { name: 'Tabata', rounds: 8, work: 20, rest: 10, playSound: true };

describe('handler', () => {
  let store: MemoryStore;
  let handler: ReturnType<typeof createHandler>;

  beforeEach(() => {
    store = new MemoryStore();
    store.keys.set(hashKey(KEY_A), { profile: 'alice', label: 'laptop', createdAt: '' });
    store.keys.set(hashKey(KEY_B), { profile: 'bob', label: 'phone', createdAt: '' });
    handler = createHandler(store, () => NOW);
  });

  describe('authentication', () => {
    it('rejects requests without a key', async () => {
      expect((await handler(event('GET', '/me'))).statusCode).toBe(401);
    });

    it('rejects an unknown key', async () => {
      expect((await handler(event('GET', '/me', { key: 'z'.repeat(43) }))).statusCode).toBe(401);
    });

    it('rejects a key that is too short', async () => {
      expect((await handler(event('GET', '/me', { key: 'short' }))).statusCode).toBe(401);
    });

    it('does not store keys in plain text', () => {
      expect([...store.keys.keys()]).not.toContain(KEY_A);
    });

    it('returns the profile for a valid key', async () => {
      const res = await handler(event('GET', '/me', { key: KEY_A }));
      expect(res.statusCode).toBe(200);
      expect(JSON.parse(res.body!)).toEqual({ profile: 'alice', label: 'laptop' });
    });
  });

  describe('presets', () => {
    it('saves and lists presets with a server timestamp', async () => {
      const put = await handler(event('PUT', '/presets', { key: KEY_A, body: preset }));
      expect(put.statusCode).toBe(200);

      const res = await handler(event('GET', '/presets', { key: KEY_A }));
      expect(JSON.parse(res.body!)).toEqual({
        presets: [{ ...preset, updatedAt: NOW.toISOString() }],
      });
    });

    it('keeps profiles isolated from each other', async () => {
      await handler(event('PUT', '/presets', { key: KEY_A, body: preset }));

      const res = await handler(event('GET', '/presets', { key: KEY_B }));
      expect(JSON.parse(res.body!)).toEqual({ presets: [] });

      await handler(event('DELETE', '/presets', { key: KEY_B, query: { name: 'Tabata' } }));
      expect(await store.listPresets('alice')).toHaveLength(1);
    });

    it('overwrites a preset with the same name', async () => {
      await handler(event('PUT', '/presets', { key: KEY_A, body: preset }));
      await handler(event('PUT', '/presets', { key: KEY_A, body: { ...preset, rounds: 4 } }));

      const presets = await store.listPresets('alice');
      expect(presets).toHaveLength(1);
      expect(presets[0].rounds).toBe(4);
    });

    it('deletes a preset by name', async () => {
      await handler(event('PUT', '/presets', { key: KEY_A, body: preset }));
      const res = await handler(event('DELETE', '/presets', { key: KEY_A, query: { name: 'Tabata' } }));

      expect(res.statusCode).toBe(204);
      expect(await store.listPresets('alice')).toEqual([]);
    });

    it('requires a name to delete', async () => {
      expect((await handler(event('DELETE', '/presets', { key: KEY_A }))).statusCode).toBe(400);
    });

    it('rejects invalid presets', async () => {
      const res = await handler(event('PUT', '/presets', { key: KEY_A, body: { ...preset, rounds: -1 } }));
      expect(res.statusCode).toBe(400);
    });

    it('rejects malformed JSON', async () => {
      const res = await handler(event('PUT', '/presets', { key: KEY_A, rawBody: '{not json' }));
      expect(res.statusCode).toBe(400);
    });

    it('rejects oversized bodies', async () => {
      const res = await handler(event('PUT', '/presets', { key: KEY_A, rawBody: 'x'.repeat(65 * 1024) }));
      expect(res.statusCode).toBe(413);
    });

    it('accepts a long exercise list (100 lines of 80 characters)', async () => {
      const exercises = Array.from({ length: 100 }, () => 'é'.repeat(80)).join('\n');
      const res = await handler(event('PUT', '/presets', { key: KEY_A, body: { ...preset, exercises } }));
      expect(res.statusCode).toBe(200);
    });

    it('accepts 100 presets in one profile', async () => {
      for (let i = 0; i < 100; i++) {
        const res = await handler(event('PUT', '/presets', { key: KEY_A, body: { ...preset, name: `w${i}` } }));
        expect(res.statusCode).toBe(200);
      }
      const res = await handler(event('GET', '/presets', { key: KEY_A }));
      expect(JSON.parse(res.body!).presets).toHaveLength(100);
    });

    it('caps the number of presets per profile', async () => {
      for (let i = 0; i < MAX_PRESETS_PER_PROFILE; i++) {
        await store.putPreset('alice', { ...preset, name: `p${i}`, updatedAt: '' }, MAX_PRESETS_PER_PROFILE);
      }
      const res = await handler(event('PUT', '/presets', { key: KEY_A, body: { ...preset, name: 'one more' } }));
      expect(res.statusCode).toBe(409);

      const update = await handler(event('PUT', '/presets', { key: KEY_A, body: { ...preset, name: 'p0' } }));
      expect(update.statusCode).toBe(200);
    });
  });

  it('returns 404 for unknown routes', async () => {
    expect((await handler(event('GET', '/admin', { key: KEY_A }))).statusCode).toBe(404);
    expect((await handler(event('POST', '/presets', { key: KEY_A }))).statusCode).toBe(404);
  });

  it('returns 503 when the table is throttled', async () => {
    store.listPresets = () =>
      Promise.reject(Object.assign(new Error('slow down'), { name: 'ProvisionedThroughputExceededException' }));
    expect((await handler(event('GET', '/presets', { key: KEY_A }))).statusCode).toBe(503);
  });

  it('returns 500 without internals when the store fails', async () => {
    store.listPresets = () => Promise.reject(new Error('secret detail'));
    const res = await handler(event('GET', '/presets', { key: KEY_A }));
    expect(res.statusCode).toBe(500);
    expect(res.body).not.toContain('secret detail');
  });
});

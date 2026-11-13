import type { APIGatewayProxyEventV2 } from 'aws-lambda';
import { beforeEach, describe, expect, it } from 'vitest';
import { createHandler, MAX_FOLDERS_PER_PROFILE, MAX_PRESETS_PER_PROFILE } from './handler.js';
import { hashKey, KeyRecord, Library, Store, StoredFolder, StoredPreset } from './store.js';

const KEY_A = 'a'.repeat(43);
const KEY_B = 'b'.repeat(43);
const NOW = new Date('2026-01-01T00:00:00.000Z');

class MemoryStore implements Store {
  keys = new Map<string, KeyRecord>();
  presets = new Map<string, Map<string, StoredPreset>>();
  folders = new Map<string, Map<string, StoredFolder>>();

  private presetsOf(profile: string) {
    if (!this.presets.has(profile)) {
      this.presets.set(profile, new Map());
    }
    return this.presets.get(profile)!;
  }
  private foldersOf(profile: string) {
    if (!this.folders.has(profile)) {
      this.folders.set(profile, new Map());
    }
    return this.folders.get(profile)!;
  }

  async getKey(keyHash: string) {
    return this.keys.get(keyHash);
  }
  async listLibrary(profile: string): Promise<Library> {
    return { folders: [...this.foldersOf(profile).values()], presets: [...this.presetsOf(profile).values()] };
  }
  async putPreset(profile: string, preset: StoredPreset, maxPresets: number) {
    const presets = this.presetsOf(profile);
    if (!presets.has(preset.id) && presets.size >= maxPresets) {
      return false;
    }
    presets.set(preset.id, preset);
    return true;
  }
  async deletePreset(profile: string, id: string) {
    this.presetsOf(profile).delete(id);
  }
  async folderExists(profile: string, id: string) {
    return this.foldersOf(profile).has(id);
  }
  async putFolder(profile: string, folder: StoredFolder, maxFolders: number) {
    const folders = this.foldersOf(profile);
    if (!folders.has(folder.id) && folders.size >= maxFolders) {
      return false;
    }
    folders.set(folder.id, folder);
    return true;
  }
  async renameFolder(profile: string, folder: StoredFolder) {
    const folders = this.foldersOf(profile);
    if (!folders.has(folder.id)) {
      return false;
    }
    folders.set(folder.id, folder);
    return true;
  }
  async deleteFolder(profile: string, id: string) {
    const presets = this.presetsOf(profile);
    for (const preset of [...presets.values()]) {
      if (preset.folderId === id) {
        presets.delete(preset.id);
      }
    }
    this.foldersOf(profile).delete(id);
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

const preset = { id: 'p1', folderId: 'default', name: 'Tabata', rounds: 8, work: 20, rest: 10, playSound: true };
const folder = { id: 'f1', name: 'Kettlebell' };

function parse(res: { body?: string }) {
  return JSON.parse(res.body!);
}

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
      expect(parse(res)).toEqual({ profile: 'alice', label: 'laptop' });
    });
  });

  describe('library', () => {
    it('returns the folders and presets of the profile', async () => {
      await handler(event('PUT', '/folders', { key: KEY_A, body: folder }));
      await handler(event('PUT', '/presets', { key: KEY_A, body: { ...preset, folderId: 'f1' } }));

      const res = await handler(event('GET', '/library', { key: KEY_A }));

      expect(res.statusCode).toBe(200);
      expect(parse(res)).toEqual({
        folders: [{ ...folder, updatedAt: NOW.toISOString() }],
        presets: [{ ...preset, folderId: 'f1', updatedAt: NOW.toISOString() }],
      });
    });

    it('is empty for a new profile', async () => {
      const res = await handler(event('GET', '/library', { key: KEY_B }));
      expect(parse(res)).toEqual({ folders: [], presets: [] });
    });
  });

  describe('presets', () => {
    it('saves a preset with a server timestamp', async () => {
      const put = await handler(event('PUT', '/presets', { key: KEY_A, body: preset }));

      expect(put.statusCode).toBe(200);
      expect(parse(put)).toEqual({ preset: { ...preset, updatedAt: NOW.toISOString() } });
    });

    it('keeps profiles isolated from each other', async () => {
      await handler(event('PUT', '/presets', { key: KEY_A, body: preset }));

      const res = await handler(event('GET', '/library', { key: KEY_B }));
      expect(parse(res).presets).toEqual([]);

      await handler(event('DELETE', '/presets', { key: KEY_B, query: { id: 'p1' } }));
      expect((await store.listLibrary('alice')).presets).toHaveLength(1);
    });

    it('replaces a preset with the same id, also when it is renamed', async () => {
      await handler(event('PUT', '/presets', { key: KEY_A, body: preset }));
      await handler(event('PUT', '/presets', { key: KEY_A, body: { ...preset, name: 'Tabata EMOM', rounds: 4 } }));

      const { presets } = await store.listLibrary('alice');
      expect(presets).toHaveLength(1);
      expect(presets[0]).toMatchObject({ name: 'Tabata EMOM', rounds: 4 });
    });

    it('keeps presets with the same name and different ids', async () => {
      await handler(event('PUT', '/presets', { key: KEY_A, body: preset }));
      await handler(event('PUT', '/presets', { key: KEY_A, body: { ...preset, id: 'p2' } }));

      expect((await store.listLibrary('alice')).presets).toHaveLength(2);
    });

    it('rejects a preset in a folder that does not exist', async () => {
      const res = await handler(event('PUT', '/presets', { key: KEY_A, body: { ...preset, folderId: 'nope' } }));

      expect(res.statusCode).toBe(404);
      expect(parse(res)).toEqual({ error: 'Folder not found' });
      expect((await store.listLibrary('alice')).presets).toEqual([]);
    });

    it('rejects a preset saved into a deleted folder', async () => {
      await handler(event('PUT', '/folders', { key: KEY_A, body: folder }));
      await handler(event('DELETE', '/folders', { key: KEY_A, query: { id: 'f1' } }));

      const res = await handler(event('PUT', '/presets', { key: KEY_A, body: { ...preset, folderId: 'f1' } }));
      expect(res.statusCode).toBe(404);
    });

    it("rejects a preset in another profile's folder", async () => {
      await handler(event('PUT', '/folders', { key: KEY_B, body: folder }));

      const res = await handler(event('PUT', '/presets', { key: KEY_A, body: { ...preset, folderId: 'f1' } }));
      expect(res.statusCode).toBe(404);
    });

    it('deletes a preset by id', async () => {
      await handler(event('PUT', '/presets', { key: KEY_A, body: preset }));
      const res = await handler(event('DELETE', '/presets', { key: KEY_A, query: { id: 'p1' } }));

      expect(res.statusCode).toBe(204);
      expect((await store.listLibrary('alice')).presets).toEqual([]);
    });

    it('requires an id to delete', async () => {
      expect((await handler(event('DELETE', '/presets', { key: KEY_A }))).statusCode).toBe(400);
      expect(
        (await handler(event('DELETE', '/presets', { key: KEY_A, query: { name: 'Tabata' } }))).statusCode,
      ).toBe(400);
    });

    it('rejects invalid presets', async () => {
      const res = await handler(event('PUT', '/presets', { key: KEY_A, body: { ...preset, rounds: -1 } }));
      expect(res.statusCode).toBe(400);
    });

    it('rejects a preset without an id', async () => {
      const { id: _id, ...withoutId } = preset;
      const res = await handler(event('PUT', '/presets', { key: KEY_A, body: withoutId }));
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
        const res = await handler(event('PUT', '/presets', { key: KEY_A, body: { ...preset, id: `w${i}` } }));
        expect(res.statusCode).toBe(200);
      }
      const res = await handler(event('GET', '/library', { key: KEY_A }));
      expect(parse(res).presets).toHaveLength(100);
    });

    it('caps the number of presets per profile', async () => {
      for (let i = 0; i < MAX_PRESETS_PER_PROFILE; i++) {
        await store.putPreset('alice', { ...preset, id: `p${i}`, updatedAt: '' }, MAX_PRESETS_PER_PROFILE);
      }
      const res = await handler(event('PUT', '/presets', { key: KEY_A, body: { ...preset, id: 'one-more' } }));
      expect(res.statusCode).toBe(409);
      expect(parse(res)).toEqual({ error: `A profile can hold at most ${MAX_PRESETS_PER_PROFILE} presets` });

      const update = await handler(event('PUT', '/presets', { key: KEY_A, body: { ...preset, id: 'p0' } }));
      expect(update.statusCode).toBe(200);
    });
  });

  describe('folders', () => {
    it('creates a folder with a server timestamp and a trimmed name', async () => {
      const res = await handler(event('PUT', '/folders', { key: KEY_A, body: { id: 'f1', name: '  Kettlebell ' } }));

      expect(res.statusCode).toBe(200);
      expect(parse(res)).toEqual({ folder: { ...folder, updatedAt: NOW.toISOString() } });
    });

    it('renames a folder with the same id', async () => {
      await handler(event('PUT', '/folders', { key: KEY_A, body: folder }));
      await handler(event('PUT', '/folders', { key: KEY_A, body: { ...folder, name: 'KB' } }));

      const { folders } = await store.listLibrary('alice');
      expect(folders).toHaveLength(1);
      expect(folders[0].name).toBe('KB');
    });

    it('renames an existing folder with PATCH', async () => {
      await handler(event('PUT', '/folders', { key: KEY_A, body: folder }));
      const res = await handler(event('PATCH', '/folders', { key: KEY_A, body: { ...folder, name: ' KB ' } }));

      expect(res.statusCode).toBe(200);
      expect(parse(res)).toEqual({ folder: { ...folder, name: 'KB', updatedAt: NOW.toISOString() } });
      expect((await store.listLibrary('alice')).folders.map((f) => f.name)).toEqual(['KB']);
    });

    it('does not bring back a deleted folder on rename', async () => {
      const res = await handler(event('PATCH', '/folders', { key: KEY_A, body: folder }));

      expect(res.statusCode).toBe(404);
      expect(parse(res)).toEqual({ error: 'Folder not found' });
      expect((await store.listLibrary('alice')).folders).toEqual([]);
    });

    it('rejects invalid renames', async () => {
      expect((await handler(event('PATCH', '/folders', { key: KEY_A, body: { id: 'f1', name: '' } }))).statusCode).toBe(
        400,
      );
      expect((await handler(event('PATCH', '/folders', { key: KEY_A, rawBody: '{' }))).statusCode).toBe(400);
    });

    it('rejects invalid folders', async () => {
      for (const body of [{ id: 'f1', name: '  ' }, { id: 'default', name: 'X' }, { name: 'X' }]) {
        expect((await handler(event('PUT', '/folders', { key: KEY_A, body }))).statusCode).toBe(400);
      }
      const malformed = await handler(event('PUT', '/folders', { key: KEY_A, rawBody: '{not json' }));
      expect(malformed.statusCode).toBe(400);
    });

    it('caps the number of folders per profile', async () => {
      for (let i = 0; i < MAX_FOLDERS_PER_PROFILE; i++) {
        await store.putFolder('alice', { id: `f${i}`, name: `F${i}`, updatedAt: '' }, MAX_FOLDERS_PER_PROFILE);
      }
      const res = await handler(event('PUT', '/folders', { key: KEY_A, body: { id: 'one-more', name: 'X' } }));
      expect(res.statusCode).toBe(409);
      expect(parse(res)).toEqual({ error: 'A profile can hold at most 50 folders' });

      const rename = await handler(event('PUT', '/folders', { key: KEY_A, body: { id: 'f0', name: 'Renamed' } }));
      expect(rename.statusCode).toBe(200);
    });

    it('deletes a folder by id', async () => {
      await handler(event('PUT', '/folders', { key: KEY_A, body: folder }));
      const res = await handler(event('DELETE', '/folders', { key: KEY_A, query: { id: 'f1' } }));

      expect(res.statusCode).toBe(204);
      expect((await store.listLibrary('alice')).folders).toEqual([]);
    });

    it('deletes the presets in a deleted folder', async () => {
      await handler(event('PUT', '/folders', { key: KEY_A, body: folder }));
      await handler(event('PUT', '/presets', { key: KEY_A, body: { ...preset, folderId: 'f1' } }));
      await handler(event('PUT', '/presets', { key: KEY_A, body: { ...preset, id: 'p2' } }));

      await handler(event('DELETE', '/folders', { key: KEY_A, query: { id: 'f1' } }));

      const library = parse(await handler(event('GET', '/library', { key: KEY_A })));
      expect(library.folders).toEqual([]);
      expect(library.presets.map((p: StoredPreset) => [p.id, p.folderId])).toEqual([['p2', 'default']]);
    });

    it('requires an id to delete and refuses the default folder', async () => {
      expect((await handler(event('DELETE', '/folders', { key: KEY_A }))).statusCode).toBe(400);
      const res = await handler(event('DELETE', '/folders', { key: KEY_A, query: { id: 'default' } }));
      expect(res.statusCode).toBe(400);
    });
  });

  it('returns 404 for unknown routes', async () => {
    expect((await handler(event('GET', '/admin', { key: KEY_A }))).statusCode).toBe(404);
    expect((await handler(event('POST', '/presets', { key: KEY_A }))).statusCode).toBe(404);
    expect((await handler(event('GET', '/presets', { key: KEY_A }))).statusCode).toBe(404);
    expect((await handler(event('GET', '/folders', { key: KEY_A }))).statusCode).toBe(404);
  });

  it('returns 503 when the table is throttled', async () => {
    store.listLibrary = () =>
      Promise.reject(Object.assign(new Error('slow down'), { name: 'ProvisionedThroughputExceededException' }));
    expect((await handler(event('GET', '/library', { key: KEY_A }))).statusCode).toBe(503);
  });

  it('returns 500 without internals when the store fails', async () => {
    store.listLibrary = () => Promise.reject(new Error('secret detail'));
    const res = await handler(event('GET', '/library', { key: KEY_A }));
    expect(res.statusCode).toBe(500);
    expect(res.body).not.toContain('secret detail');
  });
});

import { afterEach, describe, expect, it, vi } from 'vitest';
import { newId, uniqueName, upgradePresets } from './library';

const ID = /^[A-Za-z0-9-]{1,64}$/;

describe('newId', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('returns distinct ids the storage API accepts', () => {
    const a = newId();
    const b = newId();
    expect(a).toMatch(ID);
    expect(b).toMatch(ID);
    expect(a).not.toBe(b);
  });

  it('works without crypto.randomUUID (page served over plain HTTP)', () => {
    vi.stubGlobal('crypto', { getRandomValues: crypto.getRandomValues.bind(crypto) });
    const a = newId();
    const b = newId();
    expect(a).toMatch(ID);
    expect(a).not.toBe(b);
  });
});

describe('uniqueName', () => {
  it('keeps a free name', () => {
    expect(uniqueName('Tabata', [])).toBe('Tabata');
  });

  it('adds (2) on a case-insensitive clash', () => {
    expect(uniqueName('Tabata', ['tabata'])).toBe('Tabata (2)');
  });

  it('uses the first free number', () => {
    expect(uniqueName('Tabata', ['Tabata', 'Tabata (2)'])).toBe('Tabata (3)');
  });

  it('shortens the base so the suffix fits the limit', () => {
    const long = 'x'.repeat(100);
    const result = uniqueName(long, [long]);
    expect(result).toHaveLength(100);
    expect(result.endsWith(' (2)')).toBe(true);
  });
});

describe('upgradePresets', () => {
  it('gives presets without ids an id and the default folder', () => {
    const { presets, changed } = upgradePresets([{ name: 'A', rounds: 1, work: 1, rest: 0, playSound: true }]);
    expect(changed).toBe(true);
    expect(presets).toHaveLength(1);
    expect(presets[0].id).toMatch(ID);
    expect(presets[0].folderId).toBe('default');
    expect(presets[0].name).toBe('A');
  });

  it('drops entries that are not objects', () => {
    const preset = { id: 'p1', folderId: 'f1', name: 'A', rounds: 1, work: 1, rest: 0, playSound: true };
    const { presets, changed } = upgradePresets([null, 'x', 3, [], preset]);
    expect(changed).toBe(true);
    expect(presets).toEqual([preset]);
  });

  it('leaves upgraded presets unchanged', () => {
    const preset = { id: 'p1', folderId: 'f1', name: 'A', rounds: 1, work: 1, rest: 0, playSound: true };
    const { presets, changed } = upgradePresets([preset]);
    expect(changed).toBe(false);
    expect(presets).toEqual([preset]);
  });
});

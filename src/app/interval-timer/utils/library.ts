import { DEFAULT_FOLDER_ID, IntervalTimerConfig, PRESET_LIMITS } from '../types/interval-timer-config.interface';

/**
 * A new id for a preset or folder. `crypto.randomUUID` only exists in secure contexts, so a page opened over plain
 * HTTP on a LAN address falls back to random hex.
 */
export function newId(): string {
  if (typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * `name` if no entry of `taken` matches it (case-insensitively), else `"<name> (n)"` with the first free n ≥ 2,
 * shortening the base so the result fits `maxLength`.
 */
export function uniqueName(name: string, taken: readonly string[], maxLength: number = PRESET_LIMITS.name): string {
  const used = new Set(taken.map((t) => t.toLowerCase()));
  if (!used.has(name.toLowerCase())) {
    return name;
  }
  for (let n = 2; ; n++) {
    const suffix = ` (${n})`;
    const candidate = name.slice(0, maxLength - suffix.length).trimEnd() + suffix;
    if (!used.has(candidate.toLowerCase())) {
      return candidate;
    }
  }
}

/** Gives stored presets from before folders an id and the default folder. */
export function upgradePresets(raw: unknown[]): { presets: IntervalTimerConfig[]; changed: boolean } {
  let changed = false;
  const presets = raw.map((entry) => {
    const preset = entry as Partial<IntervalTimerConfig>;
    if (typeof preset.id === 'string' && typeof preset.folderId === 'string') {
      return preset as IntervalTimerConfig;
    }
    changed = true;
    return {
      ...preset,
      id: typeof preset.id === 'string' ? preset.id : newId(),
      folderId: typeof preset.folderId === 'string' ? preset.folderId : DEFAULT_FOLDER_ID,
    } as IntervalTimerConfig;
  });
  return { presets, changed };
}

/** Sort order for workouts and folders: by name, ignoring case and accents. */
export function byName(a: { name: string }, b: { name: string }): number {
  return a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });
}

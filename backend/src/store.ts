import { createHash } from 'node:crypto';

/** A preset as stored for a profile. Mirrors the frontend `IntervalTimerConfig`. */
export interface Preset {
  name: string;
  rounds: number;
  work: number;
  rest: number;
  playSound: boolean;
  exercises?: string;
  videoUrl?: string;
  description?: string;
  intro?: number;
}

export interface StoredPreset extends Preset {
  updatedAt: string;
}

export interface KeyRecord {
  profile: string;
  label: string;
  createdAt: string;
}

export interface Store {
  /** Looks up a key by the SHA-256 hash of its secret. */
  getKey(keyHash: string): Promise<KeyRecord | undefined>;
  listPresets(profile: string): Promise<StoredPreset[]>;
  /**
   * Creates or replaces a preset. Returns false, without saving, when the preset is new
   * and the profile already holds `maxPresets` presets.
   */
  putPreset(profile: string, preset: StoredPreset, maxPresets: number): Promise<boolean>;
  deletePreset(profile: string, name: string): Promise<void>;
}

export function hashKey(key: string): string {
  return createHash('sha256').update(key, 'utf8').digest('hex');
}

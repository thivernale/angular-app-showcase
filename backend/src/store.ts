import { createHash } from 'node:crypto';

/** Id of the built-in folder. It always exists and is never stored as a folder record. */
export const DEFAULT_FOLDER_ID = 'default';

/** A preset as stored for a profile. Mirrors the frontend `IntervalTimerConfig`. */
export interface Preset {
  id: string;
  folderId: string;
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

/** A user-defined folder. Mirrors the frontend `IntervalTimerFolder`. */
export interface Folder {
  id: string;
  name: string;
}

export interface StoredFolder extends Folder {
  updatedAt: string;
}

export interface Library {
  folders: StoredFolder[];
  presets: StoredPreset[];
}

export interface KeyRecord {
  profile: string;
  label: string;
  createdAt: string;
}

export interface Store {
  /** Looks up a key by the SHA-256 hash of its secret. */
  getKey(keyHash: string): Promise<KeyRecord | undefined>;
  /** All folders (the default folder excluded) and presets of a profile. */
  listLibrary(profile: string): Promise<Library>;
  /**
   * Creates or replaces a preset, keyed by its id. Returns false, without saving, when the preset is new
   * and the profile already holds `maxPresets` presets.
   */
  putPreset(profile: string, preset: StoredPreset, maxPresets: number): Promise<boolean>;
  /** Deletes a preset by id; does nothing if it is missing. */
  deletePreset(profile: string, id: string): Promise<void>;
  folderExists(profile: string, id: string): Promise<boolean>;
  /**
   * Creates or renames a folder. Returns false, without saving, when the folder is new
   * and the profile already holds `maxFolders` folders.
   */
  putFolder(profile: string, folder: StoredFolder, maxFolders: number): Promise<boolean>;
  /** Deletes the folder's presets, then the folder; does nothing if it is missing. */
  deleteFolder(profile: string, id: string): Promise<void>;
}

export function hashKey(key: string): string {
  return createHash('sha256').update(key, 'utf8').digest('hex');
}

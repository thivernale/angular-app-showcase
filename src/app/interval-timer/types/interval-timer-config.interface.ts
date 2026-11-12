/** Maximum text lengths, matching what the cloud storage API accepts (backend/src/validate.ts). */
export const PRESET_LIMITS = {
  name: 100,
  exercises: 10_000,
  videoUrl: 500,
  description: 500,
  folderName: 40,
} as const;

/** The folder every workout lands in unless the user picks another; always present, never stored. */
export const DEFAULT_FOLDER_ID = 'default';
export const DEFAULT_FOLDER_NAME = 'My workouts';
/** Folders per storage, not counting the default folder (matches the cloud storage API). */
export const MAX_FOLDERS = 50;

export interface IntervalTimerConfig {
  /** Generated on the device; names may repeat across folders. */
  id: string;
  folderId: string;
  name: string;
  rounds: number;
  work: number;
  rest: number;
  playSound: boolean;
  exercises?: string;
  videoUrl?: string;
  /** Free-text notes (equipment etc.), shown in the setup only. */
  description?: string;
  intro?: number;
}

export interface IntervalTimerFolder {
  id: string;
  name: string;
}

export interface IntervalTimerLibrary {
  /** User folders; never contains the default folder. */
  folders: IntervalTimerFolder[];
  presets: IntervalTimerConfig[];
}

/** Maximum text lengths, matching what the cloud storage API accepts (backend/src/validate.ts). */
export const PRESET_LIMITS = {
  name: 100,
  exercises: 10_000,
  videoUrl: 500,
  description: 500,
} as const;

export interface IntervalTimerConfig {
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

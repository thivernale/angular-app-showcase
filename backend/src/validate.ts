import { Preset } from './store.js';

// Keep the length limits in sync with PRESET_LIMITS in the frontend (interval-timer-config.interface.ts).
export const MAX_NAME_LENGTH = 100;
export const MAX_EXERCISES_LENGTH = 10_000;
/** Room for the longest preset even when every character takes 4 bytes in UTF-8. */
export const MAX_BODY_BYTES = 64 * 1024;
export const MAX_VIDEO_URL_LENGTH = 500;
export const MAX_NUMBER = 100_000;

export type ValidationResult = { ok: true; preset: Preset } | { ok: false; error: string };

function isBoundedNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= MAX_NUMBER;
}

/** Validates a preset body and returns a copy with only the known fields. */
export function validatePreset(input: unknown): ValidationResult {
  if (typeof input !== 'object' || input === null || Array.isArray(input)) {
    return { ok: false, error: 'Body must be a JSON object' };
  }
  const body = input as Record<string, unknown>;

  const name = typeof body['name'] === 'string' ? body['name'].trim() : '';
  if (name.length === 0 || name.length > MAX_NAME_LENGTH) {
    return { ok: false, error: `name must be 1-${MAX_NAME_LENGTH} characters` };
  }
  for (const field of ['rounds', 'work', 'rest'] as const) {
    if (!isBoundedNumber(body[field])) {
      return { ok: false, error: `${field} must be a number between 0 and ${MAX_NUMBER}` };
    }
  }
  if (typeof body['playSound'] !== 'boolean') {
    return { ok: false, error: 'playSound must be a boolean' };
  }

  const preset: Preset = {
    name,
    rounds: body['rounds'] as number,
    work: body['work'] as number,
    rest: body['rest'] as number,
    playSound: body['playSound'],
  };

  if (body['intro'] !== undefined) {
    if (!isBoundedNumber(body['intro'])) {
      return { ok: false, error: `intro must be a number between 0 and ${MAX_NUMBER}` };
    }
    preset.intro = body['intro'];
  }
  if (body['exercises'] !== undefined) {
    if (typeof body['exercises'] !== 'string' || body['exercises'].length > MAX_EXERCISES_LENGTH) {
      return { ok: false, error: `exercises must be a string of at most ${MAX_EXERCISES_LENGTH} characters` };
    }
    preset.exercises = body['exercises'];
  }
  if (body['videoUrl'] !== undefined) {
    if (typeof body['videoUrl'] !== 'string' || body['videoUrl'].length > MAX_VIDEO_URL_LENGTH) {
      return { ok: false, error: `videoUrl must be a string of at most ${MAX_VIDEO_URL_LENGTH} characters` };
    }
    preset.videoUrl = body['videoUrl'];
  }

  return { ok: true, preset };
}

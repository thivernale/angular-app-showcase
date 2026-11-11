import { describe, expect, it } from 'vitest';
import { MAX_DESCRIPTION_LENGTH, MAX_EXERCISES_LENGTH, MAX_NAME_LENGTH, MAX_VIDEO_URL_LENGTH, validatePreset } from './validate.js';

const valid = { name: 'Tabata', rounds: 8, work: 20, rest: 10, playSound: true };

describe('validatePreset', () => {
  it('accepts a minimal preset', () => {
    expect(validatePreset(valid)).toEqual({ ok: true, preset: valid });
  });

  it('keeps optional fields and drops unknown ones', () => {
    const result = validatePreset({
      ...valid,
      intro: 5,
      exercises: 'Squats',
      videoUrl: 'https://youtu.be/x',
      description: 'Kettlebell 16 kg',
      admin: true,
    });
    expect(result).toEqual({
      ok: true,
      preset: {
        ...valid,
        intro: 5,
        exercises: 'Squats',
        videoUrl: 'https://youtu.be/x',
        description: 'Kettlebell 16 kg',
      },
    });
  });

  it('trims the name', () => {
    expect(validatePreset({ ...valid, name: '  Tabata  ' })).toMatchObject({ preset: { name: 'Tabata' } });
  });

  it.each([
    ['not an object', 'x'],
    ['an array', []],
    ['null', null],
    ['an empty name', { ...valid, name: '   ' }],
    ['a long name', { ...valid, name: 'n'.repeat(MAX_NAME_LENGTH + 1) }],
    ['a negative number', { ...valid, work: -1 }],
    ['a huge number', { ...valid, rest: 1e9 }],
    ['a non-finite number', { ...valid, rounds: Infinity }],
    ['a string number', { ...valid, rounds: '8' }],
    ['a missing playSound', { ...valid, playSound: undefined }],
    ['an invalid intro', { ...valid, intro: 'soon' }],
    ['long exercises', { ...valid, exercises: 'e'.repeat(MAX_EXERCISES_LENGTH + 1) }],
    ['a long video URL', { ...valid, videoUrl: 'u'.repeat(MAX_VIDEO_URL_LENGTH + 1) }],
    ['a long description', { ...valid, description: 'd'.repeat(MAX_DESCRIPTION_LENGTH + 1) }],
    ['a non-string description', { ...valid, description: 42 }],
  ])('rejects %s', (_label, input) => {
    expect(validatePreset(input).ok).toBe(false);
  });
});

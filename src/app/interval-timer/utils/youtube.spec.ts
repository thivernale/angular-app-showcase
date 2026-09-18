import { describe, expect, it } from 'vitest';
import { extractYouTubeVideoId } from './youtube';

describe('extractYouTubeVideoId', () => {
  it('extracts the id from a standard watch URL', () => {
    expect(extractYouTubeVideoId('https://www.youtube.com/watch?v=lhAEvAOPsiU')).toBe('lhAEvAOPsiU');
  });

  it('extracts the id from a watch URL with extra query params', () => {
    expect(extractYouTubeVideoId('https://www.youtube.com/watch?v=lhAEvAOPsiU&t=42s&feature=share')).toBe('lhAEvAOPsiU');
  });

  it('extracts the id from a youtu.be short link', () => {
    expect(extractYouTubeVideoId('https://youtu.be/lhAEvAOPsiU')).toBe('lhAEvAOPsiU');
  });

  it('extracts the id from a youtu.be short link with query params', () => {
    expect(extractYouTubeVideoId('https://youtu.be/lhAEvAOPsiU?si=abc123')).toBe('lhAEvAOPsiU');
  });

  it('extracts the id from a shorts URL', () => {
    expect(extractYouTubeVideoId('https://www.youtube.com/shorts/lhAEvAOPsiU')).toBe('lhAEvAOPsiU');
  });

  it('extracts the id from an already-embed URL', () => {
    expect(extractYouTubeVideoId('https://www.youtube.com/embed/lhAEvAOPsiU?rel=0')).toBe('lhAEvAOPsiU');
  });

  it('handles the www.-less and m. host variants', () => {
    expect(extractYouTubeVideoId('https://youtube.com/watch?v=lhAEvAOPsiU')).toBe('lhAEvAOPsiU');
    expect(extractYouTubeVideoId('https://m.youtube.com/watch?v=lhAEvAOPsiU')).toBe('lhAEvAOPsiU');
  });

  it('returns null for an empty string', () => {
    expect(extractYouTubeVideoId('')).toBeNull();
  });

  it('returns null for a non-YouTube URL', () => {
    expect(extractYouTubeVideoId('https://example.com/watch?v=lhAEvAOPsiU')).toBeNull();
  });

  it('returns null for a malformed URL', () => {
    expect(extractYouTubeVideoId('not a url')).toBeNull();
  });
});

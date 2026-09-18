const YOUTUBE_URL_PATTERNS = [
  /^https?:\/\/(?:www\.|m\.)?youtube\.com\/watch\?(?:.*&)?v=([\w-]{11})(?:&.*)?$/,
  /^https?:\/\/(?:www\.|m\.)?youtube\.com\/shorts\/([\w-]{11})(?:\?.*)?$/,
  /^https?:\/\/(?:www\.|m\.)?youtube\.com\/embed\/([\w-]{11})(?:\?.*)?$/,
  /^https?:\/\/youtu\.be\/([\w-]{11})(?:\?.*)?$/,
];

export function extractYouTubeVideoId(url: string): string | null {
  for (const pattern of YOUTUBE_URL_PATTERNS) {
    const match = url.match(pattern);
    if (match) {
      return match[1];
    }
  }
  return null;
}

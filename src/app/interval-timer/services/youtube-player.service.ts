import { Injectable } from '@angular/core';
import { createYouTubePlayer, YouTubePlayerHandle } from '../utils/youtube-player';

@Injectable({
  providedIn: 'root',
})
export class YouTubePlayerService {
  create(element: HTMLElement, videoId: string, onReady?: () => void): Promise<YouTubePlayerHandle> {
    return createYouTubePlayer(element, videoId, onReady);
  }
}

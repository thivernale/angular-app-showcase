export interface YouTubePlayerHandle {
  play(): void;
  pause(): void;
  destroy(): void;
}

interface YTPlayer {
  playVideo(): void;
  pauseVideo(): void;
  seekTo(seconds: number, allowSeekAhead: boolean): void;
  destroy(): void;
}

interface YTPlayerEvent {
  target: YTPlayer;
}

interface YTPlayerStateChangeEvent extends YTPlayerEvent {
  data: number;
}

interface YTPlayerConfig {
  videoId: string;
  playerVars: {
    autoplay: number;
    mute: number;
    controls: number;
    rel: number;
  };
  events: {
    onReady: (event: YTPlayerEvent) => void;
    onStateChange: (event: YTPlayerStateChangeEvent) => void;
  };
}

interface YTNamespace {
  Player: new (element: HTMLElement, config: YTPlayerConfig) => YTPlayer;
  PlayerState: { ENDED: number };
}

declare global {
  interface Window {
    YT?: YTNamespace;
    onYouTubeIframeAPIReady?: () => void;
    // Cached on `window` (rather than a module-level variable) so the "already
    // loading" check is a real singleton regardless of module re-evaluation.
    __youtubeIframeApiLoadPromise?: Promise<void>;
  }
}

const IFRAME_API_SRC = 'https://www.youtube.com/iframe_api';

export function loadYouTubeIframeApi(): Promise<void> {
  if (window.YT?.Player) {
    return Promise.resolve();
  }

  if (!window.__youtubeIframeApiLoadPromise) {
    window.__youtubeIframeApiLoadPromise = new Promise<void>(resolve => {
      window.onYouTubeIframeAPIReady = () => resolve();

      const script = document.createElement('script');
      script.src = IFRAME_API_SRC;
      document.head.appendChild(script);
    });
  }

  return window.__youtubeIframeApiLoadPromise;
}

export async function createYouTubePlayer(
  element: HTMLElement,
  videoId: string,
  onReady?: () => void,
): Promise<YouTubePlayerHandle> {
  await loadYouTubeIframeApi();

  return new Promise<YouTubePlayerHandle>(resolve => {
    const player = new window.YT!.Player(element, {
      videoId,
      playerVars: {
        autoplay: 1,
        mute: 0,
        controls: 1,
        rel: 0,
      },
      events: {
        onReady: () => {
          onReady?.();
          resolve({
            play: () => player.playVideo(),
            pause: () => player.pauseVideo(),
            destroy: () => player.destroy(),
          });
        },
        onStateChange: (event) => {
          if (event.data === window.YT!.PlayerState.ENDED) {
            player.seekTo(0, true);
            player.playVideo();
          }
        },
      },
    });
  });
}

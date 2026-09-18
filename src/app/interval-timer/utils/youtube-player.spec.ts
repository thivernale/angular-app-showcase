import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createYouTubePlayer, loadYouTubeIframeApi } from './youtube-player';

class FakePlayer {
  static instances: FakePlayer[] = [];

  playVideo = vi.fn();
  pauseVideo = vi.fn();
  seekTo = vi.fn();
  destroy = vi.fn();

  readonly config: any;

  constructor(element: HTMLElement, config: any) {
    this.config = config;
    FakePlayer.instances.push(this);
  }

  fireReady() {
    this.config.events.onReady({ target: this });
  }

  fireStateChange(data: number) {
    this.config.events.onStateChange({ data, target: this });
  }
}

function stubYT() {
  vi.stubGlobal('YT', {
    Player: FakePlayer,
    PlayerState: { ENDED: 0, PLAYING: 1, PAUSED: 2 },
  });
}

beforeEach(() => {
  FakePlayer.instances = [];
  document.head.innerHTML = '';
  delete (window as any).YT;
  delete (window as any).onYouTubeIframeAPIReady;
  delete (window as any).__youtubeIframeApiLoadPromise;
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('loadYouTubeIframeApi', () => {
  it('resolves immediately without injecting a script when YT.Player already exists', async () => {
    stubYT();

    await loadYouTubeIframeApi();

    expect(document.querySelector('script[src="https://www.youtube.com/iframe_api"]')).toBeNull();
  });

  it('injects the iframe_api script and resolves once onYouTubeIframeAPIReady fires', async () => {
    const loadPromise = loadYouTubeIframeApi();

    const script = document.querySelector('script[src="https://www.youtube.com/iframe_api"]');
    expect(script).not.toBeNull();

    stubYT();
    window.onYouTubeIframeAPIReady!();

    await expect(loadPromise).resolves.toBeUndefined();
  });

  it('only injects the script once across multiple calls', () => {
    loadYouTubeIframeApi();
    loadYouTubeIframeApi();

    expect(document.querySelectorAll('script[src="https://www.youtube.com/iframe_api"]')).toHaveLength(1);
  });
});

describe('createYouTubePlayer', () => {
  beforeEach(() => {
    stubYT();
  });

  it('constructs a YT.Player targeting the given element with the video id and required playerVars', async () => {
    const element = document.createElement('div');

    const playerPromise = createYouTubePlayer(element, 'lhAEvAOPsiU');
    await Promise.resolve();
    FakePlayer.instances[0].fireReady();
    await playerPromise;

    expect(FakePlayer.instances).toHaveLength(1);
    expect(FakePlayer.instances[0].config.videoId).toBe('lhAEvAOPsiU');
    expect(FakePlayer.instances[0].config.playerVars).toEqual({
      autoplay: 1,
      mute: 0,
      controls: 1,
      rel: 0,
    });
  });

  it('resolves a handle only after the player fires onReady', async () => {
    const element = document.createElement('div');
    let resolved = false;

    const playerPromise = createYouTubePlayer(element, 'lhAEvAOPsiU').then(handle => {
      resolved = true;
      return handle;
    });

    await Promise.resolve();
    await Promise.resolve();
    expect(resolved).toBe(false);

    FakePlayer.instances[0].fireReady();
    await playerPromise;

    expect(resolved).toBe(true);
  });

  it('invokes the optional onReady callback when the player becomes ready', async () => {
    const element = document.createElement('div');
    const onReady = vi.fn();

    const playerPromise = createYouTubePlayer(element, 'lhAEvAOPsiU', onReady);
    await Promise.resolve();
    FakePlayer.instances[0].fireReady();
    await playerPromise;

    expect(onReady).toHaveBeenCalledTimes(1);
  });

  it('handle.play() calls playVideo() on the underlying player', async () => {
    const element = document.createElement('div');
    const playerPromise = createYouTubePlayer(element, 'lhAEvAOPsiU');
    await Promise.resolve();
    FakePlayer.instances[0].fireReady();
    const handle = await playerPromise;

    handle.play();

    expect(FakePlayer.instances[0].playVideo).toHaveBeenCalled();
  });

  it('handle.pause() calls pauseVideo() on the underlying player', async () => {
    const element = document.createElement('div');
    const playerPromise = createYouTubePlayer(element, 'lhAEvAOPsiU');
    await Promise.resolve();
    FakePlayer.instances[0].fireReady();
    const handle = await playerPromise;

    handle.pause();

    expect(FakePlayer.instances[0].pauseVideo).toHaveBeenCalled();
  });

  it('handle.destroy() calls destroy() on the underlying player', async () => {
    const element = document.createElement('div');
    const playerPromise = createYouTubePlayer(element, 'lhAEvAOPsiU');
    await Promise.resolve();
    FakePlayer.instances[0].fireReady();
    const handle = await playerPromise;

    handle.destroy();

    expect(FakePlayer.instances[0].destroy).toHaveBeenCalled();
  });

  it('loops by seeking to 0 and replaying when the video ends', async () => {
    const element = document.createElement('div');
    const playerPromise = createYouTubePlayer(element, 'lhAEvAOPsiU');
    await Promise.resolve();
    const player = FakePlayer.instances[0];
    player.fireReady();
    await playerPromise;
    player.playVideo.mockClear();

    player.fireStateChange(0); // ENDED

    expect(player.seekTo).toHaveBeenCalledWith(0, true);
    expect(player.playVideo).toHaveBeenCalled();
  });
});

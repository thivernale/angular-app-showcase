import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { YouTubePlayerService } from './youtube-player.service';

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
}

describe('YouTubePlayerService', () => {
  let service: YouTubePlayerService;

  beforeEach(() => {
    FakePlayer.instances = [];
    vi.stubGlobal('YT', {
      Player: FakePlayer,
      PlayerState: { ENDED: 0 },
    });

    TestBed.configureTestingModule({});
    service = TestBed.inject(YouTubePlayerService);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('creates a player targeting the given element and video id, resolving a handle once ready', async () => {
    const element = document.createElement('div');

    const playerPromise = service.create(element, 'lhAEvAOPsiU');
    await Promise.resolve();
    FakePlayer.instances[0].fireReady();
    const handle = await playerPromise;

    expect(FakePlayer.instances[0].config.videoId).toBe('lhAEvAOPsiU');

    handle.play();
    expect(FakePlayer.instances[0].playVideo).toHaveBeenCalled();
  });
});

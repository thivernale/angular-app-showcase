import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createBeepPlayer } from './beep';

class FakeOscillator {
  type = '';
  frequency = { setValueAtTime: vi.fn() };
  connect = vi.fn();
  start = vi.fn();
  stop = vi.fn();
}

let constructed: FakeAudioContext[];

class FakeAudioContext {
  currentTime = 2;
  destination = {};
  state: AudioContextState = 'running';
  oscillators: FakeOscillator[] = [];
  resume = vi.fn(() => {
    this.state = 'running';
    return Promise.resolve();
  });

  constructor() {
    constructed.push(this);
  }

  createOscillator() {
    const oscillator = new FakeOscillator();
    this.oscillators.push(oscillator);
    return oscillator;
  }
}

describe('playBeep', () => {
  let playBeep: (duration?: number) => void;

  beforeEach(() => {
    constructed = [];
    vi.stubGlobal('AudioContext', FakeAudioContext);
    // A fresh player per test, so no context is cached from an earlier test. (Re-importing
    // the module after vi.resetModules() is not enough: browser mode keeps the cached module.)
    playBeep = createBeepPlayer();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('plays a 440 Hz tone that stops after the given duration', () => {
    playBeep(0.5);

    const oscillator = constructed[0].oscillators[0];
    expect(oscillator.frequency.setValueAtTime).toHaveBeenCalledWith(440, 2);
    expect(oscillator.connect).toHaveBeenCalledWith(constructed[0].destination);
    expect(oscillator.start).toHaveBeenCalled();
    expect(oscillator.stop).toHaveBeenCalledWith(2.5);
  });

  it('reuses a single AudioContext across beeps', () => {
    playBeep();
    playBeep();
    playBeep(0.5);

    expect(constructed).toHaveLength(1);
    expect(constructed[0].oscillators).toHaveLength(3);
  });

  it('resumes the shared context when the browser has suspended it', () => {
    playBeep();
    constructed[0].state = 'suspended';

    playBeep();

    expect(constructed[0].resume).toHaveBeenCalled();
    expect(constructed).toHaveLength(1);
  });

  it('creates a new context if the shared one was closed', () => {
    playBeep();
    constructed[0].state = 'closed';

    playBeep();

    expect(constructed).toHaveLength(2);
  });
});

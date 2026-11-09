/**
 * Creates a beep function that shares one AudioContext across all its beeps. Browsers cap
 * how many contexts a page may hold, and a session beeps up to four times per phase, so
 * creating one per beep (and never closing it) eventually exhausts that limit.
 */
export function createBeepPlayer(): (duration?: number) => void {
  let sharedContext: AudioContext | null = null;

  function getAudioContext(): AudioContext {
    if (!sharedContext || sharedContext.state === 'closed') {
      // @ts-expect-error cross-browser compatibility
      sharedContext = new (window.AudioContext || window.webkitAudioContext)() as AudioContext;
    }
    if (sharedContext.state === 'suspended') {
      // Autoplay policies may suspend a context created outside a user gesture.
      void sharedContext.resume();
    }
    return sharedContext;
  }

  return (duration = 0.2) => {
    const audioCtx = getAudioContext();

    const oscillator = audioCtx.createOscillator();
    oscillator.type = 'sine';
    oscillator.frequency.setValueAtTime(440, audioCtx.currentTime); // 440 Hz is A4 pitch

    oscillator.connect(audioCtx.destination);
    oscillator.start();
    oscillator.stop(audioCtx.currentTime + duration);
  };
}

/** App-wide beep; its AudioContext is created lazily on the first beep. */
export const playBeep = createBeepPlayer();

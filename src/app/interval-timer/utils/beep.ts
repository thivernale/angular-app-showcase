export function playBeep(duration = 0.2) {
  // 1. Create the audio context
  // @ts-ignore
  const audioCtx = new (window.AudioContext || window.webkitAudioContext)();

  // 2. Create an oscillator node
  const oscillator = audioCtx.createOscillator();

  // 3. Configure the sound (type and pitch)
  oscillator.type = 'sine'; // Options: 'sine', 'square', 'sawtooth', 'triangle'
  oscillator.frequency.setValueAtTime(440, audioCtx.currentTime); // 440 Hz is A4 pitch

  // 4. Connect to speakers and play
  oscillator.connect(audioCtx.destination);
  oscillator.start();

  // 5. Stop the sound after a duration (e.g., 200ms)
  oscillator.stop(audioCtx.currentTime + duration);
}

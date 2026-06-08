const SOUNDS: Record<string, number> = {
  critical: 880,
  high: 660,
  medium: 440,
  low: 330,
};

export function playAlertSound(priority: string) {
  try {
    const ctx = new AudioContext();
    const oscillator = ctx.createOscillator();
    const gain = ctx.createGain();
    oscillator.connect(gain);
    gain.connect(ctx.destination);
    oscillator.frequency.value = SOUNDS[priority] || 440;
    oscillator.type = 'sine';
    gain.gain.value = 0.3;
    oscillator.start();
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.5);
    oscillator.stop(ctx.currentTime + 0.5);
  } catch {
    // AudioContext not available (SSR or unsupported browser)
  }
}

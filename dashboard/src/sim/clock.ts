// src/sim/clock.ts
// Pacing for the simulator's async steps. Real wall-clock time, scaled
// by a user-controlled speed multiplier (0.5x / 1x / 2x on the Control
// Plane) rather than a fully virtual clock — the simulator's timings
// already mirror docs/animation_timing.md's real beat lengths, so
// "virtual" here just means "interruptible and speed-adjustable", not
// "fake".
export class SimClock {
  speed = 1;

  async sleep(ms: number): Promise<void> {
    const scaled = Math.max(1, ms / this.speed);
    return new Promise((resolve) => setTimeout(resolve, scaled));
  }
}

export const sharedClock = new SimClock();

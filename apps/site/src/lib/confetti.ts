import confetti from "canvas-confetti";

// A short shower of confetti from the top of the screen, for good news only: a
// fountain confirmed working (see celebratesEdit). Problem reports get the
// popup's "saved" check instead.

// The site's water blues, a lighter sky to lift them, and its yellow and green.
const COLORS = ["#0b6fa7", "#0e85c6", "#8cc8ec", "#fbc900", "#00925d"];

// Pieces start falling over this window, so they arrive as a shower.
const SPAWN_MS = 1000;
// canvas-confetti (1.9.4, `updateFetti`) steps its pieces at a fixed 60 ticks a
// second, moves each one down `gravity * 3` px a tick once its small start
// push has decayed, and fades it out linearly over its `ticks`.
const TICKS = 220;
// Ticks an average piece takes to cross the viewport: about 2.4 s, so it is
// still about a third opaque at the bottom edge rather than fading mid-screen.
const CROSS_TICKS = 145;

let raining = false;

const pick = <T>(xs: readonly T[]): T => xs[Math.floor(Math.random() * xs.length)];

export function celebratePoint() {
  if (typeof window === "undefined" || raining) return;
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

  // Scaled to the viewport, so the shower takes as long on a phone as on a
  // desktop.
  const gravity = Math.min(2.6, Math.max(0.9, window.innerHeight / (CROSS_TICKS * 3)));
  // About as dense on a desktop as on a phone, within reason.
  const pieces = Math.round(Math.min(160, Math.max(60, window.innerWidth / 6)));
  const start = performance.now();
  let emitted = 0;
  raining = true;

  const frame = () => {
    // Paced by time, not frames, so a 120 Hz screen doesn't get twice the pieces.
    const due = Math.min(pieces, Math.ceil(((performance.now() - start) / SPAWN_MS) * pieces));
    for (; emitted < due; emitted++) {
      void confetti({
        particleCount: 1,
        // Straight down from a random point just above the top edge.
        origin: { x: Math.random(), y: -0.05 },
        angle: 270,
        spread: 40,
        startVelocity: 4,
        // Pieces fall at different speeds, as real paper does, so the shower
        // spreads out down the screen instead of moving as one band.
        gravity: gravity * (0.75 + Math.random() * 0.5),
        drift: Math.random() - 0.5,
        ticks: TICKS,
        scalar: 0.9,
        // One color per call: canvas-confetti hands colors out by particle
        // index within a call, so a list would always give the first.
        colors: [pick(COLORS)],
        disableForReducedMotion: true,
      });
    }
    if (emitted < pieces) requestAnimationFrame(frame);
    else raining = false;
  };
  requestAnimationFrame(frame);
}

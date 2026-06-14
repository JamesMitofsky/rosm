import confetti from "canvas-confetti";

// Small celebratory burst fired whenever a point gets any kind of update.
// Kept modest so rapid edits don't flood the screen.
export function celebratePoint() {
  if (typeof window === "undefined") return;
  confetti({
    particleCount: 40,
    spread: 55,
    startVelocity: 28,
    gravity: 1.1,
    scalar: 0.8,
    ticks: 120,
    origin: { y: 0.7 },
    disableForReducedMotion: true,
  });
}

"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";

export type LoadingStep = { text: string; ms: number };

// Generic play-by-play of what an Overpass round-trip is doing, so the wait
// feels earned. Durations are deliberately uneven (~5s each) so it doesn't tick
// like a metronome; the last line holds until the fetch resolves. Callers can
// override with location-specific copy.
export const DEFAULT_LOADING_STEPS: LoadingStep[] = [
  { text: "Opening a socket to OpenStreetMap servers…", ms: 5000 },
  { text: "Scanning nearby drinking-water nodes…", ms: 5000 },
  { text: "Reading check_date tags to grade recency…", ms: 5000 },
];

// How far the bar crawls between step boundaries; most forward motion is the
// jump each step makes the instant its text appears.
const CRAWL_GAIN = 20;

// Self-narrating loader for a fountain fetch: a progress bar that jumps as each
// play-by-play line appears then creeps, rushing to 100% and fading out on a
// real resolve. `overlay` covers a map plate (landing hero); `inline` slots in
// where a control lived (the search panel), so an in-flight search is obvious.
export default function SearchProgress({
  active,
  done = false,
  failed = false,
  steps = DEFAULT_LOADING_STEPS,
  variant = "inline",
}: {
  // A fetch is in flight — enter and drive the crawl.
  active: boolean;
  // The fetch resolved OK — rush the bar to 100%, then fade out.
  done?: boolean;
  // The fetch failed — drop immediately so the caller's error UI shows.
  failed?: boolean;
  steps?: LoadingStep[];
  variant?: "overlay" | "inline";
}) {
  const [stepIdx, setStepIdx] = useState(0);
  // Kept true until the fill reaches 100% and the overlay fades out — so a fast
  // fetch still lets the bar finish its story instead of vanishing mid-way.
  const [show, setShow] = useState(active);

  // Progress is driven straight into the DOM (fill width + % text) from the RAF
  // loop rather than through React state. iOS Safari stalls a CSS width
  // transition whose target changes every frame, AND coalesces per-frame
  // re-renders — so a state-driven bar sits at 0 then snaps to 100 when the
  // fetch frees the main thread. Writing the node directly sidesteps both.
  const fillRef = useRef<HTMLDivElement>(null);
  const pctRef = useRef<HTMLSpanElement>(null);
  const progressRef = useRef(0);
  const applyProgress = useCallback((p: number) => {
    progressRef.current = p;
    if (fillRef.current) fillRef.current.style.width = `${p}%`;
    if (pctRef.current) pctRef.current.textContent = `${Math.round(p)}%`;
  }, []);

  // Step boundaries (cumulative durations) and the percent each step JUMPS to
  // the moment its text shows, derived from the step list so any copy works.
  const progressAt = useMemo(() => {
    const starts = steps.reduce<number[]>((acc, _s, i) => {
      acc.push(i === 0 ? 0 : acc[i - 1] + steps[i - 1].ms);
      return acc;
    }, []);
    const base = steps.map((_s, i) => 10 + (i / steps.length) * 84);
    // Percent complete at `ms` elapsed: jump to the current step's base, then
    // crawl by up to CRAWL_GAIN until the next step jumps. Past the last step it
    // creeps toward ~99 asymptotically (100 only on a real resolve).
    return (ms: number): number => {
      let i = 0;
      while (i < starts.length - 1 && ms >= starts[i + 1]) i += 1;
      const b = base[i];
      const elapsedInStep = ms - starts[i];
      const isLast = i === steps.length - 1;
      if (isLast) return Math.min(99, b + (99 - b) * (1 - Math.exp(-elapsedInStep / 22000)));
      const dur = steps[i].ms;
      const t = Math.min(1, elapsedInStep / dur);
      // easeInOut (slow after the jump, quicker mid-phrase, slow into the next),
      // blended with a linear term so it never fully stalls at either end.
      const inOut = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
      const eased = 0.4 * t + 0.6 * inOut;
      return b + CRAWL_GAIN * eased;
    };
  }, [steps]);

  // Enter and reset whenever a fetch starts.
  useEffect(() => {
    if (!active) return;
    setShow(true);
    setStepIdx(0);
    applyProgress(0);
  }, [active, applyProgress]);

  // No graceful finish requested (inline use): hide as soon as the fetch stops.
  useEffect(() => {
    if (!active && !done) setShow(false);
  }, [active, done]);

  // Walk the play-by-play at an uneven cadence while the fetch runs, holding on
  // the final line until it resolves.
  useEffect(() => {
    if (!active) return;
    let i = 0;
    let timer: ReturnType<typeof setTimeout>;
    const tick = () => {
      if (i >= steps.length - 1) return;
      timer = setTimeout(() => {
        i += 1;
        setStepIdx(i);
        tick();
      }, steps[i].ms);
    };
    tick();
    return () => clearTimeout(timer);
  }, [active, steps]);

  // Drive the progress bar off wall-clock elapsed time (not step count) so its
  // uneven surge-and-creep curve is independent of the text rotation.
  useEffect(() => {
    if (!active) return;
    const start = performance.now();
    let raf = requestAnimationFrame(function loop(t) {
      applyProgress(progressAt(t - start));
      raf = requestAnimationFrame(loop);
    });
    return () => cancelAnimationFrame(raf);
  }, [active, applyProgress, progressAt]);

  // Fetch resolved: rush the bar from wherever the creep left off up to 100%,
  // then fade the overlay out — the effort "pays off" instead of blinking away.
  useEffect(() => {
    if (!done) return;
    const from = progressRef.current;
    const start = performance.now();
    const DUR = 550;
    let raf = requestAnimationFrame(function run(t) {
      const k = Math.min(1, (t - start) / DUR);
      const eased = 1 - Math.pow(1 - k, 3); // easeOutCubic
      applyProgress(from + (100 - from) * eased);
      if (k < 1) raf = requestAnimationFrame(run);
    });
    const hide = setTimeout(() => setShow(false), DUR + 260);
    return () => {
      cancelAnimationFrame(raf);
      clearTimeout(hide);
    };
  }, [done, applyProgress]);

  // A failed fetch should reveal the error card, not sit under the loader.
  useEffect(() => {
    if (failed) setShow(false);
  }, [failed]);

  const step = steps[stepIdx] ?? steps[steps.length - 1];

  const body = (
    <>
      <div className="w-full max-w-md">
        <div className="mb-2 flex justify-end">
          <span ref={pctRef} className="text-ink-dim font-mono text-xs tabular-nums">
            0%
          </span>
        </div>
        <div className="bg-ink/10 h-1.5 w-full overflow-hidden rounded-full">
          <div ref={fillRef} className="bg-sky-deep h-full rounded-full" style={{ width: 0 }} />
        </div>
      </div>
      <div className="flex min-h-[4rem] max-w-md items-start justify-center">
        <AnimatePresence mode="wait">
          <motion.p
            key={stepIdx}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
            className="text-ink-dim font-mono text-sm leading-relaxed tracking-tight"
          >
            {step.text}
          </motion.p>
        </AnimatePresence>
      </div>
    </>
  );

  return (
    <AnimatePresence>
      {show &&
        (variant === "overlay" ? (
          <motion.div
            initial={false}
            exit={{ opacity: 0, scale: 1.015 }}
            transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
            className="bg-paper/85 absolute inset-0 z-[650] flex flex-col items-center justify-center gap-8 px-8 text-center backdrop-blur-sm"
          >
            {body}
          </motion.div>
        ) : (
          <motion.div
            initial={false}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3 }}
            className="flex flex-col items-center gap-4 py-1 text-center"
          >
            {body}
          </motion.div>
        ))}
    </AnimatePresence>
  );
}

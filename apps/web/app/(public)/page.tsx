"use client";

import dynamic from "next/dynamic";
import { useState } from "react";
import { motion } from "framer-motion";
import { heroFont } from "@/lib/heroFont";
import FreshnessLegend from "@/components/FreshnessLegend";
import FountainLeaderboard from "@/components/FountainLeaderboard";
import JoinBetaModal from "@/components/JoinBetaModal";
import SiteNav from "@/components/SiteNav";
import { DropIcon } from "@phosphor-icons/react";

const DemoRunMap = dynamic(() => import("@/components/DemoRunMap"), { ssr: false });
const LiveFountainMap = dynamic(() => import("@/components/LiveFountainMap"), { ssr: false });

/* ------------------------------------------------------------------ */
/* Decorative topographic contour field.                              */
/* ------------------------------------------------------------------ */
function Contours({ className = "" }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 1200 600"
      fill="none"
      preserveAspectRatio="xMidYMid slice"
      aria-hidden
    >
      {Array.from({ length: 9 }).map((_, i) => {
        const o = i * 26;
        return (
          <path
            key={i}
            d={`M-50 ${120 + o}
                C 200 ${60 + o}, 360 ${220 + o}, 560 ${180 + o}
                S 920 ${60 + o}, 1260 ${160 + o}`}
            stroke="currentColor"
            strokeWidth={1}
            opacity={0.5 - i * 0.04}
          />
        );
      })}
      {Array.from({ length: 7 }).map((_, i) => {
        const o = i * 30;
        return (
          <path
            key={`b-${i}`}
            d={`M-50 ${420 + o}
                C 180 ${360 + o}, 420 ${520 + o}, 640 ${440 + o}
                S 980 ${360 + o}, 1260 ${480 + o}`}
            stroke="currentColor"
            strokeWidth={1}
            opacity={0.42 - i * 0.05}
          />
        );
      })}
    </svg>
  );
}

const fadeUp = {
  initial: { opacity: 0, y: 24 },
  whileInView: { opacity: 1, y: 0 },
  // Positive bottom margin extends the trigger zone *below* the viewport, so
  // each block starts revealing while still under the fold — no scrolling an
  // element deep into view before it appears (felt especially late on mobile).
  // `amount: "some"` fires as soon as any part of the block crosses the line.
  viewport: { once: true, margin: "0px 0px 20% 0px", amount: "some" as const },
  transition: { duration: 0.55, ease: [0.22, 1, 0.36, 1] as const },
};

/*
 * Torn-paper silhouette for the manifesto plate. Irregular px offsets along the
 * top and bottom edges read as a hand-torn strip; the left/right sides stay
 * straight for the full-bleed section. Offsets are hardcoded — not random — so
 * SSR and client render the same edge (no hydration mismatch, no jitter).
 *
 * clip-path and the raising drop-shadow MUST live on separate elements: on one
 * element the clip runs after the filter and would clip the shadow away to
 * nothing. So the wrapper carries `tornShadow` (drop-shadow hugs the clipped
 * child silhouette, unlike box-shadow) and the inner section carries `tornClip`.
 */
const tornShadow = {
  filter:
    "drop-shadow(0 2px 3px rgba(60, 48, 24, 0.32)) drop-shadow(0 9px 18px rgba(60, 48, 24, 0.24))",
} as const;

const tornClip = {
  clipPath: `polygon(
    0% 10px, 4% 2px, 7% 18px, 13% 4px, 17% 21px, 21% 7px, 26% 14px, 31% 1px,
    34% 19px, 40% 5px, 44% 22px, 49% 9px, 53% 3px, 58% 17px, 63% 6px, 68% 20px,
    71% 11px, 77% 2px, 82% 16px, 86% 5px, 91% 23px, 96% 8px, 100% 13px,
    100% calc(100% - 11px), 96% calc(100% - 3px), 91% calc(100% - 19px),
    86% calc(100% - 6px), 82% calc(100% - 22px), 77% calc(100% - 8px),
    71% calc(100% - 15px), 68% calc(100% - 2px), 63% calc(100% - 20px),
    58% calc(100% - 5px), 53% calc(100% - 23px), 49% calc(100% - 9px),
    44% calc(100% - 4px), 40% calc(100% - 17px), 34% calc(100% - 7px),
    31% calc(100% - 21px), 26% calc(100% - 12px), 21% calc(100% - 3px),
    17% calc(100% - 18px), 13% calc(100% - 6px), 7% calc(100% - 22px),
    4% calc(100% - 9px), 0% calc(100% - 14px)
  )`,
} as const;

/* Tiny mono corner label, as in the reference layouts. */
function Label({ children }: { children: React.ReactNode }) {
  return (
    <span className="text-ink-dim font-mono text-[0.65rem] font-medium tracking-[0.22em] uppercase">
      {children}
    </span>
  );
}

export default function LandingPage() {
  const [betaOpen, setBetaOpen] = useState(false);

  return (
    <main className="paper-grain bg-paper font-body text-ink relative">
      <SiteNav />
      <JoinBetaModal open={betaOpen} onClose={() => setBetaOpen(false)} />

      {/* HERO */}
      <section className="relative overflow-hidden">
        <Contours className="text-ink/[0.06] pointer-events-none absolute inset-0 h-full w-full" />

        <div className="relative mx-auto max-w-6xl px-5 pt-7 pb-16 md:pt-20 md:pb-24">
          {/* Mobile: title → map → subtitle (flex column). Desktop: map spans the
              left column, title + subtitle stack in the right column (grid). */}
          <div className="flex flex-col items-start gap-8 md:grid md:grid-cols-[46%_1fr] md:items-center md:gap-x-12 md:gap-y-4">
            <motion.h1
              {...fadeUp}
              transition={{ ...fadeUp.transition, delay: 0.1 }}
              className={`${heroFont.className} max-w-5xl text-[clamp(2.6rem,12vw,4.6rem)] leading-[0.9] font-bold tracking-tight md:col-start-2 md:row-start-1 md:self-end`}
            >
              Plan routes.
              <br />
              Verify fountains.
            </motion.h1>

            {/* Interactive demo of the run + edit flow, framed like a print plate. */}
            <motion.div
              {...fadeUp}
              transition={{ ...fadeUp.transition, delay: 0.05 }}
              className="border-ink/10 bg-sky relative w-full overflow-hidden rounded-xl border md:col-start-1 md:row-span-2 md:self-center"
            >
              <div className="relative isolate z-0 h-[clamp(300px,40vw,460px)] w-full">
                <DemoRunMap />
              </div>
            </motion.div>

            <motion.div
              {...fadeUp}
              transition={{ ...fadeUp.transition, delay: 0.16 }}
              className="flex flex-col items-start gap-6 md:col-start-2 md:row-start-2 md:self-start"
            >
              <p className="text-ink-dim max-w-xl text-xl leading-relaxed">
                Contribute to your community with local&nbsp;data
              </p>
              <button
                type="button"
                onClick={() => setBetaOpen(true)}
                className="bg-sky-deep text-paper hover:bg-sky-deep/90 inline-flex items-center gap-2.5 self-end rounded-sm px-6 py-3 text-lg font-bold transition md:self-start"
              >
                Get the app
                <svg viewBox="0 0 100 100" fill="currentColor" aria-hidden className="h-6 w-6">
                  <path d="M29.1,60.6L11.7,87.9c-1.8,2.9-1,6.7,1.9,8.6c1,0.7,2.2,1,3.3,1c2,0,4.1-1,5.2-2.9l17.1-26.8l-4.6-2.2C32.2,64.5,30.3,62.8,29.1,60.6z" />
                  <circle cx="70.8" cy="13.4" r="10.9" />
                  <path d="M89.1,44.2c-0.8-2.8-3.6-4.4-6.4-3.6l-7.7,2.1l-3.7-8.4c-1.1-2.5-2.9-4.6-5.2-6.1l-8.9-5.8c-2.6-1.7-5.8-2.5-8.9-2.3l-13.1,1c-1.4,0.1-2.6,0.8-3.5,1.8l-8.9,10.5c-1.9,2.2-1.6,5.4,0.6,7.3c2.2,1.9,5.4,1.6,7.3-0.6l7.5-8.8l7.8-0.6L34.7,50.9c-0.8,1.5-1,3.3-0.5,4.9c0.5,1.6,1.7,3,3.3,3.7l17.5,8.2L45.2,81c-2,2.8-1.4,6.7,1.3,8.7c1.1,0.8,2.4,1.2,3.7,1.2c1.9,0,3.8-0.9,5-2.5L69.4,69c1.1-1.5,1.5-3.4,1-5.2c-0.5-1.8-1.7-3.3-3.4-4.1L54.8,54l8.4-12.4l4.2,9.5c0.8,1.9,2.7,3.1,4.7,3.1c0.5,0,0.9-0.1,1.4-0.2l12-3.3C88.3,49.8,89.9,46.9,89.1,44.2z" />
                </svg>
              </button>
            </motion.div>
          </div>
        </div>
      </section>

      {/* MANIFESTO SPLIT — a raised, hand-torn paper strip over the page.
          Wrapper casts the shadow; inner section carries the torn clip. */}
      <div className="relative z-10 -my-6" style={tornShadow}>
        <section className="bg-paper-deep" style={tornClip}>
          <div className="mx-auto max-w-3xl px-5 py-20 md:py-28">
            <motion.div {...fadeUp}>
              <h2
                className={`${heroFont.className} text-[clamp(2rem,5vw,3.4rem)] leading-[1.05] font-bold tracking-tight`}
              >
                The Problem
              </h2>
              <p className="text-ink-dim mt-6 text-lg leading-relaxed">
                Despite DC&apos;s many public drinking fountains, there is no reliable way to know
                where they all are. And then, many are out of order. This is bad for everyone,
                especially folks who spend a disproportionate amount of time outdoors—think runners,
                tourists, and the homeless.
              </p>
              <p className="text-ink-dim mt-4 text-lg leading-relaxed">
                By building a robust, locally-sourced map of public drinking water, we can improve
                the utility of this existing public good. This removes the guesswork of where to
                find the nearest fountain as well as the uncertainty of whether that fountain will
                work.
              </p>
              <p className="text-ink-dim mt-4 text-lg leading-relaxed">
                In practice, this produces immediate and long-term benefits:
              </p>
              <ul className="text-ink-dim mt-4 list-disc space-y-1 pl-6 text-lg leading-relaxed">
                <li>
                  <span className="font-medium">Immediately,</span> anyone can reliably locate the
                  nearest working fountain
                </li>
                <li>
                  <span className="font-medium">Long-term,</span> 311 can have rapid visibility for
                  when fountains break
                </li>
              </ul>
            </motion.div>
          </div>
        </section>
      </div>

      {/* HOW IT WORKS — interactive demo of the run + edit flow */}
      <section>
        <div className="mx-auto max-w-6xl px-5 py-20 md:py-28">
          <motion.h2
            {...fadeUp}
            className={`${heroFont.className} text-[clamp(2rem,5.5vw,3.6rem)] leading-tight font-bold tracking-tight uppercase`}
          >
            The State of the Fountains
          </motion.h2>
          <motion.p
            {...fadeUp}
            transition={{ ...fadeUp.transition, delay: 0.1 }}
            className="text-ink-dim mt-8 max-w-2xl text-lg leading-relaxed"
          >
            Here&apos;s a live coverage map of the fountains in DC.
          </motion.p>

          {/* Contributor leaderboard — self-hides when there's no attributed
              edit data yet. */}
          <motion.div
            {...fadeUp}
            transition={{ ...fadeUp.transition, delay: 0.14 }}
            className="mt-12"
          >
            <Label>Top contributors</Label>
            <FountainLeaderboard className="mt-6" />
          </motion.div>

          <motion.div
            {...fadeUp}
            transition={{ ...fadeUp.transition, delay: 0.18 }}
            className="mt-12 flex flex-wrap items-center justify-between gap-x-4 gap-y-2 px-1 pb-2"
          >
            <Label>Live</Label>
            <FreshnessLegend />
          </motion.div>
          <motion.div
            {...fadeUp}
            transition={{ ...fadeUp.transition, delay: 0.22 }}
            className="border-ink/10 bg-sky relative overflow-hidden rounded-xl border"
          >
            <div className="relative isolate z-0 h-[clamp(340px,48vw,560px)] w-full">
              <LiveFountainMap />
            </div>
          </motion.div>
        </div>
      </section>

      {/* FOOTER */}
      <footer className="border-paper-line border-t">
        <div className="text-ink-dim mx-auto flex max-w-6xl items-center justify-center gap-4 px-5 py-8 text-sm">
          <span>
            Made with <DropIcon weight="fill" className="text-sky-deep inline-block align-middle" />{" "}
            by{" "}
            <a
              href="https://jamesm.it/about"
              target="_blank"
              rel="noopener noreferrer"
              className="text-sky-deep decoration-sky-deep/50 hover:decoration-sky-deep font-medium underline underline-offset-4"
            >
              James Mitofsky
            </a>
          </span>
        </div>
      </footer>
    </main>
  );
}

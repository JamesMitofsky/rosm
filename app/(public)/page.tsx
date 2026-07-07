"use client";

import Link from "next/link";
import dynamic from "next/dynamic";
import { useState } from "react";
import { motion } from "framer-motion";
import FreshnessLegend, { type Bucket } from "@/components/FreshnessLegend";
import HomeRunCard from "@/components/HomeRunCard";
import NativeEntryRedirect from "@/components/NativeEntryRedirect";
import SiteNav from "@/components/SiteNav";
import {
  ArrowRightIcon,
  GithubLogoIcon,
  GlobeHemisphereWestIcon,
  HeartIcon,
} from "@phosphor-icons/react";

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
  viewport: { once: true, margin: "-80px" },
  transition: { duration: 0.55, ease: [0.22, 1, 0.36, 1] as const },
};

/* Tiny mono corner label, as in the reference layouts. */
function Label({ children }: { children: React.ReactNode }) {
  return (
    <span className="text-ink-dim font-mono text-[0.65rem] font-medium tracking-[0.22em] uppercase">
      {children}
    </span>
  );
}

export default function LandingPage() {
  // Freshness counts surfaced by the live hero map, shown in the label row.
  const [legend, setLegend] = useState<Record<Bucket, number> | null>(null);

  return (
    <main className="paper-grain bg-paper font-body text-ink relative">
      <NativeEntryRedirect />
      <SiteNav />

      {/* HERO */}
      <section className="relative overflow-hidden">
        <Contours className="text-ink/[0.06] pointer-events-none absolute inset-0 h-full w-full" />

        <div className="relative mx-auto max-w-6xl px-5 pt-14 pb-16 md:pt-20 md:pb-24">
          <motion.h1
            {...fadeUp}
            transition={{ ...fadeUp.transition, delay: 0.05 }}
            className="font-display max-w-5xl text-[clamp(2.6rem,8.5vw,6.5rem)] leading-[0.9] font-bold tracking-tight uppercase"
          >
            Runner-sourced
            <br />
            <span className="text-sky-deep">public maps</span>
          </motion.h1>

          <div className="mt-10 flex flex-col items-start gap-6">
            <motion.p
              {...fadeUp}
              transition={{ ...fadeUp.transition, delay: 0.12 }}
              className="text-ink-dim max-w-xl text-lg leading-relaxed"
            >
              Plan your runs to crowdsource public map data
            </motion.p>
            {/* Returning users: resume an in-flight run or revisit history. */}
            <HomeRunCard />
          </div>

          {/* Sample-route label, sitting tightly above the map plate. */}
          <motion.div
            {...fadeUp}
            transition={{ ...fadeUp.transition, delay: 0.24 }}
            className="mt-14 flex flex-wrap items-center justify-between gap-x-4 gap-y-2 px-1 pb-2"
          >
            <Label>Live · Washington DC</Label>
            {legend && <FreshnessLegend counts={legend} />}
          </motion.div>

          {/* Sky panel — live OSM drinking-water points within 1.5 mi of DC,
              colored by verification freshness. Framed like a print plate. */}
          <motion.div
            {...fadeUp}
            transition={{ ...fadeUp.transition, delay: 0.28 }}
            className="border-ink/10 bg-sky relative overflow-hidden rounded-xl border"
          >
            <div className="relative isolate z-0 h-[clamp(340px,48vw,560px)] w-full">
              <LiveFountainMap onCountsChange={setLegend} />
            </div>
          </motion.div>
        </div>
      </section>

      {/* MANIFESTO SPLIT */}
      <section className="border-paper-line bg-paper-deep border-t">
        <div className="mx-auto grid max-w-6xl gap-12 px-5 py-20 md:grid-cols-2 md:py-28">
          <motion.div {...fadeUp}>
            <h2 className="font-display text-[clamp(2rem,5vw,3.4rem)] leading-[1.05] font-bold tracking-tight">
              Keeping map data <span className="text-sky-deep">public</span> is important
            </h2>
            <p className="text-ink-dim mt-6 text-lg leading-relaxed">
              Crowdsourced map data degrades over time. Places like drinking fountains, benches, and
              similar nodes (which Apple and Google don&apos;t even track, data sovereignty aside)
              are often tagged once and never re-verified.
            </p>
            <p className="text-ink-dim mt-4 text-lg leading-relaxed">
              This app aims to solve the verification problem by routing runs past these unverified
              points so their real-world state can be observed and recorded into the Open Street
              Maps platform (the crowd-sourced, non-profit alternative to Google Maps).
            </p>
          </motion.div>

          <motion.div
            {...fadeUp}
            transition={{ ...fadeUp.transition, delay: 0.1 }}
            className="flex self-start"
          >
            <div className="border-paper-line bg-paper flex gap-4 rounded-2xl border px-5 py-8">
              <GlobeHemisphereWestIcon
                size={28}
                weight="bold"
                className="text-sky-deep mt-0.5 shrink-0"
              />
              <p className="text-ink-dim text-lg leading-relaxed">
                Right now, the focus is on documenting fountains as a public amenity, and once this
                proof of concept is locked down, branching out to recording and maintaining data for
                other public amenities. Things like public restrooms, picnic tables, parks, etc.
              </p>
            </div>
          </motion.div>
        </div>
      </section>

      {/* HOW IT WORKS — interactive demo of the run + edit flow */}
      <section className="border-paper-line border-t">
        <div className="mx-auto max-w-6xl px-5 py-20 md:py-28">
          <motion.h2
            {...fadeUp}
            className="font-display text-[clamp(2rem,5.5vw,3.6rem)] leading-tight font-bold tracking-tight uppercase"
          >
            How it works
          </motion.h2>
          <motion.p
            {...fadeUp}
            transition={{ ...fadeUp.transition, delay: 0.1 }}
            className="text-ink-dim mt-8 max-w-2xl text-lg leading-relaxed"
          >
            Plan a run past unverified fountains, then log each one&apos;s real-world state as you
            pass it. This very similar to what the run screen actually looks like. This is just a
            toy demo, so definitely tap around!
          </motion.p>

          <motion.div
            {...fadeUp}
            transition={{ ...fadeUp.transition, delay: 0.18 }}
            className="mt-10 flex items-center justify-between gap-4 px-1 pb-2"
          >
            <Label>Sample route · Washington DC</Label>
          </motion.div>
          <motion.div
            {...fadeUp}
            transition={{ ...fadeUp.transition, delay: 0.22 }}
            className="border-ink/10 bg-sky relative overflow-hidden rounded-xl border"
          >
            <div className="relative isolate z-0 h-[clamp(340px,48vw,560px)] w-full">
              <DemoRunMap />
            </div>
          </motion.div>
        </div>
      </section>

      {/* HOW TO CONTRIBUTE */}
      <section id="how" className="border-paper-line border-t">
        <div className="mx-auto max-w-6xl px-5 py-20 md:py-28">
          <motion.div {...fadeUp}>
            <h2 className="font-display text-[clamp(2rem,5.5vw,3.6rem)] leading-tight font-bold tracking-tight uppercase">
              How to contribute
            </h2>
            <p className="text-ink-dim mt-8 max-w-2xl text-lg leading-relaxed">
              If you have feedback on your experience using ROSM or want to contribute to the code,
              shoot me a message at{" "}
              <a href="mailto:james@btv.dev" className="text-sky-deep underline">
                james@btv.dev
              </a>
              .
            </p>
            <a
              href="https://github.com/JamesMitofsky/run-for-maps"
              target="_blank"
              rel="noopener noreferrer"
              className="border-paper-line hover:border-ink/20 mt-8 inline-flex items-center gap-3 rounded-sm border px-6 py-3 font-medium transition"
            >
              Open a pull request!
              <GithubLogoIcon size={20} weight="bold" />
            </a>
          </motion.div>
        </div>
      </section>

      {/* FINAL CTA */}
      <section className="border-paper-line relative overflow-hidden border-t">
        <Contours className="text-ink/[0.05] pointer-events-none absolute inset-0 h-full w-full" />
        <div className="relative mx-auto max-w-5xl px-5 py-24 text-center md:py-32">
          <motion.div
            {...fadeUp}
            className="mt-10 flex flex-wrap items-center justify-center gap-4"
          >
            <Link
              href="/login?returnTo=/plan"
              className="group bg-ink text-paper inline-flex items-center gap-2 rounded-sm px-9 py-4 text-lg font-bold transition hover:gap-3"
            >
              Connect with OSM to begin!
              <ArrowRightIcon
                size={20}
                weight="bold"
                className="transition-transform group-hover:translate-x-1"
              />
            </Link>
          </motion.div>
        </div>
      </section>

      {/* FOOTER */}
      <footer className="border-paper-line border-t">
        <div className="text-ink-dim mx-auto flex max-w-6xl items-center justify-center gap-4 px-5 py-8 text-sm">
          <span>
            Made with{" "}
            <HeartIcon weight="fill" className="text-sky-deep inline-block align-middle" /> by{" "}
            <a
              href="https://jamesm.it/about"
              target="_blank"
              rel="noopener noreferrer"
              className="text-ink decoration-sky-deep/50 hover:decoration-sky-deep font-medium underline underline-offset-4"
            >
              James Mitofsky
            </a>
          </span>
        </div>
      </footer>
    </main>
  );
}

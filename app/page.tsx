"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import {
  ArrowRightIcon,
  MapTrifoldIcon,
  PathIcon,
  PersonSimpleRunIcon,
  RulerIcon,
  GlobeHemisphereWestIcon,
  CompassIcon,
  CheckCircleIcon,
} from "@phosphor-icons/react";

/* ------------------------------------------------------------------ */
/* Decorative topographic contour field for dark sections.            */
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

/* ------------------------------------------------------------------ */
/* Animated route line that draws itself across the hero.             */
/* ------------------------------------------------------------------ */
function RouteTrace() {
  const path =
    "M40 300 C 180 120, 300 360, 470 250 S 760 80, 900 240 S 1080 420, 1160 200";
  const nodes = [
    [40, 300],
    [300, 282],
    [620, 188],
    [900, 240],
    [1160, 200],
  ];
  return (
    <svg
      className="h-full w-full"
      viewBox="0 0 1200 480"
      fill="none"
      preserveAspectRatio="xMidYMid meet"
      aria-hidden
    >
      <motion.path
        d={path}
        stroke="var(--color-volt)"
        strokeWidth={3}
        strokeLinecap="round"
        strokeDasharray="1 14"
        initial={{ pathLength: 0, opacity: 0 }}
        animate={{ pathLength: 1, opacity: 1 }}
        transition={{ duration: 2.2, ease: "easeInOut" }}
      />
      {nodes.map(([x, y], i) => (
        <motion.g
          key={i}
          initial={{ scale: 0, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ delay: 0.5 + i * 0.32, type: "spring", stiffness: 240, damping: 14 }}
        >
          <circle cx={x} cy={y} r={14} fill="var(--color-volt)" opacity={0.18} />
          <circle cx={x} cy={y} r={6} fill="var(--color-volt)" />
          <circle cx={x} cy={y} r={6} fill="none" stroke="var(--color-ink)" strokeWidth={2} />
        </motion.g>
      ))}
    </svg>
  );
}

const fadeUp = {
  initial: { opacity: 0, y: 24 },
  whileInView: { opacity: 1, y: 0 },
  viewport: { once: true, margin: "-80px" },
  transition: { duration: 0.55, ease: [0.22, 1, 0.36, 1] as const },
};

const STEPS = [
  {
    icon: MapTrifoldIcon,
    n: "01",
    title: "Place",
    body: "Pick the place. Search an address, tap the map, or drop on your live location.",
  },
  {
    icon: RulerIcon,
    n: "02",
    title: "Distance",
    body: "Set how far you want to run. The route fills to fit — split a whole city across as many runs as you like.",
  },
  {
    icon: PathIcon,
    n: "03",
    title: "Route",
    body: "Clarify the waypoints or goals you want to hit, then let it thread a real running route past the points that matter.",
  },
  {
    icon: PersonSimpleRunIcon,
    n: "04",
    title: "Contribute",
    body: "Run the generated route and mark off how things are looking as you go — every check writes straight back to the open map.",
  },
];

const TICKER = [
  "check_date",
  "amenity=drinking_water",
  "disused:",
  "natural=spring",
  "verified ✓",
  "amenity=bench",
  "abandoned:",
  "one changeset",
  "open data",
];

export default function LandingPage() {
  return (
    <main className="bg-ink font-body text-cream">
      {/* NAV */}
      <header className="sticky top-0 z-50 border-b border-white/10 bg-ink/80 backdrop-blur-md">
        <nav className="mx-auto flex max-w-6xl items-center justify-between px-5 py-4">
          <Link href="/" className="flex items-center gap-2 font-display text-lg font-bold tracking-tight">
            <span className="inline-block h-2.5 w-2.5 animate-pulse rounded-full bg-volt" />
            Legwork Maps
          </Link>
          <Link
            href="/plan"
            className="group flex items-center gap-1.5 rounded-full bg-volt px-4 py-2 text-sm font-semibold text-ink transition hover:gap-2.5"
          >
            Open planner
            <ArrowRightIcon size={16} weight="bold" className="transition-transform group-hover:translate-x-0.5" />
          </Link>
        </nav>
      </header>

      {/* HERO */}
      <section className="grain relative overflow-hidden">
        <Contours className="pointer-events-none absolute inset-0 h-full w-full text-volt/25" />
        <div className="pointer-events-none absolute inset-x-0 top-1/2 hidden h-[480px] -translate-y-1/2 opacity-90 md:block">
          <RouteTrace />
        </div>

        {/* Readability scrim: opaque ink under the copy (left), clears toward the route (right). */}
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-r from-ink via-ink/85 to-transparent md:via-ink/70" />
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-ink/40 via-transparent to-ink" />

        <div className="relative mx-auto max-w-6xl px-5 pb-24 pt-20 md:pb-32 md:pt-28">
          <motion.span
            {...fadeUp}
            className="inline-flex items-center gap-2 rounded-full border border-volt/40 bg-volt/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-volt"
          >
            <GlobeHemisphereWestIcon size={14} weight="fill" />
            Open-source fieldwork
          </motion.span>

          <motion.h1
            {...fadeUp}
            transition={{ ...fadeUp.transition, delay: 0.05 }}
            className="mt-6 max-w-4xl font-display text-[clamp(2.4rem,7vw,5.25rem)] font-bold leading-[0.95] tracking-tight"
          >
            Put in the <span className="text-volt">Legwork</span>
          </motion.h1>

          <motion.p
            {...fadeUp}
            transition={{ ...fadeUp.transition, delay: 0.12 }}
            className="mt-7 max-w-xl text-lg leading-relaxed text-cream-dim"
          >
            Free maps, sourced from the public is an <em className="italic text-cream">incredible</em> feat.
            With all my love for OpenStreetMaps, this is a little tool for integrating upkeep of
            our maps into your outings—be they runs, bike rides, leisurely strolls, or whatever!
          </motion.p>

          <motion.div
            {...fadeUp}
            transition={{ ...fadeUp.transition, delay: 0.18 }}
            className="mt-9 flex flex-wrap items-center gap-3"
          >
            <Link
              href="/plan"
              className="group flex items-center gap-2 rounded-full bg-volt px-7 py-3.5 text-base font-bold text-ink transition hover:gap-3 hover:bg-cream"
            >
              Plan a run
              <ArrowRightIcon size={18} weight="bold" className="transition-transform group-hover:translate-x-1" />
            </Link>
            <a
              href="#how"
              className="rounded-full border border-white/20 px-7 py-3.5 text-base font-semibold text-cream transition hover:border-volt hover:text-volt"
            >
              How it works
            </a>
          </motion.div>

          {/* stat strip */}
          <motion.dl
            {...fadeUp}
            transition={{ ...fadeUp.transition, delay: 0.26 }}
            className="mt-16 grid max-w-xs grid-cols-1 gap-px overflow-hidden rounded-2xl border border-white/10 bg-white/5"
          >
            {[
              { k: "∞", v: "points left to verify" },
            ].map((s) => (
              <div key={s.k} className="bg-ink/40 px-5 py-5">
                <dt className="font-display text-2xl font-bold text-volt">{s.k}</dt>
                <dd className="mt-1 text-sm text-cream-dim">{s.v}</dd>
              </div>
            ))}
          </motion.dl>
        </div>
      </section>

      {/* TICKER */}
      <div className="border-y border-white/10 bg-ink-soft py-3">
        <div className="flex w-max animate-marquee gap-8 whitespace-nowrap">
          {[...TICKER, ...TICKER].map((t, i) => (
            <span
              key={i}
              className="flex items-center gap-8 font-display text-sm font-medium uppercase tracking-widest text-cream-dim"
            >
              {t}
              <span className="text-volt">/</span>
            </span>
          ))}
        </div>
      </div>

      {/* HOW IT WORKS */}
      <section id="how" className="mx-auto max-w-6xl px-5 py-24 md:py-32">
        <motion.div {...fadeUp} className="max-w-2xl">
          <p className="font-display text-sm font-semibold uppercase tracking-[0.2em] text-volt">
            The loop
          </p>
          <h2 className="mt-3 font-display text-[clamp(2rem,5vw,3.4rem)] font-bold leading-tight tracking-tight">
            Plan it, run it, write it back.
          </h2>
        </motion.div>

        <div className="mt-14 grid gap-5 sm:grid-cols-2">
          {STEPS.map((step, i) => {
            const Icon = step.icon;
            return (
              <motion.div
                key={step.n}
                {...fadeUp}
                transition={{ ...fadeUp.transition, delay: i * 0.06 }}
                className="group relative overflow-hidden rounded-3xl border border-white/10 bg-ink-soft p-7 transition hover:border-volt/50"
              >
                <div className="flex items-start justify-between">
                  <Icon size={36} weight="duotone" className="text-volt" />
                  <span className="font-display text-5xl font-bold text-white/5 transition group-hover:text-volt/20">
                    {step.n}
                  </span>
                </div>
                <h3 className="mt-6 font-display text-xl font-semibold">{step.title}</h3>
                <p className="mt-2 text-cream-dim">{step.body}</p>
              </motion.div>
            );
          })}
        </div>
      </section>

      {/* MANIFESTO SPLIT */}
      <section className="border-y border-white/10 bg-ink-soft">
        <div className="mx-auto grid max-w-6xl gap-12 px-5 py-24 md:grid-cols-2 md:py-32">
          <motion.div {...fadeUp}>
            <h2 className="font-display text-[clamp(2rem,5vw,3.4rem)] font-bold leading-[1.05] tracking-tight">
              The map is only as good as the people
              <span className="text-volt"> who go check.</span>
            </h2>
            <p className="mt-6 text-lg leading-relaxed text-cream-dim">
              OpenStreetMap powers the apps you already trust, and the real world it maps
              never stops moving. Satellites can&apos;t tell you the fountain is flowing or the
              bench is still there.
            </p>
            <p className="mt-4 text-lg leading-relaxed text-cream-dim">
              Legwork Maps turns your training miles into the most boring, most valuable
              thing in open data: someone actually showing up.
            </p>
          </motion.div>

          <motion.ul {...fadeUp} transition={{ ...fadeUp.transition, delay: 0.1 }} className="flex flex-col gap-4">
            {[
              { icon: CompassIcon, h: "Built for the run, not the desk", b: "Turn-toward-next-point guidance with live distance — phone-first, glanceable, sweat-proof." },
              { icon: CheckCircleIcon, h: "Honest by design", b: "Working, out-of-order, or removed — mapped straight onto OSM lifecycle tags with today's date." },
              { icon: GlobeHemisphereWestIcon, h: "Yours stays public", b: "No accounts to sell, no keys to buy. Edits are attributed to you and free for everyone." },
            ].map((f) => {
              const Icon = f.icon;
              return (
                <li key={f.h} className="flex gap-4 rounded-2xl border border-white/10 bg-ink/40 p-5">
                  <Icon size={28} weight="bold" className="mt-0.5 shrink-0 text-volt" />
                  <div>
                    <h3 className="font-display font-semibold">{f.h}</h3>
                    <p className="mt-1 text-sm text-cream-dim">{f.b}</p>
                  </div>
                </li>
              );
            })}
          </motion.ul>
        </div>
      </section>

      {/* FINAL CTA */}
      <section className="grain relative overflow-hidden">
        <Contours className="pointer-events-none absolute inset-0 h-full w-full text-volt/20" />
        <div className="relative mx-auto max-w-4xl px-5 py-28 text-center md:py-36">
          <motion.h2
            {...fadeUp}
            className="font-display text-[clamp(2.4rem,7vw,5rem)] font-bold leading-[0.95] tracking-tight"
          >
            Lace up. <span className="text-volt">Fix the map.</span>
          </motion.h2>
          <motion.p
            {...fadeUp}
            transition={{ ...fadeUp.transition, delay: 0.08 }}
            className="mx-auto mt-6 max-w-lg text-lg text-cream-dim"
          >
            Pick a distance, pick a tag, and go make the world&apos;s map a little more true.
          </motion.p>
          <motion.div {...fadeUp} transition={{ ...fadeUp.transition, delay: 0.16 }} className="mt-10">
            <Link
              href="/plan"
              className="group inline-flex items-center gap-2 rounded-full bg-volt px-9 py-4 text-lg font-bold text-ink transition hover:gap-3 hover:bg-cream"
            >
              Plan your first run
              <ArrowRightIcon size={20} weight="bold" className="transition-transform group-hover:translate-x-1" />
            </Link>
          </motion.div>
        </div>
      </section>

      {/* FOOTER */}
      <footer className="border-t border-white/10">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 px-5 py-8 text-sm text-cream-dim sm:flex-row">
          <span className="flex items-center gap-2 font-display font-bold text-cream">
            <span className="inline-block h-2 w-2 rounded-full bg-volt" />
            Legwork Maps
          </span>
          <span>
            Made with <span className="text-volt">♥</span> by{" "}
            <a
              href="https://btv.dev/about"
              target="_blank"
              rel="noopener noreferrer"
              className="font-medium text-cream underline decoration-volt/40 underline-offset-4 hover:decoration-volt"
            >
              James Mitofsky
            </a>
          </span>
        </div>
      </footer>
    </main>
  );
}

import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRightIcon, CompassIcon } from "@phosphor-icons/react/dist/ssr";

export const metadata: Metadata = {
  title: "Off the map — 404",
  description: "This route doesn't exist yet.",
};

// Decorative topographic contour field, echoing the landing hero.
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
    </svg>
  );
}

export default function NotFound() {
  return (
    <main className="paper-grain bg-paper font-body text-ink relative flex min-h-dvh flex-col items-center justify-center overflow-hidden px-6 text-center">
      <Contours className="text-ink pointer-events-none absolute inset-0 h-full w-full opacity-[0.08]" />

      <div className="relative z-10 flex flex-col items-center">
        <span className="text-ink-dim font-mono text-[0.65rem] font-medium tracking-[0.22em] uppercase">
          Error 404
        </span>

        <div className="border-ink/10 bg-sky mt-6 flex h-16 w-16 items-center justify-center rounded-xl border">
          <CompassIcon size={30} weight="duotone" className="text-ink" />
        </div>

        <h1 className="font-display mt-6 text-4xl font-bold sm:text-5xl">Off the map</h1>
        <p className="text-ink-dim mt-3 max-w-sm text-balance">
          This route isn&apos;t on any survey we know. It may have moved, or never existed.
        </p>

        <Link
          href="/"
          className="group bg-ink text-paper mt-8 inline-flex items-center gap-2 rounded-sm px-8 py-3.5 font-bold transition hover:gap-3"
        >
          Back to base
          <ArrowRightIcon
            size={18}
            weight="bold"
            className="transition group-hover:translate-x-0.5"
          />
        </Link>
      </div>
    </main>
  );
}

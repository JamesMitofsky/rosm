"use client";

import { useRef } from "react";
import { useGSAP } from "@gsap/react";
import gsap from "gsap";
import {
  ArrowLeftIcon,
  ArrowRightIcon,
  CrosshairIcon,
  MagnifyingGlassIcon,
  MapPinIcon,
} from "@phosphor-icons/react";
import Button from "@/components/ui/Button";
import ErrorNotice from "@/components/ui/ErrorNotice";
import SegmentedControl from "@/components/ui/SegmentedControl";
import { usePlanner } from "@/store/planner";
import type { RecencyMode } from "@/lib/schemas";

// Recency filter modes, shown as a segmented control in the radius step.
const RECENCY_MODES: { key: RecencyMode; label: string }[] = [
  { key: "stale", label: "Not checked in" },
  { key: "fresh", label: "Checked within" },
  { key: "any", label: "Any time" },
];

// The guided config steps, answered one at a time before the map takes over.
const STEPS = [
  { key: "where", title: "Where do you start?", hint: "Click on the map or search" },
  { key: "radius", title: "How wide should we search?", hint: undefined },
] as const;

// Config phase: one question at a time, then "Find points" hands over to the map.
export default function ConfigWizard() {
  const p = usePlanner();
  const scope = useRef<HTMLElement>(null);

  // Fade the active question in whenever the step changes. Opacity only — no
  // transforms, so an interrupted tween can never leave a translated ghost copy.
  useGSAP(
    () => {
      gsap.fromTo(
        ".wizard-step",
        { autoAlpha: 0 },
        { autoAlpha: 1, duration: 0.4, ease: "power3.out" },
      );
    },
    { dependencies: [p.step], scope },
  );

  const active = STEPS[p.step];
  const canAdvance = p.step === 0 ? !!p.center : true;

  return (
    <section ref={scope} className="flex w-full max-w-md flex-col gap-5 md:h-full">
      {/* Step progress */}
      <div className="flex items-center gap-2">
        {STEPS.map((s, i) => (
          <div
            key={s.key}
            className={`h-1.5 flex-1 rounded-full transition-colors ${i <= p.step ? "bg-sky-deep" : "bg-paper-deep"}`}
          />
        ))}
      </div>

      <div className="wizard-step flex flex-col gap-4">
        <div className="flex flex-col gap-1">
          <h2 className="font-display text-2xl leading-tight font-bold">{active.title}</h2>
          {active.hint && <p className="text-ink-dim text-sm">{active.hint}</p>}
        </div>

        {/* Step 1 — start location */}
        {active.key === "where" && (
          <div className="flex flex-col gap-3">
            <div className="flex gap-2">
              <div className="border-paper-line bg-paper/40 focus-within:border-sky-deep/60 flex flex-1 items-center gap-2 rounded-lg border px-2">
                <MagnifyingGlassIcon size={16} className="text-ink-dim" />
                <input
                  className="text-ink placeholder:text-ink-dim w-full bg-transparent py-2 text-sm outline-none"
                  placeholder="Search address / city"
                  value={p.addr}
                  onChange={(e) => p.setAddr(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && p.searchAddr()}
                />
              </div>
              <button
                onClick={p.geolocate}
                title="Use my location"
                className="border-paper-line bg-paper/40 text-ink hover:border-sky-deep/60 hover:text-sky-deep rounded-lg border px-3 transition"
              >
                <CrosshairIcon size={18} />
              </button>
            </div>
            {!p.center && (
              <p className="border-paper-line bg-paper/40 text-ink-dim rounded-lg border px-3 py-2 text-xs">
                No start point yet — search, locate, or tap the map.
              </p>
            )}
          </div>
        )}

        {/* Step 2 — search radius (defines the pool of points to choose from) */}
        {active.key === "radius" && (
          <div className="flex flex-col gap-4">
            <label className="flex items-center gap-2 text-sm">
              <input
                type="number"
                min={0.5}
                step={0.5}
                value={p.radiusMi}
                onChange={(e) => p.setRadiusMi(e.target.value === "" ? "" : Number(e.target.value))}
                className="border-paper-line bg-paper/40 text-ink focus:border-sky-deep/60 w-20 rounded-lg border px-2 py-2 outline-none"
              />
              mile search radius
            </label>

            {/* Recency filter — narrow the pool by when each point was last
                surveyed (OSM check_date). Defaults to points not checked in
                the last 6 months: the ones worth verifying on the ground. */}
            <div className="flex flex-col gap-2">
              <SegmentedControl
                options={RECENCY_MODES}
                value={p.recencyMode}
                onChange={p.setRecencyMode}
              />
              {p.recencyMode !== "any" && (
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="number"
                    min={1}
                    step={1}
                    value={p.recencyMonths}
                    onChange={(e) =>
                      p.setRecencyMonths(e.target.value === "" ? "" : Number(e.target.value))
                    }
                    className="border-paper-line bg-paper/40 text-ink focus:border-sky-deep/60 w-20 rounded-lg border px-2 py-2 outline-none"
                  />
                  <span className="text-ink-dim">months</span>
                </label>
              )}
              <p className="text-ink-dim text-xs">
                {p.recencyMode === "stale"
                  ? `Show points not surveyed in the last ${p.recencyMonths || 6} months (or never) — the ones worth checking.`
                  : p.recencyMode === "fresh"
                    ? `Show only points surveyed within the last ${p.recencyMonths || 6} months.`
                    : "Show all matching points regardless of when last surveyed."}
              </p>
            </div>
          </div>
        )}
      </div>

      {p.err && (
        <ErrorNotice
          message={p.err}
          onRetry={p.errRetryable ? p.findPoints : undefined}
          retrying={p.busy === "find"}
        />
      )}

      {/* Wizard nav */}
      <div className="mt-auto flex items-center gap-3 pt-4 pb-4 md:pb-0">
        <button
          onClick={() => p.setStep(Math.max(0, p.step - 1))}
          disabled={p.step === 0}
          className="border-paper-line text-ink-dim hover:text-ink flex items-center gap-1.5 rounded-sm border px-4 py-2.5 text-sm font-semibold transition disabled:pointer-events-none disabled:opacity-0"
        >
          <ArrowLeftIcon size={16} />
          Back
        </button>
        {p.step < STEPS.length - 1 ? (
          <Button
            onClick={() => p.setStep(Math.min(STEPS.length - 1, p.step + 1))}
            disabled={!canAdvance}
            className="ml-auto flex items-center gap-1.5"
          >
            Next
            <ArrowRightIcon size={16} />
          </Button>
        ) : (
          <Button
            onClick={p.finishConfig}
            disabled={!p.center || p.busy !== null}
            className="ml-auto flex w-40 items-center justify-center gap-1.5"
          >
            <MapPinIcon size={16} />
            {p.busy === "find" ? "Finding…" : "Find points"}
          </Button>
        )}
      </div>
    </section>
  );
}

"use client";

import Button from "@/components/ui/Button";
import { usePlanner } from "@/store/planner";
import { fmtDist } from "@/lib/geo";

// Resume offer: a route from a prior session survived a refresh. Renders
// nothing unless the draft load found one.
export default function ResumeDraftPrompt() {
  const resumable = usePlanner((s) => s.resumable);
  const resumeDraft = usePlanner((s) => s.resumeDraft);
  const dismissDraft = usePlanner((s) => s.dismissDraft);

  if (!resumable) return null;

  return (
    <div className="border-sky-deep/40 bg-paper-deep/95 pointer-events-auto absolute top-20 left-1/2 z-[1001] flex w-[calc(100%-2rem)] max-w-md -translate-x-1/2 flex-col gap-3 rounded-2xl border p-4 shadow-2xl backdrop-blur-md md:top-6">
      <div className="flex flex-col gap-0.5">
        <span className="font-display text-ink text-sm font-bold">Resume your route?</span>
        <span className="text-ink-dim text-xs">
          {resumable.stops.length} stops · {fmtDist(resumable.distanceM)} — saved from your last
          session.
        </span>
      </div>
      <div className="flex items-center gap-2">
        <Button onClick={resumeDraft} size="sm" className="flex-1">
          Resume
        </Button>
        <Button onClick={dismissDraft} variant="outline" size="sm">
          Start fresh
        </Button>
      </div>
    </div>
  );
}

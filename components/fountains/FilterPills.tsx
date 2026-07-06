"use client";

import type { ReactNode } from "react";
import Pill from "@/components/ui/Pill";
import { toggled, type Counts, type Recency, type Svc, type Water } from "@/lib/fountainFilters";

function PillRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <span className="text-ink-dim mr-0.5 text-[11px] font-semibold tracking-wide uppercase">
        {label}
      </span>
      {children}
    </div>
  );
}

export default function FilterPills({
  svc,
  setSvc,
  water,
  setWater,
  rec,
  setRec,
  counts,
}: {
  svc: Set<Svc>;
  setSvc: (s: Set<Svc>) => void;
  water: Set<Water>;
  setWater: (s: Set<Water>) => void;
  rec: Set<Recency>;
  setRec: (s: Set<Recency>) => void;
  counts: Counts;
}) {
  return (
    <div className="flex flex-col gap-2.5">
      <PillRow label="Service">
        <Pill active={svc.has("in")} count={counts.inN} onClick={() => setSvc(toggled(svc, "in"))}>
          In service
        </Pill>
        <Pill
          active={svc.has("out")}
          count={counts.outN}
          onClick={() => setSvc(toggled(svc, "out"))}
        >
          Out of service
        </Pill>
      </PillRow>
      <PillRow label="Water">
        <Pill
          active={water.has("human")}
          count={counts.humanN}
          onClick={() => setWater(toggled(water, "human"))}
        >
          Human
        </Pill>
        <Pill
          active={water.has("dog")}
          count={counts.dogN}
          onClick={() => setWater(toggled(water, "dog"))}
        >
          Dog
        </Pill>
      </PillRow>
      <PillRow label="Verified">
        <Pill
          active={rec.has("fresh")}
          count={counts.freshN}
          onClick={() => setRec(toggled(rec, "fresh"))}
        >
          Past year
        </Pill>
        <Pill
          active={rec.has("stale")}
          count={counts.staleN}
          onClick={() => setRec(toggled(rec, "stale"))}
        >
          Older
        </Pill>
        <Pill
          active={rec.has("never")}
          count={counts.neverN}
          onClick={() => setRec(toggled(rec, "never"))}
        >
          Never
        </Pill>
      </PillRow>
    </div>
  );
}

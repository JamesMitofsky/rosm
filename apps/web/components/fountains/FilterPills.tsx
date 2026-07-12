"use client";

import type { ReactNode } from "react";
import { CheckIcon } from "@phosphor-icons/react";
import { toggled, type Counts, type Svc, type Water } from "@/lib/fountainFilters";

function FilterGroup({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-2">
      <span className="text-ink-dim text-[11px] font-semibold tracking-wide uppercase">
        {label}
      </span>
      <div className="flex flex-wrap gap-2">{children}</div>
    </div>
  );
}

// One toggle pill: label + low-emphasis match count. Selected pills carry the
// sky accent + a check glyph; unselected read as quiet outlines.
function Pill({
  checked,
  count,
  onChange,
  children,
}: {
  checked: boolean;
  count: number;
  onChange: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={checked}
      onClick={onChange}
      className={`flex items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-sm font-medium transition ${
        checked
          ? "border-sky-deep bg-sky-deep/15 text-ink"
          : "border-paper-line text-ink-dim hover:border-ink-dim/40 hover:text-ink"
      }`}
    >
      {checked && <CheckIcon size={14} weight="bold" className="text-sky-deep" />}
      {children}
      <span className={checked ? "text-ink-dim" : "text-ink-dim/50"}>{count}</span>
    </button>
  );
}

export default function FilterPills({
  svc,
  setSvc,
  water,
  setWater,
  counts,
}: {
  svc: Set<Svc>;
  setSvc: (s: Set<Svc>) => void;
  water: Set<Water>;
  setWater: (s: Set<Water>) => void;
  counts: Counts;
}) {
  return (
    <div className="flex flex-col gap-5">
      <FilterGroup label="Status">
        <Pill
          checked={svc.has("in")}
          count={counts.inN}
          onChange={() => setSvc(toggled(svc, "in"))}
        >
          In service
        </Pill>
        <Pill
          checked={svc.has("out")}
          count={counts.outN}
          onChange={() => setSvc(toggled(svc, "out"))}
        >
          Out of service
        </Pill>
      </FilterGroup>
      <FilterGroup label="Intended for">
        <Pill
          checked={water.has("human")}
          count={counts.humanN}
          onChange={() => setWater(toggled(water, "human"))}
        >
          People
        </Pill>
        <Pill
          checked={water.has("dog")}
          count={counts.dogN}
          onChange={() => setWater(toggled(water, "dog"))}
        >
          Dogs
        </Pill>
      </FilterGroup>
    </div>
  );
}

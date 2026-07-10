"use client";

import type { ReactNode } from "react";
import { toggled, type Counts, type Svc, type Water } from "@/lib/fountainFilters";

function FilterGroup({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-ink-dim text-[11px] font-semibold tracking-wide uppercase">
        {label}
      </span>
      <div className="flex flex-wrap gap-x-4 gap-y-1.5">{children}</div>
    </div>
  );
}

// One checkbox option: label + low-emphasis match count.
function CheckOption({
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
    <label className="text-ink flex cursor-pointer items-center gap-2 text-sm">
      <input
        type="checkbox"
        checked={checked}
        onChange={onChange}
        className="accent-sky-deep h-4 w-4"
      />
      {children}
      <span className="text-ink-dim/55 font-normal">{count}</span>
    </label>
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
    <div className="flex flex-col gap-3">
      <FilterGroup label="Status">
        <CheckOption
          checked={svc.has("in")}
          count={counts.inN}
          onChange={() => setSvc(toggled(svc, "in"))}
        >
          In service
        </CheckOption>
        <CheckOption
          checked={svc.has("out")}
          count={counts.outN}
          onChange={() => setSvc(toggled(svc, "out"))}
        >
          Out of service
        </CheckOption>
      </FilterGroup>
      <FilterGroup label="Intended for">
        <CheckOption
          checked={water.has("human")}
          count={counts.humanN}
          onChange={() => setWater(toggled(water, "human"))}
        >
          People
        </CheckOption>
        <CheckOption
          checked={water.has("dog")}
          count={counts.dogN}
          onChange={() => setWater(toggled(water, "dog"))}
        >
          Dogs
        </CheckOption>
      </FilterGroup>
    </div>
  );
}

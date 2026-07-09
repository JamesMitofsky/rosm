"use client";

import type { ReactNode } from "react";

// One filter pill: label + low-emphasis match count, active/inactive states.
export default function Pill({
  active,
  count,
  onClick,
  children,
}: {
  active: boolean;
  count?: number;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold transition ${
        active ? "bg-sky-deep text-ink" : "bg-paper/40 text-ink-dim hover:text-ink"
      }`}
    >
      {children}
      {count != null && (
        <span className={`font-normal ${active ? "text-ink/55" : "text-ink-dim/55"}`}>{count}</span>
      )}
    </button>
  );
}

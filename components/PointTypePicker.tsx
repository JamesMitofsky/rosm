"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { CaretDownIcon, CheckIcon, MagnifyingGlassIcon } from "@phosphor-icons/react";
import { POINT_TYPES, ptKey, type PointType } from "@/lib/pointTypes";

type Selection = { key: string; value: string };

type Props = {
  value: Selection;
  onChange: (sel: Selection) => void;
};

// Parses a free-text "key=value" entry so users can target tags not in the list.
function parseCustom(query: string): PointType | null {
  const m = query.match(/^\s*([\w:]+)\s*=\s*([\w:_-]+)\s*$/);
  if (!m) return null;
  const [, key, value] = m;
  return { key, value, label: `${key} = ${value}`, group: "Custom" };
}

export default function PointTypePicker({ value, onChange }: Props) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [activeIdx, setActiveIdx] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const selected = useMemo(
    () => POINT_TYPES.find((p) => p.key === value.key && p.value === value.value),
    [value],
  );
  const selectedLabel = selected?.label ?? `${value.key} = ${value.value}`;

  // Filter on label/value/key/group; preserve the curated ordering of the list.
  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return POINT_TYPES;
    const hits = POINT_TYPES.filter((p) =>
      `${p.label} ${p.key} ${p.value} ${p.group}`.toLowerCase().includes(q),
    );
    const custom = parseCustom(query);
    if (custom && !hits.some((p) => ptKey(p) === ptKey(custom))) hits.push(custom);
    return hits;
  }, [query]);

  // Reset the keyboard cursor whenever the candidate set changes.
  useEffect(() => setActiveIdx(0), [query]);

  // Close on outside click.
  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  function openMenu() {
    setOpen(true);
    setQuery("");
    requestAnimationFrame(() => inputRef.current?.focus());
  }

  function pick(pt: PointType) {
    onChange({ key: pt.key, value: pt.value });
    setOpen(false);
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIdx((i) => Math.min(i + 1, matches.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIdx((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (matches[activeIdx]) pick(matches[activeIdx]);
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  }

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => (open ? setOpen(false) : openMenu())}
        className="flex w-full items-center justify-between gap-2 rounded border border-neutral-300 px-2 py-2 text-left text-sm hover:bg-neutral-50"
      >
        <span className="truncate">{selectedLabel}</span>
        <CaretDownIcon size={16} className="shrink-0 text-neutral-400" />
      </button>

      {open && (
        <div className="absolute z-[1000] mt-1 w-full overflow-hidden rounded border border-neutral-300 bg-white shadow-lg">
          <div className="flex items-center gap-2 border-b border-neutral-100 px-2">
            <MagnifyingGlassIcon size={16} className="shrink-0 text-neutral-400" />
            <input
              ref={inputRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={onKeyDown}
              placeholder="Search point types or type key=value"
              className="w-full bg-transparent py-2 text-sm outline-none"
            />
            <span className="shrink-0 text-xs text-neutral-300">{matches.length}</span>
          </div>

          <ul className="max-h-72 overflow-y-auto py-1">
            {matches.length === 0 && (
              <li className="px-3 py-2 text-sm text-neutral-400">No matches</li>
            )}
            {matches.map((pt, i) => {
              const isSel = pt.key === value.key && pt.value === value.value;
              const showGroup = i === 0 || pt.group !== matches[i - 1].group;
              return (
                <li key={`${ptKey(pt)}-${i}`}>
                  {showGroup && (
                    <div className="px-3 pb-0.5 pt-2 text-[11px] font-medium uppercase tracking-wide text-neutral-400">
                      {pt.group}
                    </div>
                  )}
                  <button
                    type="button"
                    onClick={() => pick(pt)}
                    onMouseEnter={() => setActiveIdx(i)}
                    className={`flex w-full items-center justify-between gap-2 px-3 py-1.5 text-left text-sm ${
                      i === activeIdx ? "bg-neutral-100" : ""
                    }`}
                  >
                    <span className="flex items-center gap-2 truncate">
                      {pt.label}
                      <span className="truncate text-xs text-neutral-400">{ptKey(pt)}</span>
                    </span>
                    {isSel && <CheckIcon size={14} className="shrink-0 text-green-600" />}
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}

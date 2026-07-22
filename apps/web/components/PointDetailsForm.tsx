"use client";

import { useMemo, useState, type ReactNode } from "react";
import { SnowflakeIcon } from "@phosphor-icons/react";
import type { Audience, Dispenser, EditExtras } from "@rosm/core/schemas";
import { audienceFromTags } from "@/lib/audience";
import { dispenserFromTags } from "@/lib/dispenser";
import AudienceToggle from "@/components/AudienceToggle";
import DispenserToggle from "@/components/DispenserToggle";

const QUICK_TAGS = [
  "Not draining",
  "Low water pressure",
  "One fountain not running",
  "Bottle filler not running",
];

export default function PointDetailsForm({
  tags,
  busy,
  submitLabel,
  submitIcon,
  submitClassName = "bg-green-600 hover:bg-green-700",
  onSubmit,
  isRemoved = false,
  isOutOfOrder = false,
  isBroken = false,
}: {
  tags: Record<string, string>;
  busy: boolean;
  submitLabel: string;
  submitIcon?: ReactNode;
  submitClassName?: string;
  onSubmit: (extras?: EditExtras) => void;
  isRemoved?: boolean;
  isOutOfOrder?: boolean;
  isBroken?: boolean;
}) {
  // Derive initial values from tags — recalculated when `tags` identity changes.
  const defaults = useMemo(
    () => ({
      seasonal: tags.seasonal === "yes",
      audience: audienceFromTags(tags),
      dispenser: dispenserFromTags(tags),
      note: tags.note ?? tags.description ?? "",
    }),
    [tags],
  );

  const [seasonal, setSeasonal] = useState(defaults.seasonal);
  const [audience, setAudience] = useState<Audience>(defaults.audience);
  const [dispenser, setDispenser] = useState<Dispenser>(defaults.dispenser);
  const [note, setNote] = useState(defaults.note);

  function toggleQuickTag(tagText: string) {
    if (note.includes(tagText)) {
      const updated = note
        .split(";")
        .map((s) => s.trim())
        .filter((s) => s !== tagText)
        .join("; ");
      setNote(updated);
    } else {
      setNote(note ? `${note}; ${tagText}` : tagText);
    }
  }

  function buildExtras(): EditExtras | undefined {
    const trimmed = note.trim();
    if (isRemoved) {
      return trimmed ? { note: trimmed } : undefined;
    }
    const extras: EditExtras = { audience, dispenser };
    if (seasonal && !isOutOfOrder) extras.seasonal = true;
    if (trimmed) extras.note = trimmed;
    return Object.keys(extras).length ? extras : undefined;
  }

  return (
    <div className="flex flex-col gap-2.5">
      {isRemoved ? (
        <div className="rounded border border-red-200 bg-red-50 p-2 text-xs font-medium text-red-700">
          Confirm marking this fountain as removed.
        </div>
      ) : (
        <>
          <AudienceToggle value={audience} onChange={setAudience} />
          <DispenserToggle value={dispenser} onChange={setDispenser} />
          {!isOutOfOrder && (
            <label
              className={`flex cursor-pointer items-center justify-between rounded-lg border p-2.5 transition ${
                seasonal
                  ? "border-sky-500 bg-sky-50/70"
                  : "border-neutral-200 bg-neutral-50 hover:bg-neutral-100"
              }`}
            >
              <div className="flex items-center gap-2.5">
                <input
                  type="checkbox"
                  checked={seasonal}
                  onChange={(e) => setSeasonal(e.target.checked)}
                  className="size-4 cursor-pointer rounded border-neutral-300 accent-sky-600"
                />
                <div className="flex flex-col">
                  <span className="text-xs font-bold text-neutral-900">Seasonal fountain</span>
                  <span className="text-[11px] font-medium text-neutral-500">
                    Runs only part of the year
                  </span>
                </div>
              </div>
              <SnowflakeIcon
                size={18}
                className={seasonal ? "text-sky-600" : "text-neutral-400"}
                weight={seasonal ? "fill" : "regular"}
              />
            </label>
          )}
        </>
      )}

      {isBroken && (
        <div className="flex flex-col gap-1.5 pt-1">
          <span className="text-[11px] font-bold tracking-wider text-neutral-600 uppercase">
            What&apos;s wrong with the fountain?
          </span>
          <div className="flex flex-wrap gap-1">
            {QUICK_TAGS.map((tag) => {
              const active = note.includes(tag);
              return (
                <button
                  key={tag}
                  type="button"
                  onClick={() => toggleQuickTag(tag)}
                  className={`rounded border px-2 py-1 text-[11px] font-medium transition ${
                    active
                      ? "border-amber-600 bg-amber-500 text-white"
                      : "border-neutral-200 bg-neutral-50 text-neutral-700 hover:bg-neutral-100"
                  }`}
                >
                  {tag}
                </button>
              );
            })}
          </div>
        </div>
      )}

      <textarea
        value={note}
        onChange={(e) => setNote(e.target.value)}
        placeholder={isBroken ? "Describe what's wrong…" : "Add a public note…"}
        rows={2}
        maxLength={255}
        className="resize-none rounded-md border border-neutral-300 px-2 py-1.5 text-xs text-neutral-800 placeholder:text-neutral-400 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none"
      />
      <button
        disabled={busy}
        onClick={() => onSubmit(buildExtras())}
        className={`flex items-center justify-center gap-1.5 rounded-md py-2 text-xs font-semibold text-white shadow-sm transition disabled:opacity-50 ${submitClassName}`}
      >
        {submitIcon} {submitLabel}
      </button>
    </div>
  );
}

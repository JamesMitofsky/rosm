"use client";

import { useState, type ReactNode } from "react";
import type { Audience, Dispenser, EditExtras } from "@/lib/schemas";
import { audienceFromTags } from "@/lib/audience";
import { dispenserFromTags } from "@/lib/dispenser";
import AudienceToggle from "@/components/AudienceToggle";
import DispenserToggle from "@/components/DispenserToggle";

// The survey-details form: audience (humans/dogs/both), seasonal, public note,
// and a single submit. It's the second step of PointPopup's confirm flow and
// the whole body of the add-a-point popup — one form so a new point and a
// re-survey record the same facts the same way. Prefilled from the node's
// current tags so the surveyor sees and can edit what's already recorded; a
// brand-new point passes {} and starts from the defaults.
export default function PointDetailsForm({
  tags,
  busy,
  submitLabel,
  submitIcon,
  submitClassName = "bg-green-600 hover:bg-green-700",
  onSubmit,
}: {
  tags: Record<string, string>;
  busy: boolean;
  submitLabel: string;
  submitIcon?: ReactNode;
  // Colour of the final submit CTA. Green (default) confirms working; a caller
  // marking the point out of order passes an amber variant so the action reads
  // as a downgrade, not a confirmation.
  submitClassName?: string;
  onSubmit: (extras?: EditExtras) => void;
}) {
  const [seasonal, setSeasonal] = useState(tags.seasonal === "yes");
  const [audience, setAudience] = useState<Audience>(audienceFromTags(tags));
  const [dispenser, setDispenser] = useState<Dispenser>(dispenserFromTags(tags));
  const [note, setNote] = useState(tags.note ?? "");

  function buildExtras(): EditExtras | undefined {
    const trimmed = note.trim();
    const extras: EditExtras = { audience, dispenser };
    if (seasonal) extras.seasonal = true;
    if (trimmed) extras.note = trimmed;
    return Object.keys(extras).length ? extras : undefined;
  }

  return (
    <div className="flex flex-col gap-2.5">
      <AudienceToggle value={audience} onChange={setAudience} />
      <DispenserToggle value={dispenser} onChange={setDispenser} />
      <label className="flex items-center gap-2 text-xs text-neutral-700">
        <input
          type="checkbox"
          checked={seasonal}
          onChange={(e) => setSeasonal(e.target.checked)}
          className="size-3.5 accent-neutral-800"
        />
        <span>Seasonal</span>
      </label>
      <textarea
        value={note}
        onChange={(e) => setNote(e.target.value)}
        placeholder="Add a public note…"
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

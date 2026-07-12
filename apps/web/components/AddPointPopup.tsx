"use client";

import { useState } from "react";
import { CircleNotchIcon, MapPinPlusIcon } from "@phosphor-icons/react";
import type { EditExtras } from "@/lib/schemas";
import PointDetailsForm from "@/components/PointDetailsForm";

// Map popup shown above a tapped empty spot, offering to create a brand-new OSM
// node there. The tap only pins the popup — the node is created on submit. The
// body is the same survey-details form as PointPopup's confirm step (audience /
// seasonal / note), so a new point records the same facts as a re-survey.
// Creation is online-only (a fresh node id has to come back from OSM), so the
// submit holds a spinner while the request is in flight; the caller closes the
// popup once the create settles (errors surface in the host page's error slot).
export default function AddPointPopup({
  label,
  onAdd,
}: {
  /** Human name of the point type being added, e.g. "Drinking water". */
  label: string;
  onAdd: (extras?: EditExtras) => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  return (
    <div className="flex w-60 flex-col gap-2.5 text-neutral-800">
      <div className="text-xs font-medium tracking-wide text-neutral-500 uppercase">
        New {label.toLowerCase()}
      </div>
      <PointDetailsForm
        tags={{}}
        busy={busy}
        submitLabel={`Add ${label.toLowerCase()}`}
        submitIcon={
          busy ? (
            <CircleNotchIcon size={16} weight="bold" className="animate-spin" />
          ) : (
            <MapPinPlusIcon size={16} />
          )
        }
        onSubmit={async (extras) => {
          setBusy(true);
          try {
            await onAdd(extras);
          } finally {
            setBusy(false);
          }
        }}
      />
    </div>
  );
}

"use client";

import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { CompassIcon, XIcon } from "@phosphor-icons/react";

// iOS gates the compass behind a user-gesture permission grant. We surface that
// grant as a centered modal (not a corner button) so it's hard to miss — the
// heading arrow is dead weight until the user taps Enable. Dismissable to "Not
// now", which keeps the GPS-heading fallback and hides the prompt for the run.
export default function CompassEnableModal({
  open,
  onEnable,
}: {
  open: boolean;
  onEnable: () => void;
}) {
  const [dismissed, setDismissed] = useState(false);
  const show = open && !dismissed;

  return (
    <AnimatePresence>
      {show && (
        <motion.div
          className="absolute inset-0 z-[1100] grid place-items-center p-4"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          <div
            className="bg-ink/30 absolute inset-0 backdrop-blur-sm"
            onClick={() => setDismissed(true)}
          />
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-labelledby="compass-modal-title"
            className="border-sky-deep/30 bg-paper relative flex w-full max-w-xs flex-col items-center gap-3 rounded-2xl border p-6 text-center shadow-2xl"
            initial={{ opacity: 0, scale: 0.94, y: 8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.94, y: 8 }}
          >
            <button
              onClick={() => setDismissed(true)}
              aria-label="Dismiss"
              className="text-ink-dim/70 hover:text-ink absolute top-3 right-3"
            >
              <XIcon size={18} />
            </button>

            <span className="bg-sky-deep/10 text-sky-deep grid h-14 w-14 place-items-center rounded-full">
              <CompassIcon size={30} weight="fill" />
            </span>

            <h2 id="compass-modal-title" className="font-display text-ink text-base font-bold">
              Turn on the compass
            </h2>
            <p className="text-ink-dim text-sm">
              See which way you&rsquo;re facing on the map so the direction arrow points to your
              next stop.
            </p>

            <button
              onClick={onEnable}
              className="bg-sky-deep text-paper mt-1 flex w-full items-center justify-center gap-1.5 rounded-sm px-4 py-2.5 text-sm font-semibold shadow-md"
            >
              <CompassIcon size={16} weight="fill" />
              Enable compass
            </button>
            <button
              onClick={() => setDismissed(true)}
              className="text-ink-dim hover:text-ink text-xs font-medium"
            >
              Not now
            </button>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

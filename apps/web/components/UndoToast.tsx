"use client";

import { AnimatePresence, motion } from "framer-motion";
import { ArrowCounterClockwiseIcon, CheckCircleIcon, XIcon } from "@phosphor-icons/react";
import { useUndo } from "@/store/undo";
import { UNDO_WINDOW_MS } from "@/store/outbox";

// The 5s post-submission undo window. Pure view over the undo store (which owns
// the authoritative expiry timer — this component holds no timers, so it can
// unmount freely). Mounted once in the root layout: every submission surface
// (run guide, fountain map, add-here) shows the same toast.
export default function UndoToast() {
  const target = useUndo((s) => s.target);
  const busy = useUndo((s) => s.busy);
  const error = useUndo((s) => s.error);
  const perform = useUndo((s) => s.perform);
  const dismiss = useUndo((s) => s.dismiss);

  return (
    <AnimatePresence>
      {target && (
        <motion.div
          key={target.expiresAt}
          initial={{ opacity: 0, y: 16, x: "-50%" }}
          animate={{ opacity: 1, y: 0, x: "-50%" }}
          exit={{ opacity: 0, y: 16, x: "-50%" }}
          className="fixed bottom-20 left-1/2 z-[60] w-[calc(100%-2rem)] max-w-sm"
        >
          <div className="overflow-hidden rounded-lg bg-neutral-900 text-neutral-50 shadow-lg">
            <div className="flex items-center gap-2 p-3 text-sm">
              {error ? (
                <>
                  <span className="min-w-0 flex-1 text-red-300">Undo failed: {error}</span>
                  <button
                    onClick={dismiss}
                    aria-label="Dismiss"
                    className="shrink-0 rounded p-1.5 hover:bg-neutral-700"
                  >
                    <XIcon size={16} />
                  </button>
                </>
              ) : (
                <>
                  <CheckCircleIcon size={18} className="shrink-0 text-emerald-400" />
                  <span className="min-w-0 flex-1 truncate">Saved · {target.summary}</span>
                  <button
                    onClick={perform}
                    disabled={busy}
                    className="flex shrink-0 items-center gap-1.5 rounded bg-neutral-700 px-3 py-1.5 font-medium hover:bg-neutral-600 disabled:opacity-60"
                  >
                    <ArrowCounterClockwiseIcon size={14} />
                    {busy ? "Undoing…" : "Undo"}
                  </button>
                </>
              )}
            </div>
            {/* Cosmetic countdown; the authoritative expiry lives in the store. */}
            {!error && !busy && (
              <motion.div
                key={target.expiresAt}
                className="h-0.5 bg-neutral-500"
                initial={{ width: "100%" }}
                animate={{ width: 0 }}
                transition={{ duration: UNDO_WINDOW_MS / 1000, ease: "linear" }}
              />
            )}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

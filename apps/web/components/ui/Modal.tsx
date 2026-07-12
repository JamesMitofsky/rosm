"use client";

import { useEffect, type ReactNode } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { XIcon } from "@phosphor-icons/react";

// A centered overlay dialog that fills most of the screen. Mobile-first: a
// near-full-bleed sheet on small screens, a bounded card on larger ones. The
// backdrop and the close button both dismiss it; `dismissible={false}` hides the
// close affordance and ignores backdrop taps (e.g. while work is in flight).
//
// `contained` scopes the overlay to its nearest positioned+isolated ancestor
// (`absolute` instead of `fixed`) so the backdrop blur only covers that region —
// e.g. the map area, leaving a sibling navbar untouched.
export default function Modal({
  open,
  onClose,
  title,
  dismissible = true,
  contained = false,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title?: ReactNode;
  dismissible?: boolean;
  contained?: boolean;
  children: ReactNode;
}) {
  // Esc closes when dismissible; lock body scroll while open.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && dismissible) onClose();
    };
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open, dismissible, onClose]);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className={`${
            contained ? "absolute" : "fixed"
          } inset-0 z-[2000] flex items-center justify-center p-3 sm:p-6`}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
        >
          <div
            className="bg-ink/40 absolute inset-0 backdrop-blur-sm"
            onClick={dismissible ? onClose : undefined}
            aria-hidden
          />
          <motion.div
            role="dialog"
            aria-modal="true"
            initial={{ opacity: 0, scale: 0.98, y: 12 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.98, y: 12 }}
            transition={{ type: "spring", stiffness: 420, damping: 34 }}
            className="border-paper-line bg-paper/95 safe-top safe-pb relative flex max-h-[92dvh] w-full max-w-lg flex-col rounded-2xl border shadow-xl backdrop-blur"
          >
            <div
              className={`flex items-center justify-between gap-3 px-5 py-4 ${
                title ? "border-paper-line border-b" : ""
              }`}
            >
              <div className="text-ink font-display text-lg font-semibold">{title}</div>
              {dismissible && (
                <button
                  type="button"
                  aria-label="Close"
                  onClick={onClose}
                  className="text-ink-dim hover:text-ink -mr-1 rounded-sm p-1 transition"
                >
                  <XIcon size={20} />
                </button>
              )}
            </div>
            <div className="flex-1 overflow-y-auto overscroll-contain px-5 py-5">{children}</div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

"use client";

import { useEffect } from "react";
import Link from "next/link";
import { AnimatePresence, motion } from "framer-motion";
import { XIcon } from "@phosphor-icons/react";
import { heroFont } from "@/lib/heroFont";
import { APP_STORE_URL } from "@/lib/appConfig";

/**
 * Beta sign-up modal launched from the landing-page CTA. Backdrop click and
 * Escape both dismiss; body scroll is locked while open so the map behind
 * can't be panned through the overlay.
 */
export default function JoinBetaModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [open, onClose]);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-50 flex items-center justify-center p-5"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          role="dialog"
          aria-modal="true"
          aria-labelledby="join-beta-title"
          onClick={onClose}
        >
          <div className="bg-ink/40 absolute inset-0 backdrop-blur-sm" aria-hidden />

          <motion.div
            className="paper-grain bg-paper text-ink border-ink/10 relative w-full max-w-md rounded-xl border p-8 shadow-2xl"
            initial={{ opacity: 0, y: 24, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 24, scale: 0.98 }}
            transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              className="text-ink-dim hover:text-ink absolute top-4 right-4 transition"
            >
              <XIcon className="h-5 w-5" weight="bold" />
            </button>

            <h2
              id="join-beta-title"
              className={`${heroFont.className} text-3xl font-bold tracking-tight`}
            >
              Join the Beta
            </h2>
            <p className="text-ink-dim mt-4 text-lg leading-relaxed">
              We&apos;re rolling out access gradually. Grab the app to start mapping and verifying
              fountains in your community.
            </p>

            <Link
              href={APP_STORE_URL}
              className="bg-sky-deep text-paper hover:bg-sky-deep/90 mt-8 inline-flex w-full items-center justify-center gap-2.5 rounded-sm px-6 py-3 text-lg font-bold transition"
            >
              Get the app
            </Link>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

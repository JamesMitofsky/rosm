"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { DeviceMobileIcon, XIcon } from "@phosphor-icons/react";
import { isNative } from "@/lib/api";

// Caught right before sign-in: a mobile visitor on the plain website (not the
// installed PWA and not the native build). The planner leans on a long-lived,
// offline-tolerant session, and a browser tab is the shakiest place to run it —
// so we nudge them to install to the homescreen first. Fully bypassable: this is
// a heads-up, not a gate.
//
// Detection is client-only (guards SSR): mobile pointer + touch, and NOT already
// running standalone (display-mode / iOS navigator.standalone), and NOT native.
function shouldPrompt(): boolean {
  if (typeof window === "undefined" || isNative()) return false;
  const standalone =
    window.matchMedia("(display-mode: standalone)").matches ||
    // iOS Safari exposes standalone here instead of via display-mode.
    (window.navigator as unknown as { standalone?: boolean }).standalone === true;
  const mobile = window.matchMedia("(pointer: coarse)").matches && "ontouchstart" in window;
  return mobile && !standalone;
}

export default function AddToHomescreenPrompt() {
  const [show, setShow] = useState(false);

  useEffect(() => {
    // One-shot capability check on browser-only globals. Deliberately set in
    // the effect (not lazy init) so the server and first client render agree.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (shouldPrompt()) setShow(true);
  }, []);

  return (
    <AnimatePresence>
      {show && (
        <motion.div
          className="fixed inset-0 z-[1200] grid place-items-center p-4"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          <div
            className="bg-ink/30 absolute inset-0 backdrop-blur-sm"
            onClick={() => setShow(false)}
          />
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-labelledby="a2hs-title"
            className="border-sky-deep/30 bg-paper relative flex w-full max-w-xs flex-col items-center gap-3 rounded-2xl border p-6 text-center shadow-2xl"
            initial={{ opacity: 0, scale: 0.94, y: 8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.94, y: 8 }}
          >
            <button
              onClick={() => setShow(false)}
              aria-label="Dismiss"
              className="text-ink-dim/70 hover:text-ink absolute top-3 right-3"
            >
              <XIcon size={18} />
            </button>

            <span className="bg-sky-deep/10 text-sky-deep grid h-14 w-14 place-items-center rounded-full">
              <DeviceMobileIcon size={30} weight="fill" />
            </span>

            <h2 id="a2hs-title" className="font-display text-ink text-base font-bold">
              Add this to your homescreen
            </h2>
            <p className="text-ink-dim text-sm">
              Add it to your home screen via the Share button. It&rsquo;ll be way more stable than
              using the site on your phone.
            </p>

            <button
              onClick={() => setShow(false)}
              className="text-ink-dim hover:text-ink mt-1 text-xs font-medium"
            >
              Continue anyway
            </button>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

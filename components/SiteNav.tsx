"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "framer-motion";
import { CompassIcon, HouseIcon, ListIcon, QuestionIcon, XIcon } from "@phosphor-icons/react";
import { MENU_ROW_CLASS } from "@/components/AccountChip";
import { useOsmStatus } from "@/components/OsmStatus";
import { heroFont } from "@/lib/heroFont";

// Hydration-safe client detection: returns false during SSR / first paint,
// true once mounted on the client — without setState-in-effect.
const subscribe = () => () => {};
function useMounted() {
  return useSyncExternalStore(
    subscribe,
    () => true,
    () => false,
  );
}

// The site pages, in nav order. `cta` renders as the filled primary action.
const NAV_LINKS = [
  { href: "/", label: "Home", icon: HouseIcon },
  { href: "/fountains", label: "Nearby Fountains", icon: CompassIcon },
  { href: "/auth-explained", label: "FAQ", icon: QuestionIcon },
] as const;

// Top-of-page navigation, mobile-first: a hamburger opens an off-canvas drawer
// that slides in from the right over a dimmed backdrop. From md up the links sit
// inline and the drawer machinery disappears.
export default function SiteNav() {
  const [open, setOpen] = useState(false);
  // Portal target only exists client-side; gate rendering until mounted.
  const mounted = useMounted();
  // Current route drives the active-link bolding.
  const pathname = usePathname();
  // Portal CTA reflects auth: "Login" when signed out, "Mapper" once connected.
  const { status } = useOsmStatus();
  const portalLabel = status?.loggedIn ? "Verification Tools" : "Login";

  // Lock body scroll and wire Esc-to-close while the drawer is open.
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <>
      <header className="bg-paper-deep sticky top-0 z-[110] pt-[env(safe-area-inset-top)] shadow-md">
        <nav className="mx-auto max-w-6xl px-5">
          <div className="flex items-center justify-between py-4">
            <Link href="/" className="flex items-center gap-5" onClick={() => setOpen(false)}>
              <span className="flex items-center gap-2.5">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src="/icons/icon.svg" alt="Run Verified Fountains" className="h-8 w-auto" />
                <span
                  className={`${heroFont.className} text-ink text-2xl tracking-tight md:text-3xl`}
                >
                  Run Verified Fountains
                </span>
              </span>
            </Link>

            {/* Mobile: one button toggles the drawer, morphing between the
                hamburger (closed) and an X (open). It sits above the drawer
                overlay via the header's z-index, so it stays the close affordance. */}
            <button
              type="button"
              onClick={() => setOpen((o) => !o)}
              aria-expanded={open}
              aria-controls="site-nav-drawer"
              aria-label={open ? "Close menu" : "Open menu"}
              className="border-ink text-ink hover:bg-ink hover:text-paper rounded-sm border p-2 transition md:hidden"
            >
              <AnimatePresence mode="wait" initial={false}>
                <motion.span
                  key={open ? "close" : "open"}
                  initial={{ rotate: -90, opacity: 0 }}
                  animate={{ rotate: 0, opacity: 1 }}
                  exit={{ rotate: 90, opacity: 0 }}
                  transition={{ duration: 0.15, ease: "easeOut" }}
                  className="block"
                >
                  {open ? <XIcon size={20} weight="bold" /> : <ListIcon size={20} weight="bold" />}
                </motion.span>
              </AnimatePresence>
            </button>

            {/* Desktop: inline links. */}
            <div className="hidden shrink-0 items-center gap-5 md:flex">
              {NAV_LINKS.map(({ href, label, ...l }) => (
                <Link
                  key={href}
                  href={href}
                  className={`inline-flex items-center text-base font-semibold whitespace-nowrap transition ${
                    "cta" in l && l.cta
                      ? "border-ink bg-ink text-paper hover:bg-ink-soft rounded-sm border px-5 py-2 font-bold"
                      : `px-1 py-2 ${
                          pathname === href
                            ? "decoration-sky-deep text-ink font-bold underline decoration-2 underline-offset-4"
                            : "text-ink-dim hover:text-ink"
                        }`
                  }`}
                >
                  {label}
                </Link>
              ))}
              <Link
                href="/mapping-portal"
                className="border-sky-deep text-sky-deep hover:bg-sky-deep hover:text-paper inline-flex items-center rounded-sm border px-5 py-2 text-base font-bold whitespace-nowrap transition"
              >
                {portalLabel}
              </Link>
            </div>
          </div>
        </nav>
      </header>

      {/* Mobile off-canvas drawer, portaled to <body> so it escapes the sticky
          header's stacking context and reliably covers the page. */}
      {mounted &&
        createPortal(
          <AnimatePresence>
            {open && (
              <div className="fixed inset-0 z-[100] md:hidden">
                <motion.button
                  type="button"
                  aria-label="Close menu"
                  onClick={() => setOpen(false)}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.2 }}
                  className="bg-ink/40 absolute inset-0 backdrop-blur-sm"
                />
                <motion.div
                  id="site-nav-drawer"
                  role="dialog"
                  aria-modal="true"
                  initial={{ x: "100%" }}
                  animate={{ x: 0 }}
                  exit={{ x: "100%" }}
                  transition={{ type: "tween", duration: 0.28, ease: "easeOut" }}
                  className="bg-paper border-paper-line absolute top-0 right-0 flex h-full w-4/5 max-w-xs flex-col border-l px-5 pt-[calc(env(safe-area-inset-top)+5rem)] shadow-xl"
                >
                  <div className="flex flex-col">
                    {NAV_LINKS.map(({ href, label, icon: Icon }) => (
                      <Link
                        key={href}
                        href={href}
                        onClick={() => setOpen(false)}
                        className={`${MENU_ROW_CLASS} ${pathname === href ? "font-bold" : ""}`}
                      >
                        <Icon size={20} weight="bold" className="text-ink-dim shrink-0" />
                        {label}
                      </Link>
                    ))}
                    <Link
                      href="/mapping-portal"
                      onClick={() => setOpen(false)}
                      className="border-sky-deep text-sky-deep hover:bg-sky-deep hover:text-paper mt-4 inline-flex items-center justify-center rounded-sm border px-5 py-3 text-base font-bold transition"
                    >
                      {portalLabel}
                    </Link>
                  </div>
                </motion.div>
              </div>
            )}
          </AnimatePresence>,
          document.body,
        )}
    </>
  );
}

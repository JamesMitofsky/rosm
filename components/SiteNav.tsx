"use client";

import Link from "next/link";
import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  ArrowRightIcon,
  ListIcon,
  MapTrifoldIcon,
  PencilSimpleIcon,
  XIcon,
} from "@phosphor-icons/react";

// The site pages, in nav order. `cta` renders as the filled primary action.
const NAV_LINKS = [
  { href: "/public-fountains", label: "Fountains near you", icon: MapTrifoldIcon },
  { href: "/edit", label: "Edit the map", icon: PencilSimpleIcon },
  { href: "/plan", label: "Plan a route", icon: ArrowRightIcon, cta: true },
] as const;

// Top-of-page navigation, mobile-first: a hamburger opens a full-width sheet of
// page links; from md up the links sit inline and the hamburger disappears.
export default function SiteNav() {
  const [open, setOpen] = useState(false);

  return (
    <header className="border-paper-line bg-paper/85 sticky top-0 z-50 border-b pt-[env(safe-area-inset-top)] backdrop-blur-md">
      <nav className="mx-auto max-w-6xl px-5">
        <div className="flex items-center justify-between py-4">
          <Link href="/" className="flex items-center gap-5" onClick={() => setOpen(false)}>
            <span className="flex items-center gap-2.5">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/icons/icon.svg" alt="" className="h-7 w-7" />
              <span className="font-display text-lg font-bold tracking-tight">ROSM</span>
            </span>
            <span className="text-ink-dim hidden font-mono text-[0.65rem] tracking-[0.22em] uppercase lg:inline">
              Running for Open-Sourced Maps
            </span>
          </Link>

          {/* Mobile: hamburger toggle. */}
          <button
            type="button"
            onClick={() => setOpen((o) => !o)}
            aria-expanded={open}
            aria-controls="site-nav-menu"
            aria-label={open ? "Close menu" : "Open menu"}
            className="border-ink text-ink hover:bg-ink hover:text-paper rounded-full border p-2 transition md:hidden"
          >
            {open ? <XIcon size={20} weight="bold" /> : <ListIcon size={20} weight="bold" />}
          </button>

          {/* Desktop: inline links. */}
          <div className="hidden shrink-0 items-center gap-3 md:flex">
            {NAV_LINKS.map(({ href, label, icon: Icon, ...l }) => (
              <Link
                key={href}
                href={href}
                className={`group inline-flex items-center gap-2 rounded-full border px-5 py-2 text-sm font-bold whitespace-nowrap transition ${
                  "cta" in l && l.cta
                    ? "border-ink bg-ink text-paper hover:text-ink hover:bg-transparent"
                    : "border-ink text-ink hover:bg-ink hover:text-paper"
                }`}
              >
                {label}
                <Icon
                  size={16}
                  weight="bold"
                  className={
                    "cta" in l && l.cta ? "transition-transform group-hover:translate-x-1" : ""
                  }
                />
              </Link>
            ))}
          </div>
        </div>

        {/* Mobile menu: every page link, full-width tap targets. */}
        <AnimatePresence initial={false}>
          {open && (
            <motion.div
              id="site-nav-menu"
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.22, ease: "easeOut" }}
              className="overflow-hidden md:hidden"
            >
              <div className="flex flex-col gap-2 pb-4">
                {NAV_LINKS.map(({ href, label, icon: Icon, ...l }) => (
                  <Link
                    key={href}
                    href={href}
                    onClick={() => setOpen(false)}
                    className={`flex items-center justify-between rounded-2xl border px-4 py-3 text-base font-bold transition ${
                      "cta" in l && l.cta
                        ? "border-ink bg-ink text-paper"
                        : "border-paper-line text-ink hover:border-ink"
                    }`}
                  >
                    {label}
                    <Icon size={18} weight="bold" />
                  </Link>
                ))}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </nav>
    </header>
  );
}

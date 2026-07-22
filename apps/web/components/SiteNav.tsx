"use client";

import Link from "next/link";
import { heroFont } from "@/lib/heroFont";
import { APP_STORE_URL } from "@/lib/appConfig";

// Top-of-page navigation for the marketing landing. The interactive app lives in
// the mobile app, so the only action here is the store link — no page-to-page nav.
export default function SiteNav() {
  return (
    <header className="bg-paper-deep sticky top-0 z-[110] pt-[env(safe-area-inset-top)] shadow-md">
      <nav className="mx-auto max-w-6xl px-5">
        <div className="flex items-center justify-between gap-4 py-4">
          <Link href="/" className="flex items-center gap-2.5">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/icons/icon.svg" alt="Run Verified Fountains" className="h-8 w-auto" />
            <span className={`${heroFont.className} text-ink text-2xl tracking-tight md:text-3xl`}>
              Run Verified Fountains
            </span>
          </Link>

          <Link
            href={APP_STORE_URL}
            className="border-sky-deep text-sky-deep hover:bg-sky-deep hover:text-paper inline-flex shrink-0 items-center rounded-sm border px-5 py-2 text-base font-bold whitespace-nowrap transition"
          >
            Get the app
          </Link>
        </div>
      </nav>
    </header>
  );
}

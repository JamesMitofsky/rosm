import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Offline — Fountain Mapper",
};

export default function OfflinePage() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-4 bg-[#0c0d0a] px-6 text-center text-[#f4f3ea]">
      <div className="h-3 w-3 animate-pulse rounded-full bg-[#ccff2e]" />
      <h1 className="font-[family-name:var(--font-display)] text-2xl font-semibold">
        You&apos;re offline
      </h1>
      <p className="max-w-sm text-sm text-[#b9b8ac]">
        This page isn&apos;t cached yet. Routes and tiles you&apos;ve already loaded stay available
        — reconnect to load anything new.
      </p>
      <p className="text-xs text-[#b9b8ac]/70">Fountain Mapper keeps working in the field.</p>
    </main>
  );
}

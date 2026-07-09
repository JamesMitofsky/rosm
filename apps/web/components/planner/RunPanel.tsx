"use client";

import RunGuide from "@/components/run/RunGuide";
import RunComplete from "@/components/run/RunComplete";
import type { RunSession } from "@/hooks/useRunSession";

// Run phase: same map, the side panel becomes the live survey (or the wrap-up
// once every stop is handled).
export default function RunPanel({ session, onExit }: { session: RunSession; onExit: () => void }) {
  return (
    <section className="flex w-full max-w-sm flex-col gap-4 md:max-h-[calc(100vh-7rem)] md:overflow-y-auto">
      {session.done ? (
        <RunComplete session={session} tone="light" onExit={onExit} />
      ) : (
        <RunGuide session={session} tone="light" />
      )}
    </section>
  );
}

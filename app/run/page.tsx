"use client";

import dynamic from "next/dynamic";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { CompassIcon } from "@phosphor-icons/react";
import { useRunSession } from "@/hooks/useRunSession";
import { useRun } from "@/store/run";
import RunGuide from "@/components/run/RunGuide";
import RunComplete from "@/components/run/RunComplete";

const MapView = dynamic(() => import("@/components/MapView"), { ssr: false });

// Standalone run view: the PWA "Start a run" shortcut and the reload-recovery
// surface. The planner hosts the same run inline (no view switch) from the same
// hook + components — this page just wraps them with its own light shell.
export default function RunPage() {
  const router = useRouter();
  const session = useRunSession();

  // Direct nav with no recoverable run → back to the planner.
  useEffect(() => {
    if (session.hydrating) return;
    if (!useRun.getState().hasPlan) router.replace("/plan");
  }, [session.hydrating, router]);

  function goHome() {
    session.reset();
    router.push("/plan");
  }

  if (session.hydrating) {
    return <main className="grid min-h-screen place-items-center bg-paper text-ink-dim">Loading…</main>;
  }

  if (session.done) {
    return (
      <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center bg-paper p-6 text-ink">
        <RunComplete session={session} tone="light" onExit={goHome} />
      </main>
    );
  }

  return (
    <main className="flex min-h-screen flex-col bg-paper text-ink">
      <div className="relative h-[42vh] w-full">
        <MapView
          center={session.center}
          zoom={16}
          recenterKey={session.recenterKey}
          markers={session.markers}
          line={session.line}
          userPos={session.userPos}
          userHeading={session.userHeading}
          className="h-full w-full"
        />
        {session.needsCompassPermission && (
          <button
            onClick={session.requestCompass}
            className="absolute bottom-3 right-3 z-[1000] flex items-center gap-1.5 rounded-full bg-paper/95 px-3 py-1.5 text-xs font-semibold text-sky-deep shadow-md"
          >
            <CompassIcon size={16} weight="fill" />
            Enable compass
          </button>
        )}
      </div>

      <div className="flex flex-1 flex-col gap-4 p-4">
        <RunGuide session={session} tone="light" />
      </div>
    </main>
  );
}

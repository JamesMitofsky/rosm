"use client";

import dynamic from "next/dynamic";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { CircleNotchIcon } from "@phosphor-icons/react";
import { useRunSession } from "@/hooks/useRunSession";
import { useRun } from "@/store/run";
import RunGuide from "@/components/run/RunGuide";
import RunComplete from "@/components/run/RunComplete";
import CompassEnableModal from "@/components/run/CompassEnableModal";
import AddPointPopup from "@/components/AddPointPopup";

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
    if (!useRun.getState().hasPlan) router.replace("/mapping-portal/plan");
  }, [session.hydrating, router]);

  function goHome() {
    session.reset();
    router.push("/mapping-portal/plan");
  }

  if (session.hydrating) {
    return (
      <main className="bg-paper grid min-h-screen place-items-center">
        <CircleNotchIcon size={28} weight="bold" className="text-ink-dim animate-spin" />
      </main>
    );
  }

  if (session.done) {
    return (
      <main className="bg-paper text-ink mx-auto flex min-h-screen max-w-md flex-col justify-center p-6">
        <RunComplete session={session} tone="light" onExit={goHome} />
      </main>
    );
  }

  return (
    <main className="safe-pb bg-paper text-ink flex min-h-screen flex-col">
      <div className="relative h-[42vh] w-full">
        <MapView
          center={session.center}
          zoom={16}
          recenterKey={session.recenterKey}
          fitPoints={session.fitPoints}
          markers={session.markers}
          line={session.line}
          userPos={session.userPos}
          userHeading={session.userHeading}
          mapBearing={session.mapBearing}
          followHeading
          mapClickPopup={(pt, close) => (
            // A bare map tap mid-run offers to create a new node of the surveyed
            // type right there — for points spotted off the route.
            <AddPointPopup
              label={session.addLabel}
              onAdd={async (extras) => {
                await session.addAt(pt, extras);
                close();
              }}
            />
          )}
          className="h-full w-full"
        />
        <CompassEnableModal
          open={session.needsCompassPermission}
          onEnable={session.requestCompass}
        />
      </div>

      <div className="flex flex-1 flex-col gap-4 p-4">
        <RunGuide session={session} tone="light" />
      </div>
    </main>
  );
}

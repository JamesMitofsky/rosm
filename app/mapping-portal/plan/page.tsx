"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useEffect, useMemo, useRef, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import { useGSAP } from "@gsap/react";
import gsap from "gsap";
import { DeviceMobileIcon } from "@phosphor-icons/react";
import { useRun } from "@/store/run";
import { usePlanner } from "@/store/planner";
import AccountChip from "@/components/AccountChip";
import OsmStatusBar, { useOsmStatus } from "@/components/OsmStatus";
import ConfigWizard from "@/components/planner/ConfigWizard";
import RouteBuilderPanel from "@/components/planner/RouteBuilderPanel";
import ResumeDraftPrompt from "@/components/planner/ResumeDraftPrompt";
import RunPanel from "@/components/planner/RunPanel";
import WaypointPopup from "@/components/WaypointPopup";
import { usePlannerMarkers } from "@/components/planner/usePlannerMarkers";
import CompassEnableModal from "@/components/run/CompassEnableModal";
import { useRunSession } from "@/hooks/useRunSession";
import { useOsmEdits } from "@/hooks/useOsmEdits";
import { usePlannerDraftSync } from "@/hooks/usePlannerDraftSync";
import { apiFetch, isNative } from "@/lib/api";
import { boxAround, milesToMeters } from "@/lib/geo";
import { getArchivedRoutes } from "@/lib/routeArchive";

const MapView = dynamic(() => import("@/components/MapView"), { ssr: false });

// The device class can't change mid-session, so the mobile check never
// re-notifies — subscribe is a stable no-op (required by useSyncExternalStore).
const subscribeNever = () => () => {};

// The planner: one persistent map, three phases. "config" walks the setup
// questions; "map" builds the route; "run" takes the SAME map live for the
// survey. Phase changes only swap the side panel and which data feeds the map —
// the map container is rendered unconditionally so Leaflet never remounts.
export default function PlannerPage() {
  const router = useRouter();
  const { status: osm } = useOsmStatus();

  const phase = usePlanner((s) => s.phase);
  const center = usePlanner((s) => s.center);
  const recenterKey = usePlanner((s) => s.recenterKey);
  const animateRecenter = usePlanner((s) => s.animateRecenter);
  const radiusMi = usePlanner((s) => s.radiusMi);
  const line = usePlanner((s) => s.line);
  const mapClick = usePlanner((s) => s.mapClick);
  const addVia = usePlanner((s) => s.addVia);
  const tagKey = usePlanner((s) => s.tag.key);
  const setErr = usePlanner((s) => s.setErr);

  // Route planning + the live run rely on the phone's GPS and compass, so the
  // planner is gated to mobile. null = not yet determined (the server snapshot,
  // so SSR never flashes the wrong screen before the client checks the device).
  const isMobileDevice = useSyncExternalStore<boolean | null>(
    subscribeNever,
    () =>
      isNative() || (window.matchMedia("(pointer: coarse)").matches && "ontouchstart" in window),
    () => null,
  );

  // The live run, fed from the shared hook. Armed only once we reach the run
  // phase so the location prompt doesn't fire while building a route.
  const session = useRunSession({ enabled: phase === "run" });

  // Direct OSM edits made from the map, before any run. Backed by the offline
  // outbox: saved on-device first, sent to OSM in the background.
  const osmEdits = useOsmEdits({ tagKey, onError: setErr });

  // Contract: draft loads on mount (resume offer) and auto-persists on change.
  usePlannerDraftSync();

  const markers = usePlannerMarkers({
    edits: osmEdits.edits,
  });

  const scope = useRef<HTMLElement>(null);

  // Bounding box of the search radius around the start. Fed to the map as
  // fitPoints in the build phase so leaving the params step frames the whole
  // area the points are loading into — before they arrive.
  const searchBox = useMemo<[number, number][] | undefined>(
    () => (center && radiusMi ? boxAround(center, milesToMeters(Number(radiusMi))) : undefined),
    [center, radiusMi],
  );

  // Fade the floating card when switching between phases and steps.
  useGSAP(
    () => {
      gsap.fromTo(
        ".phase-card",
        { autoAlpha: 0 },
        { autoAlpha: 1, duration: 0.5, ease: "power3.out" },
      );
    },
    { dependencies: [phase], scope },
  );

  // Status resolved to logged-out → bounce to the sign-in page. Only on
  // mobile; desktop users see the "plan on your phone" intercept instead.
  useEffect(() => {
    if (isMobileDevice && osm && !osm.loggedIn)
      router.replace("/login?returnTo=/mapping-portal/plan");
  }, [isMobileDevice, osm, router]);

  // On mount, recover an in-progress run (the run lives here, not on a
  // separate page — a reload mid-survey must drop straight back into it). A
  // finished run (index past the last stop) is ignored so it can't hijack a
  // fresh planning session.
  useEffect(() => {
    // Native: recover an interrupted run from the on-device archive (no server
    // run state). Web: read it back from /api/run. Deferred off the effect body so
    // the state update doesn't cascade-render synchronously.
    if (isNative()) {
      Promise.resolve().then(() => {
        const plan = getArchivedRoutes()[0]?.plan;
        if (plan && plan.stops?.length && (plan.index ?? 0) < plan.stops.length) {
          useRun.getState().hydrate(plan);
          usePlanner.getState().setPhase("run");
        }
      });
      return;
    }
    apiFetch("/api/run")
      .then((r) => r.json())
      .then((plan) => {
        if (plan && plan.stops?.length && (plan.index ?? 0) < plan.stops.length) {
          useRun.getState().hydrate(plan);
          usePlanner.getState().setPhase("run");
        }
      })
      .catch(() => {});
  }, []);

  // Leave the finished run and return to a clean planner, keeping the start area
  // so the surveyor can quickly build another route nearby.
  function exitRun() {
    session.reset();
    usePlanner.getState().resetAfterRun();
  }

  // Not a phone → intercept. You navigate the route on foot with your phone's
  // GPS/compass, so planning belongs there too. Blank while the check resolves.
  if (isMobileDevice === null) {
    return <main className="bg-paper h-screen w-screen" />;
  }
  if (!isMobileDevice) {
    return (
      <main className="bg-paper font-body text-ink flex min-h-screen w-screen items-center justify-center px-6">
        <div className="flex max-w-md flex-col items-center gap-5 text-center">
          <DeviceMobileIcon size={48} weight="duotone" className="text-sky-deep" />
          <h1 className="font-display text-2xl leading-tight font-bold">Plan this on your phone</h1>
          <p className="text-ink-dim">
            Routes have to be planned on your phone since that&apos;s how you navigate around!
          </p>
          <Link
            href="/"
            className="border-ink text-ink hover:bg-ink hover:text-paper rounded-sm border px-5 py-2 text-sm font-bold transition"
          >
            Back home
          </Link>
        </div>
      </main>
    );
  }

  // Gate the whole planner behind OSM sign-in — no map until logged in. Once the
  // status resolves to logged-out, send the user to the dedicated sign-in page.
  if (osm === null || !osm.loggedIn) {
    // Logged-out redirect handled by the effect above; render blank meanwhile.
    return <main className="bg-paper h-screen w-screen" />;
  }

  // The map view tracks the chosen start point.
  const DEFAULT_CENTER: [number, number] = [38.9072, -77.0369];
  const viewCenter: [number, number] = center ? [center.lat, center.lon] : DEFAULT_CENTER;

  return (
    <main
      ref={scope}
      className="safe-pb bg-paper font-body text-ink relative flex min-h-screen w-screen flex-col md:block md:h-screen md:overflow-hidden"
    >
      {/* Mobile: map sits at the top with a fixed height and the panel flows below it.
          Desktop (md+): map fills the screen and the cards float on top.
          The map is UNCONDITIONAL — phase only switches which data feeds it, so
          Leaflet never tears down mid-session (contract: no remount, no tile flash). */}
      <div className="relative h-[55vh] w-full shrink-0 md:absolute md:inset-0 md:h-full">
        <MapView
          center={phase === "run" ? session.center : viewCenter}
          zoom={phase === "run" ? 16 : 14}
          recenterKey={phase === "run" ? session.recenterKey : recenterKey}
          animateRecenter={phase === "run" ? false : animateRecenter}
          fitPoints={phase === "run" ? session.fitPoints : phase === "map" ? searchBox : undefined}
          markers={phase === "run" ? session.markers : markers}
          line={phase === "run" ? session.line : line}
          userPos={phase === "run" ? session.userPos : undefined}
          userHeading={phase === "run" ? session.userHeading : undefined}
          onMapClick={phase === "run" ? undefined : mapClick}
          mapClickPopup={
            phase === "map"
              ? (pt, close) => (
                  <WaypointPopup
                    onAdd={() => {
                      addVia(pt.lat, pt.lon);
                      close();
                    }}
                  />
                )
              : undefined
          }
          className="absolute inset-0 h-full w-full"
        />
        {phase === "run" && (
          <CompassEnableModal
            open={session.needsCompassPermission}
            onEnable={session.requestCompass}
          />
        )}
      </div>

      {/* Top bar: OSM status + account, floating over the map. Hidden during a
          run so the map is the topmost element on the route. */}
      {phase !== "run" && (
        <header className="safe-top pointer-events-none absolute inset-x-0 z-[1000] flex flex-wrap items-center justify-between gap-3 p-4 md:p-5">
          <div className="pointer-events-auto flex items-center gap-2">
            <OsmStatusBar />
          </div>
          <div className="pointer-events-auto ml-auto">
            <AccountChip chipTone="neutral" label="Exit" />
          </div>
        </header>
      )}

      <ResumeDraftPrompt />

      {/* Phase panels — siblings of the map container, never its ancestors. */}
      {phase === "config" && (
        <div className="phase-card z-[1000] flex flex-1 justify-center p-4 md:absolute md:inset-y-0 md:right-auto md:left-0 md:flex-none md:items-center md:p-6">
          <ConfigWizard />
        </div>
      )}
      {phase === "map" && (
        <div className="phase-card z-[1000] flex flex-1 justify-center p-4 md:absolute md:inset-y-0 md:right-0 md:left-auto md:flex-none md:items-center md:p-6">
          <RouteBuilderPanel osmEdits={osmEdits} />
        </div>
      )}
      {phase === "run" && (
        <div className="phase-card z-[1000] flex justify-center p-4 md:absolute md:inset-y-0 md:right-0 md:left-auto md:items-center md:p-6">
          <RunPanel session={session} onExit={exitRun} />
        </div>
      )}
    </main>
  );
}

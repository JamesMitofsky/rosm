"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ArrowRightIcon, PathIcon, PersonSimpleRunIcon } from "@phosphor-icons/react";
import { getArchivedRoutes, type ArchivedRoute } from "@/lib/routeArchive";
import { apiFetch, isNative } from "@/lib/api";
import { fmtDist } from "@/lib/geo";

type CardState =
  | { kind: "active" } // a run is mid-flight — offer to jump back in
  | { kind: "last"; route: ArchivedRoute } // no active run, but history exists
  | null;

// Returning-user shortcut on the landing page: resume an interrupted run, or
// jump to the run history. Renders nothing for first-time visitors.
export default function HomeRunCard() {
  const [state, setState] = useState<CardState>(null);

  useEffect(() => {
    let alive = true;
    const lastArchived = (): CardState => {
      const latest = getArchivedRoutes()[0];
      return latest ? { kind: "last", route: latest } : null;
    };
    // Mirror the planner's recovery source: on-device archive on native, the
    // server-persisted run on web. An unfinished run wins over history.
    const isActive = (plan: { stops?: unknown[]; index?: number } | null) =>
      !!plan?.stops?.length && (plan.index ?? 0) < plan.stops.length;
    if (isNative()) {
      Promise.resolve().then(() => {
        if (!alive) return;
        const latest = getArchivedRoutes()[0];
        setState(isActive(latest?.plan ?? null) ? { kind: "active" } : lastArchived());
      });
    } else {
      apiFetch("/api/run")
        .then((r) => r.json())
        .then((plan) => {
          if (!alive) return;
          setState(isActive(plan) ? { kind: "active" } : lastArchived());
        })
        .catch(() => {
          if (alive) setState(lastArchived());
        });
    }
    return () => {
      alive = false;
    };
  }, []);

  if (!state) return null;

  if (state.kind === "active") {
    return (
      <Link
        href="/mapping-portal/run"
        className="group border-sky-deep/40 bg-sky/10 hover:border-sky-deep inline-flex items-center gap-3 rounded-2xl border px-5 py-3 transition"
      >
        <PathIcon size={22} weight="duotone" className="text-sky-deep shrink-0" />
        <span className="flex flex-col text-left">
          <span className="font-display text-sm font-bold">Resume your run</span>
          <span className="text-ink-dim text-xs">A survey is still in progress</span>
        </span>
        <ArrowRightIcon
          size={16}
          weight="bold"
          className="text-sky-deep transition-transform group-hover:translate-x-1"
        />
      </Link>
    );
  }

  const { route } = state;
  const date = new Date(route.startedAt).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
  return (
    <Link
      href="/mapping-portal"
      className="group border-paper-line bg-paper hover:border-ink/25 inline-flex items-center gap-3 rounded-2xl border px-5 py-3 transition"
    >
      <PersonSimpleRunIcon size={22} weight="duotone" className="text-sky-deep shrink-0" />
      <span className="flex flex-col text-left">
        <span className="font-display text-sm font-bold">Your last run</span>
        <span className="text-ink-dim text-xs">
          {date} · {fmtDist(route.plan.distanceM)} · {route.edits.length}{" "}
          {route.edits.length === 1 ? "edit" : "edits"}
        </span>
      </span>
      <ArrowRightIcon
        size={16}
        weight="bold"
        className="text-ink-dim group-hover:text-ink transition group-hover:translate-x-1"
      />
    </Link>
  );
}

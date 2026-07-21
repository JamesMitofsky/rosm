"use client";

import { useEffect, useState } from "react";
import { CircleNotchIcon, ArrowLeftIcon, ArrowRightIcon } from "@phosphor-icons/react";
import SiteNav from "@/components/SiteNav";
import type { OsmChange } from "@/app/api/osm-changes/route";

const OSM_BASE = "https://www.openstreetmap.org";
const PAGE_SIZE = 50;

type PageData = {
  count: number;
  hasMore: boolean;
  changes: OsmChange[];
};

export default function AllOsmChangesPage() {
  const [page, setPage] = useState(1);
  const [data, setData] = useState<PageData | null>(null);
  const [error, setError] = useState<string | null>(null);

  // loading is true when both data and error are absent (initial or mid-page-change)
  const loading = data === null && error === null;

  useEffect(() => {
    let alive = true;
    fetch(`/api/osm-changes?page=${page}`)
      .then((r) => {
        if (!r.ok) throw new Error(`${r.status}`);
        return r.json() as Promise<PageData>;
      })
      .then((d) => {
        if (alive) setData(d);
      })
      .catch((e: Error) => {
        if (alive) setError(e.message);
      });
    return () => {
      alive = false;
    };
  }, [page]);

  const goToPage = (next: number) => {
    setData(null);
    setError(null);
    setPage(next);
  };

  const totalPages = data ? Math.ceil(data.count / PAGE_SIZE) : null;

  return (
    <div className="bg-paper min-h-screen">
      <SiteNav />
      <main className="mx-auto max-w-4xl px-4 py-8">
        <h1 className="text-ink font-display mb-1 text-2xl font-bold">All ROSM Edits</h1>
        {data && (
          <p className="text-ink-dim mb-6 text-sm">
            {data.count.toLocaleString()} changeset{data.count !== 1 ? "s" : ""} by all ROSM users
          </p>
        )}

        {loading && (
          <div className="text-ink-dim flex items-center gap-2 py-12">
            <CircleNotchIcon size={20} className="animate-spin" />
            <span className="text-sm">Loading from OSMCha…</span>
          </div>
        )}

        {error && (
          <div className="bg-paper-deep border-paper-line rounded border px-4 py-3 text-sm text-red-700">
            Failed to load: {error}
          </div>
        )}

        {data && !loading && (
          <>
            <div className="border-paper-line overflow-hidden rounded border">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-paper-deep border-paper-line border-b">
                    <th className="text-ink-dim px-4 py-2.5 text-left font-semibold">Changeset</th>
                    <th className="text-ink-dim px-4 py-2.5 text-left font-semibold">User</th>
                    <th className="text-ink-dim px-4 py-2.5 text-left font-semibold">Date</th>
                    <th className="text-ink-dim px-4 py-2.5 text-left font-semibold">Comment</th>
                    <th className="text-ink-dim px-4 py-2.5 text-right font-semibold">Changes</th>
                  </tr>
                </thead>
                <tbody>
                  {data.changes.map((c, i) => (
                    <tr
                      key={c.id}
                      className={`border-paper-line border-b last:border-0 ${i % 2 === 1 ? "bg-paper-deep/40" : ""}`}
                    >
                      <td className="px-4 py-2.5">
                        <a
                          href={`${OSM_BASE}/changeset/${c.id}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-sky-deep hover:underline"
                        >
                          #{c.id}
                        </a>
                      </td>
                      <td className="px-4 py-2.5">
                        <a
                          href={`${OSM_BASE}/user/${encodeURIComponent(c.user)}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-ink hover:text-sky-deep transition"
                        >
                          {c.user}
                        </a>
                      </td>
                      <td className="text-ink-dim px-4 py-2.5 whitespace-nowrap">
                        {new Date(c.date).toLocaleDateString(undefined, {
                          year: "numeric",
                          month: "short",
                          day: "numeric",
                        })}
                      </td>
                      <td className="text-ink-dim max-w-xs truncate px-4 py-2.5">{c.comment}</td>
                      <td className="text-ink-dim px-4 py-2.5 text-right">{c.changesCount}</td>
                    </tr>
                  ))}
                  {data.changes.length === 0 && (
                    <tr>
                      <td colSpan={5} className="text-ink-dim px-4 py-8 text-center">
                        No changesets found. OSMCha may not have indexed ROSM yet.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            {totalPages && totalPages > 1 && (
              <div className="mt-4 flex items-center justify-between">
                <button
                  onClick={() => goToPage(Math.max(1, page - 1))}
                  disabled={page === 1}
                  className="text-ink border-paper-line inline-flex items-center gap-1.5 rounded border px-3 py-1.5 text-sm disabled:opacity-40"
                >
                  <ArrowLeftIcon size={14} />
                  Previous
                </button>
                <span className="text-ink-dim text-sm">
                  Page {page} of {totalPages}
                </span>
                <button
                  onClick={() => goToPage(page + 1)}
                  disabled={!data.hasMore}
                  className="text-ink border-paper-line inline-flex items-center gap-1.5 rounded border px-3 py-1.5 text-sm disabled:opacity-40"
                >
                  Next
                  <ArrowRightIcon size={14} />
                </button>
              </div>
            )}
          </>
        )}
      </main>
    </div>
  );
}

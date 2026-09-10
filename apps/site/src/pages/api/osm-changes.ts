import type { APIRoute } from "astro";
import { getOsmToken } from "@/lib/osmToken";
import { APP_NAME } from "@/lib/appConfig";

export const prerender = false;

const OSMCHA_BASE = "https://osmcha.org/api/v1";
// Must match the `created_by` changeset tag written in lib/osm.ts.
const EDITOR = APP_NAME;

export type OsmChange = {
  id: number;
  user: string;
  date: string;
  comment: string;
  changesCount: number;
};

type OsmChaFeature = {
  id: number;
  properties: {
    id: number;
    user: string;
    date: string;
    comment: string;
    changes_count: number;
  };
};

type OsmChaResponse = {
  count: number;
  next: string | null;
  features: OsmChaFeature[];
};

export const GET: APIRoute = async ({ request }) => {
  const { searchParams } = new URL(request.url);
  const page = searchParams.get("page") ?? "1";
  const token = await getOsmToken(request);

  const url = `${OSMCHA_BASE}/changesets/?editor=${encodeURIComponent(EDITOR)}&page=${page}&page_size=50&order_by=-date`;
  const headers: Record<string, string> = { Accept: "application/json" };
  if (token) headers["Authorization"] = `Bearer ${token}`;
  const res = await fetch(url, { headers });

  if (!res.ok) {
    return Response.json({ error: `OSMCha ${res.status}` }, { status: res.status });
  }

  const data = (await res.json()) as OsmChaResponse;
  const changes: OsmChange[] = data.features.map((f) => ({
    id: f.id,
    user: f.properties.user,
    date: f.properties.date,
    comment: f.properties.comment,
    changesCount: f.properties.changes_count,
  }));

  return Response.json({ count: data.count, hasMore: !!data.next, changes });
};

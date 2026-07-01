import { NextResponse } from "next/server";
import { getOsmToken } from "@/lib/osmToken";
import { EditRequest } from "@/lib/schemas";
import {
  openChangeset,
  getNode,
  putNode,
  applyAction,
  todayIso,
  changesetUrl,
  OsmApiError,
} from "@/lib/osm";
import { appendJson } from "@/lib/db";
import { editSummary } from "@/lib/editSummary";

export async function POST(req: Request) {
  const token = await getOsmToken(req);
  if (!token) return NextResponse.json({ error: "not signed in to OSM" }, { status: 401 });

  const parsed = EditRequest.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const { nodeId, action, tagKey, extras } = parsed.data;

  try {
    let changesetId = parsed.data.changesetId;
    if (!changesetId) {
      changesetId = await openChangeset(token, "Survey: drinking water / amenity status check");
    }

    // Re-read the node each attempt so the version sent always matches the
    // current db version (OSM rejects a stale version with 409).
    const run = async (): Promise<number> => {
      const node = await getNode(token, nodeId);
      const tags = applyAction(node.tags, action, tagKey, todayIso(), extras);
      return putNode(token, nodeId, { ...node, tags }, changesetId!);
    };

    // Retry on version conflict (409): a concurrent editor bumped the version
    // between our read and write. Re-read + retry up to 3 attempts.
    const MAX_ATTEMPTS = 3;
    let newVersion: number;
    for (let attempt = 1; ; attempt++) {
      try {
        newVersion = await run();
        break;
      } catch (e) {
        const conflict = e instanceof OsmApiError && e.status === 409;
        if (conflict && attempt < MAX_ATTEMPTS) continue;
        throw e;
      }
    }

    await appendJson("edit-log.json", {
      nodeId,
      action,
      changesetId,
      newVersion,
      at: new Date().toISOString(),
      extras,
    });

    return NextResponse.json({
      changesetId,
      changesetUrl: changesetUrl(changesetId),
      nodeId,
      action,
      newVersion,
      summary: editSummary(action, tagKey, todayIso(), extras),
    });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 502 });
  }
}

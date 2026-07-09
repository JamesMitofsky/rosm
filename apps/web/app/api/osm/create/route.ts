import { NextResponse } from "next/server";
import { getOsmToken } from "@/lib/osmToken";
import { CreateNodeRequest } from "@/lib/schemas";
import { openChangeset, createNode, todayIso, changesetUrl, isChangesetClosed } from "@/lib/osm";
import { appendJson } from "@/lib/db";

const CHANGESET_COMMENT = "Survey: add drinking water / amenity point";

// The client can hand us a changeset id that OSM has since closed (idle
// timeout, or an id persisted from a finished session). Recover by opening a
// fresh changeset — once — and retrying the same create.
async function createWithRetry(
  token: string,
  lat: number,
  lon: number,
  tags: Record<string, string>,
  changesetId: number,
  reopened = false,
): Promise<{ nodeId: number; changesetId: number }> {
  try {
    return { changesetId, nodeId: await createNode(token, lat, lon, tags, changesetId) };
  } catch (e) {
    if (!isChangesetClosed(e) || reopened) throw e;
    const fresh = await openChangeset(token, CHANGESET_COMMENT);
    return createWithRetry(token, lat, lon, tags, fresh, true);
  }
}

// Create a new OSM node for a point the surveyor found on the ground but that
// isn't yet in OSM. Tags it with the point type being surveyed plus a
// check_date (it was just observed).
export async function POST(req: Request) {
  const token = await getOsmToken(req);
  if (!token) return NextResponse.json({ error: "not signed in to OSM" }, { status: 401 });

  const parsed = CreateNodeRequest.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const { lat, lon, tag } = parsed.data;

  try {
    const initialChangeset =
      parsed.data.changesetId ?? (await openChangeset(token, CHANGESET_COMMENT));

    const today = todayIso();
    const tags = { [tag.key]: tag.value, check_date: today };
    const { nodeId, changesetId } = await createWithRetry(token, lat, lon, tags, initialChangeset);

    await appendJson("edit-log.json", {
      nodeId,
      action: "create",
      changesetId,
      newVersion: 1,
      at: new Date().toISOString(),
    });

    return NextResponse.json({
      changesetId,
      changesetUrl: changesetUrl(changesetId),
      nodeId,
      lat,
      lon,
      tags,
      summary: `added ${tag.key}=${tag.value}`,
    });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 502 });
  }
}

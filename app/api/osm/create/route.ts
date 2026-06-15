import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { CreateNodeRequest } from "@/lib/schemas";
import { openChangeset, createNode, todayIso, changesetUrl } from "@/lib/osm";
import { appendJson } from "@/lib/db";

// Create a new OSM node for a point the surveyor found on the ground but that
// isn't yet in OSM. Tags it with the point type being surveyed plus a
// check_date (it was just observed).
export async function POST(req: Request) {
  const jar = await cookies();
  const token = jar.get("osm_token")?.value;
  if (!token) return NextResponse.json({ error: "not signed in to OSM" }, { status: 401 });

  const parsed = CreateNodeRequest.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const { lat, lon, tag } = parsed.data;

  try {
    let changesetId = parsed.data.changesetId;
    if (!changesetId) {
      changesetId = await openChangeset(token, "Survey: add drinking water / amenity point");
    }

    const today = todayIso();
    const tags = { [tag.key]: tag.value, check_date: today };
    const nodeId = await createNode(token, lat, lon, tags, changesetId);

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

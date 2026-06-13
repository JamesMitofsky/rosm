import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { EditRequest } from "@/lib/schemas";
import {
  openChangeset,
  getNode,
  putNode,
  deleteNode,
  applyAction,
  todayIso,
} from "@/lib/osm";
import { appendJson } from "@/lib/db";

export async function POST(req: Request) {
  const jar = await cookies();
  const token = jar.get("osm_token")?.value;
  if (!token) return NextResponse.json({ error: "not signed in to OSM" }, { status: 401 });

  const parsed = EditRequest.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const { nodeId, action, tagKey } = parsed.data;

  try {
    let changesetId = parsed.data.changesetId;
    if (!changesetId) {
      changesetId = await openChangeset(token, "Survey: drinking water / amenity status check");
    }

    // Apply, with one retry on version conflict (409).
    const run = async (): Promise<number> => {
      const node = await getNode(token, nodeId);
      if (action === "delete") {
        return deleteNode(token, nodeId, node, changesetId!);
      }
      const tags = applyAction(node.tags, action, tagKey, todayIso());
      return putNode(token, nodeId, { ...node, tags }, changesetId!);
    };

    let newVersion: number;
    try {
      newVersion = await run();
    } catch (e) {
      if ((e as Error).message.includes("409")) newVersion = await run();
      else throw e;
    }

    await appendJson("edit-log.json", {
      nodeId,
      action,
      changesetId,
      newVersion,
      at: new Date().toISOString(),
    });

    return NextResponse.json({ changesetId, newVersion });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 502 });
  }
}

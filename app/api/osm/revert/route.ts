import { NextResponse } from "next/server";
import type { z } from "zod";
import { getOsmToken } from "@/lib/osmToken";
import { RevertRequest } from "@/lib/schemas";
import {
  openChangeset,
  getNode,
  getNodeVersion,
  putNode,
  deleteNode,
  changesetUrl,
  OsmApiError,
  isChangesetClosed,
  type NodeData,
} from "@/lib/osm";
import { appendJson } from "@/lib/db";

const CHANGESET_COMMENT = "Revert: undo survey update";

// One revert write. Edits restore the tags of the version before ours (position
// and current version stay as-is); creates delete the node outright. Recovers
// once from a closed changeset (idle timeout, or an id persisted from a finished
// session) — but never retries a version conflict: by the time we're here the
// version was checked, so a fresh 409 means a concurrent editor won the race and
// the undo must abort rather than clobber their work.
async function revertWithRetry(
  token: string,
  req: z.infer<typeof RevertRequest>,
  current: NodeData,
  changesetId: number,
  reopened = false,
): Promise<{ newVersion: number; changesetId: number }> {
  try {
    if (req.kind === "create") {
      return { changesetId, newVersion: await deleteNode(token, req.nodeId, current, changesetId) };
    }
    const prev = await getNodeVersion(token, req.nodeId, req.sentVersion - 1);
    return {
      changesetId,
      newVersion: await putNode(token, req.nodeId, { ...current, tags: prev.tags }, changesetId),
    };
  } catch (e) {
    if (isChangesetClosed(e) && !reopened) {
      const fresh = await openChangeset(token, CHANGESET_COMMENT);
      return revertWithRetry(token, req, current, fresh, true);
    }
    throw e;
  }
}

export async function POST(req: Request) {
  const token = await getOsmToken(req);
  if (!token) return NextResponse.json({ error: "not signed in to OSM" }, { status: 401 });

  const parsed = RevertRequest.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const { nodeId, kind, sentVersion } = parsed.data;

  try {
    // Read the node before touching any changeset, so an aborted undo leaves
    // nothing behind on OSM.
    const current = await getNode(token, nodeId).catch((e) => {
      // Undoing a create when the node is already gone: nothing to do.
      if (kind === "create" && e instanceof OsmApiError && e.status === 410) return null;
      throw e;
    });
    if (current === null) return NextResponse.json({ nodeId, alreadyGone: true });

    // Only undo what we submitted. A different current version means someone
    // else edited (or deleted+recreated) the node since — abort instead of
    // silently wiping their change.
    if (current.version !== sentVersion) {
      return NextResponse.json(
        { error: "point was changed by someone else since your edit — undo aborted" },
        { status: 409 },
      );
    }

    const initialChangeset =
      parsed.data.changesetId ?? (await openChangeset(token, CHANGESET_COMMENT));
    const { newVersion, changesetId } = await revertWithRetry(
      token,
      parsed.data,
      current,
      initialChangeset,
    );

    await appendJson("edit-log.json", {
      nodeId,
      action: "revert",
      changesetId,
      newVersion,
      at: new Date().toISOString(),
    });

    return NextResponse.json({
      changesetId,
      changesetUrl: changesetUrl(changesetId),
      nodeId,
      newVersion,
    });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 502 });
  }
}

import type { APIRoute } from "astro";
import { z } from "zod";
import { getOsmToken } from "@/lib/osmToken";
import { EditRequest } from "@rosm/core/schemas";
import {
  openChangeset,
  getNode,
  putNode,
  applyAction,
  todayIso,
  changesetUrl,
  OsmApiError,
  isChangesetClosed,
} from "@/lib/osm";
import { appendJson } from "@/lib/db";
import { editSummary } from "@rosm/core/editSummary";

export const prerender = false;

const CHANGESET_COMMENT = "Survey: drinking water / amenity status check";
const MAX_ATTEMPTS = 3;

// One write attempt: re-read the node so the version sent always matches the
// current db version (OSM rejects a stale version with 409), then PUT.
// Recurses on the two retryable 409 flavors:
//   - closed changeset (idle timeout, or an id persisted from a finished
//     session): open a fresh changeset — once — and retry the same edit.
//   - version conflict (a concurrent editor bumped the version between our
//     read and write): re-read + retry, up to MAX_ATTEMPTS.
async function putWithRetry(
  token: string,
  edit: z.infer<typeof EditRequest>,
  changesetId: number,
  attempt = 1,
  reopened = false,
): Promise<{ newVersion: number; changesetId: number }> {
  try {
    const node = await getNode(token, edit.nodeId);
    const tags = applyAction(node.tags, edit.action, edit.tagKey, todayIso(), edit.extras);
    const newVersion = await putNode(token, edit.nodeId, { ...node, tags }, changesetId);
    return { newVersion, changesetId };
  } catch (e) {
    if (isChangesetClosed(e) && !reopened) {
      const fresh = await openChangeset(token, CHANGESET_COMMENT);
      // Reopening doesn't consume a version-conflict retry: same attempt count.
      return putWithRetry(token, edit, fresh, attempt, true);
    }
    const conflict = e instanceof OsmApiError && e.status === 409;
    if (conflict && attempt < MAX_ATTEMPTS) {
      return putWithRetry(token, edit, changesetId, attempt + 1, reopened);
    }
    throw e;
  }
}

export const POST: APIRoute = async ({ request }) => {
  const token = await getOsmToken(request);
  if (!token) return Response.json({ error: "not signed in to OSM" }, { status: 401 });

  const parsed = EditRequest.safeParse(await request.json());
  if (!parsed.success) {
    return Response.json({ error: z.flattenError(parsed.error) }, { status: 400 });
  }
  const { nodeId, action, tagKey, extras } = parsed.data;

  try {
    const initialChangeset =
      parsed.data.changesetId ?? (await openChangeset(token, CHANGESET_COMMENT));
    const { newVersion, changesetId } = await putWithRetry(token, parsed.data, initialChangeset);

    await appendJson("edit-log.json", {
      nodeId,
      action,
      changesetId,
      newVersion,
      at: new Date().toISOString(),
      extras,
    });

    return Response.json({
      changesetId,
      changesetUrl: changesetUrl(changesetId),
      nodeId,
      action,
      newVersion,
      summary: editSummary(action, tagKey, todayIso(), extras),
    });
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 502 });
  }
};

import { callApi, postJson, UNEXPECTED_REPLY } from "@water-run/core/apiCall";
import { todayLocal } from "@water-run/core/editSummary";
import { useOutbox } from "@water-run/core/stores/outbox";
import type { EditExtras, Fountain, TagFilter } from "@water-run/core/schemas";
import { getToken } from "../auth/authStore";

// Same ceiling as an outbox send: a create that hangs on a dead cell must give
// the add sheet its error back rather than spin.
const CREATE_TIMEOUT_MS = 30_000;

export type CreatedFountain = Fountain & { changesetId: number };

type CreatedNode = {
  nodeId: number;
  changesetId: number;
  lat: number;
  lon: number;
  tags: Record<string, string>;
};

// Create a brand-new node of `tag` at a spot (a run's GPS position, or a spot
// held on any map), in the outbox's changeset so it travels with the edits made
// alongside it. Sent straight away, not queued like an edit: a create resent
// after a reply that was lost would add the point twice. Rejects with a
// message fit for the user, so the add sheet can keep what was entered for
// another try.
export async function createFountain(
  at: { lat: number; lon: number },
  tag: TagFilter,
  extras?: EditExtras,
): Promise<CreatedFountain> {
  // The token is the sign-in: the status endpoint can't tell signed out from
  // offline.
  if (!getToken()) throw new Error("Sign in first.");
  const reply = await callApi<CreatedNode>(
    "/api/osm/create",
    postJson({
      lat: at.lat,
      lon: at.lon,
      tag,
      changesetId: useOutbox.getState().changesetId,
      extras,
      surveyDate: todayLocal(),
    }),
    CREATE_TIMEOUT_MS,
    "Couldn't add the point. Please try again.",
  );
  if (!reply.ok) throw new Error(reply.message);
  const j = reply.data;
  if (typeof j?.nodeId !== "number") throw new Error(UNEXPECTED_REPLY);
  useOutbox.getState().setChangeset(j.changesetId);
  return { id: j.nodeId, lat: j.lat, lon: j.lon, tags: j.tags, changesetId: j.changesetId };
}

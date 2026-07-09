// OSM OAuth2 (PKCE) + edit operations: changesets and node tag updates.
// Read endpoints use .json; writes use XML per OSM API 0.6.
import crypto from "crypto";
import type { EditAction, EditExtras } from "./schemas";
import { APP_NAME } from "./appConfig";

export const OAUTH_BASE = process.env.OSM_OAUTH_BASE || "https://www.openstreetmap.org";
export const API_BASE = process.env.OSM_API_BASE || "https://api.openstreetmap.org";
const CLIENT_ID = process.env.OSM_CLIENT_ID || "";
const CLIENT_SECRET = process.env.OSM_CLIENT_SECRET || ""; // optional (confidential client)
const SCOPE = "read_prefs write_api";
// OSM `created_by` changeset tag — the editor/app attribution shown on every
// changeset we open. Client-controlled (nothing OSM-side); we set it here. Uses
// the brand name so app edits read as "ROSM" on osm.org, not the repo slug.
const CREATED_BY = APP_NAME;

// A returnTo is safe only as a same-origin relative path: one leading slash and
// not `//`/`/\` (which browsers treat as a protocol-relative absolute URL). This
// blocks open redirects through the OAuth flow.
export function isSafeReturnTo(p: string): boolean {
  return p.startsWith("/") && !p.startsWith("//") && !p.startsWith("/\\");
}

// ---- PKCE ----
export function makePkce() {
  const verifier = crypto.randomBytes(32).toString("base64url");
  const challenge = crypto.createHash("sha256").update(verifier).digest("base64url");
  return { verifier, challenge };
}

export function authUrl(redirectUri: string, challenge: string, state: string): string {
  const q = new URLSearchParams({
    response_type: "code",
    client_id: CLIENT_ID,
    redirect_uri: redirectUri,
    scope: SCOPE,
    code_challenge: challenge,
    code_challenge_method: "S256",
    state,
  });
  return `${OAUTH_BASE}/oauth2/authorize?${q.toString()}`;
}

export async function exchangeToken(
  code: string,
  verifier: string,
  redirectUri: string,
): Promise<string> {
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code,
    redirect_uri: redirectUri,
    client_id: CLIENT_ID,
    code_verifier: verifier,
  });
  if (CLIENT_SECRET) body.set("client_secret", CLIENT_SECRET);
  const res = await fetch(`${OAUTH_BASE}/oauth2/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  if (!res.ok) throw new Error(`token exchange ${res.status}: ${await res.text()}`);
  const json = (await res.json()) as { access_token: string };
  return json.access_token;
}

function auth(token: string) {
  return { Authorization: `Bearer ${token}` };
}

// Error carrying the HTTP status so callers can branch on it (e.g. 409 conflict)
// without fragile string matching on the message.
export class OsmApiError extends Error {
  constructor(
    readonly status: number,
    readonly op: string,
    readonly body: string,
  ) {
    super(`${op} ${status}: ${body}`);
    this.name = "OsmApiError";
  }
}

// A 409 whose body says the changeset "was closed" (idle timeout, prior finish,
// stale persisted id) — distinct from a 409 version conflict on the node itself.
export function isChangesetClosed(e: unknown): boolean {
  return e instanceof OsmApiError && e.status === 409 && /was closed/i.test(e.body);
}

function escapeXml(s: string): string {
  return (
    s
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      // Strip XML 1.0 invalid control chars (keep tab/LF/CR) so a stray char in
      // one tag value can't make OSM reject the whole PUT.
      .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, "")
  );
}

// ---- changeset ----
export async function openChangeset(token: string, comment: string): Promise<number> {
  const xml = `<osm><changeset>
    <tag k="created_by" v="${escapeXml(CREATED_BY)}"/>
    <tag k="comment" v="${escapeXml(comment)}"/>
  </changeset></osm>`;
  const res = await fetch(`${API_BASE}/api/0.6/changeset/create`, {
    method: "PUT",
    headers: { ...auth(token), "Content-Type": "text/xml" },
    body: xml,
  });
  if (!res.ok) throw new OsmApiError(res.status, "open changeset", await res.text());
  return Number((await res.text()).trim());
}

export async function closeChangeset(token: string, id: number): Promise<void> {
  const res = await fetch(`${API_BASE}/api/0.6/changeset/${id}/close`, {
    method: "PUT",
    headers: auth(token),
  });
  // Throw so the finish flow can surface the failure. Edits already PUT are
  // safe regardless, and an unclosed changeset auto-closes server-side.
  if (!res.ok) throw new OsmApiError(res.status, "close changeset", await res.text());
}

// Web (not API) URL for a changeset, for linking the user to their edits.
export function changesetUrl(id: number): string {
  return `${OAUTH_BASE}/changeset/${id}`;
}

// ---- node ----
type NodeData = {
  version: number;
  lat: number;
  lon: number;
  tags: Record<string, string>;
};

export async function getNode(token: string, id: number): Promise<NodeData> {
  const res = await fetch(`${API_BASE}/api/0.6/node/${id}.json`, {
    headers: auth(token),
  });
  if (!res.ok) throw new OsmApiError(res.status, "get node", await res.text());
  const json = (await res.json()) as {
    elements: { lat: number; lon: number; version: number; tags?: Record<string, string> }[];
  };
  const el = json.elements[0];
  // Deleted/redacted nodes return an empty elements array. Surface a clear error
  // instead of crashing on `el.version`.
  if (!el) throw new OsmApiError(410, "get node", `node ${id} not found (deleted or redacted)`);
  return { version: el.version, lat: el.lat, lon: el.lon, tags: el.tags ?? {} };
}

function tagsXml(tags: Record<string, string>): string {
  return Object.entries(tags)
    .map(([k, v]) => `<tag k="${escapeXml(k)}" v="${escapeXml(v)}"/>`)
    .join("");
}

export async function putNode(
  token: string,
  id: number,
  node: NodeData,
  changesetId: number,
): Promise<number> {
  const xml = `<osm><node id="${id}" version="${node.version}" lat="${node.lat}" lon="${node.lon}" changeset="${changesetId}">${tagsXml(node.tags)}</node></osm>`;
  const res = await fetch(`${API_BASE}/api/0.6/node/${id}`, {
    method: "PUT",
    headers: { ...auth(token), "Content-Type": "text/xml" },
    body: xml,
  });
  if (!res.ok) throw new OsmApiError(res.status, "put node", await res.text());
  return Number((await res.text()).trim()); // new version
}

// Create a new node. OSM assigns the id (the placeholder in the body is ignored
// for a single-element create), returned as plain text.
export async function createNode(
  token: string,
  lat: number,
  lon: number,
  tags: Record<string, string>,
  changesetId: number,
): Promise<number> {
  const xml = `<osm><node lat="${lat}" lon="${lon}" changeset="${changesetId}">${tagsXml(tags)}</node></osm>`;
  const res = await fetch(`${API_BASE}/api/0.6/node/create`, {
    method: "PUT",
    headers: { ...auth(token), "Content-Type": "text/xml" },
    body: xml,
  });
  if (!res.ok) throw new OsmApiError(res.status, "create node", await res.text());
  return Number((await res.text()).trim()); // new node id
}

// Pure tag transform per survey action. tagKey is the primary key (e.g. "amenity").
export function applyAction(
  tags: Record<string, string>,
  action: EditAction,
  tagKey: string,
  today: string,
  extras?: EditExtras,
): Record<string, string> {
  const next = { ...tags };
  const lifecycle = (prefix: string) => {
    if (next[tagKey] != null) {
      next[`${prefix}:${tagKey}`] = next[tagKey];
      delete next[tagKey];
    }
  };
  switch (action) {
    case "confirm":
      next.check_date = today;
      break;
    case "dog_only":
      // Source exists and works, but is for dogs — not intended for humans.
      // amenity=drinking_water / =water_point self-assert human potability, so
      // leaving them while adding drinking_water=no contradicts the primary tag.
      // Correct per OSM wiki: demote the primary to a neutral physical feature
      // (man_made=water_tap), then state potability + the dog facility
      // explicitly. Other primaries (amenity=fountain, natural=spring) don't
      // imply potability, so keep them and only add the explicit flags.
      if (next.amenity === "drinking_water" || next.amenity === "water_point") {
        next.man_made = "water_tap";
        delete next.amenity;
      }
      next.drinking_water = "no";
      next.dog = "yes";
      next.check_date = today;
      break;
    case "out_of_order":
      lifecycle("disused");
      next.check_date = today;
      break;
    case "removed":
      lifecycle("abandoned");
      next.check_date = today;
      break;
  }
  // Advanced OSM facts, merged on top of the action. A public note applies to any
  // action; seasonal only makes sense where the source still exists (confirm /
  // dog_only) — setting it on a disused/abandoned node would contradict itself.
  if (extras?.note) next.note = extras.note;
  if (extras?.seasonal && (action === "confirm" || action === "dog_only")) {
    next.seasonal = "yes";
  }
  return next;
}

export function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

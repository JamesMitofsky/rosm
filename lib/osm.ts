// OSM OAuth2 (PKCE) + edit operations: changesets and node tag updates.
// Read endpoints use .json; writes use XML per OSM API 0.6.
import crypto from "crypto";
import type { EditAction } from "./schemas";

export const OAUTH_BASE =
  process.env.OSM_OAUTH_BASE || "https://master.apis.dev.openstreetmap.org";
export const API_BASE =
  process.env.OSM_API_BASE || "https://master.apis.dev.openstreetmap.org";
const CLIENT_ID = process.env.OSM_CLIENT_ID || "";
const CLIENT_SECRET = process.env.OSM_CLIENT_SECRET || ""; // optional (confidential client)
const SCOPE = "read_prefs write_api";
const CREATED_BY = "run-for-maps";

// ---- PKCE ----
export function makePkce() {
  const verifier = crypto.randomBytes(32).toString("base64url");
  const challenge = crypto
    .createHash("sha256")
    .update(verifier)
    .digest("base64url");
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

function escapeXml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
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
  if (!res.ok) throw new Error(`open changeset ${res.status}: ${await res.text()}`);
  return Number((await res.text()).trim());
}

export async function closeChangeset(token: string, id: number): Promise<void> {
  await fetch(`${API_BASE}/api/0.6/changeset/${id}/close`, {
    method: "PUT",
    headers: auth(token),
  });
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
  if (!res.ok) throw new Error(`get node ${res.status}: ${await res.text()}`);
  const json = (await res.json()) as {
    elements: { lat: number; lon: number; version: number; tags?: Record<string, string> }[];
  };
  const el = json.elements[0];
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
  if (!res.ok) throw new Error(`put node ${res.status}: ${await res.text()}`);
  return Number((await res.text()).trim()); // new version
}

export async function deleteNode(
  token: string,
  id: number,
  node: NodeData,
  changesetId: number,
): Promise<number> {
  const xml = `<osm><node id="${id}" version="${node.version}" lat="${node.lat}" lon="${node.lon}" changeset="${changesetId}"/></osm>`;
  const res = await fetch(`${API_BASE}/api/0.6/node/${id}`, {
    method: "DELETE",
    headers: { ...auth(token), "Content-Type": "text/xml" },
    body: xml,
  });
  if (!res.ok) throw new Error(`delete node ${res.status}: ${await res.text()}`);
  return Number((await res.text()).trim());
}

// Pure tag transform per survey action. tagKey is the primary key (e.g. "amenity").
export function applyAction(
  tags: Record<string, string>,
  action: EditAction,
  tagKey: string,
  today: string,
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
    case "out_of_order":
      lifecycle("disused");
      next.check_date = today;
      break;
    case "removed":
      lifecycle("abandoned");
      next.check_date = today;
      break;
    case "delete":
      break; // handled by deleteNode, no tag change
  }
  return next;
}

export function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

// Fetch OSM points from the Overpass API.
import type { Fountain } from "./schemas";
import type { TagFilter } from "./schemas";

const OVERPASS_URL =
  process.env.OVERPASS_URL || "https://overpass-api.de/api/interpreter";

type OverpassEl = {
  type: string;
  id: number;
  lat?: number;
  lon?: number;
  center?: { lat: number; lon: number };
  tags?: Record<string, string>;
};

// Build a query for nodes/ways/relations matching key=value within radius.
export function buildQuery(
  lat: number,
  lon: number,
  radiusM: number,
  tag: TagFilter,
): string {
  const sel = `["${tag.key}"="${tag.value}"]`;
  const around = `(around:${Math.round(radiusM)},${lat},${lon})`;
  return `[out:json][timeout:25];
(
  node${sel}${around};
  way${sel}${around};
  relation${sel}${around};
);
out center tags;`;
}

export async function fetchFountains(
  lat: number,
  lon: number,
  radiusM: number,
  tag: TagFilter,
): Promise<Fountain[]> {
  const query = buildQuery(lat, lon, radiusM, tag);
  const res = await fetch(OVERPASS_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      "User-Agent": "run-for-maps/1.0 (OSM survey tool)",
    },
    body: new URLSearchParams({ data: query }).toString(),
  });
  if (!res.ok) {
    throw new Error(`Overpass error ${res.status}: ${await res.text()}`);
  }
  const json = (await res.json()) as { elements: OverpassEl[] };
  return json.elements
    .map((el): Fountain | null => {
      const lt = el.lat ?? el.center?.lat;
      const ln = el.lon ?? el.center?.lon;
      if (lt == null || ln == null) return null;
      return { id: el.id, lat: lt, lon: ln, tags: el.tags ?? {} };
    })
    .filter((f): f is Fountain => f !== null);
}

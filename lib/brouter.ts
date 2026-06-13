// Foot routing via BRouter public API (free, no key). Returns street geometry + distance.
import type { Pt } from "./geo";

const BROUTER_URL = process.env.BROUTER_URL || "https://brouter.de/brouter";
// Foot profile available on the public brouter.de server.
const BROUTER_PROFILE = process.env.BROUTER_PROFILE || "hiking-beta";

export type FootRoute = {
  // GeoJSON LineString coordinates [lon, lat]
  coords: [number, number][];
  distanceM: number;
};

// points must be in visit order; loop appends start at the end.
export async function footRoute(points: Pt[], loop: boolean): Promise<FootRoute> {
  const seq = loop ? [...points, points[0]] : points;
  const lonlats = seq.map((p) => `${p.lon},${p.lat}`).join("|");
  const url =
    `${BROUTER_URL}?lonlats=${lonlats}` +
    `&profile=${BROUTER_PROFILE}&alternativeidx=0&format=geojson`;

  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`BRouter error ${res.status}: ${await res.text()}`);
  }
  const gj = (await res.json()) as {
    features: {
      geometry: { coordinates: [number, number][] };
      properties: { "track-length"?: string };
    }[];
  };
  const feat = gj.features?.[0];
  if (!feat) throw new Error("BRouter returned no route");
  const distanceM = Number(feat.properties["track-length"] ?? 0);
  return { coords: feat.geometry.coordinates, distanceM };
}

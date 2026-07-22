import { z } from "zod";

// ─────────────────────────────────────────────────────────────────────────────
// SINGLE SOURCE OF TRUTH for the *domain* shape of a fountain in this app.
//
// A raw OSM node (id/lat/lon/tags — see schemas.ts `Fountain`) is the transport
// shape. This file is the *semantic* shape: the handful of facts a surveyor
// actually records, decoupled from how OSM encodes them in tags and from how the
// UI toggles project them. Everything else (applyAction, editSummary, the
// prefill helpers, the toggle components) should be derivable from this.
// ─────────────────────────────────────────────────────────────────────────────

export const FountainStatus = z.enum(["working", "out_of_order", "removed"]);
export type FountainStatus = z.infer<typeof FountainStatus>;

export const FountainFacts = z
  .object({
    status: FountainStatus,
    humans: z.boolean(),
    dogs: z.boolean(),
    bubbler: z.boolean(),
    bottleFiller: z.boolean(),
    seasonal: z.boolean(),
    note: z.string().max(255).optional(),
  })
  .refine((f) => f.humans || f.dogs, {
    message: "A fountain must serve humans, dogs, or both.",
    path: ["humans"],
  })
  .refine((f) => f.bubbler || f.bottleFiller, {
    message: "A fountain must have a bubbler, a bottle filler, or both.",
    path: ["bubbler"],
  });
export type FountainFacts = z.infer<typeof FountainFacts>;

export const DEFAULT_FACTS: FountainFacts = {
  status: "working",
  humans: true,
  dogs: false,
  bubbler: true,
  bottleFiller: false,
  seasonal: false,
};

// Decode a node's current tags into domain facts, for prefilling the survey form.
export function factsFromTags(tags: Record<string, string>): FountainFacts {
  const keys = Object.keys(tags);
  const status: FountainStatus = keys.some((k) => k.startsWith("abandoned:"))
    ? "removed"
    : keys.some((k) => k.startsWith("disused:"))
      ? "out_of_order"
      : "working";
  const bottleFiller = tags.bottle === "yes" || tags.fountain === "bottle_refill";
  const bubbler =
    tags.fountain === "bottle_refill" ? false : tags.fountain != null || tags.bottle !== "yes";
  return {
    status,
    humans: tags.amenity !== "watering_place" && tags.drinking_water !== "no",
    dogs: tags.dog === "yes" || tags.amenity === "watering_place",
    bubbler,
    bottleFiller,
    seasonal: tags.seasonal === "yes",
    ...(tags.note ? { note: tags.note } : {}),
  };
}

export type Audience = "humans" | "dogs" | "both";
export type Dispenser = "bubbler" | "bottle" | "both";

export const audienceOf = (f: FountainFacts): Audience =>
  f.humans && f.dogs ? "both" : f.dogs ? "dogs" : "humans";
export const dispenserOf = (f: FountainFacts): Dispenser =>
  f.bubbler && f.bottleFiller ? "both" : f.bottleFiller ? "bottle" : "bubbler";

export const audienceToBools = (a: Audience) => ({
  humans: a !== "dogs",
  dogs: a !== "humans",
});
export const dispenserToBools = (d: Dispenser) => ({
  bubbler: d !== "bottle",
  bottleFiller: d !== "bubbler",
});

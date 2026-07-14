import { z } from "zod";

// ─────────────────────────────────────────────────────────────────────────────
// SINGLE SOURCE OF TRUTH for the *domain* shape of a fountain in this app.
//
// A raw OSM node (id/lat/lon/tags — see schemas.ts `Fountain`) is the transport
// shape. This file is the *semantic* shape: the handful of facts a surveyor
// actually records, decoupled from how OSM encodes them in tags and from how the
// UI toggles project them. Everything else (applyAction, editSummary, the
// prefill helpers, the toggle components) should be derivable from this.
//
// The facets are orthogonal booleans, except `status` which is a lifecycle the
// three survey actions move a node through. A real fountain always serves at
// least one audience and has at least one dispenser, so those pairs can't both
// be false (the 3-way UI toggles enforce this — there's no "neither" option).
// ─────────────────────────────────────────────────────────────────────────────

export const FountainStatus = z.enum(["working", "out_of_order", "removed"]);
export type FountainStatus = z.infer<typeof FountainStatus>;

export const FountainFacts = z
  .object({
    // Lifecycle. "working" = live + potable-as-tagged; the other two demote the
    // primary tag behind disused:/abandoned: on write.
    status: FountainStatus,
    // Audience — independent. Both true = a human fountain that also has a dog bowl.
    humans: z.boolean(),
    dogs: z.boolean(),
    // Dispenser — independent. Both true = a bubbler you can also fill bottles at.
    bubbler: z.boolean(),
    bottleFiller: z.boolean(),
    // Runs only part of the year.
    seasonal: z.boolean(),
    // Free-text public note. Applies to ANY status (a removed fountain can still
    // carry a "removed during 2026 roadworks" note), unlike the facets above
    // which are only written while working. Maps to OSM note=*.
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

// ─── OSM tag encoding — the one canonical mapping table ──────────────────────
//
//   facet            | OSM tags
//   -----------------|-------------------------------------------------------
//   status=working   | primary key stays active, check_date stamped
//   status=out_of_..| primary key → disused:<key>
//   status=removed   | primary key → abandoned:<key>
//   humans           | drinking_water=yes | no  (+ retag amenity=drinking_water
//                    |   / water_point → amenity=watering_place when false)
//   dogs             | dog=yes | no
//   bubbler          | fountain=bubbler (regional archetypes preserved)
//   bottleFiller     | bottle=yes | no; fountain=bottle_refill when !bubbler
//   seasonal         | seasonal=yes  (only while working)
//   note             | note=<text>   (any status)
//
// These are the established OSM tags (fountain=bubbler ~18k uses,
// fountain=bottle_refill ~2.8k, bottle=yes ~30k, drinking_water ~194k, dog
// ~167k) — no custom scheme. See the wiki: Key:fountain, Key:bottle.

const GENERIC_FOUNTAIN = new Set(["bubbler", "bottle_refill"]);

// Decode a node's current tags into domain facts, for prefilling the survey form.
export function factsFromTags(tags: Record<string, string>): FountainFacts {
  const keys = Object.keys(tags);
  const status: FountainStatus = keys.some((k) => k.startsWith("abandoned:"))
    ? "removed"
    : keys.some((k) => k.startsWith("disused:"))
      ? "out_of_order"
      : "working";
  // fountain=bottle_refill is the only value that means "not a bubbler". Any
  // other fountain=* (bubbler, regional archetypes like nasone) is drinkable
  // directly; an untagged node defaults to a bubbler unless it's bottle-only.
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

// ─── UI toggle projections ───────────────────────────────────────────────────
// The 3-way toggle components (AudienceToggle, DispenserToggle) and EditAction
// are projections of the booleans above. Kept here so the mapping lives in one
// place; the enum *types* still live in schemas.ts (the OSM-facing contract).

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

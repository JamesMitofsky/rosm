import type { Dispenser } from "@/lib/schemas";

// Derive the current dispenser type from a node's OSM tags, used to prefill the
// survey toggle so the surveyor sees what's already recorded. Mirrors the wiki
// tagging: fountain=bubbler (drink direct) vs fountain=bottle_refill (fill a
// bottle), with bottle=yes as the orthogonal "can refill a bottle" flag.
// Defaults to bubbler (the common case) when nothing relevant is tagged.
export function dispenserFromTags(tags: Record<string, string>): Dispenser {
  const bottle = tags.bottle === "yes";
  if (tags.fountain === "bottle_refill") return "bottle";
  if (tags.fountain === "bubbler") return bottle ? "both" : "bubbler";
  return bottle ? "bottle" : "bubbler";
}

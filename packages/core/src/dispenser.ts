import type { Dispenser } from "./schemas";

// Derive the current dispenser type from a node's OSM tags, used to prefill the
// survey toggle so the surveyor sees what's already recorded.
export function dispenserFromTags(tags: Record<string, string>): Dispenser {
  const bottle = tags.bottle === "yes";
  if (tags.fountain === "bottle_refill") return "bottle";
  if (tags.fountain === "bubbler") return bottle ? "both" : "bubbler";
  return bottle ? "bottle" : "bubbler";
}

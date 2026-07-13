import type { Dispenser } from "@/lib/schemas";

// Derive the current dispenser type from a node's OSM tags, used to prefill the
// survey toggle so the surveyor sees what's already recorded.
// fountain=bubbler = a jet you drink from directly; bottle=yes = a bottle-refill
// spout; both keys present = both. Defaults to bubbler (the common case) when
// neither is tagged.
export function dispenserFromTags(tags: Record<string, string>): Dispenser {
  const bubbler = tags.fountain === "bubbler";
  const bottle = tags.bottle === "yes";
  if (bubbler && bottle) return "both";
  if (bottle) return "bottle";
  return "bubbler";
}

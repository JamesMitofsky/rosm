import type { Audience } from "@/lib/schemas";

// Derive the current human/dog audience from a node's OSM tags, used to prefill
// the survey toggle so the surveyor sees what's already recorded.
// amenity=watering_place or drinking_water=no means not human-potable (dogs
// only); an explicit dog=yes on an otherwise-potable source means it serves both.
export function audienceFromTags(tags: Record<string, string>): Audience {
  if (tags.amenity === "watering_place" || tags.drinking_water === "no") return "dogs";
  if (tags.dog === "yes") return "both";
  return "humans";
}

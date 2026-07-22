import type { Audience } from "./schemas";

// Derive the current human/dog audience from a node's OSM tags, used to prefill
// the survey toggle so the surveyor sees what's already recorded.
export function audienceFromTags(tags: Record<string, string>): Audience {
  if (tags.amenity === "watering_place" || tags.drinking_water === "no") return "dogs";
  if (tags.dog === "yes") return "both";
  return "humans";
}

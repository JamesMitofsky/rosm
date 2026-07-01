import { z } from "zod";

// A point fetched from OSM (Overpass), with its raw tags.
export const FountainSchema = z.object({
  id: z.number(), // OSM node id
  lat: z.number(),
  lon: z.number(),
  tags: z.record(z.string(), z.string()).default({}),
});
export type Fountain = z.infer<typeof FountainSchema>;

// State the surveyor records on arrival.
export const EditAction = z.enum(["confirm", "dog_only", "out_of_order", "removed"]);
export type EditAction = z.infer<typeof EditAction>;

// Optional advanced OSM facts recorded alongside an action. These become real
// node tags (written to OSM), unlike the old local-only comment.
export const EditExtras = z.object({
  seasonal: z.boolean().optional(), // seasonal=yes: source runs only part of the year
  note: z.string().max(255).optional(), // OSM note=* : public free-text on the node
});
export type EditExtras = z.infer<typeof EditExtras>;

// Targetable OSM tag (key=value), e.g. amenity=drinking_water.
export const TagFilterSchema = z.object({
  key: z.string().min(1),
  value: z.string().min(1),
});
export type TagFilter = z.infer<typeof TagFilterSchema>;

// How to filter points by when they were last surveyed (check_date tag).
// "any" = no filter; "stale" = not checked within the window (or never checked,
// i.e. worth verifying); "fresh" = checked within the window.
export const RecencyMode = z.enum(["any", "stale", "fresh"]);
export type RecencyMode = z.infer<typeof RecencyMode>;

export const FountainsRequest = z.object({
  lat: z.number(),
  lon: z.number(),
  radiusM: z.number().positive(),
  tag: TagFilterSchema,
  recencyMode: RecencyMode.default("any"),
  recencyMonths: z.number().positive().default(6),
});

// Create a brand-new OSM node at a surveyed location, tagged with the point
// type currently being surveyed (e.g. amenity=drinking_water).
export const CreateNodeRequest = z.object({
  lat: z.number(),
  lon: z.number(),
  tag: TagFilterSchema,
  changesetId: z.number().optional(),
});

export const RouteRequest = z.object({
  // ordered waypoints (start first); planner has already chosen + ordered them
  points: z.array(z.object({ lat: z.number(), lon: z.number() })).min(2),
  loop: z.boolean(),
});

export const EditRequest = z.object({
  nodeId: z.number(),
  action: EditAction,
  tagKey: z.string().default("amenity"), // primary key to lifecycle-prefix
  changesetId: z.number().optional(),
  extras: EditExtras.optional(), // advanced OSM tags (seasonal, note)
});

// Persisted record of an edit we made (local audit log).
export const EditLogEntrySchema = z.object({
  nodeId: z.number(),
  action: EditAction,
  changesetId: z.number(),
  newVersion: z.number(),
  at: z.string(), // ISO timestamp
  extras: EditExtras.optional(), // advanced OSM tags (seasonal, note)
});
export type EditLogEntry = z.infer<typeof EditLogEntrySchema>;

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
export const EditAction = z.enum(["confirm", "out_of_order", "removed", "delete"]);
export type EditAction = z.infer<typeof EditAction>;

// Targetable OSM tag (key=value), e.g. amenity=drinking_water.
export const TagFilterSchema = z.object({
  key: z.string().min(1),
  value: z.string().min(1),
});
export type TagFilter = z.infer<typeof TagFilterSchema>;

export const FountainsRequest = z.object({
  lat: z.number(),
  lon: z.number(),
  radiusM: z.number().positive(),
  tag: TagFilterSchema,
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
});

// Persisted record of an edit we made (local audit log).
export const EditLogEntrySchema = z.object({
  nodeId: z.number(),
  action: EditAction,
  changesetId: z.number(),
  newVersion: z.number(),
  at: z.string(), // ISO timestamp
});
export type EditLogEntry = z.infer<typeof EditLogEntrySchema>;

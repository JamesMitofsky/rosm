# How a survey edits a node's tags (`applyAction`)

Human-maintained note on the tag-transform contract in `lib/osm.ts`
(`applyAction`). It's a **pure function**: `(tags, action, tagKey, today, extras)`
→ new tag map. No mutation, no network.

## Core rule: copy, don't rebuild

`applyAction` starts from the node's **existing** tags:

```ts
const next = { ...tags };
```

Everything else is a targeted edit on top of that copy. We never discard tags we
didn't touch — regional archetypes (`fountain=nasone`, `wallace`, …), existing
notes, unrelated keys all survive the round-trip.

## What it actually changes

1. **Relocates the primary key** (only for lifecycle actions). The primary key is
   passed in as `tagKey` (e.g. `amenity`). Rather than deleting the fact, we move
   it under a [lifecycle prefix](https://wiki.openstreetmap.org/wiki/Lifecycle_prefix)
   — delete the live key, re-add it prefixed:

   - `out_of_order` → `amenity` becomes `disused:amenity`
   - `removed` → `amenity` becomes `abandoned:amenity`
   - `confirm` → primary untouched (source still works)

   This is delete + re-add, so `amenity=drinking_water` → `disused:amenity=drinking_water`
   (value preserved, key relocated).

2. **Stamps `check_date`** = `today` on every action (confirm / out_of_order /
   removed). Records when we last surveyed it.

3. **Applies `note`** from `extras` when present — a public note is valid on any
   action, including a disused/abandoned node.

## Notes

- `seasonal` and audience retagging (`drinking_water=*` / `dog=*`, and the
  `drinking_water` ↔ `watering_place` primary swap) also live in `applyAction`,
  but only apply on `confirm` — they only make sense while the source still
  exists. See the inline comments in `lib/osm.ts` for that logic.
- Because it's pure, it's directly unit-testable — see `tests/lib/osm.test.ts`.

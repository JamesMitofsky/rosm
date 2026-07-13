# The `bottle` tag is ambiguous

Human-maintained note on why `bottle=yes/no` (see
[osm-wiki-standards.md](./osm-wiki-standards.md), "Dispenser") is a fuzzy signal,
not a hard fact. Read this before leaning on it for filtering or UI copy.

Source: https://wiki.openstreetmap.org/wiki/Key:bottle#Unclear_use

## What it's supposed to mean

`bottle=yes` = "you can easily refill a drinking bottle here";
`bottle=no` = "you can't." Requires `amenity=drinking_water`, implies
`drinking_water=yes`. ~30,400 global uses, tagged "in use" but flagged with
caution.

## Why it's unclear

### 1. "Bottle" has no defined size

The wiki never says what bottle it means. In practice mappers picture very
different objects:

| Bottle                  | Typical volume | Use case                                          |
| ----------------------- | -------------- | ------------------------------------------------- |
| Large water bottle      | 1.5 L          | Longer trips — car, bicycle panniers              |
| Standard cycling bottle | 0.75 L         | Fits a standard bike bottle holder, quick to grab |
| Hiking / belt bottle    | 0.3–0.5 L      | Small, carries easy, clips to a belt              |

This matters most for **tap/sink clearance**. The vertical gap between spout and
basin decides which bottles physically fit. The same source can easily take a
short 0.3 L hiking bottle while a tall 1.5 L bottle won't fit at all — yet both
get flattened to a single `bottle=yes` or `bottle=no`.

### 2. "Easy" is subjective

"Easily refilled" is a judgment call, not a measurement. Two surveyors at the
same tap can disagree. Nothing about the tag is objectively verifiable, which
cuts against OSM's own verifiability principle.

### 3. Overloaded meaning

The tag gets used for at least three different things:

- whether a `drinking_water` point accommodates bottle filling,
- a `fountain=bottle_refill`-style downward dispenser hint,
- (rarely, undocumented) whether empty bottles are for sale — `bottle=only`,
  ~4 uses.

## What this means for us

- Treat `bottle=yes/no` as a **soft hint**, never a guarantee a specific bottle
  fits.
- If we surface it in the UI, avoid implying a size promise. Prefer wording like
  "bottle-friendly" over "fits your bottle."
- Real clearance info (spout height / gap) would be more useful than the flag,
  but there's no established OSM tag for it — don't invent one
  (see osm-wiki-standards.md, "On inventing our own tags").

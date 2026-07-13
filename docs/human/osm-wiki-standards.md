# OSM Wiki Standards

Human-maintained reference for how this app maps its fountain data onto
established OpenStreetMap tags. We do **not** invent our own scheme — every tag
below is an existing, widely-used OSM tag (see counts + sources). This file is
the source of truth for tagging decisions; the code should follow it.

## Primary type — what the thing _is_

| Tag                      | Meaning                                                                                                                                         | Source                                                                   |
| ------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| `amenity=drinking_water` | A drinking place **for humans**. Asserts human potability. Tag `dog=yes` indicates a dog water bowl is available as well.                       | [wiki](https://wiki.openstreetmap.org/wiki/Tag:amenity%3Ddrinking_water) |
| `amenity=watering_place` | A place where **animals** (dogs, livestock, horses) can drink. A distinct feature from a human drinking-water point.                            | https://wiki.openstreetmap.org/wiki/Tag:amenity=watering_place           |
| `man_made=water_tap`     | A neutral water outlet that does **not** assert human potability on its own. Used with `drinking_water=yes/no` to say whether people may drink. | [wiki](https://wiki.openstreetmap.org/wiki/Tag:man_made%3Dwater_tap)     |

Because `amenity=drinking_water` _means_ "humans can drink here," a source that is
**not** human-potable (e.g. dogs-only) cannot carry it without lying. We retag a
dogs-only source as `amenity=watering_place` (+ `drinking_water=no` + `dog=yes`).
Re-surveying it as human-potable restores `amenity=drinking_water`, so the
audience toggle round-trips instead of one-way demoting.

## Who it's for — audience

| Tag                         | Meaning                                        | Source                                                         |
| --------------------------- | ---------------------------------------------- | -------------------------------------------------------------- |
| `drinking_water=yes` / `no` | Whether the water is potable for humans.       | [wiki](https://wiki.openstreetmap.org/wiki/Key:drinking_water) |
| `dog=yes` / `no`            | Whether there's a dog water bowl / dog access. | [wiki](https://wiki.openstreetmap.org/wiki/Key:dog)            |

`drinking_water=yes` is **redundant** on a primary that already asserts human
potability (`amenity=drinking_water` / `water_point`) — we omit it there and only
state potability explicitly on primaries that don't imply it (`amenity=fountain`,
`natural=spring`, …). `drinking_water=no` is always informative, so it's kept.

## Dispenser — how you get the water

`fountain=*` is the physical archetype (single value); `bottle=*` is an
orthogonal "can you refill a bottle here" flag.

| Tag                      | Meaning                                                                   | ~Global uses | Source                                                   |
| ------------------------ | ------------------------------------------------------------------------- | ------------ | -------------------------------------------------------- |
| `fountain=bubbler`       | Jets water up to drink from directly.                                     | ~18,200      | [wiki](https://wiki.openstreetmap.org/wiki/Key:fountain) |
| `fountain=bottle_refill` | Jets water down at low pressure to fill a bottle. Pair with `bottle=yes`. | ~2,800       | [wiki](https://wiki.openstreetmap.org/wiki/Key:fountain) |
| `bottle=yes` / `no`      | Whether it's practical to refill a drinking bottle.                       | ~30,400      | [wiki](https://wiki.openstreetmap.org/wiki/Key:bottle)   |

Regional archetypes (`fountain=nasone`, `wallace`, …) are drinking fountains too
— preserve them on re-survey rather than overwriting with `bubbler`.

## Other facets

| Tag                     | Meaning                                                             | Source                                                     |
| ----------------------- | ------------------------------------------------------------------- | ---------------------------------------------------------- |
| `seasonal=yes`          | Source runs only part of the year.                                  | [wiki](https://wiki.openstreetmap.org/wiki/Key:seasonal)   |
| `note=<text>`           | Free-text public note on the node (any status).                     | [wiki](https://wiki.openstreetmap.org/wiki/Key:note)       |
| `check_date=YYYY-MM-DD` | When the feature was last surveyed. Stamped on every survey action. | [wiki](https://wiki.openstreetmap.org/wiki/Key:check_date) |

## Lifecycle — does it work

| State        | Encoding                                                       | Source                                                       |
| ------------ | -------------------------------------------------------------- | ------------------------------------------------------------ |
| working      | primary key active                                             | —                                                            |
| out of order | `disused:<key>` prefix (e.g. `disused:amenity=drinking_water`) | [wiki](https://wiki.openstreetmap.org/wiki/Lifecycle_prefix) |
| removed      | `abandoned:<key>` prefix                                       | [wiki](https://wiki.openstreetmap.org/wiki/Lifecycle_prefix) |

## On inventing our own tags

OSM permits new tags, but only after searching existing schemes, and requires
documenting them on the wiki, keeping them verifiable, and avoiding
fragmentation. Every fountain fact we record already has an established tag —
so we use those, no custom scheme.
Source: https://wiki.openstreetmap.org/wiki/Any_tags_you_like

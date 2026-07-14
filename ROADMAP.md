# Roadmap Ideas

Loose backlog of future directions. Not committed work — ideas to weigh.

## Local stores supporting water refill

Beyond public fountains, surface **shops, cafes, restaurants, and bars that let
you refill a water bottle for free** as part of a refill network.

- OSM tag: `drinking_water:refill=yes` — an establishment on a refill network
  that fills bottles free for anyone (requires a visible sticker/sign; don't tag
  discretionary refills without signage).
- Related: `drinking_water:refill:network=*` (which scheme, e.g. RefillMyBottle),
  `drinking_water:refill:self_service=*`.
- Distinct concept from `amenity=drinking_water` (public fountains/taps) — these
  are commercial venues opted into a refill scheme. A separate point type / layer.
- Source: https://wiki.openstreetmap.org/wiki/Key:drinking_water:refill

Would roughly double the "where can I get water" coverage in dense areas where
fountains are sparse but cafes are everywhere. Needs its own survey flow +
map layer since the primary tag and audience model differ from fountains.

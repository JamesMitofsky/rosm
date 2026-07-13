import type { FountainFacts } from "@/lib/fountainModel";

// ─────────────────────────────────────────────────────────────────────────────
// Worked examples of every fountain "type" the app can record. Reference only;
// not imported by the app. Mirror lib/osm.ts `applyAction` + the mapping table
// in docs/human/osm-wiki-standards.md.
//
// COMPLETE: the full wire output for each type, including check_date (stamped on
// every survey action). For a slimmer read with check_date stripped, see
// partialExampleFountains.ts.
//
// Two arrays, aligned by `name` and index:
//   • exampleOsmTags   — the exact tags sent to OSM, so you can read the wire
//                        output for every type straight down, one after another.
//   • exampleUserInput — the survey/toggle input (FountainFacts) that produced
//                        each, kept at the bottom out of the way.
//
// All examples start from a base primary of amenity=drinking_water. Audience +
// dispenser + seasonal are written only while working (confirm); the
// out-of-order / removed examples show why those fields drop.
// ─────────────────────────────────────────────────────────────────────────────

const CHECK_DATE = "2026-07-13";

// ─── What goes to OSM — read one after the other ─────────────────────────────
export const exampleOsmTags: { name: string; osmTags: Record<string, string> }[] = [
  // Working · humans
  {
    name: "Bubbler (the default)",
    osmTags: {
      amenity: "drinking_water",
      fountain: "bubbler",
      dog: "no",
      bottle: "no",
      check_date: CHECK_DATE,
    },
  },
  {
    name: "Bottle-filler only",
    osmTags: {
      amenity: "drinking_water",
      fountain: "bottle_refill",
      dog: "no",
      check_date: CHECK_DATE,
    },
  },
  {
    name: "Bubbler + bottle filler",
    osmTags: {
      amenity: "drinking_water",
      fountain: "bubbler",
      dog: "no",
      bottle: "yes",
      check_date: CHECK_DATE,
    },
  },

  // Working · humans + dogs (a human fountain with a dog bowl)
  {
    name: "Humans + dogs, bubbler",
    osmTags: {
      amenity: "drinking_water",
      fountain: "bubbler",
      dog: "yes",
      bottle: "no",
      check_date: CHECK_DATE,
    },
  },

  // Working · dogs only → amenity=watering_place
  {
    name: "Dogs only, bubbler (retagged as animal drinking place)",
    osmTags: {
      amenity: "watering_place",
      drinking_water: "no",
      fountain: "bubbler",
      dog: "yes",
      bottle: "no",
      check_date: CHECK_DATE,
    },
  },
  {
    name: "Dogs only, bottle filler",
    osmTags: {
      amenity: "watering_place",
      drinking_water: "no",
      fountain: "bottle_refill",
      dog: "yes",
      check_date: CHECK_DATE,
    },
  },

  // Working · modifiers (seasonal, note)
  {
    name: "Seasonal bubbler (runs only part of the year)",
    osmTags: {
      amenity: "drinking_water",
      fountain: "bubbler",
      dog: "no",
      bottle: "no",
      seasonal: "yes",
      check_date: CHECK_DATE,
    },
  },
  {
    name: "Bubbler with a public note",
    osmTags: {
      amenity: "drinking_water",
      fountain: "bubbler",
      dog: "no",
      bottle: "no",
      note: "Behind the visitor centre, low pressure in summer",
      check_date: CHECK_DATE,
    },
  },
  {
    name: "Everything at once — humans + dogs, both dispensers, seasonal, note",
    osmTags: {
      amenity: "drinking_water",
      fountain: "bubbler",
      dog: "yes",
      bottle: "yes",
      seasonal: "yes",
      note: "Park fountain with dog bowl and bottle tap",
      check_date: CHECK_DATE,
    },
  },

  // Out of order · primary moves behind disused:. Audience / dispenser / seasonal
  // are NOT written for non-working states, so they can't contradict a source
  // that no longer serves water. A note still can.
  {
    name: "Out of order (was a drinking fountain)",
    osmTags: {
      "disused:amenity": "drinking_water",
      note: "Tap missing, reported to city",
      check_date: CHECK_DATE,
    },
  },

  // Removed · primary moves behind abandoned:
  {
    name: "Removed (fountain gone from the ground)",
    osmTags: {
      "abandoned:amenity": "drinking_water",
      check_date: CHECK_DATE,
    },
  },
];

// ─── The survey/toggle input that produced each of the above (same order) ─────
export const exampleUserInput: { name: string; facts: FountainFacts }[] = [
  {
    name: "Bubbler (the default)",
    facts: {
      status: "working",
      humans: true,
      dogs: false,
      bubbler: true,
      bottleFiller: false,
      seasonal: false,
    },
  },
  {
    name: "Bottle-filler only",
    facts: {
      status: "working",
      humans: true,
      dogs: false,
      bubbler: false,
      bottleFiller: true,
      seasonal: false,
    },
  },
  {
    name: "Bubbler + bottle filler",
    facts: {
      status: "working",
      humans: true,
      dogs: false,
      bubbler: true,
      bottleFiller: true,
      seasonal: false,
    },
  },
  {
    name: "Humans + dogs, bubbler",
    facts: {
      status: "working",
      humans: true,
      dogs: true,
      bubbler: true,
      bottleFiller: false,
      seasonal: false,
    },
  },
  {
    name: "Dogs only, bubbler (retagged as animal drinking place)",
    facts: {
      status: "working",
      humans: false,
      dogs: true,
      bubbler: true,
      bottleFiller: false,
      seasonal: false,
    },
  },
  {
    name: "Dogs only, bottle filler",
    facts: {
      status: "working",
      humans: false,
      dogs: true,
      bubbler: false,
      bottleFiller: true,
      seasonal: false,
    },
  },
  {
    name: "Seasonal bubbler (runs only part of the year)",
    facts: {
      status: "working",
      humans: true,
      dogs: false,
      bubbler: true,
      bottleFiller: false,
      seasonal: true,
    },
  },
  {
    name: "Bubbler with a public note",
    facts: {
      status: "working",
      humans: true,
      dogs: false,
      bubbler: true,
      bottleFiller: false,
      seasonal: false,
      note: "Behind the visitor centre, low pressure in summer",
    },
  },
  {
    name: "Everything at once — humans + dogs, both dispensers, seasonal, note",
    facts: {
      status: "working",
      humans: true,
      dogs: true,
      bubbler: true,
      bottleFiller: true,
      seasonal: true,
      note: "Park fountain with dog bowl and bottle tap",
    },
  },
  {
    name: "Out of order (was a drinking fountain)",
    facts: {
      status: "out_of_order",
      humans: true,
      dogs: false,
      bubbler: true,
      bottleFiller: false,
      seasonal: false,
      note: "Tap missing, reported to city",
    },
  },
  {
    name: "Removed (fountain gone from the ground)",
    facts: {
      status: "removed",
      humans: true,
      dogs: false,
      bubbler: true,
      bottleFiller: false,
      seasonal: false,
    },
  },
];

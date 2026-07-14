// HUMAN ONLY FILE. AI should never edit.
//
// OSM point types selectable in the planner.
//
// Ordering is intentional: the entries most likely to be mapped on a running
// route past public infrastructure sit at the top, so the picker surfaces them
// first before the user types anything. Everything below is a broad sweep of
// common OSM node tags so the dropdown stays useful for ad-hoc verification.

export type PointType = {
  /** OSM tag key, e.g. "amenity". */
  key: string;
  /** OSM tag value, e.g. "drinking_water". */
  value: string;
  /** Human label shown in the picker. */
  label: string;
  /** Coarse grouping for visual sectioning. */
  group: string;
};

export const POINT_TYPES: PointType[] = [
  // --- Most likely on a run (water + rest stops) --------------------------
  { key: "amenity", value: "drinking_water", label: "Drinking water", group: "Water & rest" },
  { key: "amenity", value: "fountain", label: "Fountain", group: "Water & rest" },
  { key: "amenity", value: "water_point", label: "Water point", group: "Water & rest" },
  { key: "natural", value: "spring", label: "Spring", group: "Water & rest" },
  { key: "man_made", value: "water_tap", label: "Water tap", group: "Water & rest" },
  { key: "amenity", value: "toilets", label: "Toilets", group: "Water & rest" },
  { key: "amenity", value: "bench", label: "Bench", group: "Water & rest" },
  { key: "amenity", value: "shelter", label: "Shelter", group: "Water & rest" },
  { key: "amenity", value: "waste_basket", label: "Waste basket", group: "Water & rest" },
  { key: "amenity", value: "shower", label: "Shower", group: "Water & rest" },

  // --- Wayfinding & trail furniture --------------------------------------
  { key: "tourism", value: "viewpoint", label: "Viewpoint", group: "Wayfinding" },
  { key: "tourism", value: "information", label: "Information board", group: "Wayfinding" },
  { key: "information", value: "guidepost", label: "Guidepost", group: "Wayfinding" },
  { key: "information", value: "map", label: "Map board", group: "Wayfinding" },
  { key: "historic", value: "monument", label: "Monument", group: "Wayfinding" },
  { key: "historic", value: "memorial", label: "Memorial", group: "Wayfinding" },
  { key: "man_made", value: "survey_point", label: "Survey point", group: "Wayfinding" },
  { key: "natural", value: "peak", label: "Peak", group: "Wayfinding" },

  // --- Recreation & leisure ----------------------------------------------
  { key: "leisure", value: "park", label: "Park", group: "Recreation" },
  { key: "leisure", value: "playground", label: "Playground", group: "Recreation" },
  { key: "leisure", value: "fitness_station", label: "Fitness station", group: "Recreation" },
  { key: "leisure", value: "pitch", label: "Sports pitch", group: "Recreation" },
  { key: "leisure", value: "sports_centre", label: "Sports centre", group: "Recreation" },
  { key: "leisure", value: "swimming_pool", label: "Swimming pool", group: "Recreation" },
  { key: "leisure", value: "dog_park", label: "Dog park", group: "Recreation" },
  { key: "leisure", value: "picnic_table", label: "Picnic table", group: "Recreation" },
  { key: "tourism", value: "picnic_site", label: "Picnic site", group: "Recreation" },
  { key: "tourism", value: "camp_site", label: "Camp site", group: "Recreation" },

  // --- Food & drink -------------------------------------------------------
  { key: "amenity", value: "cafe", label: "Cafe", group: "Food & drink" },
  { key: "amenity", value: "restaurant", label: "Restaurant", group: "Food & drink" },
  { key: "amenity", value: "fast_food", label: "Fast food", group: "Food & drink" },
  { key: "amenity", value: "bar", label: "Bar", group: "Food & drink" },
  { key: "amenity", value: "pub", label: "Pub", group: "Food & drink" },
  { key: "amenity", value: "ice_cream", label: "Ice cream", group: "Food & drink" },
  { key: "amenity", value: "vending_machine", label: "Vending machine", group: "Food & drink" },
  { key: "shop", value: "convenience", label: "Convenience store", group: "Food & drink" },
  { key: "shop", value: "supermarket", label: "Supermarket", group: "Food & drink" },
  { key: "shop", value: "bakery", label: "Bakery", group: "Food & drink" },

  // --- Transport ----------------------------------------------------------
  { key: "highway", value: "bus_stop", label: "Bus stop", group: "Transport" },
  { key: "railway", value: "station", label: "Train station", group: "Transport" },
  { key: "railway", value: "tram_stop", label: "Tram stop", group: "Transport" },
  { key: "amenity", value: "bicycle_parking", label: "Bicycle parking", group: "Transport" },
  { key: "amenity", value: "bicycle_rental", label: "Bicycle rental", group: "Transport" },
  { key: "amenity", value: "parking", label: "Parking", group: "Transport" },
  { key: "amenity", value: "charging_station", label: "Charging station", group: "Transport" },
  { key: "amenity", value: "fuel", label: "Fuel station", group: "Transport" },
  { key: "amenity", value: "taxi", label: "Taxi stand", group: "Transport" },

  // --- Services & civic ---------------------------------------------------
  { key: "amenity", value: "pharmacy", label: "Pharmacy", group: "Services" },
  { key: "amenity", value: "hospital", label: "Hospital", group: "Services" },
  { key: "amenity", value: "clinic", label: "Clinic", group: "Services" },
  { key: "amenity", value: "atm", label: "ATM", group: "Services" },
  { key: "amenity", value: "bank", label: "Bank", group: "Services" },
  { key: "amenity", value: "post_box", label: "Post box", group: "Services" },
  { key: "amenity", value: "post_office", label: "Post office", group: "Services" },
  { key: "amenity", value: "police", label: "Police", group: "Services" },
  { key: "amenity", value: "fire_station", label: "Fire station", group: "Services" },
  { key: "amenity", value: "library", label: "Library", group: "Services" },
  { key: "amenity", value: "townhall", label: "Town hall", group: "Services" },
  { key: "amenity", value: "place_of_worship", label: "Place of worship", group: "Services" },
  { key: "amenity", value: "school", label: "School", group: "Services" },
  { key: "amenity", value: "university", label: "University", group: "Services" },

  // --- Street furniture & infrastructure ---------------------------------
  { key: "highway", value: "street_lamp", label: "Street lamp", group: "Street furniture" },
  { key: "amenity", value: "telephone", label: "Telephone", group: "Street furniture" },
  { key: "amenity", value: "clock", label: "Clock", group: "Street furniture" },
  { key: "emergency", value: "fire_hydrant", label: "Fire hydrant", group: "Street furniture" },
  {
    key: "emergency",
    value: "defibrillator",
    label: "Defibrillator (AED)",
    group: "Street furniture",
  },
  {
    key: "man_made",
    value: "surveillance",
    label: "Surveillance camera",
    group: "Street furniture",
  },
  { key: "man_made", value: "tower", label: "Tower", group: "Street furniture" },
  { key: "man_made", value: "water_well", label: "Water well", group: "Street furniture" },
  { key: "natural", value: "tree", label: "Tree", group: "Street furniture" },

  // --- Tourism & culture --------------------------------------------------
  { key: "tourism", value: "hotel", label: "Hotel", group: "Tourism" },
  { key: "tourism", value: "hostel", label: "Hostel", group: "Tourism" },
  { key: "tourism", value: "museum", label: "Museum", group: "Tourism" },
  { key: "tourism", value: "artwork", label: "Artwork", group: "Tourism" },
  { key: "tourism", value: "attraction", label: "Attraction", group: "Tourism" },
  { key: "historic", value: "castle", label: "Castle", group: "Tourism" },
  { key: "historic", value: "ruins", label: "Ruins", group: "Tourism" },
  { key: "historic", value: "archaeological_site", label: "Archaeological site", group: "Tourism" },
];

/** Stable key used to identify a point type in the picker. */
export const ptKey = (pt: { key: string; value: string }) => `${pt.key}=${pt.value}`;

/** Human label for a tag pair, falling back to the de-underscored value. */
export const ptLabel = (key: string, value: string): string =>
  POINT_TYPES.find((p) => p.key === key && p.value === value)?.label ?? value.replace(/_/g, " ");

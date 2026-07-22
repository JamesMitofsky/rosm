import { describe, expect, it } from "vitest";
import { factsFromTags } from "../src/fountainModel";
import { audienceFromTags } from "../src/audience";
import { dispenserFromTags } from "../src/dispenser";

describe("fountainModel", () => {
  describe("factsFromTags", () => {
    it("decodes standard drinking water fountain", () => {
      const facts = factsFromTags({ amenity: "drinking_water" });
      expect(facts.status).toBe("working");
      expect(facts.humans).toBe(true);
      expect(facts.dogs).toBe(false);
      expect(facts.bubbler).toBe(true);
      expect(facts.bottleFiller).toBe(false);
    });

    it("decodes dogs-only watering place", () => {
      const facts = factsFromTags({ amenity: "watering_place" });
      expect(facts.humans).toBe(false);
      expect(facts.dogs).toBe(true);
    });

    it("decodes disused fountain as out_of_order", () => {
      const facts = factsFromTags({ "disused:amenity": "drinking_water" });
      expect(facts.status).toBe("out_of_order");
    });

    it("decodes abandoned fountain as removed", () => {
      const facts = factsFromTags({ "abandoned:amenity": "drinking_water" });
      expect(facts.status).toBe("removed");
    });
  });

  describe("audienceFromTags", () => {
    it("returns dogs for watering_place", () => {
      expect(audienceFromTags({ amenity: "watering_place" })).toBe("dogs");
    });

    it("returns dogs for drinking_water=no", () => {
      expect(audienceFromTags({ amenity: "fountain", drinking_water: "no" })).toBe("dogs");
    });

    it("returns both for dog=yes", () => {
      expect(audienceFromTags({ amenity: "drinking_water", dog: "yes" })).toBe("both");
    });

    it("returns humans by default", () => {
      expect(audienceFromTags({ amenity: "drinking_water" })).toBe("humans");
    });
  });

  describe("dispenserFromTags", () => {
    it("returns bottle for fountain=bottle_refill", () => {
      expect(dispenserFromTags({ fountain: "bottle_refill" })).toBe("bottle");
    });

    it("returns both for fountain=bubbler + bottle=yes", () => {
      expect(dispenserFromTags({ fountain: "bubbler", bottle: "yes" })).toBe("both");
    });

    it("returns bubbler for fountain=bubbler", () => {
      expect(dispenserFromTags({ fountain: "bubbler" })).toBe("bubbler");
    });
  });
});

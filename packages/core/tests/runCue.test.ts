import { describe, expect, it } from "vitest";
import { runCue } from "../src/runCue";

const turn = { lat: 0, lon: 0, distM: 500, angle: -90 };

describe("runCue", () => {
  it("is null until there is a fix", () => {
    expect(runCue({ distToTargetM: null, bearingTo: 0, nextTurn: null, distToTurnM: null })).toBe(
      null,
    );
  });

  it("gives the distance and compass direction to the stop", () => {
    expect(
      runCue({ distToTargetM: 120, bearingTo: 44, nextTurn: null, distToTurnM: null }),
    ).toEqual({ distance: "394 ft", direction: "NE", turn: null });
  });

  it("names the next turn when it comes before the stop", () => {
    const cue = runCue({
      distToTargetM: 600,
      bearingTo: 0,
      nextTurn: { ...turn, name: "Oak St" },
      distToTurnM: 60,
      stopAlongM: 900,
    });
    expect(cue?.turn).toBe("Turn left in 197 ft onto Oak St");
  });

  it("leaves out a turn that lies past the stop", () => {
    const cue = runCue({
      distToTargetM: 100,
      bearingTo: 0,
      nextTurn: turn,
      distToTurnM: 300,
      stopAlongM: 400,
    });
    expect(cue?.turn).toBe(null);
  });

  it("counts every turn ahead when the stop's place on the route is unknown", () => {
    const cue = runCue({ distToTargetM: 100, bearingTo: 0, nextTurn: turn, distToTurnM: 300 });
    expect(cue?.turn).toBe("Turn left in 984 ft");
  });
});

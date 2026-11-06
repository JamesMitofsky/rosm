import { describe, expect, it } from "vitest";
import { celebratesEdit } from "../src/celebrate";
import { EditAction } from "../src/schemas";

describe("celebratesEdit", () => {
  it("celebrates only a fountain confirmed working", () => {
    const celebrated = EditAction.options.filter(celebratesEdit);
    expect(celebrated).toEqual(["confirm"]);
  });
});

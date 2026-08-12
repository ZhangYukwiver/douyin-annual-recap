import { describe, expect, it } from "vitest";

import { PERSONAL_RECORD_TYPES } from "./personalRecords";

describe("PERSONAL_RECORD_TYPES", () => {
  it("keeps the user-confirmed acquisition priority", () => {
    expect(PERSONAL_RECORD_TYPES.map((record) => record.id)).toEqual([
      "watch_history",
      "liked_videos",
      "favorite_videos",
    ]);
  });
});

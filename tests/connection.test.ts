import { describe, expect, it } from "vitest";
import {
  elapsedSeconds,
  localWorkDate,
  monthRange,
} from "../src/lib/domain/attendance";
describe("Attendance dates", () => {
  it("assigns a Pakistan shift to its local day, not UTC", () =>
    expect(
      localWorkDate(new Date("2026-09-12T20:30:00Z"), "Asia/Karachi"),
    ).toBe("2026-09-13"));
  it("measures elapsed time correctly across DST", () =>
    expect(
      elapsedSeconds("2026-11-01T01:30:00-04:00", "2026-11-01T01:30:00-05:00"),
    ).toBe(3600));
  it("handles leap February and rejects malformed months", () => {
    expect(monthRange("2028-02").days).toBe(29);
    expect(() => monthRange("2026-13")).toThrow();
  });
});

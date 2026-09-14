import { describe, expect, it } from "vitest";
import { postgresConfig } from "../src/lib/db/connection";
import {
  elapsedSeconds,
  localWorkDate,
  monthRange,
} from "../src/lib/domain/attendance";
describe("Database TLS configuration", () => {
  it("preserves provider SSL settings when no custom CA is supplied", () => {
    const url = "postgresql://u:p@db.example/test?sslmode=verify-full";
    expect(postgresConfig(url).connectionString).toBe(url);
    expect(postgresConfig(url).ssl).toBeUndefined();
  });
  it("uses the provider CA with verification enabled and removes conflicting URL SSL options", () => {
    const config = postgresConfig(
      "postgresql://u:p@db.example/test?sslmode=require&sslrootcert=old&application_name=ray",
      "BEGIN\\nCERT",
    );
    expect(config.ssl).toEqual({ ca: "BEGIN\nCERT", rejectUnauthorized: true });
    expect(config.connectionString).not.toContain("sslmode");
    expect(config.connectionString).not.toContain("sslrootcert");
    expect(config.connectionString).toContain("application_name=ray");
  });
  it("rejects a non-Postgres URL", () =>
    expect(() => postgresConfig("https://example.com")).toThrow());
});
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

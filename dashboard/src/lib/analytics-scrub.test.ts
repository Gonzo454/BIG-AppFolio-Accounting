import { describe, it, expect } from "vitest";
import { scrubPath, getScreenName } from "./analytics-scrub";

describe("analytics-scrub", () => {
  describe("scrubPath", () => {
    it("replaces numeric dynamic segments", () => {
      expect(scrubPath("/properties/123")).toBe("/properties/[id]");
    });

    it("replaces slug-style dynamic segments", () => {
      expect(scrubPath("/properties/1609-landmark-drive")).toBe(
        "/properties/[id]"
      );
    });

    it("replaces uuid dynamic segments", () => {
      expect(scrubPath("/property/550e8400-e29b-41d4-a716-446655440000")).toBe(
        "/property/[id]"
      );
    });

    it("maps known static routes exactly", () => {
      expect(scrubPath("/properties")).toBe("/properties");
      expect(scrubPath("/kpi-dashboard")).toBe("/kpi-dashboard");
    });

    it("falls back to /[unmapped] for unknown routes", () => {
      expect(scrubPath("/sneaky/secret-path")).toBe("/[unmapped]");
    });

    it("normalizes empty path to /", () => {
      expect(scrubPath("")).toBe("/");
    });
  });

  describe("getScreenName", () => {
    it("returns the screen name for a known dynamic route", () => {
      expect(getScreenName("/properties/1609-landmark-drive")).toBe(
        "Property Detail"
      );
    });

    it("returns the screen name for a static route", () => {
      expect(getScreenName("/kpi-dashboard")).toBe("KPI Dashboard");
    });

    it("returns [unmapped] for unknown routes", () => {
      expect(getScreenName("/sneaky/secret-path")).toBe("[unmapped]");
    });

    it("returns [unmapped] for empty path", () => {
      expect(getScreenName("")).toBe("[unmapped]");
    });
  });
});

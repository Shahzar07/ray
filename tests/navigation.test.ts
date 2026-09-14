/**
 * Guards against shipping navigation that points at nothing.
 *
 * Every dead link costs twice: the click 404s, and Next prefetches that 404 on
 * every page load. These tests read the real route tree off disk, so a link
 * added before its route fails here rather than in production.
 */
import { readdirSync, existsSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { NAV, MOBILE_NAV, allNavItems, navForRole } from "../src/components/shell/nav-config";
import type { Role } from "../src/lib/db/schema";

const APP = path.resolve(process.cwd(), "src/app");

/** Every route the app actually serves, as URL paths. */
function routes(dir = APP, prefix = ""): string[] {
  const found: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const name = entry.name;
    if (name.startsWith("_") || name === "api") continue;
    // (group) folders do not appear in the URL; [param] segments are dynamic.
    const segment = name.startsWith("(") && name.endsWith(")") ? "" : `/${name}`;
    const child = path.join(dir, name);
    const url = `${prefix}${segment}`;
    if (existsSync(path.join(child, "page.tsx"))) found.push(url || "/");
    found.push(...routes(child, url));
  }
  return found;
}

const SERVED = routes();
const ROLES: Role[] = ["owner", "team_lead", "agent"];

describe("Navigation points at routes that exist", () => {
  it("finds the routes this release ships", () => {
    for (const route of ["/today", "/call", "/leads", "/team", "/timesheet", "/leaderboard"]) {
      expect(SERVED, `${route} should be served`).toContain(route);
    }
  });

  it("links only to served routes, and marks the rest as not built yet", () => {
    for (const item of NAV.flatMap((g) => g.items)) {
      if (item.soon) expect(SERVED, `${item.href} is flagged soon`).not.toContain(item.href);
      else expect(SERVED, `${item.href} is linked from the sidebar`).toContain(item.href);
    }
  });

  it("never offers an unbuilt screen to ⌘K or a keyboard shortcut", () => {
    for (const role of ROLES) {
      for (const item of allNavItems(role)) {
        expect(item.soon, `${item.href} is reachable by ${role}`).toBeUndefined();
        expect(SERVED).toContain(item.href);
      }
      // A shortcut that navigates nowhere is worse than no shortcut.
      for (const item of navForRole(role).flatMap((g) => g.items)) {
        if (item.soon) expect(item.shortcut, `${item.href} must not bind a key`).toBeUndefined();
      }
    }
  });

  it("keeps the five mobile tabs live and unique", () => {
    expect(MOBILE_NAV).toHaveLength(5);
    expect(new Set(MOBILE_NAV.map((i) => i.href)).size).toBe(5);
    for (const item of MOBILE_NAV) {
      expect(item.soon, `${item.href} is a mobile tab`).toBeUndefined();
      expect(SERVED).toContain(item.href);
    }
    // Call Mode sits in the centre, under the thumb.
    expect(MOBILE_NAV[2]!.href).toBe("/call");
  });

  it("serves a not-found page so unknown URLs degrade gracefully", () => {
    expect(existsSync(path.join(APP, "not-found.tsx"))).toBe(true);
  });
});

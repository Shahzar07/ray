/**
 * Guards against shipping navigation that points at nothing.
 *
 * A dead link costs twice: the click 404s, and Next prefetches that 404 on
 * every page load. These tests read the real route tree off disk, so a link
 * added before its route fails here rather than in production.
 */
import { readdirSync, existsSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { NAV, allNavItems, mobileNavForRole, navForRole } from "../src/components/shell/nav-config";
import { roleEnum, type Role } from "../src/lib/db/schema";

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

describe("Navigation points at routes that exist", () => {
  it("serves every screen this product ships", () => {
    for (const route of [
      "/today", "/call", "/leads", "/board", "/trials", "/analytics",
      "/attendance", "/team", "/timesheet", "/leaderboard", "/import", "/settings",
    ]) {
      expect(SERVED, `${route} should be served`).toContain(route);
    }
  });

  it("links only to served routes from the sidebar", () => {
    for (const item of NAV.flatMap((g) => g.items)) {
      expect(SERVED, `${item.href} is linked from the sidebar`).toContain(item.href);
    }
  });

  it("offers every role only destinations that resolve", () => {
    for (const role of roleEnum.enumValues as readonly Role[]) {
      for (const item of navForRole(role).flatMap((g) => g.items)) {
        expect(SERVED, `${item.href} shown to ${role}`).toContain(item.href);
      }
      for (const item of allNavItems(role)) {
        expect(SERVED, `${item.href} reachable by ${role} via ⌘K`).toContain(item.href);
      }
      for (const item of mobileNavForRole(role)) {
        expect(SERVED, `${item.href} is a mobile tab for ${role}`).toContain(item.href);
      }
    }
  });

  it("serves a not-found page so unknown URLs degrade gracefully", () => {
    expect(existsSync(path.join(APP, "not-found.tsx"))).toBe(true);
  });
});

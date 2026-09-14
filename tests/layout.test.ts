/**
 * Two regressions in this release were pure layout/CSS, invisible to the type
 * checker and to the build. These lock in the fixes.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const read = (p: string) => readFileSync(path.resolve(process.cwd(), p), "utf8");

describe("Hero headings stay legible on the hero's own dark ground", () => {
  const css = read("src/app/globals.css");

  it("sets heading colour with a selector, not inheritance", () => {
    // The base layer styles h1..h4, and a matching selector always beats an
    // inherited value — so `.crm-hero { color }` alone left headings near-black
    // on near-black in the light theme.
    expect(css).toMatch(/h1,\s*h2,\s*h3,\s*h4\s*\{[^}]*color:\s*var\(--text-strong\)/);
    expect(css).toMatch(/\.crm-hero\s+:is\(h1,\s*h2,\s*h3,\s*h4\)\s*\{[^}]*color:/);
  });

  it("declares the reduced-motion override exactly once", () => {
    expect(css.match(/@media\s*\(prefers-reduced-motion:\s*reduce\)/g)).toHaveLength(1);
  });
});

describe("Call Mode owns exactly one viewport", () => {
  const shell = read("src/components/shell/app-shell.tsx");
  const callMode = read("src/app/(app)/call/call-mode.tsx");

  it("caps the immersive shell at the viewport height", () => {
    const immersive = shell.slice(shell.indexOf("if (immersive)"), shell.indexOf("if (immersive)") + 600);
    expect(immersive).toContain("h-dvh");
    // The clock bar must not be able to grow and push the call UI down.
    expect(immersive).toContain("shrink-0");
    expect(immersive).toContain("min-h-0");
  });

  it("does not stack a second full viewport under the check-in bar", () => {
    // min-h-dvh here plus the bar above it pushed the call outcome buttons
    // off-screen — 167px past the fold on a 390px-wide phone.
    expect(callMode).not.toContain("min-h-dvh");
    expect(callMode).toContain("min-h-full");
  });

  it("keeps the Call Mode check-in row on a single line", () => {
    expect(shell).toContain("<ClockControl compact />");
    const clock = read("src/components/attendance/clock-control.tsx");
    expect(clock).toMatch(/compact\s*\?\s*"min-w-0"\s*:\s*"flex-wrap"/);
  });
});

describe("The Raynaters rebrand is complete", () => {
  const files = [
    "src/app/layout.tsx",
    "src/components/shell/sidebar.tsx",
    "src/components/shell/app-shell.tsx",
    "src/components/shell/command-palette.tsx",
    "src/app/(auth)/layout.tsx",
    "src/components/leads/shortcut-help.tsx",
    "src/lib/actions/auth.ts",
  ];

  it("leaves no CallDesk branding in any user-facing string", () => {
    for (const file of files) {
      expect(read(file), `${file} still says CallDesk`).not.toContain("CallDesk");
    }
  });
});

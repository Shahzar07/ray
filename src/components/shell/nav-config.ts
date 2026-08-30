import type { LucideIcon } from "lucide-react";
import {
  BarChart3,
  CalendarClock,
  KanbanSquare,
  LayoutGrid,
  PhoneCall,
  Settings,
  Sun,
  Upload,
  Users,
} from "lucide-react";
import type { Role } from "@/lib/db/schema";
import { can, type Capability } from "@/lib/domain/roles";

export type NavItem = {
  href: string;
  label: string;
  icon: LucideIcon;
  /** Capability required to see the link. Omit for everyone. */
  capability?: Capability;
  shortcut?: string;
  description: string;
};

export type NavGroup = { label: string; items: NavItem[] };

export const NAV: NavGroup[] = [
  {
    label: "Calling",
    items: [
      { href: "/today", label: "Today", icon: Sun, shortcut: "g t", description: "Your day at a glance" },
      {
        href: "/call",
        label: "Call Mode",
        icon: PhoneCall,
        capability: "calls.log",
        shortcut: "g c",
        description: "One lead at a time, full screen",
      },
      { href: "/leads", label: "Leads", icon: LayoutGrid, shortcut: "g l", description: "The full lead table" },
      { href: "/board", label: "Board", icon: KanbanSquare, shortcut: "g b", description: "Pipeline kanban" },
    ],
  },
  {
    label: "Pipeline",
    items: [
      { href: "/trials", label: "Demo Weeks", icon: CalendarClock, shortcut: "g d", description: "7-day trials in flight" },
      {
        href: "/analytics",
        label: "Analytics",
        icon: BarChart3,
        capability: "analytics.view",
        shortcut: "g a",
        description: "Funnel, trends, leaderboard",
      },
      {
        href: "/team",
        label: "Team",
        icon: Users,
        capability: "team.performance",
        shortcut: "g m",
        description: "Per-member performance",
      },
    ],
  },
  {
    label: "Data",
    items: [
      {
        href: "/import",
        label: "Import",
        icon: Upload,
        capability: "leads.import",
        shortcut: "g i",
        description: "Bring a scraped sheet in",
      },
      { href: "/settings", label: "Settings", icon: Settings, shortcut: "g s", description: "Team, fields, DNC, profile" },
    ],
  },
];

export function navForRole(role: Role): NavGroup[] {
  return NAV.map((group) => ({
    ...group,
    items: group.items.filter((item) => !item.capability || can(role, item.capability)),
  })).filter((group) => group.items.length > 0);
}

export function allNavItems(role: Role): NavItem[] {
  return navForRole(role).flatMap((g) => g.items);
}

/**
 * Mobile bottom bar — five thumb-reachable destinations, Call Mode centred.
 *
 * Filtered per role like the sidebar: a researcher or viewer has no Call Mode,
 * and a bar with a dead centre button is worse than a four-item bar.
 */
const MOBILE_ORDER: NavItem[] = [
  NAV[0]!.items[0]!, // Today
  NAV[0]!.items[2]!, // Leads
  NAV[0]!.items[1]!, // Call Mode
  NAV[1]!.items[0]!, // Demo Weeks
  NAV[1]!.items[1]!, // Analytics
];

export function mobileNavForRole(role: Role): NavItem[] {
  return MOBILE_ORDER.filter((item) => !item.capability || can(role, item.capability));
}

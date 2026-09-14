import type { LucideIcon } from "lucide-react";
import {
  BarChart3,
  Clock3,
  Trophy,
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

export type NavItem = {
  href: string;
  label: string;
  icon: LucideIcon;
  /** Roles allowed to see the link. Omit for everyone. */
  roles?: Role[];
  shortcut?: string;
  description: string;
  /**
   * The screen is on the roadmap but has no route yet. Shown in the sidebar so
   * the plan stays visible, never linked — a link here would 404 and Next would
   * prefetch that 404 on every page load.
   */
  soon?: true;
};

export type NavGroup = { label: string; items: NavItem[] };

export const NAV: NavGroup[] = [
  {
    label: "Sales workspace",
    items: [
      { href: "/today", label: "Today", icon: Sun, shortcut: "g t", description: "Your day at a glance" },
      { href: "/call", label: "Call Mode", icon: PhoneCall, shortcut: "g c", description: "One lead at a time, full screen" },
      { href: "/leads", label: "Leads", icon: LayoutGrid, shortcut: "g l", description: "The full lead table" },
      { href: "/board", label: "Board", icon: KanbanSquare, description: "Pipeline kanban", soon: true },
    ],
  },
  {
    label: "Workspace",
    items: [
      { href: "/timesheet", label: "My timesheet", icon: Clock3, shortcut: "g h", description: "Your daily check-in record" },
      { href: "/leaderboard", label: "Leaderboard", icon: Trophy, shortcut: "g r", description: "Team sales results" },
      { href: "/trials", label: "Demo Weeks", icon: CalendarClock, description: "7-day trials in flight", soon: true },
      {
        href: "/analytics",
        roles: ["owner", "team_lead"],
        label: "Analytics",
        icon: BarChart3,
        description: "Funnel, trends, leaderboard",
        soon: true,
      },
      {
        href: "/team",
        label: "Team",
        icon: Users,
        roles: ["owner", "team_lead"],
        shortcut: "g m",
        description: "Attendance and per-member performance",
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
        roles: ["owner", "team_lead"],
        description: "Bring a scraped sheet in",
        soon: true,
      },
      { href: "/settings", label: "Settings", icon: Settings, description: "Team, fields, DNC, profile", soon: true },
    ],
  },
];

/** Everything the sidebar shows, including the roadmap entries. */
export function navForRole(role: Role): NavGroup[] {
  return NAV.map((group) => ({
    ...group,
    items: group.items.filter((item) => !item.roles || item.roles.includes(role)),
  })).filter((group) => group.items.length > 0);
}

/** Only the destinations that actually resolve — ⌘K and the g-shortcuts. */
export function allNavItems(role: Role): NavItem[] {
  return navForRole(role)
    .flatMap((g) => g.items)
    .filter((item) => !item.soon);
}

/** Mobile bottom bar — five thumb-reachable destinations, Call Mode centred. */
const byHref = (href: string): NavItem => {
  const item = NAV.flatMap((g) => g.items).find((i) => i.href === href);
  if (!item) throw new Error(`MOBILE_NAV references an unknown route: ${href}`);
  return item;
};

export const MOBILE_NAV: NavItem[] = [
  byHref("/today"),
  byHref("/leads"),
  byHref("/call"),
  byHref("/timesheet"),
  byHref("/leaderboard"),
];

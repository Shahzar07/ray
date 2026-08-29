"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronsUpDown, LogOut, PhoneCall, Search, UserRound } from "lucide-react";
import { cn } from "@/lib/utils";
import { Avatar } from "@/components/ui/controls";
import { RoleBadge } from "@/components/ui/display";
import { Kbd } from "@/components/ui/display";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/overlays";
import { ThemeToggle } from "./theme-toggle";
import { navForRole } from "./nav-config";
import type { SessionContext } from "@/lib/auth/session";

export function Sidebar({
  ctx,
  onOpenCommand,
  signOutAction,
}: {
  ctx: SessionContext;
  onOpenCommand: () => void;
  signOutAction: () => Promise<void>;
}) {
  const pathname = usePathname();
  const groups = React.useMemo(() => navForRole(ctx.role), [ctx.role]);

  return (
    <aside className="fixed inset-y-0 left-0 z-30 hidden w-[248px] flex-col border-r border-line bg-sunken lg:flex">
      {/* Brand */}
      <div className="flex h-14 items-center gap-2.5 px-4">
        <span className="grid size-8 place-items-center rounded-[10px] bg-accent text-accent-fg shadow-xs edge-light">
          <PhoneCall className="size-[17px]" strokeWidth={2.4} />
        </span>
        <div className="min-w-0 leading-tight">
          <div className="truncate text-[14px] font-semibold tracking-tight text-strong">CallDesk</div>
          <div className="truncate text-[11px] text-subtle">{ctx.org.name}</div>
        </div>
      </div>

      {/* Command palette trigger */}
      <div className="px-3 pb-3">
        <button
          type="button"
          onClick={onOpenCommand}
          className="group flex h-8 w-full items-center gap-2 rounded-lg border border-line bg-surface px-2.5 text-[12.5px] text-subtle shadow-xs transition-colors hover:border-line-strong hover:text-muted"
        >
          <Search className="size-3.5" />
          <span className="flex-1 text-left">Search or jump to…</span>
          <Kbd className="group-hover:border-line-strong">⌘K</Kbd>
        </button>
      </div>

      {/* Nav */}
      <nav className="no-scrollbar flex-1 space-y-5 overflow-y-auto px-3 pb-4">
        {groups.map((group) => (
          <div key={group.label}>
            <div className="px-2.5 pb-1.5 text-[10.5px] font-semibold uppercase tracking-[0.09em] text-subtle">
              {group.label}
            </div>
            <ul className="space-y-0.5">
              {group.items.map((item) => {
                const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      aria-current={active ? "page" : undefined}
                      className={cn(
                        "group relative flex h-8 items-center gap-2.5 rounded-lg px-2.5 text-[13px] font-medium transition-colors",
                        active
                          ? "bg-surface text-strong shadow-xs"
                          : "text-muted hover:bg-inset hover:text-strong",
                      )}
                    >
                      {active && (
                        <span className="absolute -left-3 top-1/2 h-4 w-[3px] -translate-y-1/2 rounded-r-full bg-accent" />
                      )}
                      <item.icon
                        className={cn("size-[15px] shrink-0 transition-colors", active ? "text-accent" : "text-subtle group-hover:text-body")}
                      />
                      {item.label}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>

      {/* User */}
      <div className="border-t border-line p-3">
        <div className="mb-2 flex justify-center">
          <ThemeToggle className="w-full justify-center" />
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger className="flex w-full items-center gap-2.5 rounded-lg p-1.5 text-left transition-colors hover:bg-inset data-[state=open]:bg-inset">
            <Avatar name={ctx.user.name} src={ctx.user.avatarUrl} size="md" />
            <div className="min-w-0 flex-1 leading-tight">
              <div className="truncate text-[12.5px] font-medium text-strong">{ctx.user.name}</div>
              <div className="truncate text-[11px] text-subtle">{ctx.team.name}</div>
            </div>
            <ChevronsUpDown className="size-3.5 shrink-0 text-subtle" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" side="top" className="w-[224px]">
            <DropdownMenuLabel className="flex items-center justify-between gap-2 normal-case tracking-normal">
              <span className="truncate text-[12px] font-normal text-muted">{ctx.user.email}</span>
            </DropdownMenuLabel>
            <div className="px-2.5 pb-1.5">
              <RoleBadge role={ctx.role} size="xs" />
            </div>
            <DropdownMenuSeparator />
            <DropdownMenuItem asChild>
              <Link href="/settings/profile">
                <UserRound />
                Profile & preferences
              </Link>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <form action={signOutAction} className="contents">
              <DropdownMenuItem destructive asChild>
                <button type="submit" className="w-full">
                  <LogOut />
                  Sign out
                </button>
              </DropdownMenuItem>
            </form>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </aside>
  );
}

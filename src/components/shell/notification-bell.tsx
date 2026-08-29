"use client";

import * as React from "react";
import Link from "next/link";
import { Bell, CheckCheck } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/overlays";
import { EmptyState } from "@/components/ui/display";
import { relative } from "@/lib/domain/dates";

export type NotificationItem = {
  id: string;
  type: string;
  title: string;
  body: string | null;
  link: string | null;
  isRead: boolean;
  createdAt: string;
};

export function NotificationBell({
  items,
  markAllRead,
}: {
  items: NotificationItem[];
  markAllRead?: () => Promise<void>;
}) {
  const unread = items.filter((i) => !i.isRead).length;

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon-sm" aria-label={`Notifications${unread ? `, ${unread} unread` : ""}`}>
          <span className="relative">
            <Bell />
            {unread > 0 && (
              <span className="absolute -right-1 -top-1 grid min-w-[15px] place-items-center rounded-full bg-danger px-1 text-[9px] font-bold leading-[15px] text-white ring-2 ring-[var(--canvas)]">
                {unread > 9 ? "9+" : unread}
              </span>
            )}
          </span>
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[340px] p-0">
        <div className="flex items-center justify-between border-b border-line px-3.5 py-2.5">
          <span className="text-[12.5px] font-semibold text-strong">Notifications</span>
          {markAllRead && unread > 0 && (
            <form action={markAllRead}>
              <button type="submit" className="flex items-center gap-1 text-[11.5px] text-muted hover:text-strong">
                <CheckCheck className="size-3.5" />
                Mark all read
              </button>
            </form>
          )}
        </div>
        <div className="max-h-[380px] overflow-y-auto">
          {items.length === 0 ? (
            <EmptyState
              compact
              className="m-2 border-0"
              icon={<Bell />}
              title="All clear"
              description="Overdue follow-ups and trial alerts land here."
            />
          ) : (
            items.map((n) => {
              const body = (
                <div
                  className={cn(
                    "flex gap-2.5 px-3.5 py-2.5 transition-colors",
                    n.link && "hover:bg-inset",
                    !n.isRead && "bg-accent-soft/40",
                  )}
                >
                  <span
                    className={cn("mt-1.5 size-1.5 shrink-0 rounded-full", n.isRead ? "bg-transparent" : "bg-accent")}
                    aria-hidden
                  />
                  <div className="min-w-0 flex-1">
                    <div className="text-[12.5px] font-medium leading-snug text-strong">{n.title}</div>
                    {n.body && <div className="mt-0.5 text-[12px] leading-snug text-muted">{n.body}</div>}
                    <div className="mt-1 text-[11px] text-subtle">{relative(n.createdAt)}</div>
                  </div>
                </div>
              );
              return n.link ? (
                <Link key={n.id} href={n.link} className="block border-b border-line last:border-0">
                  {body}
                </Link>
              ) : (
                <div key={n.id} className="border-b border-line last:border-0">
                  {body}
                </div>
              );
            })
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}

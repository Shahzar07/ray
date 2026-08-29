"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Menu, PhoneCall, Search, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Sidebar } from "./sidebar";
import { CommandPalette } from "./command-palette";
import { NotificationBell, type NotificationItem } from "./notification-bell";
import { MOBILE_NAV, navForRole } from "./nav-config";
import { ThemeToggle } from "./theme-toggle";
import { Avatar } from "@/components/ui/controls";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetClose } from "@/components/ui/overlays";
import type { SessionContext } from "@/lib/auth/session";

export function AppShell({
  ctx,
  notifications,
  signOutAction,
  children,
}: {
  ctx: SessionContext;
  notifications: NotificationItem[];
  signOutAction: () => Promise<void>;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [commandOpen, setCommandOpen] = React.useState(false);
  const [mobileNavOpen, setMobileNavOpen] = React.useState(false);

  /* ⌘K anywhere; `g` then a letter jumps like a keyboard-first tool should. */
  React.useEffect(() => {
    let awaitingGoto = false;
    let gotoTimer: ReturnType<typeof setTimeout> | undefined;

    function isTypingTarget(el: EventTarget | null) {
      const node = el as HTMLElement | null;
      if (!node) return false;
      return (
        node.tagName === "INPUT" ||
        node.tagName === "TEXTAREA" ||
        node.tagName === "SELECT" ||
        node.isContentEditable
      );
    }

    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setCommandOpen((v) => !v);
        return;
      }
      if (isTypingTarget(e.target) || e.metaKey || e.ctrlKey || e.altKey) return;

      if (awaitingGoto) {
        const match = navForRole(ctx.role)
          .flatMap((g) => g.items)
          .find((i) => i.shortcut?.endsWith(e.key.toLowerCase()));
        awaitingGoto = false;
        clearTimeout(gotoTimer);
        if (match) {
          e.preventDefault();
          router.push(match.href);
        }
        return;
      }
      if (e.key.toLowerCase() === "g") {
        awaitingGoto = true;
        gotoTimer = setTimeout(() => (awaitingGoto = false), 1200);
      }
    }

    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      clearTimeout(gotoTimer);
    };
  }, [ctx.role, router]);

  React.useEffect(() => setMobileNavOpen(false), [pathname]);

  /* Call Mode owns the whole viewport — no chrome competing for the thumb. */
  const immersive = pathname.startsWith("/call");

  if (immersive) {
    return (
      <>
        {children}
        <CommandPalette open={commandOpen} onOpenChange={setCommandOpen} role={ctx.role} />
      </>
    );
  }

  return (
    <div className="min-h-dvh">
      <Sidebar ctx={ctx} onOpenCommand={() => setCommandOpen(true)} signOutAction={signOutAction} />

      {/* Mobile top bar */}
      <header className="sticky top-0 z-20 flex h-14 items-center gap-2 border-b border-line bg-[color-mix(in_oklch,var(--canvas)_86%,transparent)] px-3 backdrop-blur-xl lg:hidden">
        <Button variant="ghost" size="icon-sm" onClick={() => setMobileNavOpen(true)} aria-label="Open menu">
          <Menu />
        </Button>
        <Link href="/today" className="flex items-center gap-2">
          <span className="grid size-7 place-items-center rounded-lg bg-accent text-accent-fg">
            <PhoneCall className="size-4" strokeWidth={2.4} />
          </span>
          <span className="text-[14px] font-semibold tracking-tight text-strong">CallDesk</span>
        </Link>
        <div className="ml-auto flex items-center gap-1">
          <Button variant="ghost" size="icon-sm" onClick={() => setCommandOpen(true)} aria-label="Search">
            <Search />
          </Button>
          <NotificationBell items={notifications} />
        </div>
      </header>

      <div className="lg:pl-[248px]">
        <main className="min-h-[calc(100dvh-3.5rem)] pb-20 lg:min-h-dvh lg:pb-0">{children}</main>
      </div>

      {/* Mobile bottom tab bar */}
      <nav
        aria-label="Primary"
        className="fixed inset-x-0 bottom-0 z-20 grid grid-cols-5 border-t border-line bg-[color-mix(in_oklch,var(--surface)_92%,transparent)] pb-[env(safe-area-inset-bottom)] backdrop-blur-xl lg:hidden"
      >
        {MOBILE_NAV.map((item, i) => {
          const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
          const centre = i === 2;
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? "page" : undefined}
              className={cn(
                "flex flex-col items-center justify-center gap-1 py-2.5 text-[10.5px] font-medium transition-colors",
                active ? "text-accent-text" : "text-subtle",
              )}
            >
              <span
                className={cn(
                  "grid size-8 place-items-center rounded-xl transition-colors",
                  centre
                    ? "bg-accent text-accent-fg shadow-sm"
                    : active
                      ? "bg-accent-soft"
                      : "",
                )}
              >
                <item.icon className="size-[18px]" />
              </span>
              {item.label}
            </Link>
          );
        })}
      </nav>

      {/* Mobile drawer */}
      <Sheet open={mobileNavOpen} onOpenChange={setMobileNavOpen}>
        <SheetContent title="Menu" side="right" className="max-w-[300px]">
          <div className="flex h-14 items-center justify-between border-b border-line px-4">
            <div className="flex items-center gap-2.5">
              <Avatar name={ctx.user.name} src={ctx.user.avatarUrl} size="md" />
              <div className="leading-tight">
                <div className="text-[13px] font-medium text-strong">{ctx.user.name}</div>
                <div className="text-[11px] text-subtle">{ctx.team.name}</div>
              </div>
            </div>
            <SheetClose asChild>
              <Button variant="ghost" size="icon-sm" aria-label="Close menu">
                <X />
              </Button>
            </SheetClose>
          </div>
          <div className="flex-1 space-y-5 overflow-y-auto p-3">
            {navForRole(ctx.role).map((group) => (
              <div key={group.label}>
                <div className="px-2.5 pb-1.5 text-[10.5px] font-semibold uppercase tracking-[0.09em] text-subtle">
                  {group.label}
                </div>
                <ul className="space-y-0.5">
                  {group.items.map((item) => {
                    const active = pathname === item.href;
                    return (
                      <li key={item.href}>
                        <Link
                          href={item.href}
                          className={cn(
                            "flex h-10 items-center gap-3 rounded-lg px-2.5 text-[14px] font-medium transition-colors",
                            active ? "bg-inset text-strong" : "text-muted",
                          )}
                        >
                          <item.icon className={cn("size-[17px]", active ? "text-accent" : "text-subtle")} />
                          {item.label}
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))}
          </div>
          <div className="flex items-center justify-between gap-3 border-t border-line p-3">
            <ThemeToggle />
            <form action={signOutAction}>
              <Button type="submit" variant="ghost" size="sm">
                Sign out
              </Button>
            </form>
          </div>
        </SheetContent>
      </Sheet>

      <CommandPalette open={commandOpen} onOpenChange={setCommandOpen} role={ctx.role} />
    </div>
  );
}

/** Page chrome used by every route: title, subtitle, actions, sticky on desktop. */
export function PageHeader({
  title,
  subtitle,
  actions,
  children,
  sticky = true,
}: {
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  actions?: React.ReactNode;
  children?: React.ReactNode;
  sticky?: boolean;
}) {
  return (
    <div
      className={cn(
        "border-b border-line bg-[color-mix(in_oklch,var(--canvas)_88%,transparent)] backdrop-blur-xl",
        sticky && "sticky top-14 z-10 lg:top-0",
      )}
    >
      <div className="flex flex-wrap items-center gap-3 px-4 py-3.5 sm:px-6">
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-[17px] font-semibold tracking-tight text-strong sm:text-[19px]">{title}</h1>
          {subtitle && <p className="mt-0.5 truncate text-[12.5px] text-muted">{subtitle}</p>}
        </div>
        {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
      </div>
      {children}
    </div>
  );
}

export function PageBody({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("px-4 py-5 sm:px-6", className)} {...props} />;
}

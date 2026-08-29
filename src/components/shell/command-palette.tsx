"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  ArrowRight,
  Building2,
  CornerDownLeft,
  Loader2,
  PhoneCall,
  Search,
  User as UserIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Dialog, DialogClose } from "@/components/ui/overlays";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { Kbd } from "@/components/ui/display";
import { StatusBadge } from "@/components/ui/display";
import { allNavItems } from "./nav-config";
import type { Role, LeadStatus } from "@/lib/db/schema";

type LeadHit = {
  id: string;
  fullName: string;
  company: string | null;
  phonePrimary: string;
  status: LeadStatus;
};

/**
 * ⌘K — navigate anywhere, or search leads by name / company / phone.
 * Lead search is debounced and served by /api/search (visibility-filtered).
 */
export function CommandPalette({
  open,
  onOpenChange,
  role,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  role: Role;
}) {
  const router = useRouter();
  const [query, setQuery] = React.useState("");
  const [hits, setHits] = React.useState<LeadHit[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [cursor, setCursor] = React.useState(0);

  const navItems = React.useMemo(() => allNavItems(role), [role]);
  const filteredNav = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return navItems;
    return navItems.filter(
      (i) => i.label.toLowerCase().includes(q) || i.description.toLowerCase().includes(q),
    );
  }, [navItems, query]);

  React.useEffect(() => {
    if (!open) {
      setQuery("");
      setHits([]);
      setCursor(0);
    }
  }, [open]);

  React.useEffect(() => {
    const q = query.trim();
    if (q.length < 2) {
      setHits([]);
      return;
    }
    setLoading(true);
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(q)}`, { signal: controller.signal });
        if (res.ok) setHits(((await res.json()) as { leads: LeadHit[] }).leads);
      } catch {
        /* aborted or offline — palette still navigates */
      } finally {
        setLoading(false);
      }
    }, 180);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [query]);

  type Row = { key: string; run: () => void; node: React.ReactNode; group: string };

  const rows: Row[] = React.useMemo(() => {
    const navRows: Row[] = filteredNav.map((item) => ({
      key: `nav:${item.href}`,
      group: "Go to",
      run: () => {
        router.push(item.href);
        onOpenChange(false);
      },
      node: (
        <>
          <item.icon className="size-4 shrink-0 text-subtle" />
          <span className="font-medium text-strong">{item.label}</span>
          <span className="truncate text-[12px] text-subtle">{item.description}</span>
          <ArrowRight className="ml-auto size-3.5 shrink-0 text-subtle opacity-0 group-aria-selected:opacity-100" />
        </>
      ),
    }));

    const leadRows: Row[] = hits.map((lead) => ({
      key: `lead:${lead.id}`,
      group: "Leads",
      run: () => {
        router.push(`/leads?lead=${lead.id}`);
        onOpenChange(false);
      },
      node: (
        <>
          <UserIcon className="size-4 shrink-0 text-subtle" />
          <span className="font-medium text-strong">{lead.fullName}</span>
          {lead.company && (
            <span className="flex min-w-0 items-center gap-1 truncate text-[12px] text-subtle">
              <Building2 className="size-3" />
              {lead.company}
            </span>
          )}
          <span className="ml-auto flex shrink-0 items-center gap-2">
            <span className="font-mono text-[11.5px] text-subtle">{lead.phonePrimary}</span>
            <StatusBadge status={lead.status} short size="xs" />
          </span>
        </>
      ),
    }));

    return [...navRows, ...leadRows];
  }, [filteredNav, hits, router, onOpenChange]);

  React.useEffect(() => setCursor(0), [rows.length]);

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setCursor((c) => (c + 1) % Math.max(rows.length, 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setCursor((c) => (c - 1 + rows.length) % Math.max(rows.length, 1));
    } else if (e.key === "Enter") {
      e.preventDefault();
      rows[cursor]?.run();
    }
  }

  let lastGroup = "";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-[oklch(0.18_0.01_265_/_0.45)] backdrop-blur-[2px] data-[state=open]:animate-[fade_0.14s_ease-out]" />
        <DialogPrimitive.Content
          onKeyDown={onKeyDown}
          className="fixed left-1/2 top-[12vh] z-50 w-[calc(100vw-2rem)] max-w-[560px] -translate-x-1/2 overflow-hidden rounded-2xl border border-line bg-surface shadow-xl outline-none data-[state=open]:animate-[rise_0.18s_cubic-bezier(0.22,1,0.36,1)]"
        >
          <DialogPrimitive.Title className="sr-only">Command palette</DialogPrimitive.Title>
          <DialogPrimitive.Description className="sr-only">
            Search leads or jump to a page
          </DialogPrimitive.Description>

          <div className="flex items-center gap-2.5 border-b border-line px-4">
            {loading ? (
              <Loader2 className="size-4 shrink-0 animate-spin text-subtle" />
            ) : (
              <Search className="size-4 shrink-0 text-subtle" />
            )}
            <input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search leads, or jump to a page…"
              className="h-12 flex-1 bg-transparent text-[14px] text-strong placeholder:text-subtle outline-none"
              aria-label="Search"
            />
            <DialogClose asChild>
              <Kbd className="cursor-pointer">esc</Kbd>
            </DialogClose>
          </div>

          <div className="max-h-[52vh] overflow-y-auto p-2">
            {rows.length === 0 ? (
              <div className="px-3 py-10 text-center text-[13px] text-muted">
                {query.trim().length < 2 ? "Type to search your leads." : "Nothing matched that."}
              </div>
            ) : (
              rows.map((row, i) => {
                const showGroup = row.group !== lastGroup;
                lastGroup = row.group;
                return (
                  <React.Fragment key={row.key}>
                    {showGroup && (
                      <div className="px-2.5 pb-1 pt-2 text-[10.5px] font-semibold uppercase tracking-[0.09em] text-subtle">
                        {row.group}
                      </div>
                    )}
                    <button
                      type="button"
                      aria-selected={i === cursor}
                      onMouseEnter={() => setCursor(i)}
                      onClick={row.run}
                      className={cn(
                        "group flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-[13px] transition-colors",
                        i === cursor ? "bg-inset" : "hover:bg-inset/60",
                      )}
                    >
                      {row.node}
                    </button>
                  </React.Fragment>
                );
              })
            )}
          </div>

          <div className="flex items-center gap-4 border-t border-line bg-sunken px-4 py-2 text-[11px] text-subtle">
            <span className="flex items-center gap-1.5">
              <Kbd>↑</Kbd>
              <Kbd>↓</Kbd> navigate
            </span>
            <span className="flex items-center gap-1.5">
              <Kbd>
                <CornerDownLeft className="size-2.5" />
              </Kbd>
              open
            </span>
            <span className="ml-auto flex items-center gap-1.5">
              <PhoneCall className="size-3" /> CallDesk
            </span>
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </Dialog>
  );
}

"use client";

import * as React from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { PageHeader } from "@/components/shell/app-shell";
import { FilterBar, DEFAULT_COLUMNS, type ColumnKey } from "@/components/leads/filter-bar";
import { LeadsTable } from "@/components/leads/leads-table";
import { BulkBar } from "@/components/leads/bulk-bar";
import { LeadDrawer } from "@/components/leads/lead-drawer";
import { NewLeadDialog } from "@/components/leads/new-lead-dialog";
import { ShortcutHelp } from "@/components/leads/shortcut-help";
import type { LeadRow } from "@/lib/queries/leads";
import type { Member } from "@/components/leads/inline-cells";
import type { Role } from "@/lib/db/schema";

/* Storage key kept at the old product name on purpose: it is what is already
   in people's browsers, and renaming it would silently discard their saved
   layout the next time they open the page. */
const COLUMNS_KEY = "calldesk.leads.columns";

export function LeadsClient({
  rows,
  total,
  members,
  tags,
  tz,
  role,
  openLeadId,
}: {
  rows: LeadRow[];
  total: number;
  members: Member[];
  tags: string[];
  tz: string;
  role: Role;
  openLeadId: string | null;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  const [columns, setColumns] = React.useState<ColumnKey[]>(DEFAULT_COLUMNS);
  const [selected, setSelected] = React.useState<Set<string>>(new Set());
  const [newLeadOpen, setNewLeadOpen] = React.useState(false);
  const canManage = role !== "agent";

  /* Column choice is a personal preference, so it lives in the browser. */
  React.useEffect(() => {
    try {
      const stored = localStorage.getItem(COLUMNS_KEY);
      if (stored) setColumns(JSON.parse(stored) as ColumnKey[]);
    } catch {
      /* first run, or storage blocked */
    }
  }, []);

  const updateColumns = React.useCallback((next: ColumnKey[]) => {
    setColumns(next);
    try {
      localStorage.setItem(COLUMNS_KEY, JSON.stringify(next));
    } catch {
      /* storage blocked — the choice just won't persist */
    }
  }, []);

  const setOpenLead = React.useCallback(
    (id: string | null) => {
      const next = new URLSearchParams(params.toString());
      if (id) next.set("lead", id);
      else next.delete("lead");
      router.replace(`${pathname}?${next.toString()}`, { scroll: false });
    },
    [params, pathname, router],
  );

  React.useEffect(() => setSelected(new Set()), [rows]);

  return (
    <>
      <PageHeader
        title="Leads"
        subtitle={`${total.toLocaleString()} in view · ${members.length} ${members.length === 1 ? "person" : "people"} visible to you`}
        actions={<ShortcutHelp />}
      >
        <FilterBar
          members={members}
          tags={tags}
          columns={columns}
          onColumnsChange={updateColumns}
          total={total}
          onNewLead={() => setNewLeadOpen(true)}
          canManage={canManage}
        />
      </PageHeader>

      <div className="py-4">
        <LeadsTable
          rows={rows}
          columns={columns}
          members={members}
          canReassign={canManage}
          tz={tz}
          selected={selected}
          onSelectedChange={setSelected}
          onOpenLead={setOpenLead}
          activeLeadId={openLeadId}
        />
      </div>

      <BulkBar
        selected={selected}
        members={members}
        canManage={canManage}
        onClear={() => setSelected(new Set())}
      />

      <LeadDrawer
        leadId={openLeadId}
        onClose={() => setOpenLead(null)}
        members={members}
        canReassign={canManage}
        tz={tz}
      />

      <NewLeadDialog
        open={newLeadOpen}
        onOpenChange={setNewLeadOpen}
        members={members}
        onCreated={(id) => {
          setNewLeadOpen(false);
          router.refresh();
          setOpenLead(id);
        }}
      />
    </>
  );
}

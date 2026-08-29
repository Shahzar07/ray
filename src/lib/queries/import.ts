import "server-only";
import { and, count, desc, eq, ne, sql } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { activities, customFieldDefs, importBatches, leads, users } from "@/lib/db/schema";
import type { AssignmentStrategy } from "@/lib/domain/import";

export type BatchRow = {
  id: string;
  filename: string;
  uploadedBy: string | null;
  rowCount: number;
  importedCount: number;
  duplicateCount: number;
  errorCount: number;
  assignmentStrategy: AssignmentStrategy;
  status: "pending" | "processing" | "done" | "failed";
  createdAt: Date;
  /** Leads still carrying this batch — the undo shrinks as leads are deleted. */
  liveLeads: number;
  /** False once any call, note or status change lands on one of its leads. */
  undoable: boolean;
  errorLog: Array<{ row: number; message: string }>;
};

/**
 * Batch history for /import. `undoable` is computed the same way the undo
 * action re-checks it, so the button never promises something the action
 * will refuse.
 */
export async function getImportBatches(teamId: string, limit = 12): Promise<BatchRow[]> {
  const rows = await db
    .select({
      id: importBatches.id,
      filename: importBatches.filename,
      uploadedBy: users.name,
      rowCount: importBatches.rowCount,
      importedCount: importBatches.importedCount,
      duplicateCount: importBatches.duplicateCount,
      errorCount: importBatches.errorCount,
      assignmentStrategy: importBatches.assignmentStrategy,
      status: importBatches.status,
      createdAt: importBatches.createdAt,
      errorLog: importBatches.errorLog,
      liveLeads: sql<number>`(select count(*)::int from ${leads} where ${leads.sourceBatchId} = ${importBatches.id})`,
      workedLeads: sql<number>`(
        select count(*)::int from ${activities}
        where ${activities.type} <> 'import'
          and ${activities.leadId} in (select id from ${leads} where ${leads.sourceBatchId} = ${importBatches.id})
      )`,
    })
    .from(importBatches)
    .leftJoin(users, eq(users.id, importBatches.uploadedBy))
    .where(eq(importBatches.teamId, teamId))
    .orderBy(desc(importBatches.createdAt))
    .limit(limit);

  return rows.map((r) => ({
    id: r.id,
    filename: r.filename,
    uploadedBy: r.uploadedBy,
    rowCount: r.rowCount,
    importedCount: r.importedCount,
    duplicateCount: r.duplicateCount,
    errorCount: r.errorCount,
    assignmentStrategy: r.assignmentStrategy,
    status: r.status,
    createdAt: r.createdAt,
    errorLog: r.errorLog,
    liveLeads: r.liveLeads,
    undoable: r.workedLeads === 0 && r.liveLeads > 0,
  }));
}

export async function getMappableCustomFields(orgId: string) {
  return db
    .select({ key: customFieldDefs.key, label: customFieldDefs.label })
    .from(customFieldDefs)
    .where(and(eq(customFieldDefs.orgId, orgId), eq(customFieldDefs.isActive, true)))
    .orderBy(customFieldDefs.sortOrder);
}

/** Batch quality: how many of a sheet's leads actually reached a trial. */
export async function getBatchOutcomes(teamId: string) {
  return db
    .select({
      batchId: leads.sourceBatchId,
      total: count(),
      converted: sql<number>`count(*) filter (where ${leads.status} = 'converted')::int`,
      interested: sql<number>`count(*) filter (where ${leads.interestLevel} is not null and ${leads.interestLevel} <> 'cold')::int`,
    })
    .from(leads)
    .where(and(eq(leads.teamId, teamId), ne(leads.status, "do_not_call")))
    .groupBy(leads.sourceBatchId);
}

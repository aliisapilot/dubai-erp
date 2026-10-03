export type ProjectResult<T> = { data: T | null; error: { message: string } | null };

/** Supabase reports most failures in its result, rather than rejecting the promise. */
export async function readProjectResult<T>(query: PromiseLike<ProjectResult<T>>): Promise<T | null> {
  const result = await query;
  if (result.error) throw new Error(result.error.message);
  return result.data;
}

/** Returned rows also prove that a scoped write affected the intended record. */
export async function writeProjectResult<T>(query: PromiseLike<ProjectResult<T>>): Promise<T> {
  const data = await readProjectResult(query);
  if (data === null || (Array.isArray(data) && data.length === 0)) {
    throw new Error("No record was saved. It may have changed or you may not have access.");
  }
  return data;
}

export function unsavedProjectExpenses<T extends { id: string }>(saved: T[], browserDrafts: T[]): T[] {
  const savedIds = new Set(saved.map(row => row.id));
  return browserDrafts.filter(row => !savedIds.has(row.id));
}

export type ProjectWmsDraft = {
  parent: { id: string; company_id: string; project_id: string; title: string; [key: string]: unknown };
  risks: Array<{ id: string; [key: string]: unknown }>;
  qaqc: Array<{ id: string; [key: string]: unknown }>;
  revHistory: Array<{ rev: string; date: string; description: string; prepared_by: string }>;
};

type WmsClient = {
  from(table: string): {
    upsert(rows: Record<string, unknown> | Record<string, unknown>[], options: { onConflict: string }): {
      select(columns: string): PromiseLike<ProjectResult<Array<{ id: string }>>>;
    };
  };
};

/** Stable IDs make a retry after a partial network failure safe, without deleting saved rows. */
export async function saveProjectWmsDraft(client: WmsClient, draft: ProjectWmsDraft): Promise<void> {
  if (!draft.parent.id || !draft.parent.company_id || !draft.parent.project_id || draft.parent.status !== "Draft") {
    throw new Error("The unfinished WMS must belong to a project and remain a draft.");
  }
  for (const rows of [draft.risks, draft.qaqc]) {
    const ids = new Set<string>();
    for (const row of rows) {
      if (!row.id || ids.has(row.id) || row.company_id !== draft.parent.company_id || row.wms_id !== draft.parent.id) {
        throw new Error("The unfinished WMS contains an invalid or unrelated assessment.");
      }
      ids.add(row.id);
    }
  }
  await writeProjectResult(client.from("work_method_statements").upsert(draft.parent, {onConflict: "id"}).select("id"));
  for (const [table, rows] of [["wms_risk_assessments", draft.risks], ["wms_qaqc_checklists", draft.qaqc]] as const) {
    if (!rows.length) continue;
    const saved = await writeProjectResult(client.from(table).upsert(rows, {onConflict: "id"}).select("id"));
    if (saved.length !== rows.length) throw new Error(`Some ${table === "wms_risk_assessments" ? "risk assessments" : "inspection items"} were not saved. Retry the unfinished draft.`);
  }
}

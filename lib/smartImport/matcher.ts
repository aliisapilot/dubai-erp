/**
 * Dubai ERP: Smart Import - Entity Resolution & Matcher Engine
 * Matches customers, suppliers, projects, employees, and historical documents
 * against existing database records with duplicate detection.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  EntityMatchCandidate,
  EntityMatchResult,
  DocumentType,
} from "./types";

function calculateLevenshteinSimilarity(s1: string, s2: string): number {
  const str1 = s1.toLowerCase().trim();
  const str2 = s2.toLowerCase().trim();
  if (str1 === str2) return 1.0;
  if (!str1 || !str2) return 0.0;

  const track = Array(str2.length + 1)
    .fill(null)
    .map(() => Array(str1.length + 1).fill(null));

  for (let i = 0; i <= str1.length; i += 1) track[0][i] = i;
  for (let j = 0; j <= str2.length; j += 1) track[j][0] = j;

  for (let j = 1; j <= str2.length; j += 1) {
    for (let i = 1; i <= str1.length; i += 1) {
      const indicator = str1[i - 1] === str2[j - 1] ? 0 : 1;
      track[j][i] = Math.min(
        track[j][i - 1] + 1, // deletion
        track[j - 1][i] + 1, // insertion
        track[j - 1][i - 1] + indicator // substitution
      );
    }
  }

  const distance = track[str2.length][str1.length];
  const maxLen = Math.max(str1.length, str2.length);
  return 1 - distance / maxLen;
}

export interface ExistingEntitiesCache {
  customers: { id: string; name: string; trn?: string | null; email?: string | null; phone?: string | null }[];
  suppliers: { id: string; name: string; trn?: string | null; email?: string | null; phone?: string | null }[];
  projects: { id: string; name: string; project_number?: string | null; customer_id?: string | null }[];
  employees: { id: string; employee_number: string; first_name: string; employee_code?: string | null }[];
  existingDocuments: Record<string, { id: string; number: string; type: string }>;
}

export async function loadExistingEntities(supabase: SupabaseClient): Promise<ExistingEntitiesCache> {
  const [
    { data: custs },
    { data: supps },
    { data: projs },
    { data: emps },
    { data: quotes },
    { data: taxInvs },
    { data: dns },
    { data: pos },
    { data: bills },
  ] = await Promise.all([
    supabase.from("customers").select("id, name, trn, email, phone"),
    supabase.from("suppliers").select("id, name, trn, email, phone"),
    supabase.from("projects").select("id, name, project_number, customer_id"),
    supabase.from("employees").select("id, employee_number, first_name, employee_code"),
    supabase.from("quotations").select("id, quotation_number"),
    supabase.from("tax_invoices").select("id, invoice_number"),
    supabase.from("delivery_notes").select("id, delivery_note_number"),
    supabase.from("purchase_orders").select("id, purchase_order_number"),
    supabase.from("supplier_bills").select("id, bill_number"),
  ]);

  const existingDocs: Record<string, { id: string; number: string; type: string }> = {};

  (quotes || []).forEach(q => {
    if (q.quotation_number) existingDocs[q.quotation_number.toLowerCase().trim()] = { id: q.id, number: q.quotation_number, type: "quotation" };
  });
  (taxInvs || []).forEach(t => {
    if (t.invoice_number) existingDocs[t.invoice_number.toLowerCase().trim()] = { id: t.id, number: t.invoice_number, type: "tax_invoice" };
  });
  (dns || []).forEach(d => {
    if (d.delivery_note_number) existingDocs[d.delivery_note_number.toLowerCase().trim()] = { id: d.id, number: d.delivery_note_number, type: "delivery_note" };
  });
  (pos || []).forEach(p => {
    if (p.purchase_order_number) existingDocs[p.purchase_order_number.toLowerCase().trim()] = { id: p.id, number: p.purchase_order_number, type: "purchase_order" };
  });
  (bills || []).forEach(b => {
    if (b.bill_number) existingDocs[b.bill_number.toLowerCase().trim()] = { id: b.id, number: b.bill_number, type: "supplier_bill" };
  });

  return {
    customers: custs || [],
    suppliers: supps || [],
    projects: projs || [],
    employees: emps || [],
    existingDocuments: existingDocs,
  };
}

export function normalizeEntityName(name: string): string {
  if (!name) return "";
  return name
    .toLowerCase()
    .replace(/[.,\/#!$%\^&\*;:{}=\-_`~()]/g, " ")
    .replace(/\b(co|company|l\s*l\s*c|llc|fze|fzc|est|establishment|trading|general\s*trading)\b/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// -------------------------------------------------------------
// Match Customer
// -------------------------------------------------------------
export function matchCustomer(
  extractedName: string | null,
  extractedTrn: string | null,
  cache: ExistingEntitiesCache,
  batchProposedCustomers?: { name: string; trn?: string }[]
): EntityMatchResult {
  if (!extractedName && !extractedTrn) {
    return {
      action: "skip",
      targetModule: "Customers",
      targetTable: "customers",
      extractedName: "",
      matchConfidence: 0,
      matchReason: "No customer information extracted from document.",
    };
  }

  const cleanName = (extractedName || "").trim();
  const cleanTrn = (extractedTrn || "").trim();
  const normClean = normalizeEntityName(cleanName);

  // 1. Exact TRN Match (Highest confidence)
  if (cleanTrn) {
    const trnMatch = cache.customers.find(c => c.trn && c.trn.trim() === cleanTrn);
    if (trnMatch) {
      return {
        action: "reuse_existing",
        targetModule: "Customers",
        targetTable: "customers",
        extractedName: cleanName,
        extractedTrn: cleanTrn,
        matchedId: trnMatch.id,
        matchedName: trnMatch.name,
        matchConfidence: 1.0,
        matchReason: `Exact TRN match found (${cleanTrn}) with existing customer '${trnMatch.name}'. Reusing existing record.`,
      };
    }

    // Check TRN against customers already proposed in the current batch
    if (batchProposedCustomers) {
      const batchTrnMatch = batchProposedCustomers.find(b => b.trn && b.trn.trim() === cleanTrn);
      if (batchTrnMatch) {
        return {
          action: "reuse_existing",
          targetModule: "Customers",
          targetTable: "customers",
          extractedName: cleanName,
          extractedTrn: cleanTrn,
          matchedName: batchTrnMatch.name,
          matchConfidence: 0.99,
          matchReason: `Exact TRN match (${cleanTrn}) with customer '${batchTrnMatch.name}' proposed in this import batch. Reusing proposed record.`,
        };
      }
    }
  }

  // 2. Exact Name Match (Case-insensitive)
  const exactNameMatch = cache.customers.find(
    c => c.name.toLowerCase().trim() === cleanName.toLowerCase().trim()
  );
  if (exactNameMatch) {
    return {
      action: "reuse_existing",
      targetModule: "Customers",
      targetTable: "customers",
      extractedName: cleanName,
      extractedTrn: cleanTrn,
      matchedId: exactNameMatch.id,
      matchedName: exactNameMatch.name,
      matchConfidence: 0.98,
      matchReason: `Exact customer name match found for '${cleanName}'. Reusing existing record.`,
    };
  }

  // 3. Normalized Name Match against DB cache
  if (normClean.length > 2 && cleanTrn) {
    const normMatch = cache.customers.find(c => {
      const nc = normalizeEntityName(c.name);
      return nc === normClean || (nc.length > 3 && (nc.includes(normClean) || normClean.includes(nc)));
    });
    if (normMatch) {
      return {
        action: "reuse_existing",
        targetModule: "Customers",
        targetTable: "customers",
        extractedName: cleanName,
        extractedTrn: cleanTrn,
        matchedId: normMatch.id,
        matchedName: normMatch.name,
        matchConfidence: 0.96,
        matchReason: `Normalized customer name match with '${normMatch.name}'. Reusing existing record.`,
      };
    }
  }

  // 4. Match against customers proposed in this batch
  if (batchProposedCustomers) {
    const batchMatch = batchProposedCustomers.find(b => {
      if (b.name.toLowerCase().trim() === cleanName.toLowerCase().trim()) return true;
      const nb = normalizeEntityName(b.name);
      return nb.length > 2 && (nb === normClean || nb.includes(normClean) || normClean.includes(nb));
    });
    if (batchMatch) {
      return {
        action: "reuse_existing",
        targetModule: "Customers",
        targetTable: "customers",
        extractedName: cleanName,
        extractedTrn: cleanTrn,
        matchedName: batchMatch.name,
        matchConfidence: 0.98,
        matchReason: `Matches customer '${batchMatch.name}' proposed in this import batch. Reusing proposed record.`,
      };
    }
  }

  // 5. Fuzzy similarity search against DB cache
  const candidates: EntityMatchCandidate[] = [];
  for (const c of cache.customers) {
    const sim = calculateLevenshteinSimilarity(cleanName, c.name);
    if (sim >= 0.70) {
      candidates.push({
        id: c.id,
        name: c.name,
        trn: c.trn || undefined,
        similarity: Number(sim.toFixed(2)),
      });
    }
  }

  // Sort candidates by highest similarity
  candidates.sort((a, b) => b.similarity - a.similarity);

  if (candidates.length > 0) {
    return {
      action: "needs_review",
      targetModule: "Customers",
      targetTable: "customers",
      extractedName: cleanName,
      extractedTrn: cleanTrn,
      matchedId: candidates[0].id,
      matchedName: candidates[0].name,
      matchConfidence: candidates[0].similarity,
      matchReason: `Similar existing customer found ('${candidates[0].name}', ${Math.round(candidates[0].similarity * 100)}% match). Requires confirmation before linking.`,
      candidateMatches: candidates,
    };
  }

  // 6. No match -> Propose New Customer
  return {
    action: "create_new",
    targetModule: "Customers",
    targetTable: "customers",
    extractedName: cleanName,
    extractedTrn: cleanTrn,
    matchConfidence: 0.95,
    matchReason: `No existing customer matched '${cleanName}'. Proposed as new customer.`,
  };
}

// -------------------------------------------------------------
// Match Supplier
// -------------------------------------------------------------
export function matchSupplier(
  extractedName: string | null,
  extractedTrn: string | null,
  cache: ExistingEntitiesCache
): EntityMatchResult {
  if (!extractedName && !extractedTrn) {
    return {
      action: "skip",
      targetModule: "Suppliers",
      targetTable: "suppliers",
      extractedName: "",
      matchConfidence: 0,
      matchReason: "No supplier information extracted from document.",
    };
  }

  const cleanName = (extractedName || "").trim();
  const cleanTrn = (extractedTrn || "").trim();

  // 1. Exact TRN Match
  if (cleanTrn) {
    const trnMatch = cache.suppliers.find(s => s.trn && s.trn.trim() === cleanTrn);
    if (trnMatch) {
      return {
        action: "reuse_existing",
        targetModule: "Suppliers",
        targetTable: "suppliers",
        extractedName: cleanName,
        extractedTrn: cleanTrn,
        matchedId: trnMatch.id,
        matchedName: trnMatch.name,
        matchConfidence: 1.0,
        matchReason: `Exact TRN match found (${cleanTrn}) with supplier '${trnMatch.name}'. Reusing existing record.`,
      };
    }
  }

  // 2. Exact Name Match
  const exactNameMatch = cache.suppliers.find(
    s => s.name.toLowerCase().trim() === cleanName.toLowerCase().trim()
  );
  if (exactNameMatch) {
    return {
      action: "reuse_existing",
      targetModule: "Suppliers",
      targetTable: "suppliers",
      extractedName: cleanName,
      extractedTrn: cleanTrn,
      matchedId: exactNameMatch.id,
      matchedName: exactNameMatch.name,
      matchConfidence: 0.98,
      matchReason: `Exact supplier name match found for '${cleanName}'. Reusing existing record.`,
    };
  }

  // 3. Fuzzy similarity
  const candidates: EntityMatchCandidate[] = [];
  for (const s of cache.suppliers) {
    const sim = calculateLevenshteinSimilarity(cleanName, s.name);
    if (sim >= 0.70) {
      candidates.push({
        id: s.id,
        name: s.name,
        trn: s.trn || undefined,
        similarity: Number(sim.toFixed(2)),
      });
    }
  }
  candidates.sort((a, b) => b.similarity - a.similarity);

  if (candidates.length > 0) {
    return {
      action: "needs_review",
      targetModule: "Suppliers",
      targetTable: "suppliers",
      extractedName: cleanName,
      extractedTrn: cleanTrn,
      matchedId: candidates[0].id,
      matchedName: candidates[0].name,
      matchConfidence: candidates[0].similarity,
      matchReason: `Similar supplier found ('${candidates[0].name}', ${Math.round(candidates[0].similarity * 100)}% match). Requires manual review.`,
      candidateMatches: candidates,
    };
  }

  return {
    action: "create_new",
    targetModule: "Suppliers",
    targetTable: "suppliers",
    extractedName: cleanName,
    extractedTrn: cleanTrn,
    matchConfidence: 0.95,
    matchReason: `No existing supplier matched '${cleanName}'. Proposed as new supplier.`,
  };
}

// -------------------------------------------------------------
// Match Project
// -------------------------------------------------------------
export function matchProject(
  extractedProjectName: string | null,
  customerId: string | null,
  cache: ExistingEntitiesCache
): EntityMatchResult {
  if (!extractedProjectName || !extractedProjectName.trim()) {
    return {
      action: "skip",
      targetModule: "Projects",
      targetTable: "projects",
      extractedName: "",
      matchConfidence: 0,
      matchReason: "No project name in document; will not create orphan project.",
    };
  }

  const cleanName = extractedProjectName.trim();

  // Search by customer + project name
  const exactProj = cache.projects.find(p => {
    const nameMatches = p.name.toLowerCase().trim() === cleanName.toLowerCase().trim() ||
      (p.project_number && p.project_number.toLowerCase().trim() === cleanName.toLowerCase().trim());
    const custMatches = !customerId || p.customer_id === customerId;
    return nameMatches && custMatches;
  });

  if (exactProj) {
    return {
      action: "reuse_existing",
      targetModule: "Projects",
      targetTable: "projects",
      extractedName: cleanName,
      matchedId: exactProj.id,
      matchedName: exactProj.name,
      matchConfidence: 0.99,
      matchReason: `Existing project '${exactProj.name}' matched. Reusing existing project record.`,
    };
  }

  // Fuzzy search
  const candidates: EntityMatchCandidate[] = [];
  for (const p of cache.projects) {
    const sim = calculateLevenshteinSimilarity(cleanName, p.name);
    if (sim >= 0.70) {
      candidates.push({
        id: p.id,
        name: p.name,
        similarity: Number(sim.toFixed(2)),
      });
    }
  }
  candidates.sort((a, b) => b.similarity - a.similarity);

  if (candidates.length > 0) {
    return {
      action: "needs_review",
      targetModule: "Projects",
      targetTable: "projects",
      extractedName: cleanName,
      matchedId: candidates[0].id,
      matchedName: candidates[0].name,
      matchConfidence: candidates[0].similarity,
      matchReason: `Similar project found ('${candidates[0].name}'). Confirm whether to reuse or create new.`,
      candidateMatches: candidates,
    };
  }

  // Work scopes, item descriptions, and trade activities must NOT automatically spawn ERP projects
  const isGenericWorkScope = /\b(fabrication|liner|tank|supply|installation|maintenance|repair|transportation|shades|canopy|fitting|pvc|hdpe|car\s*parking)\b/i.test(cleanName);
  const isExplicitProject = /\b(project|tower|building|villa|site|plot|mall|phase|residence|contract|prj[-_0-9]|job[-_0-9])\b/i.test(cleanName);

  if (isExplicitProject && (!isGenericWorkScope || /\b(plot\s*\d+|tower|building|villa|mall|site\s*\d+|phase\s*\d+|contract\s*\d+)/i.test(cleanName))) {
    return {
      action: "create_new",
      targetModule: "Projects",
      targetTable: "projects",
      extractedName: cleanName,
      matchConfidence: 0.9,
      matchReason: `New project identified: '${cleanName}'. Proposed for creation.`,
    };
  }

  return {
    action: "skip",
    targetModule: "Projects",
    targetTable: "projects",
    extractedName: cleanName,
    matchConfidence: 0,
    matchReason: `Scope '${cleanName}' is an invoice item/service description, not an explicitly justified ERP project.`,
  };
}

// -------------------------------------------------------------
// Match Permanent Employee (EMP-01 through EMP-10)
// -------------------------------------------------------------
export function matchEmployee(
  codeOrName: string,
  cache: ExistingEntitiesCache
): { matchedEmployeeId?: string; matchedCode?: string; matchedName?: string; status: "matched" | "unmatched" } {
  const clean = codeOrName.trim().toLowerCase();

  // 1. Match by permanent employee number / code (e.g. EMP-01)
  const codeMatch = cache.employees.find(
    e => (e.employee_number && e.employee_number.toLowerCase() === clean) ||
         (e.employee_code && e.employee_code.toLowerCase() === clean)
  );
  if (codeMatch) {
    return {
      matchedEmployeeId: codeMatch.id,
      matchedCode: codeMatch.employee_number,
      matchedName: codeMatch.first_name,
      status: "matched",
    };
  }

  // 2. Match by exact first_name
  const nameMatch = cache.employees.find(
    e => e.first_name.toLowerCase().trim() === clean
  );
  if (nameMatch) {
    return {
      matchedEmployeeId: nameMatch.id,
      matchedCode: nameMatch.employee_number,
      matchedName: nameMatch.first_name,
      status: "matched",
    };
  }

  // 3. Fallback partial match if unambiguous
  const partials = cache.employees.filter(
    e => e.first_name.toLowerCase().includes(clean) || clean.includes(e.first_name.toLowerCase())
  );
  if (partials.length === 1) {
    return {
      matchedEmployeeId: partials[0].id,
      matchedCode: partials[0].employee_number,
      matchedName: partials[0].first_name,
      status: "matched",
    };
  }

  return { status: "unmatched" };
}

// -------------------------------------------------------------
// Check Duplicate Document
// -------------------------------------------------------------
export function checkDuplicateDocument(
  docNumber: string | null,
  docType: DocumentType,
  cache: ExistingEntitiesCache
): { isDuplicate: boolean; duplicateId?: string; reason?: string } {
  if (!docNumber || !docNumber.trim()) {
    return { isDuplicate: false };
  }

  const cleanNum = docNumber.trim().toLowerCase();
  const existing = cache?.existingDocuments ? cache.existingDocuments[cleanNum] : undefined;

  if (existing) {
    return {
      isDuplicate: true,
      duplicateId: existing.id,
      reason: `Document number '${docNumber}' already exists in the ERP under ${existing.type}. Proposed action: Skip or review manually to preserve historical integrity.`,
    };
  }

  return { isDuplicate: false };
}

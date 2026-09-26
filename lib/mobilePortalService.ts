import { supabase } from "@/lib/supabase";
import { getCompanyId, statusClass } from "@/lib/helpers";
import {
  MobileDocumentCategory,
  MobilePortalDocument,
  MobilePortalPermissions,
  DEFAULT_PERMISSIONS,
  DENIED_PERMISSIONS,
  isMissingMobilePermissionsSchema,
  getCategoryLabel,
} from "./mobilePortalTypes";

/**
 * Loads the user's mobile permissions from profiles.
 */
export async function getMobilePermissions(): Promise<MobilePortalPermissions> {
  try {
    const { data: userData } = await supabase.auth.getUser();
    if (!userData?.user) return DENIED_PERMISSIONS;

    const { data: prof, error: profileError } = await supabase
      .from("profiles")
      .select("role, mobile_access_enabled, mobile_role, mobile_allowed_doc_types, can_view_financials, can_share_documents, can_download_documents")
      .eq("id", userData.user.id)
      .maybeSingle();

    if (profileError) {
      if (!isMissingMobilePermissionsSchema(profileError)) return DENIED_PERMISSIONS;

      // Legacy deployments have no per-user mobile controls. Only the company owner
      // receives a compatibility fallback; members stay denied until permissions exist.
      const { data: ownedCompany } = await supabase
        .from("companies")
        .select("id")
        .eq("owner_id", userData.user.id)
        .limit(1)
        .maybeSingle();
      return ownedCompany?.id ? { ...DEFAULT_PERMISSIONS, role: "owner" } : DENIED_PERMISSIONS;
    }

    if (!prof) {
      const { data: ownedCompany } = await supabase
        .from("companies")
        .select("id")
        .eq("owner_id", userData.user.id)
        .limit(1)
        .maybeSingle();
      return ownedCompany?.id ? { ...DEFAULT_PERMISSIONS, role: "owner" } : DENIED_PERMISSIONS;
    }

    return {
      mobileAccessEnabled: prof.mobile_access_enabled ?? true,
      role: prof.mobile_role || prof.role || "standard",
      allowedCategories: (prof.mobile_allowed_doc_types as MobileDocumentCategory[]) || DEFAULT_PERMISSIONS.allowedCategories,
      canViewFinancials: prof.can_view_financials ?? true,
      canShareDocuments: prof.can_share_documents ?? true,
      canDownloadDocuments: prof.can_download_documents ?? true,
    };
  } catch (err) {
    console.warn("Could not load mobile permissions:", err);
    return DENIED_PERMISSIONS;
  }
}

/**
 * Fetches unified documents across ERP entities according to permitted categories.
 */
export async function fetchUnifiedMobileDocuments(options?: {
  category?: MobileDocumentCategory | "all";
  search?: string;
  limit?: number;
}): Promise<MobilePortalDocument[]> {
  const permissions = await getMobilePermissions();
  if (!permissions.mobileAccessEnabled) {
    throw new Error("Mobile document portal access is not enabled for your account. Please contact your company administrator.");
  }

  const selectedCategory = options?.category && options.category !== "all" ? options.category : null;
  const docs: MobilePortalDocument[] = [];

  const canFetch = (cat: MobileDocumentCategory) => {
    if (!permissions.allowedCategories.includes(cat)) return false;
    if (selectedCategory && selectedCategory !== cat) return false;
    return true;
  };

  const tasks: Promise<void>[] = [];

  // 1. Tax Invoices
  if (canFetch("tax_invoice")) {
    tasks.push(
      (async () => {
        const { data } = await supabase
          .from("tax_invoices")
          .select("id, invoice_number, invoice_date, supply_date, total_amount, status, notes, customer:customers(id, name, trn)")
          .order("invoice_date", { ascending: false })
          .limit(options?.limit || 50);

        if (data) {
          for (const item of data) {
            const cust = Array.isArray(item.customer) ? item.customer[0] : item.customer;
            docs.push({
              id: item.id,
              category: "tax_invoice",
              categoryLabel: getCategoryLabel("tax_invoice"),
              documentNumber: item.invoice_number || `INV-${item.id.slice(0, 6)}`,
              date: item.invoice_date || item.supply_date || "",
              dueDate: null,
              partyName: cust?.name || "Customer",
              partyTrn: cust?.trn,
              partyRole: "Customer",
              amount: permissions.canViewFinancials ? Number(item.total_amount) || 0 : null,
              status: item.status || "Final",
              statusBadgeClass: statusClass(item.status || "Final"),
              notes: item.notes,
              hasAttachment: false,
              rawData: item,
            });
          }
        }
      })()
    );
  }

  // 2. Quotations
  if (canFetch("quotation")) {
    tasks.push(
      (async () => {
        const { data } = await supabase
          .from("quotations")
          .select("id, quotation_number, quotation_date, valid_until, total_amount, status, notes, customer:customers(id, name, trn)")
          .order("quotation_date", { ascending: false })
          .limit(options?.limit || 50);

        if (data) {
          for (const item of data) {
            const cust = Array.isArray(item.customer) ? item.customer[0] : item.customer;
            docs.push({
              id: item.id,
              category: "quotation",
              categoryLabel: getCategoryLabel("quotation"),
              documentNumber: item.quotation_number || `QUO-${item.id.slice(0, 6)}`,
              date: item.quotation_date || "",
              dueDate: item.valid_until,
              partyName: cust?.name || "Customer",
              partyTrn: cust?.trn,
              partyRole: "Customer",
              amount: permissions.canViewFinancials ? Number(item.total_amount) || 0 : null,
              status: item.status || "Sent",
              statusBadgeClass: statusClass(item.status || "Sent"),
              notes: item.notes,
              hasAttachment: false,
              rawData: item,
            });
          }
        }
      })()
    );
  }

  // 3. Proforma Invoices
  if (canFetch("proforma")) {
    tasks.push(
      (async () => {
        const { data } = await supabase
          .from("proforma_invoices")
          .select("id, proforma_number, proforma_date, due_date, total_amount, status, notes, customer:customers(id, name, trn)")
          .order("proforma_date", { ascending: false })
          .limit(options?.limit || 50);

        if (data) {
          for (const item of data) {
            const cust = Array.isArray(item.customer) ? item.customer[0] : item.customer;
            docs.push({
              id: item.id,
              category: "proforma",
              categoryLabel: getCategoryLabel("proforma"),
              documentNumber: item.proforma_number || `PI-${item.id.slice(0, 6)}`,
              date: item.proforma_date || "",
              dueDate: item.due_date,
              partyName: cust?.name || "Customer",
              partyTrn: cust?.trn,
              partyRole: "Customer",
              amount: permissions.canViewFinancials ? Number(item.total_amount) || 0 : null,
              status: item.status || "Draft",
              statusBadgeClass: statusClass(item.status || "Draft"),
              notes: item.notes,
              hasAttachment: false,
              rawData: item,
            });
          }
        }
      })()
    );
  }

  // 4. Delivery Notes
  if (canFetch("delivery_note")) {
    tasks.push(
      (async () => {
        const { data } = await supabase
          .from("delivery_notes")
          .select("id, delivery_note_number, delivery_date, status, remarks, customer:customers(id, name, trn)")
          .order("delivery_date", { ascending: false })
          .limit(options?.limit || 50);

        if (data) {
          for (const item of data) {
            const cust = Array.isArray(item.customer) ? item.customer[0] : item.customer;
            docs.push({
              id: item.id,
              category: "delivery_note",
              categoryLabel: getCategoryLabel("delivery_note"),
              documentNumber: item.delivery_note_number || `DN-${item.id.slice(0, 6)}`,
              date: item.delivery_date || "",
              partyName: cust?.name || "Customer",
              partyTrn: cust?.trn,
              partyRole: "Customer",
              amount: null,
              status: item.status || "Delivered",
              statusBadgeClass: statusClass(item.status || "Delivered"),
              notes: item.remarks,
              hasAttachment: false,
              rawData: item,
            });
          }
        }
      })()
    );
  }

  // 5. Purchase Orders
  if (canFetch("purchase_order")) {
    tasks.push(
      (async () => {
        const { data } = await supabase
          .from("purchase_orders")
          .select("id, purchase_order_number, po_date, total_amount, status, notes, supplier:suppliers(id, name, trn)")
          .order("po_date", { ascending: false })
          .limit(options?.limit || 50);

        if (data) {
          for (const item of data) {
            const supp = Array.isArray(item.supplier) ? item.supplier[0] : item.supplier;
            docs.push({
              id: item.id,
              category: "purchase_order",
              categoryLabel: getCategoryLabel("purchase_order"),
              documentNumber: item.purchase_order_number || `PO-${item.id.slice(0, 6)}`,
              date: item.po_date || "",
              partyName: supp?.name || "Supplier",
              partyTrn: supp?.trn,
              partyRole: "Supplier",
              amount: permissions.canViewFinancials ? Number(item.total_amount) || 0 : null,
              status: item.status || "Approved",
              statusBadgeClass: statusClass(item.status || "Approved"),
              notes: item.notes,
              hasAttachment: false,
              rawData: item,
            });
          }
        }
      })()
    );
  }

  // 6. Supplier Bills
  if (canFetch("supplier_bill")) {
    tasks.push(
      (async () => {
        const { data } = await supabase
          .from("supplier_bills")
          .select("id, bill_number, bill_date, due_date, total_amount, paid_amount, status, notes, supplier:suppliers(id, name, trn)")
          .order("bill_date", { ascending: false })
          .limit(options?.limit || 50);

        if (data) {
          for (const item of data) {
            const supp = Array.isArray(item.supplier) ? item.supplier[0] : item.supplier;
            docs.push({
              id: item.id,
              category: "supplier_bill",
              categoryLabel: getCategoryLabel("supplier_bill"),
              documentNumber: item.bill_number || `BILL-${item.id.slice(0, 6)}`,
              date: item.bill_date || "",
              dueDate: item.due_date,
              partyName: supp?.name || "Supplier",
              partyTrn: supp?.trn,
              partyRole: "Supplier",
              amount: permissions.canViewFinancials ? Number(item.total_amount) || 0 : null,
              status: item.status || "Pending",
              statusBadgeClass: statusClass(item.status || "Pending"),
              notes: item.notes,
              hasAttachment: false,
              rawData: item,
            });
          }
        }
      })()
    );
  }

  // 7. Cheques
  if (canFetch("cheque")) {
    tasks.push(
      (async () => {
        const { data } = await supabase
          .from("cheques")
          .select("id, cheque_number, cheque_type, bank_name, amount, issue_date, due_date, status, payee_name, cheque_image_front_url, customer:customers(name, trn), supplier:suppliers(name, trn)")
          .order("due_date", { ascending: false })
          .limit(options?.limit || 50);

        if (data) {
          for (const item of data) {
            const cust = Array.isArray(item.customer) ? item.customer[0] : item.customer;
            const supp = Array.isArray(item.supplier) ? item.supplier[0] : item.supplier;
            const party = item.cheque_type === "incoming" ? cust?.name || item.payee_name : supp?.name || item.payee_name;

            docs.push({
              id: item.id,
              category: "cheque",
              categoryLabel: item.cheque_type === "incoming" ? "Inward Cheque" : "Outward Cheque",
              documentNumber: `#${item.cheque_number}`,
              date: item.issue_date || "",
              dueDate: item.due_date,
              partyName: party || "Counterparty",
              partyTrn: cust?.trn || supp?.trn,
              partyRole: item.cheque_type === "incoming" ? "Customer" : "Supplier",
              amount: permissions.canViewFinancials ? Number(item.amount) || 0 : null,
              status: item.status || "Pending",
              statusBadgeClass: statusClass(item.status || "Pending"),
              fileUrl: item.cheque_image_front_url,
              hasAttachment: Boolean(item.cheque_image_front_url),
              rawData: item,
            });
          }
        }
      })()
    );
  }

  // 8. Company Files & Attachments
  if (canFetch("company_file")) {
    tasks.push(
      (async () => {
        const { data } = await supabase
          .from("document_attachments")
          .select("id, file_name, file_url, file_size, file_type, description, entity_type, created_at")
          .order("created_at", { ascending: false })
          .limit(options?.limit || 50);

        if (data) {
          for (const item of data) {
            docs.push({
              id: item.id,
              category: "company_file",
              categoryLabel: "Company File",
              documentNumber: item.file_name,
              date: item.created_at ? item.created_at.slice(0, 10) : "",
              partyName: item.entity_type ? `Section: ${item.entity_type.toUpperCase()}` : "Company Asset",
              partyRole: "Company",
              amount: null,
              status: "Available",
              statusBadgeClass: "bg-slate-100 text-slate-700",
              notes: item.description,
              fileUrl: item.file_url,
              fileType: item.file_type,
              hasAttachment: true,
              rawData: item,
            });
          }
        }
      })()
    );
  }

  await Promise.all(tasks);

  // Sort descending by date
  docs.sort((a, b) => (b.date || "").localeCompare(a.date || ""));

  // Apply optional search filter
  if (options?.search?.trim()) {
    const s = options.search.toLowerCase();
    return docs.filter(
      (d) =>
        d.documentNumber.toLowerCase().includes(s) ||
        d.partyName.toLowerCase().includes(s) ||
        (d.notes && d.notes.toLowerCase().includes(s)) ||
        d.categoryLabel.toLowerCase().includes(s)
    );
  }

  return docs;
}

/**
 * Logs document access (view, preview, download, share) for compliance and security audit trails.
 */
export async function logDocumentAccess(params: {
  documentType: string;
  documentId: string;
  documentRef?: string;
  action: "view" | "preview_pdf" | "download" | "share";
}): Promise<void> {
  try {
    const companyId = await getCompanyId();
    const { data: userData } = await supabase.auth.getUser();

    await supabase.from("document_access_logs").insert({
      company_id: companyId,
      user_id: userData?.user?.id || null,
      user_email: userData?.user?.email || "anonymous",
      document_type: params.documentType,
      document_id: params.documentId,
      document_ref: params.documentRef || null,
      action: params.action,
      user_agent: typeof navigator !== "undefined" ? navigator.userAgent : null,
    });
  } catch (err) {
    // Non-blocking log failure
    console.warn("Document access logging error:", err);
  }
}

/**
 * Requests a short-lived, server-authorized URL for a stored mobile document.
 * The server resolves the file from the document id; callers never choose a bucket or path.
 */
export async function getAuthorizedMobileDocumentUrl(
  document: Pick<MobilePortalDocument, "id" | "category">
): Promise<string> {
  const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
  const accessToken = sessionData.session?.access_token;

  if (sessionError || !accessToken) {
    throw new Error("Your session has expired. Please sign in again.");
  }

  const params = new URLSearchParams({
    doc_id: document.id,
    doc_type: document.category,
  });
  const response = await fetch(`/api/mobile/download?${params.toString()}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
    cache: "no-store",
  });
  const payload = (await response.json()) as { download_url?: string; error?: string };

  if (!response.ok || !payload.download_url) {
    throw new Error(payload.error || "The document could not be opened.");
  }

  return payload.download_url;
}

/**
 * Loads full document with line items for responsive PDF preview.
 */
export async function fetchDocumentForPdf(category: MobileDocumentCategory, id: string): Promise<unknown> {
  if (category === "tax_invoice") {
    const [{ data: inv }, { data: items }] = await Promise.all([
      supabase.from("tax_invoices").select("*, customer:customers(*)").eq("id", id).single(),
      supabase.from("tax_invoice_items").select("*").eq("tax_invoice_id", id).order("sort_order"),
    ]);
    return { ...inv, items: items || [] };
  }

  if (category === "quotation") {
    const [{ data: quo }, { data: items }] = await Promise.all([
      supabase.from("quotations").select("*, customer:customers(*)").eq("id", id).single(),
      supabase.from("quotation_items").select("*").eq("quotation_id", id).order("sort_order"),
    ]);
    return { ...quo, items: items || [] };
  }

  if (category === "proforma") {
    const [{ data: pro }, { data: items }] = await Promise.all([
      supabase.from("proforma_invoices").select("*, customer:customers(*)").eq("id", id).single(),
      supabase.from("proforma_invoice_items").select("*").eq("proforma_invoice_id", id).order("sort_order"),
    ]);
    return { ...pro, items: items || [] };
  }

  if (category === "delivery_note") {
    const [{ data: dn }, { data: items }] = await Promise.all([
      supabase.from("delivery_notes").select("*, customer:customers(*)").eq("id", id).single(),
      supabase.from("delivery_note_items").select("*").eq("delivery_note_id", id).order("sort_order"),
    ]);
    return { ...dn, items: items || [] };
  }

  if (category === "purchase_order") {
    const [{ data: po }, { data: items }] = await Promise.all([
      supabase.from("purchase_orders").select("*, supplier:suppliers(*)").eq("id", id).single(),
      supabase.from("purchase_order_items").select("*").eq("purchase_order_id", id).order("sort_order"),
    ]);
    return { ...po, items: items || [] };
  }

  if (category === "supplier_bill") {
    const [{ data: bill }, { data: items }] = await Promise.all([
      supabase.from("supplier_bills").select("*, supplier:suppliers(*)").eq("id", id).single(),
      supabase.from("supplier_bill_items").select("*").eq("supplier_bill_id", id).order("sort_order"),
    ]);
    return { ...bill, items: items || [] };
  }

  if (category === "cheque") {
    const { data: chq } = await supabase
      .from("cheques")
      .select("*, customer:customers(*), supplier:suppliers(*)")
      .eq("id", id)
      .single();
    return chq;
  }

  return null;
}

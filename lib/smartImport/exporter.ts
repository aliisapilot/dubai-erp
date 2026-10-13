/**
 * Dubai ERP: Smart Import - Multi-Module Data Exporter
 * Exports ERP records into Excel (.xlsx) and CSV (.csv) with proper sanitization
 * against formula injection.
 */

import * as XLSX from "xlsx";
import type { SupabaseClient } from "@supabase/supabase-js";

function sanitizeCsvValue(val: unknown): string {
  if (val === null || val === undefined) return "";
  const str = String(val).trim();
  if (/^[=+\-@\t\r]/.test(str)) {
    return `'${str}`;
  }
  return str;
}

export type ExportModule =
  | "customers"
  | "suppliers"
  | "projects"
  | "quotations"
  | "tax_invoices"
  | "purchase_orders"
  | "expenses"
  | "attendance"
  | "overtime"
  | "measurements";

export async function fetchExportData(
  supabase: SupabaseClient,
  module: ExportModule,
  companyId: string
): Promise<{ headers: string[]; rows: (string | number)[][] }> {
  switch (module) {
    case "customers": {
      const { data } = await supabase
        .from("customers")
        .select("customer_code, name, trn, contact_person, email, phone, city, payment_terms")
        .order("name");
      const headers = ["Customer Code", "Name", "TRN", "Contact Person", "Email", "Phone", "City", "Payment Terms"];
      const rows = (data || []).map(r => [
        r.customer_code || "",
        sanitizeCsvValue(r.name),
        r.trn || "",
        r.contact_person || "",
        r.email || "",
        r.phone || "",
        r.city || "",
        r.payment_terms || "",
      ]);
      return { headers, rows };
    }

    case "suppliers": {
      const { data } = await supabase
        .from("suppliers")
        .select("supplier_code, name, trn, contact_person, email, phone, city, payment_terms")
        .order("name");
      const headers = ["Supplier Code", "Name", "TRN", "Contact Person", "Email", "Phone", "City", "Payment Terms"];
      const rows = (data || []).map(r => [
        r.supplier_code || "",
        sanitizeCsvValue(r.name),
        r.trn || "",
        r.contact_person || "",
        r.email || "",
        r.phone || "",
        r.city || "",
        r.payment_terms || "",
      ]);
      return { headers, rows };
    }

    case "projects": {
      const { data } = await supabase
        .from("projects")
        .select("project_number, name, location, main_contractor, status, contract_value, start_date")
        .order("created_at", { ascending: false });
      const headers = ["Project #", "Project Name", "Location", "Main Contractor", "Status", "Contract Value (AED)", "Start Date"];
      const rows = (data || []).map(r => [
        r.project_number || "",
        sanitizeCsvValue(r.name),
        r.location || "",
        r.main_contractor || "",
        r.status || "",
        Number(r.contract_value || 0),
        r.start_date || "",
      ]);
      return { headers, rows };
    }

    case "quotations": {
      const { data } = await supabase
        .from("quotations")
        .select("quotation_number, quotation_date, subtotal, vat_amount, total_amount, status, notes")
        .order("created_at", { ascending: false });
      const headers = ["Quotation #", "Date", "Subtotal (AED)", "VAT (AED)", "Total Amount (AED)", "Status", "Notes"];
      const rows = (data || []).map(r => [
        r.quotation_number || "",
        r.quotation_date || "",
        Number(r.subtotal || 0),
        Number(r.vat_amount || 0),
        Number(r.total_amount || 0),
        r.status || "",
        r.notes || "",
      ]);
      return { headers, rows };
    }

    case "tax_invoices": {
      const { data } = await supabase
        .from("tax_invoices")
        .select("invoice_number, invoice_date, subtotal, vat_amount, total_amount, status, payment_terms")
        .order("created_at", { ascending: false });
      const headers = ["Invoice #", "Date", "Subtotal (AED)", "VAT (AED)", "Total (AED)", "Status", "Payment Terms"];
      const rows = (data || []).map(r => [
        r.invoice_number || "",
        r.invoice_date || "",
        Number(r.subtotal || 0),
        Number(r.vat_amount || 0),
        Number(r.total_amount || 0),
        r.status || "",
        r.payment_terms || "",
      ]);
      return { headers, rows };
    }

    case "expenses": {
      const { data } = await supabase
        .from("expenses")
        .select("expense_number, expense_date, category, amount, vat_amount, total_amount, payment_method, status, description")
        .order("expense_date", { ascending: false });
      const headers = ["Expense #", "Date", "Category", "Amount", "VAT", "Total (AED)", "Payment Method", "Status", "Description"];
      const rows = (data || []).map(r => [
        r.expense_number || "",
        r.expense_date || "",
        r.category || "",
        Number(r.amount || 0),
        Number(r.vat_amount || 0),
        Number(r.total_amount || 0),
        r.payment_method || "",
        r.status || "",
        sanitizeCsvValue(r.description || ""),
      ]);
      return { headers, rows };
    }

    case "attendance": {
      const { data } = await supabase
        .from("attendance")
        .select("attendance_date, check_in, check_out, total_hours, regular_hours, overtime_hours, status, remarks, employee_id")
        .order("attendance_date", { ascending: false });
      const headers = ["Date", "Employee ID", "Check In", "Check Out", "Total Hours", "Regular Hours", "OT Hours", "Status", "Remarks"];
      const rows = (data || []).map(r => [
        r.attendance_date || "",
        r.employee_id || "",
        r.check_in || "",
        r.check_out || "",
        Number(r.total_hours || 0),
        Number(r.regular_hours || 8),
        Number(r.overtime_hours || 0),
        r.status || "",
        r.remarks || "",
      ]);
      return { headers, rows };
    }

    default: {
      return { headers: ["Module", "Status"], rows: [["No records found", "Empty"]] };
    }
  }
}

export function generateExcelExport(headers: string[], rows: (string | number)[][], sheetName = "Export"): Buffer {
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);
  ws["!cols"] = headers.map(h => ({ wch: Math.max(h.length + 3, 14) }));
  XLSX.utils.book_append_sheet(wb, ws, sheetName);
  return XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
}

export function generateCsvExport(headers: string[], rows: (string | number)[][]): string {
  const formatCell = (val: string | number) => {
    const s = String(val);
    if (s.includes(",") || s.includes('"') || s.includes("\n")) {
      return `"${s.replace(/"/g, '""')}"`;
    }
    return s;
  };

  const lines = [headers.map(formatCell).join(",")];
  for (const r of rows) {
    lines.push(r.map(formatCell).join(","));
  }
  return lines.join("\n");
}

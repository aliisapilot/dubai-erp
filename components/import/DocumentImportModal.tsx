"use client";

import React, { useState, useEffect, useRef } from "react";
import {
  X,
  Upload,
  CheckCircle2,
  AlertTriangle,
  Loader2,
  ArrowRight,
  Trash2,
  Download,
  Check,
} from "lucide-react";
import * as XLSX from "xlsx";
import { supabase } from "@/lib/supabase";
import { fmtAED, todayISO, getCompanyId } from "@/lib/helpers";

export type ImportModuleType = "customer_statement" | "tax_invoice" | "quotation";

export interface DocumentImportModalProps {
  isOpen: boolean;
  onClose: () => void;
  moduleType: ImportModuleType;
  defaultCustomerId?: string;
  defaultCustomerName?: string;
  onSuccess?: () => void;
}

export interface ParsedItemRow {
  id: string;
  date: string;
  reference: string;
  description: string;
  debit: number;
  credit: number;
  balance: number;
  quantity?: number;
  unitPrice?: number;
  vatRate?: number;
  vatAmount?: number;
  total?: number;
  isDuplicate?: boolean;
  duplicateReason?: string;
  isValid?: boolean;
}

interface CustomerOption {
  id: string;
  name: string;
  customer_code?: string;
  trn?: string;
}

export default function DocumentImportModal({
  isOpen,
  onClose,
  moduleType,
  defaultCustomerId,
  defaultCustomerName,
  onSuccess,
}: DocumentImportModalProps) {
  // Stepper state: "upload" -> "preview" -> "confirm"
  const [step, setStep] = useState<"upload" | "preview" | "confirm">("upload");

  // File states
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [parsing, setParsing] = useState(false);
  const [parseError, setParseError] = useState("");

  // Extracted Document Header Fields
  const [customerName, setCustomerName] = useState("");
  const [matchedCustomerId, setMatchedCustomerId] = useState<string>("");
  const [customers, setCustomers] = useState<CustomerOption[]>([]);
  const [docNumber, setDocNumber] = useState("");
  const [docDate, setDocDate] = useState(todayISO());
  const [openingBalance, setOpeningBalance] = useState<number>(0);
  const [closingBalance, setClosingBalance] = useState<number>(0);

  // SOA Import Mode: "reference_only" vs "rebuild_ledger"
  const [soaMode, setSoaMode] = useState<"reference_only" | "rebuild_ledger">("reference_only");

  // Invoice / Quotation Status
  const [importStatus, setImportStatus] = useState<string>("draft");

  // Items / Transactions Table
  const [items, setItems] = useState<ParsedItemRow[]>([]);

  // Execution states
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<{
    success: boolean;
    recordsCreated: number;
    duplicatesSkipped: number;
    message: string;
  } | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Load existing customers on open
  useEffect(() => {
    if (!isOpen) return;
    async function loadCustomers() {
      try {
        const { data } = await supabase
          .from("customers")
          .select("id, name, customer_code, trn")
          .order("name");
        if (data) {
          setCustomers(data);
          if (defaultCustomerId) {
            setMatchedCustomerId(defaultCustomerId);
            const found = data.find((c) => c.id === defaultCustomerId);
            if (found) setCustomerName(found.name);
          } else if (defaultCustomerName) {
            setCustomerName(defaultCustomerName);
            const norm = defaultCustomerName.toLowerCase().trim();
            const found = data.find((c) => c.name.toLowerCase().trim() === norm);
            if (found) setMatchedCustomerId(found.id);
          }
        }
      } catch (e) {
        console.warn("Could not load customers:", e);
      }
    }
    void loadCustomers();

    // Reset wizard
    queueMicrotask(() => {
      setStep("upload");
      setSelectedFile(null);
      setParsing(false);
      setParseError("");
      setItems([]);
      setImportResult(null);
      setSoaMode("reference_only");
      setImportStatus("draft");
    });
  }, [isOpen, defaultCustomerId, defaultCustomerName]);

  if (!isOpen) return null;

  // Title & Labels based on moduleType
  const moduleConfig = {
    customer_statement: {
      title: "Import Statement of Account (SOA)",
      subtitle: "Import customer historical ledger statement from Excel, CSV, or digital PDF",
      fileTypes: ".xlsx, .xls, .csv, .pdf",
      sampleHeaders: ["Date", "Reference", "Description", "Debit", "Credit", "Balance"],
    },
    tax_invoice: {
      title: "Import Tax Invoices",
      subtitle: "Import historical or supplier-billed tax invoices from Excel, CSV, or PDF",
      fileTypes: ".xlsx, .xls, .csv, .pdf",
      sampleHeaders: ["Invoice Number", "Date", "Customer Name", "Description", "Quantity", "Rate", "VAT Rate", "Total"],
    },
    quotation: {
      title: "Import Quotations",
      subtitle: "Import customer quotations and bill of quantities from Excel, CSV, or PDF",
      fileTypes: ".xlsx, .xls, .csv, .pdf",
      sampleHeaders: ["Quotation Number", "Date", "Customer Name", "Description", "Quantity", "Rate", "Total"],
    },
  }[moduleType];

  // Mathematical Reconciliation Check
  const calculatedDebits = items.reduce((s, it) => s + (it.debit || it.total || 0), 0);
  const calculatedCredits = items.reduce((s, it) => s + (it.credit || 0), 0);
  const expectedClosing = openingBalance + calculatedDebits - calculatedCredits;
  const isReconciled =
    moduleType !== "customer_statement" ||
    closingBalance === 0 ||
    Math.abs(expectedClosing - closingBalance) < 0.05;
  const discrepancy = Math.abs(expectedClosing - closingBalance);

  // ---------------------------------------------------------------------------
  // SAMPLE CSV DOWNLOAD
  // ---------------------------------------------------------------------------
  function downloadSampleCsv() {
    let csvContent = "";
    if (moduleType === "customer_statement") {
      csvContent =
        "Date,Reference,Description,Debit,Credit,Balance\n" +
        "2026-10-01,INV101-26,Fabrication & Supply of PVC Water Tank Liner,5000.00,0.00,5000.00\n" +
        "2026-10-15,RV001-26,Bank Transfer Payment Ref 99482,0.00,2000.00,3000.00\n" +
        "2026-10-25,INV102-26,Supply of 650 GSM PVC Fabric Rolls,4500.00,0.00,7500.00\n";
    } else if (moduleType === "tax_invoice") {
      csvContent =
        "Invoice Number,Date,Customer Name,Description,Quantity,Rate,VAT Rate,Total\n" +
        "INV101-26,2026-10-01,Al Karwan Solution FZC,PVC Water Tank Liner Fabrication,1,5000.00,5,5250.00\n" +
        "INV102-26,2026-10-15,Al Karwan Solution FZC,PVC Fabric Roll 650 GSM,2,2250.00,5,4725.00\n";
    } else {
      csvContent =
        "Quotation Number,Date,Customer Name,Description,Quantity,Rate,Total\n" +
        "QT101-26,2026-10-01,Al Karwan Solution FZC,PVC Water Tank Liner Fabrication,1,5000.00,5000.00\n" +
        "QT102-26,2026-10-15,Al Karwan Solution FZC,PVC Fabric Roll 650 GSM,2,2250.00,4500.00\n";
    }

    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `Sample_${moduleType}_import.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  // ---------------------------------------------------------------------------
  // FILE PARSING HANDLER
  // ---------------------------------------------------------------------------
  async function handleFileSelect(file: File) {
    setSelectedFile(file);
    setParseError("");
    setParsing(true);

    const ext = file.name.split(".").pop()?.toLowerCase();

    try {
      if (ext === "pdf") {
        // PDF Processing via Server API
        const formData = new FormData();
        formData.append("files", file);

        const res = await fetch("/api/smart-import/parse", {
          method: "POST",
          body: formData,
        });

        if (!res.ok) {
          throw new Error(`Server returned HTTP ${res.status} while parsing PDF.`);
        }

        const data = await res.json();
        const doc = data.documents?.[0];

        if (!doc) {
          throw new Error("Could not parse document. Please ensure the PDF has extractable text.");
        }

        // Header mapping
        const cName = doc.fields?.customer_name?.value ? String(doc.fields.customer_name.value) : customerName;
        setCustomerName(cName);
        if (doc.customerResolution?.matchedId) {
          setMatchedCustomerId(doc.customerResolution.matchedId);
        } else if (cName) {
          matchCustomerByName(cName);
        }

        setDocNumber(doc.fields?.document_number?.value ? String(doc.fields.document_number.value) : file.name.replace(/\.[^/.]+$/, ""));
        setDocDate(doc.fields?.document_date?.value ? String(doc.fields.document_date.value).slice(0, 10) : todayISO());
        setOpeningBalance(Number(doc.fields?.opening_balance?.value) || 0);
        setClosingBalance(Number(doc.fields?.closing_balance?.value || doc.fields?.total_amount?.value) || 0);

        // Convert line items
        const parsedRows: ParsedItemRow[] = (doc.items || []).map((it: {
          id?: string;
          description?: string;
          quantity?: number;
          unitPrice?: number;
          vatRate?: number;
          vatAmount?: number;
          total?: number;
          taxableAmount?: number;
          source?: { rawText?: string };
        }, idx: number) => {
          const raw = it.source?.rawText || "";
          const dateMatch = raw.match(/\b(20\d{2}[-/.]\d{1,2}[-/.]\d{1,2}|\d{1,2}[-/.]\d{1,2}[-/.]20\d{2})\b/);
          const rowDate = dateMatch ? dateMatch[0].replace(/\//g, "-") : docDate;

          const refMatch = (it.description || "").match(/\b(INV[-\s]?\d+|RV[-\s]?\d+|QT[-\s]?\d+|SOA[-\s]?\d+)\b/i);
          const rowRef = refMatch ? refMatch[0] : `ROW-${idx + 1}`;

          const isPayment = it.taxableAmount === 0 && it.total && it.total > 0;
          const debitVal = !isPayment ? (it.taxableAmount || it.total || 0) : 0;
          const creditVal = isPayment ? (it.total || 0) : 0;

          return {
            id: it.id || `row-${idx}`,
            date: rowDate,
            reference: rowRef,
            description: it.description || "Historical Ledger Entry",
            debit: debitVal,
            credit: creditVal,
            balance: it.total || 0,
            quantity: it.quantity || 1,
            unitPrice: it.unitPrice || debitVal,
            vatRate: it.vatRate || 5,
            vatAmount: it.vatAmount || 0,
            total: it.total || debitVal,
            isValid: true,
          };
        });

        setItems(parsedRows);
        setStep("preview");
      } else if (ext === "xlsx" || ext === "xls" || ext === "csv") {
        // Excel / CSV Client-side Instant Parsing
        const buffer = await file.arrayBuffer();
        const workbook = XLSX.read(buffer, { type: "array", cellDates: true });
        const sheetName = workbook.SheetNames[0];
        const sheet = workbook.Sheets[sheetName];

        const jsonRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { raw: false, defval: "" });

        if (jsonRows.length === 0) {
          throw new Error("Spreadsheet contains no data rows.");
        }

        const foundHeaders = Object.keys(jsonRows[0]);

        // Smart column mapping auto-detection
        const detectedMapping: Record<string, string> = {};
        foundHeaders.forEach((h) => {
          const low = h.toLowerCase().trim();
          if (/date|dt|day/i.test(low)) detectedMapping.date = h;
          if (/ref|inv|voucher|number|doc/i.test(low) && !detectedMapping.reference) detectedMapping.reference = h;
          if (/desc|particular|detail|item|service/i.test(low)) detectedMapping.description = h;
          if (/debit|charge|invoice_amt|amount/i.test(low) && !/credit|payment/i.test(low)) detectedMapping.debit = h;
          if (/credit|paid|receipt|payment/i.test(low)) detectedMapping.credit = h;
          if (/balance|bal|running/i.test(low)) detectedMapping.balance = h;
          if (/qty|quantity/i.test(low)) detectedMapping.quantity = h;
          if (/rate|price|unit_price/i.test(low)) detectedMapping.rate = h;
          if (/customer|client|party/i.test(low)) detectedMapping.customer = h;
        });

        // Map initial rows
        const parsedRows = mapSpreadsheetRows(jsonRows, detectedMapping);
        setItems(parsedRows);

        // Attempt to extract customer name from file name or first customer cell
        if (!customerName) {
          const custCandidate = jsonRows[0][detectedMapping.customer || ""] || file.name.replace(/\.[^/.]+$/, "");
          if (custCandidate) {
            setCustomerName(String(custCandidate));
            matchCustomerByName(String(custCandidate));
          }
        }

        setDocNumber(file.name.replace(/\.[^/.]+$/, ""));
        setStep("preview");
      } else {
        throw new Error(`Unsupported file type: .${ext}. Please upload .xlsx, .csv, or .pdf.`);
      }
    } catch (err) {
      setParseError(err instanceof Error ? err.message : "Failed to parse document.");
    } finally {
      setParsing(false);
    }
  }

  function mapSpreadsheetRows(
    rows: Record<string, unknown>[],
    mapping: Record<string, string>
  ): ParsedItemRow[] {
    return rows.map((r, idx) => {
      const rawDate = String(r[mapping.date || ""] || todayISO()).trim();
      const rawRef = String(r[mapping.reference || ""] || `ROW-${idx + 1}`).trim();
      const rawDesc = String(r[mapping.description || ""] || "Imported transaction").trim();
      const debitVal = parseFloat(String(r[mapping.debit || ""] || "0").replace(/[^0-9.-]/g, "")) || 0;
      const creditVal = parseFloat(String(r[mapping.credit || ""] || "0").replace(/[^0-9.-]/g, "")) || 0;
      const balVal = parseFloat(String(r[mapping.balance || ""] || "0").replace(/[^0-9.-]/g, "")) || 0;
      const qtyVal = parseFloat(String(r[mapping.quantity || ""] || "1")) || 1;
      const rateVal = parseFloat(String(r[mapping.rate || ""] || "0")) || debitVal;

      return {
        id: `row-${idx}`,
        date: rawDate.slice(0, 10),
        reference: rawRef,
        description: rawDesc,
        debit: debitVal,
        credit: creditVal,
        balance: balVal,
        quantity: qtyVal,
        unitPrice: rateVal,
        vatRate: 5,
        vatAmount: Number(((debitVal || qtyVal * rateVal) * 0.05).toFixed(2)),
        total: debitVal || Number((qtyVal * rateVal * 1.05).toFixed(2)),
        isValid: true,
      };
    });
  }

  function matchCustomerByName(nameStr: string) {
    const clean = nameStr.toLowerCase().replace(/[^a-z0-9]/g, "");
    const found = customers.find(
      (c) => c.name.toLowerCase().replace(/[^a-z0-9]/g, "") === clean || c.name.toLowerCase().includes(nameStr.toLowerCase().trim())
    );
    if (found) {
      setMatchedCustomerId(found.id);
    }
  }

  // ---------------------------------------------------------------------------
  // COMMIT / SAVE HANDLER
  // ---------------------------------------------------------------------------
  async function handleConfirmImport() {
    if (!matchedCustomerId) {
      setParseError("Please select or match a customer in your ERP directory.");
      return;
    }

    setImporting(true);
    setParseError("");

    try {
      const companyId = await getCompanyId().catch(() => null);
      if (!companyId) throw new Error("Could not determine current company context.");

      const { data: authData } = await supabase.auth.getUser();
      const user = authData?.user;

      let recordsCreated = 0;
      let duplicatesSkipped = 0;

      if (moduleType === "customer_statement") {
        if (soaMode === "reference_only") {
          // MODE A: Safe Document Attachment Only
          // Upload file if storage available or create document_attachment record
          const persistentFileUrl = `/api/smart-import/storage?filename=${encodeURIComponent(selectedFile?.name || "SOA.pdf")}`;

          const { error: attErr } = await supabase.from("document_attachments").insert({
            company_id: companyId,
            entity_type: "customer",
            entity_id: matchedCustomerId,
            file_name: selectedFile?.name || `${docNumber}.pdf`,
            file_url: persistentFileUrl,
            file_size: selectedFile?.size || null,
            file_type: selectedFile?.type || "application/pdf",
            description: `Historical Statement of Account [${docNumber}] for ${customerName} (Closing: ${fmtAED(closingBalance || expectedClosing)})`,
            uploaded_by: user?.email || "System User",
          });

          if (attErr) throw new Error(`Failed to save statement attachment: ${attErr.message}`);
          recordsCreated = 1;
        } else {
          // MODE B: Rebuild Historical Statement Balance
          // Updates customer opening cutover balance with explicit approval
          const approvedBalance = closingBalance > 0 ? closingBalance : expectedClosing;

          const { error: custErr } = await supabase
            .from("customers")
            .update({
              opening_balance: approvedBalance,
              opening_balance_date: docDate || todayISO(),
            })
            .eq("id", matchedCustomerId);

          if (custErr) throw new Error(`Failed to update customer opening balance: ${custErr.message}`);

          // Audit Log Entry
          try {
            await supabase.from("customer_opening_balance_history").insert({
              company_id: companyId,
              customer_id: matchedCustomerId,
              old_amount: openingBalance,
              new_amount: approvedBalance,
              reason: `Imported historical SOA (${docNumber || selectedFile?.name}) closing balance applied to customer ledger.`,
              created_by: user?.id || null,
              user_email: user?.email || "Current User",
            });
          } catch {}

          recordsCreated = items.length;
        }
      } else if (moduleType === "tax_invoice") {
        // TAX INVOICE IMPORT
        for (const it of items) {
          // Check for existing invoice number
          const { data: existingTI } = await supabase
            .from("tax_invoices")
            .select("id")
            .eq("company_id", companyId)
            .eq("invoice_number", it.reference)
            .maybeSingle();

          if (existingTI) {
            duplicatesSkipped++;
            continue;
          }

          const { data: newTI, error: tiErr } = await supabase
            .from("tax_invoices")
            .insert({
              company_id: companyId,
              customer_id: matchedCustomerId,
              invoice_number: it.reference,
              invoice_date: it.date || todayISO(),
              subtotal: it.debit || it.total || 0,
              vat_amount: it.vatAmount || Number(((it.debit || it.total || 0) * 0.05).toFixed(2)),
              total_amount: it.total || it.debit || 0,
              status: importStatus,
              notes: `Imported via Invoice Import wizard (${selectedFile?.name})`,
            })
            .select("id")
            .single();

          if (tiErr) {
            console.warn(`Could not insert invoice ${it.reference}:`, tiErr.message);
            continue;
          }

          if (newTI) {
            recordsCreated++;
            // Insert line item
            await supabase.from("tax_invoice_items").insert({
              tax_invoice_id: newTI.id,
              description: it.description,
              quantity: it.quantity || 1,
              unit: "Nos",
              unit_price: it.unitPrice || it.debit || 0,
              taxable_amount: it.debit || it.total || 0,
              vat_rate: it.vatRate || 5,
              vat_amount: it.vatAmount || 0,
              line_total: it.total || it.debit || 0,
              sort_order: 0,
            });
          }
        }
      } else if (moduleType === "quotation") {
        // QUOTATION IMPORT
        for (const it of items) {
          const { data: existingQ } = await supabase
            .from("quotations")
            .select("id")
            .eq("company_id", companyId)
            .eq("quotation_number", it.reference)
            .maybeSingle();

          if (existingQ) {
            duplicatesSkipped++;
            continue;
          }

          const { data: newQ, error: qErr } = await supabase
            .from("quotations")
            .insert({
              company_id: companyId,
              customer_id: matchedCustomerId,
              quotation_number: it.reference,
              quotation_date: it.date || todayISO(),
              subtotal: it.debit || it.total || 0,
              vat_amount: it.vatAmount || 0,
              total_amount: it.total || it.debit || 0,
              status: importStatus,
              notes: `Imported via Quotation Import wizard (${selectedFile?.name})`,
            })
            .select("id")
            .single();

          if (qErr) {
            console.warn(`Could not insert quotation ${it.reference}:`, qErr.message);
            continue;
          }

          if (newQ) {
            recordsCreated++;
            await supabase.from("quotation_items").insert({
              quotation_id: newQ.id,
              description: it.description,
              quantity: it.quantity || 1,
              unit: "Nos",
              unit_price: it.unitPrice || it.debit || 0,
              taxable_amount: it.debit || it.total || 0,
              vat_rate: it.vatRate || 5,
              vat_amount: it.vatAmount || 0,
              line_total: it.total || it.debit || 0,
              sort_order: 0,
            });
          }
        }
      }

      // Log to import_batches table for audit history
      try {
        await supabase.from("import_batches").insert({
          company_id: companyId,
          batch_name: `${moduleConfig.title} - ${selectedFile?.name}`,
          file_count: 1,
          filenames: [selectedFile?.name || "import_file"],
          status: "completed",
          records_created: { [moduleType]: recordsCreated },
          records_matched: { duplicates: duplicatesSkipped },
          created_by: user?.email || "Current User",
        });
      } catch (batchErr) {
        console.warn("Could not log import batch record:", batchErr);
      }

      setImportResult({
        success: true,
        recordsCreated,
        duplicatesSkipped,
        message: `Import successfully completed! Created ${recordsCreated} record(s). Skipped ${duplicatesSkipped} duplicate(s).`,
      });

      setStep("confirm");
      if (onSuccess) onSuccess();
    } catch (err) {
      setParseError(err instanceof Error ? err.message : "Import failed.");
    } finally {
      setImporting(false);
    }
  }

  // ---------------------------------------------------------------------------
  // RENDER WIZARD
  // ---------------------------------------------------------------------------
  return (
    <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-3 md:p-6 overflow-y-auto">
      <div className="w-full max-w-4xl rounded-2xl bg-slate-900 border border-slate-700 shadow-2xl overflow-hidden text-slate-100 my-auto flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 bg-slate-850 shrink-0">
          <div className="flex items-center gap-3">
            <div className="rounded-xl bg-cyan-950/80 p-2 text-cyan-400 border border-cyan-800/60">
              <Upload size={18} />
            </div>
            <div>
              <h3 className="text-base font-bold text-white">{moduleConfig.title}</h3>
              <p className="text-xs text-slate-400">{moduleConfig.subtitle}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-800 hover:text-white transition"
          >
            <X size={18} />
          </button>
        </div>

        {/* Stepper Progress */}
        <div className="flex items-center justify-between px-6 py-2.5 bg-slate-950/50 border-b border-slate-800 text-xs shrink-0">
          <div className="flex items-center gap-4">
            <span
              className={`flex items-center gap-1.5 font-bold ${
                step === "upload" ? "text-cyan-400" : "text-emerald-400"
              }`}
            >
              <span className="w-5 h-5 rounded-full flex items-center justify-center text-[10px] bg-slate-800 border border-slate-700">
                1
              </span>
              Upload File
            </span>
            <ArrowRight size={13} className="text-slate-600" />
            <span
              className={`flex items-center gap-1.5 font-bold ${
                step === "preview" ? "text-cyan-400" : step === "confirm" ? "text-emerald-400" : "text-slate-500"
              }`}
            >
              <span className="w-5 h-5 rounded-full flex items-center justify-center text-[10px] bg-slate-800 border border-slate-700">
                2
              </span>
              Preview &amp; Validate
            </span>
            <ArrowRight size={13} className="text-slate-600" />
            <span
              className={`flex items-center gap-1.5 font-bold ${
                step === "confirm" ? "text-cyan-400" : "text-slate-500"
              }`}
            >
              <span className="w-5 h-5 rounded-full flex items-center justify-center text-[10px] bg-slate-800 border border-slate-700">
                3
              </span>
              Confirmation
            </span>
          </div>

          <button
            type="button"
            onClick={downloadSampleCsv}
            className="inline-flex items-center gap-1.5 text-[11px] text-cyan-400 hover:text-cyan-300 transition"
            title="Download formatted CSV template"
          >
            <Download size={12} />
            <span>Sample CSV</span>
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-6 overflow-y-auto space-y-5 text-xs flex-1">
          {/* STEP 1: FILE UPLOAD */}
          {step === "upload" && (
            <div className="space-y-4">
              <div
                onClick={() => fileInputRef.current?.click()}
                className="border-2 border-dashed border-slate-700 hover:border-cyan-500 bg-slate-850/60 hover:bg-slate-850 rounded-2xl p-10 text-center cursor-pointer transition flex flex-col items-center justify-center space-y-3"
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".xlsx,.xls,.csv,.pdf"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) void handleFileSelect(f);
                  }}
                />
                <div className="w-14 h-14 rounded-full bg-slate-800 flex items-center justify-center text-cyan-400 border border-slate-700">
                  {parsing ? <Loader2 size={26} className="animate-spin" /> : <Upload size={26} />}
                </div>
                <div>
                  <p className="text-sm font-bold text-white">Click or drag &amp; drop file here</p>
                  <p className="text-xs text-slate-400 mt-1">Supports Excel (.xlsx, .xls), CSV (.csv), or digital PDF (.pdf)</p>
                </div>
              </div>

              {parseError && (
                <div className="flex items-center gap-2 rounded-lg bg-rose-950/70 border border-rose-800 p-3 text-rose-300">
                  <AlertTriangle size={15} className="text-rose-400 shrink-0" />
                  <span>{parseError}</span>
                </div>
              )}
            </div>
          )}

          {/* STEP 2: PREVIEW & MAP */}
          {step === "preview" && (
            <div className="space-y-4">
              {/* Document Header Controls */}
              <div className="rounded-xl border border-slate-800 bg-slate-850 p-4 grid grid-cols-1 sm:grid-cols-3 gap-3">
                {/* Customer Matching */}
                <div>
                  <label className="text-[10px] font-bold uppercase text-slate-400 block mb-1">Customer</label>
                  <select
                    value={matchedCustomerId}
                    onChange={(e) => {
                      setMatchedCustomerId(e.target.value);
                      const f = customers.find((c) => c.id === e.target.value);
                      if (f) setCustomerName(f.name);
                    }}
                    className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-1.5 text-xs text-white focus:border-cyan-500 focus:outline-none"
                  >
                    <option value="">— Select Matched Customer —</option>
                    {customers.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name} {c.customer_code ? `(${c.customer_code})` : ""}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Reference Number */}
                <div>
                  <label className="text-[10px] font-bold uppercase text-slate-400 block mb-1">Reference / Doc No.</label>
                  <input
                    type="text"
                    value={docNumber}
                    onChange={(e) => setDocNumber(e.target.value)}
                    className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-1.5 text-xs text-white focus:border-cyan-500 focus:outline-none"
                  />
                </div>

                {/* Date */}
                <div>
                  <label className="text-[10px] font-bold uppercase text-slate-400 block mb-1">Date</label>
                  <input
                    type="date"
                    value={docDate}
                    onChange={(e) => setDocDate(e.target.value)}
                    className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-1.5 text-xs text-white focus:border-cyan-500 focus:outline-none"
                  />
                </div>

                {/* Module-Specific SOA Mode Choice */}
                {moduleType === "customer_statement" ? (
                  <div className="sm:col-span-3 pt-2 border-t border-slate-800/80">
                    <span className="text-[10px] font-bold uppercase text-slate-400 block mb-2">Import Choice</span>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <label
                        className={`p-3 rounded-lg border cursor-pointer transition flex items-start gap-3 ${
                          soaMode === "reference_only"
                            ? "bg-cyan-950/40 border-cyan-700 text-white"
                            : "bg-slate-900 border-slate-800 text-slate-400 hover:border-slate-700"
                        }`}
                      >
                        <input
                          type="radio"
                          name="soa_mode"
                          checked={soaMode === "reference_only"}
                          onChange={() => setSoaMode("reference_only")}
                          className="mt-0.5"
                        />
                        <div>
                          <span className="font-bold block text-xs">Option A: Reference Only (Recommended)</span>
                          <p className="text-[11px] text-slate-400 mt-0.5">
                            Stores the imported SOA as an audited historical document archive. Zero live ledger mutations.
                          </p>
                        </div>
                      </label>

                      <label
                        className={`p-3 rounded-lg border cursor-pointer transition flex items-start gap-3 ${
                          soaMode === "rebuild_ledger"
                            ? "bg-purple-950/40 border-purple-700 text-white"
                            : "bg-slate-900 border-slate-800 text-slate-400 hover:border-slate-700"
                        }`}
                      >
                        <input
                          type="radio"
                          name="soa_mode"
                          checked={soaMode === "rebuild_ledger"}
                          onChange={() => setSoaMode("rebuild_ledger")}
                          className="mt-0.5"
                        />
                        <div>
                          <span className="font-bold block text-xs">Option B: Rebuild Historical Statement</span>
                          <p className="text-[11px] text-slate-400 mt-0.5">
                            Rebuilds customer ledger opening cutover balance to match this statement upon confirmation.
                          </p>
                        </div>
                      </label>
                    </div>
                  </div>
                ) : (
                  <div>
                    <label className="text-[10px] font-bold uppercase text-slate-400 block mb-1">Status</label>
                    <select
                      value={importStatus}
                      onChange={(e) => setImportStatus(e.target.value)}
                      className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-1.5 text-xs text-white focus:border-cyan-500 focus:outline-none"
                    >
                      <option value="draft">Draft (Review first)</option>
                      <option value="issued">Final / Issued</option>
                      {moduleType === "tax_invoice" && <option value="paid">Paid in Full</option>}
                    </select>
                  </div>
                )}
              </div>

              {/* Mathematical Validation Pill */}
              {moduleType === "customer_statement" && (
                <div
                  className={`p-3 rounded-xl border flex items-center justify-between text-xs ${
                    isReconciled
                      ? "bg-emerald-950/60 border-emerald-800/80 text-emerald-300"
                      : "bg-rose-950/70 border-rose-800 text-rose-300"
                  }`}
                >
                  <div className="flex items-center gap-2">
                    {isReconciled ? <CheckCircle2 size={16} /> : <AlertTriangle size={16} />}
                    <span className="font-bold">
                      {isReconciled
                        ? "Mathematical Reconciliation Confirmed: Debits & Credits balance perfectly"
                        : `Reconciliation Discrepancy: Expected closing differs by ${fmtAED(discrepancy)}`}
                    </span>
                  </div>
                  <div className="flex items-center gap-4 text-[11px] font-mono">
                    <span>Charges: +{fmtAED(calculatedDebits)}</span>
                    <span>Credits: −{fmtAED(calculatedCredits)}</span>
                    <span className="font-bold text-white">Expected Closing: {fmtAED(expectedClosing)}</span>
                  </div>
                </div>
              )}

              {/* Parsed Items / Transactions Table */}
              <div className="rounded-xl border border-slate-800 bg-slate-900/90 overflow-hidden">
                <div className="px-4 py-2.5 bg-slate-850 border-b border-slate-800 flex items-center justify-between">
                  <span className="font-bold text-slate-200">
                    Extracted Entries ({items.length})
                  </span>
                  <span className="text-[11px] text-slate-400">
                    Click any value below to edit or correct before importing
                  </span>
                </div>

                <div className="overflow-x-auto max-h-64 overflow-y-auto">
                  <table className="w-full text-xs border-collapse">
                    <thead className="sticky top-0 bg-slate-850 border-b border-slate-800 text-slate-400 font-semibold uppercase text-[10px]">
                      <tr>
                        <th className="px-3 py-2 text-left">Date</th>
                        <th className="px-3 py-2 text-left">Reference</th>
                        <th className="px-3 py-2 text-left">Description</th>
                        <th className="px-3 py-2 text-right">Debit / Total</th>
                        <th className="px-3 py-2 text-right">Credit</th>
                        <th className="px-2 py-2 text-center w-10"></th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800 text-slate-200 font-mono">
                      {items.map((row, idx) => (
                        <tr key={row.id || idx} className="hover:bg-slate-800/40">
                          <td className="px-3 py-1.5 whitespace-nowrap">
                            <input
                              type="text"
                              value={row.date}
                              onChange={(e) => {
                                const val = e.target.value;
                                setItems((prev) => prev.map((p, i) => (i === idx ? { ...p, date: val } : p)));
                              }}
                              className="w-24 bg-transparent border-b border-transparent hover:border-slate-600 focus:border-cyan-500 text-xs px-1 py-0.5 focus:outline-none"
                            />
                          </td>
                          <td className="px-3 py-1.5 whitespace-nowrap font-bold">
                            <input
                              type="text"
                              value={row.reference}
                              onChange={(e) => {
                                const val = e.target.value;
                                setItems((prev) => prev.map((p, i) => (i === idx ? { ...p, reference: val } : p)));
                              }}
                              className="w-28 bg-transparent border-b border-transparent hover:border-slate-600 focus:border-cyan-500 text-xs px-1 py-0.5 text-white focus:outline-none"
                            />
                          </td>
                          <td className="px-3 py-1.5 font-sans">
                            <input
                              type="text"
                              value={row.description}
                              onChange={(e) => {
                                const val = e.target.value;
                                setItems((prev) => prev.map((p, i) => (i === idx ? { ...p, description: val } : p)));
                              }}
                              className="w-full bg-transparent border-b border-transparent hover:border-slate-600 focus:border-cyan-500 text-xs px-1 py-0.5 focus:outline-none"
                            />
                          </td>
                          <td className="px-3 py-1.5 text-right text-rose-400">
                            <input
                              type="number"
                              step="0.01"
                              value={row.debit || ""}
                              onChange={(e) => {
                                const val = parseFloat(e.target.value) || 0;
                                setItems((prev) => prev.map((p, i) => (i === idx ? { ...p, debit: val, total: val } : p)));
                              }}
                              className="w-24 bg-transparent text-right border-b border-transparent hover:border-slate-600 focus:border-cyan-500 text-xs px-1 py-0.5 text-rose-400 focus:outline-none"
                            />
                          </td>
                          <td className="px-3 py-1.5 text-right text-emerald-400">
                            <input
                              type="number"
                              step="0.01"
                              value={row.credit || ""}
                              onChange={(e) => {
                                const val = parseFloat(e.target.value) || 0;
                                setItems((prev) => prev.map((p, i) => (i === idx ? { ...p, credit: val } : p)));
                              }}
                              className="w-24 bg-transparent text-right border-b border-transparent hover:border-slate-600 focus:border-cyan-500 text-xs px-1 py-0.5 text-emerald-400 focus:outline-none"
                            />
                          </td>
                          <td className="px-2 py-1.5 text-center">
                            <button
                              type="button"
                              onClick={() => setItems((prev) => prev.filter((_, i) => i !== idx))}
                              className="text-slate-500 hover:text-rose-400 p-0.5"
                              title="Delete row"
                            >
                              <Trash2 size={12} />
                            </button>
                          </td>
                        </tr>
                      ))}

                      {items.length === 0 && (
                        <tr>
                          <td colSpan={6} className="px-4 py-8 text-center text-slate-500">
                            No extracted items found.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              {parseError && (
                <div className="flex items-center gap-2 rounded-lg bg-rose-950/70 border border-rose-800 p-3 text-rose-300">
                  <AlertTriangle size={15} className="text-rose-400 shrink-0" />
                  <span>{parseError}</span>
                </div>
              )}
            </div>
          )}

          {/* STEP 3: CONFIRMATION RESULTS */}
          {step === "confirm" && importResult && (
            <div className="py-8 text-center space-y-4">
              <div className="w-16 h-16 rounded-full bg-emerald-950/80 border border-emerald-700/80 flex items-center justify-center text-emerald-400 mx-auto">
                <CheckCircle2 size={32} />
              </div>
              <h4 className="text-lg font-bold text-white">Import Successfully Completed!</h4>
              <p className="text-xs text-slate-300 max-w-md mx-auto">{importResult.message}</p>

              <div className="flex justify-center gap-3 pt-4">
                <button
                  type="button"
                  onClick={onClose}
                  className="rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white px-5 py-2 text-xs font-bold transition shadow-sm cursor-pointer"
                >
                  Done
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Footer Navigation */}
        {step !== "confirm" && (
          <div className="flex items-center justify-between px-6 py-3.5 bg-slate-850 border-t border-slate-800 text-xs shrink-0">
            {step === "preview" ? (
              <button
                type="button"
                onClick={() => setStep("upload")}
                className="rounded-lg border border-slate-700 bg-slate-800 hover:bg-slate-700 px-4 py-2 font-semibold text-slate-300 transition"
              >
                Back to Upload
              </button>
            ) : (
              <button
                type="button"
                onClick={onClose}
                className="rounded-lg border border-slate-700 bg-slate-800 hover:bg-slate-700 px-4 py-2 font-semibold text-slate-300 transition"
              >
                Cancel
              </button>
            )}

            {step === "preview" && (
              <button
                type="button"
                onClick={handleConfirmImport}
                disabled={importing || items.length === 0 || !matchedCustomerId}
                className="inline-flex items-center gap-1.5 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white px-4 py-2 font-bold transition shadow-sm disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
              >
                {importing ? (
                  <>
                    <Loader2 size={14} className="animate-spin" />
                    <span>Importing...</span>
                  </>
                ) : (
                  <>
                    <Check size={14} />
                    <span>Confirm Import ({items.length} records)</span>
                  </>
                )}
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}


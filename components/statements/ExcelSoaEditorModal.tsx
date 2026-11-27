"use client";

import React, { useState, useEffect, useRef } from "react";
import {
  X,
  Plus,
  Trash2,
  Undo,
  Redo,
  Clipboard,
  CheckCircle2,
  AlertTriangle,
  Loader2,
  Eye,
  EyeOff,
  Download,
  Save,
  ShieldCheck,
  ZoomIn,
  ZoomOut,
  Maximize2,
  Upload,
  GitCompare,
  Printer,
  Share2,
} from "lucide-react";
import { supabase } from "@/lib/supabase";
import type { CustomerCandidate, StoredSoaRecord } from "@/lib/soaManager";
import type { RawHistoricalEntry, RawInvoice, RawReceiptVoucher, StatementData } from "@/lib/customerStatementEngine";
import { getExportSoaPdfFilename } from "@/lib/soaManager";
import { clearPdfCache, exportDocumentToPdf } from "@/lib/exportDocumentPdf";
import type { CompanyDocInfo } from "@/components/documents/DocHeader";
import StatementOfAccountTemplate from "@/components/documents/StatementOfAccountTemplate";

interface ExcelSoaEditorModalProps {
  isOpen: boolean;
  onClose: () => void;
  record: StoredSoaRecord | null;
  customers: CustomerCandidate[];
  companyInfo?: CompanyDocInfo | null;
  liveStatement?: StatementData | null;
  onSaved: (savedCustomerId?: string) => void;
}

let rowIdCounter = 0;
function createRowId(prefix = "row"): string {
  rowIdCounter++;
  return `${prefix}_${rowIdCounter}_${Date.now()}`;
}

function parseNum(raw: unknown): number {
  if (typeof raw === "number") return Number.isFinite(raw) ? Math.round(raw * 100) / 100 : 0;
  if (raw == null) return 0;
  const cleaned = String(raw).replace(/[^0-9.-]/g, "");
  const n = parseFloat(cleaned);
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : 0;
}

export default function ExcelSoaEditorModal(props: ExcelSoaEditorModalProps) {
  if (!props.isOpen || !props.record) return null;
  return <ExcelSoaEditorModalContent key={props.record.id} {...props} record={props.record} />;
}

function ExcelSoaEditorModalContent({
  onClose,
  record,
  customers,
  companyInfo,
  liveStatement,
  onSaved,
}: {
  isOpen: boolean;
  onClose: () => void;
  record: StoredSoaRecord;
  customers: CustomerCandidate[];
  companyInfo?: CompanyDocInfo | null;
  liveStatement?: StatementData | null;
  onSaved: (savedCustomerId?: string) => void;
}) {
  const [customerId, setCustomerId] = useState(record.customer_id || "");
  const [soaNumber, setSoaNumber] = useState(record.soa_number || "");
  const [statementDate, setStatementDate] = useState(record.statement_date || "");
  const [openingBalance, setOpeningBalance] = useState(Number(record.opening_balance) || 0);
  const [pdfClosingInput, setPdfClosingInput] = useState<string>(
    record.closing_balance !== null && record.closing_balance !== undefined
      ? String(record.closing_balance)
      : ""
  );
  const [entries, setEntries] = useState<RawHistoricalEntry[]>(
    record.entries ? JSON.parse(JSON.stringify(record.entries)) : []
  );

  // Layout & View toggles
  const [showPdfPreview, setShowPdfPreview] = useState(true);
  const [mobileTab, setMobileTab] = useState<"table" | "pdf">("table");
  const [isFullScreenTable, setIsFullScreenTable] = useState(false);
  const [pdfZoom, setPdfZoom] = useState(100);

  // PDF Loading & Signed URL state
  const [pdfBlobUrl, setPdfBlobUrl] = useState<string>("");
  const [pdfLoading, setPdfLoading] = useState(false);
  const [pdfError, setPdfError] = useState("");
  const [replacingFile, setReplacingFile] = useState(false);

  // Undo / Redo & Excel Paste
  const [undoStack, setUndoStack] = useState<RawHistoricalEntry[][]>([]);
  const [redoStack, setRedoStack] = useState<RawHistoricalEntry[][]>([]);
  const [pastePromptOpen, setPastePromptOpen] = useState(false);
  const [rawPasteText, setRawPasteText] = useState("");

  // Validation & Discrepancies
  const [validationAlert, setValidationAlert] = useState<{
    valid: boolean;
    difference: number;
    message: string;
  } | null>(null);
  const [confirmZeroTransactions, setConfirmZeroTransactions] = useState(false);

  // Save states
  const [saving, setSaving] = useState(false);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [lastSavedAt, setLastSavedAt] = useState<string | null>(null);
  const [saveMode, setSaveMode] = useState<"published" | "draft" | null>(null);
  const [amountConfirmOpen, setAmountConfirmOpen] = useState(false);
  const [amountChangeReason, setAmountChangeReason] = useState("");
  const [pdfExportingAction, setPdfExportingAction] = useState<"download" | "print" | "share" | null>(null);
  const [errorMsg, setErrorMsg] = useState("");
  const hiddenPrintRef = useRef<HTMLDivElement>(null);

  const initialFinancialSig = React.useMemo(
    () =>
      JSON.stringify({
        open: Number(record.opening_balance) || 0,
        rows: (record.entries || []).map((r) => [r.id, parseNum(r.debit), parseNum(r.credit)]),
      }),
    [record]
  );

  // Live Ledger Comparison Modal state
  const [showReconcileDrawer, setShowReconcileDrawer] = useState(false);
  const [loadingReconcile, setLoadingReconcile] = useState(false);
  const [reconcileReport, setReconcileReport] = useState<{
    matched: Array<{ soaRef: string; erpRef: string; amount: number; date: string }>;
    missingInErp: Array<{ soaRef: string; amount: number; date: string }>;
    missingInSoa: Array<{ erpRef: string; amount: number; date: string; type: string }>;
    amountMismatch: Array<{ ref: string; soaAmount: number; erpAmount: number; diff: number }>;
  } | null>(null);

  const tableContainerRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Load PDF Blob safely using session authentication
  useEffect(() => {
    let active = true;
    let objectUrl = "";

    async function loadPdfBlob() {
      setPdfLoading(true);
      setPdfError("");
      try {
        const { data: sessionData } = await supabase.auth.getSession();
        const token = sessionData?.session?.access_token || "";

        let fetchPath = record.storage_path;
        let bucket = record.storage_bucket || "smart-imports";

        if (!fetchPath && record.file_url) {
          const mPath = record.file_url.match(/[?&]path=([^&]+)/);
          const mBucket = record.file_url.match(/[?&]bucket=([^&]+)/);
          if (mPath) fetchPath = decodeURIComponent(mPath[1]);
          if (mBucket) bucket = decodeURIComponent(mBucket[1]);
        }

        if (!fetchPath) {
          throw new Error("Original file storage reference is missing for this statement.");
        }

        // Try getting short-lived signed URL or direct download
        const url = `/api/smart-import/storage?path=${encodeURIComponent(fetchPath)}&bucket=${encodeURIComponent(bucket)}`;
        const res = await fetch(url, {
          headers: token ? { Authorization: `Bearer ${token}` } : undefined,
        });

        if (!res.ok) {
          const errText = await res.text();
          throw new Error(`Original file not found in storage (${res.status}): ${errText}`);
        }

        const buf = await res.arrayBuffer();
        if (!active) return;

        const blob = new Blob([buf], { type: record.file_type || "application/pdf" });
        objectUrl = URL.createObjectURL(blob);
        setPdfBlobUrl(objectUrl);
      } catch (err) {
        if (active) {
          setPdfError(err instanceof Error ? err.message : "Failed to load original document preview.");
        }
      } finally {
        if (active) setPdfLoading(false);
      }
    }

    void loadPdfBlob();

    return () => {
      active = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [record]);

  // Handle Replacement File Upload
  async function handleReplaceFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    setReplacingFile(true);
    setErrorMsg("");
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData?.session?.access_token || "";

      // 1. Initialize upload via storage route
      const initRes = await fetch("/api/smart-import/storage", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          fileName: file.name,
          fileType: file.type || "application/pdf",
          fileSize: file.size,
          companyId: record.company_id,
          batchId: `replace_${Date.now()}`,
        }),
      });

      const initJson = await initRes.json();
      if (!initJson.success && initJson.fallback !== "direct_upload") {
        throw new Error(initJson.error || "Failed to initialize replacement upload.");
      }

      // 2. Upload file to Supabase storage
      let uploadedPath = initJson.path;
      if (initJson.signedUrl) {
        const uploadRes = await fetch(initJson.signedUrl, {
          method: "PUT",
          headers: { "Content-Type": file.type || "application/pdf" },
          body: file,
        });
        if (!uploadRes.ok) throw new Error("Failed to upload replacement file.");
      } else {
        uploadedPath = `${record.company_id}/replace/${Date.now()}_${file.name}`;
        const { error: upErr } = await supabase.storage.from("smart-imports").upload(uploadedPath, file, { upsert: true });
        if (upErr) throw upErr;
      }

      // 3. Update record in database
      const newFileUrl = `/api/smart-import/storage?path=${encodeURIComponent(uploadedPath)}&bucket=smart-imports`;
      const updateRes = await fetch("/api/customer-statements", {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          attachmentId: record.id,
          action: "update_statement",
          storagePath: uploadedPath,
          fileUrl: newFileUrl,
          reason: `User replaced missing source document with ${file.name}`,
        }),
      });

      if (!updateRes.ok) throw new Error("Failed to link replaced document.");

      // Refresh local blob
      const localUrl = URL.createObjectURL(file);
      setPdfBlobUrl(localUrl);
      setPdfError("");
      alert("Replacement file uploaded successfully!");
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to replace file.");
    } finally {
      setReplacingFile(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  // Decimal-safe recalculation of running balances across all rows
  function recalc(openBal: number, list: RawHistoricalEntry[]) {
    let running = Math.round(openBal * 100) / 100;
    let debits = 0;
    let credits = 0;
    const computed = list.map((e) => {
      const d = parseNum(e.debit);
      const c = parseNum(e.credit);
      debits += d;
      credits += c;
      running = Math.round((running + d - c) * 100) / 100;
      return {
        ...e,
        debit: d,
        credit: c,
        balance: running,
      };
    });
    return {
      computedEntries: computed,
      totalDebits: Math.round(debits * 100) / 100,
      totalCredits: Math.round(credits * 100) / 100,
      closingBal: Math.round((openBal + debits - credits) * 100) / 100,
    };
  }

  const { computedEntries, totalDebits, totalCredits, closingBal } = recalc(
    openingBalance,
    entries
  );

  function pushUndo() {
    setUndoStack((prev) => [...prev, entries]);
    setRedoStack([]);
    setHasUnsavedChanges(true);
  }

  function handleRowChange(rowId: string, field: keyof RawHistoricalEntry, val: unknown) {
    pushUndo();
    const updated = entries.map((e) => {
      if (e.id !== rowId) return e;
      return { ...e, [field]: val, is_edited: true, needs_review: false };
    });
    const { computedEntries: res } = recalc(openingBalance, updated);
    setEntries(res);
  }

  function handleAddRow() {
    pushUndo();
    const newRow: RawHistoricalEntry = {
      id: createRowId("manual"),
      date: statementDate || new Date().toISOString().slice(0, 10),
      reference_no: "",
      original_reference: "",
      description: "",
      debit: 0,
      credit: 0,
      status: "historical",
      is_edited: true,
      source_filename: record?.file_name,
    };
    const next = [...entries, newRow];
    const { computedEntries: res } = recalc(openingBalance, next);
    setEntries(res);
  }

  function handleDeleteRow(rowId: string) {
    const row = entries.find((e) => e.id === rowId);
    if (!confirm(`Are you sure you want to delete row "${row?.reference_no || row?.description || 'Row'}"?`)) {
      return;
    }
    pushUndo();
    const next = entries.filter((e) => e.id !== rowId);
    const { computedEntries: res } = recalc(openingBalance, next);
    setEntries(res);
  }

  function handleDuplicateRow(rowId: string) {
    const row = entries.find((e) => e.id === rowId);
    if (!row) return;
    pushUndo();
    const duplicated: RawHistoricalEntry = {
      ...row,
      id: createRowId("dup"),
      is_edited: true,
    };
    const idx = entries.findIndex((e) => e.id === rowId);
    const next = [...entries];
    next.splice(idx + 1, 0, duplicated);
    const { computedEntries: res } = recalc(openingBalance, next);
    setEntries(res);
  }

  function handleUndo() {
    if (undoStack.length === 0) return;
    const prev = undoStack[undoStack.length - 1];
    setRedoStack((r) => [...r, entries]);
    setUndoStack((u) => u.slice(0, -1));
    const { computedEntries: res } = recalc(openingBalance, prev);
    setEntries(res);
    setHasUnsavedChanges(true);
  }

  function handleRedo() {
    if (redoStack.length === 0) return;
    const next = redoStack[redoStack.length - 1];
    setUndoStack((u) => [...u, entries]);
    setRedoStack((r) => r.slice(0, -1));
    const { computedEntries: res } = recalc(openingBalance, next);
    setEntries(res);
    setHasUnsavedChanges(true);
  }

  function handleClipboardPaste(rawText: string) {
    if (!rawText.trim()) return;
    pushUndo();
    const lines = rawText.split(/\r?\n/).filter((l) => l.trim().length > 0);
    const pastedRows: RawHistoricalEntry[] = [];

    for (const line of lines) {
      const cols = line.split("\t");
      if (cols.length === 1 && line.includes(",")) {
        // Fallback to comma if pasted as CSV
        cols.length = 0;
        cols.push(...line.split(","));
      }

      let date = "";
      let ref = "";
      let desc = "";
      let debit = 0;
      let credit = 0;

      if (cols.length >= 5) {
        date = cols[0].trim();
        ref = cols[1].trim();
        desc = cols[2].trim();
        debit = parseNum(cols[3]);
        credit = parseNum(cols[4]);
      } else if (cols.length === 4) {
        date = cols[0].trim();
        ref = cols[1].trim();
        desc = cols[2].trim();
        debit = parseNum(cols[3]);
      } else if (cols.length === 3) {
        date = cols[0].trim();
        desc = cols[1].trim();
        debit = parseNum(cols[2]);
      } else {
        desc = cols[0].trim();
      }

      pastedRows.push({
        id: createRowId("paste"),
        date: date || statementDate || new Date().toISOString().slice(0, 10),
        reference_no: ref,
        description: desc || "Pasted Transaction",
        debit,
        credit,
        status: "historical",
        is_edited: true,
        source_filename: record.file_name,
      });
    }

    const next = [...entries, ...pastedRows];
    const { computedEntries: res } = recalc(openingBalance, next);
    setEntries(res);
  }

  // Validate Math Balance (strict AED 0.01 tolerance)
  const sourceClosingParsed =
    pdfClosingInput.trim() === "" || Number.isNaN(Number(pdfClosingInput))
      ? null
      : Math.round(Number(pdfClosingInput) * 100) / 100;
  const currentDiscrepancy =
    sourceClosingParsed !== null ? Math.round(Math.abs(closingBal - sourceClosingParsed) * 100) / 100 : null;

  function handleValidateStatement() {
    const expected = Math.round((openingBalance + totalDebits - totalCredits) * 100) / 100;
    if (sourceClosingParsed === null) {
      setValidationAlert({
        valid: false,
        difference: 0,
        message: `Original PDF Closing Balance is not extracted yet. Enter the source PDF closing balance (computed: AED ${expected.toFixed(2)}) before verifying.`,
      });
      return;
    }
    const diff = Math.round(Math.abs(expected - sourceClosingParsed) * 100) / 100;

    if (diff <= 0.01) {
      setValidationAlert({
        valid: true,
        difference: 0,
        message: `Statement math reconciles within AED 0.01. Opening (AED ${openingBalance.toFixed(2)}) + Debits (AED ${totalDebits.toFixed(2)}) - Credits (AED ${totalCredits.toFixed(2)}) = Closing Balance (AED ${expected.toFixed(2)}).`,
      });
    } else {
      setValidationAlert({
        valid: false,
        difference: diff,
        message: `Discrepancy of AED ${diff.toFixed(2)} detected. Original PDF closing is AED ${sourceClosingParsed.toFixed(2)}, but calculated closing is AED ${expected.toFixed(2)}.`,
      });
    }
  }

  // Reconcile Historical SOA with Live ERP Transactions
  async function handleCompareWithLiveLedger() {
    if (!customerId) {
      alert("Please select a customer first to compare with live ERP records.");
      return;
    }

    setLoadingReconcile(true);
    setShowReconcileDrawer(true);
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData?.session?.access_token || "";

      const res = await fetch(`/api/customer-statements?customerId=${encodeURIComponent(customerId)}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      });
      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.error || "Failed to load live ERP records.");
      }

      const rawInvoices = (json.invoices || json.statement?.invoices || []) as RawInvoice[];
      const rawReceipts = (json.receipts || json.statement?.receipts || []) as RawReceiptVoucher[];

      // Comparison algorithm
      const matched: Array<{ soaRef: string; erpRef: string; amount: number; date: string }> = [];
      const missingInErp: Array<{ soaRef: string; amount: number; date: string }> = [];
      const amountMismatch: Array<{ ref: string; soaAmount: number; erpAmount: number; diff: number }> = [];

      const erpMatchedIds = new Set<string>();

      for (const entry of computedEntries) {
        const entryRef = (entry.reference_no || "").toLowerCase().trim();
        const entryAmount = entry.debit > 0 ? entry.debit : entry.credit;

        let found = false;
        // Check invoices
        for (const inv of rawInvoices) {
          const invNum = (inv.invoice_number || "").toLowerCase().trim();
          const invTotal = Number(inv.total_amount ?? 0);
          if (entryRef && (invNum.includes(entryRef) || entryRef.includes(invNum))) {
            found = true;
            erpMatchedIds.add(inv.id);
            if (Math.abs(invTotal - entryAmount) <= 0.05) {
              matched.push({ soaRef: entry.reference_no, erpRef: inv.invoice_number || "Invoice", amount: entryAmount, date: entry.date });
            } else {
              amountMismatch.push({ ref: entry.reference_no, soaAmount: entryAmount, erpAmount: invTotal, diff: Math.abs(invTotal - entryAmount) });
            }
            break;
          }
        }

        // Check receipts / payments
        if (!found) {
          for (const rv of rawReceipts) {
            const rvNum = (rv.voucher_number || "").toLowerCase().trim();
            const rvAmount = Number(rv.amount ?? 0);
            if (entryRef && (rvNum.includes(entryRef) || entryRef.includes(rvNum))) {
              found = true;
              erpMatchedIds.add(rv.id);
              if (Math.abs(rvAmount - entryAmount) <= 0.05) {
                matched.push({ soaRef: entry.reference_no, erpRef: rv.voucher_number || "Receipt", amount: entryAmount, date: entry.date });
              } else {
                amountMismatch.push({ ref: entry.reference_no, soaAmount: entryAmount, erpAmount: rvAmount, diff: Math.abs(rvAmount - entryAmount) });
              }
              break;
            }
          }
        }

        if (!found) {
          missingInErp.push({ soaRef: entry.reference_no || entry.description, amount: entryAmount, date: entry.date });
        }
      }

      // Live ERP records missing in SOA
      const missingInSoa: Array<{ erpRef: string; amount: number; date: string; type: string }> = [];
      for (const inv of rawInvoices) {
        if (!erpMatchedIds.has(inv.id)) {
          missingInSoa.push({
            erpRef: inv.invoice_number || "Invoice",
            amount: Number(inv.total_amount ?? 0),
            date: inv.invoice_date || "",
            type: "Invoice",
          });
        }
      }
      for (const rv of rawReceipts) {
        if (!erpMatchedIds.has(rv.id)) {
          missingInSoa.push({
            erpRef: rv.voucher_number || "Receipt",
            amount: Number(rv.amount ?? 0),
            date: rv.voucher_date || "",
            type: "Receipt",
          });
        }
      }

      setReconcileReport({ matched, missingInErp, missingInSoa, amountMismatch });
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to compare with live ERP.");
    } finally {
      setLoadingReconcile(false);
    }
  }

  const currentFinancialSig = JSON.stringify({
    open: openingBalance,
    rows: computedEntries.map((r) => [r.id, parseNum(r.debit), parseNum(r.credit)]),
  });
  const hasFinancialAmountChanges = currentFinancialSig !== initialFinancialSig;

  // Save changes (Save Draft vs Save Changes / Publish vs Approve & Verify)
  async function handleSave(options: {
    mode: "draft" | "save_changes" | "verify";
    reasonOverride?: string;
  }) {
    if (
      options.mode === "save_changes" &&
      hasFinancialAmountChanges &&
      !options.reasonOverride &&
      !amountConfirmOpen
    ) {
      setAmountConfirmOpen(true);
      return;
    }

    setErrorMsg("");
    setSaving(true);
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData?.session?.access_token || "";

      const isDraft = options.mode === "draft";
      const apiAction = isDraft ? "save_draft" : "publish_changes";

      const res = await fetch("/api/customer-statements", {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          attachmentId: record?.id,
          action: apiAction,
          customerId: customerId || undefined,
          soaNumber: soaNumber.trim() || undefined,
          statementDate: statementDate || null,
          openingBalance,
          closingBalance: sourceClosingParsed,
          entries: computedEntries,
          isVerified: !isDraft,
          status: isDraft ? "pending_verification" : "verified",
          needsReview: isDraft,
          reason:
            options.reasonOverride ||
            (options.mode === "verify"
              ? "User approved and verified Statement of Account"
              : options.mode === "save_changes"
              ? hasFinancialAmountChanges
                ? "User confirmed and published financial amount corrections"
                : "User saved and published Statement of Account changes"
              : "User saved Statement of Account draft"),
        }),
      });

      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json?.error || "Failed to save statement.");
      }

      clearPdfCache();
      setHasUnsavedChanges(false);
      setAmountConfirmOpen(false);
      setAmountChangeReason("");
      setLastSavedAt(new Date().toLocaleTimeString());
      setSaveMode(isDraft ? "draft" : "published");
      onSaved(customerId || undefined);
      if (options.mode === "verify") onClose();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Failed to save statement.");
    } finally {
      setSaving(false);
    }
  }

  async function handleExportUpdatedStatementPdf(action: "download" | "print" | "share") {
    if (!hiddenPrintRef.current) return;
    setPdfExportingAction(action);
    setErrorMsg("");
    try {
      await exportDocumentToPdf({
        filename: exportPdfFilename,
        scopeElement: hiddenPrintRef.current,
        action,
      });
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Failed to generate updated SOA PDF.");
    } finally {
      setPdfExportingAction(null);
    }
  }

  // Verification requirements: strict guardrails (Section 8)
  const isCustomerConfirmed = Boolean(customerId);
  const isDateConfirmed = Boolean(statementDate);
  const hasRows = computedEntries.length > 0;
  const isSourceClosingKnown = sourceClosingParsed !== null;
  const isMathReconciled = isSourceClosingKnown && currentDiscrepancy !== null && currentDiscrepancy <= 0.01;
  const hasUnresolvedRowIssues = computedEntries.some((r) => Boolean((r as { needs_review?: boolean }).needs_review));
  const canVerify =
    isCustomerConfirmed &&
    isDateConfirmed &&
    isSourceClosingKnown &&
    isMathReconciled &&
    !hasUnresolvedRowIssues &&
    (hasRows || confirmZeroTransactions);

  const exportPdfFilename = getExportSoaPdfFilename(
    soaNumber || record.soa_number,
    customers.find((c) => c.id === customerId)?.name || record.customer_name,
    statementDate || record.statement_date
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-2 sm:p-4">
      <div className="flex flex-col w-full h-[95vh] max-w-[98vw] rounded-2xl border border-slate-800 bg-slate-950 shadow-2xl overflow-hidden">
        {/* Top Header Toolbar */}
        <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-3.5 bg-slate-900 border-b border-slate-800 text-xs shrink-0">
          <div className="flex items-center gap-3">
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-sm font-bold text-white flex items-center gap-2">
                  <span>Excel-Style SOA Editor:</span>
                  <span className="text-cyan-400 font-mono">{soaNumber || record.soa_number}</span>
                </h2>
                {hasUnsavedChanges ? (
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-amber-950 border border-amber-800 text-amber-300">
                    Unsaved Edits
                  </span>
                ) : lastSavedAt ? (
                  <span
                    className={`px-2 py-0.5 rounded-full text-[10px] font-semibold border ${
                      saveMode === "published"
                        ? "bg-emerald-950 border-emerald-800 text-emerald-300"
                        : "bg-slate-800 border-slate-700 text-slate-300"
                    }`}
                  >
                    {saveMode === "published" ? `Saved & Published (${lastSavedAt})` : `Draft Saved (${lastSavedAt})`}
                  </span>
                ) : record.is_verified && !record.needs_review ? (
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-cyan-950 border border-cyan-800 text-cyan-300">
                    Published
                  </span>
                ) : (
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-slate-800 border border-slate-700 text-slate-300">
                    Draft / Pending
                  </span>
                )}
              </div>
              <p className="text-[11px] text-slate-400">
                Original file: <strong className="text-slate-300">{record.file_name}</strong> (immutable source)
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => handleCompareWithLiveLedger()}
              className="inline-flex items-center gap-1.5 rounded-lg border border-purple-800/80 bg-purple-950/60 hover:bg-purple-900 text-purple-200 px-3 py-1.5 font-semibold transition cursor-pointer"
              title="Compare statement rows with live ERP invoices & payments"
            >
              <GitCompare size={13} />
              <span>Compare Live ERP</span>
            </button>

            <button
              type="button"
              onClick={() => {
                if (isFullScreenTable) {
                  setIsFullScreenTable(false);
                  setShowPdfPreview(true);
                } else {
                  setShowPdfPreview(!showPdfPreview);
                }
              }}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-800 hover:bg-slate-700 text-slate-200 px-3 py-1.5 font-semibold transition cursor-pointer"
            >
              {showPdfPreview ? <EyeOff size={13} /> : <Eye size={13} />}
              <span>{showPdfPreview ? "Hide Original" : "Show Original"}</span>
            </button>

            <button
              type="button"
              onClick={() => {
                setIsFullScreenTable(!isFullScreenTable);
                if (!isFullScreenTable) setShowPdfPreview(false);
              }}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-800 hover:bg-slate-700 text-slate-200 px-3 py-1.5 font-semibold transition cursor-pointer"
              title="Expand table to full screen"
            >
              <Maximize2 size={13} />
              <span>{isFullScreenTable ? "Split View" : "Full Spreadsheet"}</span>
            </button>

            <button
              type="button"
              disabled={pdfExportingAction !== null}
              onClick={() => void handleExportUpdatedStatementPdf("download")}
              className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white px-3 py-1.5 font-bold transition cursor-pointer disabled:opacity-50"
              title="Download updated Statement of Account PDF"
            >
              {pdfExportingAction === "download" ? <Loader2 size={13} className="animate-spin" /> : <Download size={13} />}
              <span>Download PDF</span>
            </button>

            <button
              type="button"
              disabled={pdfExportingAction !== null}
              onClick={() => void handleExportUpdatedStatementPdf("print")}
              className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white px-3 py-1.5 font-bold transition cursor-pointer disabled:opacity-50"
              title="Print updated Statement of Account PDF"
            >
              {pdfExportingAction === "print" ? <Loader2 size={13} className="animate-spin" /> : <Printer size={13} />}
              <span className="hidden sm:inline">Print</span>
            </button>

            <button
              type="button"
              disabled={pdfExportingAction !== null}
              onClick={() => void handleExportUpdatedStatementPdf("share")}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-800 hover:bg-slate-700 text-emerald-300 px-3 py-1.5 font-semibold transition cursor-pointer disabled:opacity-50"
              title="Share updated Statement of Account PDF"
            >
              {pdfExportingAction === "share" ? <Loader2 size={13} className="animate-spin" /> : <Share2 size={13} />}
              <span className="hidden sm:inline">Share</span>
            </button>

            {pdfBlobUrl && (
              <a
                href={pdfBlobUrl}
                target="_blank"
                rel="noreferrer"
                download={record.file_name || exportPdfFilename}
                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-800 hover:bg-slate-700 text-slate-300 px-3 py-1.5 font-semibold transition cursor-pointer"
                title="Download immutable original uploaded PDF"
              >
                <Download size={13} />
                <span className="hidden md:inline">Download Original</span>
              </a>
            )}

            <button
              type="button"
              onClick={onClose}
              className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition cursor-pointer"
            >
              <X size={16} />
            </button>
          </div>
        </div>

        {/* Top Statement Metadata Controls */}
        <div className="grid grid-cols-1 sm:grid-cols-12 gap-3 px-5 py-3 bg-slate-900/60 border-b border-slate-800/80 text-xs shrink-0">
          <div className="sm:col-span-3 space-y-1">
            <label className="text-[10px] text-slate-400 uppercase font-semibold">Customer</label>
            <select
              value={customerId}
              onChange={(e) => {
                setCustomerId(e.target.value);
                setHasUnsavedChanges(true);
              }}
              className="w-full rounded-lg border border-slate-700 bg-slate-900 px-2.5 py-1.5 text-xs text-white focus:border-cyan-500 focus:outline-none"
            >
              <option value="">-- Select Customer --</option>
              {customers.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} {c.customer_code ? `(${c.customer_code})` : ""}
                </option>
              ))}
            </select>
          </div>

          <div className="sm:col-span-2 space-y-1">
            <label className="text-[10px] text-slate-400 uppercase font-semibold">SOA Number</label>
            <input
              type="text"
              value={soaNumber}
              onChange={(e) => {
                setSoaNumber(e.target.value);
                setHasUnsavedChanges(true);
              }}
              className="w-full rounded-lg border border-slate-700 bg-slate-900 px-2.5 py-1.5 text-xs font-mono text-cyan-300 focus:border-cyan-500 focus:outline-none"
            />
          </div>

          <div className="sm:col-span-2 space-y-1">
            <label className="text-[10px] text-slate-400 uppercase font-semibold">Statement Date</label>
            <input
              type="date"
              value={statementDate ? statementDate.slice(0, 10) : ""}
              onChange={(e) => {
                setStatementDate(e.target.value);
                setHasUnsavedChanges(true);
              }}
              className="w-full rounded-lg border border-slate-700 bg-slate-900 px-2.5 py-1.5 text-xs text-white focus:border-cyan-500 focus:outline-none"
            />
          </div>

          <div className="sm:col-span-2 space-y-1">
            <label className="text-[10px] text-slate-400 uppercase font-semibold">Opening (AED)</label>
            <input
              type="number"
              step="0.01"
              value={openingBalance}
              onChange={(e) => {
                setOpeningBalance(parseNum(e.target.value));
                setHasUnsavedChanges(true);
              }}
              className="w-full rounded-lg border border-slate-700 bg-slate-900 px-2.5 py-1.5 text-xs text-right font-mono text-white focus:border-cyan-500 focus:outline-none"
            />
          </div>

          <div className="sm:col-span-2 space-y-1">
            <label className="text-[10px] text-slate-400 uppercase font-semibold">PDF Closing (AED)</label>
            <input
              type="number"
              step="0.01"
              value={pdfClosingInput}
              placeholder="Not extracted"
              onChange={(e) => {
                setPdfClosingInput(e.target.value);
                setHasUnsavedChanges(true);
              }}
              className={`w-full rounded-lg border bg-slate-900 px-2.5 py-1.5 text-xs text-right font-mono focus:border-cyan-500 focus:outline-none ${
                sourceClosingParsed === null ? "border-amber-700 text-amber-300" : "border-slate-700 text-white"
              }`}
            />
          </div>

          <div className="sm:col-span-3 space-y-1">
            <label className="text-[10px] text-slate-400 uppercase font-semibold">
              Calculated Closing {currentDiscrepancy !== null && currentDiscrepancy > 0.01 ? "(Mismatch)" : ""}
            </label>
            <div className="rounded-lg bg-slate-900 border border-slate-800 px-3 py-1.5 text-xs font-mono font-bold text-white flex items-center justify-between gap-2">
              <span className={closingBal < 0 ? "text-emerald-400" : "text-cyan-300"}>
                AED {closingBal.toFixed(2)}
              </span>
              {currentDiscrepancy !== null && currentDiscrepancy > 0.01 ? (
                <span className="text-[10px] text-rose-400 font-semibold">
                  Diff: AED {currentDiscrepancy.toFixed(2)}
                </span>
              ) : (
                <span className="text-[10px] text-slate-400 font-normal font-sans">
                  ({computedEntries.length} rows)
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Mobile Tab Switcher: Switch cleanly between Original PDF & Edit Transactions */}
        <div className="lg:hidden flex items-center gap-2 px-4 py-2 bg-slate-900/80 border-b border-slate-800 shrink-0">
          <button
            type="button"
            onClick={() => setMobileTab("table")}
            className={`flex-1 min-h-9 rounded-lg text-xs font-bold transition ${
              mobileTab === "table" ? "bg-cyan-600 text-white" : "bg-slate-800 text-slate-400"
            }`}
          >
            Edit Transactions ({computedEntries.length})
          </button>
          <button
            type="button"
            onClick={() => setMobileTab("pdf")}
            className={`flex-1 min-h-9 rounded-lg text-xs font-bold transition ${
              mobileTab === "pdf" ? "bg-amber-600 text-white" : "bg-slate-800 text-slate-400"
            }`}
          >
            Original PDF
          </button>
        </div>

        {/* Validation Alert / Discrepancy Banner */}
        {validationAlert && (
          <div
            className={`px-5 py-2.5 flex items-center justify-between text-xs border-b ${validationAlert.valid
              ? "bg-emerald-950/70 border-emerald-800 text-emerald-200"
              : "bg-rose-950/70 border-rose-800 text-rose-200"
              }`}
          >
            <div className="flex items-center gap-2">
              {validationAlert.valid ? (
                <CheckCircle2 size={15} className="text-emerald-400 shrink-0" />
              ) : (
                <AlertTriangle size={15} className="text-rose-400 shrink-0" />
              )}
              <span>{validationAlert.message}</span>
            </div>
            <button
              type="button"
              onClick={() => setValidationAlert(null)}
              className="text-slate-400 hover:text-white"
            >
              <X size={14} />
            </button>
          </div>
        )}

        {/* Error Banner */}
        {errorMsg && (
          <div className="px-5 py-2.5 bg-rose-950/80 border-b border-rose-800 flex items-center gap-2 text-rose-200 text-xs">
            <AlertTriangle size={15} className="text-rose-400 shrink-0" />
            <span>{errorMsg}</span>
          </div>
        )}

        {/* Toolbar for Table Actions */}
        <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-2 bg-slate-900/40 border-b border-slate-800 text-xs shrink-0">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleAddRow}
              className="inline-flex items-center gap-1 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 px-3 py-1.5 font-semibold transition cursor-pointer"
            >
              <Plus size={13} />
              <span>Add Row</span>
            </button>

            <button
              type="button"
              onClick={() => setPastePromptOpen(true)}
              className="inline-flex items-center gap-1 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 px-3 py-1.5 font-semibold transition cursor-pointer"
            >
              <Clipboard size={13} />
              <span>Paste Excel Rows</span>
            </button>

            <button
              type="button"
              disabled={undoStack.length === 0}
              onClick={handleUndo}
              className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 disabled:opacity-40 cursor-pointer"
              title="Undo (Ctrl+Z)"
            >
              <Undo size={14} />
            </button>

            <button
              type="button"
              disabled={redoStack.length === 0}
              onClick={handleRedo}
              className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 disabled:opacity-40 cursor-pointer"
              title="Redo (Ctrl+Y)"
            >
              <Redo size={14} />
            </button>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleValidateStatement}
              className="inline-flex items-center gap-1.5 rounded-lg border border-cyan-800/80 bg-cyan-950/60 hover:bg-cyan-900 text-cyan-300 px-3 py-1.5 font-semibold transition cursor-pointer"
            >
              <ShieldCheck size={14} />
              <span>Validate Balance</span>
            </button>
          </div>
        </div>

        {/* Paste Modal Prompt */}
        {pastePromptOpen && (
          <div className="p-4 bg-slate-900 border-b border-cyan-800 space-y-3 shrink-0">
            <div className="flex items-center justify-between">
              <h4 className="text-xs font-bold text-white">Paste Rows from Excel / Spreadsheet</h4>
              <button
                type="button"
                onClick={() => setPastePromptOpen(false)}
                className="text-slate-400 hover:text-white"
              >
                <X size={14} />
              </button>
            </div>
            <p className="text-[11px] text-slate-400">
              Copy columns from Excel (Date | Reference | Description | Debit | Credit) and paste below:
            </p>
            <textarea
              rows={3}
              value={rawPasteText}
              onChange={(e) => setRawPasteText(e.target.value)}
              placeholder={"2026-05-09\tINV-117\tTax Invoice INV-117\t3861.90\t0.00\n2026-06-15\tREC-044\tPayment Received\t0.00\t3861.90"}
              className="w-full rounded-lg border border-slate-700 bg-slate-950 p-2 font-mono text-xs text-white"
            />
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setPastePromptOpen(false)}
                className="px-3 py-1 rounded-lg border border-slate-700 bg-slate-800 text-slate-300 text-xs"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  handleClipboardPaste(rawPasteText);
                  setRawPasteText("");
                  setPastePromptOpen(false);
                }}
                className="px-3 py-1 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white font-bold text-xs"
              >
                Insert Rows
              </button>
            </div>
          </div>
        )}

        {/* Main Layout: Split View on Desktop, Clean Switchable Tabs on Mobile */}
        <div className={`grid gap-3 flex-1 overflow-hidden p-3 sm:p-4 ${showPdfPreview && !isFullScreenTable ? "grid-cols-1 lg:grid-cols-2" : "grid-cols-1"}`}>
          {/* Left Panel: Original PDF Preview */}
          {showPdfPreview && !isFullScreenTable && (
            <div className={`rounded-xl border border-slate-800 bg-slate-900/50 overflow-hidden flex-col h-full ${mobileTab === "pdf" ? "flex" : "hidden lg:flex"}`}>
              {/* PDF Preview Top Toolbar */}
              <div className="bg-slate-900 px-3 py-2 border-b border-slate-800 text-[11px] text-slate-400 flex items-center justify-between shrink-0">
                <span className="truncate max-w-[200px]" title={record.file_name}>
                  Original: <strong className="text-white">{record.file_name}</strong>
                </span>

                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => setPdfZoom((z) => Math.max(50, z - 15))}
                    className="p-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300"
                    title="Zoom Out"
                  >
                    <ZoomOut size={12} />
                  </button>
                  <span className="font-mono text-[10px] w-10 text-center">{pdfZoom}%</span>
                  <button
                    type="button"
                    onClick={() => setPdfZoom((z) => Math.min(200, z + 15))}
                    className="p-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300"
                    title="Zoom In"
                  >
                    <ZoomIn size={12} />
                  </button>
                  <button
                    type="button"
                    onClick={() => setPdfZoom(100)}
                    className="px-1.5 py-0.5 rounded text-[10px] bg-slate-800 hover:bg-slate-700 text-slate-300"
                    title="Reset Zoom"
                  >
                    Fit
                  </button>

                  <input
                    type="file"
                    ref={fileInputRef}
                    onChange={handleReplaceFile}
                    accept=".pdf,.xlsx,.xls,.csv"
                    className="hidden"
                  />
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={replacingFile}
                    className="ml-1 inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] bg-cyan-950 border border-cyan-800 text-cyan-300 hover:bg-cyan-900 cursor-pointer"
                    title="Replace with source PDF file"
                  >
                    {replacingFile ? <Loader2 size={10} className="animate-spin" /> : <Upload size={10} />}
                    <span>Replace PDF</span>
                  </button>
                </div>
              </div>

              {/* PDF Viewer Content */}
              <div className="flex-1 bg-slate-950 p-2 overflow-auto flex items-center justify-center">
                {pdfLoading ? (
                  <div className="flex flex-col items-center justify-center gap-2 text-slate-400 text-xs">
                    <Loader2 size={24} className="animate-spin text-cyan-400" />
                    <span>Loading authentic document preview...</span>
                  </div>
                ) : pdfError ? (
                  <div className="p-6 text-center space-y-3 max-w-sm">
                    <AlertTriangle size={32} className="mx-auto text-amber-400" />
                    <p className="text-xs text-slate-300 font-semibold">Original file missing in storage</p>
                    <p className="text-[11px] text-slate-500">{pdfError}</p>
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white font-bold text-xs cursor-pointer"
                    >
                      <Upload size={13} />
                      <span>Upload Replacement PDF</span>
                    </button>
                  </div>
                ) : pdfBlobUrl ? (
                  <div
                    className="w-full h-full overflow-auto flex justify-center"
                    style={{ transform: pdfZoom !== 100 ? `scale(${pdfZoom / 100})` : undefined, transformOrigin: "top center" }}
                  >
                    <iframe
                      src={pdfBlobUrl}
                      title="Original PDF Document"
                      className="w-full h-full min-h-[500px] rounded border border-slate-800 bg-white"
                    />
                  </div>
                ) : (
                  <div className="text-center p-6 text-slate-500 text-xs">
                    No preview available.
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Right Panel: Editable Spreadsheet Table */}
          <div
            ref={tableContainerRef}
            className={`rounded-xl border border-slate-800 bg-slate-950/60 overflow-auto flex-col h-full ${mobileTab === "table" || isFullScreenTable || !showPdfPreview ? "flex" : "hidden lg:flex"}`}
            onPaste={(e) => {
              const text = e.clipboardData.getData("text");
              if (text && text.includes("\t")) {
                e.preventDefault();
                handleClipboardPaste(text);
              }
            }}
          >
            <table className="w-full text-xs border-collapse">
              <thead className="bg-slate-900 border-b border-slate-800 text-slate-400 uppercase text-[10px] sticky top-0 z-10 font-mono">
                <tr>
                  <th className="py-2.5 px-2 text-center w-8">#</th>
                  <th className="py-2.5 px-2 text-left w-28">Date</th>
                  <th className="py-2.5 px-2 text-left w-28">Reference</th>
                  <th className="py-2.5 px-2 text-left">Description</th>
                  <th className="py-2.5 px-2 text-right w-24">Debit</th>
                  <th className="py-2.5 px-2 text-right w-24">Credit</th>
                  <th className="py-2.5 px-2 text-right w-28">Balance</th>
                  <th className="py-2.5 px-1 text-center w-16">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 font-mono">
                {computedEntries.map((row, idx) => {
                  const rowNeedsReview = Boolean((row as { needs_review?: boolean }).needs_review);
                  return (
                  <tr
                    key={row.id}
                    className={`transition ${
                      rowNeedsReview
                        ? "bg-amber-950/30 hover:bg-amber-950/50"
                        : "hover:bg-slate-900/50"
                    }`}
                  >
                    <td className="py-1 px-2 text-center text-slate-500 text-[10px]">
                      {idx + 1}
                    </td>
                    <td className="py-1 px-1">
                      <input
                        type="date"
                        value={row.date?.slice(0, 10) || ""}
                        onChange={(e) => handleRowChange(row.id, "date", e.target.value)}
                        className="w-full bg-slate-900 border border-slate-800 rounded px-1.5 py-1 text-[11px] text-white focus:border-cyan-500 focus:outline-none"
                      />
                    </td>
                    <td className="py-1 px-1">
                      <input
                        type="text"
                        value={row.reference_no || ""}
                        onChange={(e) => handleRowChange(row.id, "reference_no", e.target.value)}
                        className="w-full bg-slate-900 border border-slate-800 rounded px-1.5 py-1 text-[11px] font-mono text-cyan-300 focus:border-cyan-500 focus:outline-none"
                      />
                    </td>
                    <td className="py-1 px-1">
                      <input
                        type="text"
                        value={row.description || ""}
                        onChange={(e) => handleRowChange(row.id, "description", e.target.value)}
                        className="w-full bg-slate-900 border border-slate-800 rounded px-1.5 py-1 text-[11px] text-slate-200 font-sans focus:border-cyan-500 focus:outline-none"
                      />
                    </td>
                    <td className="py-1 px-1">
                      <input
                        type="number"
                        step="0.01"
                        value={row.debit || ""}
                        onChange={(e) => handleRowChange(row.id, "debit", parseNum(e.target.value))}
                        className="w-full bg-slate-900 border border-slate-800 rounded px-1.5 py-1 text-[11px] text-right text-white focus:border-cyan-500 focus:outline-none"
                      />
                    </td>
                    <td className="py-1 px-1">
                      <input
                        type="number"
                        step="0.01"
                        value={row.credit || ""}
                        onChange={(e) => handleRowChange(row.id, "credit", parseNum(e.target.value))}
                        className="w-full bg-slate-900 border border-slate-800 rounded px-1.5 py-1 text-[11px] text-right text-emerald-400 focus:border-cyan-500 focus:outline-none"
                      />
                    </td>
                    <td className="py-1 px-2 text-right text-[11px] font-bold text-white">
                      {row.balance !== undefined ? Number(row.balance).toFixed(2) : "—"}
                    </td>
                    <td className="py-1 px-1 text-center">
                      <div className="flex items-center justify-center gap-1">
                        <button
                          type="button"
                          onClick={() => handleDuplicateRow(row.id)}
                          className="text-slate-500 hover:text-cyan-400 p-1 cursor-pointer transition"
                          title="Duplicate row"
                        >
                          <Plus size={12} />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDeleteRow(row.id)}
                          className="text-slate-500 hover:text-rose-400 p-1 cursor-pointer transition"
                          title="Delete row"
                        >
                          <Trash2 size={12} />
                        </button>
                      </div>
                    </td>
                  </tr>
                  );
                })}

                {computedEntries.length === 0 && (
                  <tr>
                    <td colSpan={8} className="py-12 text-center text-slate-500 font-sans">
                      <div className="max-w-md mx-auto space-y-2">
                        <p className="font-semibold text-slate-400">No transaction rows extracted</p>
                        <p className="text-[11px] text-slate-500">
                          Click <strong>Add Row</strong> or <strong>Paste Excel Rows</strong> to insert historical entries.
                        </p>
                        <label className="flex items-center justify-center gap-2 pt-2 text-slate-400 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={confirmZeroTransactions}
                            onChange={(e) => setConfirmZeroTransactions(e.target.checked)}
                            className="rounded border-slate-700 bg-slate-900"
                          />
                          <span className="text-[11px] text-slate-300">
                            Confirm genuine 0-transaction SOA (Opening = Closing balance)
                          </span>
                        </label>
                      </div>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Live ERP Reconciliation Drawer / Panel */}
        {showReconcileDrawer && (
          <div className="border-t border-purple-800/80 bg-slate-900/95 p-4 text-xs space-y-3 shrink-0 max-h-[40vh] overflow-y-auto">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <GitCompare size={16} className="text-purple-400" />
                <h3 className="font-bold text-white text-sm">
                  Live ERP Ledger Comparison — {customers.find((c) => c.id === customerId)?.name || "Customer"}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setShowReconcileDrawer(false)}
                className="text-slate-400 hover:text-white"
              >
                <X size={16} />
              </button>
            </div>

            {loadingReconcile ? (
              <div className="flex items-center gap-2 py-4 text-slate-400">
                <Loader2 size={16} className="animate-spin text-purple-400" />
                <span>Comparing statement transactions against authoritative ERP invoices & payments...</span>
              </div>
            ) : reconcileReport ? (
              <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 pt-1">
                {/* Matched */}
                <div className="rounded-xl border border-emerald-800 bg-emerald-950/40 p-3 space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-emerald-300">Matched in ERP</span>
                    <span className="font-mono font-bold text-emerald-400">{reconcileReport.matched.length}</span>
                  </div>
                  <p className="text-[10px] text-slate-400">Reference & amount match existing live transactions.</p>
                  <div className="max-h-24 overflow-y-auto space-y-1 pt-1 font-mono text-[10px]">
                    {reconcileReport.matched.map((m, i) => (
                      <div key={i} className="flex justify-between text-slate-300">
                        <span>{m.soaRef}</span>
                        <span>AED {m.amount.toFixed(2)}</span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Missing in ERP */}
                <div className="rounded-xl border border-cyan-800 bg-cyan-950/40 p-3 space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-cyan-300">Historical Only (Missing in ERP)</span>
                    <span className="font-mono font-bold text-cyan-400">{reconcileReport.missingInErp.length}</span>
                  </div>
                  <p className="text-[10px] text-slate-400">Document records that exist only in historical archive.</p>
                  <div className="max-h-24 overflow-y-auto space-y-1 pt-1 font-mono text-[10px]">
                    {reconcileReport.missingInErp.map((m, i) => (
                      <div key={i} className="flex justify-between text-slate-300">
                        <span>{m.soaRef}</span>
                        <span>AED {m.amount.toFixed(2)}</span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Missing in SOA */}
                <div className="rounded-xl border border-purple-800 bg-purple-950/40 p-3 space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-purple-300">Live Only (Missing in SOA)</span>
                    <span className="font-mono font-bold text-purple-400">{reconcileReport.missingInSoa.length}</span>
                  </div>
                  <p className="text-[10px] text-slate-400">New ERP transactions posted after statement period.</p>
                  <div className="max-h-24 overflow-y-auto space-y-1 pt-1 font-mono text-[10px]">
                    {reconcileReport.missingInSoa.map((m, i) => (
                      <div key={i} className="flex justify-between text-slate-300">
                        <span>{m.erpRef}</span>
                        <span>AED {m.amount.toFixed(2)}</span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Amount Mismatch */}
                <div className="rounded-xl border border-amber-800 bg-amber-950/40 p-3 space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-amber-300">Amount Mismatch</span>
                    <span className="font-mono font-bold text-amber-400">{reconcileReport.amountMismatch.length}</span>
                  </div>
                  <p className="text-[10px] text-slate-400">Same reference found with differing amounts.</p>
                  <div className="max-h-24 overflow-y-auto space-y-1 pt-1 font-mono text-[10px]">
                    {reconcileReport.amountMismatch.map((m, i) => (
                      <div key={i} className="flex justify-between text-amber-300">
                        <span>{m.ref}</span>
                        <span>Diff: AED {m.diff.toFixed(2)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            ) : null}
          </div>
        )}

        {/* Financial Amount Correction Confirmation Banner */}
        {amountConfirmOpen && (
          <div className="border-t border-amber-700/80 bg-amber-950/90 px-5 py-3 text-xs text-amber-100 flex flex-wrap items-center justify-between gap-3 shrink-0">
            <div className="space-y-1 flex-1 min-w-[240px]">
              <div className="font-bold text-amber-300 flex items-center gap-1.5">
                <AlertTriangle size={14} />
                <span>Confirm Financial Amount Correction &amp; Audit Trail</span>
              </div>
              <p className="text-[11px] text-amber-200/80">
                You modified debit, credit, or opening balance amounts. Enter an audit note to publish this correction to the authoritative Live Customer Statement.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <input
                type="text"
                value={amountChangeReason}
                onChange={(e) => setAmountChangeReason(e.target.value)}
                placeholder="Reason for financial correction (e.g. Corrected INV debit)"
                className="rounded-lg border border-amber-700 bg-slate-950 px-3 py-1.5 text-xs text-white w-64 focus:border-amber-400 focus:outline-none"
              />
              <button
                type="button"
                onClick={() => setAmountConfirmOpen(false)}
                className="rounded-lg border border-slate-700 bg-slate-800 px-3 py-1.5 text-xs font-semibold text-slate-300 hover:text-white cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={saving}
                onClick={() =>
                  void handleSave({
                    mode: "save_changes",
                    reasonOverride:
                      amountChangeReason.trim() ||
                      "User confirmed and published financial amount corrections",
                  })
                }
                className="rounded-lg bg-amber-600 hover:bg-amber-500 px-4 py-1.5 text-xs font-bold text-white cursor-pointer disabled:opacity-50"
              >
                Confirm &amp; Publish
              </button>
            </div>
          </div>
        )}

        {/* Footer with Calculations & Save / Verify Controls */}
        <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-3.5 bg-slate-900 border-t border-slate-800 text-xs shrink-0">
          <div className="flex flex-wrap items-center gap-3 text-slate-400 font-mono">
            <span>
              Opening: <strong className="text-white">AED {openingBalance.toFixed(2)}</strong>
            </span>
            <span>•</span>
            <span>
              Debits: <strong className="text-cyan-300">AED {totalDebits.toFixed(2)}</strong>
            </span>
            <span>•</span>
            <span>
              Credits: <strong className="text-emerald-300">AED {totalCredits.toFixed(2)}</strong>
            </span>
            <span>•</span>
            <span>
              Closing: <strong className="text-white font-bold">AED {closingBal.toFixed(2)}</strong>
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl border border-slate-700 bg-slate-800 hover:bg-slate-700 px-4 py-2 font-semibold text-slate-300 hover:text-white transition cursor-pointer"
            >
              Close
            </button>

            <button
              type="button"
              onClick={() => void handleSave({ mode: "draft" })}
              disabled={saving}
              className="inline-flex items-center gap-1.5 rounded-xl border border-slate-700 bg-slate-800 hover:bg-slate-700 text-slate-200 px-4 py-2 font-semibold transition cursor-pointer disabled:opacity-50"
            >
              {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
              <span>Save Draft</span>
            </button>

            <button
              type="button"
              onClick={() => void handleSave({ mode: "save_changes" })}
              disabled={!isCustomerConfirmed || saving}
              className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white px-4 py-2 font-bold transition shadow-sm cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
              title="Save and publish changes immediately to the authoritative Live Customer Statement"
            >
              {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
              <span>Save Changes</span>
            </button>

            <button
              type="button"
              onClick={() => void handleSave({ mode: "verify" })}
              disabled={!canVerify || saving}
              className={`inline-flex items-center gap-1.5 rounded-xl px-5 py-2 font-bold transition shadow-sm cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed ${canVerify
                ? "bg-cyan-600 hover:bg-cyan-500 text-white"
                : "bg-slate-800 text-slate-500 border border-slate-700"
                }`}
              title={
                !canVerify
                  ? `Cannot verify: ${!isCustomerConfirmed ? "Select customer. " : ""}${!isDateConfirmed ? "Set statement date. " : ""}${!isSourceClosingKnown ? "Enter PDF closing balance. " : ""}${isSourceClosingKnown && !isMathReconciled ? "Reconcile closing balance within AED 0.01. " : ""}${hasUnresolvedRowIssues ? "Review highlighted uncertain rows. " : ""}${!hasRows && !confirmZeroTransactions ? "Requires transaction rows or genuine zero confirmation." : ""}`
                  : "Approve and verify Statement of Account"
              }
            >
              {saving ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle2 size={14} />}
              <span>Approve &amp; Verify</span>
            </button>
          </div>
        </div>

        {/* Off-screen authoritative StatementOfAccountTemplate for unified Chromium PDF export */}
        <div
          ref={hiddenPrintRef}
          aria-hidden="true"
          style={{ position: "fixed", left: "-99999px", top: 0, width: "210mm", pointerEvents: "none", opacity: 0 }}
        >
          <StatementOfAccountTemplate
            company={companyInfo || null}
            statement={
              liveStatement && liveStatement.statement_number === (soaNumber || record.soa_number)
                ? {
                    ...liveStatement,
                    entries:
                      liveStatement.entries.some((e) => !e.is_historical)
                        ? liveStatement.entries
                        : computedEntries.map((ce) => ({
                            ...ce,
                            status: ce.status === "duplicate" ? ("historical" as const) : ce.status,
                            balance: ce.balance ?? 0,
                            is_historical: true,
                          })),
                  }
                : {
                    statement_number: soaNumber || record.soa_number || "SOA",
                    statement_date: statementDate || record.statement_date || new Date().toISOString().slice(0, 10),
                    customer_name: customers.find((c) => c.id === customerId)?.name || record.customer_name || "Customer",
                    customer_code: customers.find((c) => c.id === customerId)?.customer_code || null,
                    customer_trn: customers.find((c) => c.id === customerId)?.trn || null,
                    opening_balance: openingBalance,
                    total_debits: totalDebits,
                    total_credits: totalCredits,
                    closing_balance: closingBal,
                    entries: computedEntries.map((ce) => ({
                      ...ce,
                      status: ce.status === "duplicate" ? ("historical" as const) : ce.status,
                      balance: ce.balance ?? 0,
                      is_historical: true,
                    })),
                  }
            }
          />
        </div>
      </div>
    </div>
  );
}

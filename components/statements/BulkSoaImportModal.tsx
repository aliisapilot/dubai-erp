"use client";

import React, { useState, useRef, useEffect, useCallback } from "react";
import {
  X,
  Upload,
  FileText,
  FileSpreadsheet,
  CheckCircle2,
  AlertTriangle,
  Loader2,
  RotateCw,
  Trash2,
  CopyCheck,
  Undo,
  Redo,
  Plus,
  ArrowLeft,
  Clipboard,
  Eye,
  EyeOff,
} from "lucide-react";
import JSZip from "jszip";
import { supabase } from "@/lib/supabase";
import { todayISO, getCompanyId } from "@/lib/helpers";
import {
  type CustomerCandidate,
  type StoredSoaRecord,
  validateSoaFile,
  matchCustomerCandidates,
  detectSoaDuplicate,
  extractSoaRowsFromSpreadsheet,
  parseSoaFilename,
} from "@/lib/soaManager";
import type { RawHistoricalEntry } from "@/lib/customerStatementEngine";

interface BulkSoaImportModalProps {
  isOpen: boolean;
  onClose: () => void;
  companyId: string;
  customers: CustomerCandidate[];
  existingStatements: StoredSoaRecord[];
  onImportComplete: () => void;
}

export interface StagedSoaItem {
  localId: string;
  file: File;
  fileName: string;
  fileType: string;
  fileSize: number;
  ext: string;
  checksumSha256: string;
  storagePath: string;
  storageBucket: string;
  // Extracted / Editable fields
  detectedCustomerName: string;
  customerId: string;
  createNewCustomer: boolean;
  newCustomerName: string;
  confirmNewCustomer: boolean;
  customerMatchReason: string;
  customerSuggestions: Array<{ id: string; name: string; score: number }>;
  soaNumber: string;
  internalDocumentNumber?: string;
  numberConflict?: string;
  statementDate: string | null;
  fromDate?: string;
  toDate?: string;
  openingBalance: number;
  charges: number;
  credits: number;
  closingBalance: number | null;
  entries: RawHistoricalEntry[];
  cutoverDate?: string;
  isCutoverApproved?: boolean;
  // Statuses
  processState: "queued" | "uploading" | "parsing" | "ready" | "needs_review" | "failed";
  isVerified?: boolean;
  isScannedPdf: boolean;
  errorMessage?: string;
  // Duplicate handling
  isDuplicate: boolean;
  duplicateReason: string;
  existingAttachmentId?: string;
  duplicateAction: "none" | "skip" | "replace";
  confirmReplace: boolean;
}

async function computeSha256Hex(buffer: ArrayBuffer): Promise<string> {
  if (typeof crypto !== "undefined" && crypto.subtle) {
    const hashBuf = await crypto.subtle.digest("SHA-256", buffer);
    return Array.from(new Uint8Array(hashBuf))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
  }
  return `len_${buffer.byteLength}_${Date.now()}`;
}

function parseNum(raw: unknown): number {
  if (typeof raw === "number") return Number.isFinite(raw) ? Math.round(raw * 100) / 100 : 0;
  if (raw == null) return 0;
  const cleaned = String(raw).replace(/[^0-9.-]/g, "");
  const n = parseFloat(cleaned);
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : 0;
}

function formatDisplayDate(iso: string | null | undefined): string {
  if (!iso || !iso.trim()) return "Unknown";
  try {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return "Unknown";
    return d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
  } catch {
    return "Unknown";
  }
}

let rowIdCounter = 0;
function createRowId(prefix = "row"): string {
  rowIdCounter++;
  return `${prefix}_${rowIdCounter}_${Date.now()}`;
}

export default function BulkSoaImportModal({
  isOpen,
  onClose,
  companyId,
  customers,
  existingStatements,
  onImportComplete,
}: BulkSoaImportModalProps) {
  const [step, setStep] = useState<"upload" | "review" | "done">("upload");
  const [items, setItems] = useState<StagedSoaItem[]>([]);
  const [selectedItemIds, setSelectedItemIds] = useState<Set<string>>(new Set());
  const [statusFilter, setStatusFilter] = useState<"all" | "issues" | "ready" | "failed">("all");
  const [batchCustomerId, setBatchCustomerId] = useState<string>("");
  const [processing, setProcessing] = useState(false);
  const [processedCount, setProcessedCount] = useState(0);
  const [savingAll, setSavingAll] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [summaryMsg, setSummaryMsg] = useState("");
  const [errorBanner, setErrorBanner] = useState("");
  const [saveSummary, setSaveSummary] = useState<{
    imported: number;
    replaced: number;
    skipped: number;
    failed: number;
  } | null>(null);

  // Editable Spreadsheet Review state
  const [editingRowsItemId, setEditingRowsItemId] = useState<string | null>(null);
  const [undoStack, setUndoStack] = useState<RawHistoricalEntry[][]>([]);
  const [redoStack, setRedoStack] = useState<RawHistoricalEntry[][]>([]);
  const [showSplitPreview, setShowSplitPreview] = useState(true);
  const [previewBlobUrl, setPreviewBlobUrl] = useState<string | null>(null);
  const [pastePromptOpen, setPastePromptOpen] = useState(false);
  const [rawPasteText, setRawPasteText] = useState("");

  const fileInputRef = useRef<HTMLInputElement>(null);
  const activeBlobUrlRef = useRef<string | null>(null);

  const revokeActiveBlobUrl = useCallback(() => {
    if (activeBlobUrlRef.current) {
      try {
        URL.revokeObjectURL(activeBlobUrlRef.current);
      } catch {
        // ignore
      }
      activeBlobUrlRef.current = null;
    }
  }, []);

  useEffect(() => {
    if (!isOpen) return;
    let mounted = true;
    queueMicrotask(() => {
      if (!mounted) return;
      revokeActiveBlobUrl();
      setStep("upload");
      setItems([]);
      setSelectedItemIds(new Set());
      setStatusFilter("all");
      setBatchCustomerId("");
      setProcessing(false);
      setProcessedCount(0);
      setSavingAll(false);
      setSummaryMsg("");
      setErrorBanner("");
      setSaveSummary(null);
      setEditingRowsItemId(null);
      setUndoStack([]);
      setRedoStack([]);
      setPreviewBlobUrl(null);
    });
    return () => {
      mounted = false;
      revokeActiveBlobUrl();
    };
  }, [isOpen, revokeActiveBlobUrl]);

  function handleCloseModal() {
    revokeActiveBlobUrl();
    onClose();
  }

  function handleOpenReviewScreen(localId: string) {
    const it = items.find((i) => i.localId === localId);
    if (!it) return;
    revokeActiveBlobUrl();
    setEditingRowsItemId(localId);
    setUndoStack([]);
    setRedoStack([]);
    if (it.file && typeof URL !== "undefined" && typeof URL.createObjectURL === "function") {
      try {
        const url = URL.createObjectURL(it.file);
        activeBlobUrlRef.current = url;
        setPreviewBlobUrl(url);
      } catch {
        setPreviewBlobUrl(null);
      }
    } else if (it.storagePath) {
      setPreviewBlobUrl(
        `/api/smart-import/storage?path=${encodeURIComponent(it.storagePath)}&bucket=${encodeURIComponent(
          it.storageBucket || "smart-imports"
        )}`
      );
    } else {
      setPreviewBlobUrl(null);
    }
  }

  function handleCloseReviewScreen() {
    revokeActiveBlobUrl();
    setPreviewBlobUrl(null);
    setEditingRowsItemId(null);
    setUndoStack([]);
    setRedoStack([]);
  }

  const activeItem = items.find((i) => i.localId === editingRowsItemId);

  function recalcEntries(opening: number, entriesList: RawHistoricalEntry[]) {
    let bal = opening;
    let debits = 0;
    let credits = 0;
    const computed = entriesList.map((e) => {
      const d = Math.round((Number(e.debit) || 0) * 100) / 100;
      const c = Math.round((Number(e.credit) || 0) * 100) / 100;
      debits += d;
      credits += c;
      bal = Math.round((bal + d - c) * 100) / 100;
      return {
        ...e,
        debit: d,
        credit: c,
        balance: bal,
      };
    });
    return {
      computedEntries: computed,
      totalDebits: Math.round(debits * 100) / 100,
      totalCredits: Math.round(credits * 100) / 100,
      closingBal: Math.round((opening + debits - credits) * 100) / 100,
    };
  }

  function handleRowFieldChange(
    rowId: string,
    field: keyof RawHistoricalEntry,
    val: string | number | boolean | undefined
  ) {
    if (!activeItem) return;
    setUndoStack((prev) => [...prev, activeItem.entries]);
    setRedoStack([]);

    const nextEntries = activeItem.entries.map((e) => {
      if (e.id !== rowId) return e;
      return { ...e, [field]: val, is_edited: true };
    });

    const { computedEntries, totalDebits, totalCredits, closingBal } = recalcEntries(
      activeItem.openingBalance,
      nextEntries
    );

    updateItem(activeItem.localId, {
      entries: computedEntries,
      charges: totalDebits,
      credits: totalCredits,
      closingBalance: closingBal,
    });
  }

  function handleAddRow() {
    if (!activeItem) return;
    setUndoStack((prev) => [...prev, activeItem.entries]);
    setRedoStack([]);

    const newRow: RawHistoricalEntry = {
      id: createRowId("row"),
      date: activeItem.statementDate || todayISO(),
      reference_no: "",
      original_reference: "",
      description: "",
      debit: 0,
      credit: 0,
      status: "historical",
      is_edited: true,
      source_filename: activeItem.fileName,
    };

    const next = [...activeItem.entries, newRow];
    const { computedEntries, totalDebits, totalCredits, closingBal } = recalcEntries(
      activeItem.openingBalance,
      next
    );

    updateItem(activeItem.localId, {
      entries: computedEntries,
      charges: totalDebits,
      credits: totalCredits,
      closingBalance: closingBal,
    });
  }

  function handleDeleteRow(rowId: string) {
    if (!activeItem) return;
    setUndoStack((prev) => [...prev, activeItem.entries]);
    setRedoStack([]);

    const next = activeItem.entries.filter((e) => e.id !== rowId);
    const { computedEntries, totalDebits, totalCredits, closingBal } = recalcEntries(
      activeItem.openingBalance,
      next
    );

    updateItem(activeItem.localId, {
      entries: computedEntries,
      charges: totalDebits,
      credits: totalCredits,
      closingBalance: closingBal,
    });
  }

  function handleUndo() {
    if (!activeItem || undoStack.length === 0) return;
    const prevEntries = undoStack[undoStack.length - 1];
    setUndoStack((s) => s.slice(0, s.length - 1));
    setRedoStack((s) => [...s, activeItem.entries]);

    const { computedEntries, totalDebits, totalCredits, closingBal } = recalcEntries(
      activeItem.openingBalance,
      prevEntries
    );

    updateItem(activeItem.localId, {
      entries: computedEntries,
      charges: totalDebits,
      credits: totalCredits,
      closingBalance: closingBal,
    });
  }

  function handleRedo() {
    if (!activeItem || redoStack.length === 0) return;
    const nextEntries = redoStack[redoStack.length - 1];
    setRedoStack((s) => s.slice(0, s.length - 1));
    setUndoStack((s) => [...s, activeItem.entries]);

    const { computedEntries, totalDebits, totalCredits, closingBal } = recalcEntries(
      activeItem.openingBalance,
      nextEntries
    );

    updateItem(activeItem.localId, {
      entries: computedEntries,
      charges: totalDebits,
      credits: totalCredits,
      closingBalance: closingBal,
    });
  }

  function handleClipboardPaste(text: string) {
    if (!activeItem) return;
    const lines = text.trim().split(/\r?\n/);
    if (lines.length === 0) return;

    setUndoStack((prev) => [...prev, activeItem.entries]);
    setRedoStack([]);

    const parsedRows: RawHistoricalEntry[] = [];
    for (const line of lines) {
      if (!line.trim()) continue;
      const parts = line.split("\t");
      if (parts.length >= 2) {
        const pDate = parts[0]?.trim();
        const pRef = parts[1]?.trim();
        const pDesc = parts[2]?.trim() || "";
        const pDebit = parseNum(parts[3] || 0);
        const pCredit = parseNum(parts[4] || 0);
        parsedRows.push({
          id: createRowId("pasted"),
          date: pDate || activeItem.statementDate || todayISO(),
          reference_no: pRef || (pDebit > 0 ? "INV" : "REC"),
          original_reference: pRef,
          description: pDesc || (pDebit > 0 ? "Invoice Charge" : "Payment"),
          debit: pDebit,
          credit: pCredit,
          status: "historical",
          is_edited: true,
          source_filename: activeItem.fileName,
        });
      }
    }

    if (parsedRows.length > 0) {
      const combined = [...activeItem.entries, ...parsedRows];
      const { computedEntries, totalDebits, totalCredits, closingBal } = recalcEntries(
        activeItem.openingBalance,
        combined
      );
      updateItem(activeItem.localId, {
        entries: computedEntries,
        charges: totalDebits,
        credits: totalCredits,
        closingBalance: closingBal,
      });
    }
  }

  if (!isOpen) return null;

  async function uploadAndExtractSingle(
    item: StagedSoaItem,
    accessToken: string,
    batchId: string,
    resolvedCompanyId: string
  ): Promise<StagedSoaItem> {
    let stage = "Storage upload";
    try {
      const buffer = await item.file.arrayBuffer();
      const checksumSha256 = await computeSha256Hex(buffer);

      // 1. Get signed upload URL from private storage API
      const storageInitRes = await fetch("/api/smart-import/storage", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
        },
        body: JSON.stringify({
          fileName: item.fileName,
          fileType: item.fileType,
          fileSize: item.fileSize,
          companyId: resolvedCompanyId,
          batchId,
        }),
      });
      const storageInit = await storageInitRes.json();

      const storagePath = storageInit?.path || "";
      const storageBucket = storageInit?.bucket || "smart-imports";

      if (storageInit?.success && storageInit?.signedUrl) {
        const putRes = await fetch(storageInit.signedUrl, {
          method: "PUT",
          headers: { "Content-Type": item.fileType || "application/octet-stream" },
          body: item.file,
        });
        if (!putRes.ok) {
          throw new Error(`HTTP ${putRes.status} uploading to signed storage URL`);
        }
      } else if (storagePath) {
        const { error: directErr } = await supabase.storage
          .from(storageBucket)
          .upload(storagePath, item.file, { upsert: false });
        if (directErr) {
          const msg = directErr.message || "Unknown storage error";
          if (msg.toLowerCase().includes("bucket not found") || msg.toLowerCase().includes("row-level security")) {
            throw new Error(
              `${msg} — Ensure migration 20261112180000_fix_smart_imports_storage_rls.sql is applied in Supabase.`
            );
          }
          throw new Error(msg);
        }
      } else {
        throw new Error(storageInit?.error || "Could not initialize private storage upload.");
      }

      // 2. Extract SOA metadata
      stage = "Extraction";
      const fnParsed = parseSoaFilename(item.fileName);
      let customerName = fnParsed.customerName || "";
      let soaNumber = fnParsed.soaNumber || item.fileName.replace(/\.[^.]+$/, "");
      let internalDocumentNumber: string | undefined = undefined;
      let numberConflict: string | undefined = undefined;
      let statementDate: string | null = fnParsed.statementDate || null;
      let openingBalance = 0;
      let charges = 0;
      let credits = 0;
      let closingBalance: number | null = null;
      let isScannedPdf = false;
      let extractionUncertain = false;
      let entries: RawHistoricalEntry[] = [];

      if (item.ext === "xlsx" || item.ext === "xls" || item.ext === "csv") {
        const parsed = extractSoaRowsFromSpreadsheet(buffer, item.fileName);
        customerName = parsed.customerName || customerName;
        soaNumber = parsed.soaNumber || soaNumber;
        statementDate = parsed.statementDate || statementDate || null;
        openingBalance = parsed.openingBalance;
        charges = parsed.charges;
        credits = parsed.credits;
        closingBalance = parsed.closingBalance ?? null;
        entries = parsed.entries;
        extractionUncertain = parsed.needsReview || !statementDate || closingBalance === null;
      } else if (item.ext === "pdf") {
        const parseRes = await fetch("/api/smart-import/parse", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
          },
          body: JSON.stringify({
            storageBucket,
            storagePath,
            fileName: item.fileName,
            fileType: item.fileType,
            fileSize: item.fileSize,
          }),
        });

        const parseJson = await parseRes.json();
        const doc = parseJson?.documents?.[0];
        if (!parseRes.ok || !doc) {
          isScannedPdf = true;
          extractionUncertain = true;
        } else {
          const textLen = String(doc.rawTextPreview || "").trim().length;
          customerName = customerName || doc.customerName || doc.partyName || "";

          // Cross-check SOA Number: Filename is authoritative for systematic naming
          if (fnParsed.soaNumber) {
            soaNumber = fnParsed.soaNumber;
            if (doc.documentNumber && doc.documentNumber !== fnParsed.soaNumber) {
              internalDocumentNumber = doc.documentNumber;
              numberConflict = `Filename states '${fnParsed.soaNumber}' but internal text states '${doc.documentNumber}'. Filename preserved as primary document identifier.`;
              extractionUncertain = true;
            }
          } else {
            soaNumber = doc.documentNumber || soaNumber;
          }

          statementDate = doc.documentDate || statementDate || null;
          openingBalance = Number(doc.openingBalance || 0);
          charges = Number(doc.subtotal || doc.totalDebits || 0);
          credits = Number(doc.totalCredits || 0);
          closingBalance =
            doc.closingBalance != null
              ? Number(doc.closingBalance)
              : doc.totalAmount != null
              ? Number(doc.totalAmount)
              : null;

          if (Array.isArray(doc.items) && doc.items.length > 0) {
            entries = doc.items.map((it: Record<string, unknown>, idx: number) => ({
              id: createRowId(`pdf_${idx}`),
              date: String(it.date || statementDate || ""),
              reference_no: String(it.reference || it.documentNumber || `INV-${idx + 1}`),
              original_reference: it.reference ? String(it.reference) : undefined,
              description: String(it.description || "Historical Item"),
              debit: Number(it.debit || it.amount || 0),
              credit: Number(it.credit || 0),
              status: "historical" as const,
              source_filename: item.fileName,
            }));
          }

          if (textLen < 30 && !customerName && (closingBalance === 0 || closingBalance === null)) {
            isScannedPdf = true;
            extractionUncertain = true;
          } else if (!customerName || !soaNumber || !statementDate || closingBalance === null) {
            extractionUncertain = true;
          }

          // Mathematical audit
          if (closingBalance !== null) {
            const expectedClosing = Math.round((openingBalance + charges - credits) * 100) / 100;
            if (Math.abs(closingBalance - expectedClosing) > 0.05) {
              extractionUncertain = true;
            }
          }
        }
      }

      // 3. Smart customer matching
      stage = "Customer matching";
      const matchOutcome = matchCustomerCandidates(customerName, customers);

      // 4. Duplicate detection
      const dupOutcome = detectSoaDuplicate(
        {
          customerId: matchOutcome.matchedCustomerId,
          soaNumber,
          fileName: item.fileName,
          checksumSha256,
        },
        existingStatements
      );

      const needsReview =
        extractionUncertain ||
        Boolean(numberConflict) ||
        isScannedPdf ||
        matchOutcome.needsReview ||
        !matchOutcome.matchedCustomerId ||
        !statementDate ||
        closingBalance === null ||
        entries.length === 0;

      const isVerified =
        !needsReview &&
        !dupOutcome.isDuplicate &&
        Boolean(matchOutcome.matchedCustomerId);

      return {
        ...item,
        checksumSha256,
        storagePath,
        storageBucket,
        detectedCustomerName: customerName,
        customerId: matchOutcome.matchedCustomerId,
        createNewCustomer: false,
        newCustomerName: customerName,
        confirmNewCustomer: false,
        customerMatchReason: isScannedPdf
          ? "Scanned PDF detected — OCR / manual review required."
          : numberConflict
          ? numberConflict
          : matchOutcome.reason,
        customerSuggestions: matchOutcome.suggestions,
        soaNumber,
        internalDocumentNumber,
        numberConflict,
        statementDate,
        openingBalance,
        charges,
        credits,
        closingBalance,
        entries,
        isVerified,
        processState: needsReview ? "needs_review" : "ready",
        isScannedPdf,
        isDuplicate: dupOutcome.isDuplicate,
        duplicateReason: dupOutcome.reason,
        existingAttachmentId: dupOutcome.existingRecord?.id,
        duplicateAction: dupOutcome.isDuplicate ? "skip" : "none",
        confirmReplace: false,
      };
    } catch (err) {
      const rawMsg = err instanceof Error ? err.message : "Unexpected error.";
      return {
        ...item,
        statementDate: null,
        closingBalance: null,
        isVerified: false,
        processState: "failed",
        errorMessage: `${stage} failed: ${rawMsg}`,
      };
    }
  }

  async function handleFilesSelected(fileList: FileList | File[]) {
    const rawFiles = Array.from(fileList);
    if (rawFiles.length === 0) return;

    setErrorBanner("");
    setProcessing(true);
    setProcessedCount(0);
    setStep("review");

    const expandedFiles: Array<{ file: File; ext: string }> = [];
    const immediateFailed: StagedSoaItem[] = [];

    for (const f of rawFiles) {
      const validation = validateSoaFile(f);
      if (!validation.valid) {
        if (!f.name.startsWith("~$") && !f.name.startsWith(".~")) {
          immediateFailed.push({
            localId: crypto.randomUUID(),
            file: f,
            fileName: f.name,
            fileType: f.type || "application/octet-stream",
            fileSize: f.size,
            ext: validation.ext,
            checksumSha256: "",
            storagePath: "",
            storageBucket: "smart-imports",
            detectedCustomerName: "",
            customerId: "",
            createNewCustomer: false,
            newCustomerName: "",
            confirmNewCustomer: false,
            customerMatchReason: "",
            customerSuggestions: [],
            soaNumber: f.name,
            statementDate: null,
            openingBalance: 0,
            charges: 0,
            credits: 0,
            closingBalance: null,
            entries: [],
            isVerified: false,
            processState: "failed",
            isScannedPdf: false,
            errorMessage: validation.error,
            isDuplicate: false,
            duplicateReason: "",
            duplicateAction: "none",
            confirmReplace: false,
          });
        }
        continue;
      }

      if (validation.ext === "zip") {
        try {
          const buf = await f.arrayBuffer();
          const zip = await JSZip.loadAsync(buf);
          const entries = Object.values(zip.files).filter((z) => !z.dir);
          for (const entry of entries) {
            const baseName = entry.name.split("/").pop() || entry.name;
            if (baseName.startsWith("~$") || baseName.startsWith(".~") || baseName.startsWith("__MACOSX")) {
              continue;
            }
            const blob = await entry.async("blob");
            const innerFile = new File([blob], baseName, {
              type: baseName.toLowerCase().endsWith(".pdf")
                ? "application/pdf"
                : baseName.toLowerCase().endsWith(".csv")
                ? "text/csv"
                : "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            });
            const innerVal = validateSoaFile(innerFile);
            if (innerVal.valid && innerVal.ext !== "zip") {
              expandedFiles.push({ file: innerFile, ext: innerVal.ext });
            }
          }
        } catch {
          immediateFailed.push({
            localId: crypto.randomUUID(),
            file: f,
            fileName: f.name,
            fileType: f.type || "application/zip",
            fileSize: f.size,
            ext: "zip",
            checksumSha256: "",
            storagePath: "",
            storageBucket: "smart-imports",
            detectedCustomerName: "",
            customerId: "",
            createNewCustomer: false,
            newCustomerName: "",
            confirmNewCustomer: false,
            customerMatchReason: "",
            customerSuggestions: [],
            soaNumber: f.name,
            statementDate: null,
            openingBalance: 0,
            charges: 0,
            credits: 0,
            closingBalance: null,
            entries: [],
            isVerified: false,
            processState: "failed",
            isScannedPdf: false,
            errorMessage: "Corrupted or unreadable ZIP archive.",
            isDuplicate: false,
            duplicateReason: "",
            duplicateAction: "none",
            confirmReplace: false,
          });
        }
      } else {
        expandedFiles.push({ file: f, ext: validation.ext });
      }
    }

    const initialStaged: StagedSoaItem[] = [
      ...expandedFiles.map(({ file, ext }) => ({
        localId: crypto.randomUUID(),
        file,
        fileName: file.name,
        fileType: file.type || "application/octet-stream",
        fileSize: file.size,
        ext,
        checksumSha256: "",
        storagePath: "",
        storageBucket: "smart-imports",
        detectedCustomerName: "",
        customerId: "",
        createNewCustomer: false,
        newCustomerName: "",
        confirmNewCustomer: false,
        customerMatchReason: "",
        customerSuggestions: [],
        soaNumber: file.name.replace(/\.[^.]+$/, ""),
        statementDate: null,
        openingBalance: 0,
        charges: 0,
        credits: 0,
        closingBalance: null,
        entries: [],
        isVerified: false,
        processState: "queued" as const,
        isScannedPdf: false,
        isDuplicate: false,
        duplicateReason: "",
        duplicateAction: "none" as const,
        confirmReplace: false,
      })),
      ...immediateFailed,
    ];

    setItems(initialStaged);

    const { data: sessionData } = await supabase.auth.getSession();
    const accessToken = sessionData?.session?.access_token || "";
    const resolvedCompanyId = companyId || (await getCompanyId().catch(() => ""));
    const batchId = `soa_${Date.now()}`;

    // Process files in concurrency batches of 4
    const results = [...initialStaged];
    const queueIndices = results
      .map((it, idx) => (it.processState === "queued" ? idx : -1))
      .filter((idx) => idx >= 0);

    let done = immediateFailed.length;
    setProcessedCount(done);

    const CONCURRENCY = 4;
    for (let i = 0; i < queueIndices.length; i += CONCURRENCY) {
      const slice = queueIndices.slice(i, i + CONCURRENCY);
      await Promise.all(
        slice.map(async (idx) => {
          results[idx] = { ...results[idx], processState: "uploading" };
          setItems([...results]);
          const updated = await uploadAndExtractSingle(
            results[idx],
            accessToken,
            batchId,
            resolvedCompanyId
          );
          results[idx] = updated;
          done++;
          setProcessedCount(done);
          setItems([...results]);
        })
      );
    }

    setProcessing(false);
  }

  // 1. Batch Action: Apply Customer to All (with per-file overrides)
  function handleApplyCustomerToAll(targetCustomerId: string) {
    if (!targetCustomerId) return;
    const targetCust = customers.find((c) => c.id === targetCustomerId);
    setItems((prev) =>
      prev.map((it) => {
        if (selectedItemIds.size > 0 && !selectedItemIds.has(it.localId)) return it;
        const dup = detectSoaDuplicate(
          {
            customerId: targetCustomerId,
            soaNumber: it.soaNumber,
            fileName: it.fileName,
            checksumSha256: it.checksumSha256,
          },
          existingStatements
        );
        const isReady =
          Boolean(targetCustomerId) &&
          Boolean(it.soaNumber.trim()) &&
          !dup.isDuplicate &&
          !it.isScannedPdf &&
          it.statementDate !== null &&
          it.closingBalance !== null &&
          it.entries.length > 0;
        return {
          ...it,
          customerId: targetCustomerId,
          createNewCustomer: false,
          customerMatchReason: `Batch assigned to ${targetCust?.name || "selected customer"}`,
          isDuplicate: dup.isDuplicate,
          duplicateReason: dup.reason,
          existingAttachmentId: dup.existingRecord?.id,
          duplicateAction: dup.isDuplicate ? "skip" : "none",
          isVerified: isReady,
          processState: it.processState === "failed" ? "failed" : isReady ? "ready" : "needs_review",
        };
      })
    );
  }

  // 2. Batch Action: Retry Extraction
  async function handleRetryExtraction() {
    const targets = items
      .map((it, idx) => {
        if (selectedItemIds.size > 0) {
          return selectedItemIds.has(it.localId) ? idx : -1;
        }
        const isUnextracted = it.entries.length === 0 || it.closingBalance === null || !it.statementDate;
        return (it.processState === "failed" || it.processState === "needs_review" || isUnextracted) &&
          validateSoaFile(it.file).valid
          ? idx
          : -1;
      })
      .filter((idx) => idx >= 0);

    if (targets.length === 0) return;

    setProcessing(true);
    const { data: sessionData } = await supabase.auth.getSession();
    const accessToken = sessionData?.session?.access_token || "";
    const resolvedCompanyId = companyId || (await getCompanyId().catch(() => ""));
    const batchId = `soa_retry_${Date.now()}`;

    const next = [...items];
    for (const idx of targets) {
      next[idx] = { ...next[idx], processState: "uploading", errorMessage: undefined };
      setItems([...next]);
      next[idx] = await uploadAndExtractSingle(
        next[idx],
        accessToken,
        batchId,
        resolvedCompanyId
      );
      setItems([...next]);
    }
    setProcessing(false);
  }

  function updateItem(localId: string, patch: Partial<StagedSoaItem>) {
    setItems((prev) =>
      prev.map((it) => {
        if (it.localId !== localId) return it;
        const merged = { ...it, ...patch };
        // Re-evaluate duplicate if customer or SOA number changed
        if (patch.customerId !== undefined || patch.soaNumber !== undefined) {
          const dup = detectSoaDuplicate(
            {
              customerId: merged.customerId,
              soaNumber: merged.soaNumber,
              fileName: merged.fileName,
              checksumSha256: merged.checksumSha256,
            },
            existingStatements
          );
          merged.isDuplicate = dup.isDuplicate;
          merged.duplicateReason = dup.reason;
          merged.existingAttachmentId = dup.existingRecord?.id;
          if (!dup.isDuplicate) {
            merged.duplicateAction = "none";
            merged.confirmReplace = false;
          } else if (merged.duplicateAction === "none") {
            merged.duplicateAction = "skip";
          }
        }
        const hasCustomer =
          Boolean(merged.customerId) ||
          (merged.createNewCustomer && Boolean(merged.newCustomerName.trim()) && merged.confirmNewCustomer);
        const hasDate = Boolean(merged.statementDate);
        const hasBalance = merged.closingBalance !== null && merged.closingBalance !== undefined;
        const isReady =
          hasCustomer &&
          Boolean(merged.soaNumber.trim()) &&
          hasDate &&
          hasBalance &&
          !merged.isDuplicate &&
          !merged.isScannedPdf &&
          merged.entries.length > 0;

        if (merged.processState !== "failed") {
          merged.processState = isReady ? "ready" : "needs_review";
          merged.isVerified = isReady;
        }
        return merged;
      })
    );
  }

  function removeItem(localId: string) {
    if (editingRowsItemId === localId) {
      handleCloseReviewScreen();
    }
    setSelectedItemIds((prev) => {
      const next = new Set(prev);
      next.delete(localId);
      return next;
    });
    setItems((prev) => prev.filter((it) => it.localId !== localId));
  }

  // 3. Batch Action: Import Execution (Verified only or All)
  async function executeImport(options?: { verifiedOnly?: boolean }) {
    setErrorBanner("");
    const verifiedOnly = Boolean(options?.verifiedOnly);

    const eligibleItems = items.filter((it) => {
      if (it.processState === "failed") return false;
      if (it.isDuplicate && it.duplicateAction === "skip") return false;
      if (verifiedOnly) {
        return (it.isVerified || it.processState === "ready") && !it.isDuplicate;
      }
      return true;
    });

    if (eligibleItems.length === 0) {
      setErrorBanner(verifiedOnly ? "No verified SOA items ready to import." : "No SOA items to import.");
      return;
    }

    const missingCustomer = eligibleItems.find(
      (it) =>
        !it.customerId &&
        !(it.createNewCustomer && it.newCustomerName.trim() && it.confirmNewCustomer)
    );
    if (missingCustomer) {
      setErrorBanner(
        `Please select or confirm a customer for "${missingCustomer.fileName}" before importing.`
      );
      return;
    }

    const unconfirmedReplace = eligibleItems.find(
      (it) => it.isDuplicate && it.duplicateAction === "replace" && !it.confirmReplace
    );
    if (unconfirmedReplace) {
      setErrorBanner(
        `Please check the confirmation box to replace duplicate "${unconfirmedReplace.fileName}".`
      );
      return;
    }

    setSavingAll(true);
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const accessToken = sessionData?.session?.access_token || "";
      const resolvedCompanyId = companyId || (await getCompanyId().catch(() => ""));

      const payloadItems = eligibleItems.map((it) => {
        const itemVerified = Boolean(
          it.isVerified ||
          (it.processState === "ready" && !it.isDuplicate && it.entries.length > 0 && it.closingBalance !== null)
        );
        return {
          fileName: it.fileName,
          fileType: it.fileType,
          fileSize: it.fileSize,
          storagePath: it.storagePath,
          storageBucket: it.storageBucket,
          customerId: it.createNewCustomer ? undefined : it.customerId,
          newCustomerName: it.createNewCustomer ? it.newCustomerName.trim() : undefined,
          soaNumber: it.soaNumber.trim() || it.fileName,
          statementDate: it.statementDate || null,
          fromDate: it.fromDate,
          toDate: it.toDate,
          openingBalance: it.openingBalance || 0,
          charges: it.charges || 0,
          credits: it.credits || 0,
          closingBalance: it.closingBalance !== undefined && it.closingBalance !== null ? it.closingBalance : null,
          entries: it.entries,
          cutoverDate: it.cutoverDate,
          isCutoverApproved: it.isCutoverApproved,
          checksumSha256: it.checksumSha256,
          needsReview: !itemVerified,
          isScannedPdf: it.isScannedPdf,
          isVerified: itemVerified,
          status: itemVerified ? ("verified" as const) : ("pending_verification" as const),
          duplicateAction: it.isDuplicate ? it.duplicateAction : "none",
          existingAttachmentId: it.existingAttachmentId,
        };
      });

      const res = await fetch("/api/customer-statements", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
        },
        body: JSON.stringify({ companyId: resolvedCompanyId, items: payloadItems }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data?.error || "Failed to save imported SOAs.");
      }

      setSaveSummary({
        imported: data.importedCount || 0,
        replaced: data.replacedCount || 0,
        skipped: data.skippedCount || 0,
        failed: (data.failedCount || 0) + items.filter((i) => i.processState === "failed").length,
      });
      setSummaryMsg(
        `Saved ${data.importedCount || 0} new and ${data.replacedCount || 0} replaced SOAs (${data.skippedCount || 0} duplicates skipped). Live invoices and payments were not modified.`
      );
      setStep("done");
      onImportComplete();
    } catch (err) {
      setErrorBanner(err instanceof Error ? err.message : "Failed to save SOAs.");
    } finally {
      setSavingAll(false);
    }
  }

  async function handleImportVerified() {
    await executeImport({ verifiedOnly: true });
  }

  async function handleImportAll() {
    await executeImport({ verifiedOnly: false });
  }

  const totalCount = items.length;
  const readyCount = items.filter((i) => i.processState === "ready" || i.isVerified).length;
  const reviewCount = items.filter((i) => i.processState === "needs_review" || (!i.isVerified && i.processState !== "failed")).length;
  const failedCount = items.filter((i) => i.processState === "failed").length;
  const issuesCount = items.filter(
    (i) =>
      i.processState === "needs_review" ||
      i.processState === "failed" ||
      i.isDuplicate ||
      i.closingBalance === null ||
      !i.statementDate ||
      !i.isVerified
  ).length;

  const filteredItems = items.filter((it) => {
    if (statusFilter === "issues") {
      return (
        it.processState === "needs_review" ||
        it.processState === "failed" ||
        it.isDuplicate ||
        it.closingBalance === null ||
        !it.statementDate ||
        !it.isVerified
      );
    }
    if (statusFilter === "ready") {
      return it.processState === "ready" || it.isVerified;
    }
    if (statusFilter === "failed") {
      return it.processState === "failed";
    }
    return true;
  });

  const allFilteredSelected =
    filteredItems.length > 0 &&
    filteredItems.every((it) => selectedItemIds.has(it.localId));

  function toggleSelectAll() {
    if (allFilteredSelected) {
      setSelectedItemIds(new Set());
    } else {
      const next = new Set(selectedItemIds);
      filteredItems.forEach((it) => next.add(it.localId));
      setSelectedItemIds(next);
    }
  }

  function toggleSelectRow(localId: string) {
    setSelectedItemIds((prev) => {
      const next = new Set(prev);
      if (next.has(localId)) {
        next.delete(localId);
      } else {
        next.add(localId);
      }
      return next;
    });
  }

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/85 backdrop-blur-sm flex items-center justify-center p-2 sm:p-4 overflow-y-auto">
      <div
        className={`w-full rounded-2xl bg-slate-900 border border-slate-700 shadow-2xl overflow-hidden text-slate-100 my-2 flex flex-col transition-all duration-200 ${
          editingRowsItemId ? "max-w-7xl h-[96vh]" : "max-w-6xl max-h-[92vh]"
        }`}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-800 bg-slate-900/90 shrink-0">
          <div className="flex items-center gap-3">
            <div className="rounded-xl bg-cyan-600/20 p-2 text-cyan-400 border border-cyan-500/30">
              <FileSpreadsheet size={20} />
            </div>
            <div>
              <h2 className="text-base font-bold text-white tracking-tight">
                Bulk Customer Statements Importer
              </h2>
              <p className="text-xs text-slate-400">
                Multi-file statement import with automatic customer matching, duplicate detection &amp; live spreadsheet editor
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={handleCloseModal}
            className="rounded-lg p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 transition cursor-pointer"
            title="Close modal"
          >
            <X size={18} />
          </button>
        </div>

        {/* Body */}
        <div className="p-5 flex-1 overflow-y-auto space-y-4">
          {step === "upload" && (
            <div
              onDragOver={(e) => {
                e.preventDefault();
                setIsDragging(true);
              }}
              onDragLeave={() => setIsDragging(false)}
              onDrop={(e) => {
                e.preventDefault();
                setIsDragging(false);
                if (e.dataTransfer.files?.length) {
                  void handleFilesSelected(e.dataTransfer.files);
                }
              }}
              className={`rounded-2xl border-2 border-dashed p-10 text-center transition-all ${
                isDragging
                  ? "border-cyan-400 bg-cyan-950/20 shadow-lg shadow-cyan-950/50"
                  : "border-slate-700 bg-slate-950/40 hover:border-slate-600"
              }`}
            >
              <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-cyan-950/80 border border-cyan-700 text-cyan-400 mb-4">
                <Upload size={24} />
              </div>
              <h3 className="text-sm font-bold text-white">
                Drag &amp; Drop Statement Files (PDF, Excel, CSV, or ZIP)
              </h3>
              <p className="mt-1 text-xs text-slate-400 max-w-md mx-auto">
                Upload one or dozens of Customer SOA documents at once. Supports single statements, bulk PDFs, Excel ledgers, or a ZIP archive.
              </p>

              <div className="mt-5 flex justify-center">
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="inline-flex items-center gap-2 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white px-5 py-2.5 text-xs font-bold transition shadow-sm cursor-pointer"
                >
                  <Upload size={14} />
                  <span>Select Files to Import</span>
                </button>
                <input
                  ref={fileInputRef}
                  type="file"
                  multiple
                  accept=".pdf,.xlsx,.xls,.csv,.zip"
                  onChange={(e) => {
                    if (e.target.files?.length) void handleFilesSelected(e.target.files);
                  }}
                  className="hidden"
                />
              </div>

              <div className="mt-6 flex flex-wrap items-center justify-center gap-3 text-[11px] text-slate-400 font-mono">
                <span className="px-2.5 py-1 rounded-lg bg-slate-900 border border-slate-800">PDF Statements</span>
                <span className="px-2.5 py-1 rounded-lg bg-slate-900 border border-slate-800">Excel (.xlsx, .xls)</span>
                <span className="px-2.5 py-1 rounded-lg bg-slate-900 border border-slate-800">CSV Ledgers</span>
                <span className="px-2.5 py-1 rounded-lg bg-slate-900 border border-slate-800">ZIP Archive</span>
              </div>
            </div>
          )}

          {step === "review" && (
            <>
              {/* Progress & Counters */}
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-800 bg-slate-950/60 p-3.5">
                <div className="flex flex-wrap items-center gap-4 text-xs">
                  <span>
                    Total Documents: <strong className="text-white">{totalCount}</strong>
                  </span>
                  <span className="text-emerald-300">
                    Verified: <strong>{readyCount}</strong>
                  </span>
                  <span className="text-amber-300">
                    Needs Review: <strong>{reviewCount}</strong>
                  </span>
                  {failedCount > 0 && (
                    <span className="text-rose-300">
                      Failed: <strong>{failedCount}</strong>
                    </span>
                  )}
                  {selectedItemIds.size > 0 && (
                    <span className="text-cyan-300 font-semibold">
                      Selected: <strong>{selectedItemIds.size}</strong>
                    </span>
                  )}
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={processing}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-800 hover:bg-slate-700 text-slate-200 px-3 py-1.5 font-semibold transition cursor-pointer disabled:opacity-50 text-xs"
                  >
                    <Upload size={12} />
                    <span>Add More Files</span>
                  </button>
                  <input
                    ref={fileInputRef}
                    type="file"
                    multiple
                    accept=".pdf,.xlsx,.xls,.csv,.zip"
                    onChange={(e) => {
                      if (e.target.files?.length) void handleFilesSelected(e.target.files);
                    }}
                    className="hidden"
                  />
                </div>
              </div>

              {processing && (
                <div className="rounded-xl border border-cyan-800/60 bg-cyan-950/30 p-3 space-y-2">
                  <div className="flex items-center justify-between text-cyan-200 text-xs">
                    <span className="flex items-center gap-2 font-semibold">
                      <Loader2 size={14} className="animate-spin" />
                      Uploading &amp; extracting SOA details...
                    </span>
                    <span className="font-mono">
                      {processedCount} / {totalCount}
                    </span>
                  </div>
                  <div className="h-2 rounded-full bg-slate-800 overflow-hidden">
                    <div
                      className="h-full bg-cyan-500 transition-all duration-300"
                      style={{
                        width: `${totalCount > 0 ? Math.round((processedCount / totalCount) * 100) : 0}%`,
                      }}
                    />
                  </div>
                </div>
              )}

              {errorBanner && (
                <div className="flex items-center gap-2 rounded-xl bg-rose-950/70 border border-rose-800 p-3 text-rose-200 text-xs">
                  <AlertTriangle size={15} className="text-rose-400 shrink-0" />
                  <span>{errorBanner}</span>
                </div>
              )}

              {/* Content View: Either Spreadsheet Editor or Compact Batch Table */}
              {editingRowsItemId && activeItem ? (
                <div className="flex flex-col h-full space-y-3">
                  {/* Subheader Toolbar */}
                  <div className="flex flex-wrap items-center justify-between gap-3 bg-slate-900/90 border border-slate-800 rounded-xl p-3 shrink-0">
                    <div className="flex items-center gap-3">
                      <button
                        type="button"
                        onClick={handleCloseReviewScreen}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-800 hover:bg-slate-700 text-slate-200 px-3 py-1.5 text-xs font-semibold transition cursor-pointer"
                      >
                        <ArrowLeft size={14} />
                        <span>Back to Files</span>
                      </button>
                      <div>
                        <h3 className="text-sm font-bold text-white flex items-center gap-2">
                          <span>{activeItem.fileName}</span>
                          <span className="text-[11px] font-mono font-normal text-cyan-400">
                            ({activeItem.entries.length} rows)
                          </span>
                        </h3>
                        <p className="text-[11px] text-slate-400">
                          Click cells to edit. Press Tab or Enter to navigate. Recalculates running balances live.
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setShowSplitPreview(!showSplitPreview)}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-800 hover:bg-slate-700 text-slate-300 px-3 py-1.5 text-xs font-medium transition cursor-pointer"
                      >
                        {showSplitPreview ? <EyeOff size={13} /> : <Eye size={13} />}
                        <span>{showSplitPreview ? "Hide Original" : "Show Original"}</span>
                      </button>
                      <button
                        type="button"
                        onClick={handleCloseReviewScreen}
                        className="inline-flex items-center gap-1.5 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white px-3.5 py-1.5 text-xs font-bold transition shadow-sm cursor-pointer"
                      >
                        <CheckCircle2 size={14} />
                        <span>Done Editing</span>
                      </button>
                    </div>
                  </div>

                  {/* Metadata & Live Discrepancy Banner */}
                  <div className="grid grid-cols-1 sm:grid-cols-6 gap-2.5 bg-slate-950/70 border border-slate-800/80 rounded-xl p-3 text-xs shrink-0">
                    <div className="sm:col-span-2 space-y-1">
                      <label className="text-[10px] text-slate-400 uppercase font-semibold">Customer</label>
                      <select
                        value={activeItem.customerId}
                        onChange={(e) => updateItem(activeItem.localId, { customerId: e.target.value })}
                        className="w-full rounded-lg border border-slate-700 bg-slate-900 px-2.5 py-1.5 text-xs text-white focus:border-cyan-500 focus:outline-none"
                      >
                        <option value="">-- Select Customer --</option>
                        {customers.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.name}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="space-y-1">
                      <label className="text-[10px] text-slate-400 uppercase font-semibold">Opening (AED)</label>
                      <input
                        type="number"
                        step="0.01"
                        value={activeItem.openingBalance}
                        onChange={(e) => {
                          const val = parseNum(e.target.value);
                          const { computedEntries, totalDebits, totalCredits, closingBal } = recalcEntries(
                            val,
                            activeItem.entries
                          );
                          updateItem(activeItem.localId, {
                            openingBalance: val,
                            entries: computedEntries,
                            charges: totalDebits,
                            credits: totalCredits,
                            closingBalance: closingBal,
                          });
                        }}
                        className="w-full rounded-lg border border-slate-700 bg-slate-900 px-2 py-1.5 text-xs text-white font-mono focus:border-cyan-500 focus:outline-none text-right"
                      />
                    </div>

                    <div className="space-y-1">
                      <label className="text-[10px] text-slate-400 uppercase font-semibold">Total Debits</label>
                      <div className="rounded-lg bg-slate-900 border border-slate-800 px-2 py-1.5 text-xs font-mono text-cyan-300 text-right">
                        AED {activeItem.charges.toFixed(2)}
                      </div>
                    </div>

                    <div className="space-y-1">
                      <label className="text-[10px] text-slate-400 uppercase font-semibold">Total Credits</label>
                      <div className="rounded-lg bg-slate-900 border border-slate-800 px-2 py-1.5 text-xs font-mono text-emerald-300 text-right">
                        AED {activeItem.credits.toFixed(2)}
                      </div>
                    </div>

                    <div className="space-y-1">
                      <label className="text-[10px] text-slate-400 uppercase font-semibold">Closing Balance</label>
                      <div className="rounded-lg bg-slate-900 border border-slate-800 px-2 py-1.5 text-xs font-mono font-bold text-white text-right">
                        {activeItem.closingBalance !== null ? `AED ${activeItem.closingBalance.toFixed(2)}` : "Not extracted"}
                      </div>
                    </div>

                    {/* Balance Discrepancy Indicator Pill */}
                    <div className="sm:col-span-6 flex items-center justify-between pt-1 border-t border-slate-800/60">
                      <div className="flex items-center gap-2">
                        {activeItem.closingBalance === null || activeItem.closingBalance === undefined ? (
                          <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-950/80 border border-amber-700 px-3 py-1 text-xs font-semibold text-amber-300">
                            <AlertTriangle size={13} />
                            <span>Closing balance: Not extracted</span>
                          </span>
                        ) : Math.abs(activeItem.closingBalance - (activeItem.openingBalance + activeItem.charges - activeItem.credits)) < 0.05 ? (
                          <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-950/80 border border-emerald-700 px-3 py-1 text-xs font-semibold text-emerald-300">
                            <CheckCircle2 size={13} />
                            <span>Matched (AED {activeItem.closingBalance.toFixed(2)})</span>
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1.5 rounded-full bg-rose-950/80 border border-rose-700 px-3 py-1 text-xs font-semibold text-rose-300">
                            <AlertTriangle size={13} />
                            <span>Discrepancy: AED {Math.abs(activeItem.closingBalance - (activeItem.openingBalance + activeItem.charges - activeItem.credits)).toFixed(2)}</span>
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Historical Cutover Checkbox & Action Tools */}
                  <div className="flex flex-wrap items-center justify-between gap-3 bg-slate-900/60 border border-slate-800 rounded-xl px-3.5 py-2 text-xs shrink-0">
                    <div className="flex items-center gap-3">
                      <label className="flex items-center gap-1.5 cursor-pointer text-slate-300">
                        <input
                          type="checkbox"
                          checked={Boolean(activeItem.isCutoverApproved)}
                          onChange={(e) =>
                            updateItem(activeItem.localId, {
                              isCutoverApproved: e.target.checked,
                              cutoverDate: e.target.checked ? activeItem.cutoverDate || activeItem.statementDate || undefined : undefined,
                            })
                          }
                          className="rounded border-slate-600 bg-slate-900"
                        />
                        <span className="font-semibold text-white">Set Cutover Date for Statement</span>
                      </label>
                      {activeItem.isCutoverApproved && (
                        <div className="flex items-center gap-1.5">
                          <span className="text-slate-400 text-[11px]">Cutover on:</span>
                          <input
                            type="date"
                            value={activeItem.cutoverDate || activeItem.statementDate || ""}
                            onChange={(e) => updateItem(activeItem.localId, { cutoverDate: e.target.value })}
                            className="rounded border border-slate-700 bg-slate-900 px-2 py-0.5 text-xs text-white"
                          />
                        </div>
                      )}
                    </div>

                    {/* Row action tools */}
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={handleAddRow}
                        className="inline-flex items-center gap-1 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 px-2.5 py-1 text-xs font-semibold cursor-pointer"
                      >
                        <Plus size={13} />
                        <span>Add Row</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => setPastePromptOpen(true)}
                        className="inline-flex items-center gap-1 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 px-2.5 py-1 text-xs font-semibold cursor-pointer"
                      >
                        <Clipboard size={13} />
                        <span>Paste Excel Rows</span>
                      </button>
                      <button
                        type="button"
                        disabled={undoStack.length === 0}
                        onClick={handleUndo}
                        className="p-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 disabled:opacity-40 cursor-pointer"
                        title="Undo (Ctrl+Z)"
                      >
                        <Undo size={14} />
                      </button>
                      <button
                        type="button"
                        disabled={redoStack.length === 0}
                        onClick={handleRedo}
                        className="p-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 disabled:opacity-40 cursor-pointer"
                        title="Redo (Ctrl+Y)"
                      >
                        <Redo size={14} />
                      </button>
                    </div>
                  </div>

                  {/* Paste Modal Prompt */}
                  {pastePromptOpen && (
                    <div className="rounded-xl border border-cyan-700 bg-slate-900 p-4 space-y-3 shrink-0">
                      <div className="flex items-center justify-between">
                        <h4 className="text-xs font-bold text-white">Paste Rows from Excel / Spreadsheet</h4>
                        <button type="button" onClick={() => setPastePromptOpen(false)} className="text-slate-400 hover:text-white">
                          <X size={14} />
                        </button>
                      </div>
                      <p className="text-[11px] text-slate-400">
                        Copy rows in Excel (Date | Reference | Description | Debit | Credit) and paste below:
                      </p>
                      <textarea
                        rows={3}
                        value={rawPasteText}
                        onChange={(e) => setRawPasteText(e.target.value)}
                        placeholder="2026-01-15	INV-001	Tax Invoice	5000.00	0.00"
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

                  {/* Split View Container: Left pane PDF viewer iframe, Right pane Spreadsheet table */}
                  <div className={`grid gap-3 flex-1 overflow-hidden min-h-[380px] ${showSplitPreview ? "grid-cols-1 lg:grid-cols-2" : "grid-cols-1"}`}>
                    {/* Left Pane: Original Document Preview / PDF Viewer */}
                    {showSplitPreview && (
                      <div className="rounded-xl border border-slate-800 bg-slate-900/50 overflow-hidden flex flex-col h-full">
                        <div className="bg-slate-900 px-3 py-2 border-b border-slate-800 text-[11px] text-slate-400 flex items-center justify-between shrink-0">
                          <span>Original Document: <strong className="text-white">{activeItem.fileName}</strong></span>
                          <span className="font-mono text-[10px]">
                            {activeItem.ext.toUpperCase()} • {Math.max(1, Math.round(activeItem.fileSize / 1024))} KB
                          </span>
                        </div>
                        <div className="flex-1 bg-slate-950 p-2 overflow-hidden flex items-center justify-center">
                          {previewBlobUrl && activeItem.ext === "pdf" ? (
                            <iframe
                              src={previewBlobUrl}
                              title="Original PDF Document"
                              className="w-full h-full min-h-[380px] rounded border border-slate-800 bg-white"
                            />
                          ) : activeItem.storagePath && activeItem.ext === "pdf" ? (
                            <iframe
                              src={`/api/smart-import/storage?path=${encodeURIComponent(activeItem.storagePath)}&bucket=${encodeURIComponent(activeItem.storageBucket || "smart-imports")}`}
                              title="Original PDF Document"
                              className="w-full h-full min-h-[380px] rounded border border-slate-800 bg-white"
                            />
                          ) : (
                            <div className="text-center p-6 space-y-2 text-slate-400">
                              <FileSpreadsheet size={32} className="mx-auto text-emerald-400" />
                              <p className="text-xs font-semibold text-white">{activeItem.fileName}</p>
                              <p className="text-[11px]">
                                Original spreadsheet parsed ({activeItem.entries.length} rows loaded into the editor).
                              </p>
                            </div>
                          )}
                        </div>
                      </div>
                    )}

                    {/* Right Pane: Spreadsheet Table */}
                    <div
                      className="rounded-xl border border-slate-800 bg-slate-950/60 overflow-y-auto flex flex-col h-full"
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
                            <th className="py-2 px-2 text-center w-8">#</th>
                            <th className="py-2 px-2 text-left w-28">Date</th>
                            <th className="py-2 px-2 text-left w-24">Reference</th>
                            <th className="py-2 px-2 text-left">Description</th>
                            <th className="py-2 px-2 text-right w-24">Debit</th>
                            <th className="py-2 px-2 text-right w-24">Credit</th>
                            <th className="py-2 px-2 text-right w-24">Balance</th>
                            <th className="py-2 px-1 text-center w-10"></th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-800/60">
                          {activeItem.entries.map((row, idx) => (
                            <tr key={row.id} className="hover:bg-slate-900/50">
                              <td className="py-1 px-2 text-center text-slate-500 font-mono text-[10px]">
                                {idx + 1}
                              </td>
                              <td className="py-1 px-1">
                                <input
                                  type="date"
                                  value={row.date?.slice(0, 10) || ""}
                                  onChange={(e) => handleRowFieldChange(row.id, "date", e.target.value)}
                                  className="w-full bg-slate-900 border border-slate-800 rounded px-1.5 py-1 text-[11px] text-white focus:border-cyan-500 focus:outline-none"
                                />
                              </td>
                              <td className="py-1 px-1">
                                <input
                                  type="text"
                                  value={row.reference_no || ""}
                                  onChange={(e) => handleRowFieldChange(row.id, "reference_no", e.target.value)}
                                  className="w-full bg-slate-900 border border-slate-800 rounded px-1.5 py-1 text-[11px] font-mono text-cyan-300 focus:border-cyan-500 focus:outline-none"
                                />
                              </td>
                              <td className="py-1 px-1">
                                <input
                                  type="text"
                                  value={row.description || ""}
                                  onChange={(e) => handleRowFieldChange(row.id, "description", e.target.value)}
                                  className="w-full bg-slate-900 border border-slate-800 rounded px-1.5 py-1 text-[11px] text-slate-200 focus:border-cyan-500 focus:outline-none"
                                />
                              </td>
                              <td className="py-1 px-1">
                                <input
                                  type="number"
                                  step="0.01"
                                  value={row.debit || ""}
                                  onChange={(e) => handleRowFieldChange(row.id, "debit", parseNum(e.target.value))}
                                  className="w-full bg-slate-900 border border-slate-800 rounded px-1.5 py-1 text-[11px] text-right font-mono text-white focus:border-cyan-500 focus:outline-none"
                                />
                              </td>
                              <td className="py-1 px-1">
                                <input
                                  type="number"
                                  step="0.01"
                                  value={row.credit || ""}
                                  onChange={(e) => handleRowFieldChange(row.id, "credit", parseNum(e.target.value))}
                                  className="w-full bg-slate-900 border border-slate-800 rounded px-1.5 py-1 text-[11px] text-right font-mono text-white focus:border-cyan-500 focus:outline-none"
                                />
                              </td>
                              <td className="py-1 px-2 text-right font-mono text-[11px] text-slate-300">
                                {row.balance !== undefined ? Number(row.balance).toFixed(2) : "—"}
                              </td>
                              <td className="py-1 px-1 text-center">
                                <button
                                  type="button"
                                  onClick={() => handleDeleteRow(row.id)}
                                  className="text-slate-500 hover:text-rose-400 p-1 cursor-pointer"
                                  title="Delete row"
                                >
                                  <Trash2 size={13} />
                                </button>
                              </td>
                            </tr>
                          ))}
                          {activeItem.entries.length === 0 && (
                            <tr>
                              <td colSpan={8} className="py-8 text-center text-slate-500">
                                No transaction rows extracted. Click <strong>Add Row</strong> or <strong>Paste Excel Rows</strong> to enter historical entries.
                              </td>
                            </tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              ) : (
                /* Compact Table View with Batch Actions Toolbar */
                <div className="space-y-3">
                  {/* Batch Actions Toolbar */}
                  <div className="flex flex-wrap items-center justify-between gap-3 bg-slate-900 border border-slate-800 rounded-xl p-3 text-xs">
                    {/* Left: Apply Customer to All & Retry Extraction */}
                    <div className="flex flex-wrap items-center gap-2">
                      <div className="flex items-center gap-1.5">
                        <select
                          value={batchCustomerId}
                          onChange={(e) => setBatchCustomerId(e.target.value)}
                          className="rounded-lg border border-slate-700 bg-slate-950 px-2.5 py-1.5 text-xs text-white max-w-[200px] truncate focus:border-cyan-500 focus:outline-none"
                        >
                          <option value="">-- Apply Customer to All --</option>
                          {customers.map((c) => (
                            <option key={c.id} value={c.id}>
                              {c.name}
                            </option>
                          ))}
                        </select>
                        <button
                          type="button"
                          disabled={!batchCustomerId}
                          onClick={() => handleApplyCustomerToAll(batchCustomerId)}
                          className="inline-flex items-center gap-1 rounded-lg bg-cyan-700 hover:bg-cyan-600 disabled:opacity-40 text-white px-3 py-1.5 font-semibold transition cursor-pointer"
                          title="Apply selected customer across all or selected files"
                        >
                          <span>Apply Customer to All</span>
                        </button>
                      </div>

                      <button
                        type="button"
                        onClick={handleRetryExtraction}
                        disabled={processing}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-800 hover:bg-slate-700 text-slate-200 px-3 py-1.5 font-semibold transition cursor-pointer disabled:opacity-50"
                        title="Re-parse failed, unextracted, or selected documents"
                      >
                        <RotateCw size={13} className={processing ? "animate-spin" : ""} />
                        <span>Retry Extraction</span>
                      </button>
                    </div>

                    {/* Right: Review Issues Filter & Import Verified Shortcut */}
                    <div className="flex flex-wrap items-center gap-2">
                      {/* Filter tabs */}
                      <div className="inline-flex rounded-lg border border-slate-800 bg-slate-950 p-0.5 text-xs">
                        <button
                          type="button"
                          onClick={() => setStatusFilter("all")}
                          className={`px-2.5 py-1 rounded-md font-medium transition cursor-pointer ${
                            statusFilter === "all" ? "bg-slate-800 text-white font-bold" : "text-slate-400 hover:text-white"
                          }`}
                        >
                          All ({totalCount})
                        </button>
                        <button
                          type="button"
                          onClick={() => setStatusFilter("issues")}
                          className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-md font-medium transition cursor-pointer ${
                            statusFilter === "issues"
                              ? "bg-amber-950 text-amber-200 border border-amber-800 font-bold"
                              : issuesCount > 0
                              ? "text-amber-400 hover:text-amber-200"
                              : "text-slate-400 hover:text-white"
                          }`}
                        >
                          <AlertTriangle size={11} />
                          <span>Review Issues ({issuesCount})</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => setStatusFilter("ready")}
                          className={`px-2.5 py-1 rounded-md font-medium transition cursor-pointer ${
                            statusFilter === "ready" ? "bg-emerald-950 text-emerald-200 border border-emerald-800 font-bold" : "text-slate-400 hover:text-white"
                          }`}
                        >
                          Verified ({readyCount})
                        </button>
                        {failedCount > 0 && (
                          <button
                            type="button"
                            onClick={() => setStatusFilter("failed")}
                            className={`px-2.5 py-1 rounded-md font-medium transition cursor-pointer ${
                              statusFilter === "failed" ? "bg-rose-950 text-rose-200 border border-rose-800 font-bold" : "text-rose-400 hover:text-rose-200"
                            }`}
                          >
                            Error ({failedCount})
                          </button>
                        )}
                      </div>

                      {readyCount > 0 && (
                        <button
                          type="button"
                          onClick={handleImportVerified}
                          disabled={processing || savingAll}
                          className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white px-3 py-1.5 font-bold transition shadow-sm cursor-pointer disabled:opacity-50"
                        >
                          <CheckCircle2 size={13} />
                          <span>Import Verified ({readyCount})</span>
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Compact High-Density Table */}
                  <div className="overflow-x-auto rounded-xl border border-slate-800 bg-slate-950/60 shadow-sm">
                    <table className="w-full text-xs border-collapse">
                      <thead className="bg-slate-900 border-b border-slate-800 text-slate-400 uppercase text-[10px] font-mono sticky top-0 z-10">
                        <tr>
                          <th className="py-2.5 px-3 text-center w-10">
                            <input
                              type="checkbox"
                              checked={allFilteredSelected}
                              onChange={toggleSelectAll}
                              className="rounded border-slate-600 bg-slate-900 cursor-pointer"
                              title="Select all"
                            />
                          </th>
                          <th className="py-2.5 px-3 text-left w-56">Filename</th>
                          <th className="py-2.5 px-3 text-left w-52">Customer</th>
                          <th className="py-2.5 px-3 text-left w-36">SOA Number</th>
                          <th className="py-2.5 px-3 text-center w-28">Date</th>
                          <th className="py-2.5 px-3 text-right w-32">Closing Balance</th>
                          <th className="py-2.5 px-3 text-center w-20">Rows</th>
                          <th className="py-2.5 px-3 text-center w-36">Status</th>
                          <th className="py-2.5 px-3 text-right w-24">Edit</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-800/60">
                        {filteredItems.map((it) => {
                          const isSelected = selectedItemIds.has(it.localId);
                          return (
                            <React.Fragment key={it.localId}>
                              <tr
                                className={`hover:bg-slate-900/60 transition ${
                                  isSelected ? "bg-cyan-950/20" : ""
                                } ${
                                  it.processState === "failed"
                                    ? "bg-rose-950/10"
                                    : it.processState === "needs_review"
                                    ? "bg-amber-950/10"
                                    : ""
                                }`}
                              >
                                {/* 1. Checkbox */}
                                <td className="py-2 px-3 text-center">
                                  <input
                                    type="checkbox"
                                    checked={isSelected}
                                    onChange={() => toggleSelectRow(it.localId)}
                                    className="rounded border-slate-600 bg-slate-900 cursor-pointer"
                                  />
                                </td>

                                {/* 2. Filename */}
                                <td className="py-2 px-3">
                                  <div className="flex items-center gap-2 min-w-0">
                                    {it.ext === "pdf" ? (
                                      <FileText size={15} className="text-rose-400 shrink-0" />
                                    ) : (
                                      <FileSpreadsheet size={15} className="text-emerald-400 shrink-0" />
                                    )}
                                    <span
                                      className="font-semibold text-white truncate max-w-[190px]"
                                      title={it.fileName}
                                    >
                                      {it.fileName}
                                    </span>
                                    <span className="text-[10px] text-slate-400 font-mono shrink-0">
                                      ({Math.max(1, Math.round(it.fileSize / 1024))} KB)
                                    </span>
                                  </div>
                                </td>

                                {/* 3. Customer */}
                                <td className="py-2 px-3">
                                  {!it.createNewCustomer ? (
                                    <select
                                      value={it.customerId}
                                      onChange={(e) => updateItem(it.localId, { customerId: e.target.value })}
                                      className="w-full rounded-lg border border-slate-700 bg-slate-900 px-2 py-1 text-xs text-white focus:border-cyan-500 focus:outline-none"
                                      title={it.customerMatchReason || "Select customer"}
                                    >
                                      <option value="">-- Select Customer --</option>
                                      {it.customerSuggestions.length > 0 && (
                                        <optgroup label="Suggested Matches">
                                          {it.customerSuggestions.map((s) => (
                                            <option key={`sug-${s.id}`} value={s.id}>
                                              {s.name} ({Math.round(s.score * 100)}%)
                                            </option>
                                          ))}
                                        </optgroup>
                                      )}
                                      <optgroup label="All Customers">
                                        {customers.map((c) => (
                                          <option key={c.id} value={c.id}>
                                            {c.name}
                                          </option>
                                        ))}
                                      </optgroup>
                                    </select>
                                  ) : (
                                    <div className="flex items-center gap-1.5">
                                      <input
                                        type="text"
                                        value={it.newCustomerName}
                                        placeholder="New customer"
                                        onChange={(e) => updateItem(it.localId, { newCustomerName: e.target.value })}
                                        className="w-full rounded-lg border border-cyan-700 bg-slate-900 px-2 py-1 text-xs text-white focus:border-cyan-500 focus:outline-none"
                                      />
                                    </div>
                                  )}
                                </td>

                                {/* 4. SOA Number */}
                                <td className="py-2 px-3">
                                  <div className="space-y-1">
                                    <input
                                      type="text"
                                      value={it.soaNumber}
                                      onChange={(e) => updateItem(it.localId, { soaNumber: e.target.value })}
                                      className="w-full rounded-lg border border-slate-700 bg-slate-900 px-2 py-1 text-xs font-mono text-white focus:border-cyan-500 focus:outline-none"
                                    />
                                    {it.numberConflict && (
                                      <span
                                        className="inline-flex items-center gap-1 text-[10px] text-amber-300 font-sans bg-amber-950/80 border border-amber-800 rounded px-1.5 py-0.5"
                                        title={it.numberConflict}
                                      >
                                        <AlertTriangle size={10} className="shrink-0" />
                                        <span>PDF text: {it.internalDocumentNumber}</span>
                                      </span>
                                    )}
                                  </div>
                                </td>

                                {/* 5. Statement Date */}
                                <td className="py-2 px-3 text-center">
                                  {it.statementDate ? (
                                    <span className="font-mono text-slate-300">
                                      {formatDisplayDate(it.statementDate)}
                                    </span>
                                  ) : (
                                    <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-semibold bg-amber-950/70 border border-amber-800 text-amber-300">
                                      Unknown
                                    </span>
                                  )}
                                </td>

                                {/* 6. Closing Balance */}
                                <td className="py-2 px-3 text-right">
                                  {it.closingBalance !== null && it.closingBalance !== undefined ? (
                                    <span className="font-mono font-bold text-white">
                                      AED {it.closingBalance.toFixed(2)}
                                    </span>
                                  ) : (
                                    <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-semibold bg-amber-950/70 border border-amber-800 text-amber-300">
                                      Not extracted
                                    </span>
                                  )}
                                </td>

                                {/* 7. Rows */}
                                <td className="py-2 px-3 text-center">
                                  <span
                                    className={`font-mono ${
                                      it.entries.length === 0 ? "text-amber-400 font-semibold" : "text-slate-300"
                                    }`}
                                  >
                                    {it.entries.length} rows
                                  </span>
                                </td>

                                {/* 8. Status */}
                                <td className="py-2 px-3 text-center">
                                  {it.processState === "uploading" || it.processState === "queued" ? (
                                    <span className="inline-flex items-center gap-1 rounded-full bg-slate-800 border border-slate-700 px-2 py-0.5 text-[10px] text-slate-300">
                                      <Loader2 size={10} className="animate-spin" /> Processing
                                    </span>
                                  ) : it.processState === "failed" ? (
                                    <span
                                      className="inline-flex items-center gap-1 rounded-full bg-rose-950 border border-rose-800 px-2 py-0.5 text-[10px] font-semibold text-rose-300"
                                      title={it.errorMessage}
                                    >
                                      Error
                                    </span>
                                  ) : it.isDuplicate ? (
                                    <span className="inline-flex items-center gap-1 rounded-full bg-amber-950 border border-amber-700 px-2 py-0.5 text-[10px] font-semibold text-amber-300">
                                      Duplicate
                                    </span>
                                  ) : it.isVerified || it.processState === "ready" ? (
                                    <span className="inline-flex items-center gap-1 rounded-full bg-emerald-950 border border-emerald-700 px-2 py-0.5 text-[10px] font-semibold text-emerald-300">
                                      Verified
                                    </span>
                                  ) : it.isScannedPdf ? (
                                    <span className="inline-flex items-center gap-1 rounded-full bg-amber-950 border border-amber-700 px-2 py-0.5 text-[10px] font-semibold text-amber-300">
                                      Needs Review
                                    </span>
                                  ) : (
                                    <span className="inline-flex items-center gap-1 rounded-full bg-cyan-950 border border-cyan-800 px-2 py-0.5 text-[10px] font-semibold text-cyan-300">
                                      Pending Verification
                                    </span>
                                  )}
                                </td>

                                {/* 9. Actions */}
                                <td className="py-2 px-3 text-right">
                                  <div className="flex items-center justify-end gap-1.5">
                                    <button
                                      type="button"
                                      onClick={() => handleOpenReviewScreen(it.localId)}
                                      className="inline-flex items-center gap-1 rounded-lg border border-cyan-700/70 bg-cyan-950/60 hover:bg-cyan-900 text-cyan-300 px-2.5 py-1 text-xs font-semibold cursor-pointer transition"
                                      title="Open side-by-side spreadsheet editor"
                                    >
                                      <FileSpreadsheet size={13} />
                                      <span>Edit</span>
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => removeItem(it.localId)}
                                      className="p-1 text-slate-500 hover:text-rose-400 rounded transition cursor-pointer"
                                      title="Remove from batch"
                                    >
                                      <Trash2 size={13} />
                                    </button>
                                  </div>
                                </td>
                              </tr>

                              {/* Duplicate Resolution Sub-Row */}
                              {it.isDuplicate && (
                                <tr className="bg-amber-950/20 border-t border-amber-800/40">
                                  <td colSpan={9} className="py-2 px-4">
                                    <div className="flex flex-wrap items-center justify-between gap-3 text-xs">
                                      <div className="flex items-center gap-2 text-amber-200">
                                        <CopyCheck size={14} className="text-amber-400 shrink-0" />
                                        <span>Duplicate detected: {it.duplicateReason}</span>
                                      </div>
                                      <div className="flex flex-wrap items-center gap-3">
                                        <label className="flex items-center gap-1 cursor-pointer text-slate-300">
                                          <input
                                            type="radio"
                                            name={`dup-${it.localId}`}
                                            checked={it.duplicateAction === "skip"}
                                            onChange={() =>
                                              updateItem(it.localId, {
                                                duplicateAction: "skip",
                                                confirmReplace: false,
                                              })
                                            }
                                          />
                                          <span>Skip</span>
                                        </label>
                                        <label className="flex items-center gap-1 cursor-pointer text-rose-300">
                                          <input
                                            type="radio"
                                            name={`dup-${it.localId}`}
                                            checked={it.duplicateAction === "replace"}
                                            onChange={() =>
                                              updateItem(it.localId, { duplicateAction: "replace" })
                                            }
                                          />
                                          <span>Replace</span>
                                        </label>
                                        <label className="flex items-center gap-1 cursor-pointer text-rose-200 font-semibold">
                                          <input
                                            type="checkbox"
                                            checked={it.confirmReplace}
                                            onChange={(e) =>
                                              updateItem(it.localId, { confirmReplace: e.target.checked })
                                            }
                                          />
                                          <span>Confirm overwrite</span>
                                        </label>
                                      </div>
                                    </div>
                                  </td>
                                </tr>
                              )}
                            </React.Fragment>
                          );
                        })}

                        {filteredItems.length === 0 && (
                          <tr>
                            <td colSpan={9} className="py-10 text-center text-slate-500">
                              No items match the selected filter.
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </>
          )}

          {step === "done" && saveSummary && (
            <div className="rounded-2xl border border-emerald-800/70 bg-emerald-950/30 p-6 text-center space-y-3">
              <CheckCircle2 size={40} className="mx-auto text-emerald-400" />
              <h3 className="text-base font-bold text-white">SOA Import Complete</h3>
              <p className="text-xs text-emerald-200/90 max-w-lg mx-auto">{summaryMsg}</p>
              <div className="flex flex-wrap justify-center gap-4 pt-2 text-xs font-mono">
                <span className="px-3 py-1 rounded-lg bg-slate-900 border border-emerald-800 text-emerald-300">
                  Imported: {saveSummary.imported}
                </span>
                <span className="px-3 py-1 rounded-lg bg-slate-900 border border-cyan-800 text-cyan-300">
                  Replaced: {saveSummary.replaced}
                </span>
                <span className="px-3 py-1 rounded-lg bg-slate-900 border border-slate-700 text-slate-300">
                  Skipped: {saveSummary.skipped}
                </span>
                {saveSummary.failed > 0 && (
                  <span className="px-3 py-1 rounded-lg bg-slate-900 border border-rose-800 text-rose-300">
                    Failed: {saveSummary.failed}
                  </span>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-5 py-3.5 bg-slate-900 border-t border-slate-800 text-xs shrink-0">
          <button
            type="button"
            onClick={handleCloseModal}
            className="rounded-lg border border-slate-700 bg-slate-800 hover:bg-slate-700 px-4 py-2 font-semibold text-slate-300 hover:text-white transition cursor-pointer"
          >
            {step === "done" ? "Close" : "Cancel"}
          </button>

          {step === "review" && (
            <div className="flex items-center gap-2.5">
              {readyCount > 0 && (
                <button
                  type="button"
                  onClick={handleImportVerified}
                  disabled={processing || savingAll}
                  className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white px-4 py-2 font-bold transition shadow-sm disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
                >
                  {savingAll ? (
                    <Loader2 size={14} className="animate-spin" />
                  ) : (
                    <CheckCircle2 size={14} />
                  )}
                  <span>Import Verified ({readyCount})</span>
                </button>
              )}

              <button
                type="button"
                onClick={handleImportAll}
                disabled={processing || savingAll || totalCount === 0}
                className={`inline-flex items-center gap-2 rounded-xl px-5 py-2 font-bold transition shadow-sm disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer ${
                  readyCount === totalCount
                    ? "bg-cyan-600 hover:bg-cyan-500 text-white"
                    : "bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700"
                }`}
                title={
                  readyCount === totalCount
                    ? "Import all verified statements"
                    : "Save unverified statements as Pending Review without marking them verified"
                }
              >
                {savingAll ? (
                  <>
                    <Loader2 size={14} className="animate-spin" />
                    <span>Saving...</span>
                  </>
                ) : readyCount === totalCount ? (
                  <>
                    <CheckCircle2 size={14} />
                    <span>Import All Verified ({totalCount})</span>
                  </>
                ) : readyCount > 0 ? (
                  <>
                    <AlertTriangle size={14} className="text-amber-400" />
                    <span>Save Remaining as Pending Review ({totalCount - readyCount})</span>
                  </>
                ) : (
                  <>
                    <AlertTriangle size={14} className="text-amber-400" />
                    <span>Save All as Pending Review ({totalCount})</span>
                  </>
                )}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

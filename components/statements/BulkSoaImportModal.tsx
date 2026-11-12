"use client";

import React, { useState, useRef, useEffect } from "react";
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
  UserPlus,
  CopyCheck,
} from "lucide-react";
import JSZip from "jszip";
import * as XLSX from "xlsx";
import { supabase } from "@/lib/supabase";
import { todayISO } from "@/lib/helpers";
import {
  type CustomerCandidate,
  type StoredSoaRecord,
  validateSoaFile,
  matchCustomerCandidates,
  detectSoaDuplicate,
} from "@/lib/soaManager";

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
  statementDate: string;
  openingBalance: number;
  charges: number;
  credits: number;
  closingBalance: number;
  // Statuses
  processState: "queued" | "uploading" | "parsing" | "ready" | "needs_review" | "failed";
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

function extractSoaFromSpreadsheet(
  buffer: ArrayBuffer,
  fileName: string
): {
  customerName: string;
  soaNumber: string;
  statementDate: string;
  openingBalance: number;
  charges: number;
  credits: number;
  closingBalance: number;
  needsReview: boolean;
} {
  const wb = XLSX.read(buffer, { type: "array" });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  if (!sheet) {
    return {
      customerName: "",
      soaNumber: fileName.replace(/\.[^.]+$/, ""),
      statementDate: todayISO(),
      openingBalance: 0,
      charges: 0,
      credits: 0,
      closingBalance: 0,
      needsReview: true,
    };
  }

  const matrix = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: "" });
  let customerName = "";
  let soaNumber = "";
  let statementDate = "";
  let openingBalance = 0;
  let charges = 0;
  let credits = 0;
  let closingBalance: number | null = null;

  // Scan top header rows for Customer, SOA number, Statement Date
  for (let r = 0; r < Math.min(25, matrix.length); r++) {
    const row = matrix[r] || [];
    for (let c = 0; c < row.length; c++) {
      const cell = String(row[c] ?? "").trim();
      const lower = cell.toLowerCase();
      const nextCell = String(row[c + 1] ?? row[c + 2] ?? "").trim();

      if (!customerName && /^(customer|client|account\s*name|bill\s*to|to)\s*:?$/i.test(lower) && nextCell) {
        customerName = nextCell;
      } else if (!customerName && /^(customer|client|account\s*name)\s*[:\-]\s*(.+)$/i.test(cell)) {
        const m = cell.match(/^(?:customer|client|account\s*name)\s*[:\-]\s*(.+)$/i);
        if (m?.[1]) customerName = m[1].trim();
      }

      if (!soaNumber && /^(soa|statement\s*(?:no|number|ref)|reference)\s*:?$/i.test(lower) && nextCell) {
        soaNumber = nextCell;
      } else if (!soaNumber && /\b(SOA[-/]?\d[\w-]*)\b/i.test(cell)) {
        const m = cell.match(/\b(SOA[-/]?\d[\w-]*)\b/i);
        if (m?.[1]) soaNumber = m[1];
      }

      if (!statementDate && /^(statement\s*date|as\s*of|date)\s*:?$/i.test(lower) && nextCell) {
        statementDate = nextCell.slice(0, 10);
      }
    }
  }

  // Scan table rows for debit/credit/balance columns
  let headerRowIdx = -1;
  let debitCol = -1;
  let creditCol = -1;
  let balanceCol = -1;

  for (let r = 0; r < Math.min(40, matrix.length); r++) {
    const row = (matrix[r] || []).map((v) => String(v ?? "").toLowerCase().trim());
    const dIdx = row.findIndex((h) => h === "debit" || h === "dr" || h.includes("debit"));
    const cIdx = row.findIndex((h) => h === "credit" || h === "cr" || h.includes("credit"));
    const bIdx = row.findIndex((h) => h === "balance" || h.includes("balance"));
    if (dIdx !== -1 || cIdx !== -1 || bIdx !== -1) {
      headerRowIdx = r;
      debitCol = dIdx;
      creditCol = cIdx;
      balanceCol = bIdx;
      break;
    }
  }

  if (headerRowIdx !== -1) {
    for (let r = headerRowIdx + 1; r < matrix.length; r++) {
      const row = matrix[r] || [];
      const rowText = row.map((v) => String(v ?? "").toLowerCase()).join(" ");
      if (rowText.includes("opening balance") || rowText.includes("brought forward")) {
        const val = balanceCol >= 0 ? parseNum(row[balanceCol]) : parseNum(row[row.length - 1]);
        if (val !== 0) openingBalance = val;
        continue;
      }
      if (rowText.includes("closing balance") || rowText.includes("total balance") || rowText.includes("balance due")) {
        const val = balanceCol >= 0 ? parseNum(row[balanceCol]) : parseNum(row[row.length - 1]);
        closingBalance = val;
        continue;
      }
      if (debitCol >= 0) charges += parseNum(row[debitCol]);
      if (creditCol >= 0) credits += parseNum(row[creditCol]);
      if (balanceCol >= 0 && String(row[balanceCol] ?? "").trim() !== "") {
        closingBalance = parseNum(row[balanceCol]);
      }
    }
  }

  const finalClosing =
    closingBalance !== null
      ? closingBalance
      : Math.round((openingBalance + charges - credits) * 100) / 100;

  if (!soaNumber) {
    const baseMatch = fileName.match(/\b(SOA[-_]?\d[\w-]*)\b/i);
    soaNumber = baseMatch?.[1] || fileName.replace(/\.[^.]+$/, "");
  }

  if (!statementDate || !/^\d{4}-\d{2}-\d{2}$/.test(statementDate)) {
    statementDate = todayISO();
  }

  const needsReview = !customerName || !soaNumber;
  return {
    customerName,
    soaNumber,
    statementDate,
    openingBalance,
    charges: Math.round(charges * 100) / 100,
    credits: Math.round(credits * 100) / 100,
    closingBalance: finalClosing,
    needsReview,
  };
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

  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!isOpen) return;
    let mounted = true;
    queueMicrotask(() => {
      if (!mounted) return;
      setStep("upload");
      setItems([]);
      setProcessing(false);
      setProcessedCount(0);
      setSavingAll(false);
      setSummaryMsg("");
      setErrorBanner("");
      setSaveSummary(null);
    });
    return () => {
      mounted = false;
    };
  }, [isOpen]);

  if (!isOpen) return null;

  async function uploadAndExtractSingle(
    item: StagedSoaItem,
    accessToken: string,
    batchId: string
  ): Promise<StagedSoaItem> {
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
          companyId,
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
          throw new Error(`Storage upload failed (${putRes.status})`);
        }
      } else if (storagePath) {
        const { error: directErr } = await supabase.storage
          .from(storageBucket)
          .upload(storagePath, item.file, { upsert: true });
        if (directErr) {
          throw new Error(`Storage upload failed: ${directErr.message}`);
        }
      } else {
        throw new Error(storageInit?.error || "Could not initialize private storage upload.");
      }

      // 2. Extract SOA metadata
      let customerName = "";
      let soaNumber = item.fileName.replace(/\.[^.]+$/, "");
      let statementDate = todayISO();
      let openingBalance = 0;
      let charges = 0;
      let credits = 0;
      let closingBalance = 0;
      let isScannedPdf = false;
      let extractionUncertain = false;

      if (item.ext === "xlsx" || item.ext === "xls" || item.ext === "csv") {
        const parsed = extractSoaFromSpreadsheet(buffer, item.fileName);
        customerName = parsed.customerName;
        soaNumber = parsed.soaNumber;
        statementDate = parsed.statementDate;
        openingBalance = parsed.openingBalance;
        charges = parsed.charges;
        credits = parsed.credits;
        closingBalance = parsed.closingBalance;
        extractionUncertain = parsed.needsReview;
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
          customerName = doc.customerName || doc.partyName || "";
          soaNumber = doc.documentNumber || soaNumber;
          statementDate = doc.documentDate || statementDate;
          openingBalance = Number(doc.openingBalance || 0);
          charges = Number(doc.subtotal || doc.totalDebits || 0);
          credits = Number(doc.totalCredits || 0);
          closingBalance = Number(doc.totalAmount ?? doc.closingBalance ?? 0);

          if (textLen < 30 && !customerName && closingBalance === 0) {
            isScannedPdf = true;
            extractionUncertain = true;
          } else if (!customerName || !doc.documentNumber) {
            extractionUncertain = true;
          }
        }
      }

      // 3. Smart customer matching
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
        isScannedPdf ||
        matchOutcome.needsReview ||
        !matchOutcome.matchedCustomerId;

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
          : matchOutcome.reason,
        customerSuggestions: matchOutcome.suggestions,
        soaNumber,
        statementDate,
        openingBalance,
        charges,
        credits,
        closingBalance,
        processState: needsReview ? "needs_review" : "ready",
        isScannedPdf,
        isDuplicate: dupOutcome.isDuplicate,
        duplicateReason: dupOutcome.reason,
        existingAttachmentId: dupOutcome.existingRecord?.id,
        duplicateAction: dupOutcome.isDuplicate ? "skip" : "none",
        confirmReplace: false,
      };
    } catch (err) {
      return {
        ...item,
        processState: "failed",
        errorMessage: err instanceof Error ? err.message : "Upload or extraction failed.",
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
            statementDate: todayISO(),
            openingBalance: 0,
            charges: 0,
            credits: 0,
            closingBalance: 0,
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
            statementDate: todayISO(),
            openingBalance: 0,
            charges: 0,
            credits: 0,
            closingBalance: 0,
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
        statementDate: todayISO(),
        openingBalance: 0,
        charges: 0,
        credits: 0,
        closingBalance: 0,
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
    const batchId = `soa_${Date.now()}`;

    // Process files in concurrency batches of 4 for fast 5–100 file handling
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
          const updated = await uploadAndExtractSingle(results[idx], accessToken, batchId);
          results[idx] = updated;
          done++;
          setProcessedCount(done);
          setItems([...results]);
        })
      );
    }

    setProcessing(false);
  }

  async function handleRetryFailed() {
    const failedIndices = items
      .map((it, idx) => (it.processState === "failed" && validateSoaFile(it.file).valid ? idx : -1))
      .filter((idx) => idx >= 0);

    if (failedIndices.length === 0) return;

    setProcessing(true);
    const { data: sessionData } = await supabase.auth.getSession();
    const accessToken = sessionData?.session?.access_token || "";
    const batchId = `soa_retry_${Date.now()}`;

    const next = [...items];
    for (const idx of failedIndices) {
      next[idx] = { ...next[idx], processState: "uploading", errorMessage: undefined };
      setItems([...next]);
      next[idx] = await uploadAndExtractSingle(next[idx], accessToken, batchId);
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
        if (merged.processState !== "failed") {
          merged.processState = hasCustomer && merged.soaNumber.trim() ? "ready" : "needs_review";
        }
        return merged;
      })
    );
  }

  function removeItem(localId: string) {
    setItems((prev) => prev.filter((it) => it.localId !== localId));
  }

  async function handleImportAll() {
    setErrorBanner("");

    const savable = items.filter((it) => {
      if (it.processState === "failed") return false;
      if (it.isDuplicate && it.duplicateAction === "skip") return false;
      return true;
    });

    const missingCustomer = savable.find(
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

    const unconfirmedReplace = savable.find(
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

      const payloadItems = items
        .filter((it) => it.processState !== "failed")
        .map((it) => ({
          fileName: it.fileName,
          fileType: it.fileType,
          fileSize: it.fileSize,
          storagePath: it.storagePath,
          storageBucket: it.storageBucket,
          customerId: it.createNewCustomer ? undefined : it.customerId,
          newCustomerName: it.createNewCustomer ? it.newCustomerName.trim() : undefined,
          soaNumber: it.soaNumber.trim() || it.fileName,
          statementDate: it.statementDate || todayISO(),
          openingBalance: it.openingBalance || 0,
          charges: it.charges || 0,
          credits: it.credits || 0,
          closingBalance: it.closingBalance || 0,
          checksumSha256: it.checksumSha256,
          needsReview: it.processState === "needs_review",
          isScannedPdf: it.isScannedPdf,
          duplicateAction: it.isDuplicate ? it.duplicateAction : "none",
          existingAttachmentId: it.existingAttachmentId,
        }));

      const res = await fetch("/api/customer-statements", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
        },
        body: JSON.stringify({ companyId, items: payloadItems }),
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

  const totalCount = items.length;
  const readyCount = items.filter((i) => i.processState === "ready").length;
  const reviewCount = items.filter((i) => i.processState === "needs_review").length;
  const failedCount = items.filter((i) => i.processState === "failed").length;

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/85 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
      <div className="w-full max-w-5xl rounded-2xl bg-slate-900 border border-slate-700 shadow-2xl overflow-hidden text-slate-100 my-4 flex flex-col max-h-[92vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-800 bg-slate-900/95 shrink-0">
          <div className="flex items-center gap-3">
            <div className="rounded-xl bg-cyan-950/80 p-2 text-cyan-400 border border-cyan-800/60">
              <Upload size={18} />
            </div>
            <div>
              <h2 className="text-base font-bold text-white">Import SOA Files</h2>
              <p className="text-xs text-slate-400">
                Upload PDF, Excel (.xlsx/.xls), CSV, or ZIP archives. Historical SOAs are stored safely without modifying live ledgers.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-800 hover:text-white transition cursor-pointer"
          >
            <X size={18} />
          </button>
        </div>

        {/* Body */}
        <div className="p-5 space-y-4 overflow-y-auto flex-1 text-xs">
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
              className={`rounded-2xl border-2 border-dashed p-8 sm:p-12 text-center transition ${
                isDragging
                  ? "border-cyan-400 bg-cyan-950/30"
                  : "border-slate-700 bg-slate-950/40 hover:border-slate-500"
              }`}
            >
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
              <Upload size={36} className="mx-auto mb-3 text-cyan-400" />
              <p className="text-sm font-bold text-white mb-1">
                Drag and drop SOA files here
              </p>
              <p className="text-xs text-slate-400 mb-5">
                Select 1, 20, 50, or 100+ files at once (.pdf, .xlsx, .xls, .csv, .zip)
              </p>
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="inline-flex items-center gap-2 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white px-5 py-2.5 text-xs font-bold transition shadow-sm cursor-pointer"
              >
                <Upload size={14} />
                <span>Browse Files</span>
              </button>
            </div>
          )}

          {step === "review" && (
            <>
              {/* Progress & Counters */}
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-800 bg-slate-950/60 p-3.5">
                <div className="flex flex-wrap items-center gap-4 text-xs">
                  <span>
                    Selected: <strong className="text-white">{totalCount}</strong>
                  </span>
                  <span className="text-emerald-300">
                    Ready: <strong>{readyCount}</strong>
                  </span>
                  <span className="text-amber-300">
                    Needs Review: <strong>{reviewCount}</strong>
                  </span>
                  {failedCount > 0 && (
                    <span className="text-rose-300">
                      Failed: <strong>{failedCount}</strong>
                    </span>
                  )}
                </div>

                <div className="flex items-center gap-2">
                  {failedCount > 0 && !processing && (
                    <button
                      type="button"
                      onClick={handleRetryFailed}
                      className="inline-flex items-center gap-1.5 rounded-lg bg-rose-950 hover:bg-rose-900 border border-rose-700 text-rose-200 px-3 py-1.5 font-semibold transition cursor-pointer"
                    >
                      <RotateCw size={12} />
                      <span>Retry Failed ({failedCount})</span>
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={processing}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-800 hover:bg-slate-700 text-slate-200 px-3 py-1.5 font-semibold transition cursor-pointer disabled:opacity-50"
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
                  <div className="flex items-center justify-between text-cyan-200">
                    <span className="flex items-center gap-2 font-semibold">
                      <Loader2 size={14} className="animate-spin" />
                      Uploading & extracting SOA details...
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
                <div className="flex items-center gap-2 rounded-xl bg-rose-950/70 border border-rose-800 p-3 text-rose-200">
                  <AlertTriangle size={15} className="text-rose-400 shrink-0" />
                  <span>{errorBanner}</span>
                </div>
              )}

              {/* Review List */}
              <div className="space-y-2.5">
                {items.map((it) => (
                  <div
                    key={it.localId}
                    className={`rounded-xl border p-3.5 space-y-3 ${
                      it.processState === "failed"
                        ? "border-rose-800/80 bg-rose-950/20"
                        : it.processState === "needs_review"
                        ? "border-amber-800/70 bg-amber-950/15"
                        : "border-slate-800 bg-slate-950/50"
                    }`}
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-2 min-w-0">
                        {it.ext === "pdf" ? (
                          <FileText size={16} className="text-rose-400 shrink-0" />
                        ) : (
                          <FileSpreadsheet size={16} className="text-emerald-400 shrink-0" />
                        )}
                        <span className="font-semibold text-white truncate max-w-[260px] sm:max-w-md">
                          {it.fileName}
                        </span>
                        <span className="text-[10px] text-slate-400 font-mono">
                          ({Math.max(1, Math.round(it.fileSize / 1024))} KB)
                        </span>
                      </div>

                      <div className="flex items-center gap-2">
                        {it.processState === "uploading" || it.processState === "queued" ? (
                          <span className="inline-flex items-center gap-1 rounded-full bg-slate-800 px-2.5 py-0.5 text-[11px] text-slate-300">
                            <Loader2 size={11} className="animate-spin" /> Processing
                          </span>
                        ) : it.processState === "failed" ? (
                          <span className="inline-flex items-center gap-1 rounded-full bg-rose-950 border border-rose-800 px-2.5 py-0.5 text-[11px] font-semibold text-rose-300">
                            Failed
                          </span>
                        ) : it.processState === "needs_review" ? (
                          <span className="inline-flex items-center gap-1 rounded-full bg-amber-950 border border-amber-700 px-2.5 py-0.5 text-[11px] font-semibold text-amber-300">
                            {it.isScannedPdf ? "Needs Review (Scanned PDF)" : "Needs Review"}
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-950 border border-emerald-700 px-2.5 py-0.5 text-[11px] font-semibold text-emerald-300">
                            Ready
                          </span>
                        )}

                        <button
                          type="button"
                          onClick={() => removeItem(it.localId)}
                          className="text-slate-500 hover:text-rose-400 p-1 cursor-pointer"
                          title="Remove from batch"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </div>

                    {it.processState === "failed" ? (
                      <p className="text-rose-300 text-[11px]">{it.errorMessage}</p>
                    ) : it.processState !== "queued" && it.processState !== "uploading" ? (
                      <>
                        <div className="grid grid-cols-1 sm:grid-cols-4 gap-2.5">
                          {/* Customer Selector or Create New */}
                          <div className="sm:col-span-2 space-y-1">
                            <div className="flex items-center justify-between">
                              <label className="text-[10px] text-slate-400 uppercase font-semibold">
                                Customer {it.detectedCustomerName ? `(Detected: ${it.detectedCustomerName})` : ""}
                              </label>
                              <button
                                type="button"
                                onClick={() =>
                                  updateItem(it.localId, {
                                    createNewCustomer: !it.createNewCustomer,
                                    customerId: "",
                                  })
                                }
                                className="inline-flex items-center gap-1 text-[10px] text-cyan-400 hover:text-cyan-300 cursor-pointer"
                              >
                                <UserPlus size={11} />
                                <span>{it.createNewCustomer ? "Select Existing" : "Create New"}</span>
                              </button>
                            </div>

                            {!it.createNewCustomer ? (
                              <select
                                value={it.customerId}
                                onChange={(e) => updateItem(it.localId, { customerId: e.target.value })}
                                className="w-full rounded-lg border border-slate-700 bg-slate-900 px-2.5 py-1.5 text-xs text-white focus:border-cyan-500 focus:outline-none"
                              >
                                <option value="">-- Select Customer --</option>
                                {it.customerSuggestions.length > 0 && (
                                  <optgroup label="Suggested Matches">
                                    {it.customerSuggestions.map((s) => (
                                      <option key={`sug-${s.id}`} value={s.id}>
                                        {s.name} ({Math.round(s.score * 100)}% match)
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
                              <div className="space-y-1.5">
                                <input
                                  type="text"
                                  value={it.newCustomerName}
                                  placeholder="New customer name"
                                  onChange={(e) =>
                                    updateItem(it.localId, { newCustomerName: e.target.value })
                                  }
                                  className="w-full rounded-lg border border-cyan-700 bg-slate-900 px-2.5 py-1.5 text-xs text-white focus:border-cyan-500 focus:outline-none"
                                />
                                <label className="flex items-center gap-1.5 text-[11px] text-cyan-200 cursor-pointer">
                                  <input
                                    type="checkbox"
                                    checked={it.confirmNewCustomer}
                                    onChange={(e) =>
                                      updateItem(it.localId, { confirmNewCustomer: e.target.checked })
                                    }
                                    className="rounded border-slate-600 bg-slate-900"
                                  />
                                  <span>Confirm creating new customer</span>
                                </label>
                              </div>
                            )}

                            {it.customerMatchReason && (
                              <p className="text-[10px] text-slate-400">{it.customerMatchReason}</p>
                            )}
                          </div>

                          {/* SOA Number */}
                          <div className="space-y-1">
                            <label className="text-[10px] text-slate-400 uppercase font-semibold block">
                              SOA Number
                            </label>
                            <input
                              type="text"
                              value={it.soaNumber}
                              onChange={(e) => updateItem(it.localId, { soaNumber: e.target.value })}
                              className="w-full rounded-lg border border-slate-700 bg-slate-900 px-2.5 py-1.5 text-xs text-white font-mono focus:border-cyan-500 focus:outline-none"
                            />
                          </div>

                          {/* Statement Date & Closing Balance */}
                          <div className="grid grid-cols-2 gap-2">
                            <div className="space-y-1">
                              <label className="text-[10px] text-slate-400 uppercase font-semibold block">
                                Date
                              </label>
                              <input
                                type="date"
                                value={it.statementDate}
                                onChange={(e) =>
                                  updateItem(it.localId, { statementDate: e.target.value })
                                }
                                className="w-full rounded-lg border border-slate-700 bg-slate-900 px-2 py-1.5 text-[11px] text-white focus:border-cyan-500 focus:outline-none"
                              />
                            </div>
                            <div className="space-y-1">
                              <label className="text-[10px] text-slate-400 uppercase font-semibold block">
                                Closing (AED)
                              </label>
                              <input
                                type="number"
                                step="0.01"
                                value={it.closingBalance}
                                onChange={(e) =>
                                  updateItem(it.localId, {
                                    closingBalance: parseNum(e.target.value),
                                  })
                                }
                                className="w-full rounded-lg border border-slate-700 bg-slate-900 px-2 py-1.5 text-[11px] text-right font-mono text-white focus:border-cyan-500 focus:outline-none"
                              />
                            </div>
                          </div>
                        </div>

                        {/* Duplicate Resolution */}
                        {it.isDuplicate && (
                          <div className="rounded-lg border border-amber-700/70 bg-amber-950/30 p-2.5 flex flex-wrap items-center justify-between gap-2">
                            <div className="flex items-center gap-2 text-amber-200 text-[11px]">
                              <CopyCheck size={14} className="text-amber-400 shrink-0" />
                              <span>Duplicate detected: {it.duplicateReason}</span>
                            </div>
                            <div className="flex flex-wrap items-center gap-3 text-[11px]">
                              <label className="flex items-center gap-1 cursor-pointer">
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
                              {it.duplicateAction === "replace" && (
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
                              )}
                            </div>
                          </div>
                        )}
                      </>
                    ) : null}
                  </div>
                ))}
              </div>
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
            onClick={onClose}
            className="rounded-lg border border-slate-700 bg-slate-800 hover:bg-slate-700 px-4 py-2 font-semibold text-slate-300 hover:text-white transition cursor-pointer"
          >
            {step === "done" ? "Close" : "Cancel"}
          </button>

          {step === "review" && (
            <button
              type="button"
              onClick={handleImportAll}
              disabled={processing || savingAll || readyCount + reviewCount === 0}
              className="inline-flex items-center gap-2 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white px-5 py-2 font-bold transition shadow-sm disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
            >
              {savingAll ? (
                <>
                  <Loader2 size={14} className="animate-spin" />
                  <span>Importing...</span>
                </>
              ) : (
                <>
                  <CheckCircle2 size={14} />
                  <span>Import All SOAs ({readyCount + reviewCount})</span>
                </>
              )}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

"use client";

import React, { useState, useEffect, useRef, useMemo } from "react";
import Link from "next/link";
import {
  UploadCloud,
  FileText,
  FileSpreadsheet,
  CheckCircle2,
  AlertTriangle,
  Layers,
  RefreshCw,
  Eye,
  Download,
  Check,
  ChevronRight,
  Database,
  Briefcase,
  Users,
  ShieldCheck,
  Calculator,
  X,
  Clock,
  Sparkles,
  Building2,
  ExternalLink,
  Truck,
  ShoppingCart,
  DollarSign,
  Ruler,
  RotateCcw,
  StopCircle,
  CheckSquare,
  Square,
  ArrowRight,
} from "lucide-react";
import type {
  ParsedDocument,
  DestinationMapping,
  CalculationAuditRow,
  RelationshipTreeNode,
  ImportBatchSummary,
  ImportBatchRecord,
} from "@/lib/smartImport/types";
import { TEMPLATE_DEFINITIONS } from "@/lib/smartImport/templateGenerator";
import { STATUS_OPTIONS_BY_MODULE } from "@/lib/smartImport/statusResolver";
import { getCurrentCompany, type CompanyDocDetails } from "@/lib/helpers";
import { supabase } from "@/lib/supabase";
import { safeFetchJson } from "@/lib/safeFetch";
import {
  buildRelationshipTrees,
  computeBeforeAndAfterSummary,
} from "@/lib/smartImport/relationshipBuilder";

type ActiveTab =
  | "upload"
  | "extracted"
  | "preview"
  | "mapping"
  | "entities"
  | "projects"
  | "documents"
  | "validation"
  | "history"
  | "export"
  | "templates";

export interface QueueItem {
  id: string;
  file: File;
  name: string;
  size: number;
  status: "waiting" | "uploading" | "extracting" | "ready" | "failed" | "imported" | "cancelled";
  progressPercent: number;
  errorMessage?: string;
  requestId?: string;
  parsedDoc?: ParsedDocument;
  retries: number;
  selectedForImport: boolean;
  storagePath?: string;
}

export default function SmartImportPage() {
  const [activeTab, setActiveTab] = useState<ActiveTab>("upload");
  const [files, setFiles] = useState<File[]>([]);
  const [parseError, setParseError] = useState<string | null>(null);

  // Bulk Queue State
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [isProcessingQueue, setIsProcessingQueue] = useState(false);
  const cancelRequestedRef = useRef(false);
  const [skipDuplicates, setSkipDuplicates] = useState(true);
  const [filterStatus, setFilterStatus] = useState<"all" | "ready" | "failed" | "waiting">("all");

  // Parsed documents state
  const [documents, setDocuments] = useState<ParsedDocument[]>([]);
  const [selectedDocId, setSelectedDocId] = useState<string | null>(null);
  const [auditRows, setAuditRows] = useState<CalculationAuditRow[]>([]);
  const [relationshipTrees, setRelationshipTrees] = useState<RelationshipTreeNode[]>([]);
  const { beforeCounts, proposedSummary } = useMemo(() => {
    if (documents.length > 0) {
      const result = computeBeforeAndAfterSummary(documents);
      return {
        beforeCounts: result.beforeCounts,
        proposedSummary: result.proposedSummary,
      };
    }
    return {
      beforeCounts: { customers: 0, suppliers: 0, projects: 0, documents: 0 },
      proposedSummary: null,
    };
  }, [documents]);

  // Split-screen inspector state
  const [selectedMapping, setSelectedMapping] = useState<DestinationMapping | null>(null);

  // Final approval modal
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [committing, setCommitting] = useState(false);
  const [commitResult, setCommitResult] = useState<{ success: boolean; message: string } | null>(null);

  // Active ERP company profile state
  const [company, setCompany] = useState<CompanyDocDetails | null>(null);
  const [loadingCompany, setLoadingCompany] = useState(true);
  const [companyError, setCompanyError] = useState<string | null>(null);

  // History state
  const [batches, setBatches] = useState<ImportBatchRecord[]>([]);
  const [loadingBatches, setLoadingBatches] = useState(false);

  // File input ref
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Retrieve and refresh active session token to prevent PGRST303 (JWT expired)
  async function getValidAuthSession(): Promise<{ token: string | null; email: string | null; userId: string | null }> {
    try {
      let { data: { session } } = await supabase.auth.getSession();
      const isExpiring = session?.expires_at && session.expires_at * 1000 < Date.now() + 120000;
      if (!session || isExpiring) {
        const refreshRes = await supabase.auth.refreshSession();
        if (refreshRes.data?.session) {
          session = refreshRes.data.session;
        }
      }
      if (!session) {
        await supabase.auth.getUser();
        const secondCheck = await supabase.auth.getSession();
        session = secondCheck.data?.session;
      }
      return {
        token: session?.access_token || null,
        email: session?.user?.email || null,
        userId: session?.user?.id || null,
      };
    } catch (err) {
      console.warn("Auth session check error:", err);
      return { token: null, email: null, userId: null };
    }
  }

  // Load verified ERP company profile on mount
  useEffect(() => {
    loadCompanyProfile();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function loadCompanyProfile() {
    setLoadingCompany(true);
    setCompanyError(null);
    try {
      const { token, userId } = await getValidAuthSession();

      // Tier 1: getCurrentCompany() helper
      let co = await getCurrentCompany();

      // Tier 2: Direct Supabase query if userId is available (bypasses in-memory cache race conditions)
      if (!co && userId) {
        const { data: ownerCo } = await supabase
          .from("companies")
          .select("*")
          .eq("owner_id", userId)
          .maybeSingle();

        if (ownerCo?.id) {
          co = ownerCo as CompanyDocDetails;
        } else {
          const { data: prof } = await supabase
            .from("profiles")
            .select("company_id")
            .eq("id", userId)
            .maybeSingle();

          if (prof?.company_id) {
            const { data: memberCo } = await supabase
              .from("companies")
              .select("*")
              .eq("id", prof.company_id)
              .maybeSingle();
            if (memberCo?.id) {
              co = memberCo as CompanyDocDetails;
            }
          }
        }
      }

      // Tier 3: Query server-side company resolution endpoint
      if (!co && token) {
        try {
          const res = await safeFetchJson<{ company?: CompanyDocDetails }>("/api/smart-import/company", {
            headers: { Authorization: `Bearer ${token}` },
          });
          if (res.ok && res.data?.company?.id) {
            co = res.data.company;
          }
        } catch {}
      }

      if (co && co.id) {
        setCompany(co);
      } else {
        setCompanyError(
          "Company profile not found in ERP. Please ensure you are logged into Dubai ERP and your user account is linked to an active company profile under Settings → Company Settings."
        );
      }
    } catch (err: unknown) {
      setCompanyError(err instanceof Error ? err.message : "Failed to resolve company profile.");
    } finally {
      setLoadingCompany(false);
    }
  }

  // Load batch history on tab open
  useEffect(() => {
    if (activeTab === "history") {
      loadHistory();
    }
  }, [activeTab]);

  async function loadHistory() {
    setLoadingBatches(true);
    try {
      const res = await safeFetchJson<{ batches?: ImportBatchRecord[] }>("/api/smart-import/history");
      if (res.ok && res.data?.batches) setBatches(res.data.batches);
    } catch {
      // ignore
    } finally {
      setLoadingBatches(false);
    }
  }

  // Handle file drop / selection
  function handleFilesSelected(selectedFiles: FileList | null) {
    if (!selectedFiles) return;
    const rawList = Array.from(selectedFiles);
    const validList: File[] = [];
    const lockList: string[] = [];

    for (const f of rawList) {
      const baseName = f.name.split(/[/\\]/).pop() || f.name;
      if (
        baseName.startsWith("~$") ||
        baseName.startsWith(".~") ||
        (f.size < 400 && (baseName.endsWith(".docx") || baseName.endsWith(".xlsx")))
      ) {
        lockList.push(baseName);
      } else {
        validList.push(f);
      }
    }

    if (lockList.length > 0) {
      const cleanSuggestions = lockList.map(l => l.replace(/^[~.$]+/, "")).join(", ");
      setParseError(
        `Notice: ${lockList.join(", ")} ${
          lockList.length === 1 ? "is a temporary Microsoft Office lock file" : "are temporary Office lock files"
        } created by Word/Excel while a file is open. Please select the actual document '${cleanSuggestions}' instead.`
      );
    } else {
      setParseError(null);
    }

    if (validList.length > 0) {
      setFiles(prev => [...prev, ...validList]);
      const newItems: QueueItem[] = validList.map(f => ({
        id: `q_${crypto.randomUUID()}`,
        file: f,
        name: f.name,
        size: f.size,
        status: "waiting",
        progressPercent: 0,
        retries: 0,
        selectedForImport: true,
      }));
      setQueue(prev => [...prev, ...newItems]);
    }
  }

  function removeQueueItem(id: string) {
    const item = queue.find(q => q.id === id);
    if (!item) return;
    setQueue(prev => prev.filter(q => q.id !== id));
    setFiles(prev => prev.filter(f => f.name !== item.name));
    setDocuments(prev => prev.filter(d => d.filename !== item.name));
  }

  function clearAll() {
    setFiles([]);
    setQueue([]);
    setDocuments([]);
    setAuditRows([]);
    setRelationshipTrees([]);
    setParseError(null);
    setSelectedDocId(null);
    setSelectedMapping(null);
  }

  function toggleSelectQueueItem(id: string) {
    setQueue(prev =>
      prev.map(q => (q.id === id ? { ...q, selectedForImport: !q.selectedForImport } : q))
    );
  }

  function toggleSelectAll(select: boolean) {
    setQueue(prev =>
      prev.map(q => ({
        ...q,
        selectedForImport: select ? (skipDuplicates ? !q.parsedDoc?.isDuplicate : true) : false,
      }))
    );
  }

  function cancelRemainingQueue() {
    cancelRequestedRef.current = true;
    setQueue(prev =>
      prev.map(q => (q.status === "waiting" ? { ...q, status: "cancelled", progressPercent: 0 } : q))
    );
    setIsProcessingQueue(false);
  }

  // Upload and parse single file with automatic storage upload or fallback
  async function processSingleFile(
    item: QueueItem,
    companyId: string | undefined,
    token: string | null
  ): Promise<{ doc?: ParsedDocument; error?: string; requestId?: string; storagePath?: string }> {
    let storagePath: string | undefined;
    let uploadedToStorage = false;

    // A. Attempt secure company-scoped Supabase Storage upload
    try {
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (token) headers["Authorization"] = `Bearer ${token}`;

      const storeRes = await safeFetchJson<{
        success: boolean;
        signedUrl?: string;
        path?: string;
        bucket?: string;
        fallback?: string;
        error?: string;
        requestId?: string;
      }>("/api/smart-import/storage", {
        method: "POST",
        headers,
        body: JSON.stringify({
          fileName: item.name,
          fileSize: item.size,
          companyId: companyId || "general",
        }),
      });

      if (storeRes.ok && storeRes.data?.signedUrl && storeRes.data.path) {
        storagePath = storeRes.data.path;
        const uploadRes = await fetch(storeRes.data.signedUrl, {
          method: "PUT",
          headers: {
            "Content-Type": item.file.type || "application/octet-stream",
          },
          body: item.file,
        });

        if (uploadRes.ok) {
          uploadedToStorage = true;
        }
      }
    } catch (storeErr) {
      console.warn("Storage upload fallback:", storeErr);
    }

    // B. Call Parse API
    const authHeaders: Record<string, string> = {};
    if (token) authHeaders["Authorization"] = `Bearer ${token}`;

    if (uploadedToStorage && storagePath) {
      authHeaders["Content-Type"] = "application/json";
      const parseRes = await safeFetchJson<{
        success: boolean;
        documents: ParsedDocument[];
        auditRows: CalculationAuditRow[];
        relationshipTrees?: RelationshipTreeNode[];
        beforeCounts?: { customers: number; suppliers: number; projects: number; documents: number };
        proposedSummary?: ImportBatchSummary;
        error?: string;
        requestId?: string;
      }>("/api/smart-import/parse", {
        method: "POST",
        headers: authHeaders,
        body: JSON.stringify({
          storageBucket: "smart-imports",
          storagePath,
          fileName: item.name,
          fileSize: item.size,
        }),
      });

      if (!parseRes.ok || !parseRes.data?.documents || parseRes.data.documents.length === 0) {
        return {
          error: parseRes.error || parseRes.data?.error || "Failed to extract document.",
          requestId: parseRes.requestId || parseRes.data?.requestId,
          storagePath,
        };
      }

      return {
        doc: parseRes.data.documents[0],
        requestId: parseRes.requestId || parseRes.data?.requestId,
        storagePath,
      };
    } else {
      // Direct FormData fallback (for smaller files or storage fallback)
      const formData = new FormData();
      formData.append("files", item.file);

      const parseRes = await safeFetchJson<{
        success: boolean;
        documents: ParsedDocument[];
        auditRows: CalculationAuditRow[];
        error?: string;
        requestId?: string;
      }>("/api/smart-import/parse", {
        method: "POST",
        headers: authHeaders,
        body: formData,
      });

      if (!parseRes.ok || !parseRes.data?.documents || parseRes.data.documents.length === 0) {
        return {
          error: parseRes.error || parseRes.data?.error || "Failed to extract document.",
          requestId: parseRes.requestId || parseRes.data?.requestId,
        };
      }

      return {
        doc: parseRes.data.documents[0],
        requestId: parseRes.requestId || parseRes.data?.requestId,
      };
    }
  }

  // Controlled Concurrency Queue Runner (Concurrency = 2)
  async function runBatchQueue(customTargets?: QueueItem[]) {
    if (isProcessingQueue) return;
    setIsProcessingQueue(true);
    setParseError(null);
    cancelRequestedRef.current = false;

    try {
      const { token } = await getValidAuthSession();
      const companyId = company?.id;

      // Identify pending targets
      const targets =
        customTargets ||
        queue.filter(q => q.status === "waiting" || q.status === "failed" || q.status === "cancelled");

      if (targets.length === 0) {
        setIsProcessingQueue(false);
        return;
      }

      const CONCURRENCY = 2; // Bounded parallelism to prevent network saturation
      let targetIndex = 0;

      async function worker() {
        while (targetIndex < targets.length) {
          if (cancelRequestedRef.current) break;
          const currentItem = targets[targetIndex++];
          if (!currentItem) break;

          // 1. Uploading state
          setQueue(prev =>
            prev.map(q =>
              q.id === currentItem.id ? { ...q, status: "uploading", progressPercent: 30, errorMessage: undefined } : q
            )
          );

          let attempt = 0;
          let docResult: ParsedDocument | undefined;
          let lastError: string | undefined;
          let lastReqId: string | undefined;
          let savedStoragePath: string | undefined;

          while (attempt < 2 && !docResult && !cancelRequestedRef.current) {
            attempt++;
            try {
              setQueue(prev =>
                prev.map(q =>
                  q.id === currentItem.id ? { ...q, status: "extracting", progressPercent: 70 } : q
                )
              );

              const res = await processSingleFile(currentItem, companyId, token);
              if (res.doc) {
                docResult = res.doc;
                lastReqId = res.requestId;
                savedStoragePath = res.storagePath;
              } else {
                lastError = res.error || "Failed to extract document";
                lastReqId = res.requestId;
                savedStoragePath = res.storagePath;
                if (attempt < 2 && !cancelRequestedRef.current) {
                  await new Promise(r => setTimeout(r, 1500));
                }
              }
            } catch (err: unknown) {
              lastError = err instanceof Error ? err.message : String(err);
              if (attempt < 2 && !cancelRequestedRef.current) {
                await new Promise(r => setTimeout(r, 1500));
              }
            }
          }

          if (docResult) {
            const finalDoc = docResult;
            setQueue(prev =>
              prev.map(q =>
                q.id === currentItem.id
                  ? {
                      ...q,
                      status: "ready",
                      progressPercent: 100,
                      parsedDoc: finalDoc,
                      requestId: lastReqId,
                      storagePath: savedStoragePath,
                      selectedForImport: !finalDoc.isDuplicate,
                    }
                  : q
              )
            );

            // Add to documents incrementally
            setDocuments(prev => {
              const idx = prev.findIndex(d => d.filename === finalDoc.filename);
              const updated = idx !== -1 ? [...prev.slice(0, idx), finalDoc, ...prev.slice(idx + 1)] : [...prev, finalDoc];

              // Automatically recompute relationship trees
              const trees = buildRelationshipTrees(updated);
              setRelationshipTrees(trees);

              return updated;
            });

            setSelectedDocId(prev => prev || finalDoc.id);
          } else {
            setQueue(prev =>
              prev.map(q =>
                q.id === currentItem.id
                  ? {
                      ...q,
                      status: "failed",
                      progressPercent: 0,
                      errorMessage: lastError || "Extraction failed.",
                      requestId: lastReqId,
                      retries: attempt,
                    }
                  : q
              )
            );
          }
        }
      }

      const workers = Array.from({ length: Math.min(CONCURRENCY, targets.length) }, () => worker());
      await Promise.all(workers);
    } catch (err: unknown) {
      setParseError(err instanceof Error ? err.message : "Error processing files.");
    } finally {
      setIsProcessingQueue(false);
    }
  }

  function retrySingleItem(id: string) {
    const item = queue.find(q => q.id === id);
    if (item) {
      runBatchQueue([item]);
    }
  }

  function retryFailedQueue() {
    const failedItems = queue.filter(q => q.status === "failed");
    if (failedItems.length > 0) {
      runBatchQueue(failedItems);
    }
  }

  // Trigger parsing
  async function handleStartExtraction() {
    if (queue.length === 0) return;
    await runBatchQueue();
  }

  // Selected document helper
  const currentDoc = documents.find(d => d.id === selectedDocId) || documents[0];

  // Inline edit handler for destination mapping
  function handleMappingChange(docId: string, mappingIndex: number, newValue: string) {
    setDocuments(prev =>
      prev.map(d => {
        if (d.id !== docId) return d;
        const nextMappings = [...d.destinationMappings];
        nextMappings[mappingIndex] = {
          ...nextMappings[mappingIndex],
          editableValue: newValue,
        };
        return { ...d, destinationMappings: nextMappings };
      })
    );
  }

  // Interactive status override handler for Import Preview
  function handleStatusChange(docId: string, newStatus: string, isProject?: boolean) {
    setDocuments(prev =>
      prev.map(d => {
        if (d.id !== docId) return d;
        if (isProject) {
          const currentProjRes = d.statusResolution?.projectStatusResolution;
          return {
            ...d,
            statusResolution: {
              ...d.statusResolution,
              rawEvidence: d.statusResolution?.rawEvidence || null,
              proposedStatus: d.statusResolution?.proposedStatus || "draft",
              isAssumed: d.statusResolution?.isAssumed ?? true,
              mappingReason: d.statusResolution?.mappingReason || "",
              userOverridden: d.statusResolution?.userOverridden ?? false,
              projectStatusResolution: {
                rawEvidence: currentProjRes?.rawEvidence || null,
                proposedStatus: newStatus,
                isAssumed: false,
                mappingReason: `Manually verified & selected by user during Import Preview ('${newStatus}')`,
                userOverridden: true,
              },
            },
            fields: {
              ...d.fields,
              project_status: {
                fieldKey: "project_status",
                label: "Project Status",
                value: newStatus,
                source: { file: d.filename, rawText: "User Preview Override" },
                confidence: 1.0,
                validationStatus: "valid",
                originalRawValue: newStatus,
              },
            },
            destinationMappings: d.destinationMappings.map(m =>
              m.destinationTable === "projects" && m.destinationField === "status"
                ? { ...m, extractedValue: newStatus, editableValue: newStatus }
                : m
            ),
          };
        } else {
          return {
            ...d,
            statusResolution: {
              rawEvidence: d.statusResolution?.rawEvidence || null,
              proposedStatus: newStatus,
              isAssumed: false,
              mappingReason: `Manually verified & selected by user during Import Preview ('${newStatus}')`,
              userOverridden: true,
              projectStatusResolution: d.statusResolution?.projectStatusResolution,
            },
            fields: {
              ...d.fields,
              status: {
                fieldKey: "status",
                label: "Document Status",
                value: newStatus,
                source: { file: d.filename, rawText: "User Preview Override" },
                confidence: 1.0,
                validationStatus: "valid",
                originalRawValue: newStatus,
              },
            },
            destinationMappings: d.destinationMappings.map(m =>
              (m.destinationTable === "quotations" ||
                m.destinationTable === "tax_invoices" ||
                m.destinationTable === "delivery_notes" ||
                m.destinationTable === "purchase_orders" ||
                m.destinationTable === "expenses") &&
              m.destinationField === "status"
                ? { ...m, extractedValue: newStatus, editableValue: newStatus }
                : m
            ),
          };
        }
      })
    );
  }

  // Final Commit Approval
  async function handleCommitImport() {
    if (!company?.id) {
      setCommitResult({
        success: false,
        message:
          "Company profile not found in ERP. Please ensure you are logged into Dubai ERP and your user account is linked to an active company profile under Settings → Company Settings.",
      });
      return;
    }

    // Filter only selected documents (and skip duplicates if toggle is on)
    const approvedDocs = documents.filter(d => {
      const qItem = queue.find(q => q.name === d.filename || q.parsedDoc?.id === d.id);
      if (qItem && !qItem.selectedForImport) return false;
      if (skipDuplicates && d.isDuplicate) return false;
      return true;
    });

    if (approvedDocs.length === 0) {
      setCommitResult({
        success: false,
        message: "No documents selected for import. Please ensure at least one document is checked.",
      });
      return;
    }

    setCommitting(true);
    setCommitResult(null);

    try {
      const { token, email } = await getValidAuthSession();
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (token) {
        headers["Authorization"] = `Bearer ${token}`;
      }

      const res = await safeFetchJson<{
        success: boolean;
        batchId?: string;
        recordsCreated?: Record<string, number>;
        errors?: string[];
        error?: string;
      }>("/api/smart-import/commit", {
        method: "POST",
        headers,
        body: JSON.stringify({
          documents: approvedDocs,
          companyId: company.id,
          userEmail: email,
        }),
      });

      if (!res.ok || !res.data?.success) {
        throw new Error(res.data?.errors?.join(", ") || res.data?.error || res.error || "Failed to import records.");
      }

      const createdTotal = Object.values(res.data.recordsCreated || {}).reduce(
        (a: number, b: unknown) => a + (Number(b) || 0),
        0
      );

      setCommitResult({
        success: true,
        message: `Successfully imported ${createdTotal} records into Dubai ERP! Batch ID: ${res.data.batchId}`,
      });

      // Mark imported in queue
      setQueue(prev =>
        prev.map(item => {
          const wasImported = approvedDocs.some(d => d.filename === item.name);
          return wasImported ? { ...item, status: "imported" } : item;
        })
      );

      // Clean up temporary storage objects in background
      const pathsToClean = queue.map(q => q.storagePath).filter(Boolean) as string[];
      if (pathsToClean.length > 0) {
        safeFetchJson("/api/smart-import/storage", {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ paths: pathsToClean }),
        }).catch(() => {});
      }

      loadHistory();
    } catch (err: unknown) {
      setCommitResult({
        success: false,
        message: err instanceof Error ? err.message : "Import failed",
      });
    } finally {
      setCommitting(false);
    }
  }

  return (
    <div className="min-h-screen bg-slate-900 text-slate-100 flex flex-col">
      {/* Header Bar */}
      <header className="border-b border-slate-800 bg-slate-950/80 px-4 py-3 backdrop-blur sticky top-0 z-20 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
            <UploadCloud size={20} />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <Link href="/settings/data-management" className="text-xs text-slate-400 hover:text-white transition">
                Data Management
              </Link>
              <ChevronRight size={12} className="text-slate-600" />
              <h1 className="text-sm font-semibold text-white">Smart Import & Auto-Creation</h1>
            </div>
            <p className="text-[11px] text-slate-400">
              High-Precision Word, Excel, PDF & CSV Business Document Importer
            </p>
          </div>
        </div>

        {/* Resolved Company Badge in Header */}
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg border text-xs bg-slate-900/90 border-slate-800">
          <Building2 size={14} className={company?.id ? "text-emerald-400" : "text-amber-400"} />
          {loadingCompany ? (
            <span className="text-slate-400 flex items-center gap-1.5 text-[11px]">
              <RefreshCw size={11} className="animate-spin" /> Resolving ERP Company...
            </span>
          ) : company?.id ? (
            <div className="flex items-center gap-2">
              <span className="text-white font-medium text-[11px] truncate max-w-[200px]" title={company.name}>
                {company.name}
              </span>
              {company.trn && (
                <span className="text-slate-400 text-[10px] font-mono hidden sm:inline">TRN: {company.trn}</span>
              )}
              <span className="px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-400 text-[9px] font-semibold uppercase tracking-wider border border-emerald-500/20">
                Active Scope
              </span>
            </div>
          ) : (
            <div className="flex items-center gap-1.5 text-rose-400 text-[11px]">
              <span>Company Unresolved</span>
              <Link href="/settings/company" className="underline text-[10px] hover:text-white flex items-center gap-0.5">
                Configure <ExternalLink size={10} />
              </Link>
            </div>
          )}
        </div>

        {/* Real-time Before/After Metrics Pill */}
        {proposedSummary && (
          <div className="hidden xl:flex items-center gap-2 px-3 py-1.5 rounded-lg bg-slate-900 border border-slate-800 text-xs">
            <span className="text-slate-400 font-medium">Proposed:</span>
            <span className="text-emerald-400 font-bold">+{proposedSummary.newCustomers} Customers</span>
            <span className="text-slate-600">•</span>
            <span className="text-sky-400 font-bold">+{proposedSummary.newProjects} Projects</span>
            <span className="text-slate-600">•</span>
            <span className="text-indigo-400 font-bold">+{proposedSummary.newQuotations + proposedSummary.newInvoices} Docs</span>
            <span className="text-slate-600">•</span>
            <span className="text-amber-400 font-bold">{proposedSummary.reusedCustomers} Reused</span>
          </div>
        )}

        <div className="flex items-center gap-2">
          {documents.length > 0 && (
            <button
              onClick={() => setShowConfirmModal(true)}
              className="flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white shadow-sm transition"
            >
              <CheckCircle2 size={15} />
              <span>Approve & Import</span>
            </button>
          )}

          <Link
            href="/settings/designer"
            className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 transition"
          >
            <FileText size={14} className="text-indigo-400" />
            <span>PDF Designer</span>
          </Link>
        </div>
      </header>

      {/* Navigation Tabs (11 Requested Tabs) */}
      <nav className="border-b border-slate-800 bg-slate-950/40 px-4 overflow-x-auto scrollbar-none flex gap-1 text-xs">
        {[
          { id: "upload", label: "Upload Files", icon: UploadCloud, badge: files.length > 0 ? files.length : null },
          { id: "extracted", label: "Extracted Data", icon: FileText, badge: documents.length > 0 ? documents.length : null },
          { id: "preview", label: "Import Preview", icon: Eye, highlight: true },
          { id: "mapping", label: "Field Mapping", icon: Database },
          { id: "entities", label: "Customers & Suppliers", icon: Users },
          { id: "projects", label: "Projects", icon: Briefcase },
          { id: "documents", label: "Documents & Transactions", icon: FileSpreadsheet },
          { id: "validation", label: "Validation & Duplicates", icon: AlertTriangle, badge: auditRows.filter(r => r.validationResult === "MISMATCH").length || null },
          { id: "history", label: "Import History", icon: Clock },
          { id: "export", label: "Export Data", icon: Download },
          { id: "templates", label: "Download Templates", icon: Layers },
        ].map(tab => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as ActiveTab)}
              className={`flex items-center gap-2 py-3 px-3 border-b-2 font-medium whitespace-nowrap transition-all ${
                isActive
                  ? "border-emerald-400 text-emerald-400 bg-emerald-500/5 font-semibold"
                  : "border-transparent text-slate-400 hover:text-slate-200 hover:border-slate-700"
              }`}
            >
              <Icon size={14} className={tab.highlight ? "text-emerald-400" : ""} />
              <span>{tab.label}</span>
              {tab.badge !== null && (
                <span className="px-1.5 py-0.2 rounded-full text-[10px] font-bold bg-emerald-500/20 text-emerald-300">
                  {tab.badge}
                </span>
              )}
            </button>
          );
        })}
      </nav>

      {/* Main Tab Views */}
      <main className="flex-1 p-4 md:p-6 overflow-y-auto">
        {/* ============================================================== */}
        {/* TAB 1: UPLOAD FILES */}
        {/* ============================================================== */}
        {activeTab === "upload" && (
          <div className="max-w-4xl mx-auto space-y-6">
            <div className="p-6 rounded-2xl border border-slate-800 bg-slate-950/60 shadow-xl text-center">
              <input
                ref={fileInputRef}
                type="file"
                multiple
                accept=".docx,.doc,.xlsx,.xls,.csv,.pdf,.zip"
                className="hidden"
                onChange={e => handleFilesSelected(e.target.files)}
              />

              <div
                onDragOver={e => e.preventDefault()}
                onDrop={e => {
                  e.preventDefault();
                  handleFilesSelected(e.dataTransfer.files);
                }}
                onClick={() => fileInputRef.current?.click()}
                className="p-10 border-2 border-dashed border-slate-700 hover:border-emerald-500/60 rounded-xl bg-slate-900/40 hover:bg-slate-900/80 cursor-pointer transition flex flex-col items-center justify-center gap-3"
              >
                <div className="h-16 w-16 rounded-2xl bg-emerald-500/10 flex items-center justify-center text-emerald-400 border border-emerald-500/20">
                  <UploadCloud size={32} />
                </div>
                <div>
                  <p className="text-base font-semibold text-white">Click to browse or drag and drop files here</p>
                  <p className="text-xs text-slate-400 mt-1">
                    Supports Microsoft Word (.docx, .doc), Excel (.xlsx, .xls, .csv), PDF, and bulk ZIP archives
                  </p>
                </div>
                <div className="flex flex-wrap items-center justify-center gap-2 mt-2">
                  <span className="px-2 py-0.5 rounded text-[11px] font-medium bg-blue-500/10 text-blue-400 border border-blue-500/20">Word .docx</span>
                  <span className="px-2 py-0.5 rounded text-[11px] font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">Excel .xlsx / .csv</span>
                  <span className="px-2 py-0.5 rounded text-[11px] font-medium bg-rose-500/10 text-rose-400 border border-rose-500/20">PDF</span>
                  <span className="px-2 py-0.5 rounded text-[11px] font-medium bg-purple-500/10 text-purple-400 border border-purple-500/20">Bulk ZIP</span>
                </div>
              </div>

              {/* ============================================================== */}
              {/* BULK QUEUE DASHBOARD (40-100+ FILES RESILIENT RUNNER) */}
              {/* ============================================================== */}
              {queue.length > 0 && (() => {
                const readyCount = queue.filter(q => q.status === "ready").length;
                const inProgressCount = queue.filter(q => q.status === "uploading" || q.status === "extracting").length;
                const failedCount = queue.filter(q => q.status === "failed").length;
                const waitingCount = queue.filter(q => q.status === "waiting").length;
                const importedCount = queue.filter(q => q.status === "imported").length;
                const selectedCount = queue.filter(q => q.selectedForImport && (q.status === "ready" || q.status === "imported")).length;
                const progressPct = queue.length > 0 ? Math.round(((readyCount + importedCount) / queue.length) * 100) : 0;

                const filteredQueue = queue.filter(q => {
                  if (filterStatus === "ready") return q.status === "ready" || q.status === "imported";
                  if (filterStatus === "failed") return q.status === "failed";
                  if (filterStatus === "waiting") return q.status === "waiting" || q.status === "cancelled";
                  return true;
                });

                return (
                  <div className="mt-6 text-left space-y-4">
                    {/* Header metrics pills */}
                    <div className="flex flex-wrap items-center justify-between gap-2 p-3 rounded-xl bg-slate-900 border border-slate-800 text-xs">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-semibold text-white">Bulk Queue:</span>
                        <span className="px-2 py-0.5 rounded bg-slate-800 text-slate-300 font-mono text-[11px]">
                          {queue.length} Total Files
                        </span>
                        <span className="px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-semibold text-[11px]">
                          ✓ {readyCount} Ready
                        </span>
                        {inProgressCount > 0 && (
                          <span className="px-2 py-0.5 rounded bg-sky-500/10 text-sky-400 border border-sky-500/20 font-semibold text-[11px] flex items-center gap-1">
                            <RefreshCw size={11} className="animate-spin" /> {inProgressCount} Processing
                          </span>
                        )}
                        {failedCount > 0 && (
                          <span className="px-2 py-0.5 rounded bg-rose-500/10 text-rose-400 border border-rose-500/20 font-semibold text-[11px]">
                            ⚠️ {failedCount} Failed
                          </span>
                        )}
                        {waitingCount > 0 && (
                          <span className="px-2 py-0.5 rounded bg-slate-800 text-slate-400 text-[11px]">
                            ⏳ {waitingCount} Waiting
                          </span>
                        )}
                        {importedCount > 0 && (
                          <span className="px-2 py-0.5 rounded bg-purple-500/10 text-purple-300 border border-purple-500/20 font-semibold text-[11px]">
                            ★ {importedCount} Imported
                          </span>
                        )}
                      </div>

                      <div className="flex items-center gap-3">
                        <label className="flex items-center gap-1.5 text-[11px] text-slate-300 cursor-pointer select-none">
                          <input
                            type="checkbox"
                            checked={skipDuplicates}
                            onChange={e => setSkipDuplicates(e.target.checked)}
                            className="rounded border-slate-700 bg-slate-950 text-emerald-500 focus:ring-0 cursor-pointer"
                          />
                          <span>Skip Duplicates</span>
                        </label>
                        <button
                          onClick={clearAll}
                          disabled={isProcessingQueue}
                          className="text-[11px] text-slate-400 hover:text-rose-400 transition disabled:opacity-50"
                        >
                          Clear All
                        </button>
                      </div>
                    </div>

                    {/* Overall Progress Bar */}
                    {(isProcessingQueue || readyCount > 0 || failedCount > 0) && (
                      <div className="space-y-1.5 p-3 rounded-xl bg-slate-900/60 border border-slate-800/80">
                        <div className="flex items-center justify-between text-[11px]">
                          <span className="text-slate-300 font-medium flex items-center gap-1.5">
                            {isProcessingQueue ? (
                              <>
                                <RefreshCw size={12} className="animate-spin text-emerald-400" />
                                <span>Extracting Documents ({readyCount} of {queue.length} ready)...</span>
                              </>
                            ) : failedCount > 0 ? (
                              <span className="text-amber-400">
                                Extraction Paused: {readyCount} ready, {failedCount} failed. You can retry failed files below.
                              </span>
                            ) : (
                              <span className="text-emerald-400 font-semibold">
                                ✓ Extraction Complete: All {readyCount} documents verified and ready for review!
                              </span>
                            )}
                          </span>
                          <span className="font-mono text-emerald-400 font-bold">{progressPct}%</span>
                        </div>
                        <div className="w-full h-2 rounded-full bg-slate-800 overflow-hidden">
                          <div
                            className={`h-full transition-all duration-300 ${
                              failedCount > 0 && readyCount === 0 ? "bg-rose-500" : "bg-gradient-to-r from-emerald-500 to-sky-400"
                            }`}
                            style={{ width: `${Math.max(5, progressPct)}%` }}
                          />
                        </div>
                      </div>
                    )}

                    {/* Filter tabs & Bulk Controls */}
                    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800 pb-2">
                      <div className="flex items-center gap-1 text-[11px]">
                        <button
                          onClick={() => setFilterStatus("all")}
                          className={`px-2.5 py-1 rounded-lg transition ${
                            filterStatus === "all" ? "bg-slate-800 text-white font-medium" : "text-slate-400 hover:text-slate-200"
                          }`}
                        >
                          All ({queue.length})
                        </button>
                        <button
                          onClick={() => setFilterStatus("ready")}
                          className={`px-2.5 py-1 rounded-lg transition ${
                            filterStatus === "ready" ? "bg-emerald-500/20 text-emerald-300 font-medium" : "text-slate-400 hover:text-slate-200"
                          }`}
                        >
                          Ready ({readyCount + importedCount})
                        </button>
                        {failedCount > 0 && (
                          <button
                            onClick={() => setFilterStatus("failed")}
                            className={`px-2.5 py-1 rounded-lg transition ${
                              filterStatus === "failed" ? "bg-rose-500/20 text-rose-300 font-medium" : "text-slate-400 hover:text-slate-200"
                            }`}
                          >
                            Failed ({failedCount})
                          </button>
                        )}
                        {waitingCount > 0 && (
                          <button
                            onClick={() => setFilterStatus("waiting")}
                            className={`px-2.5 py-1 rounded-lg transition ${
                              filterStatus === "waiting" ? "bg-slate-800 text-slate-300 font-medium" : "text-slate-400 hover:text-slate-200"
                            }`}
                          >
                            Waiting ({waitingCount})
                          </button>
                        )}
                      </div>

                      <div className="flex items-center gap-2 text-xs">
                        {readyCount > 0 && (
                          <button
                            onClick={() => toggleSelectAll(selectedCount < readyCount)}
                            className="text-[11px] text-slate-400 hover:text-white transition flex items-center gap-1"
                          >
                            {selectedCount < readyCount ? <CheckSquare size={13} /> : <Square size={13} />}
                            <span>{selectedCount < readyCount ? "Select All" : "Deselect All"}</span>
                          </button>
                        )}

                        {failedCount > 0 && !isProcessingQueue && (
                          <button
                            onClick={retryFailedQueue}
                            className="flex items-center gap-1 px-3 py-1 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 text-rose-300 border border-rose-500/30 text-[11px] font-medium transition"
                          >
                            <RotateCcw size={12} />
                            <span>Retry Failed ({failedCount})</span>
                          </button>
                        )}

                        {isProcessingQueue ? (
                          <button
                            onClick={cancelRemainingQueue}
                            className="flex items-center gap-1 px-3 py-1 rounded-lg bg-rose-500/20 hover:bg-rose-500/30 text-rose-300 border border-rose-500/40 text-[11px] font-medium transition"
                          >
                            <StopCircle size={12} />
                            <span>Cancel Remaining</span>
                          </button>
                        ) : waitingCount > 0 ? (
                          <button
                            onClick={handleStartExtraction}
                            className="flex items-center gap-1.5 px-4 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-xs shadow-md transition"
                          >
                            <Sparkles size={13} />
                            <span>Run Smart Extraction ({waitingCount})</span>
                          </button>
                        ) : null}

                        {readyCount > 0 && (
                          <button
                            onClick={() => setActiveTab("preview")}
                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-sky-600/20 hover:bg-sky-600/30 text-sky-300 border border-sky-500/30 text-xs font-semibold transition"
                          >
                            <Eye size={13} />
                            <span>Review Data ({readyCount})</span>
                          </button>
                        )}

                        {selectedCount > 0 && (
                          <button
                            onClick={() => setShowConfirmModal(true)}
                            className="flex items-center gap-1.5 px-4 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-xs shadow-md transition"
                          >
                            <CheckCircle2 size={13} />
                            <span>Approve Selected ({selectedCount})</span>
                          </button>
                        )}
                      </div>
                    </div>

                    {/* File Cards Listing */}
                    <div className="space-y-2 max-h-96 overflow-y-auto pr-1">
                      {filteredQueue.map((item, idx) => {
                        const isDocx = item.name.endsWith(".docx") || item.name.endsWith(".doc");
                        const isXlsx = item.name.endsWith(".xlsx") || item.name.endsWith(".xls") || item.name.endsWith(".csv");
                        const isPdf = item.name.endsWith(".pdf");
                        const isZip = item.name.endsWith(".zip");
                        const sizeStr = item.size > 1024 * 1024
                          ? `${(item.size / 1024 / 1024).toFixed(2)} MB`
                          : `${(item.size / 1024).toFixed(1)} KB`;

                        return (
                          <div
                            key={item.id}
                            className={`p-3 rounded-xl border text-xs transition flex flex-col gap-2 ${
                              item.status === "ready"
                                ? "bg-slate-900/90 border-slate-800 hover:border-emerald-500/40"
                                : item.status === "failed"
                                ? "bg-rose-950/20 border-rose-900/50"
                                : item.status === "uploading" || item.status === "extracting"
                                ? "bg-slate-900/90 border-sky-500/40"
                                : item.status === "imported"
                                ? "bg-purple-950/20 border-purple-800/40"
                                : "bg-slate-900/60 border-slate-800"
                            }`}
                          >
                            <div className="flex items-center justify-between gap-3">
                              {/* Left: Checkbox + Icon + Filename */}
                              <div className="flex items-center gap-2.5 truncate flex-1 min-w-0">
                                {item.status === "ready" || item.status === "imported" ? (
                                  <input
                                    type="checkbox"
                                    checked={item.selectedForImport}
                                    onChange={() => toggleSelectQueueItem(item.id)}
                                    className="rounded border-slate-700 bg-slate-950 text-emerald-500 focus:ring-0 cursor-pointer shrink-0"
                                    title="Include in import"
                                  />
                                ) : (
                                  <span className="w-3.5 text-slate-600 font-mono text-[10px] shrink-0 text-center">
                                    {idx + 1}
                                  </span>
                                )}

                                {isDocx ? (
                                  <FileText size={16} className="text-blue-400 shrink-0" />
                                ) : isXlsx ? (
                                  <FileSpreadsheet size={16} className="text-emerald-400 shrink-0" />
                                ) : isPdf ? (
                                  <FileText size={16} className="text-rose-400 shrink-0" />
                                ) : isZip ? (
                                  <Layers size={16} className="text-purple-400 shrink-0" />
                                ) : (
                                  <FileText size={16} className="text-slate-400 shrink-0" />
                                )}

                                <div className="truncate">
                                  <span className="font-medium text-slate-200 truncate block text-xs" title={item.name}>
                                    {item.name}
                                  </span>
                                  <div className="flex items-center gap-2 text-[10px] text-slate-500">
                                    <span>{sizeStr}</span>
                                    {item.parsedDoc?.fields?.document_number?.value && (
                                      <>
                                        <span>•</span>
                                        <span className="text-emerald-400 font-mono">
                                          #{String(item.parsedDoc.fields.document_number.value)}
                                        </span>
                                      </>
                                    )}
                                    {item.parsedDoc?.fields?.customer_name?.value && (
                                      <>
                                        <span>•</span>
                                        <span className="text-slate-400 truncate max-w-[150px]">
                                          {String(item.parsedDoc.fields.customer_name.value)}
                                        </span>
                                      </>
                                    )}
                                    {item.parsedDoc?.isDuplicate && (
                                      <>
                                        <span>•</span>
                                        <span className="text-amber-400 font-semibold">Existing Duplicate</span>
                                      </>
                                    )}
                                  </div>
                                </div>
                              </div>

                              {/* Right: Status Pill & Actions */}
                              <div className="flex items-center gap-2 shrink-0">
                                {item.status === "waiting" && (
                                  <span className="px-2 py-0.5 rounded text-[10px] font-medium bg-slate-800 text-slate-400 border border-slate-700 flex items-center gap-1">
                                    <Clock size={11} />
                                    <span>Waiting</span>
                                  </span>
                                )}

                                {item.status === "uploading" && (
                                  <span className="px-2 py-0.5 rounded text-[10px] font-medium bg-sky-500/10 text-sky-400 border border-sky-500/30 flex items-center gap-1.5">
                                    <UploadCloud size={11} className="animate-pulse" />
                                    <span>Uploading ({item.progressPercent}%)</span>
                                  </span>
                                )}

                                {item.status === "extracting" && (
                                  <span className="px-2 py-0.5 rounded text-[10px] font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 flex items-center gap-1.5">
                                    <Sparkles size={11} className="animate-spin" />
                                    <span>Extracting & Auditing</span>
                                  </span>
                                )}

                                {item.status === "ready" && (
                                  <div className="flex items-center gap-1.5">
                                    <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 flex items-center gap-1">
                                      <CheckCircle2 size={11} />
                                      <span>Ready for Review</span>
                                    </span>
                                    {item.parsedDoc && (
                                      <span className="px-1.5 py-0.5 rounded text-[9px] font-mono uppercase bg-slate-800 text-slate-400">
                                        {item.parsedDoc.documentType}
                                      </span>
                                    )}
                                    <button
                                      onClick={() => {
                                        if (item.parsedDoc) {
                                          setSelectedDocId(item.parsedDoc.id);
                                          if (item.parsedDoc.destinationMappings.length > 0) {
                                            setSelectedMapping(item.parsedDoc.destinationMappings[0]);
                                          }
                                        }
                                        setActiveTab("preview");
                                      }}
                                      className="px-2 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-[10px] text-sky-300 font-medium transition flex items-center gap-1"
                                      title="Inspect extracted fields in split-screen editor"
                                    >
                                      <span>Inspect</span>
                                      <ArrowRight size={10} />
                                    </button>
                                  </div>
                                )}

                                {item.status === "failed" && (
                                  <div className="flex items-center gap-1.5">
                                    <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-rose-500/20 text-rose-300 border border-rose-500/30 flex items-center gap-1">
                                      <AlertTriangle size={11} />
                                      <span>Failed</span>
                                    </span>
                                    <button
                                      onClick={() => retrySingleItem(item.id)}
                                      disabled={isProcessingQueue}
                                      className="px-2 py-0.5 rounded bg-rose-500/20 hover:bg-rose-500/30 text-rose-300 text-[10px] font-semibold transition flex items-center gap-1 disabled:opacity-50"
                                      title="Retry extracting this file"
                                    >
                                      <RotateCcw size={10} />
                                      <span>Retry</span>
                                    </button>
                                  </div>
                                )}

                                {item.status === "imported" && (
                                  <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-purple-500/20 text-purple-300 border border-purple-500/30 flex items-center gap-1">
                                    <CheckCircle2 size={11} />
                                    <span>Imported</span>
                                  </span>
                                )}

                                {item.status === "cancelled" && (
                                  <div className="flex items-center gap-1.5">
                                    <span className="px-2 py-0.5 rounded text-[10px] font-medium bg-amber-500/10 text-amber-400 border border-amber-500/20">
                                      Cancelled
                                    </span>
                                    <button
                                      onClick={() => retrySingleItem(item.id)}
                                      disabled={isProcessingQueue}
                                      className="px-2 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-[10px] text-slate-300 transition"
                                    >
                                      Resume
                                    </button>
                                  </div>
                                )}

                                {!isProcessingQueue && (
                                  <button
                                    onClick={() => removeQueueItem(item.id)}
                                    className="text-slate-500 hover:text-rose-400 p-1 transition"
                                    title="Remove from queue"
                                  >
                                    <X size={13} />
                                  </button>
                                )}
                              </div>
                            </div>

                            {/* Failure details if failed */}
                            {item.status === "failed" && item.errorMessage && (
                              <div className="p-2 rounded-lg bg-rose-950/30 border border-rose-900/60 text-[11px] text-rose-300 space-y-1">
                                <div className="flex items-start gap-1.5">
                                  <AlertTriangle size={13} className="shrink-0 text-rose-400 mt-0.5" />
                                  <span className="font-medium">{item.errorMessage}</span>
                                </div>
                                {item.requestId && (
                                  <div className="text-[10px] font-mono text-slate-500 pl-5">
                                    Request Tracking ID: {item.requestId}
                                  </div>
                                )}
                              </div>
                            )}

                            {/* Progress bar for individual uploading item */}
                            {item.status === "uploading" && (
                              <div className="w-full h-1 rounded-full bg-slate-800 overflow-hidden">
                                <div
                                  className="h-full bg-sky-400 transition-all duration-300"
                                  style={{ width: `${item.progressPercent}%` }}
                                />
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })()}

              {parseError && (
                <div className="mt-4 p-3 rounded-lg bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs flex items-center gap-2 text-left">
                  <AlertTriangle size={16} className="shrink-0" />
                  <span>{parseError}</span>
                </div>
              )}
            </div>

            {/* Feature guarantees cards */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
              <div className="p-4 rounded-xl border border-slate-800 bg-slate-950/40">
                <div className="flex items-center gap-2 text-emerald-400 font-semibold mb-1">
                  <ShieldCheck size={16} />
                  <span>Zero Write Preview</span>
                </div>
                <p className="text-slate-400 text-[11px]">
                  Inspect and edit every field before importing. Zero modifications occur in Supabase until explicit approval.
                </p>
              </div>
              <div className="p-4 rounded-xl border border-slate-800 bg-slate-950/40">
                <div className="flex items-center gap-2 text-sky-400 font-semibold mb-1">
                  <Calculator size={16} />
                  <span>Mathematical Audit</span>
                </div>
                <p className="text-slate-400 text-[11px]">
                  Verifies Quantity × Rate, 5% VAT, PVC Tank Liner area & running meter calculations, and flags discrepancies.
                </p>
              </div>
              <div className="p-4 rounded-xl border border-slate-800 bg-slate-950/40">
                <div className="flex items-center gap-2 text-indigo-400 font-semibold mb-1">
                  <Users size={16} />
                  <span>Permanent Employees Safe</span>
                </div>
                <p className="text-slate-400 text-[11px]">
                  Matches attendance and overtime to existing EMP-01 through EMP-10. Never creates duplicate employees or modifies UUIDs.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* ============================================================== */}
        {/* TAB 3: IMPORT PREVIEW (The Most Important Split-Screen Interface) */}
        {/* ============================================================== */}
        {activeTab === "preview" && (
          <div className="flex flex-col h-[calc(100vh-140px)] gap-3">
            {/* Top file selector bar */}
            <div className="flex items-center justify-between bg-slate-950 p-2.5 rounded-xl border border-slate-800">
              <div className="flex items-center gap-2 overflow-x-auto">
                <span className="text-xs text-slate-400 font-medium px-2">Processed Files:</span>
                {documents.map(doc => (
                  <button
                    key={doc.id}
                    onClick={() => {
                      setSelectedDocId(doc.id);
                      if (doc.destinationMappings.length > 0) setSelectedMapping(doc.destinationMappings[0]);
                    }}
                    className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium transition whitespace-nowrap ${
                      doc.id === selectedDocId
                        ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/30"
                        : "bg-slate-900 text-slate-400 hover:text-white border border-slate-800"
                    }`}
                  >
                    <FileText size={13} />
                    <span>{doc.filename}</span>
                    <span className="text-[10px] uppercase px-1 rounded bg-slate-800 text-slate-400 font-mono">
                      {doc.documentType}
                    </span>
                  </button>
                ))}
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => setShowConfirmModal(true)}
                  className="flex items-center gap-1.5 px-3 py-1 text-xs font-semibold rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white transition"
                >
                  <Check size={14} />
                  <span>Approve Import</span>
                </button>
              </div>
            </div>

            {/* Historical Status Accuracy & Evidence Auditor */}
            {currentDoc && (
              <div className="p-3 rounded-xl border border-slate-800 bg-slate-950/80 backdrop-blur shadow-sm space-y-2.5">
                <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                  <div className="flex items-center gap-2">
                    <ShieldCheck size={16} className="text-emerald-400" />
                    <span className="text-xs font-semibold text-white">Historical Status Accuracy & Evidence Mapping</span>
                    <span className="text-[10px] text-slate-400 hidden sm:inline">
                      (Integrity Guardrail: Never assumes accepted, paid, or in-progress)
                    </span>
                  </div>
                  <div className="flex items-center gap-2 text-[10px] text-slate-400 font-mono">
                    <span>Doc #{String(currentDoc.fields.document_number?.value || "N/A")}</span>
                    <span>•</span>
                    <span>Date: {String(currentDoc.fields.document_date?.value || "N/A")}</span>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {/* DOCUMENT STATUS ACCURACY BOX */}
                  <div className="p-2.5 rounded-lg border border-slate-800/90 bg-slate-900/60 space-y-1.5">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-medium text-slate-200 capitalize">
                        {currentDoc.documentType.replace("_", " ")} Status
                      </span>
                      {currentDoc.statusResolution?.userOverridden ? (
                        <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-purple-500/20 text-purple-300 border border-purple-500/30">
                          ✏️ User Overridden
                        </span>
                      ) : currentDoc.statusResolution?.isAssumed ? (
                        <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-amber-500/20 text-amber-300 border border-amber-500/30">
                          ⚠️ Neutral Assumption
                        </span>
                      ) : (
                        <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                          ✓ Verified Source Evidence
                        </span>
                      )}
                    </div>

                    <div className="text-[11px] text-slate-400">
                      <span className="text-slate-500 text-[9px] uppercase font-mono block">Source Evidence & Reason:</span>
                      <p className="italic text-slate-300 text-[11px] leading-tight">
                        {currentDoc.statusResolution?.mappingReason || "No explicit status indicator found (Neutral Draft fallback applied)"}
                      </p>
                      {currentDoc.statusResolution?.rawEvidence && (
                        <p className="mt-1 font-mono text-[10px] text-emerald-400 truncate">
                          Snippet: &quot;{currentDoc.statusResolution.rawEvidence}&quot;
                        </p>
                      )}
                    </div>

                    <div className="pt-1.5 flex items-center justify-between gap-2 border-t border-slate-800/60">
                      <label className="text-[11px] text-slate-300 font-medium whitespace-nowrap">
                        Proposed Status (Editable):
                      </label>
                      <select
                        value={currentDoc.statusResolution?.proposedStatus || (currentDoc.documentType === "quotation" || currentDoc.documentType === "tax_invoice" ? "draft" : "draft")}
                        onChange={e => handleStatusChange(currentDoc.id, e.target.value, false)}
                        className="bg-slate-950 border border-slate-700 rounded px-2 py-1 text-xs text-white font-medium focus:border-emerald-500 focus:outline-none cursor-pointer"
                      >
                        {(STATUS_OPTIONS_BY_MODULE[currentDoc.documentType] || [
                          { value: "draft", label: "Draft" },
                        ]).map(opt => (
                          <option key={opt.value} value={opt.value}>
                            {opt.label}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  {/* PROJECT STATUS ACCURACY BOX */}
                  <div className="p-2.5 rounded-lg border border-slate-800/90 bg-slate-900/60 space-y-1.5">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-medium text-slate-200 truncate max-w-[200px]" title={currentDoc.projectResolution?.extractedName || "No Linked Project"}>
                        Project: {currentDoc.projectResolution?.extractedName || "No Linked Project"}
                      </span>
                      {currentDoc.statusResolution?.projectStatusResolution?.userOverridden ? (
                        <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-purple-500/20 text-purple-300 border border-purple-500/30">
                          ✏️ User Overridden
                        </span>
                      ) : currentDoc.statusResolution?.projectStatusResolution?.isAssumed ? (
                        <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-amber-500/20 text-amber-300 border border-amber-500/30">
                          ⚠️ Neutral Assumption
                        </span>
                      ) : (
                        <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                          ✓ Verified Source Evidence
                        </span>
                      )}
                    </div>

                    <div className="text-[11px] text-slate-400">
                      <span className="text-slate-500 text-[9px] uppercase font-mono block">Source Evidence & Reason:</span>
                      <p className="italic text-slate-300 text-[11px] leading-tight">
                        {currentDoc.statusResolution?.projectStatusResolution?.mappingReason || "No active site work certificate detected (Neutral Planning fallback applied)"}
                      </p>
                      {currentDoc.statusResolution?.projectStatusResolution?.rawEvidence && (
                        <p className="mt-1 font-mono text-[10px] text-emerald-400 truncate">
                          Snippet: &quot;{currentDoc.statusResolution.projectStatusResolution.rawEvidence}&quot;
                        </p>
                      )}
                    </div>

                    <div className="pt-1.5 flex items-center justify-between gap-2 border-t border-slate-800/60">
                      <label className="text-[11px] text-slate-300 font-medium whitespace-nowrap">
                        Proposed Project Status:
                      </label>
                      <select
                        disabled={!currentDoc.projectResolution?.extractedName}
                        value={currentDoc.statusResolution?.projectStatusResolution?.proposedStatus || "Planning"}
                        onChange={e => handleStatusChange(currentDoc.id, e.target.value, true)}
                        className="bg-slate-950 border border-slate-700 rounded px-2 py-1 text-xs text-white font-medium focus:border-emerald-500 focus:outline-none cursor-pointer disabled:opacity-50"
                      >
                        {STATUS_OPTIONS_BY_MODULE.project.map(opt => (
                          <option key={opt.value} value={opt.value}>
                            {opt.label}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Split Screen Container */}
            {currentDoc ? (
              <div className="flex-1 grid grid-cols-1 lg:grid-cols-12 gap-3 min-h-0">
                {/* LEFT PANEL: Original Source File View */}
                <div className="lg:col-span-5 flex flex-col rounded-xl border border-slate-800 bg-slate-950/70 overflow-hidden">
                  <div className="px-3 py-2 border-b border-slate-800 bg-slate-900 flex items-center justify-between text-xs font-semibold text-slate-300">
                    <div className="flex items-center gap-2">
                      <FileText size={14} className="text-sky-400" />
                      <span>Original Source View ({currentDoc.filename})</span>
                    </div>
                    <span className="text-[10px] text-slate-500 font-mono">
                      {currentDoc.rawContentSummary.rawSnippets.length} Evidence Snippets
                    </span>
                  </div>

                  <div className="flex-1 p-3 overflow-y-auto space-y-2 font-mono text-[11px] leading-relaxed">
                    {currentDoc.rawContentSummary.rawSnippets.map((snippet, idx) => {
                      const isHighlighted =
                        selectedMapping &&
                        (selectedMapping.sourceLocation.includes(snippet.location) ||
                          snippet.text.toLowerCase().includes(String(selectedMapping.extractedValue).toLowerCase()));

                      return (
                        <div
                          key={idx}
                          className={`p-2 rounded border transition-all ${
                            isHighlighted
                              ? "bg-amber-500/20 border-amber-500/60 text-amber-200 shadow-md"
                              : "bg-slate-900/60 border-slate-800/80 text-slate-400 hover:text-slate-200"
                          }`}
                        >
                          <div className="text-[9px] uppercase tracking-wider text-slate-500 mb-0.5">
                            {snippet.location}
                          </div>
                          <div>{snippet.text}</div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* RIGHT PANEL: Structured ERP Destination Mapping Table */}
                <div className="lg:col-span-7 flex flex-col rounded-xl border border-slate-800 bg-slate-950/70 overflow-hidden">
                  <div className="px-3 py-2 border-b border-slate-800 bg-slate-900 flex items-center justify-between text-xs font-semibold text-slate-300">
                    <div className="flex items-center gap-2">
                      <Database size={14} className="text-emerald-400" />
                      <span>Structured ERP Destination Mapping (12 Columns)</span>
                    </div>
                    <span className="text-[10px] text-emerald-400">
                      Click any row to trace source
                    </span>
                  </div>

                  <div className="flex-1 overflow-auto">
                    <table className="w-full text-left text-xs border-collapse">
                      <thead className="bg-slate-900/90 text-slate-400 sticky top-0 z-10 text-[10px] uppercase font-semibold border-b border-slate-800">
                        <tr>
                          <th className="p-2.5">Source Loc</th>
                          <th className="p-2.5">Extracted Value</th>
                          <th className="p-2.5">ERP Module</th>
                          <th className="p-2.5">Destination Field</th>
                          <th className="p-2.5">Proposed Action</th>
                          <th className="p-2.5">Status</th>
                          <th className="p-2.5">Editable Value</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-800/60 text-[11px]">
                        {currentDoc.destinationMappings.map((map, mIdx) => {
                          const isSelected = selectedMapping === map;
                          return (
                            <tr
                              key={mIdx}
                              onClick={() => setSelectedMapping(map)}
                              className={`cursor-pointer transition ${
                                isSelected ? "bg-emerald-500/10 text-emerald-200" : "hover:bg-slate-900/40 text-slate-300"
                              }`}
                            >
                              <td className="p-2.5 font-mono text-[10px] text-slate-400 whitespace-nowrap">
                                {map.sourceLocation}
                              </td>
                              <td className="p-2.5 font-medium text-white max-w-[140px] truncate" title={String(map.extractedValue)}>
                                {String(map.extractedValue)}
                              </td>
                              <td className="p-2.5">
                                <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-slate-800 text-slate-300">
                                  {map.erpModule}
                                </span>
                              </td>
                              <td className="p-2.5 font-mono text-[10px] text-slate-400">
                                {map.destinationTable}.{map.destinationField}
                              </td>
                              <td className="p-2.5">
                                <span
                                  className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                                    map.proposedAction === "reuse_existing"
                                      ? "bg-blue-500/20 text-blue-300"
                                      : map.proposedAction === "create_new"
                                      ? "bg-emerald-500/20 text-emerald-300"
                                      : map.proposedAction === "needs_review"
                                      ? "bg-amber-500/20 text-amber-300"
                                      : "bg-slate-800 text-slate-400"
                                  }`}
                                >
                                  {map.proposedAction.replace("_", " ").toUpperCase()}
                                </span>
                              </td>
                              <td className="p-2.5">
                                <span
                                  className={`text-[10px] font-semibold ${
                                    map.validationStatus === "valid" ? "text-emerald-400" : "text-amber-400"
                                  }`}
                                >
                                  {map.validationStatus.toUpperCase()}
                                </span>
                              </td>
                              <td className="p-2.5">
                                <input
                                  type="text"
                                  value={String(map.editableValue || "")}
                                  onChange={e => handleMappingChange(currentDoc.id, mIdx, e.target.value)}
                                  className="w-full bg-slate-900 border border-slate-700 rounded px-2 py-1 text-[11px] text-slate-200 focus:border-emerald-500 focus:outline-none"
                                />
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            ) : (
              <div className="p-12 text-center text-slate-500">
                No documents extracted yet. Please upload files in the &quot;Upload Files&quot; tab first.
              </div>
            )}
          </div>
        )}

        {/* ============================================================== */}
        {/* TAB 2: EXTRACTED DATA */}
        {/* ============================================================== */}
        {activeTab === "extracted" && (
          <div className="space-y-4">
            <h2 className="text-sm font-semibold text-white">Extracted Business Documents Summary</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {documents.map(doc => (
                <div key={doc.id} className="p-4 rounded-xl border border-slate-800 bg-slate-950/60 space-y-3">
                  <div className="flex items-center justify-between border-b border-slate-800/80 pb-2">
                    <div className="flex items-center gap-2">
                      <FileText size={16} className="text-emerald-400" />
                      <span className="font-semibold text-white text-xs">{doc.filename}</span>
                    </div>
                    <span className="text-[10px] uppercase font-bold px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                      {doc.documentType} ({Math.round(doc.classificationConfidence * 100)}%)
                    </span>
                  </div>

                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div>
                      <span className="text-[10px] text-slate-500 uppercase">Document Number:</span>
                      <p className="font-medium text-slate-200">{String(doc.fields.document_number?.value || "N/A")}</p>
                    </div>
                    <div>
                      <span className="text-[10px] text-slate-500 uppercase">Document Date:</span>
                      <p className="font-medium text-slate-200">{String(doc.fields.document_date?.value || "N/A")}</p>
                    </div>
                    <div>
                      <span className="text-[10px] text-slate-500 uppercase">Customer:</span>
                      <p className="font-medium text-slate-200">{String(doc.fields.customer_name?.value || "N/A")}</p>
                    </div>
                    <div>
                      <span className="text-[10px] text-slate-500 uppercase">Project:</span>
                      <p className="font-medium text-slate-200">{String(doc.fields.project_name?.value || "N/A")}</p>
                    </div>
                    <div>
                      <span className="text-[10px] text-slate-500 uppercase">Line Items:</span>
                      <p className="font-medium text-slate-200">{doc.items.length} items</p>
                    </div>
                    <div>
                      <span className="text-[10px] text-slate-500 uppercase">Total Amount:</span>
                      <p className="font-medium text-emerald-400">AED {String(doc.fields.total_amount?.value || "0")}</p>
                    </div>
                  </div>

                  {doc.measurements && (
                    <div className="p-2.5 rounded-lg bg-slate-900 border border-slate-800 text-xs">
                      <span className="text-[10px] uppercase text-sky-400 font-bold block mb-1">
                        PVC Tank Liner Measurements
                      </span>
                      <div className="flex gap-4 text-[11px] text-slate-300">
                        <span>Diameter: {doc.measurements.diameter}m</span>
                        <span>Height: {doc.measurements.height}m</span>
                        <span>Area: {doc.measurements.calculatedArea}m²</span>
                        <span>RM: {doc.measurements.calculatedRunningMeter}m</span>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ============================================================== */}
        {/* TAB 5: CUSTOMERS & SUPPLIERS ENTITY RESOLUTION */}
        {/* ============================================================== */}
        {activeTab === "entities" && (
          <div className="space-y-4 max-w-5xl mx-auto">
            <h2 className="text-sm font-semibold text-white">Customers & Suppliers Entity Resolution</h2>
            <div className="rounded-xl border border-slate-800 bg-slate-950/60 overflow-hidden">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-900 text-slate-400 text-[10px] uppercase font-semibold border-b border-slate-800">
                  <tr>
                    <th className="p-3">Entity Type</th>
                    <th className="p-3">Extracted Name</th>
                    <th className="p-3">Extracted TRN</th>
                    <th className="p-3">Proposed Action</th>
                    <th className="p-3">Matched Existing Record</th>
                    <th className="p-3">Confidence & Reason</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60 text-slate-300">
                  {documents.map(doc => {
                    const c = doc.customerResolution;
                    const s = doc.supplierResolution;
                    const target = c && c.action !== "skip" ? c : s && s.action !== "skip" ? s : null;
                    if (!target) return null;

                    return (
                      <tr key={doc.id}>
                        <td className="p-3 font-semibold text-white">{target.targetModule}</td>
                        <td className="p-3 font-medium text-emerald-300">{target.extractedName}</td>
                        <td className="p-3 font-mono">{target.extractedTrn || "—"}</td>
                        <td className="p-3">
                          <span
                            className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                              target.action === "reuse_existing"
                                ? "bg-blue-500/20 text-blue-300"
                                : target.action === "create_new"
                                ? "bg-emerald-500/20 text-emerald-300"
                                : "bg-amber-500/20 text-amber-300"
                            }`}
                          >
                            {target.action.replace("_", " ").toUpperCase()}
                          </span>
                        </td>
                        <td className="p-3 font-medium text-slate-200">{target.matchedName || "—"}</td>
                        <td className="p-3 text-[11px] text-slate-400">{target.matchReason}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ============================================================== */}
        {/* TAB 4: FIELD MAPPING CONFIGURATOR */}
        {/* ============================================================== */}
        {activeTab === "mapping" && (
          <div className="space-y-4 max-w-4xl mx-auto">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-sm font-semibold text-white">Excel Column to ERP Field Mapping</h2>
                <p className="text-xs text-slate-400 mt-0.5">
                  Configure how document columns map to Dubai ERP database fields.
                </p>
              </div>
              <span className="px-2.5 py-1 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 text-xs font-semibold">
                Auto-Detected Schema
              </span>
            </div>

            <div className="rounded-xl border border-slate-800 bg-slate-950/60 overflow-hidden">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-900 text-slate-400 text-[10px] uppercase font-semibold border-b border-slate-800">
                  <tr>
                    <th className="p-3">Source Column / Header</th>
                    <th className="p-3">Target ERP Module</th>
                    <th className="p-3">Destination Field</th>
                    <th className="p-3">Data Type</th>
                    <th className="p-3">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60 text-slate-300">
                  {[
                    { src: "Customer / Client Name", mod: "Customers", field: "customers.name", type: "Text (Unique)", status: "Mapped" },
                    { src: "TRN / Tax Registration Number", mod: "Customers", field: "customers.trn", type: "15-Digit Numeric", status: "Mapped" },
                    { src: "Project Name / Site Location", mod: "Projects", field: "projects.name", type: "Text", status: "Mapped" },
                    { src: "Quotation / Invoice Number", mod: "Documents", field: "quotations.quotation_number", type: "Historical Code", status: "Mapped" },
                    { src: "Document Date", mod: "Documents", field: "quotations.quotation_date", type: "ISO Date", status: "Mapped" },
                    { src: "Item Description", mod: "Line Items", field: "quotation_items.description", type: "Text", status: "Mapped" },
                    { src: "Quantity", mod: "Line Items", field: "quotation_items.quantity", type: "Decimal", status: "Mapped" },
                    { src: "Unit Rate (AED)", mod: "Line Items", field: "quotation_items.unit_price", type: "Currency", status: "Mapped" },
                    { src: "VAT Rate (%)", mod: "Line Items", field: "quotation_items.vat_rate", type: "Percentage (5%)", status: "Mapped" },
                    { src: "Tank Diameter / Height", mod: "Measurements", field: "measurement_items.tank_liner_data", type: "Metres", status: "Mapped" },
                  ].map((row, i) => (
                    <tr key={i}>
                      <td className="p-3 font-semibold text-white">{row.src}</td>
                      <td className="p-3 text-emerald-400">{row.mod}</td>
                      <td className="p-3 font-mono text-[11px] text-slate-400">{row.field}</td>
                      <td className="p-3 text-slate-400">{row.type}</td>
                      <td className="p-3">
                        <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-500/20 text-emerald-400">
                          {row.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ============================================================== */}
        {/* TAB 6: PROJECTS & VISUAL RELATIONSHIP TREE */}
        {/* ============================================================== */}
        {activeTab === "projects" && (
          <div className="space-y-6 max-w-5xl mx-auto">
            <div>
              <h2 className="text-sm font-semibold text-white">Projects Resolution & Hierarchy</h2>
              <p className="text-xs text-slate-400 mt-0.5">
                Trace relationships from Customers &rarr; Projects &rarr; Documents &rarr; Line Items & Measurements.
              </p>
            </div>

            {/* Before and After Record Counts */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <div className="p-3.5 rounded-xl border border-slate-800 bg-slate-950/60">
                <span className="text-[10px] text-slate-400 uppercase font-semibold">Existing Customers</span>
                <p className="text-lg font-bold text-white mt-1">{beforeCounts.customers} Existing</p>
              </div>
              <div className="p-3.5 rounded-xl border border-slate-800 bg-slate-950/60">
                <span className="text-[10px] text-slate-400 uppercase font-semibold">Existing Projects</span>
                <p className="text-lg font-bold text-white mt-1">{beforeCounts.projects} Existing</p>
              </div>
              <div className="p-3.5 rounded-xl border border-slate-800 bg-slate-950/60">
                <span className="text-[10px] text-emerald-400 uppercase font-semibold">Proposed New Projects</span>
                <p className="text-lg font-bold text-emerald-400 mt-1">+{proposedSummary?.newProjects || 0} New</p>
              </div>
              <div className="p-3.5 rounded-xl border border-slate-800 bg-slate-950/60">
                <span className="text-[10px] text-sky-400 uppercase font-semibold">Proposed Reused Projects</span>
                <p className="text-lg font-bold text-sky-400 mt-1">{proposedSummary?.reusedProjects || 0} Reused</p>
              </div>
            </div>

            {/* Visual Relationship Tree */}
            <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-5 space-y-4">
              <h3 className="text-xs font-bold text-slate-300 uppercase tracking-wider">Visual Relationship Tree</h3>

              {relationshipTrees.length === 0 ? (
                <div className="p-8 text-center text-slate-500 text-xs">
                  Upload and process documents to preview the visual entity relationship tree.
                </div>
              ) : (
                <div className="space-y-4">
                  {relationshipTrees.map(rootNode => (
                    <div key={rootNode.id} className="p-3.5 rounded-xl bg-slate-900/80 border border-slate-800 space-y-3">
                      {/* Root Customer/Supplier */}
                      <div className="flex items-center gap-2">
                        <Users size={16} className="text-emerald-400" />
                        <span className="font-bold text-white text-xs">{rootNode.label}</span>
                        <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-500/20 text-emerald-300 uppercase">
                          {rootNode.status}
                        </span>
                      </div>

                      {/* Projects Level */}
                      {rootNode.children?.map(projNode => (
                        <div key={projNode.id} className="ml-6 pl-4 border-l-2 border-slate-700/80 space-y-2">
                          <div className="flex items-center gap-2">
                            <Briefcase size={14} className="text-sky-400" />
                            <span className="font-semibold text-slate-200 text-xs">{projNode.label}</span>
                            <span className="px-1.5 py-0.2 rounded text-[9px] font-bold bg-sky-500/20 text-sky-300 uppercase">
                              {projNode.status}
                            </span>
                          </div>

                          {/* Documents Level */}
                          {projNode.children?.map(docNode => (
                            <div key={docNode.id} className="ml-6 pl-4 border-l-2 border-slate-800 space-y-2">
                              <div className="flex items-center gap-2">
                                <FileText size={13} className="text-indigo-400" />
                                <span className="font-medium text-slate-300 text-xs">{docNode.label}</span>
                                <span className="text-[11px] text-slate-500">({docNode.details})</span>
                              </div>

                              {/* Items / Measurements */}
                              {docNode.children && docNode.children.length > 0 && (
                                <div className="ml-6 pl-4 border-l border-slate-800 space-y-1">
                                  {docNode.children.map(itemNode => (
                                    <div key={itemNode.id} className="text-[11px] text-slate-400 flex items-center gap-2">
                                      <span className="text-slate-600">&bull;</span>
                                      <span className="text-slate-300">{itemNode.label}</span>
                                      {itemNode.details && <span className="text-slate-500">({itemNode.details})</span>}
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      ))}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* ============================================================== */}
        {/* TAB 7: DOCUMENTS & TRANSACTIONS BREAKDOWN */}
        {/* ============================================================== */}
        {activeTab === "documents" && (
          <div className="space-y-4 max-w-5xl mx-auto">
            <h2 className="text-sm font-semibold text-white">Extracted Documents & Line Items Breakdown</h2>
            <div className="rounded-xl border border-slate-800 bg-slate-950/60 overflow-hidden">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-900 text-slate-400 text-[10px] uppercase font-semibold border-b border-slate-800">
                  <tr>
                    <th className="p-3">Doc Number</th>
                    <th className="p-3">Date</th>
                    <th className="p-3">Type</th>
                    <th className="p-3">Customer / Supplier</th>
                    <th className="p-3">Items Count</th>
                    <th className="p-3">Total Amount</th>
                    <th className="p-3">Duplicate Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60 text-slate-300">
                  {documents.map(doc => (
                    <tr key={doc.id}>
                      <td className="p-3 font-mono font-medium text-white">
                        {String(doc.fields.document_number?.value || "N/A")}
                      </td>
                      <td className="p-3">{String(doc.fields.document_date?.value || "N/A")}</td>
                      <td className="p-3 uppercase text-[10px] font-bold text-sky-400">{doc.documentType}</td>
                      <td className="p-3 font-medium text-emerald-300">
                        {String(doc.fields.customer_name?.value || doc.fields.supplier_name?.value || "N/A")}
                      </td>
                      <td className="p-3">{doc.items.length} line items</td>
                      <td className="p-3 font-mono font-bold text-emerald-400">
                        AED {String(doc.fields.total_amount?.value || "0")}
                      </td>
                      <td className="p-3">
                        <span
                          className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                            doc.isDuplicate ? "bg-rose-500/20 text-rose-300" : "bg-emerald-500/20 text-emerald-300"
                          }`}
                        >
                          {doc.isDuplicate ? "DUPLICATE (SKIP)" : "UNIQUE (IMPORT)"}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ============================================================== */}
        {/* TAB 8: VALIDATION & DUPLICATES & CALCULATION AUDIT */}
        {/* ============================================================== */}
        {activeTab === "validation" && (
          <div className="space-y-6 max-w-5xl mx-auto">
            <h2 className="text-sm font-semibold text-white">Calculation Verification & Mathematical Audit</h2>
            <div className="rounded-xl border border-slate-800 bg-slate-950/60 overflow-hidden">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-900 text-slate-400 text-[10px] uppercase font-semibold border-b border-slate-800">
                  <tr>
                    <th className="p-3">Document #</th>
                    <th className="p-3">Description</th>
                    <th className="p-3">Field</th>
                    <th className="p-3">Original Doc Value</th>
                    <th className="p-3">Calculated ERP Value</th>
                    <th className="p-3">Difference</th>
                    <th className="p-3">Result</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60 text-slate-300">
                  {auditRows.map((r, i) => (
                    <tr key={i}>
                      <td className="p-3 font-mono text-[11px]">{r.documentNumber}</td>
                      <td className="p-3 font-medium text-white max-w-[200px] truncate">{r.description}</td>
                      <td className="p-3 text-slate-400">{r.field}</td>
                      <td className="p-3 font-mono">AED {r.originalDocumentValue.toFixed(2)}</td>
                      <td className="p-3 font-mono text-emerald-400">AED {r.calculatedErpValue.toFixed(2)}</td>
                      <td className="p-3 font-mono text-slate-400">{r.difference.toFixed(2)}</td>
                      <td className="p-3">
                        <span
                          className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                            r.validationResult === "MATCH"
                              ? "bg-emerald-500/20 text-emerald-400"
                              : "bg-rose-500/20 text-rose-400"
                          }`}
                        >
                          {r.validationResult}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ============================================================== */}
        {/* TAB 11: DOWNLOAD TEMPLATES */}
        {/* ============================================================== */}
        {activeTab === "templates" && (
          <div className="max-w-5xl mx-auto space-y-4">
            <h2 className="text-sm font-semibold text-white">Download Standard Excel Import Templates</h2>
            <p className="text-xs text-slate-400">
              Download clean Excel (.xlsx) templates pre-formatted with sample data for fast and accurate importing.
            </p>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {Object.values(TEMPLATE_DEFINITIONS).map(tmpl => (
                <div key={tmpl.type} className="p-4 rounded-xl border border-slate-800 bg-slate-950/60 space-y-3 flex flex-col justify-between">
                  <div>
                    <div className="flex items-center gap-2 text-emerald-400 font-semibold text-xs">
                      <FileSpreadsheet size={16} />
                      <span>{tmpl.title}</span>
                    </div>
                    <p className="text-[11px] text-slate-400 mt-1">{tmpl.description}</p>
                    <div className="mt-2 text-[10px] text-slate-500 font-mono">
                      {tmpl.headers.slice(0, 4).join(", ")}...
                    </div>
                  </div>
                  <a
                    href={`/api/smart-import/templates?type=${tmpl.type}`}
                    download
                    className="flex items-center justify-center gap-2 px-3 py-2 text-xs font-medium rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition"
                  >
                    <Download size={14} />
                    <span>Download Excel Template</span>
                  </a>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ============================================================== */}
        {/* TAB 10: EXPORT DATA */}
        {/* ============================================================== */}
        {activeTab === "export" && (
          <div className="max-w-4xl mx-auto space-y-4">
            <h2 className="text-sm font-semibold text-white">Export ERP Modules</h2>
            <p className="text-xs text-slate-400">Export active database records safely into Excel (.xlsx) or CSV.</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
              {[
                { module: "customers", label: "Customers Master" },
                { module: "suppliers", label: "Suppliers & Vendors" },
                { module: "projects", label: "Projects & Sites" },
                { module: "quotations", label: "Quotations" },
                { module: "tax_invoices", label: "Tax Invoices" },
                { module: "expenses", label: "Expenses" },
                { module: "attendance", label: "Employee Attendance" },
              ].map(m => (
                <div key={m.module} className="p-3.5 rounded-xl border border-slate-800 bg-slate-950/60 flex items-center justify-between">
                  <span className="font-medium text-slate-200">{m.label}</span>
                  <div className="flex gap-2">
                    <a
                      href={`/api/smart-import/export?module=${m.module}&format=xlsx`}
                      download
                      className="px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-emerald-400 font-medium text-[11px] transition"
                    >
                      Excel
                    </a>
                    <a
                      href={`/api/smart-import/export?module=${m.module}&format=csv`}
                      download
                      className="px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 font-medium text-[11px] transition"
                    >
                      CSV
                    </a>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ============================================================== */}
        {/* TAB 9: IMPORT HISTORY & AUDIT */}
        {/* ============================================================== */}
        {activeTab === "history" && (
          <div className="max-w-5xl mx-auto space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-white">Import History & Audit Log</h2>
              <button onClick={loadHistory} className="text-xs text-slate-400 hover:text-white flex items-center gap-1">
                <RefreshCw size={12} className={loadingBatches ? "animate-spin" : ""} />
                <span>Refresh</span>
              </button>
            </div>

            {batches.length === 0 ? (
              <div className="p-8 rounded-xl border border-slate-800 bg-slate-950/40 text-center text-slate-500 text-xs">
                No past import batches recorded yet.
              </div>
            ) : (
              <div className="space-y-3">
                {batches.map(b => (
                  <div key={b.id} className="p-4 rounded-xl border border-slate-800 bg-slate-950/60 flex flex-wrap items-center justify-between gap-4 text-xs">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-white">{b.batch_name}</span>
                        <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                          b.status === "completed" ? "bg-emerald-500/20 text-emerald-400" : "bg-rose-500/20 text-rose-400"
                        }`}>
                          {b.status.toUpperCase()}
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-400 mt-1">
                        Files: {b.filenames?.join(", ") || `${b.file_count} files`} • Created {new Date(b.created_at).toLocaleString("en-AE")}
                      </p>
                    </div>

                    <div className="flex items-center gap-3">
                      <div className="text-right">
                        <span className="text-[10px] text-slate-500 uppercase block">Records Created</span>
                        <span className="font-bold text-emerald-400">
                          {Object.values(b.records_created || {}).reduce((x, y) => x + y, 0)} records
                        </span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </main>

      {/* FINAL APPROVAL CONFIRMATION MODAL */}
      {showConfirmModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <div className="w-full max-w-xl rounded-2xl border border-slate-700 bg-slate-950 p-6 shadow-2xl space-y-4 max-h-[90vh] overflow-y-auto">
            {/* Modal Header */}
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2 text-emerald-400">
                <CheckCircle2 size={20} />
                <div>
                  <h3 className="text-sm font-semibold text-white">Approve & Save Records to Dubai ERP</h3>
                  <p className="text-[11px] text-slate-400">Verify tenant company scope and foreign-key relational mappings</p>
                </div>
              </div>
              <button onClick={() => setShowConfirmModal(false)} className="text-slate-400 hover:text-white transition">
                <X size={16} />
              </button>
            </div>

            {/* SECTION 1: RESOLVED COMPANY PROFILE */}
            <div className={`p-3.5 rounded-xl border text-xs space-y-2 ${
              company?.id
                ? "bg-slate-900/90 border-emerald-500/30"
                : "bg-rose-950/20 border-rose-500/30 text-rose-300"
            }`}>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Building2 size={16} className={company?.id ? "text-emerald-400" : "text-rose-400"} />
                  <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                    Target ERP Company Profile
                  </span>
                </div>
                {company?.id ? (
                  <span className="px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 text-[10px] font-bold">
                    VERIFIED TENANT
                  </span>
                ) : (
                  <span className="px-2 py-0.5 rounded-full bg-rose-500/10 text-rose-400 border border-rose-500/20 text-[10px] font-bold">
                    RESOLUTION REQUIRED
                  </span>
                )}
              </div>

              {company?.id ? (
                <div className="space-y-1 text-slate-300">
                  <div className="flex items-center justify-between">
                    <span className="text-slate-400">Company Name:</span>
                    <strong className="text-white font-medium">{company.name}</strong>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-slate-400">Company ID:</span>
                    <span className="font-mono text-[10px] text-slate-300 bg-slate-800/80 px-1.5 py-0.5 rounded">
                      {company.id}
                    </span>
                  </div>
                  {company.trn && (
                    <div className="flex items-center justify-between">
                      <span className="text-slate-400">Tax Registration Number (TRN):</span>
                      <span className="font-mono text-emerald-400">{company.trn}</span>
                    </div>
                  )}
                </div>
              ) : (
                <div className="text-xs space-y-2">
                  <p className="text-rose-300 font-medium">
                    {companyError || "Company profile not found in ERP."}
                  </p>
                  <p className="text-[11px] text-slate-400">
                    Safe Recovery: Navigate to Settings → Company Settings to configure your company profile before importing documents.
                  </p>
                  <Link
                    href="/settings/company"
                    className="inline-flex items-center gap-1 text-[11px] text-sky-400 hover:underline"
                  >
                    <span>Open Company Settings</span>
                    <ExternalLink size={11} />
                  </Link>
                </div>
              )}
            </div>

            {/* Dynamic Destinations & Integrity Logic */}
            {(() => {
              const approvedDocs = documents.filter(d => {
                const qItem = queue.find(q => q.name === d.filename || q.parsedDoc?.id === d.id);
                if (qItem && !qItem.selectedForImport) return false;
                if (skipDuplicates && d.isDuplicate) return false;
                return true;
              });

              const distinctCustomers = Array.from(
                new Set(approvedDocs.map(d => d.customerResolution?.extractedName).filter(Boolean))
              ) as string[];
              const distinctSuppliers = Array.from(
                new Set(approvedDocs.map(d => d.supplierResolution?.extractedName).filter(Boolean))
              ) as string[];
              const distinctProjects = Array.from(
                new Set(approvedDocs.map(d => d.projectResolution?.extractedName).filter(Boolean))
              ) as string[];
              const docTypesPresent = Array.from(new Set(approvedDocs.map(d => d.documentType)));

              // Critical errors check
              const criticalErrors: string[] = [];
              if (!company?.id) {
                criticalErrors.push("Company profile unresolved. Database execution blocked.");
              }
              if (approvedDocs.length === 0) {
                criticalErrors.push("No documents selected for import. Please check at least one valid document.");
              }
              approvedDocs.forEach(d => {
                if (d.validationErrors && d.validationErrors.length > 0) {
                  d.validationErrors.forEach(err => criticalErrors.push(`${d.filename}: ${err}`));
                }
                if (d.documentType === "unknown") {
                  criticalErrors.push(`${d.filename}: Unrecognized document type.`);
                }
                if (
                  (d.documentType === "quotation" || d.documentType === "tax_invoice" || d.documentType === "delivery_note") &&
                  !d.customerResolution?.extractedName
                ) {
                  criticalErrors.push(`${d.filename}: Missing customer name.`);
                }
                if (d.documentType === "purchase_order" && !d.supplierResolution?.extractedName) {
                  criticalErrors.push(`${d.filename}: Missing supplier name.`);
                }
              });

              const hasCriticalErrors = criticalErrors.length > 0;

              return (
                <>
                  {/* SECTION 2: RELATIONAL DESTINATIONS & SUMMARY */}
                  <div className="p-3.5 rounded-xl bg-slate-900 border border-slate-800 space-y-3 text-xs">
                    <span className="text-[10px] font-bold uppercase text-slate-400 tracking-wider block">
                      Relational Destination Mapping & Planned Operations
                    </span>

                    <div className="space-y-2">
                      {/* Customer Destination */}
                      {distinctCustomers.length > 0 && (
                        <div className="flex items-start justify-between p-2 rounded-lg bg-slate-950/60 border border-slate-800/80">
                          <div className="flex items-center gap-2">
                            <Users size={14} className="text-emerald-400 mt-0.5" />
                            <div>
                              <span className="text-slate-300 font-medium">Customer Destination</span>
                              <span className="text-[10px] text-slate-500 font-mono block">Table: customers</span>
                            </div>
                          </div>
                          <div className="text-right">
                            <span className="text-xs font-semibold text-white">
                              {proposedSummary?.newCustomers || 0} New, {proposedSummary?.reusedCustomers || 0} Reused
                            </span>
                            <span className="text-[10px] text-slate-400 block truncate max-w-[240px]">
                              {distinctCustomers.join(", ")}
                            </span>
                          </div>
                        </div>
                      )}

                      {/* Supplier Destination */}
                      {distinctSuppliers.length > 0 && (
                        <div className="flex items-start justify-between p-2 rounded-lg bg-slate-950/60 border border-slate-800/80">
                          <div className="flex items-center gap-2">
                            <Users size={14} className="text-amber-400 mt-0.5" />
                            <div>
                              <span className="text-slate-300 font-medium">Supplier Destination</span>
                              <span className="text-[10px] text-slate-500 font-mono block">Table: suppliers</span>
                            </div>
                          </div>
                          <div className="text-right">
                            <span className="text-xs font-semibold text-white">
                              {proposedSummary?.newSuppliers || 0} New, {proposedSummary?.reusedSuppliers || 0} Reused
                            </span>
                            <span className="text-[10px] text-slate-400 block truncate max-w-[240px]">
                              {distinctSuppliers.join(", ")}
                            </span>
                          </div>
                        </div>
                      )}

                      {/* Project Destination */}
                      {distinctProjects.length > 0 && (() => {
                        const projStatus = approvedDocs.find(d => d.projectResolution?.extractedName)?.statusResolution?.projectStatusResolution;
                        const statusLabel = projStatus?.proposedStatus || "Planning";
                        const isAssumed = projStatus?.isAssumed ?? true;
                        return (
                          <div className="flex items-start justify-between p-2 rounded-lg bg-slate-950/60 border border-slate-800/80">
                            <div className="flex items-center gap-2">
                              <Briefcase size={14} className="text-sky-400 mt-0.5" />
                              <div>
                                <span className="text-slate-300 font-medium">Project Destination</span>
                                <span className="text-[10px] text-slate-500 font-mono block">
                                  Table: projects (Proposed Status: &apos;{statusLabel}&apos; {isAssumed ? "[Neutral Assumption]" : "[Verified]"})
                                </span>
                              </div>
                            </div>
                            <div className="text-right">
                              <span className="text-xs font-semibold text-white">
                                {proposedSummary?.newProjects || 0} New, {proposedSummary?.reusedProjects || 0} Reused
                              </span>
                              <span className="text-[10px] text-slate-400 block truncate max-w-[240px]">
                                {distinctProjects.join(", ")}
                              </span>
                            </div>
                          </div>
                        );
                      })()}

                      {/* Quotations Destination */}
                      {docTypesPresent.includes("quotation") && (() => {
                        const quotes = approvedDocs.filter(d => d.documentType === "quotation");
                        const qItemsCount = quotes.reduce((acc, d) => acc + (d.items?.length || 0), 0);
                        const qNumbers = quotes.map(d => String(d.fields?.document_number?.value || "")).filter(Boolean);
                        const distinctStatuses = Array.from(new Set(quotes.map(d => `${d.statusResolution?.proposedStatus || 'draft'}${d.statusResolution?.isAssumed ? ' [Neutral Assumption]' : ' [Verified]'}`)));
                        return (
                          <div className="flex items-start justify-between p-2 rounded-lg bg-slate-950/60 border border-slate-800/80">
                            <div className="flex items-center gap-2">
                              <FileText size={14} className="text-amber-400 mt-0.5" />
                              <div>
                                <span className="text-slate-300 font-medium">Quotation Destination</span>
                                <span className="text-[10px] text-slate-500 font-mono block">
                                  Tables: quotations &amp; quotation_items (Proposed Status: {distinctStatuses.join(", ")})
                                </span>
                              </div>
                            </div>
                            <div className="text-right">
                              <span className="text-xs font-semibold text-white">
                                {quotes.length} Quotation{quotes.length > 1 ? "s" : ""} ({qItemsCount} Line Items)
                              </span>
                              {qNumbers.length > 0 && (
                                <span className="text-[10px] font-mono text-amber-400 block truncate max-w-[240px]">
                                  {qNumbers.map(n => `#${n}`).join(", ")}
                                </span>
                              )}
                            </div>
                          </div>
                        );
                      })()}

                      {/* Tax Invoices Destination */}
                      {docTypesPresent.includes("tax_invoice") && (() => {
                        const invs = approvedDocs.filter(d => d.documentType === "tax_invoice");
                        const invItemsCount = invs.reduce((acc, d) => acc + (d.items?.length || 0), 0);
                        const invNumbers = invs.map(d => String(d.fields?.document_number?.value || "")).filter(Boolean);
                        const distinctStatuses = Array.from(new Set(invs.map(d => `${d.statusResolution?.proposedStatus || 'draft'}${d.statusResolution?.isAssumed ? ' [Neutral Assumption]' : ' [Verified]'}`)));
                        return (
                          <div className="flex items-start justify-between p-2 rounded-lg bg-slate-950/60 border border-slate-800/80">
                            <div className="flex items-center gap-2">
                              <FileText size={14} className="text-indigo-400 mt-0.5" />
                              <div>
                                <span className="text-slate-300 font-medium">Tax Invoice Destination</span>
                                <span className="text-[10px] text-slate-500 font-mono block">
                                  Tables: tax_invoices &amp; tax_invoice_items (Proposed Status: {distinctStatuses.join(", ")})
                                </span>
                                <span className="text-[10px] text-amber-400/90 font-mono block mt-0.5">
                                  ⚠️ Integrity Guardrail: No automated payments created. Unverified invoices remain unpaid Drafts.
                                </span>
                              </div>
                            </div>
                            <div className="text-right">
                              <span className="text-xs font-semibold text-white">
                                {invs.length} Tax Invoice{invs.length > 1 ? "s" : ""} ({invItemsCount} Line Items)
                              </span>
                              {invNumbers.length > 0 && (
                                <span className="text-[10px] font-mono text-emerald-400 block truncate max-w-[240px]">
                                  {invNumbers.map(n => `#${n}`).join(", ")}
                                </span>
                              )}
                            </div>
                          </div>
                        );
                      })()}

                      {/* Delivery Notes Destination */}
                      {docTypesPresent.includes("delivery_note") && (() => {
                        const dns = approvedDocs.filter(d => d.documentType === "delivery_note");
                        const dnItemsCount = dns.reduce((acc, d) => acc + (d.items?.length || 0), 0);
                        const dnNumbers = dns.map(d => String(d.fields?.document_number?.value || "")).filter(Boolean);
                        const distinctStatuses = Array.from(new Set(dns.map(d => `${d.statusResolution?.proposedStatus || 'draft'}${d.statusResolution?.isAssumed ? ' [Neutral Assumption]' : ' [Verified]'}`)));
                        return (
                          <div className="flex items-start justify-between p-2 rounded-lg bg-slate-950/60 border border-slate-800/80">
                            <div className="flex items-center gap-2">
                              <Truck size={14} className="text-teal-400 mt-0.5" />
                              <div>
                                <span className="text-slate-300 font-medium">Delivery Note Destination</span>
                                <span className="text-[10px] text-slate-500 font-mono block">
                                  Tables: delivery_notes &amp; delivery_note_items (Proposed Status: {distinctStatuses.join(", ")})
                                </span>
                              </div>
                            </div>
                            <div className="text-right">
                              <span className="text-xs font-semibold text-white">
                                {dns.length} Delivery Note{dns.length > 1 ? "s" : ""} ({dnItemsCount} Items)
                              </span>
                              {dnNumbers.length > 0 && (
                                <span className="text-[10px] font-mono text-teal-400 block truncate max-w-[240px]">
                                  {dnNumbers.map(n => `#${n}`).join(", ")}
                                </span>
                              )}
                            </div>
                          </div>
                        );
                      })()}

                      {/* Purchase Orders Destination */}
                      {docTypesPresent.includes("purchase_order") && (() => {
                        const pos = approvedDocs.filter(d => d.documentType === "purchase_order");
                        const poItemsCount = pos.reduce((acc, d) => acc + (d.items?.length || 0), 0);
                        const poNumbers = pos.map(d => String(d.fields?.document_number?.value || "")).filter(Boolean);
                        const distinctStatuses = Array.from(new Set(pos.map(d => `${d.statusResolution?.proposedStatus || 'draft'}${d.statusResolution?.isAssumed ? ' [Neutral Assumption]' : ' [Verified]'}`)));
                        return (
                          <div className="flex items-start justify-between p-2 rounded-lg bg-slate-950/60 border border-slate-800/80">
                            <div className="flex items-center gap-2">
                              <ShoppingCart size={14} className="text-purple-400 mt-0.5" />
                              <div>
                                <span className="text-slate-300 font-medium">Purchase Order Destination</span>
                                <span className="text-[10px] text-slate-500 font-mono block">
                                  Tables: purchase_orders &amp; purchase_order_items (Proposed Status: {distinctStatuses.join(", ")})
                                </span>
                              </div>
                            </div>
                            <div className="text-right">
                              <span className="text-xs font-semibold text-white">
                                {pos.length} Purchase Order{pos.length > 1 ? "s" : ""} ({poItemsCount} Items)
                              </span>
                              {poNumbers.length > 0 && (
                                <span className="text-[10px] font-mono text-purple-400 block truncate max-w-[240px]">
                                  {poNumbers.map(n => `#${n}`).join(", ")}
                                </span>
                              )}
                            </div>
                          </div>
                        );
                      })()}

                      {/* Expenses Destination */}
                      {docTypesPresent.includes("expense") && (() => {
                        const exps = approvedDocs.filter(d => d.documentType === "expense");
                        return (
                          <div className="flex items-start justify-between p-2 rounded-lg bg-slate-950/60 border border-slate-800/80">
                            <div className="flex items-center gap-2">
                              <DollarSign size={14} className="text-rose-400 mt-0.5" />
                              <div>
                                <span className="text-slate-300 font-medium">Expense Destination</span>
                                <span className="text-[10px] text-slate-500 font-mono block">
                                  Table: expenses (status: &apos;Paid&apos;)
                                </span>
                              </div>
                            </div>
                            <div className="text-right">
                              <span className="text-xs font-semibold text-white">
                                {exps.length} Expense{exps.length > 1 ? "s" : ""}
                              </span>
                            </div>
                          </div>
                        );
                      })()}

                      {/* Measurements Destination */}
                      {docTypesPresent.includes("measurement_project") && (() => {
                        const meas = approvedDocs.filter(d => d.documentType === "measurement_project");
                        return (
                          <div className="flex items-start justify-between p-2 rounded-lg bg-slate-950/60 border border-slate-800/80">
                            <div className="flex items-center gap-2">
                              <Ruler size={14} className="text-cyan-400 mt-0.5" />
                              <div>
                                <span className="text-slate-300 font-medium">PVC Measurement Takeoff</span>
                                <span className="text-[10px] text-slate-500 font-mono block">
                                  Tables: measurement_projects & measurement_items
                                </span>
                              </div>
                            </div>
                            <div className="text-right">
                              <span className="text-xs font-semibold text-white">
                                {meas.length} Measurement Sheet{meas.length > 1 ? "s" : ""}
                              </span>
                            </div>
                          </div>
                        );
                      })()}
                    </div>
                  </div>

                  {/* SECTION 3: VALIDATION & INTEGRITY STATUS */}
                  <div className="p-3 rounded-xl bg-slate-900/60 border border-slate-800 text-xs space-y-1.5">
                    <span className="text-[10px] font-bold uppercase text-slate-400 tracking-wider block">
                      Validation & Relational Integrity Status
                    </span>

                    {/* Dynamic Foreign Key Hierarchies */}
                    {docTypesPresent.includes("quotation") && (
                      <div className="flex items-center gap-2 text-emerald-400 text-[11px]">
                        <ShieldCheck size={14} className="shrink-0" />
                        <span>Foreign-Key Hierarchy Order: Customer → Project → Quotation → Quotation Items</span>
                      </div>
                    )}
                    {docTypesPresent.includes("tax_invoice") && (
                      <div className="flex items-center gap-2 text-emerald-400 text-[11px]">
                        <ShieldCheck size={14} className="shrink-0" />
                        <span>Foreign-Key Hierarchy Order: Customer → Project → Tax Invoice → Invoice Items</span>
                      </div>
                    )}
                    {docTypesPresent.includes("delivery_note") && (
                      <div className="flex items-center gap-2 text-emerald-400 text-[11px]">
                        <ShieldCheck size={14} className="shrink-0" />
                        <span>Foreign-Key Hierarchy Order: Customer → Project → Delivery Note → Items</span>
                      </div>
                    )}
                    {docTypesPresent.includes("purchase_order") && (
                      <div className="flex items-center gap-2 text-emerald-400 text-[11px]">
                        <ShieldCheck size={14} className="shrink-0" />
                        <span>Foreign-Key Hierarchy Order: Supplier → Project → Purchase Order → Order Items</span>
                      </div>
                    )}

                    <div className="flex items-center gap-2 text-emerald-400 text-[11px]">
                      <CheckCircle2 size={14} className="shrink-0" />
                      <span>
                        Extracted Values Verified: {docTypesPresent.includes("quotation") ? "Quotation Date" : "Document Date"}, Line Rates, Quantities, 5% UAE VAT & Totals
                      </span>
                    </div>

                    {company?.id ? (
                      <div className="flex items-center gap-2 text-emerald-400 text-[11px]">
                        <CheckCircle2 size={14} className="shrink-0" />
                        <span>Tenant Isolation: Scoped to {company.name}</span>
                      </div>
                    ) : (
                      <div className="flex items-center gap-2 text-rose-400 text-[11px]">
                        <AlertTriangle size={14} className="shrink-0" />
                        <span>Critical Error: Company profile unresolved. Database execution blocked.</span>
                      </div>
                    )}
                  </div>

                  {/* Critical Validation Alert if blocked */}
                  {hasCriticalErrors && (
                    <div className="p-3 rounded-xl bg-rose-950/40 border border-rose-800/80 text-rose-300 text-xs space-y-1.5">
                      <div className="flex items-center gap-2 font-semibold text-rose-400">
                        <AlertTriangle size={15} className="shrink-0" />
                        <span>Database Execution Blocked ({criticalErrors.length} Critical Issue{criticalErrors.length > 1 ? "s" : ""})</span>
                      </div>
                      <p className="text-[11px] text-rose-200/80">
                        The following validation errors must be resolved before executing import into Dubai ERP:
                      </p>
                      <ul className="list-disc list-inside text-[11px] text-rose-300/90 space-y-0.5 max-h-24 overflow-y-auto">
                        {criticalErrors.map((err, idx) => (
                          <li key={idx}>{err}</li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {/* Commit feedback result */}
                  {commitResult && (
                    <div
                      className={`p-3 rounded-lg text-xs flex items-center gap-2 ${
                        commitResult.success
                          ? "bg-emerald-500/10 border border-emerald-500/30 text-emerald-300"
                          : "bg-rose-500/10 border border-rose-500/30 text-rose-300"
                      }`}
                    >
                      {commitResult.success ? <CheckCircle2 size={16} /> : <AlertTriangle size={16} />}
                      <span>{commitResult.message}</span>
                    </div>
                  )}

                  {/* Action Buttons */}
                  <div className="flex items-center justify-between pt-2 border-t border-slate-800">
                    <button
                      onClick={() => setShowConfirmModal(false)}
                      className="px-4 py-2 rounded-lg bg-slate-800 text-slate-300 text-xs font-medium hover:bg-slate-700 transition"
                    >
                      Return to Preview
                    </button>

                    <div className="flex items-center gap-2">
                      {hasCriticalErrors && (
                        <span className="text-[11px] text-rose-400 font-medium">
                          Resolve critical errors to enable import
                        </span>
                      )}
                      <button
                        onClick={handleCommitImport}
                        disabled={hasCriticalErrors || committing}
                        className="px-5 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold shadow-md transition disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-2"
                      >
                        {committing ? (
                          <>
                            <RefreshCw size={14} className="animate-spin" />
                            <span>Saving to Database...</span>
                          </>
                        ) : (
                          <>
                            <Check size={14} />
                            <span>Execute Import</span>
                          </>
                        )}
                      </button>
                    </div>
                  </div>
                </>
              );
            })()}
          </div>
        </div>
      )}
    </div>
  );
}

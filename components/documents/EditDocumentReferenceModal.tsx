"use client";

import React, { useState, useEffect } from "react";
import {
  X,
  ShieldAlert,
  CheckCircle2,
  AlertTriangle,
  Loader2,
  FileEdit,
} from "lucide-react";
import {
  DocumentTypeId,
  DOCUMENT_TYPE_OPTIONS,
} from "@/lib/documentDesigner";
import {
  checkDocumentReferenceAvailable,
  renameDocumentReference,
} from "@/lib/documentNumbering";

interface EditDocumentReferenceModalProps {
  isOpen: boolean;
  onClose: () => void;
  companyId: string;
  docType: DocumentTypeId;
  documentId: string;
  currentReferenceNumber: string;
  onSuccess: (newReferenceNumber: string) => void;
}

function EditDocumentReferenceDialog({
  onClose,
  companyId,
  docType,
  documentId,
  currentReferenceNumber,
  onSuccess,
}: Omit<EditDocumentReferenceModalProps, "isOpen">) {
  const [newNumber, setNewNumber] = useState(currentReferenceNumber);
  const [confirmed, setConfirmed] = useState(false);
  const [checking, setChecking] = useState(false);
  const [availability, setAvailability] = useState<{
    available: boolean;
    conflictReason?: string;
  } | null>(null);
  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const docLabel =
    DOCUMENT_TYPE_OPTIONS.find((d) => d.id === docType)?.label || "Document";

  const isChanged = newNumber.trim() !== currentReferenceNumber && Boolean(newNumber.trim());

  // Debounced availability check
  useEffect(() => {
    const trimmed = newNumber.trim();
    if (!trimmed || trimmed === currentReferenceNumber) {
      return;
    }

    const timer = setTimeout(async () => {
      setChecking(true);
      try {
        const res = await checkDocumentReferenceAvailable(
          companyId,
          docType,
          trimmed,
          documentId
        );
        setAvailability(res);
      } catch {
        setAvailability({ available: true });
      } finally {
        setChecking(false);
      }
    }, 350);

    return () => clearTimeout(timer);
  }, [newNumber, companyId, docType, documentId, currentReferenceNumber]);

  const effectiveAvailability = isChanged ? availability : null;

  const canSubmit =
    isChanged &&
    confirmed &&
    effectiveAvailability?.available === true &&
    !checking &&
    !saving;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;

    setSaving(true);
    setErrorMsg(null);
    try {
      const res = await renameDocumentReference(
        companyId,
        docType,
        documentId,
        newNumber.trim()
      );
      if (!res.success) {
        setErrorMsg(res.error || "Failed to update reference number.");
      } else {
        onSuccess(newNumber.trim());
        onClose();
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "An unexpected error occurred.";
      setErrorMsg(message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-in fade-in duration-150">
      <div className="w-full max-w-md rounded-2xl bg-slate-900 border border-slate-800 text-white shadow-2xl overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-800 px-5 py-4">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-lg bg-amber-500/10 text-amber-400 border border-amber-500/20">
              <FileEdit size={18} />
            </div>
            <div>
              <h2 className="text-sm font-bold text-slate-100">
                Edit {docLabel} Reference Number
              </h2>
              <p className="text-[11px] text-slate-400">
                Controlled, safe manual renumbering with collision protection
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1 text-slate-400 hover:bg-slate-800 hover:text-white transition"
          >
            <X size={18} />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          {/* Warning / Audit Banner */}
          <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-200 flex gap-2.5">
            <ShieldAlert size={18} className="text-amber-400 shrink-0 mt-0.5" />
            <div className="space-y-1">
              <div className="font-bold text-amber-300">Audit &amp; Traceability Notice</div>
              <p className="text-[11px] leading-relaxed text-amber-200/90">
                Changing a saved document number updates its visible reference code.
                Database internal IDs and related line items remain untouched.
              </p>
            </div>
          </div>

          {/* Current vs New Number */}
          <div className="space-y-3">
            <div>
              <label className="text-[11px] font-bold text-slate-400 uppercase tracking-wide block mb-1">
                Current Reference Number
              </label>
              <div className="w-full rounded-lg bg-slate-800/80 border border-slate-750 px-3.5 py-2 text-xs font-mono font-bold text-slate-300">
                {currentReferenceNumber}
              </div>
            </div>

            <div>
              <label className="text-[11px] font-bold text-slate-300 uppercase tracking-wide block mb-1">
                New Reference Number *
              </label>
              <input
                type="text"
                value={newNumber}
                onChange={(e) => {
                  setNewNumber(e.target.value);
                  setErrorMsg(null);
                }}
                placeholder="e.g. QTN-0005, TAX-2026-0042"
                className="w-full rounded-lg bg-slate-950 border border-slate-700 px-3.5 py-2 text-xs font-mono font-bold text-emerald-400 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                autoFocus
              />
            </div>
          </div>

          {/* Availability Status Badge */}
          {isChanged && (
            <div className="text-xs">
              {checking ? (
                <div className="flex items-center gap-2 text-slate-400 py-1 font-mono text-[11px]">
                  <Loader2 size={13} className="animate-spin text-emerald-400" />
                  <span>Checking database uniqueness...</span>
                </div>
              ) : effectiveAvailability?.available === true ? (
                <div className="flex items-center gap-2 text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 rounded-lg p-2 font-mono text-[11px]">
                  <CheckCircle2 size={14} className="shrink-0" />
                  <span>Reference number is available and unique</span>
                </div>
              ) : effectiveAvailability?.available === false ? (
                <div className="flex items-center gap-2 text-rose-400 bg-rose-500/10 border border-rose-500/20 rounded-lg p-2 font-mono text-[11px]">
                  <AlertTriangle size={14} className="shrink-0" />
                  <span>{effectiveAvailability.conflictReason || "Duplicate detected: already in use!"}</span>
                </div>
              ) : null}
            </div>
          )}

          {errorMsg && (
            <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-2.5 text-xs text-red-300">
              {errorMsg}
            </div>
          )}

          {/* Explicit Confirmation Checkbox */}
          <label className="flex items-start gap-2.5 p-3 rounded-lg border border-slate-800 bg-slate-950/60 cursor-pointer hover:bg-slate-950 transition select-none">
            <input
              type="checkbox"
              checked={confirmed}
              onChange={(e) => setConfirmed(e.target.checked)}
              className="mt-0.5 rounded border-slate-700 text-emerald-500 focus:ring-emerald-500 cursor-pointer"
            />
            <span className="text-[11px] text-slate-300 leading-snug">
              I confirm that I want to change this document&apos;s reference number and understand that existing printouts and PDFs will reflect the updated reference.
            </span>
          </label>

          {/* Footer Actions */}
          <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-800">
            <button
              type="button"
              onClick={onClose}
              disabled={saving}
              className="rounded-lg px-3.5 py-2 text-xs font-semibold text-slate-400 hover:text-white hover:bg-slate-800 transition disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!canSubmit}
              className="flex items-center gap-1.5 rounded-lg bg-emerald-600 px-4 py-2 text-xs font-bold text-white hover:bg-emerald-500 transition shadow disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {saving && <Loader2 size={13} className="animate-spin" />}
              <span>Confirm &amp; Update Reference</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default function EditDocumentReferenceModal(props: EditDocumentReferenceModalProps) {
  if (!props.isOpen) return null;
  return (
    <EditDocumentReferenceDialog
      {...props}
      key={`${props.documentId}-${props.currentReferenceNumber}`}
    />
  );
}

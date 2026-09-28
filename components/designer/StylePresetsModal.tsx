"use client";

import { useState } from "react";
import { Copy, Download, Pencil, Save, Star, Trash2, X } from "lucide-react";
import { DOCUMENT_TYPE_OPTIONS, DocumentTypeId } from "@/lib/documentDesigner";
import { DocumentStylePreset } from "@/lib/documentStylePresetModel";

interface StylePresetsModalProps {
  mode: "save" | "manage";
  isOpen: boolean;
  documentType: DocumentTypeId;
  presets: DocumentStylePreset[];
  activePresetId: string | null;
  initialName?: string;
  busy: boolean;
  onClose: () => void;
  onSave: (name: string) => void;
  onRename: (preset: DocumentStylePreset, name: string) => void;
  onDuplicate: (preset: DocumentStylePreset, name: string) => void;
  onDelete: (preset: DocumentStylePreset) => void;
  onSetDefault: (preset: DocumentStylePreset) => void;
  onEdit: (preset: DocumentStylePreset) => void;
}

export default function StylePresetsModal({
  mode,
  isOpen,
  documentType,
  presets,
  activePresetId,
  initialName,
  busy,
  onClose,
  onSave,
  onRename,
  onDuplicate,
  onDelete,
  onSetDefault,
  onEdit,
}: StylePresetsModalProps) {
  const activePreset = presets.find((preset) => preset.id === activePresetId);
  const [name, setName] = useState(activePreset?.template_name || initialName || "");
  const [renameId, setRenameId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [duplicateId, setDuplicateId] = useState<string | null>(null);
  const [duplicateValue, setDuplicateValue] = useState("");

  if (!isOpen) return null;

  const isSaveMode = mode === "save";
  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/70 p-3 backdrop-blur-sm" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <section role="dialog" aria-modal="true" aria-labelledby="style-presets-title" className="flex max-h-[90dvh] w-full max-w-2xl flex-col overflow-hidden rounded-xl border border-slate-700 bg-slate-900 text-slate-100 shadow-2xl">
        <header className="flex items-center justify-between border-b border-slate-800 px-4 py-3">
          <div>
            <h2 id="style-presets-title" className="text-sm font-bold text-white">{isSaveMode ? "Save My Style" : "Manage Saved Styles"}</h2>
            <p className="mt-0.5 text-xs text-slate-400">{documentType.replaceAll("_", " ")} · company-owned style preset</p>
          </div>
          <button type="button" onClick={onClose} className="flex h-10 w-10 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-800 hover:text-white" aria-label="Close saved styles">
            <X size={18} />
          </button>
        </header>

        {isSaveMode ? (
          <form className="space-y-4 p-4" onSubmit={(event) => { event.preventDefault(); onSave(name); }}>
            <label className="block space-y-1.5 text-xs font-semibold text-slate-300">
              Style name
              <input autoFocus maxLength={80} value={name} onChange={(event) => setName(event.target.value)} className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2.5 text-sm text-white outline-none focus:border-amber-400" placeholder="e.g. Modern bilingual quotation" />
            </label>
            <p className="text-xs leading-5 text-slate-400">Saves the complete current layout, including geometry, branding, table settings, text formatting and embedded images. Existing document data is not included.</p>
            <div className="flex justify-end gap-2 border-t border-slate-800 pt-3">
              <button type="button" onClick={onClose} className="rounded-lg border border-slate-700 px-3 py-2 text-xs font-semibold text-slate-300 hover:bg-slate-800">Cancel</button>
              <button type="submit" disabled={busy || !name.trim()} className="flex items-center gap-1.5 rounded-lg bg-amber-500 px-3 py-2 text-xs font-bold text-slate-950 disabled:opacity-50"><Save size={14} />{activePreset ? "Update Style" : "Save Style"}</button>
            </div>
          </form>
        ) : (
          <>
            <div className="designer-scrollbar min-h-0 flex-1 overflow-y-auto overscroll-contain p-3">
              {presets.length === 0 ? (
                <p className="p-8 text-center text-sm text-slate-400">No saved styles for this company yet.</p>
              ) : (
                <ul className="space-y-2">
                  {presets.map((preset) => (
                    <li key={preset.id} className="rounded-lg border border-slate-800 bg-slate-950/60 p-3">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="min-w-0">
                          {renameId === preset.id ? (
                            <form className="flex gap-1.5" onSubmit={(event) => { event.preventDefault(); onRename(preset, renameValue); setRenameId(null); }}>
                              <input autoFocus maxLength={80} value={renameValue} onChange={(event) => setRenameValue(event.target.value)} className="min-w-0 rounded border border-slate-700 bg-slate-900 px-2 py-1 text-sm text-white" aria-label="New style name" />
                              <button type="submit" disabled={busy || !renameValue.trim()} className="rounded bg-emerald-600 px-2 py-1 text-xs font-bold text-white disabled:opacity-50">Save</button>
                            </form>
                          ) : (
                            <div className="flex items-center gap-2">
                              <span className="truncate text-sm font-semibold text-white">{preset.template_name}</span>
                              <span className="rounded bg-slate-800 px-1.5 py-0.5 text-[10px] font-semibold text-slate-300">
                                {DOCUMENT_TYPE_OPTIONS.find((option) => option.id === preset.document_type)?.label || preset.document_type.replaceAll("_", " ")}
                              </span>
                              {preset.is_default && <span className="inline-flex items-center gap-1 rounded bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-bold text-amber-300"><Star size={11} />Legacy default</span>}
                              {preset.id === activePresetId && <span className="rounded bg-sky-500/15 px-1.5 py-0.5 text-[10px] font-semibold text-sky-300">Editing</span>}
                            </div>
                          )}
                          <p className="mt-1 text-[11px] text-slate-500">Updated {new Date(preset.updated_at).toLocaleDateString()}</p>
                        </div>
                        <div className="flex flex-wrap items-center gap-1">
                          <button type="button" onClick={() => onEdit(preset)} className="flex h-9 items-center gap-1 rounded-md px-2 text-xs font-semibold text-sky-300 hover:bg-sky-500/10" title="Load this style into the canvas"><Pencil size={13} />Edit</button>
                          <button type="button" onClick={() => { setRenameId(preset.id); setRenameValue(preset.template_name); }} className="flex h-9 w-9 items-center justify-center rounded-md text-slate-300 hover:bg-slate-800" title="Rename style" aria-label={`Rename ${preset.template_name}`}><Pencil size={14} /></button>
                          <button type="button" onClick={() => { setDuplicateId(duplicateId === preset.id ? null : preset.id); setDuplicateValue(`${preset.template_name} Copy`); }} className="flex h-9 w-9 items-center justify-center rounded-md text-slate-300 hover:bg-slate-800" title="Duplicate style" aria-label={`Duplicate ${preset.template_name}`}><Copy size={14} /></button>
                          <button type="button" onClick={() => onSetDefault(preset)} disabled={busy} className="flex h-9 w-9 items-center justify-center rounded-md text-amber-300 hover:bg-amber-500/10 disabled:opacity-40" title="Use this saved design on all devices" aria-label={`Set ${preset.template_name} as cloud design`}><Star size={14} /></button>
                          <button type="button" onClick={() => onDelete(preset)} disabled={busy || preset.is_default} className="flex h-9 w-9 items-center justify-center rounded-md text-rose-300 hover:bg-rose-500/10 disabled:opacity-40" title={preset.is_default ? "Set another default before deleting" : "Delete style"} aria-label={`Delete ${preset.template_name}`}><Trash2 size={14} /></button>
                        </div>
                      </div>
                      {duplicateId === preset.id && (
                        <form className="mt-3 flex gap-2 border-t border-slate-800 pt-3" onSubmit={(event) => { event.preventDefault(); onDuplicate(preset, duplicateValue); setDuplicateId(null); }}>
                          <input autoFocus maxLength={80} value={duplicateValue} onChange={(event) => setDuplicateValue(event.target.value)} className="min-w-0 flex-1 rounded border border-slate-700 bg-slate-900 px-2.5 py-2 text-xs text-white" aria-label="Duplicate style name" />
                          <button type="submit" disabled={busy || !duplicateValue.trim()} className="flex items-center gap-1 rounded bg-emerald-600 px-2.5 py-2 text-xs font-bold text-white disabled:opacity-50"><Download size={13} />Duplicate</button>
                        </form>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <footer className="flex justify-end border-t border-slate-800 p-3">
              <button type="button" onClick={onClose} className="rounded-lg border border-slate-700 px-3 py-2 text-xs font-semibold text-slate-300 hover:bg-slate-800">Done</button>
            </footer>
          </>
        )}
      </section>
    </div>
  );
}

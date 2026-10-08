"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";
import {
  ArrowLeft,
  Building2,
  Save,
  Loader2,
  Upload,
  X,
  RotateCcw,
  Palette,
  Minus,
  Plus,
  FileText,
  Sliders,
  Hash,
  ExternalLink,
} from "lucide-react";
import { DEFAULT_BRAND_COLORS } from "@/lib/brandConfig";
import { getCurrentCompany, clearCompanyCache } from "@/lib/helpers";
import {
  DEFAULT_NUMBERING_CONFIGS,
  formatDocNumber,
  getCachedDocNumberingConfig,
} from "@/lib/documentNumbering";
import { type DocumentTypeId } from "@/lib/documentDesigner";

type Company = {
  id: string;
  name: string | null;
  arabic_name?: string | null;
  legal_name: string | null;
  trade_license_no: string | null;
  trn: string | null;
  business_type: string | null;
  industry: string | null;
  email: string | null;
  phone: string | null;
  mobile?: string | null;
  website: string | null;
  logo_url?: string | null;
  stamp_url?: string | null;
  signature_url?: string | null;
  background_url?: string | null;
  building_image_url?: string | null;
  footer_image_url?: string | null;
  address: string | null;
  city: string | null;
  emirate: string | null;
  country: string | null;
  po_box: string | null;
  currency: string | null;
  vat_registered: boolean;
  default_vat_rate: number | null;
  bank_name: string | null;
  bank_account_name?: string | null;
  iban: string | null;
  swift_bic: string | null;
  payment_terms: string | null;
  terms_conditions: string | null;
  // Brand colors
  brand_primary?: string | null;
  brand_accent?: string | null;
  brand_text?: string | null;
  brand_muted?: string | null;
  brand_border?: string | null;
  brand_table_header?: string | null;
  brand_total_highlight?: string | null;
  logo_size?: number | null;
  arabic_name_size?: number | null;
};

const emptyForm = {
  name: "",
  arabic_name: "",
  legal_name: "",
  trade_license_no: "",
  trn: "",
  business_type: "",
  industry: "",
  email: "",
  phone: "",
  mobile: "",
  website: "",
  logo_url: "",
  stamp_url: "",
  signature_url: "",
  background_url: "",
  building_image_url: "",
  footer_image_url: "",
  logo_size: 200,
  arabic_name_size: 30,
  address: "",
  city: "",
  emirate: "",
  country: "United Arab Emirates",
  po_box: "",
  currency: "AED",
  vat_registered: true,
  default_vat_rate: "5",
  bank_name: "",
  bank_account_name: "",
  iban: "",
  swift_bic: "",
  payment_terms: "",
  terms_conditions: "",
  // Brand colors — default to professional Navy+Gold palette
  brand_primary: DEFAULT_BRAND_COLORS.primary,
  brand_accent: DEFAULT_BRAND_COLORS.accent,
  brand_text: DEFAULT_BRAND_COLORS.text,
  brand_muted: DEFAULT_BRAND_COLORS.muted,
  brand_border: DEFAULT_BRAND_COLORS.border,
  brand_table_header: DEFAULT_BRAND_COLORS.tableHeader,
  brand_total_highlight: DEFAULT_BRAND_COLORS.totalHighlight,
};

// ── Image Upload Helper ───────────────────────────────────────────────────────
type ImageKey = "logo_url" | "stamp_url" | "signature_url" | "background_url" | "building_image_url" | "footer_image_url";

const IMAGE_LABELS: Record<ImageKey, string> = {
  logo_url: "Company Logo",
  stamp_url: "Company Stamp",
  signature_url: "Authorized Signature",
  background_url: "Background / Watermark",
  building_image_url: "Building / Company Image",
  footer_image_url: "Footer Image",
};

const ALLOWED_TYPES = ["image/png", "image/jpg", "image/jpeg"];

// ── Color Control Definition ──────────────────────────────────────────────────
type ColorKey =
  | "brand_primary"
  | "brand_accent"
  | "brand_text"
  | "brand_muted"
  | "brand_border"
  | "brand_table_header"
  | "brand_total_highlight";

const COLOR_CONTROLS: { key: ColorKey; label: string; description: string }[] = [
  { key: "brand_primary", label: "Primary Color", description: "Header banners, borders, document titles" },
  { key: "brand_accent", label: "Gold / Accent Color", description: "Company name, amount highlights, accents" },
  { key: "brand_text", label: "Body Text Color", description: "Main content text color" },
  { key: "brand_muted", label: "Muted Text Color", description: "Labels, subtitles, secondary text" },
  { key: "brand_border", label: "Border Color", description: "Table borders, section dividers" },
  { key: "brand_table_header", label: "Table Header Color", description: "Line item table header background" },
  { key: "brand_total_highlight", label: "Total Highlight Color", description: "Totals row / summary background" },
];

const DEFAULT_COLORS: Record<ColorKey, string> = {
  brand_primary: DEFAULT_BRAND_COLORS.primary,
  brand_accent: DEFAULT_BRAND_COLORS.accent,
  brand_text: DEFAULT_BRAND_COLORS.text,
  brand_muted: DEFAULT_BRAND_COLORS.muted,
  brand_border: DEFAULT_BRAND_COLORS.border,
  brand_table_header: DEFAULT_BRAND_COLORS.tableHeader,
  brand_total_highlight: DEFAULT_BRAND_COLORS.totalHighlight,
};

// ── Main Component ────────────────────────────────────────────────────────────
export default function SettingsPage() {
  const [companyId, setCompanyId] = useState("");
  const [form, setForm] = useState(emptyForm);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  // Per-image upload state
  const [uploadingKey, setUploadingKey] = useState<ImageKey | null>(null);
  const [uploadError, setUploadError] = useState("");

  // File input refs for each image type
  const fileRefs: Record<ImageKey, React.RefObject<HTMLInputElement | null>> = {
    logo_url: useRef<HTMLInputElement>(null),
    stamp_url: useRef<HTMLInputElement>(null),
    signature_url: useRef<HTMLInputElement>(null),
    background_url: useRef<HTMLInputElement>(null),
    building_image_url: useRef<HTMLInputElement>(null),
    footer_image_url: useRef<HTMLInputElement>(null),
  };

  async function loadCompany() {
    const data = await getCurrentCompany();

    if (!data) {
      setError("No company is linked to your account.");
      setLoading(false);
      return;
    }

    const company = data as Company;
    setCompanyId(company.id);

    setForm({
      name: company.name || "",
      arabic_name: company.arabic_name || "",
      legal_name: company.legal_name || "",
      trade_license_no: company.trade_license_no || "",
      trn: company.trn || "",
      business_type: company.business_type || "",
      industry: company.industry || "",
      email: company.email || "",
      phone: company.phone || "",
      mobile: company.mobile || "",
      website: company.website || "",
      logo_url: company.logo_url || "",
      stamp_url: company.stamp_url || "",
      signature_url: company.signature_url || "",
      background_url: company.background_url || "",
      building_image_url: company.building_image_url || "",
      footer_image_url: company.footer_image_url || "",
      address: company.address || "",
      city: company.city || "",
      emirate: company.emirate || "",
      country: company.country || "United Arab Emirates",
      po_box: company.po_box || "",
      currency: company.currency || "AED",
      vat_registered: company.vat_registered ?? true,
      default_vat_rate: String(company.default_vat_rate ?? 5),
      bank_name: company.bank_name || "",
      bank_account_name: company.bank_account_name || "",
      iban: company.iban || "",
      swift_bic: company.swift_bic || "",
      payment_terms: company.payment_terms || "",
      terms_conditions: company.terms_conditions || "",
      brand_primary: company.brand_primary || DEFAULT_COLORS.brand_primary,
      brand_accent: company.brand_accent || DEFAULT_COLORS.brand_accent,
      brand_text: company.brand_text || DEFAULT_COLORS.brand_text,
      brand_muted: company.brand_muted || DEFAULT_COLORS.brand_muted,
      brand_border: company.brand_border || DEFAULT_COLORS.brand_border,
      brand_table_header: company.brand_table_header || DEFAULT_COLORS.brand_table_header,
      brand_total_highlight: company.brand_total_highlight || DEFAULT_COLORS.brand_total_highlight,
      logo_size: company.logo_size ? Number(company.logo_size) : 200,
      arabic_name_size: company.arabic_name_size ? Number(company.arabic_name_size) : 30,
    });

    setLoading(false);
  }

  useEffect(() => {
    void Promise.resolve().then(loadCompany);
  }, []);

  function updateField(
    field: keyof typeof emptyForm,
    value: string | boolean | number
  ) {
    setForm((current) => ({
      ...current,
      [field]: value,
    }));
  }

  function resetColors() {
    setForm((current) => ({
      ...current,
      ...DEFAULT_COLORS,
    }));
  }

  // ── Image Upload ────────────────────────────────────────────────────────────
  async function handleImageUpload(key: ImageKey, file: File) {
    if (!ALLOWED_TYPES.includes(file.type)) {
      setUploadError(`Only PNG, JPG, JPEG files are allowed.`);
      return;
    }

    setUploadingKey(key);
    setUploadError("");

    try {
      // Try Supabase storage first
      const ext = file.name.split(".").pop() || "png";
      const storagePath = `company-assets/${key.replace("_url", "")}-${Date.now()}.${ext}`;

      const { error: storageErr } = await supabase.storage
        .from("company-assets")
        .upload(storagePath, file, { upsert: true, contentType: file.type });

      if (!storageErr) {
        const { data: urlData } = supabase.storage
          .from("company-assets")
          .getPublicUrl(storagePath);

        const publicUrl = urlData?.publicUrl || "";
        updateField(key, publicUrl);
      } else {
        // Storage bucket may not exist — fall back to base64 data URL for preview
        // (user can also paste a URL manually)
        const reader = new FileReader();
        reader.onload = (e) => {
          const dataUrl = e.target?.result as string;
          updateField(key, dataUrl);
        };
        reader.readAsDataURL(file);
      }
    } catch {
      setUploadError("Upload failed. Please try again or paste a URL manually.");
    } finally {
      setUploadingKey(null);
    }
  }

  async function handleFileChange(key: ImageKey, e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    await handleImageUpload(key, file);
    // Reset input so same file can be re-uploaded
    if (fileRefs[key].current) fileRefs[key].current.value = "";
  }

  function removeImage(key: ImageKey) {
    updateField(key, "");
  }

  // ── Save ────────────────────────────────────────────────────────────────────
  async function saveCompany(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!companyId) {
      setError("Company record was not found.");
      return;
    }

    if (!form.name.trim()) {
      setError("Company name is required.");
      return;
    }

    setSaving(true);
    setError("");
    setMessage("");

    const { error } = await supabase
      .from("companies")
      .update({
        name: form.name.trim(),
        arabic_name: form.arabic_name.trim() || null,
        legal_name: form.legal_name || null,
        trade_license_no: form.trade_license_no || null,
        trn: form.trn || null,
        business_type: form.business_type || null,
        industry: form.industry || null,
        email: form.email || null,
        phone: form.phone || null,
        mobile: form.mobile || null,
        website: form.website || null,
        logo_url: form.logo_url || null,
        stamp_url: form.stamp_url || null,
        signature_url: form.signature_url || null,
        background_url: form.background_url || null,
        building_image_url: form.building_image_url || null,
        footer_image_url: form.footer_image_url || null,
        address: form.address || null,
        city: form.city || null,
        emirate: form.emirate || null,
        country: form.country || "United Arab Emirates",
        po_box: form.po_box || null,
        currency: form.currency || "AED",
        vat_registered: form.vat_registered,
        default_vat_rate: Number(form.default_vat_rate || 0),
        bank_name: form.bank_name || null,
        bank_account_name: form.bank_account_name || null,
        iban: form.iban || null,
        swift_bic: form.swift_bic || null,
        payment_terms: form.payment_terms || null,
        terms_conditions: form.terms_conditions || null,
        brand_primary: form.brand_primary || null,
        brand_accent: form.brand_accent || null,
        brand_text: form.brand_text || null,
        brand_muted: form.brand_muted || null,
        brand_border: form.brand_border || null,
        brand_table_header: form.brand_table_header || null,
        brand_total_highlight: form.brand_total_highlight || null,
        logo_size: Number(form.logo_size) || 200,
        arabic_name_size: Number(form.arabic_name_size) || 30,
        updated_at: new Date().toISOString(),
      })
      .eq("id", companyId);

    if (error) {
      setError(error.message);
    } else {
      clearCompanyCache();
      setMessage("Company settings saved successfully.");
    }

    setSaving(false);
  }

  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-50">
        <Loader2
          size={30}
          className="animate-spin text-slate-700"
        />
      </main>
    );
  }

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <main className="min-h-screen bg-slate-50">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-6xl items-center gap-4 px-6 py-5">
          <button
            onClick={() => window.history.back()}
            className="rounded-lg border border-slate-200 p-2 hover:bg-slate-50"
          >
            <ArrowLeft size={20} />
          </button>

          <div className="flex items-center gap-3">
            <div className="rounded-xl bg-slate-900 p-2.5 text-white">
              <Building2 size={22} />
            </div>

            <div>
              <h1 className="text-2xl font-bold text-slate-900">
                Company Settings
              </h1>
              <p className="text-sm text-slate-500">
                Configure your UAE company information, branding &amp; document appearance
              </p>
            </div>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-6xl px-6 py-8">
        {error && (
          <div className="mb-6 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        )}

        {message && (
          <div className="mb-6 rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-700">
            {message}
          </div>
        )}

        {uploadError && (
          <div className="mb-6 rounded-lg border border-orange-200 bg-orange-50 px-4 py-3 text-sm text-orange-700">
            {uploadError}
          </div>
        )}

        {/* ── Document Designer / PDF Designer Banner Card ─────────────────────── */}
        <div className="mb-6 rounded-2xl border-2 border-slate-900 bg-gradient-to-r from-slate-950 via-slate-900 to-slate-800 p-6 text-white shadow-xl flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
          <div className="space-y-2 max-w-2xl">
            <div className="inline-flex items-center gap-2 rounded-full bg-amber-500/20 px-3 py-1 text-xs font-semibold text-amber-400 border border-amber-500/30">
              <FileText size={14} />
              <span>Interactive A4 / PDF Document Layout Designer</span>
            </div>
            <h2 className="text-xl font-bold text-white tracking-tight">
              Document Designer &amp; PDF Template Editor
            </h2>
            <p className="text-xs text-slate-300 leading-relaxed">
              Visually arrange, resize, and drag-and-drop elements on a realistic live A4 preview (210×297mm).
              Customize Quotations, Tax Invoices, Delivery Notes, POs, and Receipts without editing code.
            </p>
          </div>
          <a
            href="/settings/designer"
            className="shrink-0 flex items-center gap-2 rounded-xl bg-amber-500 px-5 py-3 text-sm font-bold text-slate-950 shadow-lg hover:bg-amber-400 transition"
          >
            <Sliders size={18} />
            <span>Launch PDF Designer</span>
          </a>
        </div>

        {/* ── Document Titles & Document Numbering Section ─────────────────── */}
        <div className="mb-6 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-4 pb-4 border-b border-slate-100">
            <div>
              <div className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-semibold text-emerald-700 border border-emerald-200 mb-1">
                <Hash size={12} />
                <span>Custom Document Titles &amp; Serial Formats</span>
              </div>
              <h2 className="text-lg font-bold text-slate-900">
                Document Titles &amp; Document Numbering
              </h2>
              <p className="text-xs text-slate-500">
                Fully customize visible titles (e.g. Quotation &rarr; QTN) and serial number patterns (prefixes, years, separators, digit padding) per document type.
              </p>
            </div>
            <a
              href="/settings/designer?tab=numbering"
              className="flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-2.5 text-xs font-bold text-white hover:bg-slate-800 transition shrink-0"
            >
              <Sliders size={14} />
              <span>Configure in PDF Designer</span>
            </a>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {(
              [
                { id: "quotation", label: "Quotation" },
                { id: "tax_invoice", label: "Tax Invoice" },
                { id: "proforma_invoice", label: "Proforma Invoice" },
                { id: "delivery_note", label: "Delivery Note" },
                { id: "purchase_order", label: "Purchase Order" },
                { id: "supplier_bill", label: "Supplier Bill" },
                { id: "receipt_voucher", label: "Receipt Voucher" },
                { id: "credit_note", label: "Credit Note" },
              ] as const
            ).map((doc) => {
              const cfg = companyId ? getCachedDocNumberingConfig(companyId, doc.id as DocumentTypeId) : DEFAULT_NUMBERING_CONFIGS[doc.id as DocumentTypeId];
              const sample = formatDocNumber(cfg, cfg.nextSequence ?? 1);
              return (
                <div key={doc.id} className="rounded-xl border border-slate-200 bg-slate-50/60 p-3.5 flex flex-col justify-between hover:border-slate-300 transition">
                  <div className="space-y-1.5 mb-3">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-slate-800">{doc.label}</span>
                      <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-800 font-semibold">
                        {cfg.customTitle || doc.label.toUpperCase()}
                      </span>
                    </div>
                    <div className="text-[11px] text-slate-500 flex items-center justify-between">
                      <span>Live Sample:</span>
                      <span className="font-mono font-bold text-slate-900 bg-white border border-slate-200 px-2 py-0.5 rounded">
                        {sample}
                      </span>
                    </div>
                  </div>
                  <a
                    href={`/settings/designer?docType=${doc.id}&tab=numbering`}
                    className="flex items-center justify-center gap-1.5 text-[11px] font-bold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200/60 rounded-lg py-1.5 transition"
                  >
                    <span>Customize Format</span>
                    <ExternalLink size={12} />
                  </a>
                </div>
              );
            })}
          </div>
        </div>

        <form onSubmit={saveCompany} className="space-y-6">
          {/* ── Company Information ─────────────────────────────────────────── */}
          <section className="rounded-xl border border-slate-200 bg-white p-6">
            <h2 className="text-lg font-semibold text-slate-900">
              Company Information
            </h2>

            <div className="mt-5 grid grid-cols-1 gap-5 md:grid-cols-2">
              <div>
                <label className="mb-2 block text-sm font-medium">
                  Company Name (English) *
                </label>
                <input
                  value={form.name}
                  onChange={(e) =>
                    updateField("name", e.target.value)
                  }
                  placeholder="Your company name"
                  required
                  className="w-full rounded-lg border border-slate-300 px-4 py-3 outline-none focus:border-slate-900"
                />
              </div>

              <div>
                <label className="mb-2 block text-sm font-medium">
                  Company Name (Arabic) / اسم الشركة بالعربية
                </label>
                <input
                  value={form.arabic_name}
                  onChange={(e) =>
                    updateField("arabic_name", e.target.value)
                  }
                  placeholder="الصفوه الذهبيه لصناعه الخيام ذ.م.م.ش.ش.و"
                  className="w-full rounded-lg border border-slate-300 px-4 py-3 font-arabic text-right"
                  dir="rtl"
                />
              </div>

              <div>
                <label className="mb-2 block text-sm font-medium">
                  Legal Name
                </label>
                <input
                  value={form.legal_name}
                  onChange={(e) =>
                    updateField("legal_name", e.target.value)
                  }
                  placeholder="AL SAFWAH AL QABDHA TENTS IND L.L.C SP"
                  className="w-full rounded-lg border border-slate-300 px-4 py-3"
                />
              </div>

              <div>
                <label className="mb-2 block text-sm font-medium">
                  Trade License Number
                </label>
                <input
                  value={form.trade_license_no}
                  onChange={(e) =>
                    updateField(
                      "trade_license_no",
                      e.target.value
                    )
                  }
                  className="w-full rounded-lg border border-slate-300 px-4 py-3"
                />
              </div>

              <div>
                <label className="mb-2 block text-sm font-medium">
                  TRN
                </label>
                <input
                  value={form.trn}
                  onChange={(e) =>
                    updateField("trn", e.target.value)
                  }
                  className="w-full rounded-lg border border-slate-300 px-4 py-3"
                />
              </div>

              <div>
                <label className="mb-2 block text-sm font-medium">
                  Business Type
                </label>
                <input
                  value={form.business_type}
                  onChange={(e) =>
                    updateField(
                      "business_type",
                      e.target.value
                    )
                  }
                  placeholder="LLC / Sole Establishment / etc."
                  className="w-full rounded-lg border border-slate-300 px-4 py-3"
                />
              </div>

              <div>
                <label className="mb-2 block text-sm font-medium">
                  Industry
                </label>
                <input
                  value={form.industry}
                  onChange={(e) =>
                    updateField("industry", e.target.value)
                  }
                  placeholder="Trading / Construction / Services"
                  className="w-full rounded-lg border border-slate-300 px-4 py-3"
                />
              </div>
            </div>
          </section>

          {/* ── Contact & Address ───────────────────────────────────────────── */}
          <section className="rounded-xl border border-slate-200 bg-white p-6">
            <h2 className="text-lg font-semibold text-slate-900">
              Contact &amp; Address
            </h2>

            <div className="mt-5 grid grid-cols-1 gap-5 md:grid-cols-2">
              <div>
                <label className="mb-2 block text-sm font-medium">
                  Email
                </label>
                <input
                  type="email"
                  value={form.email}
                  onChange={(e) =>
                    updateField("email", e.target.value)
                  }
                  className="w-full rounded-lg border border-slate-300 px-4 py-3"
                />
              </div>

              <div>
                <label className="mb-2 block text-sm font-medium">
                  Telephone
                </label>
                <input
                  value={form.phone}
                  onChange={(e) =>
                    updateField("phone", e.target.value)
                  }
                  className="w-full rounded-lg border border-slate-300 px-4 py-3"
                />
              </div>

              <div>
                <label className="mb-2 block text-sm font-medium">
                  Mobile Number
                </label>
                <input
                  value={form.mobile}
                  onChange={(e) =>
                    updateField("mobile", e.target.value)
                  }
                  placeholder="+971 50..."
                  className="w-full rounded-lg border border-slate-300 px-4 py-3"
                />
              </div>

              <div>
                <label className="mb-2 block text-sm font-medium">
                  Website
                </label>
                <input
                  value={form.website}
                  onChange={(e) =>
                    updateField("website", e.target.value)
                  }
                  placeholder="https://"
                  className="w-full rounded-lg border border-slate-300 px-4 py-3"
                />
              </div>

              <div>
                <label className="mb-2 block text-sm font-medium">
                  PO Box
                </label>
                <input
                  value={form.po_box}
                  onChange={(e) =>
                    updateField("po_box", e.target.value)
                  }
                  className="w-full rounded-lg border border-slate-300 px-4 py-3"
                />
              </div>

              <div className="md:col-span-2">
                <label className="mb-2 block text-sm font-medium">
                  Address
                </label>
                <textarea
                  rows={3}
                  value={form.address}
                  onChange={(e) =>
                    updateField("address", e.target.value)
                  }
                  className="w-full rounded-lg border border-slate-300 px-4 py-3"
                />
              </div>

              <div>
                <label className="mb-2 block text-sm font-medium">
                  City
                </label>
                <input
                  value={form.city}
                  onChange={(e) =>
                    updateField("city", e.target.value)
                  }
                  placeholder="Dubai"
                  className="w-full rounded-lg border border-slate-300 px-4 py-3"
                />
              </div>

              <div>
                <label className="mb-2 block text-sm font-medium">
                  Emirate
                </label>
                <select
                  value={form.emirate}
                  onChange={(e) =>
                    updateField("emirate", e.target.value)
                  }
                  className="w-full rounded-lg border border-slate-300 bg-white px-4 py-3"
                >
                  <option value="">Select Emirate</option>
                  <option value="Abu Dhabi">Abu Dhabi</option>
                  <option value="Ajman">Ajman</option>
                  <option value="Dubai">Dubai</option>
                  <option value="Fujairah">Fujairah</option>
                  <option value="Ras Al Khaimah">
                    Ras Al Khaimah
                  </option>
                  <option value="Sharjah">Sharjah</option>
                  <option value="Umm Al Quwain">
                    Umm Al Quwain
                  </option>
                </select>
              </div>

              <div>
                <label className="mb-2 block text-sm font-medium">
                  Country
                </label>
                <input
                  value={form.country}
                  onChange={(e) =>
                    updateField("country", e.target.value)
                  }
                  className="w-full rounded-lg border border-slate-300 px-4 py-3"
                />
              </div>

              <div>
                <label className="mb-2 block text-sm font-medium">
                  Currency
                </label>
                <input
                  value={form.currency}
                  onChange={(e) =>
                    updateField("currency", e.target.value)
                  }
                  className="w-full rounded-lg border border-slate-300 px-4 py-3"
                />
              </div>
            </div>
          </section>

          {/* ── VAT Settings ────────────────────────────────────────────────── */}
          <section className="rounded-xl border border-slate-200 bg-white p-6">
            <h2 className="text-lg font-semibold text-slate-900">
              VAT Settings
            </h2>

            <div className="mt-5 grid grid-cols-1 gap-5 md:grid-cols-2">
              <label className="flex items-center gap-3 rounded-lg border border-slate-200 p-4">
                <input
                  type="checkbox"
                  checked={form.vat_registered}
                  onChange={(e) =>
                    updateField(
                      "vat_registered",
                      e.target.checked
                    )
                  }
                  className="h-4 w-4"
                />
                <span className="text-sm font-medium">
                  VAT Registered
                </span>
              </label>

              <div>
                <label className="mb-2 block text-sm font-medium">
                  Default VAT Rate (%)
                </label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={form.default_vat_rate}
                  onChange={(e) =>
                    updateField(
                      "default_vat_rate",
                      e.target.value
                    )
                  }
                  className="w-full rounded-lg border border-slate-300 px-4 py-3"
                />
              </div>
            </div>
          </section>

          {/* ── Bank Details ─────────────────────────────────────────────────── */}
          <section className="rounded-xl border border-slate-200 bg-white p-6">
            <h2 className="text-lg font-semibold text-slate-900">
              Bank Details
            </h2>

            <div className="mt-5 grid grid-cols-1 gap-5 md:grid-cols-2">
              <div>
                <label className="mb-2 block text-sm font-medium">
                  Bank Name
                </label>
                <input
                  value={form.bank_name}
                  onChange={(e) =>
                    updateField("bank_name", e.target.value)
                  }
                  className="w-full rounded-lg border border-slate-300 px-4 py-3"
                />
              </div>

              <div>
                <label className="mb-2 block text-sm font-medium">
                  Account Name
                </label>
                <input
                  value={form.bank_account_name}
                  onChange={(e) =>
                    updateField(
                      "bank_account_name",
                      e.target.value
                    )
                  }
                  className="w-full rounded-lg border border-slate-300 px-4 py-3"
                />
              </div>

              <div>
                <label className="mb-2 block text-sm font-medium">
                  IBAN
                </label>
                <input
                  value={form.iban}
                  onChange={(e) =>
                    updateField("iban", e.target.value)
                  }
                  className="w-full rounded-lg border border-slate-300 px-4 py-3"
                />
              </div>

              <div>
                <label className="mb-2 block text-sm font-medium">
                  SWIFT / BIC
                </label>
                <input
                  value={form.swift_bic}
                  onChange={(e) =>
                    updateField("swift_bic", e.target.value)
                  }
                  className="w-full rounded-lg border border-slate-300 px-4 py-3"
                />
              </div>
            </div>
          </section>

          {/* ── Document Settings ───────────────────────────────────────────── */}
          <section className="rounded-xl border border-slate-200 bg-white p-6">
            <h2 className="text-lg font-semibold text-slate-900">
              Document Settings
            </h2>

            <div className="mt-5 grid grid-cols-1 gap-5">
              <div>
                <label className="mb-2 block text-sm font-medium">
                  Default Payment Terms
                </label>
                <input
                  value={form.payment_terms}
                  onChange={(e) =>
                    updateField(
                      "payment_terms",
                      e.target.value
                    )
                  }
                  placeholder="30 Days"
                  className="w-full rounded-lg border border-slate-300 px-4 py-3"
                />
              </div>

              <div>
                <label className="mb-2 block text-sm font-medium">
                  Terms &amp; Conditions
                </label>
                <textarea
                  rows={6}
                  value={form.terms_conditions}
                  onChange={(e) =>
                    updateField(
                      "terms_conditions",
                      e.target.value
                    )
                  }
                  placeholder="Enter your standard terms and conditions..."
                  className="w-full rounded-lg border border-slate-300 px-4 py-3"
                />
              </div>
            </div>
          </section>

          {/* ── Brand Assets / Image Uploads ────────────────────────────────── */}
          <section className="rounded-xl border border-slate-200 bg-white p-6">
            <div className="flex items-center gap-3 mb-1">
              <div className="rounded-lg bg-slate-900 p-2 text-white">
                <Upload size={18} />
              </div>
              <h2 className="text-lg font-semibold text-slate-900">
                Brand Assets &amp; Image Uploads
              </h2>
            </div>
            <p className="text-sm text-slate-500 mb-6">
              Upload PNG, JPG or JPEG images. Uploaded images are used on all printable documents.
              Company stamp will appear on the left (company) side of signature blocks only.
            </p>

            {/* Centralized Document Header Logo Size Control */}
            <div className="mb-8 rounded-xl border border-slate-200 bg-slate-50/70 p-5">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-3">
                <div>
                  <h3 className="text-sm font-bold text-slate-900">
                    Printable Document Header Logo Size
                  </h3>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Controls logo width on all shared A4 printable documents (Quotations, Tax Invoices, POs, etc.). Height scales automatically to preserve aspect ratio without distortion.
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => updateField("logo_size", Math.max(100, Number(form.logo_size || 200) - 10))}
                    className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-300 bg-white text-slate-700 hover:bg-slate-100 transition"
                    title="Decrease logo width (-10px)"
                    id="decrease-logo-size-btn"
                  >
                    <Minus size={14} />
                  </button>
                  <div className="flex items-center gap-1">
                    <input
                      type="number"
                      min={100}
                      max={360}
                      step={5}
                      value={form.logo_size}
                      onChange={(e) => updateField("logo_size", Math.max(80, Math.min(400, Number(e.target.value) || 200)))}
                      className="w-16 rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-center font-mono text-sm font-bold text-slate-800"
                      id="logo-size-input"
                    />
                    <span className="text-xs font-semibold text-slate-500">px</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => updateField("logo_size", Math.min(360, Number(form.logo_size || 200) + 10))}
                    className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-300 bg-white text-slate-700 hover:bg-slate-100 transition"
                    title="Increase logo width (+10px)"
                    id="increase-logo-size-btn"
                  >
                    <Plus size={14} />
                  </button>
                  <button
                    type="button"
                    onClick={() => updateField("logo_size", 200)}
                    className="ml-2 rounded border border-slate-200 bg-white px-2 py-1 text-[11px] font-medium text-slate-500 hover:text-slate-800"
                    title="Reset to default 200px"
                    id="reset-logo-size-btn"
                  >
                    Reset (200px)
                  </button>
                </div>
              </div>
              <input
                type="range"
                min={100}
                max={360}
                step={5}
                value={form.logo_size}
                onChange={(e) => updateField("logo_size", Number(e.target.value))}
                className="w-full accent-slate-900 cursor-pointer"
                id="logo-size-slider"
              />
              <div className="flex justify-between text-[11px] text-slate-400 mt-1 font-mono">
                <span>Compact (100px)</span>
                <span className="font-semibold text-slate-600">Standard (200px)</span>
                <span>Prominent (360px)</span>
              </div>
            </div>

            {/* Centralized Document Header Arabic Company Name Size Control */}
            <div className="mb-8 rounded-xl border border-slate-200 bg-slate-50/70 p-5">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-3">
                <div>
                  <h3 className="text-sm font-bold text-slate-900">
                    Arabic Company Name Size (حجم اسم الشركة بالعربية)
                  </h3>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Controls the font size of the Arabic company name on all shared A4 printable documents (1.4–1.6× the English legal name).
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => updateField("arabic_name_size", Math.max(18, Number(form.arabic_name_size || 30) - 1))}
                    className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-300 bg-white text-slate-700 hover:bg-slate-100 transition"
                    title="Decrease Arabic name size (-1px)"
                    id="decrease-arabic-name-size-btn"
                  >
                    <Minus size={14} />
                  </button>
                  <div className="flex items-center gap-1">
                    <input
                      type="number"
                      min={18}
                      max={48}
                      step={1}
                      value={form.arabic_name_size}
                      onChange={(e) => updateField("arabic_name_size", Math.max(18, Math.min(48, Number(e.target.value) || 30)))}
                      className="w-16 rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-center font-mono text-sm font-bold text-slate-800"
                      id="arabic-name-size-input"
                    />
                    <span className="text-xs font-semibold text-slate-500">px</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => updateField("arabic_name_size", Math.min(48, Number(form.arabic_name_size || 30) + 1))}
                    className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-300 bg-white text-slate-700 hover:bg-slate-100 transition"
                    title="Increase Arabic name size (+1px)"
                    id="increase-arabic-name-size-btn"
                  >
                    <Plus size={14} />
                  </button>
                  <button
                    type="button"
                    onClick={() => updateField("arabic_name_size", 30)}
                    className="ml-2 rounded border border-slate-200 bg-white px-2 py-1 text-[11px] font-medium text-slate-500 hover:text-slate-800"
                    title="Reset to default 30px"
                    id="reset-arabic-name-size-btn"
                  >
                    Reset (30px)
                  </button>
                </div>
              </div>
              <input
                type="range"
                min={18}
                max={48}
                step={1}
                value={form.arabic_name_size}
                onChange={(e) => updateField("arabic_name_size", Number(e.target.value))}
                className="w-full accent-slate-900 cursor-pointer"
                id="arabic-name-size-slider"
              />
              <div className="flex justify-between text-[11px] text-slate-400 mt-1 font-mono">
                <span>Compact (18px)</span>
                <span className="font-semibold text-slate-600">Standard (30px)</span>
                <span>Prominent (48px)</span>
              </div>

              {/* Real-time visual preview card */}
              <div className="mt-4 rounded-lg border border-slate-200 bg-white p-4 text-center">
                <p className="text-[11px] text-slate-400 font-sans mb-1 uppercase tracking-wider font-semibold">Live Header Preview</p>
                <div
                  className="font-arabic font-bold transition-all select-text"
                  dir="rtl"
                  style={{
                    fontSize: `${form.arabic_name_size || 30}px`,
                    color: form.brand_accent || "#C9A227",
                    lineHeight: 1.25,
                    fontFamily: "'Segoe UI Arabic', 'Amiri', 'Scheherazade New', 'Traditional Arabic', Arial, sans-serif",
                  }}
                >
                  {form.arabic_name || "الصفوه الذهبيه لصناعه الخيام ذ.م.م.ش.ش.و"}
                </div>
                <div className="mt-1.5 flex items-center justify-center gap-2" aria-hidden="true">
                  <span className="h-[1px] w-14" style={{ backgroundColor: form.brand_accent || "#C9A227", opacity: 0.85 }} />
                  <span className="h-1.5 w-1.5 rotate-45" style={{ backgroundColor: form.brand_accent || "#C9A227" }} />
                  <span className="h-[1px] w-14" style={{ backgroundColor: form.brand_accent || "#C9A227", opacity: 0.85 }} />
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
              {(Object.keys(IMAGE_LABELS) as ImageKey[]).map((key) => {
                const currentUrl = form[key] as string;
                const isUploading = uploadingKey === key;

                return (
                  <div key={key} className="rounded-lg border border-slate-200 p-4">
                    <div className="flex items-center justify-between mb-3">
                      <label className="text-sm font-semibold text-slate-800">
                        {IMAGE_LABELS[key]}
                      </label>
                      {currentUrl && (
                        <button
                          type="button"
                          onClick={() => removeImage(key)}
                          className="flex items-center gap-1 text-xs text-red-600 hover:text-red-800 transition"
                          title="Remove image"
                        >
                          <X size={14} /> Remove
                        </button>
                      )}
                    </div>

                    {/* Preview */}
                    {currentUrl && (
                      <div className="mb-3 flex items-center justify-center rounded border border-slate-100 bg-slate-50 p-2 min-h-[80px]">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={currentUrl}
                          alt={IMAGE_LABELS[key]}
                          className="max-h-24 max-w-full object-contain"
                          onError={(e) => {
                            (e.target as HTMLImageElement).style.display = "none";
                          }}
                        />
                      </div>
                    )}

                    {/* File chooser */}
                    <div className="flex gap-2">
                      <button
                        type="button"
                        disabled={isUploading}
                        onClick={() => fileRefs[key].current?.click()}
                        className="flex items-center gap-2 rounded-lg border border-slate-300 px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 transition disabled:opacity-50 cursor-pointer"
                        id={`upload-btn-${key}`}
                      >
                        {isUploading ? (
                          <><Loader2 size={13} className="animate-spin" /> Uploading...</>
                        ) : (
                          <><Upload size={13} /> {currentUrl ? "Replace" : "Upload"} Image</>
                        )}
                      </button>
                      <input
                        ref={fileRefs[key]}
                        type="file"
                        accept=".png,.jpg,.jpeg,image/png,image/jpeg"
                        className="hidden"
                        onChange={(e) => handleFileChange(key, e)}
                        id={`file-input-${key}`}
                      />
                    </div>

                    {/* Manual URL entry */}
                    <div className="mt-2">
                      <input
                        value={currentUrl}
                        onChange={(e) => updateField(key, e.target.value)}
                        placeholder="Or paste image URL..."
                        className="w-full rounded border border-slate-200 px-3 py-1.5 text-xs text-slate-600 focus:outline-none focus:border-slate-400"
                        id={`url-input-${key}`}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </section>

          {/* ── Brand Color Theme ───────────────────────────────────────────── */}
          <section className="rounded-xl border border-slate-200 bg-white p-6">
            <div className="flex items-center justify-between mb-1">
              <div className="flex items-center gap-3">
                <div className="rounded-lg bg-slate-900 p-2 text-white">
                  <Palette size={18} />
                </div>
                <h2 className="text-lg font-semibold text-slate-900">
                  Document Color Theme
                </h2>
              </div>
              <button
                type="button"
                onClick={resetColors}
                className="flex items-center gap-1.5 rounded-lg border border-slate-300 px-3 py-2 text-xs font-medium text-slate-600 hover:bg-slate-50 transition"
                title="Reset all colors to professional Navy+Gold defaults"
                id="reset-colors-btn"
              >
                <RotateCcw size={13} /> Reset to Professional Defaults
              </button>
            </div>
            <p className="text-sm text-slate-500 mb-6">
              Controls the Navy + Gold color palette used on all printed documents.
              Changes apply to headers, table headers, accent colors, and signature blocks.
            </p>

            {/* Live color preview strip */}
            <div className="mb-6 flex rounded-lg overflow-hidden h-8 border border-slate-200">
              <div className="flex-1" style={{ backgroundColor: form.brand_primary }} title={`Primary: ${form.brand_primary}`} />
              <div className="flex-1" style={{ backgroundColor: form.brand_accent }} title={`Accent: ${form.brand_accent}`} />
              <div className="flex-1" style={{ backgroundColor: form.brand_text }} title={`Text: ${form.brand_text}`} />
              <div className="flex-1" style={{ backgroundColor: form.brand_muted }} title={`Muted: ${form.brand_muted}`} />
              <div className="flex-1" style={{ backgroundColor: form.brand_border }} title={`Border: ${form.brand_border}`} />
              <div className="flex-1" style={{ backgroundColor: form.brand_table_header }} title={`Table Header: ${form.brand_table_header}`} />
              <div className="flex-1" style={{ backgroundColor: form.brand_total_highlight }} title={`Total Highlight: ${form.brand_total_highlight}`} />
            </div>

            <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
              {COLOR_CONTROLS.map(({ key, label, description }) => {
                const colorVal = (form[key as keyof typeof form] as string) || DEFAULT_COLORS[key];
                return (
                  <div key={key} className="rounded-lg border border-slate-200 p-4">
                    <div className="flex items-center justify-between mb-2">
                      <div>
                        <div className="text-sm font-semibold text-slate-800">{label}</div>
                        <div className="text-xs text-slate-500">{description}</div>
                      </div>
                      <button
                        type="button"
                        onClick={() => updateField(key, DEFAULT_COLORS[key])}
                        className="text-xs text-slate-400 hover:text-slate-600 transition"
                        title="Reset to default"
                      >
                        <RotateCcw size={12} />
                      </button>
                    </div>
                    <div className="flex items-center gap-3">
                      {/* Color swatch picker */}
                      <label
                        className="relative cursor-pointer"
                        htmlFor={`color-picker-${key}`}
                      >
                        <div
                          className="h-10 w-10 rounded-lg border-2 border-slate-300 shadow-sm"
                          style={{ backgroundColor: colorVal }}
                        />
                        <input
                          id={`color-picker-${key}`}
                          type="color"
                          value={colorVal}
                          onChange={(e) => updateField(key, e.target.value)}
                          className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
                        />
                      </label>
                      {/* HEX text input */}
                      <input
                        type="text"
                        value={colorVal}
                        onChange={(e) => {
                          const val = e.target.value;
                          if (/^#[0-9A-Fa-f]{0,6}$/.test(val)) {
                            updateField(key, val);
                          }
                        }}
                        maxLength={7}
                        placeholder="#000000"
                        className="flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm font-mono focus:outline-none focus:border-slate-600"
                        id={`color-hex-${key}`}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </section>

          {/* ── Save ───────────────────────────────────────────────────────── */}
          <div className="flex justify-end pb-10">
            <button
              type="submit"
              disabled={saving}
              className="flex items-center gap-2 rounded-lg bg-slate-900 px-6 py-3 font-semibold text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {saving ? (
                <>
                  <Loader2
                    size={18}
                    className="animate-spin"
                  />
                  Saving...
                </>
              ) : (
                <>
                  <Save size={18} />
                  Save Company Settings
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </main>
  );
}

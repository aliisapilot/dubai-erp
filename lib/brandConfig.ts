export type BrandAssets = {
  logo: string;
  logoFallback?: string;
  background: string;
  backgroundFallback?: string;
  watermark: string;
  watermarkFallback?: string;
  stamp: string;
  stampFallback?: string;
  signature: string;
  signatureFallback?: string;
  footer: string;
  footerGraphic: string;
  illustration: string;
  /** Optional building / company premises image (uploaded from Settings). */
  building?: string;
};

/* ==========================================================================
   CENTRAL BRAND COLORS (single source of truth for ALL printable documents)
   ========================================================================== */

export type BrandColorKey =
  | "primary"
  | "accent"
  | "text"
  | "muted"
  | "white"
  | "tableHeader"
  | "border"
  | "totalHighlight";

export type BrandColors = Record<BrandColorKey, string>;

export const DEFAULT_BRAND_COLORS: BrandColors = {
  primary: "#0F172A",
  accent: "#C9A227",
  text: "#334155",
  muted: "#64748B",
  white: "#FFFFFF",
  tableHeader: "#0F172A",
  border: "#CBD5E1",
  totalHighlight: "#F8F6ED",
};

/** Labels shown by the Settings -> Brand Colors pickers. */
export const BRAND_COLOR_FIELDS: { key: BrandColorKey; label: string }[] = [
  { key: "primary", label: "Primary" },
  { key: "accent", label: "Accent / Gold" },
  { key: "text", label: "Text" },
  { key: "muted", label: "Muted" },
  { key: "white", label: "White" },
  { key: "tableHeader", label: "Table Header" },
  { key: "border", label: "Border" },
  { key: "totalHighlight", label: "Total Highlight" },
];

/** CSS custom property name for a brand color (e.g. tableHeader -> --brand-table-header). */
export function brandColorCssVar(key: BrandColorKey): string {
  return `--brand-${key.replace(/[A-Z]/g, (m) => `-${m.toLowerCase()}`)}`;
}

/** Ready-to-use CSS value with the default hex as fallback, safe during SSR. */
export function brandColorVar(key: BrandColorKey): string {
  return `var(${brandColorCssVar(key)}, ${DEFAULT_BRAND_COLORS[key]})`;
}

/** Accepts "#RGB" or "RGB" or "#RRGGBB" or "RRGGBB" and returns "#RRGGBB" (uppercase), else null. */
export function normalizeHex(value: string): string | null {
  const v = value.trim();
  const m6 = /^#?([0-9a-fA-F]{6})$/.exec(v);
  if (m6) return `#${m6[1].toUpperCase()}`;
  const m3 = /^#?([0-9a-fA-F]{3})$/.exec(v);
  if (m3) {
    const [r, g, b] = m3[1].split("");
    return `#${r}${r}${g}${g}${b}${b}`.toUpperCase();
  }
  return null;
}

export function isHexColor(value: string): boolean {
  return normalizeHex(value) !== null;
}

const BRAND_COLORS_STORAGE_KEY = "dubai-erp.brand-colors";

/** Loads saved brand colors (browser storage) merged over the defaults. SSR-safe. */
export function loadBrandColors(): BrandColors {
  if (typeof window === "undefined") return { ...DEFAULT_BRAND_COLORS };
  try {
    const raw = window.localStorage.getItem(BRAND_COLORS_STORAGE_KEY);
    if (!raw) return { ...DEFAULT_BRAND_COLORS };
    const parsed = JSON.parse(raw) as Partial<BrandColors>;
    const out: BrandColors = { ...DEFAULT_BRAND_COLORS };
    (Object.keys(DEFAULT_BRAND_COLORS) as BrandColorKey[]).forEach((key) => {
      const value = parsed?.[key];
      if (typeof value === "string") {
        const hex = normalizeHex(value);
        if (hex) out[key] = hex;
      }
    });
    return out;
  } catch {
    return { ...DEFAULT_BRAND_COLORS };
  }
}

export function saveBrandColors(colors: BrandColors): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(BRAND_COLORS_STORAGE_KEY, JSON.stringify(colors));
  } catch {
    // Storage unavailable — colors still apply for the current session.
  }
}

export function resetBrandColors(): void {
  if (typeof window !== "undefined") {
    try {
      window.localStorage.removeItem(BRAND_COLORS_STORAGE_KEY);
    } catch {
      // ignore
    }
  }
  applyBrandColors(DEFAULT_BRAND_COLORS);
}

/** Publishes the brand colors as CSS custom properties on :root. */
export function applyBrandColors(colors: BrandColors = loadBrandColors()): void {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  (Object.keys(DEFAULT_BRAND_COLORS) as BrandColorKey[]).forEach((key) => {
    root.style.setProperty(brandColorCssVar(key), colors[key]);
  });
}

/**
 * ONE central stylesheet that maps the recurring document color utilities to the
 * brand CSS variables. Injected once by DocumentContainer so no template needs
 * to hardcode colors. Every var() carries the default hex as an SSR/print fallback.
 */
export const BRAND_COLOR_OVERRIDE_CSS = `
.print-document { color: var(--brand-text, #334155); }
.print-document .text-slate-950,
.print-document .text-slate-900,
.print-document .text-slate-800 { color: var(--brand-primary, #0F172A); }
.print-document .text-slate-700,
.print-document .text-slate-600 { color: var(--brand-text, #334155); }
.print-document .text-slate-500,
.print-document .text-slate-400 { color: var(--brand-muted, #64748B); }
.print-document .text-white { color: var(--brand-white, #FFFFFF); }
.print-document .text-amber-300,
.print-document .text-amber-400,
.print-document .text-amber-700,
.print-document .text-emerald-700,
.print-document .text-emerald-800 { color: var(--brand-accent, #C9A227); }
.print-document .bg-white { background-color: var(--brand-white, #FFFFFF); }
.print-document .bg-slate-900 { background-color: var(--brand-primary, #0F172A); }
.print-document thead.bg-slate-900 { background-color: var(--brand-table-header, #0F172A); }
.print-document .bg-emerald-50,
.print-document .bg-emerald-50\\/40,
.print-document .bg-emerald-50\\/60,
.print-document .bg-emerald-50\\/80 { background-color: var(--brand-total-highlight, #F8F6ED); }
.print-document .border-slate-200,
.print-document .border-slate-200\\/60,
.print-document .border-slate-200\\/80,
.print-document .border-slate-300,
.print-document .border-slate-400,
.print-document .border-emerald-200 { border-color: var(--brand-border, #CBD5E1); }
.print-document .border-slate-900 { border-color: var(--brand-primary, #0F172A); }
.print-document .divide-slate-200 > :not(:last-child),
.print-document .divide-slate-200 > :not([hidden]) ~ :not([hidden]) { border-color: var(--brand-border, #CBD5E1); }
`;

/* ==========================================================================
   DIRECT REAL IMAGE UPLOADS (uploaded PNG/JPG/JPEG files only — never generated)
   ========================================================================== */

export type BrandImageKey =
  | "logo"
  | "stamp"
  | "signature"
  | "watermark"
  | "background"
  | "building"
  | "footer";

export type StoredBrandImages = Partial<Record<BrandImageKey, string>>;

/** Upload slots exposed in Settings -> Branding Images. */
export const BRAND_IMAGE_FIELDS: { key: BrandImageKey; label: string }[] = [
  { key: "logo", label: "Company Logo" },
  { key: "stamp", label: "Company Stamp" },
  { key: "signature", label: "Authorized Signature" },
  { key: "watermark", label: "Watermark / Background" },
  { key: "building", label: "Building / Company Image" },
  { key: "footer", label: "Footer Image" },
];

const BRAND_IMAGES_STORAGE_KEY = "dubai-erp.brand-images";

/** Loads the uploaded branding images. SSR-safe (returns {} on the server). */
export function loadBrandImages(): StoredBrandImages {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(BRAND_IMAGES_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    if (!parsed || typeof parsed !== "object") return {};
    const out: StoredBrandImages = {};
    Object.keys(parsed).forEach((key) => {
      const value = parsed[key];
      if (typeof value === "string" && value) {
        (out as Record<string, string>)[key] = value;
      }
    });
    return out;
  } catch {
    return {};
  }
}

/** Merges newly uploaded images into the central brand image store. Throws on quota errors. */
export function saveBrandImages(patch: StoredBrandImages): void {
  if (typeof window === "undefined") return;
  const next: StoredBrandImages = { ...loadBrandImages(), ...patch };
  try {
    window.localStorage.setItem(BRAND_IMAGES_STORAGE_KEY, JSON.stringify(next));
  } catch {
    throw new Error(
      "Could not save the image — it is too large for browser storage. Please upload a smaller PNG/JPG/JPEG (max 2 MB)."
    );
  }
}

export function removeBrandImage(key: BrandImageKey): void {
  if (typeof window === "undefined") return;
  try {
    const next: StoredBrandImages = { ...loadBrandImages() };
    delete next[key];
    window.localStorage.setItem(BRAND_IMAGES_STORAGE_KEY, JSON.stringify(next));
  } catch {
    // ignore
  }
}

/* ==========================================================================
   BRAND CONFIGURATION
   ========================================================================== */

export interface BrandConfig {
  name: string;
  legal_name: string;
  arabic_name: string;
  trn: string;
  address: string;
  city: string;
  country: string;
  po_box: string;
  phone: string;
  mobile: string;
  email: string;
  website: string;
  currency: string;
  bank_name: string;
  bank_account_name: string;
  iban: string;
  swift_bic: string;
  /** SINGLE central logo size (px width) used by every printable document header.
   *  Height stays `auto`, so the real logo aspect ratio is always preserved. */
  logo_size: number;
  /** Centralized font size (px) for the Arabic company name on all printable document headers. */
  arabic_name_size: number;
  /** Central brand colors (see DEFAULT_BRAND_COLORS / Settings -> Brand Colors). */
  colors: BrandColors;
  assets: BrandAssets;
}

export const DEFAULT_BRAND_CONFIG: BrandConfig = {
  // Exact legal company name used on every printable document.
  name: "AL SAFWAH AL QABDHA TENTS IND L.L.C SP",
  legal_name: "AL SAFWAH AL QABDHA TENTS IND L.L.C SP",
  arabic_name: "الصفوه الذهبيه لصناعه الخيام ذ.م.م.ش.ش.و",
  trn: "100234567800003",
  address: "Al Quoz Industrial Area 3, Dubai, United Arab Emirates",
  city: "Dubai",
  country: "United Arab Emirates",
  po_box: "12345",
  phone: "+971 4 345 6789",
  mobile: "+971 50 123 4567",
  email: "info@dubai-erp.ae",
  website: "www.dubai-erp.ae",
  currency: "AED",
  bank_name: "Emirates NBD",
  bank_account_name: "AL SAFWAH AL QABDHA TENTS IND L.L.C SP",
  iban: "AE450260000123456789001",
  swift_bic: "EBILAEADXXX",
  logo_size: 130, // Balanced corporate logo width (px) for elegant A4 document headers
  arabic_name_size: 22, // Proportionate font size (px) for the Arabic company name
  colors: DEFAULT_BRAND_COLORS,
  assets: {
    logo: "/company-assets/logo.png",
    logoFallback: "/company-assets/logo.svg",
    background: "/company-assets/background.png",
    backgroundFallback: "/company-assets/background.svg",
    watermark: "/company-assets/watermark.png",
    watermarkFallback: "/company-assets/watermark.svg",
    // Real company stamp / authorized signature: EMPTY until a real image is uploaded.
    // Never generated — an empty string renders an empty image area.
    stamp: "",
    stampFallback: undefined,
    signature: "",
    signatureFallback: undefined,
    footer: "/company-assets/footer.png",
    footerGraphic: "/company-assets/footer-graphic.svg",
    illustration: "/company-assets/illustration.png",
    building: "",
  },
};

export type CompanyBrandInput = {
  name?: string | null;
  legal_name?: string | null;
  arabic_name?: string | null;
  trn?: string | null;
  address?: string | null;
  city?: string | null;
  country?: string | null;
  po_box?: string | null;
  phone?: string | null;
  mobile?: string | null;
  email?: string | null;
  website?: string | null;
  logo_url?: string | null;
  stamp_url?: string | null;
  signature_url?: string | null;
  background_url?: string | null;
  building_image_url?: string | null;
  footer_image_url?: string | null;
  bank_name?: string | null;
  bank_account_name?: string | null;
  bank_account_number?: string | null;
  iban?: string | null;
  bank_iban?: string | null;
  swift_bic?: string | null;
  bank_swift?: string | null;
  logo_size?: number | null;
  arabic_name_size?: number | null;
  brand_primary?: string | null;
  brand_accent?: string | null;
  brand_text?: string | null;
  brand_muted?: string | null;
  brand_border?: string | null;
  brand_table_header?: string | null;
  brand_total_highlight?: string | null;
};

/**
 * Merges dynamic company settings from Supabase with the central Brand Configuration.
 * If any DB property is empty or undefined, defaults gracefully to the central brand identity.
 *
 * Company settings are the source of truth. Central values are only fallbacks for
 * fields that have not been configured yet.
 */
export function getBrandConfig(company?: CompanyBrandInput | null): BrandConfig {
  if (!company) return DEFAULT_BRAND_CONFIG;

  return {
    name: company.name || company.legal_name || DEFAULT_BRAND_CONFIG.name,
    legal_name: company.legal_name || company.name || DEFAULT_BRAND_CONFIG.legal_name,
    arabic_name: company.arabic_name || DEFAULT_BRAND_CONFIG.arabic_name,
    trn: company.trn || DEFAULT_BRAND_CONFIG.trn,
    address: company.address || DEFAULT_BRAND_CONFIG.address,
    city: company.city || DEFAULT_BRAND_CONFIG.city,
    country: company.country || DEFAULT_BRAND_CONFIG.country,
    po_box: company.po_box || DEFAULT_BRAND_CONFIG.po_box,
    phone: company.phone || DEFAULT_BRAND_CONFIG.phone,
    mobile: company.mobile || DEFAULT_BRAND_CONFIG.mobile,
    email: company.email || DEFAULT_BRAND_CONFIG.email,
    website: company.website || DEFAULT_BRAND_CONFIG.website,
    currency: DEFAULT_BRAND_CONFIG.currency,
    bank_name: company.bank_name || DEFAULT_BRAND_CONFIG.bank_name,
    bank_account_name: company.bank_account_name || company.name || DEFAULT_BRAND_CONFIG.bank_account_name,
    iban: company.iban || company.bank_iban || DEFAULT_BRAND_CONFIG.iban,
    swift_bic: company.swift_bic || company.bank_swift || DEFAULT_BRAND_CONFIG.swift_bic,
    // Centralized logo size (px width) saved centrally per company branding, fallback to default 200px
    logo_size: company.logo_size && Number(company.logo_size) > 0 ? Number(company.logo_size) : DEFAULT_BRAND_CONFIG.logo_size,
    // Centralized Arabic company name size (px font size), fallback to default 30px
    arabic_name_size: company.arabic_name_size && Number(company.arabic_name_size) >= 18 ? Number(company.arabic_name_size) : DEFAULT_BRAND_CONFIG.arabic_name_size,
    colors: {
      ...DEFAULT_BRAND_COLORS,
      primary: company.brand_primary || DEFAULT_BRAND_COLORS.primary,
      accent: company.brand_accent || DEFAULT_BRAND_COLORS.accent,
      text: company.brand_text || DEFAULT_BRAND_COLORS.text,
      muted: company.brand_muted || DEFAULT_BRAND_COLORS.muted,
      border: company.brand_border || DEFAULT_BRAND_COLORS.border,
      tableHeader: company.brand_table_header || DEFAULT_BRAND_COLORS.tableHeader,
      totalHighlight: company.brand_total_highlight || DEFAULT_BRAND_COLORS.totalHighlight,
    },
    assets: {
      ...DEFAULT_BRAND_CONFIG.assets,
      logo: company.logo_url || DEFAULT_BRAND_CONFIG.assets.logo,
      background: company.background_url || DEFAULT_BRAND_CONFIG.assets.background,
      watermark: company.background_url || DEFAULT_BRAND_CONFIG.assets.watermark,
      building: company.building_image_url || DEFAULT_BRAND_CONFIG.assets.building,
      footer: company.footer_image_url || DEFAULT_BRAND_CONFIG.assets.footer,
      // Real uploaded stamp / signature only. No fallback graphic is ever generated.
      stamp: company.stamp_url || "",
      signature: company.signature_url || "",
    },
  };
}

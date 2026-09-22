"use client";

import React, { useState } from "react";
import { Building2 } from "lucide-react";
import { getBrandConfig } from "@/lib/brandConfig";

export type CompanyDocInfo = {
  id?: string | null;
  name?: string | null;
  legal_name?: string | null;
  arabic_name?: string | null;
  trn?: string | null;
  po_box?: string | null;
  phone?: string | null;
  mobile?: string | null;
  email?: string | null;
  website?: string | null;
  address?: string | null;
  city?: string | null;
  logo_url?: string | null;
  stamp_url?: string | null;
  signature_url?: string | null;
  bank_name?: string | null;
  bank_account_name?: string | null;
  iban?: string | null;
  swift_bic?: string | null;
  logo_size?: number | null;
  arabic_name_size?: number | null;
  // Brand colors (optional — read from DB if available)
  brand_primary?: string | null;
  brand_accent?: string | null;
  brand_text?: string | null;
  brand_muted?: string | null;
  brand_border?: string | null;
  brand_table_header?: string | null;
  brand_total_highlight?: string | null;
};

export type DocHeaderProps = {
  company: CompanyDocInfo | null;
  docTitle: string;
  docNumber?: string | null;
  docDate?: string | null;
  subTitle?: string;
  arabicTitle?: string;
  clientOrSupplierLabel?: string;
  clientOrSupplierName?: string;
};

export default function DocHeader({
  company,
  docTitle,
  docNumber,
  docDate,
  subTitle,
  arabicTitle,
  clientOrSupplierLabel,
  clientOrSupplierName,
}: DocHeaderProps) {
  const brand = getBrandConfig(company);
  const [logoSrc, setLogoSrc] = useState(brand.assets.logo);
  const [logoFailed, setLogoFailed] = useState(false);

  // ONE central config value (lib/brandConfig.ts -> logo_size) controls the logo width everywhere.
  // Height stays "auto", so the real logo PNG keeps its natural aspect ratio on screen and on A4 print.
  const logoSize = brand.logo_size;
  const logoWidthCss = typeof logoSize === "number" ? `${logoSize}px` : String(logoSize);

  // Centralized Arabic company name size (default 30px, 1.4–1.6x English name size)
  const arabicNameSize = brand.arabic_name_size || 30;
  const arabicSizeCss = typeof arabicNameSize === "number" ? `${arabicNameSize}px` : String(arabicNameSize);

  const primary = brand.colors.primary;
  const accent = brand.colors.accent;
  const muted = brand.colors.muted;

  return (
    <div
      className="print-doc-header w-full pb-3 mb-5"
      style={{ borderBottom: `2px solid ${primary}` }}
    >
      {/* Company Identity Block: large centered real logo, English name, Arabic name directly below */}
      <div className="print-doc-identity flex w-full flex-col items-center text-center">
        <div className="print-logo-container flex w-full items-center justify-center">
          {!logoFailed ? (
            /* Real <img> element (not a CSS background) so the actual logo PNG prints reliably on A4 */
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={logoSrc}
              alt={brand.legal_name || brand.name}
              width={typeof logoSize === "number" ? logoSize : undefined}
              className="print-doc-logo block max-w-full"
              style={{
                width: logoWidthCss,
                height: "auto", // preserve aspect ratio
                objectFit: "contain",
              }}
              onError={() => {
                if (brand.assets.logoFallback && logoSrc !== brand.assets.logoFallback) {
                  setLogoSrc(brand.assets.logoFallback);
                } else {
                  setLogoFailed(true);
                }
              }}
            />
          ) : (
            <div
              className="flex h-14 w-14 items-center justify-center rounded-lg border"
              style={{ borderColor: brand.colors.border, backgroundColor: "#f8fafc", color: primary }}
            >
              <Building2 size={28} />
            </div>
          )}
        </div>

        {/* English company name — dignified uppercase primary */}
        <h1
          className="mt-2 text-base sm:text-lg font-bold tracking-wide uppercase leading-tight text-center"
          style={{ color: primary }}
        >
          {brand.legal_name || brand.name}
        </h1>

        {/* Arabic company name directly below — visual focal point in gold accent, real selectable text */}
        <div
          className="mt-1 font-arabic font-bold text-center select-text"
          dir="rtl"
          style={{
            fontSize: arabicSizeCss,
            color: accent,
            lineHeight: 1.25,
            letterSpacing: "0.01em",
            fontFamily: "'Segoe UI Arabic', 'Amiri', 'Scheherazade New', 'Traditional Arabic', 'Noto Naskh Arabic', Arial, sans-serif",
          }}
        >
          {brand.arabic_name || "الصفوه الذهبيه لصناعه الخيام ذ.م.م.ش.ش.و"}
        </div>

        {/* Subtle, elegant, thin gold divider beneath Arabic name with minimal geometric accent */}
        <div className="mt-1.5 mb-1 flex items-center justify-center gap-2" aria-hidden="true">
          <span className="h-[1px] w-14" style={{ backgroundColor: accent, opacity: 0.85 }} />
          <span className="h-1.5 w-1.5 rotate-45" style={{ backgroundColor: accent }} />
          <span className="h-[1px] w-14" style={{ backgroundColor: accent, opacity: 0.85 }} />
        </div>

        <div className="mt-1.5 text-[11px] leading-tight space-y-0.5" style={{ color: muted }}>
          <p>{brand.address}</p>
          <p className="font-semibold" style={{ color: brand.colors.text }}>
            TRN (الرقم الضريبي):{" "}
            <span className="font-mono font-bold" style={{ color: primary }}>{brand.trn}</span>
          </p>
        </div>
      </div>

      {/* Reusable Contact Strip */}
      <div
        className="mt-2.5 flex flex-wrap items-center justify-between py-1 text-[10px] font-medium"
        style={{
          borderTop: `1px solid ${brand.colors.border}`,
          borderBottom: `1px solid ${brand.colors.border}`,
          color: muted,
        }}
      >
        {brand.po_box && <span>P.O. Box: {brand.po_box}</span>}
        {brand.phone && <span>Tel: {brand.phone}</span>}
        {brand.mobile && <span>Mob: {brand.mobile}</span>}
        {brand.email && <span>Email: {brand.email}</span>}
        {brand.website && <span>Web: {brand.website}</span>}
      </div>

      {/* Document Title Banner — Navy primary background, gold accent text */}
      <div
        className="mt-3 flex items-center justify-between px-4 py-2 rounded"
        style={{ backgroundColor: primary, color: "#ffffff" }}
      >
        <div>
          <div className="flex items-center gap-3">
            <h2 className="text-base font-extrabold uppercase tracking-wider">
              {docTitle}
            </h2>
            {arabicTitle && (
              <span className="text-sm font-semibold font-arabic" dir="rtl" style={{ color: "#e2e8f0" }}>
                {arabicTitle}
              </span>
            )}
          </div>
          {subTitle && <p className="text-[11px] mt-0.5" style={{ color: "#cbd5e1" }}>{subTitle}</p>}
          {clientOrSupplierName && (
            <p className="text-[10px] mt-0.5 font-medium" style={{ color: accent }}>
              {clientOrSupplierLabel || "Party"}: {clientOrSupplierName}
            </p>
          )}
        </div>

        <div className="text-right">
          {docNumber && (
            <div className="text-xs font-mono font-bold tracking-wider">
              REF: <span style={{ color: accent }}>{docNumber}</span>
            </div>
          )}
          {docDate && (
            <div className="text-[11px] mt-0.5" style={{ color: "#cbd5e1" }}>
              DATE: {new Date(docDate).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

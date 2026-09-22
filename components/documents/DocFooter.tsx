"use client";

import React, { useState } from "react";
import Image from "next/image";
import { getBrandConfig, CompanyBrandInput } from "@/lib/brandConfig";

export type CompanyBankInfo = {
  bank_name?: string | null;
  bank_account_name?: string | null;
  iban?: string | null;
  swift_bic?: string | null;
  name?: string | null;
  website?: string | null;
  email?: string | null;
  phone?: string | null;
  mobile?: string | null;
};

type DocFooterProps = {
  bankInfo?: CompanyBankInfo | null;
  company?: CompanyBrandInput | null;
  showBankDetails?: boolean;
  notes?: string;
  customText?: string;
  showFooterGraphic?: boolean;
  footerImageUrl?: string;
};

export default function DocFooter({
  bankInfo,
  company,
  showBankDetails = false,
  notes,
  customText,
  showFooterGraphic = true,
  footerImageUrl,
}: DocFooterProps) {
  const brand = getBrandConfig(company || bankInfo);
  const activeBank = bankInfo || company;
  const [graphicFailed, setGraphicFailed] = useState(false);
  const footerImg = footerImageUrl || brand.assets.footer || brand.assets.footerGraphic;

  return (
    <div className="mt-8 pt-4 border-t border-slate-300 text-[10px] text-slate-500 avoid-break">
      {/* Optional Bank Coordinates for Invoices/Quotations */}
      {showBankDetails && (
        <div className="mb-4 rounded border border-slate-200 bg-slate-50/80 p-2.5 text-slate-700">
          <div className="font-bold text-slate-900 uppercase text-[11px] mb-1">
            Bank Account Details for Payment (تفاصيل الحساب البنكي للسداد):
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[10px]">
            <div>
              <span className="text-slate-500 block">Bank Name:</span>
              <span className="font-semibold">{activeBank?.bank_name || brand.bank_name}</span>
            </div>
            <div>
              <span className="text-slate-500 block">Account Title:</span>
              <span className="font-semibold">{activeBank?.bank_account_name || brand.bank_account_name}</span>
            </div>
            <div className="col-span-2">
              <span className="text-slate-500 block">IBAN Number:</span>
              <span className="font-mono font-bold text-slate-900 tracking-wider">
                {activeBank?.iban || brand.iban}
              </span>
              {(activeBank?.swift_bic || brand.swift_bic) && (
                <span className="text-slate-500 ml-2 font-normal font-sans">
                  (SWIFT: {activeBank?.swift_bic || brand.swift_bic})
                </span>
              )}
            </div>
          </div>
        </div>
      )}

      {notes && (
        <div className="mb-3 text-slate-600">
          <span className="font-bold text-slate-800">Remarks / Terms: </span>
          {notes}
        </div>
      )}

      {/* Reusable Footer Graphic / Ribbon */}
      {showFooterGraphic && !graphicFailed && (
        <div className="relative w-full h-4 mb-2 overflow-hidden">
          <Image
            src={footerImg}
            alt="Branding accent"
            fill
            className="object-contain object-center"
            unoptimized
            onError={() => setGraphicFailed(true)}
          />
        </div>
      )}

      {/* Global Enterprise Document Disclaimer & Multi-channel Contact Strip */}
      <div className="flex flex-col sm:flex-row items-center justify-between border-t border-slate-200 pt-2 text-[9px] text-slate-400 gap-1">
        <div>
          {customText || "This is a computer-generated document from Dubai ERP system."}
        </div>
        <div className="flex items-center gap-3 text-slate-500 font-medium">
          {brand.phone && <span>Tel: {brand.phone}</span>}
          {brand.email && <span>Email: {brand.email}</span>}
          {brand.website && <span>Web: {brand.website}</span>}
          <span>{brand.city}, {brand.country}</span>
        </div>
      </div>
    </div>
  );
}

"use client";

import React, { useState } from "react";
import Image from "next/image";

interface StampProps {
  src?: string;
  alt?: string;
  className?: string;
  size?: number;
}

/**
 * Renders the REAL uploaded company stamp image only.
 * If no real stamp image exists (src empty) or loading fails, the area stays
 * completely empty — a stamp is NEVER generated or faked.
 */
export function CompanyStamp({
  src,
  alt = "Official Company Stamp",
  className = "",
  size = 96,
}: StampProps) {
  const [hasError, setHasError] = useState(false);

  if (!src || hasError) {
    return null;
  }

  return (
    <div
      className={`relative inline-flex items-center justify-center select-none pointer-events-none ${className}`}
      style={{ width: size, height: size }}
    >
      <Image
        src={src}
        alt={alt}
        width={size}
        height={size}
        className="object-contain drop-shadow-sm"
        unoptimized
        onError={() => setHasError(true)}
      />
    </div>
  );
}

interface SignatureProps {
  src?: string;
  alt?: string;
  name?: string;
  title?: string;
  date?: string;
  className?: string;
  /** Hide the printed name/title/date caption block (the image area still renders). */
  showLabel?: boolean;
  width?: number;
  height?: number;
}

/**
 * Renders the REAL uploaded authorized signature image only.
 * If no real signature image exists, the signature area stays empty —
 * a signature is NEVER generated or faked.
 */
export function AuthorizedSignature({
  src,
  alt = "Authorized Signature",
  name,
  title = "Authorized Signatory",
  date,
  className = "",
  showLabel = true,
  width = 110,
  height = 42,
}: SignatureProps) {
  const [hasError, setHasError] = useState(false);

  return (
    <div className={`flex flex-col items-center justify-end text-center ${className}`}>
      {/* Real uploaded signature image layer: ONLY if real URL exists and loads cleanly. Otherwise completely blank. */}
      <div
        className="relative pointer-events-none select-none flex items-center justify-center"
        style={{ width, height }}
      >
        {src && !hasError ? (
          <Image
            src={src}
            alt={alt}
            width={width}
            height={height}
            className="object-contain max-h-full max-w-full"
            unoptimized
            onError={() => setHasError(true)}
          />
        ) : null}
      </div>
      {showLabel && (
        <div className="w-full border-t border-slate-400 pt-1 text-[10px] text-slate-700">
          {name && <div className="font-bold text-slate-900">{name}</div>}
          {title && <div className="text-slate-500">{title}</div>}
          {date && <div className="text-[9px] text-slate-400">{date}</div>}
        </div>
      )}
    </div>
  );
}

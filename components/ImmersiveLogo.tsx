"use client";

import React, { useEffect, useState } from "react";

interface ImmersiveLogoProps {
  src?: string | null;
  alt?: string;
  fallbackText?: string;
  className?: string;
  imgClassName?: string;
}

/**
 * ImmersiveLogo:
 * Renders company logos immersively with zero borders.
 * If the source image has a stark white/near-white bounding background (common in unclipped JPEGs),
 * it seamlessly removes the white background on canvas so the logo mark floats naturally and immersively
 * directly over dark navy ERP headers and backgrounds without ugly rectangular white stamps or borders.
 */
export default function ImmersiveLogo({
  src,
  alt = "Company Logo",
  fallbackText = "DXB",
  className = "",
  imgClassName = "",
}: ImmersiveLogoProps) {
  const [processedSrc, setProcessedSrc] = useState<string | null>(null);

  useEffect(() => {
    if (!src) return;

    let isMounted = true;
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      try {
        const canvas = document.createElement("canvas");
        const w = img.naturalWidth || img.width;
        const h = img.naturalHeight || img.height;
        canvas.width = w;
        canvas.height = h;

        const ctx = canvas.getContext("2d", { willReadFrequently: true });
        if (!ctx) {
          if (isMounted) setProcessedSrc(src);
          return;
        }

        ctx.drawImage(img, 0, 0);
        const imgData = ctx.getImageData(0, 0, w, h);
        const data = imgData.data;

        // Sample the 4 corners to check if the background is solid white/near-white
        const corners = [
          0,
          (w - 1) * 4,
          (h - 1) * w * 4,
          ((h - 1) * w + (w - 1)) * 4,
        ];

        const isWhiteBackground = corners.some((idx) => {
          const r = data[idx];
          const g = data[idx + 1];
          const b = data[idx + 2];
          const a = data[idx + 3];
          return a > 180 && r > 230 && g > 230 && b > 230;
        });

        if (isWhiteBackground) {
          // Feather and remove near-white background pixels cleanly
          for (let i = 0; i < data.length; i += 4) {
            const r = data[i];
            const g = data[i + 1];
            const b = data[i + 2];
            const a = data[i + 3];

            if (a > 0 && r > 225 && g > 225 && b > 225) {
              const minVal = Math.min(r, g, b);
              if (minVal >= 245) {
                data[i + 3] = 0;
              } else {
                // Smooth anti-aliased edge transition for pixels between 225 and 245
                const factor = (245 - minVal) / 20;
                data[i + 3] = Math.round(a * Math.max(0, Math.min(1, factor)));
              }
            }
          }
          ctx.putImageData(imgData, 0, 0);
          if (isMounted) {
            setProcessedSrc(canvas.toDataURL("image/png"));
          }
        } else {
          if (isMounted) setProcessedSrc(src);
        }
      } catch {
        // Fallback gracefully to original source if canvas export is restricted by CORS
        if (isMounted) setProcessedSrc(src);
      }
    };
    img.onerror = () => {
      if (isMounted) setProcessedSrc(src);
    };
    img.src = src;

    return () => {
      isMounted = false;
    };
  }, [src]);

  return (
    <div
      className={`flex items-center justify-center border-0 ring-0 outline-none select-none bg-transparent ${className}`}
    >
      {processedSrc ? (
        /* eslint-disable-next-line @next/next/no-img-element */
        <img
          src={processedSrc}
          alt={alt}
          className={`max-h-full max-w-full object-contain border-0 ring-0 outline-none drop-shadow-md transition-all ${imgClassName}`}
        />
      ) : src ? (
        /* eslint-disable-next-line @next/next/no-img-element */
        <img
          src={src}
          alt={alt}
          className={`max-h-full max-w-full object-contain border-0 ring-0 outline-none drop-shadow-md transition-all ${imgClassName}`}
        />
      ) : (
        <div className="w-full h-full rounded-xl bg-gradient-to-br from-emerald-500 to-teal-700 text-white font-black text-sm md:text-base flex items-center justify-center border-0 ring-0 shadow-sm">
          {fallbackText}
        </div>
      )}
    </div>
  );
}

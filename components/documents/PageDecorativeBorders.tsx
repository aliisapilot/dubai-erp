"use client";

import React from "react";
import {
  DocumentLayout,
  LayoutElement,
  PageDecorativeBorder,
  PageBorderSettings,
  normalizePageBorders,
} from "@/lib/documentDesigner";

interface PageDecorativeBordersProps {
  layout?: DocumentLayout;
  borders?: PageBorderSettings;
  isDesignerPreview?: boolean;
  elements?: LayoutElement[];
}

/**
 * Calculates safe clearance bounds so decorative borders physically cannot
 * collide with or overlap the company logo, header details, document content, or footer.
 */
export function calculateBorderClearances(
  layout?: DocumentLayout,
  elements?: LayoutElement[]
) {
  const visibleElements = (elements || layout?.elements || []).filter(
    (el) => el && el.visible && el.type !== "watermark"
  );

  // Top content threshold (logo, company name, address, title)
  const topElements = visibleElements.filter((el) => {
    const y = Number.isFinite((el as unknown as { effectiveY?: number }).effectiveY)
      ? (el as unknown as { effectiveY?: number }).effectiveY!
      : el.y;
    return Number.isFinite(y) && y < 90;
  });
  const minContentY =
    topElements.length > 0
      ? Math.min(
          ...topElements.map((el) => {
            const y = Number.isFinite((el as unknown as { effectiveY?: number }).effectiveY)
              ? (el as unknown as { effectiveY?: number }).effectiveY!
              : el.y;
            return y;
          })
        )
      : layout?.page?.margins?.top ?? 12;

  // Safe buffer above top content (at least 1.5mm)
  const safeTopLimitMm = Math.max(3, minContentY - 1.5);

  const pageHeight = layout?.page?.heightMm ?? 297;
  // Bottom content threshold (footer, signature, stamps, totals, bank details)
  const bottomElements = visibleElements.filter((el) => {
    const y = Number.isFinite((el as unknown as { effectiveY?: number }).effectiveY)
      ? (el as unknown as { effectiveY?: number }).effectiveY!
      : el.y;
    const h = Number.isFinite((el as unknown as { effectiveHeight?: number }).effectiveHeight)
      ? (el as unknown as { effectiveHeight?: number }).effectiveHeight!
      : el.height;
    return Number.isFinite(y) && Number.isFinite(h) && y + h > 180;
  });
  const maxContentY =
    bottomElements.length > 0
      ? Math.max(
          ...bottomElements.map((el) => {
            const y = Number.isFinite((el as unknown as { effectiveY?: number }).effectiveY)
              ? (el as unknown as { effectiveY?: number }).effectiveY!
              : el.y;
            const h = Number.isFinite((el as unknown as { effectiveHeight?: number }).effectiveHeight)
              ? (el as unknown as { effectiveHeight?: number }).effectiveHeight!
              : el.height;
            return y + h;
          })
        )
      : pageHeight - (layout?.page?.margins?.bottom ?? 12);

  // Safe buffer below bottom content (at least 1.5mm)
  const safeBottomLimitMm = Math.min(pageHeight - 3, maxContentY + 1.5);

  return {
    minContentY,
    safeTopLimitMm,
    maxContentY,
    safeBottomLimitMm,
  };
}

export default function PageDecorativeBorders({
  layout,
  borders: directBorders,
  elements,
}: PageDecorativeBordersProps) {
  const borders = normalizePageBorders(directBorders || layout?.page?.borders);
  const { top, bottom } = borders;

  if (!top.enabled && !bottom.enabled) {
    return null;
  }

  const pageWidth = layout?.page?.widthMm || 210;
  const pageHeight = layout?.page?.heightMm || 297;

  const { safeTopLimitMm, safeBottomLimitMm } = calculateBorderClearances(layout, elements);

  // Clamp top border so its lowest edge NEVER penetrates safeTopLimitMm
  const rawTopPos = Math.max(0, top.position || 0);
  const clampedTopPos = Math.min(rawTopPos, Math.max(0, safeTopLimitMm - 1));
  const maxAllowedTopThickness = Math.max(0.5, safeTopLimitMm - clampedTopPos);
  const effectiveTopThickness = Math.min(Math.max(0.5, top.thickness || 4), maxAllowedTopThickness);

  // Clamp bottom border so its highest edge NEVER penetrates safeBottomLimitMm
  const rawBottomPos = Math.max(0, bottom.position || 0);
  const clampedBottomPos = Math.min(rawBottomPos, Math.max(0, pageHeight - safeBottomLimitMm - 1));
  const maxAllowedBottomThickness = Math.max(0.5, pageHeight - clampedBottomPos - safeBottomLimitMm);
  const effectiveBottomThickness = Math.min(
    Math.max(0.5, bottom.thickness || 4),
    maxAllowedBottomThickness
  );

  return (
    <div
      className="page-decorative-borders-container absolute inset-0 pointer-events-none select-none z-[30] overflow-hidden"
      style={{
        width: `${pageWidth}mm`,
        height: `${pageHeight}mm`,
        WebkitPrintColorAdjust: "exact",
        printColorAdjust: "exact",
      }}
      aria-hidden="true"
    >
      {/* 1. Universal CSS Border Strokes (Guaranteed to print under ALL browser settings and paper destinations) */}
      {top.enabled && top.style === "straight" && (top.angle || 0) === 0 && (
        <div
          className="print-border-stripe-top"
          style={{
            position: "absolute",
            top: `${clampedTopPos}mm`,
            left: 0,
            width: `${pageWidth}mm`,
            height: 0,
            borderTop: `${effectiveTopThickness}mm solid ${top.color || "#E0AC23"}`,
            opacity: top.opacity ?? 1,
            WebkitPrintColorAdjust: "exact",
            printColorAdjust: "exact",
          }}
        />
      )}
      {bottom.enabled && bottom.style === "straight" && (bottom.angle || 0) === 0 && (
        <div
          className="print-border-stripe-bottom"
          style={{
            position: "absolute",
            bottom: `${clampedBottomPos}mm`,
            left: 0,
            width: `${pageWidth}mm`,
            height: 0,
            borderBottom: `${effectiveBottomThickness}mm solid ${bottom.color || "#173C64"}`,
            opacity: bottom.opacity ?? 1,
            WebkitPrintColorAdjust: "exact",
            printColorAdjust: "exact",
          }}
        />
      )}

      {/* 2. Full Vector SVG Layer */}
      <svg
        className="page-decorative-borders-svg w-full h-full block"
        width={`${pageWidth}mm`}
        height={`${pageHeight}mm`}
        viewBox={`0 0 ${pageWidth} ${pageHeight}`}
        preserveAspectRatio="none"
        xmlns="http://www.w3.org/2000/svg"
        style={{
          width: `${pageWidth}mm`,
          height: `${pageHeight}mm`,
          display: "block",
          WebkitPrintColorAdjust: "exact",
          printColorAdjust: "exact",
        }}
      >
        <defs>
          {/* Subtle gradient for depth if needed */}
          <linearGradient id="goldAccentGrad" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#C8961D" />
            <stop offset="50%" stopColor="#E0AC23" />
            <stop offset="100%" stopColor="#F5D061" />
          </linearGradient>
          <linearGradient id="navyAccentGrad" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#0F2844" />
            <stop offset="50%" stopColor="#173C64" />
            <stop offset="100%" stopColor="#255A94" />
          </linearGradient>
        </defs>

        {/* ── TOP BORDER ──────────────────────────────────────────────────────── */}
        {top.enabled && (
          <TopBorderRenderer
            border={top}
            pageWidth={pageWidth}
            positionY={clampedTopPos}
            thickness={effectiveTopThickness}
            maxAllowedBottomY={safeTopLimitMm}
          />
        )}

        {/* ── BOTTOM BORDER ───────────────────────────────────────────────────── */}
        {bottom.enabled && (
          <BottomBorderRenderer
            border={bottom}
            pageWidth={pageWidth}
            pageHeight={pageHeight}
            positionFromBottom={clampedBottomPos}
            thickness={effectiveBottomThickness}
            minAllowedTopY={safeBottomLimitMm}
          />
        )}
      </svg>
    </div>
  );
}

// ── Top Border Renderer ────────────────────────────────────────────────────────
function TopBorderRenderer({
  border,
  pageWidth,
  positionY,
  thickness,
  maxAllowedBottomY,
}: {
  border: PageDecorativeBorder;
  pageWidth: number;
  positionY: number;
  thickness: number;
  maxAllowedBottomY: number;
}) {
  const color = border.color || "#E0AC23";
  const opacity = border.opacity ?? 1;
  const angle = border.angle || 0;
  const secondary = border.secondaryColor || (color === "#E0AC23" ? "#173C64" : "#E0AC23");

  const fillStyle: React.CSSProperties = {
    fill: color,
    stroke: color,
    strokeWidth: "0.5px",
    WebkitPrintColorAdjust: "exact",
    printColorAdjust: "exact",
  };
  const secondaryFillStyle: React.CSSProperties = {
    fill: secondary,
    stroke: secondary,
    strokeWidth: "0.5px",
    WebkitPrintColorAdjust: "exact",
    printColorAdjust: "exact",
  };
  const lineStyle: React.CSSProperties = {
    stroke: secondary,
    strokeWidth: 0.6,
    WebkitPrintColorAdjust: "exact",
    printColorAdjust: "exact",
  };

  switch (border.style) {
    case "straight": {
      if (angle === 0) {
        return (
          <g opacity={opacity}>
            {/* Main solid border bar */}
            <rect
              x={0}
              y={positionY}
              width={pageWidth}
              height={thickness}
              fill={color}
              stroke={color}
              strokeWidth={0.5}
              style={fillStyle}
            />
            {/* Subtle luxury accent hairline at bottom edge */}
            {thickness > 2 && (
              <line
                x1={0}
                y1={positionY + thickness}
                x2={pageWidth}
                y2={positionY + thickness}
                stroke={secondary}
                strokeWidth={0.6}
                opacity={0.8}
                style={lineStyle}
              />
            )}
          </g>
        );
      }

      // Angled straight bar
      const centerY = positionY + thickness / 2;
      return (
        <g opacity={opacity} transform={`rotate(${angle} ${pageWidth / 2} ${centerY})`}>
          <rect
            x={-30}
            y={positionY}
            width={pageWidth + 60}
            height={thickness}
            fill={color}
            style={fillStyle}
          />
          {thickness > 2 && (
            <line
              x1={-30}
              y1={positionY + thickness}
              x2={pageWidth + 60}
              y2={positionY + thickness}
              stroke={secondary}
              strokeWidth={0.6}
              opacity={0.8}
              style={lineStyle}
            />
          )}
        </g>
      );
    }

    case "diagonal": {
      // Dynamic geometric trapezoid slant across top
      const rad = ((angle || 14) * Math.PI) / 180;
      const slantDelta = Math.sin(rad) * (pageWidth / 2);
      const leftY = Math.max(0, Math.min(maxAllowedBottomY - 0.5, positionY + thickness - slantDelta));
      const rightY = Math.max(0, Math.min(maxAllowedBottomY - 0.5, positionY + thickness + slantDelta));

      return (
        <g opacity={opacity}>
          {/* Main diagonal geometric banner */}
          <polygon
            points={`0,0 ${pageWidth},0 ${pageWidth},${rightY} 0,${leftY}`}
            fill={color}
            style={fillStyle}
          />
          {/* Accent secondary slash */}
          <polygon
            points={`0,${leftY} ${pageWidth},${rightY} ${pageWidth},${Math.min(maxAllowedBottomY, rightY + 1.2)} 0,${Math.min(maxAllowedBottomY, leftY + 1.2)}`}
            fill={secondary}
            opacity={0.9}
            style={secondaryFillStyle}
          />
        </g>
      );
    }

    case "custom": {
      const subtype = border.customSubtype || "geometric_ribbon";

      if (subtype === "accent_corner") {
        // Luxury executive corner brackets
        const cornerW = Math.min(65, pageWidth * 0.32);
        return (
          <g opacity={opacity}>
            {/* Top Left Bracket */}
            <polygon
              points={`0,0 ${cornerW},0 ${cornerW - 12},${thickness} 0,${thickness}`}
              fill={color}
              style={fillStyle}
            />
            <polygon
              points={`0,0 ${thickness},0 ${thickness},${cornerW - 12} 0,${cornerW}`}
              fill={color}
              style={fillStyle}
            />
            {/* Top Right Bracket */}
            <polygon
              points={`${pageWidth},0 ${pageWidth - cornerW},0 ${pageWidth - cornerW + 12},${thickness} ${pageWidth},${thickness}`}
              fill={color}
              style={fillStyle}
            />
            <polygon
              points={`${pageWidth},0 ${pageWidth - thickness},0 ${pageWidth - thickness},${cornerW - 12} ${pageWidth},${cornerW}`}
              fill={color}
              style={fillStyle}
            />
            {/* Center connecting hairline */}
            <line
              x1={cornerW}
              y1={positionY + thickness / 2}
              x2={pageWidth - cornerW}
              y2={positionY + thickness / 2}
              stroke={secondary}
              strokeWidth={0.8}
              strokeDasharray="4 2"
              opacity={0.7}
              style={{ ...lineStyle, strokeWidth: 0.8 }}
            />
          </g>
        );
      }

      if (subtype === "double_stripe") {
        // Dual executive rules
        const primaryH = thickness * 0.65;
        const gap = 1.2;
        const secondH = Math.max(0.5, thickness * 0.25);
        return (
          <g opacity={opacity} transform={angle ? `rotate(${angle} ${pageWidth / 2} ${positionY + thickness / 2})` : undefined}>
            <rect x={0} y={positionY} width={pageWidth} height={primaryH} fill={color} style={fillStyle} />
            <rect x={0} y={positionY + primaryH + gap} width={pageWidth} height={secondH} fill={secondary} style={secondaryFillStyle} />
          </g>
        );
      }

      if (subtype === "wave") {
        // Smooth architectural corporate wave
        const waveH = thickness;
        const cp1X = pageWidth * 0.35;
        const cp2X = pageWidth * 0.65;
        const amp = Math.min(4, waveH * 0.5);
        return (
          <g opacity={opacity}>
            <path
              d={`M 0,0 L ${pageWidth},0 L ${pageWidth},${positionY + waveH - amp} C ${cp2X},${positionY + waveH + amp} ${cp1X},${positionY + waveH - amp} 0,${positionY + waveH} Z`}
              fill={color}
              style={fillStyle}
            />
            <path
              d={`M 0,${positionY + waveH} C ${cp1X},${positionY + waveH - amp} ${cp2X},${positionY + waveH + amp} ${pageWidth},${positionY + waveH - amp}`}
              fill="none"
              stroke={secondary}
              strokeWidth={0.8}
              opacity={0.85}
              style={{ stroke: secondary, strokeWidth: 0.8, WebkitPrintColorAdjust: "exact", printColorAdjust: "exact" }}
            />
          </g>
        );
      }

      if (subtype === "custom_path" && border.customSvgPath) {
        return (
          <g opacity={opacity} transform={`translate(0, ${positionY}) scale(${pageWidth / 210})`}>
            <path d={border.customSvgPath} fill={color} style={fillStyle} />
          </g>
        );
      }

      // Default custom: Geometric Layered Corporate Ribbon
      const splitX = pageWidth * 0.62;
      return (
        <g opacity={opacity}>
          {/* Main primary ribbon section */}
          <polygon
            points={`0,0 ${splitX + 15},0 ${splitX - 10},${positionY + thickness} 0,${positionY + thickness}`}
            fill={color}
            style={fillStyle}
          />
          {/* Secondary contrast diamond facet */}
          <polygon
            points={`${splitX + 15},0 ${pageWidth},0 ${pageWidth},${positionY + thickness * 0.75} ${splitX - 10},${positionY + thickness}`}
            fill={secondary}
            opacity={0.95}
            style={secondaryFillStyle}
          />
          {/* Thin metallic accent line along base */}
          <line
            x1={0}
            y1={positionY + thickness}
            x2={pageWidth}
            y2={positionY + thickness * 0.75}
            stroke={color}
            strokeWidth={0.7}
            style={{ stroke: color, strokeWidth: 0.7, WebkitPrintColorAdjust: "exact", printColorAdjust: "exact" }}
          />
        </g>
      );
    }

    default:
      return (
        <rect
          x={0}
          y={positionY}
          width={pageWidth}
          height={thickness}
          fill={color}
          opacity={opacity}
          style={fillStyle}
        />
      );
  }
}

// ── Bottom Border Renderer ─────────────────────────────────────────────────────
function BottomBorderRenderer({
  border,
  pageWidth,
  pageHeight,
  positionFromBottom,
  thickness,
  minAllowedTopY,
}: {
  border: PageDecorativeBorder;
  pageWidth: number;
  pageHeight: number;
  positionFromBottom: number;
  thickness: number;
  minAllowedTopY: number;
}) {
  const color = border.color || "#173C64";
  const opacity = border.opacity ?? 1;
  const angle = border.angle || 0;
  const secondary = border.secondaryColor || (color === "#173C64" ? "#E0AC23" : "#173C64");

  const startY = Math.max(minAllowedTopY, pageHeight - positionFromBottom - thickness);
  const actualHeight = Math.min(thickness, pageHeight - startY);

  const fillStyle: React.CSSProperties = {
    fill: color,
    stroke: color,
    strokeWidth: "0.5px",
    WebkitPrintColorAdjust: "exact",
    printColorAdjust: "exact",
  };
  const secondaryFillStyle: React.CSSProperties = {
    fill: secondary,
    stroke: secondary,
    strokeWidth: "0.5px",
    WebkitPrintColorAdjust: "exact",
    printColorAdjust: "exact",
  };
  const lineStyle: React.CSSProperties = {
    stroke: secondary,
    strokeWidth: 0.6,
    WebkitPrintColorAdjust: "exact",
    printColorAdjust: "exact",
  };

  switch (border.style) {
    case "straight": {
      if (angle === 0) {
        return (
          <g opacity={opacity}>
            {/* Main solid bottom bar */}
            <rect
              x={0}
              y={startY}
              width={pageWidth}
              height={actualHeight}
              fill={color}
              stroke={color}
              strokeWidth={0.5}
              style={fillStyle}
            />
            {/* Contrasting top accent rule */}
            {actualHeight > 2 && (
              <line
                x1={0}
                y1={startY}
                x2={pageWidth}
                y2={startY}
                stroke={secondary}
                strokeWidth={0.6}
                opacity={0.8}
                style={lineStyle}
              />
            )}
          </g>
        );
      }

      // Angled straight bar
      const centerY = startY + actualHeight / 2;
      return (
        <g opacity={opacity} transform={`rotate(${angle} ${pageWidth / 2} ${centerY})`}>
          <rect
            x={-30}
            y={startY}
            width={pageWidth + 60}
            height={actualHeight}
            fill={color}
            style={fillStyle}
          />
          {actualHeight > 2 && (
            <line
              x1={-30}
              y1={startY}
              x2={pageWidth + 60}
              y2={startY}
              stroke={secondary}
              strokeWidth={0.6}
              opacity={0.8}
              style={lineStyle}
            />
          )}
        </g>
      );
    }

    case "diagonal": {
      const rad = ((angle || 12) * Math.PI) / 180;
      const slantDelta = Math.sin(rad) * (pageWidth / 2);
      const leftY = Math.min(pageHeight, Math.max(minAllowedTopY + 0.5, startY + slantDelta));
      const rightY = Math.min(pageHeight, Math.max(minAllowedTopY + 0.5, startY - slantDelta));

      return (
        <g opacity={opacity}>
          {/* Accent secondary slash */}
          <polygon
            points={`0,${Math.max(minAllowedTopY, leftY - 1.2)} ${pageWidth},${Math.max(minAllowedTopY, rightY - 1.2)} ${pageWidth},${rightY} 0,${leftY}`}
            fill={secondary}
            opacity={0.9}
            style={secondaryFillStyle}
          />
          {/* Main bottom angled banner */}
          <polygon
            points={`0,${leftY} ${pageWidth},${rightY} ${pageWidth},${pageHeight} 0,${pageHeight}`}
            fill={color}
            style={fillStyle}
          />
        </g>
      );
    }

    case "custom": {
      const subtype = border.customSubtype || "geometric_ribbon";

      if (subtype === "accent_corner") {
        const cornerW = Math.min(65, pageWidth * 0.32);
        return (
          <g opacity={opacity}>
            {/* Bottom Left Bracket */}
            <polygon
              points={`0,${pageHeight} ${cornerW},${pageHeight} ${cornerW - 12},${pageHeight - actualHeight} 0,${pageHeight - actualHeight}`}
              fill={color}
              style={fillStyle}
            />
            <polygon
              points={`0,${pageHeight} ${actualHeight},${pageHeight} ${actualHeight},${pageHeight - cornerW + 12} 0,${pageHeight - cornerW}`}
              fill={color}
              style={fillStyle}
            />
            {/* Bottom Right Bracket */}
            <polygon
              points={`${pageWidth},${pageHeight} ${pageWidth - cornerW},${pageHeight} ${pageWidth - cornerW + 12},${pageHeight - actualHeight} ${pageWidth},${pageHeight - actualHeight}`}
              fill={color}
              style={fillStyle}
            />
            <polygon
              points={`${pageWidth},${pageHeight} ${pageWidth - actualHeight},${pageHeight} ${pageWidth - actualHeight},${pageHeight - cornerW + 12} ${pageWidth},${pageHeight - cornerW}`}
              fill={color}
              style={fillStyle}
            />
            {/* Center connecting hairline */}
            <line
              x1={cornerW}
              y1={startY + actualHeight / 2}
              x2={pageWidth - cornerW}
              y2={startY + actualHeight / 2}
              stroke={secondary}
              strokeWidth={0.8}
              strokeDasharray="4 2"
              opacity={0.7}
              style={{ ...lineStyle, strokeWidth: 0.8 }}
            />
          </g>
        );
      }

      if (subtype === "double_stripe") {
        const primaryH = actualHeight * 0.65;
        const gap = 1.2;
        const secondH = Math.max(0.5, actualHeight * 0.25);
        return (
          <g opacity={opacity} transform={angle ? `rotate(${angle} ${pageWidth / 2} ${startY + actualHeight / 2})` : undefined}>
            <rect x={0} y={startY} width={pageWidth} height={secondH} fill={secondary} style={secondaryFillStyle} />
            <rect x={0} y={startY + secondH + gap} width={pageWidth} height={primaryH} fill={color} style={fillStyle} />
          </g>
        );
      }

      if (subtype === "wave") {
        const waveH = actualHeight;
        const cp1X = pageWidth * 0.35;
        const cp2X = pageWidth * 0.65;
        const amp = Math.min(4, waveH * 0.5);
        return (
          <g opacity={opacity}>
            <path
              d={`M 0,${pageHeight} L ${pageWidth},${pageHeight} L ${pageWidth},${startY + amp} C ${cp2X},${startY - amp} ${cp1X},${startY + amp} 0,${startY} Z`}
              fill={color}
              style={fillStyle}
            />
            <path
              d={`M 0,${startY} C ${cp1X},${startY + amp} ${cp2X},${startY - amp} ${pageWidth},${startY + amp}`}
              fill="none"
              stroke={secondary}
              strokeWidth={0.8}
              opacity={0.85}
              style={{ stroke: secondary, strokeWidth: 0.8, WebkitPrintColorAdjust: "exact", printColorAdjust: "exact" }}
            />
          </g>
        );
      }

      if (subtype === "custom_path" && border.customSvgPath) {
        return (
          <g opacity={opacity} transform={`translate(0, ${startY}) scale(${pageWidth / 210})`}>
            <path d={border.customSvgPath} fill={color} style={fillStyle} />
          </g>
        );
      }

      // Default custom: Layered Geometric Corporate Ribbon
      const splitX = pageWidth * 0.38;
      return (
        <g opacity={opacity}>
          {/* Secondary contrast diamond facet */}
          <polygon
            points={`0,${startY + actualHeight * 0.25} ${splitX + 12},${startY} ${splitX - 12},${pageHeight} 0,${pageHeight}`}
            fill={secondary}
            opacity={0.95}
            style={secondaryFillStyle}
          />
          {/* Main primary ribbon section */}
          <polygon
            points={`${splitX + 12},${startY} ${pageWidth},${startY} ${pageWidth},${pageHeight} ${splitX - 12},${pageHeight}`}
            fill={color}
            style={fillStyle}
          />
          {/* Thin accent rule along top edge */}
          <line
            x1={0}
            y1={startY + actualHeight * 0.25}
            x2={pageWidth}
            y2={startY}
            stroke={secondary}
            strokeWidth={0.7}
            style={{ stroke: secondary, strokeWidth: 0.7, WebkitPrintColorAdjust: "exact", printColorAdjust: "exact" }}
          />
        </g>
      );
    }

    default:
      return (
        <rect
          x={0}
          y={startY}
          width={pageWidth}
          height={actualHeight}
          fill={color}
          opacity={opacity}
          style={fillStyle}
        />
      );
  }
}

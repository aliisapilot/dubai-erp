"use client";

import React from "react";
import { CheckCircle2 } from "lucide-react";

interface PrintCalibrationSheetProps {
  grayscaleSim?: boolean;
}

export default function PrintCalibrationSheet({
  grayscaleSim = false,
}: PrintCalibrationSheetProps) {
  return (
    <div
      className={`erp-document-surface w-[210mm] min-h-[297mm] max-h-[297mm] h-[297mm] bg-white text-slate-900 shadow-2xl relative box-border overflow-hidden select-none print:shadow-none print:m-0 print:border-none ${
        grayscaleSim ? "filter grayscale contrast-110" : ""
      }`}
      style={{
        boxSizing: "border-box",
        position: "relative",
        pageBreakInside: "avoid",
        breakInside: "avoid",
        fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
      }}
    >
      {/* ── Corner Registration Targets (Alignment Check) ── */}
      {/* Top-Left Target (5mm, 5mm) */}
      <div style={{ position: "absolute", top: "5mm", left: "5mm", width: "8mm", height: "8mm", pointerEvents: "none", zIndex: 30 }}>
        <div style={{ position: "absolute", top: "4mm", left: 0, right: 0, borderTop: "0.5pt solid #173C64" }} />
        <div style={{ position: "absolute", left: "4mm", top: 0, bottom: 0, borderLeft: "0.5pt solid #173C64" }} />
        <div style={{ position: "absolute", top: "2mm", left: "2mm", width: "4mm", height: "4mm", border: "0.5pt solid #173C64", borderRadius: "50%" }} />
      </div>

      {/* Top-Right Target (205mm, 5mm) */}
      <div style={{ position: "absolute", top: "5mm", right: "5mm", width: "8mm", height: "8mm", pointerEvents: "none", zIndex: 30 }}>
        <div style={{ position: "absolute", top: "4mm", left: 0, right: 0, borderTop: "0.5pt solid #173C64" }} />
        <div style={{ position: "absolute", left: "4mm", top: 0, bottom: 0, borderLeft: "0.5pt solid #173C64" }} />
        <div style={{ position: "absolute", top: "2mm", left: "2mm", width: "4mm", height: "4mm", border: "0.5pt solid #173C64", borderRadius: "50%" }} />
      </div>

      {/* Bottom-Left Target (5mm, 292mm) */}
      <div style={{ position: "absolute", bottom: "5mm", left: "5mm", width: "8mm", height: "8mm", pointerEvents: "none", zIndex: 30 }}>
        <div style={{ position: "absolute", top: "4mm", left: 0, right: 0, borderTop: "0.5pt solid #173C64" }} />
        <div style={{ position: "absolute", left: "4mm", top: 0, bottom: 0, borderLeft: "0.5pt solid #173C64" }} />
        <div style={{ position: "absolute", top: "2mm", left: "2mm", width: "4mm", height: "4mm", border: "0.5pt solid #173C64", borderRadius: "50%" }} />
      </div>

      {/* Bottom-Right Target (205mm, 292mm) */}
      <div style={{ position: "absolute", bottom: "5mm", right: "5mm", width: "8mm", height: "8mm", pointerEvents: "none", zIndex: 30 }}>
        <div style={{ position: "absolute", top: "4mm", left: 0, right: 0, borderTop: "0.5pt solid #173C64" }} />
        <div style={{ position: "absolute", left: "4mm", top: 0, bottom: 0, borderLeft: "0.5pt solid #173C64" }} />
        <div style={{ position: "absolute", top: "2mm", left: "2mm", width: "4mm", height: "4mm", border: "0.5pt solid #173C64", borderRadius: "50%" }} />
      </div>

      {/* ── Margin Rulers (All 4 Sides: Top, Bottom, Left, Right) ── */}
      {/* Top Outer Edge 0mm Ruler */}
      <div
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          height: "2mm",
          background: "#CBD5E1",
          borderBottom: "0.5pt dashed #64748B",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "0 10mm",
          fontSize: "5pt",
          fontFamily: "monospace",
          color: "#1E293B",
          lineHeight: "2mm",
          zIndex: 20,
        }}
      >
        <span>0mm TOP EDGE</span>
        <span>HARDWARE MARGIN TEST: If this line is clipped on paper, your printer roller cannot reach 0mm</span>
        <span>0mm TOP EDGE</span>
      </div>

      {/* Left Edge Margin Ruler (0, 2.5, 5.0, 10.0 mm) */}
      <div
        style={{
          position: "absolute",
          top: 0,
          bottom: 0,
          left: 0,
          width: "2mm",
          background: "#CBD5E1",
          borderRight: "0.5pt dashed #64748B",
          writingMode: "vertical-rl",
          textOrientation: "mixed",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "10mm 0",
          fontSize: "5pt",
          fontFamily: "monospace",
          color: "#1E293B",
          zIndex: 20,
        }}
      >
        <span>0mm LEFT EDGE</span>
        <span>LEFT HARDWARE RULER (SAFE INSET: 5.0mm)</span>
        <span>0mm LEFT EDGE</span>
      </div>

      {/* Right Edge Margin Ruler */}
      <div
        style={{
          position: "absolute",
          top: 0,
          bottom: 0,
          right: 0,
          width: "2mm",
          background: "#CBD5E1",
          borderLeft: "0.5pt dashed #64748B",
          writingMode: "vertical-rl",
          textOrientation: "mixed",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "10mm 0",
          fontSize: "5pt",
          fontFamily: "monospace",
          color: "#1E293B",
          zIndex: 20,
        }}
      >
        <span>0mm RIGHT EDGE</span>
        <span>RIGHT HARDWARE RULER (SAFE INSET: 5.0mm)</span>
        <span>0mm RIGHT EDGE</span>
      </div>

      {/* Bottom Outer Edge 0mm Ruler */}
      <div
        style={{
          position: "absolute",
          bottom: 0,
          left: 0,
          right: 0,
          height: "2mm",
          background: "#CBD5E1",
          borderTop: "0.5pt dashed #64748B",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "0 10mm",
          fontSize: "5pt",
          fontFamily: "monospace",
          color: "#1E293B",
          lineHeight: "2mm",
          zIndex: 20,
        }}
      >
        <span>0mm BOTTOM EDGE</span>
        <span>ROLLER DEADZONE: Standard office printers have 4.0mm to 12.0mm bottom margin cutoff</span>
        <span>0mm BOTTOM EDGE</span>
      </div>

      {/* ── Dubai ERP Gold Top Stripe (Positioned at 3.5mm Office Safe Position) ── */}
      <div
        style={{
          position: "absolute",
          top: "3.5mm",
          left: "6mm",
          right: "6mm",
          height: "4mm",
          background: "linear-gradient(90deg, #173C64 0%, #C9A227 25%, #E0AC23 50%, #C9A227 75%, #173C64 100%)",
          boxShadow: "0 1px 2px rgba(0,0,0,0.15)",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "0 6mm",
          color: "#FFFFFF",
          fontSize: "6.5pt",
          fontWeight: "bold",
          letterSpacing: "0.5px",
          zIndex: 25,
        }}
      >
        <span>DUBAI ERP PRINT-SAFE TOP BORDER (METALLIC GOLD #E0AC23)</span>
        <span style={{ fontSize: "5.5pt", opacity: 0.9 }}>INSET: 3.5mm SAFE ZONE</span>
        <span>نظام دبي لإدارة المؤسسات</span>
      </div>

      {/* ── Main Calibration Content (Inside Safe Margin Area) ── */}
      <div
        style={{
          paddingTop: "9.5mm",
          paddingBottom: "9mm",
          paddingLeft: "7.5mm",
          paddingRight: "7.5mm",
          height: "100%",
          boxSizing: "border-box",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          fontSize: "7.5pt",
          lineHeight: 1.2,
          color: "#0F172A",
        }}
      >
        {/* Header Title Box with Calibration Metadata */}
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "flex-start",
            borderBottom: "1.5pt solid #173C64",
            paddingBottom: "2mm",
          }}
        >
          <div>
            <div style={{ fontSize: "12pt", fontWeight: "bold", color: "#173C64", letterSpacing: "-0.2px" }}>
              DUBAI ERP — A4 PHYSICAL PRINTER CALIBRATION SHEET
            </div>
            <div style={{ fontSize: "7pt", color: "#64748B", marginTop: "1px" }}>
              Sheet: ISO 210 × 297 mm A4 | Engine: Dubai ERP Print Optimizer v2.4 | Profile: sRGB / Grayscale Laser
            </div>
          </div>
          <div
            style={{
              textAlign: "right",
              fontSize: "6.8pt",
              background: "#F1F5F9",
              border: "1pt solid #CBD5E1",
              padding: "2px 6px",
              borderRadius: "3px",
            }}
          >
            <div><strong>Print Scale:</strong> 100% (Do NOT Fit to Page)</div>
            <div><strong>Paper Size:</strong> A4 (210 × 297 mm)</div>
            <div><strong>Graphics:</strong> Background graphics ON</div>
          </div>
        </div>

        {/* Section 1: 4-Way Hardware Non-Printable Margin Cutoff Test */}
        <div
          style={{
            border: "1pt solid #CBD5E1",
            borderRadius: "4px",
            padding: "2mm 2.8mm",
            background: "#F8FAFC",
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1mm" }}>
            <div style={{ fontWeight: "bold", fontSize: "8pt", color: "#173C64" }}>
              1. 4-WAY HARDWARE MARGIN CALIBRATION (TOP, BOTTOM, LEFT, RIGHT)
            </div>
            <div style={{ fontSize: "6pt", color: "#64748B" }}>
              Standard office printers cannot print closer than 3.5mm–5.0mm to paper edge
            </div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(6, 1fr)", gap: "1.8mm", textAlign: "center" }}>
            {[
              { mm: "1.0 mm", note: "Bleed edge only", safe: false },
              { mm: "2.0 mm", note: "Cut on office print", safe: false },
              { mm: "3.5 mm", note: "Dubai minimal safe", safe: true },
              { mm: "5.0 mm", note: "Standard Laser/Inkjet", safe: true },
              { mm: "8.0 mm", note: "Balanced body safe", safe: true },
              { mm: "12.0 mm", note: "Generous corporate", safe: true },
            ].map((item, idx) => (
              <div
                key={idx}
                style={{
                  border: item.safe ? "1.2pt solid #173C64" : "1pt dashed #94A3B8",
                  background: item.safe ? "#FFFFFF" : "#F1F5F9",
                  padding: "1.5mm 1mm",
                  borderRadius: "3px",
                }}
              >
                <div style={{ fontWeight: "bold", fontSize: "7.5pt", color: item.safe ? "#173C64" : "#64748B" }}>
                  {item.mm}
                </div>
                <div style={{ fontSize: "5.5pt", color: "#475569", marginTop: "1px" }}>{item.note}</div>
                <div style={{ fontSize: "5.2pt", marginTop: "1px", color: item.safe ? "#059669" : "#D97706", fontWeight: "bold" }}>
                  {item.safe ? "✓ PRINT SAFE" : "⚠ AT RISK"}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Section 2: Physical 100mm Scale Calibration Bar (Check for Unwanted Auto-Shrink) */}
        <div
          style={{
            border: "1pt solid #CBD5E1",
            borderRadius: "4px",
            padding: "2mm 2.8mm",
            background: "#FFFFFF",
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1mm" }}>
            <div style={{ fontWeight: "bold", fontSize: "8pt", color: "#173C64" }}>
              2. 100.0 MM PHYSICAL SCALE &amp; ALIGNMENT VERIFICATION
            </div>
            <div style={{ fontSize: "6.5pt", color: "#64748B" }}>
              Measure with a physical desk ruler. If shorter than 100mm, your printer dialog shrank the page.
            </div>
          </div>

          <div style={{ position: "relative", width: "100mm", margin: "1mm auto", background: "#F1F5F9", border: "1pt solid #173C64", height: "9mm", padding: "1mm" }}>
            {/* 100mm bar */}
            <div style={{ position: "absolute", left: 0, right: 0, top: 0, bottom: 0, display: "flex", justifyContent: "space-between", alignItems: "flex-end", padding: "0 2px" }}>
              <span style={{ fontSize: "5.5pt", fontWeight: "bold", color: "#173C64" }}>0 mm</span>
              <span style={{ fontSize: "5.5pt", color: "#64748B" }}>25 mm</span>
              <span style={{ fontSize: "6pt", fontWeight: "bold", color: "#173C64" }}>50 mm (Center)</span>
              <span style={{ fontSize: "5.5pt", color: "#64748B" }}>75 mm</span>
              <span style={{ fontSize: "5.5pt", fontWeight: "bold", color: "#173C64" }}>100.0 mm</span>
            </div>
            <div style={{ position: "absolute", left: 0, right: 0, top: "3.5mm", height: "1.5mm", background: "#173C64" }} />
            {/* Center tick */}
            <div style={{ position: "absolute", left: "50%", top: "1mm", height: "6mm", width: "1pt", background: "#E0AC23" }} />
          </div>
        </div>

        {/* Section 3: Gold and Navy Color Test Bars & Tints */}
        <div
          style={{
            border: "1pt solid #CBD5E1",
            borderRadius: "4px",
            padding: "2mm 2.8mm",
            background: "#F8FAFC",
          }}
        >
          <div style={{ fontWeight: "bold", fontSize: "8pt", color: "#173C64", marginBottom: "1mm" }}>
            3. GOLD &amp; NAVY COLOR TEST BARS (CONTINUOUS GRADIENTS &amp; STEPPED TINTS)
          </div>

          {/* Continuous Gradients */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "2mm", marginBottom: "1.5mm" }}>
            <div>
              <div style={{ fontSize: "6pt", fontWeight: "bold", color: "#E0AC23", marginBottom: "1px" }}>
                GOLD SPECTRUM GRADIENT (#F9E498 → #E0AC23 → #A1790D)
              </div>
              <div style={{ height: "4mm", background: "linear-gradient(90deg, #FEF9C3 0%, #FACC15 30%, #E0AC23 60%, #A1790D 100%)", borderRadius: "2px", border: "0.5pt solid #CBD5E1" }} />
            </div>
            <div>
              <div style={{ fontSize: "6pt", fontWeight: "bold", color: "#173C64", marginBottom: "1px" }}>
                NAVY SPECTRUM GRADIENT (#38BDF8 → #173C64 → #091D34)
              </div>
              <div style={{ height: "4mm", background: "linear-gradient(90deg, #BAE6FD 0%, #38BDF8 30%, #173C64 70%, #091D34 100%)", borderRadius: "2px", border: "0.5pt solid #CBD5E1" }} />
            </div>
          </div>

          {/* Stepped Tints (100%, 80%, 60%, 40%, 20%) */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(10, 1fr)", gap: "1mm", textAlign: "center" }}>
            {[
              { label: "Gold 100%", bg: "#E0AC23", text: "#000" },
              { label: "Gold 80%", bg: "rgba(224, 172, 35, 0.8)", text: "#000" },
              { label: "Gold 60%", bg: "rgba(224, 172, 35, 0.6)", text: "#000" },
              { label: "Gold 40%", bg: "rgba(224, 172, 35, 0.4)", text: "#000" },
              { label: "Gold 20%", bg: "rgba(224, 172, 35, 0.2)", text: "#000" },
              { label: "Navy 100%", bg: "#173C64", text: "#FFF" },
              { label: "Navy 80%", bg: "rgba(23, 60, 100, 0.8)", text: "#FFF" },
              { label: "Navy 60%", bg: "rgba(23, 60, 100, 0.6)", text: "#FFF" },
              { label: "Navy 40%", bg: "rgba(23, 60, 100, 0.4)", text: "#000" },
              { label: "Navy 20%", bg: "rgba(23, 60, 100, 0.2)", text: "#000" },
            ].map((tint, idx) => (
              <div
                key={idx}
                style={{
                  background: tint.bg,
                  color: tint.text,
                  height: "4.5mm",
                  borderRadius: "2px",
                  fontSize: "4.8pt",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  border: "0.5pt solid rgba(0,0,0,0.1)",
                  fontWeight: "bold",
                }}
              >
                {tint.label}
              </div>
            ))}
          </div>
        </div>

        {/* Section 4: Border Thickness Ladder (0.25pt to 3.0pt) */}
        <div
          style={{
            border: "1pt solid #CBD5E1",
            borderRadius: "4px",
            padding: "2mm 2.8mm",
            background: "#FFFFFF",
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1mm" }}>
            <div style={{ fontWeight: "bold", fontSize: "8pt", color: "#173C64" }}>
              4. BORDER THICKNESS CALIBRATION (0.25 pt TO 3.00 pt)
            </div>
            <div style={{ fontSize: "6pt", color: "#64748B" }}>
              Hairlines (&lt; 0.5pt) or light gray borders can drop out on monochrome laser printers
            </div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "3mm" }}>
            {/* Navy Borders */}
            <div style={{ display: "flex", flexDirection: "column", gap: "1.5mm" }}>
              {[
                { label: "0.25 pt Hairline", border: "0.25pt solid #173C64", note: "Faint/drops on laser" },
                { label: "0.50 pt Fine Rule", border: "0.5pt solid #173C64", note: "Subtle dividers" },
                { label: "1.00 pt Standard", border: "1.0pt solid #173C64", note: "Dubai ERP Default" },
                { label: "1.50 pt Medium", border: "1.5pt solid #173C64", note: "High readability" },
                { label: "2.00 pt Bold", border: "2.0pt solid #173C64", note: "Total card frames" },
                { label: "3.00 pt Heavy", border: "3.0pt solid #173C64", note: "Master headers" },
              ].map((line, idx) => (
                <div key={idx}>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: "5.8pt", color: "#334155", marginBottom: "1px" }}>
                    <span><strong>{line.label}</strong> (Navy #173C64)</span>
                    <span style={{ color: "#64748B" }}>{line.note}</span>
                  </div>
                  <div style={{ borderBottom: line.border, width: "100%", height: "1px" }} />
                </div>
              ))}
            </div>

            {/* Slate & Gold Borders */}
            <div style={{ display: "flex", flexDirection: "column", gap: "1.5mm" }}>
              {[
                { label: "0.50 pt Slate (#CBD5E1)", border: "0.5pt solid #CBD5E1", note: "Light table grid" },
                { label: "1.00 pt Slate (#CBD5E1)", border: "1.0pt solid #CBD5E1", note: "Subtle card outline" },
                { label: "1.00 pt High-Contrast (#64748B)", border: "1.0pt solid #64748B", note: "Crisp in monochrome" },
                { label: "1.50 pt Maximum B&W (#1E293B)", border: "1.5pt solid #1E293B", note: "Solid black on laser" },
                { label: "1.50 pt Gold Accent (#E0AC23)", border: "1.5pt solid #E0AC23", note: "Metallic emphasis" },
                { label: "2.50 pt Dual Gold/Navy", border: "2.5pt double #173C64", note: "Double framing rule" },
              ].map((line, idx) => (
                <div key={idx}>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: "5.8pt", color: "#334155", marginBottom: "1px" }}>
                    <span><strong>{line.label}</strong></span>
                    <span style={{ color: "#64748B" }}>{line.note}</span>
                  </div>
                  <div style={{ borderBottom: line.border, width: "100%", height: "1px" }} />
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Section 5: Color vs Grayscale Laser Halftone Check */}
        <div
          style={{
            border: "1pt solid #CBD5E1",
            borderRadius: "4px",
            padding: "2mm 2.8mm",
            background: "#F8FAFC",
          }}
        >
          <div style={{ fontWeight: "bold", fontSize: "8pt", color: "#173C64", marginBottom: "1mm" }}>
            5. COLOR SWATCHES &amp; MONOCHROME LASER HALFTONE REPRODUCTION
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(6, 1fr)", gap: "1.8mm", textAlign: "center" }}>
            {[
              { name: "Primary Navy", hex: "#173C64", text: "#FFFFFF", note: "100% Solid Dark" },
              { name: "Gold Accent", hex: "#E0AC23", text: "#000000", note: "Clean 55% Halftone" },
              { name: "Dark Navy", hex: "#0F172A", text: "#FFFFFF", note: "Deepest Black" },
              { name: "High Contrast", hex: "#64748B", text: "#FFFFFF", note: "Crisp Dark Slate" },
              { name: "Card Slate", hex: "#CBD5E1", text: "#000000", note: "15% Halftone Dot" },
              { name: "Light Background", hex: "#F8FAFC", text: "#000000", note: "Paper White / Pure" },
            ].map((c, idx) => (
              <div
                key={idx}
                style={{
                  background: c.hex,
                  color: c.text,
                  padding: "1.8mm 1mm",
                  borderRadius: "3px",
                  border: "1pt solid rgba(0,0,0,0.15)",
                  fontSize: "6pt",
                }}
              >
                <div style={{ fontWeight: "bold" }}>{c.name}</div>
                <div style={{ fontFamily: "monospace", fontSize: "5.5pt" }}>{c.hex}</div>
                <div style={{ fontSize: "5pt", marginTop: "1px", opacity: 0.85 }}>{c.note}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Section 6: Font Legibility Ladder (English & Arabic) */}
        <div
          style={{
            border: "1pt solid #CBD5E1",
            borderRadius: "4px",
            padding: "2mm 2.8mm",
            background: "#FFFFFF",
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1mm" }}>
            <div style={{ fontWeight: "bold", fontSize: "8pt", color: "#173C64" }}>
              6. FONT LEGIBILITY LADDER (ENGLISH &amp; ARABIC FTA COMPLIANCE)
            </div>
            <div style={{ fontSize: "6pt", color: "#64748B" }}>
              Verify invoice details and TRN stay sharp at small point sizes
            </div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "2.5mm" }}>
            <div style={{ display: "flex", flexDirection: "column", gap: "0.8mm" }}>
              {[
                { pt: "9.5pt", sample: "TAX INVOICE #INV-2026-0042 — AED 142,500.00", desc: "Header / Totals" },
                { pt: "8.5pt", sample: "Tax Registration Number (TRN): 100234567800003", desc: "Standard Body (Recommended)" },
                { pt: "8.0pt", sample: "15–18 Items Fit Profile: Precision Steel Fasteners", desc: "Dubai ERP Balanced Fit" },
                { pt: "7.5pt", sample: "20–25 Items Fit Profile: DIN 933 M12×45 Hexagonal Screws", desc: "Dubai ERP Default Minimum" },
                { pt: "7.0pt", sample: "28–30 Items Fit Profile: Line Item Description AED 1,450.00", desc: "Dubai ERP Compact Floor" },
              ].map((font, idx) => (
                <div
                  key={idx}
                  style={{
                    fontSize: font.pt,
                    lineHeight: 1.15,
                    borderBottom: "0.5pt solid #F1F5F9",
                    paddingBottom: "1px",
                    color: "#0F172A",
                  }}
                >
                  <span style={{ fontWeight: "bold", color: "#173C64", fontSize: "6.5pt", marginRight: "3px" }}>
                    [{font.pt}]
                  </span>
                  <span>{font.sample}</span>
                </div>
              ))}
            </div>

            {/* Arabic Font Ladder */}
            <div style={{ display: "flex", flexDirection: "column", gap: "0.8mm", direction: "rtl", textAlign: "right" }}>
              {[
                { pt: "9.5pt", sample: "فاتورة ضريبية — القيمة الإجمالية: 142,500.00 د.إ", desc: "العناوين الرئيسية" },
                { pt: "8.5pt", sample: "رقم التسجيل الضريبي: 100234567800003", desc: "النص القياسي المعتمد" },
                { pt: "8.0pt", sample: "وصف البضائع والخدمات الموردة لشركة دبي للتجارة العامة", desc: "ملف التنسيق المتوازن" },
                { pt: "7.5pt", sample: "بند الفاتورة: توريد وتركيب قواطع ألمنيوم وزجاج سيكوريت", desc: "الحد الأدنى الموصى به" },
                { pt: "7.0pt", sample: "الحد الأدنى للقراءة والطباعة لـ 30 بنداً في صفحة واحدة", desc: "الوضع المضغوط" },
              ].map((font, idx) => (
                <div
                  key={idx}
                  style={{
                    fontSize: font.pt,
                    lineHeight: 1.15,
                    borderBottom: "0.5pt solid #F1F5F9",
                    paddingBottom: "1px",
                    color: "#0F172A",
                  }}
                >
                  <span style={{ fontWeight: "bold", color: "#173C64", fontSize: "6.5pt", marginLeft: "3px" }}>
                    [{font.pt}]
                  </span>
                  <span>{font.sample}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Section 7: Sample Table Comparison: Full Color vs Printer-Friendly */}
        <div
          style={{
            border: "1pt solid #CBD5E1",
            borderRadius: "4px",
            padding: "2mm 2.8mm",
            background: "#F8FAFC",
          }}
        >
          <div style={{ fontWeight: "bold", fontSize: "8pt", color: "#173C64", marginBottom: "1mm" }}>
            7. INVOICE LINE ITEM RENDERING: STANDARD THEME VS PRINTER-FRIENDLY
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "2.5mm" }}>
            {/* Full Color Theme */}
            <div>
              <div style={{ fontSize: "6pt", fontWeight: "bold", color: "#173C64", marginBottom: "0.5mm" }}>
                STANDARD THEME (Dark Navy Header + Gold Accents)
              </div>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "6pt" }}>
                <thead>
                  <tr style={{ background: "#173C64", color: "#FFFFFF" }}>
                    <th style={{ padding: "1mm 1.5mm", textAlign: "left" }}>#</th>
                    <th style={{ padding: "1mm 1.5mm", textAlign: "left" }}>Description</th>
                    <th style={{ padding: "1mm 1.5mm", textAlign: "center" }}>Qty</th>
                    <th style={{ padding: "1mm 1.5mm", textAlign: "right" }}>Total (AED)</th>
                  </tr>
                </thead>
                <tbody>
                  <tr style={{ borderBottom: "1pt solid #CBD5E1", background: "#FFFFFF" }}>
                    <td style={{ padding: "1mm 1.5mm" }}>01</td>
                    <td style={{ padding: "1mm 1.5mm" }}>A4 Laser Printer Calibration Standard</td>
                    <td style={{ padding: "1mm 1.5mm", textAlign: "center" }}>1</td>
                    <td style={{ padding: "1mm 1.5mm", textAlign: "right" }}>750.00</td>
                  </tr>
                  <tr style={{ borderBottom: "1pt solid #CBD5E1", background: "#F8FAFC" }}>
                    <td style={{ padding: "1mm 1.5mm" }}>02</td>
                    <td style={{ padding: "1mm 1.5mm" }}>Precision Optical Test Pattern A4</td>
                    <td style={{ padding: "1mm 1.5mm", textAlign: "center" }}>2</td>
                    <td style={{ padding: "1mm 1.5mm", textAlign: "right" }}>1,500.00</td>
                  </tr>
                </tbody>
              </table>
            </div>

            {/* Printer-Friendly Mode */}
            <div>
              <div style={{ fontSize: "6pt", fontWeight: "bold", color: "#334155", marginBottom: "0.5mm" }}>
                PRINTER-FRIENDLY MODE (White Header + 1.5pt Border)
              </div>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "6pt" }}>
                <thead>
                  <tr style={{ background: "#FFFFFF", color: "#0F172A", borderBottom: "1.5pt solid #173C64" }}>
                    <th style={{ padding: "1mm 1.5mm", textAlign: "left" }}>#</th>
                    <th style={{ padding: "1mm 1.5mm", textAlign: "left" }}>Description</th>
                    <th style={{ padding: "1mm 1.5mm", textAlign: "center" }}>Qty</th>
                    <th style={{ padding: "1mm 1.5mm", textAlign: "right" }}>Total (AED)</th>
                  </tr>
                </thead>
                <tbody>
                  <tr style={{ borderBottom: "1pt solid #64748B", background: "#FFFFFF" }}>
                    <td style={{ padding: "1mm 1.5mm" }}>01</td>
                    <td style={{ padding: "1mm 1.5mm" }}>Zero Toner Waste on Large Black Fills</td>
                    <td style={{ padding: "1mm 1.5mm", textAlign: "center" }}>1</td>
                    <td style={{ padding: "1mm 1.5mm", textAlign: "right" }}>750.00</td>
                  </tr>
                  <tr style={{ borderBottom: "1pt solid #64748B", background: "#FFFFFF" }}>
                    <td style={{ padding: "1mm 1.5mm" }}>02</td>
                    <td style={{ padding: "1mm 1.5mm" }}>Sharp When Background Graphics Is Disabled</td>
                    <td style={{ padding: "1mm 1.5mm", textAlign: "center" }}>2</td>
                    <td style={{ padding: "1mm 1.5mm", textAlign: "right" }}>1,500.00</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* Section 8: Physical Printer Checklist */}
        <div
          style={{
            border: "1.5pt solid #173C64",
            borderRadius: "4px",
            padding: "2.2mm 2.8mm",
            background: "#EFF6FF",
          }}
        >
          <div style={{ fontWeight: "bold", fontSize: "8pt", color: "#173C64", marginBottom: "1mm", display: "flex", alignItems: "center", gap: "4px" }}>
            <CheckCircle2 size={12} className="text-blue-600 inline" />
            <span>PHYSICAL PRINTER TEST PROCEDURE &amp; VERIFICATION CHECKLIST</span>
          </div>
          <div style={{ fontSize: "6.8pt", color: "#1E293B", lineHeight: 1.3 }}>
            <strong>1. Print Command:</strong> Press <kbd style={{ background: "#FFFFFF", padding: "1px 4px", border: "1pt solid #94A3B8", borderRadius: "2px" }}>Ctrl + P</kbd>. Set <strong>Destination</strong> to your physical printer, <strong>Paper size</strong> to <strong>A4</strong>, and <strong>Scale</strong> to <strong>Default (100%)</strong>. Ensure <strong>Background graphics</strong> is enabled.<br />
            <strong>2. Check Top/Bottom Borders:</strong> Verify the top gold stripe and bottom navy stripe appear completely without clipping. If the top stripe is cut off, set Margin Preset to <strong>&quot;Office Safe (5mm)&quot;</strong> in PDF Designer.<br />
            <strong>3. Inspect Card Borders:</strong> Check the table lines and card borders above. If lines appear faint or dotted on your monochrome printer, set <strong>Border Contrast</strong> to <strong>&quot;High Contrast (#64748B)&quot;</strong> or <strong>&quot;Maximum B&amp;W (#1E293B)&quot;</strong>.<br />
            <strong>4. Measure 100mm Scale:</strong> Place a physical metric ruler against the 100.0mm bar in Section 2. If it measures exactly 100.0 mm, your printer scaling is verified at 100%.
          </div>
        </div>
      </div>

      {/* ── Bottom Decorative Navy Border (with 4.0mm Safety Inset) ── */}
      <div
        style={{
          position: "absolute",
          bottom: "4.0mm",
          left: "6mm",
          right: "6mm",
          height: "4mm",
          background: "#173C64",
          boxShadow: "0 -1px 2px rgba(0,0,0,0.15)",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "0 6mm",
          color: "#FFFFFF",
          fontSize: "6.5pt",
          fontWeight: "bold",
          letterSpacing: "0.5px",
          zIndex: 25,
        }}
      >
        <span>DUBAI ERP PRINT-SAFE BOTTOM BORDER (DEEP NAVY #173C64)</span>
        <span style={{ fontSize: "5.5pt", opacity: 0.9 }}>INSET: 4.0mm HARDWARE SAFE ZONE</span>
        <span>صفحة المعايرة والطباعة المعتمدة</span>
      </div>
    </div>
  );
}

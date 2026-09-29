"use client";

import React, { useState } from "react";
import Link from "next/link";
import { Printer, ArrowLeft } from "lucide-react";

export default function PrintTestSheetPage() {
  const [grayscaleSim, setGrayscaleSim] = useState(false);

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col items-center py-6 px-4 print:p-0 print:bg-white print:text-black">
      {/* ── Top Bar (Hidden on print) ── */}
      <header className="w-full max-w-[210mm] mb-6 flex flex-wrap items-center justify-between gap-4 p-4 rounded-xl bg-slate-900 border border-slate-800 shadow-xl print:hidden">
        <div className="flex items-center gap-3">
          <Link
            href="/settings/pdf-designer"
            className="p-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 transition"
            title="Back to PDF Designer"
          >
            <ArrowLeft size={18} />
          </Link>
          <div>
            <h1 className="text-base font-bold text-white flex items-center gap-2">
              <span>Dubai ERP — A4 Physical Printer Calibration Sheet</span>
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-400 font-mono">
                A4 (210×297mm)
              </span>
            </h1>
            <p className="text-xs text-slate-400">
              Calibrate hardware margins, border visibility, legibility, and grayscale halftoning on your physical printer.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <label className="flex items-center gap-2 text-xs text-slate-300 bg-slate-800 px-3 py-1.5 rounded-lg border border-slate-700 cursor-pointer hover:bg-slate-750">
            <input
              type="checkbox"
              checked={grayscaleSim}
              onChange={(e) => setGrayscaleSim(e.target.checked)}
              className="rounded border-slate-600 text-blue-600 focus:ring-0"
            />
            <span>Simulate Grayscale Laser</span>
          </label>

          <button
            type="button"
            onClick={handlePrint}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold transition shadow-lg shadow-blue-600/30 cursor-pointer"
          >
            <Printer size={16} />
            <span>Print Test Sheet (Ctrl+P)</span>
          </button>
        </div>
      </header>

      {/* ── A4 Page Wrapper ── */}
      <div
        className={`w-[210mm] min-h-[297mm] max-h-[297mm] h-[297mm] bg-white text-slate-900 shadow-2xl relative box-border overflow-hidden print:shadow-none print:m-0 print:border-none ${
          grayscaleSim ? "filter grayscale contrast-110" : ""
        }`}
        style={{
          boxSizing: "border-box",
          position: "relative",
          pageBreakInside: "avoid",
          breakInside: "avoid",
        }}
      >
        {/* ── 1. Top Decorative Gold Border (with 3.5mm Safety Inset & 0mm Outer Comparison) ── */}
        {/* Outer 0mm ruler line (reveals if physical printer cuts off at 0mm) */}
        <div
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            right: 0,
            height: "1.5mm",
            background: "#CBD5E1",
            borderBottom: "0.5pt dashed #94A3B8",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: "6pt",
            color: "#64748B",
            fontFamily: "monospace",
          }}
        >
          0mm OUTER SHEET EDGE — If this line is missing on your printout, your printer has hardware margins.
        </div>

        {/* Dubai ERP Gold Top Stripe (Positioned at 3.5mm Office Safe Position) */}
        <div
          style={{
            position: "absolute",
            top: "3.5mm",
            left: "5mm",
            right: "5mm",
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
            fontFamily: "sans-serif",
          }}
        >
          <span>DUBAI ERP PRINT-SAFE TOP BORDER (METALLIC GOLD #E0AC23)</span>
          <span style={{ fontSize: "5.5pt", opacity: 0.9 }}>INSET: 3.5mm SAFE ZONE</span>
          <span>نظام دبي لإدارة المؤسسات</span>
        </div>

        {/* ── Main Calibration Content (Inside Safe Margin Area) ── */}
        <div
          style={{
            paddingTop: "9mm",
            paddingBottom: "8mm",
            paddingLeft: "8mm",
            paddingRight: "8mm",
            height: "100%",
            boxSizing: "border-box",
            display: "flex",
            flexDirection: "column",
            justifyContent: "space-between",
            fontFamily: "'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
            fontSize: "8pt",
            lineHeight: 1.25,
            color: "#0F172A",
          }}
        >
          {/* Header Title Box */}
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
              <div style={{ fontSize: "13pt", fontWeight: "bold", color: "#173C64", letterSpacing: "-0.2px" }}>
                DUBAI ERP — PHYSICAL PRINT CALIBRATION SHEET
              </div>
              <div style={{ fontSize: "7.5pt", color: "#64748B", marginTop: "1px" }}>
                Target Sheet: ISO 210 × 297 mm A4 | Engine: Dubai ERP Print Optimizer v2.4 | Color Profile: sRGB / Grayscale Laser
              </div>
            </div>
            <div
              style={{
                textAlign: "right",
                fontSize: "7pt",
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

          {/* Section 1: Hardware Margin Ruler Test */}
          <div
            style={{
              border: "1pt solid #CBD5E1",
              borderRadius: "4px",
              padding: "2.5mm",
              background: "#F8FAFC",
            }}
          >
            <div style={{ fontWeight: "bold", fontSize: "8.5pt", color: "#173C64", marginBottom: "1.5mm" }}>
              1. HARDWARE NON-PRINTABLE MARGIN RULER (MEASURE CUTOFFS)
            </div>
            <div style={{ fontSize: "7pt", color: "#475569", marginBottom: "2mm" }}>
              Check which lines are printed completely from the edge of the paper. Standard office laser/inkjet printers cannot print within 3.5mm–5mm of the paper edge.
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "repeat(6, 1fr)", gap: "2mm", textAlign: "center" }}>
              {[
                { mm: "1.0mm", note: "Bleed printers only", safe: false },
                { mm: "2.0mm", note: "Cut on most office printers", safe: false },
                { mm: "3.5mm", note: "Dubai ERP minimal safe", safe: true },
                { mm: "5.0mm", note: "Office Laser/Inkjet standard", safe: true },
                { mm: "8.0mm", note: "Recommended body margin", safe: true },
                { mm: "12.0mm", note: "Generous corporate margin", safe: true },
              ].map((item, idx) => (
                <div
                  key={idx}
                  style={{
                    border: item.safe ? "1.2pt solid #173C64" : "1pt dashed #94A3B8",
                    background: item.safe ? "#FFFFFF" : "#F1F5F9",
                    padding: "2mm 1mm",
                    borderRadius: "3px",
                  }}
                >
                  <div style={{ fontWeight: "bold", fontSize: "8pt", color: item.safe ? "#173C64" : "#64748B" }}>
                    {item.mm}
                  </div>
                  <div style={{ fontSize: "5.8pt", color: "#475569", marginTop: "1px" }}>{item.note}</div>
                  <div style={{ fontSize: "5.5pt", marginTop: "2px", color: item.safe ? "#059669" : "#D97706", fontWeight: "bold" }}>
                    {item.safe ? "✓ PRINT SAFE" : "⚠ AT RISK"}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Section 2: Border Thickness & Visibility Calibration */}
          <div
            style={{
              border: "1pt solid #CBD5E1",
              borderRadius: "4px",
              padding: "2.5mm",
              background: "#FFFFFF",
            }}
          >
            <div style={{ fontWeight: "bold", fontSize: "8.5pt", color: "#173C64", marginBottom: "1.5mm" }}>
              2. BORDER THICKNESS &amp; SOLIDITY ON PAPER (TEST AGAINST TONER DROP)
            </div>
            <div style={{ fontSize: "7pt", color: "#475569", marginBottom: "2mm" }}>
              Inspect the lines below on your physical paper. Hairlines (&lt; 0.5pt) or faint gray lines often disappear on monochrome laser printers due to halftoning.
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "3mm" }}>
              {/* Left Column: Navy & Slate Lines */}
              <div style={{ display: "flex", flexDirection: "column", gap: "2mm" }}>
                {[
                  { label: "0.25 pt (0.33 px) Hairline", border: "0.25pt solid #173C64", warn: "Often vanishes on laser" },
                  { label: "0.50 pt (0.67 px) Fine Line", border: "0.5pt solid #173C64", warn: "Acceptable for grids" },
                  { label: "1.00 pt (1.33 px) Standard Card Border", border: "1pt solid #173C64", warn: "Dubai ERP Default (Recommended)" },
                  { label: "1.50 pt (2.00 px) High Contrast", border: "1.5pt solid #173C64", warn: "Best for high readability" },
                  { label: "2.00 pt (2.67 px) Bold Framing", border: "2pt solid #173C64", warn: "Total & highlight cards" },
                ].map((line, idx) => (
                  <div key={idx}>
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: "6.5pt", color: "#334155", marginBottom: "1px" }}>
                      <span><strong>{line.label}</strong> (Navy #173C64)</span>
                      <span style={{ color: "#64748B" }}>{line.warn}</span>
                    </div>
                    <div style={{ borderBottom: line.border, width: "100%", height: "1px" }} />
                  </div>
                ))}
              </div>

              {/* Right Column: Gold & Contrast Gray Lines */}
              <div style={{ display: "flex", flexDirection: "column", gap: "2mm" }}>
                {[
                  { label: "0.50 pt Faint Slate (#CBD5E1)", border: "0.5pt solid #CBD5E1", warn: "84% Lightness (vanishes in B&W)" },
                  { label: "1.00 pt Faint Slate (#CBD5E1)", border: "1pt solid #CBD5E1", warn: "Faint dots in Grayscale" },
                  { label: "1.00 pt High-Contrast Slate (#64748B)", border: "1pt solid #64748B", warn: "Dubai ERP High Contrast Mode" },
                  { label: "1.50 pt Maximum B&W Slate (#1E293B)", border: "1.5pt solid #1E293B", warn: "Solid dark in monochrome" },
                  { label: "2.00 pt Gold Accent (#E0AC23)", border: "2pt solid #E0AC23", warn: "Vibrant in color, solid gray in B&W" },
                ].map((line, idx) => (
                  <div key={idx}>
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: "6.5pt", color: "#334155", marginBottom: "1px" }}>
                      <span><strong>{line.label}</strong></span>
                      <span style={{ color: "#64748B" }}>{line.warn}</span>
                    </div>
                    <div style={{ borderBottom: line.border, width: "100%", height: "1px" }} />
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Section 3: Color Halftoning & Brand Palette Swatches */}
          <div
            style={{
              border: "1pt solid #CBD5E1",
              borderRadius: "4px",
              padding: "2.5mm",
              background: "#F8FAFC",
            }}
          >
            <div style={{ fontWeight: "bold", fontSize: "8.5pt", color: "#173C64", marginBottom: "1.5mm" }}>
              3. BRAND COLORS &amp; GRAYSCALE LASER HALFTONE CHECK
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(6, 1fr)", gap: "2mm", textAlign: "center" }}>
              {[
                { name: "Primary Navy", hex: "#173C64", text: "#FFFFFF", note: "100% Sharp in B&W" },
                { name: "Gold Accent", hex: "#E0AC23", text: "#000000", note: "Medium Gray in B&W" },
                { name: "Dark Navy", hex: "#0F172A", text: "#FFFFFF", note: "Solid Black in B&W" },
                { name: "High Contrast", hex: "#64748B", text: "#FFFFFF", note: "Crisp Gray in B&W" },
                { name: "Border Slate", hex: "#CBD5E1", text: "#000000", note: "Light Halftone" },
                { name: "Light Background", hex: "#F8FAFC", text: "#000000", note: "Subtle or White" },
              ].map((c, idx) => (
                <div
                  key={idx}
                  style={{
                    background: c.hex,
                    color: c.text,
                    padding: "2mm 1mm",
                    borderRadius: "3px",
                    border: "1pt solid rgba(0,0,0,0.15)",
                    fontSize: "6.5pt",
                  }}
                >
                  <div style={{ fontWeight: "bold" }}>{c.name}</div>
                  <div style={{ fontFamily: "monospace", fontSize: "5.8pt" }}>{c.hex}</div>
                  <div style={{ fontSize: "5.2pt", marginTop: "1px", opacity: 0.85 }}>{c.note}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Section 4: Typography Legibility Ladder (English & Arabic) */}
          <div
            style={{
              border: "1pt solid #CBD5E1",
              borderRadius: "4px",
              padding: "2.5mm",
              background: "#FFFFFF",
            }}
          >
            <div style={{ fontWeight: "bold", fontSize: "8.5pt", color: "#173C64", marginBottom: "1.5mm" }}>
              4. FONT LEGIBILITY LADDER (ENGLISH &amp; ARABIC COMPLIANCE)
            </div>
            <div style={{ fontSize: "7pt", color: "#475569", marginBottom: "1.5mm" }}>
              UAE FTA Tax Invoice regulations require invoice numbers, TRN, and line item amounts to be clearly legible on printed paper.
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "2.5mm" }}>
              <div style={{ display: "flex", flexDirection: "column", gap: "1mm" }}>
                {[
                  { pt: "10pt", sample: "INVOICE #INV-2026-0042 — AED 142,500.00", desc: "Header / Totals" },
                  { pt: "8.5pt", sample: "Tax Registration Number (TRN): 100234567800003", desc: "Standard Body (Recommended)" },
                  { pt: "8.0pt", sample: "15–18 Items Fit Profile: Precision Machined Steel Fasteners", desc: "Dubai ERP Balanced Fit" },
                  { pt: "7.5pt", sample: "20–25 Items Fit Profile: High-Strength Fasteners DIN 933 M12×45", desc: "Dubai ERP Default Minimum" },
                  { pt: "7.0pt", sample: "28–30 Items Fit Profile: Compact Line Item Description AED 1,450.00", desc: "Dubai ERP Compact Floor" },
                  { pt: "6.0pt", sample: "WARNING: 6.0pt is below recommended threshold — prone to ink bleed", desc: "Unsafe Floor" },
                ].map((font, idx) => (
                  <div
                    key={idx}
                    style={{
                      fontSize: font.pt,
                      lineHeight: 1.15,
                      borderBottom: "0.5pt solid #F1F5F9",
                      paddingBottom: "1px",
                      color: font.pt === "6.0pt" ? "#DC2626" : "#0F172A",
                    }}
                  >
                    <span style={{ fontWeight: "bold", color: "#173C64", fontSize: "7pt", marginRight: "3px" }}>
                      [{font.pt}]
                    </span>
                    <span>{font.sample}</span>
                  </div>
                ))}
              </div>

              {/* Arabic Font Ladder */}
              <div style={{ display: "flex", flexDirection: "column", gap: "1mm", direction: "rtl", textAlign: "right" }}>
                {[
                  { pt: "10pt", sample: "فاتورة ضريبية — القيمة الإجمالية: 142,500.00 د.إ", desc: "العناوين الرئيسية" },
                  { pt: "8.5pt", sample: "رقم التسجيل الضريبي: 100234567800003", desc: "النص القياسي المعتمد" },
                  { pt: "8.0pt", sample: "وصف البضائع والخدمات الموردة لشركة دبي للتجارة العامة", desc: "ملف التنسيق المتوازن" },
                  { pt: "7.5pt", sample: "بند الفاتورة: توريد وتركيب قواطع ألمنيوم وزجاج سيكوريت", desc: "الحد الأدنى الموصى به" },
                  { pt: "7.0pt", sample: "الحد الأدنى للقراءة والطباعة لـ 30 بنداً في صفحة واحدة", desc: "الوضع المضغوط" },
                  { pt: "6.0pt", sample: "تنبيه: حجم 6 نقاط قد يصبح غير مقروء عند الطباعة بالليزر", desc: "غير مقروء" },
                ].map((font, idx) => (
                  <div
                    key={idx}
                    style={{
                      fontSize: font.pt,
                      lineHeight: 1.15,
                      borderBottom: "0.5pt solid #F1F5F9",
                      paddingBottom: "1px",
                      color: font.pt === "6.0pt" ? "#DC2626" : "#0F172A",
                    }}
                  >
                    <span style={{ fontWeight: "bold", color: "#173C64", fontSize: "7pt", marginLeft: "3px" }}>
                      [{font.pt}]
                    </span>
                    <span>{font.sample}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Section 5: Real Table Comparison: Full Color vs Printer-Friendly */}
          <div
            style={{
              border: "1pt solid #CBD5E1",
              borderRadius: "4px",
              padding: "2.5mm",
              background: "#F8FAFC",
            }}
          >
            <div style={{ fontWeight: "bold", fontSize: "8.5pt", color: "#173C64", marginBottom: "1.5mm" }}>
              5. SAMPLE TABLE RENDERING: FULL COLOR VS PRINTER-FRIENDLY MODE
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "3mm" }}>
              {/* Full Color Theme */}
              <div>
                <div style={{ fontSize: "6.5pt", fontWeight: "bold", color: "#173C64", marginBottom: "1mm" }}>
                  STANDARD THEME (Dark Navy Header #173C64 + Gold Bar)
                </div>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "6.5pt" }}>
                  <thead>
                    <tr style={{ background: "#173C64", color: "#FFFFFF" }}>
                      <th style={{ padding: "1.5mm", textAlign: "left" }}>#</th>
                      <th style={{ padding: "1.5mm", textAlign: "left" }}>Item Description</th>
                      <th style={{ padding: "1.5mm", textAlign: "center" }}>Qty</th>
                      <th style={{ padding: "1.5mm", textAlign: "right" }}>Total (AED)</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr style={{ borderBottom: "1pt solid #CBD5E1", background: "#FFFFFF" }}>
                      <td style={{ padding: "1.5mm" }}>01</td>
                      <td style={{ padding: "1.5mm" }}>A4 Laser Printer Calibration Standard</td>
                      <td style={{ padding: "1.5mm", textAlign: "center" }}>1</td>
                      <td style={{ padding: "1.5mm", textAlign: "right" }}>750.00</td>
                    </tr>
                    <tr style={{ borderBottom: "1pt solid #CBD5E1", background: "#F8FAFC" }}>
                      <td style={{ padding: "1.5mm" }}>02</td>
                      <td style={{ padding: "1.5mm" }}>Precision Optical Test Pattern A4</td>
                      <td style={{ padding: "1.5mm", textAlign: "center" }}>2</td>
                      <td style={{ padding: "1.5mm", textAlign: "right" }}>1,500.00</td>
                    </tr>
                  </tbody>
                </table>
              </div>

              {/* Printer-Friendly Mode */}
              <div>
                <div style={{ fontSize: "6.5pt", fontWeight: "bold", color: "#334155", marginBottom: "1mm" }}>
                  PRINTER-FRIENDLY MODE (White Header + 2px Solid Dark Border)
                </div>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "6.5pt" }}>
                  <thead>
                    <tr style={{ background: "#FFFFFF", color: "#0F172A", borderBottom: "2pt solid #173C64" }}>
                      <th style={{ padding: "1.5mm", textAlign: "left" }}>#</th>
                      <th style={{ padding: "1.5mm", textAlign: "left" }}>Item Description</th>
                      <th style={{ padding: "1.5mm", textAlign: "center" }}>Qty</th>
                      <th style={{ padding: "1.5mm", textAlign: "right" }}>Total (AED)</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr style={{ borderBottom: "1pt solid #64748B", background: "#FFFFFF" }}>
                      <td style={{ padding: "1.5mm" }}>01</td>
                      <td style={{ padding: "1.5mm" }}>Safe Even If &quot;Background Graphics&quot; Is Unchecked</td>
                      <td style={{ padding: "1.5mm", textAlign: "center" }}>1</td>
                      <td style={{ padding: "1.5mm", textAlign: "right" }}>750.00</td>
                    </tr>
                    <tr style={{ borderBottom: "1pt solid #64748B", background: "#FFFFFF" }}>
                      <td style={{ padding: "1.5mm" }}>02</td>
                      <td style={{ padding: "1.5mm" }}>Zero Toner Waste on Large Black Fills</td>
                      <td style={{ padding: "1.5mm", textAlign: "center" }}>2</td>
                      <td style={{ padding: "1.5mm", textAlign: "right" }}>1,500.00</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          {/* Section 6: Real Printer Physical Verification Instructions */}
          <div
            style={{
              border: "1.5pt solid #173C64",
              borderRadius: "4px",
              padding: "2.5mm",
              background: "#EFF6FF",
            }}
          >
            <div style={{ fontWeight: "bold", fontSize: "8.5pt", color: "#173C64", marginBottom: "1mm", display: "flex", alignItems: "center", gap: "4px" }}>
              <span>✓ PHYSICAL PRINTER TEST PROCEDURE &amp; VERIFICATION CHECKLIST</span>
            </div>
            <div style={{ fontSize: "6.8pt", color: "#1E293B", lineHeight: 1.3 }}>
              <strong>1. Print Command:</strong> Press <kbd style={{ background: "#FFFFFF", padding: "1px 4px", border: "1pt solid #94A3B8", borderRadius: "2px" }}>Ctrl + P</kbd>. In the Chrome print dialog, set <strong>Destination</strong> to your physical printer, <strong>Paper size</strong> to <strong>A4</strong>, and <strong>Scale</strong> to <strong>Default (100%)</strong>. Ensure <strong>Background graphics</strong> is enabled.<br />
              <strong>2. Check Top/Bottom Borders:</strong> Verify the top gold metallic stripe and bottom navy stripe appear completely without clipping. If the top stripe is cut off, set your Margin Preset to <strong>&quot;Office Safe (5mm)&quot;</strong> in PDF Designer.<br />
              <strong>3. Inspect Card Borders:</strong> Check the table lines and card borders above. If lines appear faint or dotted on your monochrome printer, set <strong>Border Contrast</strong> to <strong>&quot;High Contrast (#64748B)&quot;</strong> or <strong>&quot;Maximum B&amp;W (#1E293B)&quot;</strong>.<br />
              <strong>4. Test Background Graphics Off:</strong> Print a second copy with &quot;Background graphics&quot; unchecked in Chrome. Notice how Printer-Friendly Mode maintains sharp readable text and solid borders without dark toner blobs.
            </div>
          </div>
        </div>

        {/* ── Bottom Decorative Navy Border (with 4.0mm Safety Inset & 0mm Outer Comparison) ── */}
        <div
          style={{
            position: "absolute",
            bottom: "4.0mm",
            left: "5mm",
            right: "5mm",
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
            fontFamily: "sans-serif",
          }}
        >
          <span>DUBAI ERP PRINT-SAFE BOTTOM BORDER (DEEP NAVY #173C64)</span>
          <span style={{ fontSize: "5.5pt", opacity: 0.9 }}>INSET: 4.0mm SAFE ZONE</span>
          <span>صفحة المعايرة والطباعة المعتمدة</span>
        </div>

        {/* Outer 0mm bottom ruler line */}
        <div
          style={{
            position: "absolute",
            bottom: 0,
            left: 0,
            right: 0,
            height: "1.5mm",
            background: "#CBD5E1",
            borderTop: "0.5pt dashed #94A3B8",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: "6pt",
            color: "#64748B",
            fontFamily: "monospace",
          }}
        >
          0mm OUTER SHEET EDGE — Hardware roller zone. Essential elements must stay above 4.0mm.
        </div>
      </div>
    </div>
  );
}

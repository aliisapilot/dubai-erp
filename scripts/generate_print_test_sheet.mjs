import assert from "node:assert/strict";
import { writeFileSync, readFileSync, mkdirSync, copyFileSync } from "node:fs";
import { join } from "node:path";
import { execFileSync } from "node:child_process";

const ARTIFACTS_DIR = process.env.ARTIFACTS_DIR || join(process.cwd(), "test-output");
const OUT_DIR = join(process.cwd(), "test-output", "physical-print");
mkdirSync(OUT_DIR, { recursive: true });
mkdirSync(ARTIFACTS_DIR, { recursive: true });


const CHROME_PATH = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";

console.log("================================================================================");
console.log("DUBAI ERP: GENERATING A4 PHYSICAL PRINT CALIBRATION TEST SHEET");
console.log("================================================================================\n");

function countPdfPages(pdfBuffer) {
  let count = 0;
  let pos = 0;
  const target = Buffer.from("/Type /Page\n");
  const target2 = Buffer.from("/Type /Page/");
  const target3 = Buffer.from("/Type /Page ");

  while (pos < pdfBuffer.length) {
    const idx1 = pdfBuffer.indexOf(target, pos);
    const idx2 = pdfBuffer.indexOf(target2, pos);
    const idx3 = pdfBuffer.indexOf(target3, pos);

    const indices = [idx1, idx2, idx3].filter((i) => i !== -1);
    if (indices.length === 0) break;
    const nextIdx = Math.min(...indices);
    count++;
    pos = nextIdx + 11;
  }
  return count;
}

const htmlContent = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Dubai ERP - Physical Print Calibration Sheet</title>
  <style>
    @page {
      size: 210mm 297mm;
      margin: 0;
    }
    * {
      box-sizing: border-box;
      -webkit-print-color-adjust: exact !important;
      print-color-adjust: exact !important;
      color-adjust: exact !important;
    }
    html, body {
      margin: 0;
      padding: 0;
      width: 210mm;
      height: 297mm;
      background: #FFFFFF;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      color: #0F172A;
      overflow: hidden;
    }
    .sheet {
      width: 210mm;
      height: 297mm;
      position: relative;
      background: #FFFFFF;
      overflow: hidden;
      page-break-after: avoid;
    }
    /* Outer 0mm ruler (hardware margin indicator) */
    .edge-ruler-top {
      position: absolute;
      top: 0;
      left: 0;
      right: 0;
      height: 1.5mm;
      background: #CBD5E1;
      border-bottom: 0.5pt dashed #64748B;
      text-align: center;
      font-size: 5pt;
      font-family: monospace;
      color: #334155;
      line-height: 1.5mm;
    }
    .edge-ruler-bottom {
      position: absolute;
      bottom: 0;
      left: 0;
      right: 0;
      height: 1.5mm;
      background: #CBD5E1;
      border-top: 0.5pt dashed #64748B;
      text-align: center;
      font-size: 5pt;
      font-family: monospace;
      color: #334155;
      line-height: 1.5mm;
    }
    /* Dubai ERP Decorative Top Border (Office Safe: Inset 3.5mm) */
    .top-gold-border {
      position: absolute;
      top: 3.5mm;
      left: 6mm;
      right: 6mm;
      height: 4mm;
      background: linear-gradient(90deg, #173C64 0%, #C9A227 25%, #E0AC23 50%, #C9A227 75%, #173C64 100%);
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 0 5mm;
      color: #FFFFFF;
      font-size: 6.5pt;
      font-weight: bold;
      letter-spacing: 0.5px;
    }
    /* Dubai ERP Decorative Bottom Border (Office Safe: Inset 4.0mm) */
    .bottom-navy-border {
      position: absolute;
      bottom: 4.0mm;
      left: 6mm;
      right: 6mm;
      height: 4mm;
      background: #173C64;
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 0 5mm;
      color: #FFFFFF;
      font-size: 6.5pt;
      font-weight: bold;
      letter-spacing: 0.5px;
    }
    /* Main Content Container */
    .content {
      padding: 9.5mm 9mm 9.5mm 9mm;
      height: 100%;
      display: flex;
      flex-direction: column;
      justify-content: space-between;
      font-size: 7.5pt;
      line-height: 1.25;
    }
    .header-box {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      border-bottom: 2pt solid #173C64;
      padding-bottom: 1.5mm;
    }
    .card {
      border: 1.2pt solid #64748B;
      border-radius: 4px;
      padding: 2.2mm 2.8mm;
      background: #FFFFFF;
    }
    .card-title {
      font-weight: bold;
      font-size: 8pt;
      color: #173C64;
      margin-bottom: 1.2mm;
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    .grid-6 {
      display: grid;
      grid-template-columns: repeat(6, 1fr);
      gap: 2mm;
      text-align: center;
    }
    .grid-2 {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 3mm;
    }
  </style>
</head>
<body>
  <div class="sheet">
    <div class="edge-ruler-top">
      0mm SHEET TOP EDGE — (Cut off if printer roller margin &gt; 0mm. Inset borders protect against this!)
    </div>

    <div class="top-gold-border">
      <span>DUBAI ERP PRINT-SAFE TOP BORDER (METALLIC GOLD #E0AC23)</span>
      <span style="font-size: 5.5pt; opacity: 0.9;">INSET: 3.5mm HARDWARE SAFE ZONE</span>
      <span>نظام دبي لإدارة المؤسسات</span>
    </div>

    <div class="content">
      <!-- Title -->
      <div class="header-box">
        <div>
          <div style="font-size: 13pt; font-weight: 800; color: #173C64; letter-spacing: -0.3px;">
            DUBAI ERP — PHYSICAL PRINT CALIBRATION SHEET
          </div>
          <div style="font-size: 7pt; color: #475569; margin-top: 1px;">
            Standard: ISO 210 × 297 mm A4 | Engine: Dubai ERP Print Optimizer v2.4 | Color Profiles: sRGB &amp; Grayscale Laser
          </div>
        </div>
        <div style="text-align: right; font-size: 6.8pt; background: #F8FAFC; border: 1pt solid #CBD5E1; padding: 2px 6px; border-radius: 3px;">
          <div><strong>Scale:</strong> 100% (Do NOT Fit to Page)</div>
          <div><strong>Paper:</strong> A4 (210 × 297 mm)</div>
          <div><strong>Background:</strong> Graphics Enabled</div>
        </div>
      </div>

      <!-- Section 1: Non-Printable Margin Calibrator -->
      <div class="card" style="background: #F8FAFC;">
        <div class="card-title">
          <span>1. HARDWARE NON-PRINTABLE MARGIN RULER (MEASURE CUTOFFS)</span>
          <span style="font-size: 6.5pt; color: #64748B; font-weight: normal;">Standard office laser deadzone: 3.5mm – 5.0mm</span>
        </div>
        <div style="font-size: 6.8pt; color: #475569; margin-bottom: 1.5mm;">
          Check which boxes below are printed completely without cutoff. If boxes under 3.5mm are clipped, use the <strong>"Office Safe (5mm)"</strong> preset in PDF Designer.
        </div>
        <div class="grid-6">
          <div style="border: 1pt dashed #94A3B8; background: #F1F5F9; padding: 1.5mm 1mm; border-radius: 3px;">
            <div style="font-weight: bold; font-size: 7.5pt; color: #64748B;">1.0 mm</div>
            <div style="font-size: 5.5pt; color: #64748B;">Full-bleed only</div>
            <div style="font-size: 5.5pt; color: #DC2626; font-weight: bold;">⚠ CLIPPED</div>
          </div>
          <div style="border: 1pt dashed #94A3B8; background: #F1F5F9; padding: 1.5mm 1mm; border-radius: 3px;">
            <div style="font-weight: bold; font-size: 7.5pt; color: #64748B;">2.0 mm</div>
            <div style="font-size: 5.5pt; color: #64748B;">Cut on most lasers</div>
            <div style="font-size: 5.5pt; color: #DC2626; font-weight: bold;">⚠ CLIPPED</div>
          </div>
          <div style="border: 1.2pt solid #173C64; background: #FFFFFF; padding: 1.5mm 1mm; border-radius: 3px;">
            <div style="font-weight: bold; font-size: 7.5pt; color: #173C64;">3.5 mm</div>
            <div style="font-size: 5.5pt; color: #334155;">Dubai ERP Safe Inset</div>
            <div style="font-size: 5.5pt; color: #059669; font-weight: bold;">✓ PRINT SAFE</div>
          </div>
          <div style="border: 1.2pt solid #173C64; background: #FFFFFF; padding: 1.5mm 1mm; border-radius: 3px;">
            <div style="font-weight: bold; font-size: 7.5pt; color: #173C64;">5.0 mm</div>
            <div style="font-size: 5.5pt; color: #334155;">Office Laser Standard</div>
            <div style="font-size: 5.5pt; color: #059669; font-weight: bold;">✓ PRINT SAFE</div>
          </div>
          <div style="border: 1.2pt solid #173C64; background: #FFFFFF; padding: 1.5mm 1mm; border-radius: 3px;">
            <div style="font-weight: bold; font-size: 7.5pt; color: #173C64;">8.0 mm</div>
            <div style="font-size: 5.5pt; color: #334155;">Document Body Safe</div>
            <div style="font-size: 5.5pt; color: #059669; font-weight: bold;">✓ RECOMMENDED</div>
          </div>
          <div style="border: 1.2pt solid #173C64; background: #FFFFFF; padding: 1.5mm 1mm; border-radius: 3px;">
            <div style="font-weight: bold; font-size: 7.5pt; color: #173C64;">12.0 mm</div>
            <div style="font-size: 5.5pt; color: #334155;">Corporate Header Safe</div>
            <div style="font-size: 5.5pt; color: #059669; font-weight: bold;">✓ PRINT SAFE</div>
          </div>
        </div>
      </div>

      <!-- Section 2: Border Thickness Calibration -->
      <div class="card">
        <div class="card-title">
          <span>2. BORDER THICKNESS &amp; CONTRAST (TEST AGAINST LASER HALFTONE DROP)</span>
          <span style="font-size: 6.5pt; color: #64748B; font-weight: normal;">Solid print-safe lines vs pale CSS borders</span>
        </div>
        <div class="grid-2">
          <!-- Left Column -->
          <div style="display: flex; flex-direction: column; gap: 1.5mm;">
            <div>
              <div style="display: flex; justify-content: space-between; font-size: 6.5pt; color: #334155; margin-bottom: 1px;">
                <span><strong>0.25 pt (0.33 px) Hairline</strong> (Navy #173C64)</span>
                <span style="color: #DC2626;">⚠ Fails on low-DPI laser</span>
              </div>
              <div style="border-bottom: 0.25pt solid #173C64; width: 100%;"></div>
            </div>
            <div>
              <div style="display: flex; justify-content: space-between; font-size: 6.5pt; color: #334155; margin-bottom: 1px;">
                <span><strong>0.50 pt (0.67 px) Fine Line</strong> (Navy #173C64)</span>
                <span style="color: #D97706;">Acceptable for sub-grids</span>
              </div>
              <div style="border-bottom: 0.5pt solid #173C64; width: 100%;"></div>
            </div>
            <div>
              <div style="display: flex; justify-content: space-between; font-size: 6.5pt; color: #334155; margin-bottom: 1px;">
                <span><strong>1.00 pt (1.33 px) Standard Card Border</strong> (Navy #173C64)</span>
                <span style="color: #059669; font-weight: bold;">✓ Dubai ERP Default (Recommended)</span>
              </div>
              <div style="border-bottom: 1pt solid #173C64; width: 100%;"></div>
            </div>
            <div>
              <div style="display: flex; justify-content: space-between; font-size: 6.5pt; color: #334155; margin-bottom: 1px;">
                <span><strong>1.50 pt (2.00 px) High Contrast Border</strong> (Navy #173C64)</span>
                <span style="color: #059669; font-weight: bold;">✓ High Readability Mode</span>
              </div>
              <div style="border-bottom: 1.5pt solid #173C64; width: 100%;"></div>
            </div>
            <div>
              <div style="display: flex; justify-content: space-between; font-size: 6.5pt; color: #334155; margin-bottom: 1px;">
                <span><strong>2.00 pt (2.67 px) Heavy Framing</strong> (Navy #173C64)</span>
                <span style="color: #173C64; font-weight: bold;">Totals &amp; Table Header Border</span>
              </div>
              <div style="border-bottom: 2pt solid #173C64; width: 100%;"></div>
            </div>
          </div>

          <!-- Right Column -->
          <div style="display: flex; flex-direction: column; gap: 1.5mm;">
            <div>
              <div style="display: flex; justify-content: space-between; font-size: 6.5pt; color: #334155; margin-bottom: 1px;">
                <span><strong>0.50 pt Faint Slate (#CBD5E1)</strong></span>
                <span style="color: #DC2626;">⚠ 84% Lightness (vanishes in B&amp;W)</span>
              </div>
              <div style="border-bottom: 0.5pt solid #CBD5E1; width: 100%;"></div>
            </div>
            <div>
              <div style="display: flex; justify-content: space-between; font-size: 6.5pt; color: #334155; margin-bottom: 1px;">
                <span><strong>1.00 pt Faint Slate (#CBD5E1)</strong></span>
                <span style="color: #D97706;">Faint halftone dots on paper</span>
              </div>
              <div style="border-bottom: 1pt solid #CBD5E1; width: 100%;"></div>
            </div>
            <div>
              <div style="display: flex; justify-content: space-between; font-size: 6.5pt; color: #334155; margin-bottom: 1px;">
                <span><strong>1.00 pt High-Contrast Slate (#64748B)</strong></span>
                <span style="color: #059669; font-weight: bold;">✓ Dubai ERP High Contrast Fix</span>
              </div>
              <div style="border-bottom: 1pt solid #64748B; width: 100%;"></div>
            </div>
            <div>
              <div style="display: flex; justify-content: space-between; font-size: 6.5pt; color: #334155; margin-bottom: 1px;">
                <span><strong>1.50 pt Maximum B&amp;W Slate (#1E293B)</strong></span>
                <span style="color: #059669; font-weight: bold;">✓ 100% Solid Dark Line in B&amp;W</span>
              </div>
              <div style="border-bottom: 1.5pt solid #1E293B; width: 100%;"></div>
            </div>
            <div>
              <div style="display: flex; justify-content: space-between; font-size: 6.5pt; color: #334155; margin-bottom: 1px;">
                <span><strong>2.00 pt Gold Accent (#E0AC23)</strong></span>
                <span style="color: #B45309; font-weight: bold;">Rich Gold / Clean Gray</span>
              </div>
              <div style="border-bottom: 2pt solid #E0AC23; width: 100%;"></div>
            </div>
          </div>
        </div>
      </div>

      <!-- Section 3: Palette Halftoning -->
      <div class="card" style="background: #F8FAFC;">
        <div class="card-title">
          <span>3. BRAND COLORS &amp; MONOCHROME LASER HALFTONE CHECK</span>
          <span style="font-size: 6.5pt; color: #64748B; font-weight: normal;">Densitometer comparison for B&amp;W printers</span>
        </div>
        <div class="grid-6">
          <div style="background: #173C64; color: #FFFFFF; padding: 2mm 1mm; border-radius: 3px; font-size: 6.5pt;">
            <div style="font-weight: bold;">Primary Navy</div>
            <div style="font-family: monospace; font-size: 5.5pt;">#173C64</div>
            <div style="font-size: 5pt; opacity: 0.9;">100% Dark Solid</div>
          </div>
          <div style="background: #E0AC23; color: #000000; padding: 2mm 1mm; border-radius: 3px; font-size: 6.5pt;">
            <div style="font-weight: bold;">Metallic Gold</div>
            <div style="font-family: monospace; font-size: 5.5pt;">#E0AC23</div>
            <div style="font-size: 5pt; opacity: 0.9;">Medium Gray (Sharp)</div>
          </div>
          <div style="background: #0F172A; color: #FFFFFF; padding: 2mm 1mm; border-radius: 3px; font-size: 6.5pt;">
            <div style="font-weight: bold;">Dark Navy</div>
            <div style="font-family: monospace; font-size: 5.5pt;">#0F172A</div>
            <div style="font-size: 5pt; opacity: 0.9;">Solid Black</div>
          </div>
          <div style="background: #64748B; color: #FFFFFF; padding: 2mm 1mm; border-radius: 3px; font-size: 6.5pt;">
            <div style="font-weight: bold;">High Contrast</div>
            <div style="font-family: monospace; font-size: 5.5pt;">#64748B</div>
            <div style="font-size: 5pt; opacity: 0.9;">Crisp Gray Line</div>
          </div>
          <div style="background: #CBD5E1; color: #0F172A; padding: 2mm 1mm; border-radius: 3px; font-size: 6.5pt; border: 0.5pt solid #94A3B8;">
            <div style="font-weight: bold;">Border Slate</div>
            <div style="font-family: monospace; font-size: 5.5pt;">#CBD5E1</div>
            <div style="font-size: 5pt; opacity: 0.9;">Light Halftone</div>
          </div>
          <div style="background: #F8FAFC; color: #0F172A; padding: 2mm 1mm; border-radius: 3px; font-size: 6.5pt; border: 0.5pt solid #CBD5E1;">
            <div style="font-weight: bold;">Light Background</div>
            <div style="font-family: monospace; font-size: 5.5pt;">#F8FAFC</div>
            <div style="font-size: 5pt; opacity: 0.9;">Clean White</div>
          </div>
        </div>
      </div>

      <!-- Section 4: Font Legibility Ladder -->
      <div class="card">
        <div class="card-title">
          <span>4. FONT LEGIBILITY LADDER (ENGLISH &amp; ARABIC FTA COMPLIANCE)</span>
          <span style="font-size: 6.5pt; color: #64748B; font-weight: normal;">UAE FTA Tax Invoice minimum legibility</span>
        </div>
        <div class="grid-2">
          <!-- English Ladder -->
          <div style="display: flex; flex-direction: column; gap: 0.8mm;">
            <div style="font-size: 10pt; border-bottom: 0.5pt solid #F1F5F9; padding-bottom: 1px;">
              <span style="font-weight: bold; color: #173C64; font-size: 6.5pt; margin-right: 3px;">[10pt]</span>
              <strong>TAX INVOICE #INV-2026-0042</strong> — AED 142,500.00
            </div>
            <div style="font-size: 8.5pt; border-bottom: 0.5pt solid #F1F5F9; padding-bottom: 1px;">
              <span style="font-weight: bold; color: #173C64; font-size: 6.5pt; margin-right: 3px;">[8.5pt]</span>
              Tax Registration Number (TRN): 100234567800003 (Standard)
            </div>
            <div style="font-size: 8.0pt; border-bottom: 0.5pt solid #F1F5F9; padding-bottom: 1px;">
              <span style="font-weight: bold; color: #173C64; font-size: 6.5pt; margin-right: 3px;">[8.0pt]</span>
              15–18 Items Fit Profile: Precision Machined Fasteners DIN 933
            </div>
            <div style="font-size: 7.5pt; border-bottom: 0.5pt solid #F1F5F9; padding-bottom: 1px;">
              <span style="font-weight: bold; color: #173C64; font-size: 6.5pt; margin-right: 3px;">[7.5pt]</span>
              20–25 Items Fit Profile: Dubai ERP Default Minimum Readable Floor
            </div>
            <div style="font-size: 7.0pt; border-bottom: 0.5pt solid #F1F5F9; padding-bottom: 1px;">
              <span style="font-weight: bold; color: #173C64; font-size: 6.5pt; margin-right: 3px;">[7.0pt]</span>
              28–30 Items Compact Profile: Fully readable on laser &amp; inkjet paper
            </div>
            <div style="font-size: 6.0pt; color: #DC2626;">
              <span style="font-weight: bold; font-size: 6.5pt; margin-right: 3px;">[6.0pt]</span>
              WARNING: 6.0pt is below recommended threshold — prone to ink bleed
            </div>
          </div>

          <!-- Arabic Ladder -->
          <div style="display: flex; flex-direction: column; gap: 0.8mm; direction: rtl; text-align: right;">
            <div style="font-size: 10pt; border-bottom: 0.5pt solid #F1F5F9; padding-bottom: 1px;">
              <span style="font-weight: bold; color: #173C64; font-size: 6.5pt; margin-left: 3px;">[10pt]</span>
              <strong>فاتورة ضريبية #INV-2026-0042</strong> — 142,500.00 د.إ
            </div>
            <div style="font-size: 8.5pt; border-bottom: 0.5pt solid #F1F5F9; padding-bottom: 1px;">
              <span style="font-weight: bold; color: #173C64; font-size: 6.5pt; margin-left: 3px;">[8.5pt]</span>
              رقم التسجيل الضريبي: 100234567800003 (النص القياسي)
            </div>
            <div style="font-size: 8.0pt; border-bottom: 0.5pt solid #F1F5F9; padding-bottom: 1px;">
              <span style="font-weight: bold; color: #173C64; font-size: 6.5pt; margin-left: 3px;">[8.0pt]</span>
              ملف التنسيق المتوازن (15-18 بنداً): توريد مواد بناء ومعدات
            </div>
            <div style="font-size: 7.5pt; border-bottom: 0.5pt solid #F1F5F9; padding-bottom: 1px;">
              <span style="font-weight: bold; color: #173C64; font-size: 6.5pt; margin-left: 3px;">[7.5pt]</span>
              ملف التنسيق القياسي (20-25 بنداً): الحد الأدنى الافتراضي المقروء
            </div>
            <div style="font-size: 7.0pt; border-bottom: 0.5pt solid #F1F5F9; padding-bottom: 1px;">
              <span style="font-weight: bold; color: #173C64; font-size: 6.5pt; margin-left: 3px;">[7.0pt]</span>
              الوضع المضغوط (30 بنداً): مقروء بوضوح تام على ورق A4
            </div>
            <div style="font-size: 6.0pt; color: #DC2626;">
              <span style="font-weight: bold; font-size: 6.5pt; margin-left: 3px;">[6.0pt]</span>
              تنبيه: حجم 6 نقاط غير موصى به لصعوبة قراءته على بعض الطابعات
            </div>
          </div>
        </div>
      </div>

      <!-- Section 5: Real Table Comparison: Full Color vs Printer-Friendly -->
      <div class="card" style="background: #F8FAFC;">
        <div class="card-title">
          <span>5. SAMPLE TABLE RENDERING: STANDARD THEME VS PRINTER-FRIENDLY MODE</span>
          <span style="font-size: 6.5pt; color: #64748B; font-weight: normal;">Tested with Background Graphics ON and OFF</span>
        </div>
        <div class="grid-2">
          <!-- Standard Theme -->
          <div>
            <div style="font-size: 6.5pt; font-weight: bold; color: #173C64; margin-bottom: 1mm;">
              STANDARD THEME (Dark Navy Header #173C64 + Gold Bar)
            </div>
            <table style="width: 100%; border-collapse: collapse; font-size: 6.5pt;">
              <thead>
                <tr style="background: #173C64; color: #FFFFFF;">
                  <th style="padding: 1.2mm; text-align: left;">#</th>
                  <th style="padding: 1.2mm; text-align: left;">Item Description</th>
                  <th style="padding: 1.2mm; text-align: center;">Qty</th>
                  <th style="padding: 1.2mm; text-align: right;">Total (AED)</th>
                </tr>
              </thead>
              <tbody>
                <tr style="border-bottom: 1pt solid #CBD5E1; background: #FFFFFF;">
                  <td style="padding: 1.2mm;">01</td>
                  <td style="padding: 1.2mm;">A4 Laser Printer Calibration Standard</td>
                  <td style="padding: 1.2mm; text-align: center;">1</td>
                  <td style="padding: 1.2mm; text-align: right;">750.00</td>
                </tr>
                <tr style="border-bottom: 1pt solid #CBD5E1; background: #F8FAFC;">
                  <td style="padding: 1.2mm;">02</td>
                  <td style="padding: 1.2mm;">Precision Optical Test Pattern A4</td>
                  <td style="padding: 1.2mm; text-align: center;">2</td>
                  <td style="padding: 1.2mm; text-align: right;">1,500.00</td>
                </tr>
              </tbody>
            </table>
          </div>

          <!-- Printer Friendly Mode -->
          <div>
            <div style="font-size: 6.5pt; font-weight: bold; color: #334155; margin-bottom: 1mm;">
              PRINTER-FRIENDLY MODE (White Header + 2px Solid Dark Border)
            </div>
            <table style="width: 100%; border-collapse: collapse; font-size: 6.5pt;">
              <thead>
                <tr style="background: #FFFFFF; color: #0F172A; border-bottom: 2pt solid #173C64;">
                  <th style="padding: 1.2mm; text-align: left;">#</th>
                  <th style="padding: 1.2mm; text-align: left;">Item Description</th>
                  <th style="padding: 1.2mm; text-align: center;">Qty</th>
                  <th style="padding: 1.2mm; text-align: right;">Total (AED)</th>
                </tr>
              </thead>
              <tbody>
                <tr style="border-bottom: 1pt solid #64748B; background: #FFFFFF;">
                  <td style="padding: 1.2mm;">01</td>
                  <td style="padding: 1.2mm;">Guaranteed Readable if "Background Graphics" is OFF</td>
                  <td style="padding: 1.2mm; text-align: center;">1</td>
                  <td style="padding: 1.2mm; text-align: right;">750.00</td>
                </tr>
                <tr style="border-bottom: 1pt solid #64748B; background: #FFFFFF;">
                  <td style="padding: 1.2mm;">02</td>
                  <td style="padding: 1.2mm;">Zero Toner Waste on Large Black Fills</td>
                  <td style="padding: 1.2mm; text-align: center;">2</td>
                  <td style="padding: 1.2mm; text-align: right;">1,500.00</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <!-- Section 6: Physical Printer Verification Checklist -->
      <div style="border: 1.5pt solid #173C64; border-radius: 4px; padding: 2.2mm 2.8mm; background: #EFF6FF;">
        <div style="font-weight: bold; font-size: 8pt; color: #173C64; margin-bottom: 1mm;">
          ✓ PHYSICAL PRINTER TEST PROCEDURE &amp; VERIFICATION CHECKLIST
        </div>
        <div style="font-size: 6.8pt; color: #1E293B; line-height: 1.3;">
          <strong>1. Print Command:</strong> Press <span style="background: #FFFFFF; padding: 1px 4px; border: 1pt solid #94A3B8; border-radius: 2px; font-weight: bold;">Ctrl + P</span>. Set <strong>Destination</strong> to your physical printer, <strong>Paper size</strong> to <strong>A4</strong>, and <strong>Scale</strong> to <strong>Default (100%)</strong>. Ensure <strong>Background graphics</strong> is enabled.<br>
          <strong>2. Check Top/Bottom Borders:</strong> Verify the top gold stripe and bottom navy stripe appear completely. If the top stripe is clipped, set Margin Preset to <strong>"Office Safe (5mm)"</strong> in PDF Designer.<br>
          <strong>3. Inspect Card Borders:</strong> Check the table lines and card borders above. If lines appear faint or dotted on your monochrome printer, set <strong>Border Contrast</strong> to <strong>"High Contrast (#64748B)"</strong> or <strong>"Maximum B&amp;W (#1E293B)"</strong>.<br>
          <strong>4. Test Background Graphics Off:</strong> Print a copy with "Background graphics" unchecked in Chrome. Confirm Printer-Friendly Mode maintains sharp text and solid borders.
        </div>
      </div>
    </div>

    <!-- Bottom Navy Border (Office Safe: Inset 4.0mm) -->
    <div class="bottom-navy-border">
      <span>DUBAI ERP PRINT-SAFE BOTTOM BORDER (DEEP NAVY #173C64)</span>
      <span style="font-size: 5.5pt; opacity: 0.9;">INSET: 4.0mm HARDWARE SAFE ZONE</span>
      <span>صفحة المعايرة والطباعة المعتمدة</span>
    </div>

    <div class="edge-ruler-bottom">
      0mm SHEET BOTTOM EDGE — (Cut off if printer roller margin &gt; 0mm. Inset borders protect against this!)
    </div>
  </div>
</body>
</html>
`;

const htmlPath = join(OUT_DIR, "print_test_sheet.html");
writeFileSync(htmlPath, htmlContent, "utf8");
console.log(`Saved HTML to: ${htmlPath}`);

const pdfPath = join(OUT_DIR, "dubai_erp_print_test_sheet_a4.pdf");
const pngPath = join(OUT_DIR, "dubai_erp_print_test_sheet_a4.png");

// 1. Generate PDF with Chrome headless
console.log("Generating A4 PDF via headless Chrome...");
execFileSync(CHROME_PATH, [
  "--headless",
  "--disable-gpu",
  "--no-pdf-header-footer",
  "--print-to-pdf-no-header",
  `--print-to-pdf=${pdfPath}`,
  htmlPath,
]);

// 2. Generate PNG screenshot with Chrome headless
console.log("Generating A4 PNG preview via headless Chrome...");
execFileSync(CHROME_PATH, [
  "--headless",
  "--disable-gpu",
  "--window-size=1240,1754", // A4 at ~150 DPI
  "--hide-scrollbars",
  `--screenshot=${pngPath}`,
  htmlPath,
]);

// Copy to artifacts dir
const artifactPdf = join(ARTIFACTS_DIR, "dubai_erp_print_test_sheet_a4.pdf");
const artifactPng = join(ARTIFACTS_DIR, "dubai_erp_print_test_sheet_a4.png");
copyFileSync(pdfPath, artifactPdf);
copyFileSync(pngPath, artifactPng);
console.log(`Copied PDF artifact to: ${artifactPdf}`);
console.log(`Copied PNG artifact to: ${artifactPng}`);

// Verify PDF
const pdfBuffer = readFileSync(pdfPath);
const pageCount = countPdfPages(pdfBuffer);
console.log(`\nVerified PDF Page Count: ${pageCount}`);
assert.equal(pageCount, 1, `Calibration sheet must fit on exactly 1 A4 page, got ${pageCount}`);

console.log("\n================================================================================");
console.log("SUCCESS: A4 PHYSICAL PRINT CALIBRATION SHEET GENERATED & VERIFIED");
console.log("================================================================================");

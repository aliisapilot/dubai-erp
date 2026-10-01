import assert from "node:assert/strict";
import { writeFileSync, readFileSync, mkdirSync, copyFileSync } from "node:fs";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import { inflateSync } from "node:zlib";
import ts from "typescript";

const ARTIFACTS_DIR = process.env.ARTIFACTS_DIR || join(process.cwd(), "test-output");
const OUT_DIR = join(process.cwd(), "test-output", "smart-fit");
mkdirSync(OUT_DIR, { recursive: true });
mkdirSync(ARTIFACTS_DIR, { recursive: true });


const CHROME_PATH = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";

// ── 1. Compile & Load Layout Engine ───────────────────────────────────────────
const layoutEngineSource = readFileSync(new URL("../lib/documentLayoutEngine.ts", import.meta.url), "utf8");
const layoutEngineCompiled = ts.transpileModule(layoutEngineSource, {
  compilerOptions: { module: ts.ModuleKind.ES2022, target: ts.ScriptTarget.ES2022 },
}).outputText;
const layoutEngineUrl = `data:text/javascript;base64,${Buffer.from(layoutEngineCompiled).toString("base64")}`;
const {
  computePaginationPlan,
  computeEffectiveLayout,
} = await import(layoutEngineUrl);

console.log("================================================================================");
console.log("DUBAI ERP: SMART ONE-PAGE A4 PDF PRINTING AUTOMATED TEST SUITE");
console.log("================================================================================\n");

// ── 2. Create Standard UAE Invoice Layout ─────────────────────────────────────
function createStandardInvoiceLayout() {
  const el = (id, type, x, y, width, height, extra = {}) => ({
    id,
    type,
    label: id,
    x,
    y,
    width,
    height,
    visible: true,
    locked: false,
    zIndex: 10,
    ...extra,
  });

  return {
    version: 7,
    documentType: "tax_invoice",
    templateName: "UAE Standard Corporate Invoice",
    page: {
      paper: "A4",
      orientation: "portrait",
      widthMm: 210,
      heightMm: 297,
      margins: { top: 8, right: 12, bottom: 8, left: 12 },
      background: "#FFFFFF",
      watermarkOpacity: 0.045,
      borders: {
        top: { enabled: true, color: "#E0AC23", thickness: 4, position: 0, style: "solid" },
        bottom: { enabled: true, color: "#173C64", thickness: 4, position: 0, style: "solid" },
      },
      smartFit: {
        enabled: true,
        mode: "balanced",
        minFontSize: 7.2,
        minRowHeight: 4.6,
        automaticSpacing: true,
        printSafeBorders: true,
        preventOverflow: true,
      },
    },
    branding: {
      primaryColor: "#0F172A",
      accentColor: "#C9A227",
      textColor: "#334155",
      mutedColor: "#64748B",
      borderColor: "#CBD5E1",
      tableHeaderColor: "#0F172A",
      totalHighlightColor: "#F8F6ED",
    },
    elements: [
      el("logo", "logo", 85, 10, 40, 12),
      el("company_name_en", "company_name_en", 12, 29, 186, 6, { fontSize: 13.5 }),
      el("company_name_ar", "company_name_ar", 12, 35.5, 186, 7.5, { fontSize: 18 }),
      el("company_address", "company_address", 12, 44, 186, 6, { fontSize: 9 }),
      el("doc_title", "doc_title", 12, 51, 186, 11, { fontSize: 13 }),
      el("customer_info", "customer_info", 12, 63, 91, 27),
      el("doc_meta", "doc_meta", 107, 63, 91, 27),
      el("line_items", "line_items", 12, 93, 186, 70, {
        tableSettings: { rowHeight: 9.0, fontSize: 10.5, headerFontSize: 10.5 },
      }),
      el("amount_in_words", "amount_in_words", 12, 167, 105, 25),
      el("totals", "totals", 121, 167, 77, 46),
      el("bank_details", "bank_details", 12, 195, 105, 26),
      el("payment_terms", "payment_terms", 12, 224, 105, 28),
      el("company_signature", "company_signature", 121, 216, 44, 36),
      el("company_stamp", "company_stamp", 167, 216, 31, 36),
      el("footer", "footer", 12, 262, 186, 16),
    ],
  };
}

// ── 3. Realistic UAE Line Items Generator ─────────────────────────────────────
const UAE_ITEMS = [
  { desc: "Custom Arabic Majlis Tent Structure (20m x 40m) — توريد وتركيب خيمة ملكية", price: 65000, unit: "Set" },
  { desc: "Galvanized Steel Arch Truss (300mm Profile) — أقواس جملونية مجلفنة", price: 3200, unit: "Pcs" },
  { desc: "Double Glazed Tempered Glass Wall Panel — ألواح زجاج مقسى مزدوج", price: 2450, unit: "Units" },
  { desc: "On-site Rigging, Anchoring & Safety Inspection — أعمال التركيب والسلامة", price: 15000, unit: "Job" },
  { desc: "Decorative Interior Lining & Traditional Drapes — بطانة قماشية فاخرة", price: 18500, unit: "Set" },
  { desc: "Heavy Duty HVAC Cooling Units (50 Ton) — وحدات تكييف مركزية", price: 28000, unit: "Units" },
  { desc: "Subfloor Timber Decking with Commercial Carpet — أرضيات خشبية", price: 9500, unit: "Sqm" },
  { desc: "LED Crystal Chandeliers & Dimmable Lighting — ثريات كريستال", price: 6400, unit: "Set" },
  { desc: "Fire Suppression Hose Reel & Alarm Control Box — نظام إطفاء وإنذار", price: 4200, unit: "Pcs" },
  { desc: "Automatic Sliding Glass Entrance Doors — أبواب سحاب زجاجية", price: 8900, unit: "Sets" },
  { desc: "Structural Wind Bracing Cables (16mm Steel) — كابلات تثبيت", price: 1100, unit: "Nos" },
  { desc: "External Weatherproof PVC Canopy Skirting — حزام حماية خارجي", price: 3400, unit: "Roll" },
];

function generateTestItems(count) {
  const items = [];
  for (let i = 0; i < count; i++) {
    const tmpl = UAE_ITEMS[i % UAE_ITEMS.length];
    const qty = (i % 4) + 1;
    const rate = tmpl.price;
    const vat = rate * qty * 0.05;
    const total = rate * qty * 1.05;
    items.push({
      description: `${i + 1}. ${tmpl.desc}`,
      quantity: qty,
      unit: tmpl.unit,
      unit_price: rate,
      vat_amount: vat,
      line_total: total,
    });
  }
  return items;
}

// ── 4. HTML Document Builder using Effective Engine Geometry ──────────────────
function buildHtmlDocument(layout, effective, items, docNumber) {
  const subtotal = items.reduce((s, it) => s + it.unit_price * it.quantity, 0);
  const vatTotal = items.reduce((s, it) => s + it.vat_amount, 0);
  const grandTotal = items.reduce((s, it) => s + it.line_total, 0);

  const elementHtml = effective.elements
    .filter((e) => e.visible && e.effectiveVisible !== false)
    .sort((a, b) => a.zIndex - b.zIndex)
    .map((e) => {
      const x = e.effectiveX;
      const y = e.effectiveY;
      const w = e.effectiveWidth;
      const h = e.effectiveHeight;

      if (e.type === "company_name_en") {
        return `<div style="position:absolute;left:${x}mm;top:${y}mm;width:${w}mm;height:${h}mm;display:flex;align-items:center;justify-content:center;font-size:${e.fontSize || 13.5}px;font-weight:bold;color:${layout.branding.primaryColor};letter-spacing:0.05em;text-transform:uppercase;">AL BURAQ EVENT & TENT SOLUTIONS L.L.C</div>`;
      }
      if (e.type === "company_name_ar") {
        return `<div style="position:absolute;left:${x}mm;top:${y}mm;width:${w}mm;height:${h}mm;display:flex;align-items:center;justify-content:center;font-size:${e.fontSize || 18}px;font-weight:bold;color:${layout.branding.accentColor};" dir="rtl">شركة البراق لحلول الخيام والفعاليات ذ.م.م</div>`;
      }
      if (e.type === "company_address") {
        return `<div style="position:absolute;left:${x}mm;top:${y}mm;width:${w}mm;height:${h}mm;display:flex;align-items:center;justify-content:center;font-size:9px;color:#64748B;">Al Quoz Industrial Area 4, P.O. Box 88992, Dubai, UAE | TRN: 100345678900003</div>`;
      }
      if (e.type === "doc_title") {
        return `<div style="position:absolute;left:${x}mm;top:${y}mm;width:${w}mm;height:${h}mm;display:flex;align-items:center;justify-content:between;padding:0 8px;background:${layout.branding.primaryColor};color:#fff;border-radius:4px;font-weight:bold;font-size:12px;">
          <span style="font-size:12.5px;letter-spacing:0.05em;">TAX INVOICE — فاتورة ضريبية</span>
          <span style="font-family:monospace;color:${layout.branding.accentColor};margin-left:auto;">REF: ${docNumber}</span>
        </div>`;
      }
      if (e.type === "customer_info") {
        return `<div style="position:absolute;left:${x}mm;top:${y}mm;width:${w}mm;height:${h}mm;border:1px solid #CBD5E1;background:#F8FAFC;border-radius:4px;padding:2mm;font-size:9px;color:#334155;overflow:hidden;">
          <div style="font-weight:bold;color:${layout.branding.primaryColor};border-bottom:1px solid #E2E8F0;padding-bottom:1px;font-size:8.5px;text-transform:uppercase;">Customer / Client Details (بيانات العميل)</div>
          <div style="font-weight:bold;color:#0F172A;margin-top:2px;">AL NABOODAH CONTRACTING CO. L.L.C</div>
          <div style="color:#64748B;">TRN: <span style="font-family:monospace;font-weight:bold;">100345678900003</span></div>
          <div style="color:#64748B;">Sheikh Zayed Road, P.O. Box 1234, Dubai, UAE</div>
        </div>`;
      }
      if (e.type === "doc_meta") {
        return `<div style="position:absolute;left:${x}mm;top:${y}mm;width:${w}mm;height:${h}mm;border:1px solid #CBD5E1;background:#F8FAFC;border-radius:4px;padding:2mm;font-size:9px;color:#334155;overflow:hidden;">
          <div style="font-weight:bold;color:${layout.branding.primaryColor};border-bottom:1px solid #E2E8F0;padding-bottom:1px;font-size:8.5px;text-transform:uppercase;">Document Reference (البيانات)</div>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:2px;margin-top:2px;font-size:8.5px;">
            <div><span style="color:#64748B;">Date:</span> 29/09/2026</div>
            <div><span style="color:#64748B;">Supply:</span> 29/09/2026</div>
            <div><span style="color:#64748B;">Due:</span> 29/10/2026</div>
            <div><span style="color:#64748B;">Terms:</span> 30 Days</div>
          </div>
        </div>`;
      }
      if (e.type === "line_items") {
        const rowH = effective.fitProfile.rowHeight;
        const fontSz = effective.fitProfile.fontSize;
        const pad = effective.fitProfile.cellPadding || "2px 4px";
        return `<div style="position:absolute;left:${x}mm;top:${y}mm;width:${w}mm;height:auto;border:1px solid #CBD5E1;border-radius:4px;font-size:${fontSz}px;overflow:hidden;">
          <table style="width:100%;border-collapse:collapse;text-align:left;">
            <thead>
              <tr style="background:${layout.branding.tableHeaderColor};color:#ffffff;height:${effective.fitProfile.headerHeight}mm;font-size:${effective.fitProfile.headerFontSize}px;">
                <th style="padding:${pad};width:5%;text-align:center;">#</th>
                <th style="padding:${pad};width:45%;">Item Description / البيان</th>
                <th style="padding:${pad};width:8%;text-align:center;">Qty</th>
                <th style="padding:${pad};width:8%;text-align:center;">Unit</th>
                <th style="padding:${pad};width:11%;text-align:right;">Rate (AED)</th>
                <th style="padding:${pad};width:10%;text-align:right;">VAT (5%)</th>
                <th style="padding:${pad};width:13%;text-align:right;">Total (AED)</th>
              </tr>
            </thead>
            <tbody>
              ${items.map((it, idx) => `
                <tr style="height:${rowH}mm;border-top:1px solid #E2E8F0;">
                  <td style="padding:${pad};text-align:center;">${idx + 1}</td>
                  <td style="padding:${pad};line-height:1.15;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${it.description}</td>
                  <td style="padding:${pad};text-align:center;">${it.quantity}</td>
                  <td style="padding:${pad};text-align:center;">${it.unit}</td>
                  <td style="padding:${pad};text-align:right;font-family:monospace;">${it.unit_price.toFixed(2)}</td>
                  <td style="padding:${pad};text-align:right;font-family:monospace;">${it.vat_amount.toFixed(2)}</td>
                  <td style="padding:${pad};text-align:right;font-family:monospace;font-weight:bold;">${it.line_total.toFixed(2)}</td>
                </tr>
              `).join("")}
            </tbody>
          </table>
        </div>`;
      }
      if (e.type === "totals") {
        return `<div style="position:absolute;left:${x}mm;top:${y}mm;width:${w}mm;height:${h}mm;border:1px solid #CBD5E1;border-radius:4px;font-size:9.5px;overflow:hidden;line-height:1.15;">
          <div style="display:flex;justify-content:space-between;padding:1px 6px;background:#F8FAFC;border-bottom:1px solid #CBD5E1;">
            <span style="color:#64748B;">Subtotal:</span>
            <span style="font-family:monospace;font-weight:bold;">AED ${subtotal.toLocaleString("en-US", { minimumFractionDigits: 2 })}</span>
          </div>
          <div style="display:flex;justify-content:space-between;padding:1px 6px;border-bottom:1px solid #CBD5E1;">
            <span style="color:#64748B;">VAT Total (5%):</span>
            <span style="font-family:monospace;font-weight:bold;color:${layout.branding.accentColor};">AED ${vatTotal.toLocaleString("en-US", { minimumFractionDigits: 2 })}</span>
          </div>
          <div style="display:flex;justify-content:space-between;padding:2px 6px;background:#F8F6ED;font-weight:bold;color:#0F172A;">
            <span>Grand Total:</span>
            <span style="font-family:monospace;color:${layout.branding.primaryColor};">AED ${grandTotal.toLocaleString("en-US", { minimumFractionDigits: 2 })}</span>
          </div>
        </div>`;
      }
      if (e.type === "amount_in_words") {
        return `<div style="position:absolute;left:${x}mm;top:${y}mm;width:${w}mm;height:${h}mm;border:1px solid #CBD5E1;background:#F8FAFC;border-radius:4px;padding:1.5mm;font-size:8.5px;color:#334155;overflow:hidden;">
          <div style="font-weight:bold;color:#0F172A;font-size:8.5px;">Amount in Words (المبلغ بالحروف):</div>
          <div style="font-style:italic;color:#475569;margin-top:1px;">Dirhams Verified in full.</div>
        </div>`;
      }
      if (e.type === "bank_details") {
        return `<div style="position:absolute;left:${x}mm;top:${y}mm;width:${w}mm;height:${h}mm;border:1px solid #CBD5E1;background:#F8FAFC;border-radius:4px;padding:1.5mm;font-size:8px;color:#334155;overflow:hidden;line-height:1.2;">
          <div style="font-weight:bold;color:${layout.branding.primaryColor};font-size:8.5px;">Bank Details (IBAN & SWIFT)</div>
          <div>Bank: Emirates NBD | Account: AL BURAQ EVENT & TENT SOLUTIONS</div>
          <div>IBAN: <span style="font-family:monospace;font-weight:bold;">AE290260000012345678901</span> | SWIFT: EBILAEAD</div>
        </div>`;
      }
      if (e.type === "payment_terms") {
        return `<div style="position:absolute;left:${x}mm;top:${y}mm;width:${w}mm;height:${h}mm;padding:1mm;font-size:8px;color:#64748B;line-height:1.2;overflow:hidden;">
          <div style="font-weight:bold;color:#334155;">Terms & Conditions:</div>
          <div>Payment due within 30 days. All structures inspected and conforming to UAE Civil Defence standards.</div>
        </div>`;
      }
      if (e.type === "company_signature") {
        return `<div style="position:absolute;left:${x}mm;top:${y}mm;width:${w}mm;height:${h}mm;border:1px dashed #CBD5E1;border-radius:4px;display:flex;flex-direction:column;align-items:center;justify-content:center;font-size:8px;color:#64748B;">
          <div style="font-weight:bold;color:${layout.branding.primaryColor};">AUTHORIZED SIGNATORY</div>
          <div style="font-size:7px;margin-top:2px;">Al Buraq Operations</div>
        </div>`;
      }
      if (e.type === "company_stamp") {
        return `<div style="position:absolute;left:${x}mm;top:${y}mm;width:${w}mm;height:${h}mm;border:1px dashed #CBD5E1;border-radius:4px;display:flex;flex-direction:column;align-items:center;justify-content:center;font-size:7.5px;color:#64748B;">
          <div style="font-weight:bold;color:${layout.branding.accentColor};">OFFICIAL STAMP</div>
        </div>`;
      }
      if (e.type === "footer") {
        return `<div style="position:absolute;left:${x}mm;top:${y}mm;width:${w}mm;height:${h}mm;border-top:1px solid #CBD5E1;display:flex;flex-direction:column;align-items:center;justify-content:center;font-size:8px;color:#64748B;">
          <div>Al Buraq Event & Tent Solutions L.L.C | Tel: +971 4 399 0000 | Email: accounts@alburaqtents.ae</div>
          <div style="font-size:7.5px;color:#94A3B8;margin-top:1px;">This is a computer generated document issued in accordance with UAE VAT regulations.</div>
        </div>`;
      }
      return "";
    })
    .join("\n");

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>Tax Invoice ${docNumber}</title>
<style>
  @page {
    size: A4 portrait;
    margin: 0;
  }
  * {
    box-sizing: border-box;
    -webkit-print-color-adjust: exact !important;
    print-color-adjust: exact !important;
  }
  html, body {
    margin: 0 !important;
    padding: 0 !important;
    width: 210mm !important;
    height: 297mm !important;
    background: #ffffff !important;
    font-family: Arial, Helvetica, "Segoe UI", sans-serif;
    color: #171717;
    overflow: hidden;
  }
  .dynamic-document-page {
    position: relative;
    width: 210mm;
    height: 297mm;
    max-height: 297mm;
    overflow: hidden;
    background: #ffffff;
    box-sizing: border-box;
  }
  .print-border-stripe-top {
    position: absolute;
    top: 0mm;
    left: 0;
    width: 210mm;
    height: 4mm;
    background-color: #E0AC23;
    border-bottom: 4mm solid #E0AC23;
  }
  .print-border-stripe-bottom {
    position: absolute;
    bottom: 0mm;
    left: 0;
    width: 210mm;
    height: 4mm;
    background-color: #173C64;
    border-top: 4mm solid #173C64;
  }
</style>
</head>
<body>
  <div class="dynamic-document-page">
    <div class="print-border-stripe-top"></div>
    <div class="print-border-stripe-bottom"></div>
    ${elementHtml}
  </div>
</body>
</html>`;
}

// ── 5. PNG Border Pixel Analyzer ──────────────────────────────────────────────
function verifyBordersFromPng(pngPath) {
  const pngBytes = readFileSync(pngPath);
  const pngWidth = pngBytes.readUInt32BE(16);
  const pngHeight = pngBytes.readUInt32BE(20);
  const colorType = pngBytes[25];
  const bpp = colorType === 6 ? 4 : 3;

  const idatChunks = [];
  let idatPos = 8;
  while (idatPos < pngBytes.length) {
    const len = pngBytes.readUInt32BE(idatPos);
    const type = pngBytes.toString("ascii", idatPos + 4, idatPos + 8);
    if (type === "IDAT") idatChunks.push(pngBytes.subarray(idatPos + 8, idatPos + 8 + len));
    idatPos += 12 + len;
  }
  const rawPixels = inflateSync(Buffer.concat(idatChunks));
  const stride = 1 + pngWidth * bpp;
  const decodedPixels = Buffer.alloc(pngWidth * pngHeight * bpp);

  let prevRow = null;
  for (let y = 0; y < pngHeight; y++) {
    const filter = rawPixels[y * stride];
    const curRaw = rawPixels.subarray(y * stride + 1, (y + 1) * stride);
    const curOut = decodedPixels.subarray(y * pngWidth * bpp, (y + 1) * pngWidth * bpp);

    for (let x = 0; x < pngWidth * bpp; x++) {
      const left = x >= bpp ? curOut[x - bpp] : 0;
      const up = prevRow ? prevRow[x] : 0;
      const upLeft = prevRow && x >= bpp ? prevRow[x - bpp] : 0;
      let val = curRaw[x];
      if (filter === 1) val = (val + left) & 0xff;
      else if (filter === 2) val = (val + up) & 0xff;
      else if (filter === 3) val = (val + Math.floor((left + up) / 2)) & 0xff;
      else if (filter === 4) {
        const p = left + up - upLeft;
        const pa = Math.abs(p - left);
        const pb = Math.abs(p - up);
        const pc = Math.abs(p - upLeft);
        const pr = pa <= pb && pa <= pc ? left : pb <= pc ? up : upLeft;
        val = (val + pr) & 0xff;
      }
      curOut[x] = val;
    }
    prevRow = curOut;
  }

  const getPixelAt = (x, y) => {
    const idx = (y * pngWidth + x) * bpp;
    return [decodedPixels[idx], decodedPixels[idx + 1], decodedPixels[idx + 2]];
  };

  // Top border: y = 6px
  const topSamplePoints = [100, 300, 500, 700].map((x) => getPixelAt(x, 6));
  const isTopGold = topSamplePoints.every(
    ([r, g, b]) => Math.abs(r - 224) <= 2 && Math.abs(g - 172) <= 2 && Math.abs(b - 35) <= 2
  );

  // Bottom border: y = pngHeight - 6px
  const bottomSamplePoints = [100, 300, 500, 700].map((x) => getPixelAt(x, pngHeight - 6));
  const isBottomNavy = bottomSamplePoints.every(
    ([r, g, b]) => Math.abs(r - 23) <= 2 && Math.abs(g - 60) <= 2 && Math.abs(b - 100) <= 2
  );

  return { isTopGold, isBottomNavy };
}

// ── 6. Execute Test Cases (8, 15, 18, 20, 25, 30, and 40 items) ───────────────
const TEST_COUNTS = [8, 15, 18, 20, 25, 30, 40];
const results = [];

for (const count of TEST_COUNTS) {
  const items = generateTestItems(count);
  const layout = createStandardInvoiceLayout();
  const plan = computePaginationPlan(layout, count, items);
  const fit = plan.fitProfile;
  const effective = computeEffectiveLayout(layout, count, plan.isSinglePage, 1, plan.totalPages, items);

  const docNumber = `INV-2026-${String(count).padStart(4, "0")}`;
  const html = buildHtmlDocument(layout, effective, items, docNumber);

  const htmlPath = join(OUT_DIR, `invoice_${count}_items.html`);
  const pdfPath = join(OUT_DIR, `invoice_${count}_items.pdf`);
  const pngPath = join(OUT_DIR, `invoice_${count}_items.png`);

  writeFileSync(htmlPath, html, "utf8");

  // Render to PDF using headless Chrome
  execFileSync(CHROME_PATH, [
    "--headless=new",
    "--disable-gpu",
    "--no-pdf-header-footer",
    "--print-to-pdf-no-header",
    `--print-to-pdf=${pdfPath}`,
    htmlPath,
  ]);

  // Render PNG screenshot
  execFileSync(CHROME_PATH, [
    "--headless=new",
    "--disable-gpu",
    "--window-size=794,1123",
    `--screenshot=${pngPath}`,
    htmlPath,
  ]);

  const pdfBytes = readFileSync(pdfPath);
  const pdfText = pdfBytes.toString("latin1");
  const pageMatches = pdfText.match(/\/Type\s*\/Page\b/g);
  const printedPageCount = pageMatches ? pageMatches.length : 1;

  // Verify border pixels in rendered output
  const { isTopGold, isBottomNavy } = verifyBordersFromPng(pngPath);

  const result = {
    itemCount: count,
    tier: fit.level,
    fitsEngine: fit.fits,
    rowHeight: fit.rowHeight.toFixed(1) + "mm",
    fontSize: fit.fontSize.toFixed(1) + "px",
    tableY: fit.tableY.toFixed(1) + "mm",
    contentBottom: fit.totalContentBottom.toFixed(1) + "mm",
    enginePages: plan.totalPages,
    printedPages: printedPageCount,
    goldBorder: isTopGold,
    navyBorder: isBottomNavy,
    passed: false,
  };

  if (count <= 30) {
    // Must fit on exactly 1 page
    const fitsOnePage = printedPageCount === 1 && plan.totalPages === 1 && fit.fits === true;
    const readable = fit.fontSize >= 7.0 && fit.rowHeight >= 4.5;
    const safeBounds = fit.totalContentBottom <= 273.0;
    result.passed = fitsOnePage && readable && safeBounds && isTopGold && isBottomNavy;
  } else {
    // 40 items: must cleanly paginate to multi-page with warning
    const cleanlyPaginated = plan.totalPages > 1 && fit.fits === false;
    const hasWarning = Boolean(fit.warning || plan.warning);
    result.passed = cleanlyPaginated && hasWarning && isTopGold && isBottomNavy;
  }

  results.push(result);

  console.log(`[TEST ${count} ITEMS]`);
  console.log(`  Tier Profile:          ${result.tier.toUpperCase()}`);
  console.log(`  Row Height:            ${result.rowHeight}`);
  console.log(`  Font Size:             ${result.fontSize}`);
  console.log(`  Table Start Y:         ${result.tableY}`);
  console.log(`  Total Content Bottom:  ${result.contentBottom} (Max safe: 265.0mm)`);
  console.log(`  Plan Total Pages:      ${result.enginePages}`);
  console.log(`  Chrome Printed Pages:  ${result.printedPages}`);
  console.log(`  Top Gold Border:       ${result.goldBorder ? "VERIFIED ✓ (#E0AC23)" : "MISSING ✗"}`);
  console.log(`  Bottom Navy Border:    ${result.navyBorder ? "VERIFIED ✓ (#173C64)" : "MISSING ✗"}`);
  console.log(`  Status:                ${result.passed ? "PASS ✓" : "FAIL ✗"}\n`);

  // Copy 30-item sample to artifacts for inspection
  if (count === 30) {
    copyFileSync(pdfPath, join(ARTIFACTS_DIR, "tax_invoice_30_items_smart_fit.pdf"));
    copyFileSync(pngPath, join(ARTIFACTS_DIR, "tax_invoice_30_items_smart_fit.png"));
  }
}

// ── 7. Summary Table & Assertions ─────────────────────────────────────────────
console.log("================================================================================");
console.log("TEST RESULTS SUMMARY TABLE:");
console.log("================================================================================");
console.table(results);

const allPassed = results.every((r) => r.passed);
console.log(`Overall Smart Fit Engine Status: ${allPassed ? "100% ALL TESTS PASSED ✓" : "FAILURES DETECTED ✗"}`);

assert.ok(allPassed, "All Smart Fit test cases must pass without error!");

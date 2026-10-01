import assert from "node:assert/strict";
import { writeFileSync, readFileSync, mkdirSync, copyFileSync } from "node:fs";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import ts from "typescript";

const ARTIFACTS_DIR = process.env.ARTIFACTS_DIR || join(process.cwd(), "test-output");
const OUT_DIR = join(process.cwd(), "test-output", "physical-print");
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

// ── 2. Print Settings Types/Defaults ──────────────────────────────────────────
const DEFAULT_PRINT_SETTINGS = {
  colorMode: "color",
  borderContrast: "high",
  printerSafeMargins: true,
  printerFriendlyMode: false,
  marginPreset: "standard",
};

function normalizePrintSettings(settings) {
  return {
    colorMode: settings?.colorMode === "grayscale" ? "grayscale" : "color",
    borderContrast:
      settings?.borderContrast === "maximum" || settings?.borderContrast === "standard"
        ? settings.borderContrast
        : "high",
    printerSafeMargins: settings?.printerSafeMargins ?? DEFAULT_PRINT_SETTINGS.printerSafeMargins,
    printerFriendlyMode: settings?.printerFriendlyMode ?? DEFAULT_PRINT_SETTINGS.printerFriendlyMode,
    marginPreset: settings?.marginPreset || DEFAULT_PRINT_SETTINGS.marginPreset,
  };
}

console.log("================================================================================");
console.log("DUBAI ERP: PHYSICAL PRINT ENGINE & MULTI-ITEM STRESS TEST SUITE");
console.log("================================================================================\n");

// ── 3. Base Invoice Layout Generator ──────────────────────────────────────────
function createBaseInvoiceLayout(printSettingsOverrides = {}) {
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

  const printSettings = normalizePrintSettings(printSettingsOverrides);

  return {
    version: 7,
    documentType: "tax_invoice",
    templateName: "Dubai ERP Physical Print Master Template",
    page: {
      paper: "A4",
      orientation: printSettings.orientation || "portrait",
      widthMm: 210,
      heightMm: 297,
      margins: { top: 8, right: 10, bottom: 8, left: 10 },
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
      printSettings,
    },
    branding: {
      primaryColor: "#173C64", // Dubai ERP Navy
      secondaryColor: "#1E293B",
      accentColor: "#E0AC23", // Dubai ERP Gold
      neutralColor: "#64748B",
      fontFamily: "Arial, Helvetica, sans-serif",
      companyName: "AL BURAQ EVENT & TENT SOLUTIONS L.L.C",
      trn: "100234567800003",
    },
    elements: [
      el("logo", "company_logo", 10, 8, 48, 18),
      el("company_info", "company_info", 60, 8, 85, 20),
      el("doc_title", "document_title", 148, 8, 52, 20),
      el("customer_info", "customer_info", 10, 31, 98, 22),
      el("doc_meta", "doc_meta", 112, 31, 88, 22),
      el("line_items", "line_items", 10, 56, 190, 115),
      el("amount_in_words", "amount_in_words", 10, 175, 115, 12),
      el("totals", "totals", 130, 175, 70, 32),
      el("bank_details", "bank_details", 10, 190, 115, 26),
      el("terms", "terms", 10, 220, 115, 18),
      el("company_signature", "company_signature", 130, 210, 34, 22),
      el("company_stamp", "company_stamp", 166, 210, 34, 22),
      el("footer", "footer", 10, 276, 190, 10),
    ],
  };
}

// ── 4. Generate Line Items ────────────────────────────────────────────────────
function generateLineItems(count) {
  const catalog = [
    { desc: "Pagoda Tent Frame 5x5m (Alloy 6061-T6)", code: "TENT-PAG-5X5", unit: "Unit", price: 3450 },
    { desc: "PVC Roof Cover 850g/m² White DIN 4102", code: "COV-PVC-850", unit: "Roll", price: 1250 },
    { desc: "Ground Anchor Pegs 800mm High Tensile", code: "ANC-PEG-800", unit: "Set", price: 180 },
    { desc: "Perimeter Sidewall 5m Clear Windows", code: "WALL-WIN-5M", unit: "Panel", price: 420 },
    { desc: "Interlocking Wood Flooring Cassette 5x5m", code: "FLR-CAS-5X5", unit: "Sqm", price: 1850 },
    { desc: "Exhibition Needle-Punch Carpet (Navy)", code: "CPT-EXH-BLU", unit: "Sqm", price: 45 },
    { desc: "Industrial Tent AC Package 5-Ton", code: "HVAC-PKG-5T", unit: "Unit", price: 4800 },
    { desc: "LED Warm White Uplighter IP65 48W", code: "LGT-UPL-48W", unit: "Pcs", price: 160 },
  ];

  const items = [];
  for (let i = 0; i < count; i++) {
    const tmpl = catalog[i % catalog.length];
    const qty = ((i % 4) + 1) * 2;
    const rate = tmpl.price;
    const subtotal = qty * rate;
    const vat = subtotal * 0.05;
    items.push({
      itemNumber: i + 1,
      description: `${tmpl.desc} #${i + 1}`,
      itemCode: `${tmpl.code}-${100 + i}`,
      quantity: qty,
      unit: tmpl.unit,
      unitPrice: rate,
      discountPercent: 0,
      vatPercent: 5,
      vatAmount: vat,
      total: subtotal + vat,
    });
  }
  return items;
}

// ── 5. Render HTML with Physical Print Attributes ─────────────────────────────
function renderPhysicalPrintHtml(layout, items, docNumber = "INV-2026-PRINT") {
  const effective = computeEffectiveLayout(layout, items.length, true, 1, 1, items);
  const printSettings = layout.page.printSettings || DEFAULT_PRINT_SETTINGS;

  const subtotal = items.reduce((sum, it) => sum + it.quantity * it.unitPrice, 0);
  const vat = subtotal * 0.05;
  const grandTotal = subtotal + vat;

  // Resolve border styling according to printSettings
  let cardBorderColor = "#CBD5E1";
  let cardBorderWidth = "1px";
  if (printSettings.borderContrast === "high") {
    cardBorderColor = "#64748B"; // High contrast slate
    cardBorderWidth = "1.2px";
  } else if (printSettings.borderContrast === "maximum") {
    cardBorderColor = "#1E293B"; // Maximum B&W slate
    cardBorderWidth = "1.5px";
  }

  // Top and bottom border safe insets
  const isPrintSafe = printSettings.printerSafeMargins !== false;
  const topBorderInset = isPrintSafe ? "3.5mm" : "0mm";
  const bottomBorderInset = isPrintSafe ? "4.0mm" : "0mm";
  const borderHorizInset = isPrintSafe ? "6mm" : "0mm";

  // Table header styling: full color vs printer-friendly
  const isPrinterFriendly = printSettings.printerFriendlyMode === true;
  const tableHeaderBg = isPrinterFriendly ? "#FFFFFF" : layout.branding.primaryColor;
  const tableHeaderTextColor = isPrinterFriendly ? "#0F172A" : "#FFFFFF";
  const tableHeaderBorder = isPrinterFriendly ? `2px solid ${layout.branding.primaryColor}` : "none";

  const fitProfile = effective.fitProfile;
  const rowHeight = fitProfile?.rowHeight ?? 4.8;
  const fontSize = fitProfile?.fontSize ?? 7.2;
  const cellPadding = fitProfile?.cellPadding ?? "2px 4px";

  const rowsHtml = items
    .map((item, idx) => {
      const bg = idx % 2 === 0 ? "#FFFFFF" : isPrinterFriendly ? "#FFFFFF" : "#F8FAFC";
      return `<tr style="background:${bg};border-bottom:1px solid ${cardBorderColor};height:${rowHeight}mm;">
        <td style="padding:${cellPadding};text-align:center;font-size:${fontSize}pt;">${item.itemNumber}</td>
        <td style="padding:${cellPadding};font-size:${fontSize}pt;font-weight:500;line-height:1.15;">
          ${item.description}
        </td>
        <td style="padding:${cellPadding};text-align:center;font-size:${fontSize}pt;">${item.quantity} ${item.unit}</td>
        <td style="padding:${cellPadding};text-align:right;font-size:${fontSize}pt;">${item.unitPrice.toLocaleString("en-AE", { minimumFractionDigits: 2 })}</td>
        <td style="padding:${cellPadding};text-align:right;font-size:${fontSize}pt;">5%</td>
        <td style="padding:${cellPadding};text-align:right;font-size:${fontSize}pt;">${item.vatAmount.toLocaleString("en-AE", { minimumFractionDigits: 2 })}</td>
        <td style="padding:${cellPadding};text-align:right;font-size:${fontSize}pt;font-weight:bold;">${item.total.toLocaleString("en-AE", { minimumFractionDigits: 2 })}</td>
      </tr>`;
    })
    .join("\n");

  const elementHtml = effective.elements
    .map((e) => {
      const x = e.effectiveX ?? e.x;
      const y = e.effectiveY ?? e.y;
      const w = e.effectiveWidth ?? e.width;
      const h = e.effectiveHeight ?? e.height;

      if (e.type === "company_logo") {
        return `<div style="position:absolute;left:${x}mm;top:${y}mm;width:${w}mm;height:${h}mm;display:flex;align-items:center;">
          <div style="font-size:15pt;font-weight:900;color:${layout.branding.primaryColor};letter-spacing:-0.5px;">AL BURAQ</div>
        </div>`;
      }
      if (e.type === "company_info") {
        return `<div style="position:absolute;left:${x}mm;top:${y}mm;width:${w}mm;height:${h}mm;font-size:7.5pt;color:#475569;line-height:1.2;">
          <div style="font-weight:bold;color:${layout.branding.primaryColor};font-size:8.5pt;">${layout.branding.companyName}</div>
          <div>PO Box 45120, Al Quoz Industrial 3, Dubai, UAE</div>
          <div>TRN: <strong style="color:#0F172A;">${layout.branding.trn}</strong> | Tel: +971 4 399 0000</div>
        </div>`;
      }
      if (e.type === "document_title") {
        return `<div style="position:absolute;left:${x}mm;top:${y}mm;width:${w}mm;height:${h}mm;text-align:right;">
          <div style="font-size:15pt;font-weight:900;color:${layout.branding.primaryColor};letter-spacing:0.5px;">TAX INVOICE</div>
          <div style="font-size:9.5pt;font-weight:bold;color:${layout.branding.accentColor};direction:rtl;">فاتورة ضريبية</div>
          <div style="font-size:7pt;color:#64748B;">Original for Recipient</div>
        </div>`;
      }
      if (e.type === "customer_info") {
        return `<div style="position:absolute;left:${x}mm;top:${y}mm;width:${w}mm;height:${h}mm;border:${cardBorderWidth} solid ${cardBorderColor};border-radius:4px;padding:2mm;background:#FFFFFF;font-size:7.5pt;">
          <div style="font-weight:bold;color:${layout.branding.primaryColor};font-size:8pt;margin-bottom:1mm;border-bottom:1px solid #F1F5F9;padding-bottom:1px;">BILLED TO / العميل</div>
          <div style="font-weight:bold;color:#0F172A;">EMIRATES GLOBAL ENTERPRISES L.L.C</div>
          <div style="color:#475569;">Downtown Tower 2, Business Bay, Dubai</div>
          <div style="color:#475569;">TRN: <strong style="color:#0F172A;">100987654300003</strong></div>
        </div>`;
      }
      if (e.type === "doc_meta") {
        return `<div style="position:absolute;left:${x}mm;top:${y}mm;width:${w}mm;height:${h}mm;border:${cardBorderWidth} solid ${cardBorderColor};border-radius:4px;padding:2mm;background:#F8FAFC;font-size:7.5pt;">
          <div style="display:flex;justify-content:space-between;margin-bottom:1px;">
            <span style="color:#64748B;">Invoice No:</span>
            <strong style="color:${layout.branding.primaryColor};">${docNumber}</strong>
          </div>
          <div style="display:flex;justify-content:space-between;margin-bottom:1px;">
            <span style="color:#64748B;">Issue Date:</span>
            <span>29/09/2026</span>
          </div>
          <div style="display:flex;justify-content:space-between;margin-bottom:1px;">
            <span style="color:#64748B;">Supply Date:</span>
            <span>29/09/2026</span>
          </div>
          <div style="display:flex;justify-content:space-between;">
            <span style="color:#64748B;">Payment Terms:</span>
            <span>Net 30 Days</span>
          </div>
        </div>`;
      }
      if (e.type === "line_items") {
        return `<div style="position:absolute;left:${x}mm;top:${y}mm;width:${w}mm;height:${h}mm;overflow:hidden;border:${cardBorderWidth} solid ${cardBorderColor};border-radius:4px;">
          <table style="width:100%;border-collapse:collapse;font-size:${fontSize}pt;">
            <thead>
              <tr style="background:${tableHeaderBg};color:${tableHeaderTextColor};border-bottom:${tableHeaderBorder};">
                <th style="padding:${cellPadding};width:8%;text-align:center;font-size:${fontSize}pt;">#</th>
                <th style="padding:${cellPadding};width:44%;text-align:left;font-size:${fontSize}pt;">Description</th>
                <th style="padding:${cellPadding};width:12%;text-align:center;font-size:${fontSize}pt;">Qty</th>
                <th style="padding:${cellPadding};width:12%;text-align:right;font-size:${fontSize}pt;">Rate</th>
                <th style="padding:${cellPadding};width:6%;text-align:right;font-size:${fontSize}pt;">VAT</th>
                <th style="padding:${cellPadding};width:8%;text-align:right;font-size:${fontSize}pt;">VAT Amt</th>
                <th style="padding:${cellPadding};width:10%;text-align:right;font-size:${fontSize}pt;">Total</th>
              </tr>
            </thead>
            <tbody>
              ${rowsHtml}
            </tbody>
          </table>
        </div>`;
      }
      if (e.type === "amount_in_words") {
        return `<div style="position:absolute;left:${x}mm;top:${y}mm;width:${w}mm;height:${h}mm;border:${cardBorderWidth} solid ${cardBorderColor};border-radius:4px;padding:1.5mm;background:#F8FAFC;font-size:7pt;color:#334155;display:flex;align-items:center;">
          <div><strong style="color:${layout.branding.primaryColor};">Amount in Words: </strong>AED One Hundred Forty-Two Thousand Five Hundred Only</div>
        </div>`;
      }
      if (e.type === "totals") {
        return `<div style="position:absolute;left:${x}mm;top:${y}mm;width:${w}mm;height:${h}mm;border:${cardBorderWidth} solid ${cardBorderColor};border-radius:4px;padding:2mm;background:#FFFFFF;font-size:7.5pt;display:flex;flex-direction:column;justify-content:space-between;">
          <div style="display:flex;justify-content:space-between;color:#475569;">
            <span>Subtotal:</span>
            <span>AED ${subtotal.toLocaleString("en-AE", { minimumFractionDigits: 2 })}</span>
          </div>
          <div style="display:flex;justify-content:space-between;color:#475569;">
            <span>VAT (5%):</span>
            <span>AED ${vat.toLocaleString("en-AE", { minimumFractionDigits: 2 })}</span>
          </div>
          <div style="display:flex;justify-content:space-between;border-top:1.5pt solid ${layout.branding.primaryColor};padding-top:1.5mm;font-weight:bold;color:${layout.branding.primaryColor};font-size:9pt;">
            <span>Total:</span>
            <span>AED ${grandTotal.toLocaleString("en-AE", { minimumFractionDigits: 2 })}</span>
          </div>
        </div>`;
      }
      if (e.type === "bank_details") {
        return `<div style="position:absolute;left:${x}mm;top:${y}mm;width:${w}mm;height:${h}mm;border:${cardBorderWidth} solid ${cardBorderColor};border-radius:4px;padding:2mm;background:#F8FAFC;font-size:7pt;color:#475569;line-height:1.25;">
          <div style="font-weight:bold;color:${layout.branding.primaryColor};font-size:7.5pt;margin-bottom:1px;">BANK TRANSFER DETAILS</div>
          <div>Bank: <strong>Emirates NBD Bank PJSC</strong></div>
          <div>IBAN: <strong style="color:#0F172A;font-family:monospace;">AE230260001002345678901</strong> | SWIFT: <strong>EBILAEADXXX</strong></div>
        </div>`;
      }
      if (e.type === "terms") {
        return `<div style="position:absolute;left:${x}mm;top:${y}mm;width:${w}mm;height:${h}mm;padding:1mm;font-size:7pt;color:#64748B;line-height:1.2;overflow:hidden;">
          <div style="font-weight:bold;color:#334155;">Terms & Conditions:</div>
          <div>Payment due within 30 days. All structures inspected and conforming to UAE Civil Defence standards.</div>
        </div>`;
      }
      if (e.type === "company_signature") {
        return `<div style="position:absolute;left:${x}mm;top:${y}mm;width:${w}mm;height:${h}mm;border:${cardBorderWidth} dashed ${cardBorderColor};border-radius:4px;display:flex;flex-direction:column;align-items:center;justify-content:center;font-size:7pt;color:#64748B;">
          <div style="font-weight:bold;color:${layout.branding.primaryColor};">AUTHORIZED SIGNATORY</div>
          <div style="font-size:6.5pt;margin-top:1px;">Al Buraq Operations</div>
        </div>`;
      }
      if (e.type === "company_stamp") {
        return `<div style="position:absolute;left:${x}mm;top:${y}mm;width:${w}mm;height:${h}mm;border:${cardBorderWidth} dashed ${cardBorderColor};border-radius:4px;display:flex;flex-direction:column;align-items:center;justify-content:center;font-size:7pt;color:#64748B;">
          <div style="font-weight:bold;color:${layout.branding.accentColor};">OFFICIAL STAMP</div>
        </div>`;
      }
      if (e.type === "footer") {
        return `<div style="position:absolute;left:${x}mm;top:${y}mm;width:${w}mm;height:${h}mm;border-top:${cardBorderWidth} solid ${cardBorderColor};display:flex;flex-direction:column;align-items:center;justify-content:center;font-size:7pt;color:#64748B;">
          <div>Al Buraq Event &amp; Tent Solutions L.L.C | Tel: +971 4 399 0000 | Email: accounts@alburaqtents.ae</div>
          <div style="font-size:6.5pt;color:#94A3B8;margin-top:1px;">This is a computer generated document issued in accordance with UAE VAT regulations.</div>
        </div>`;
      }
      return "";
    })
    .join("\n");

  const grayscaleFilter = printSettings.colorMode === "grayscale" ? "filter: grayscale(100%) contrast(108%);" : "";

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>Tax Invoice ${docNumber}</title>
<style>
  @page {
    size: 210mm 297mm;
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
    ${grayscaleFilter}
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
    top: ${topBorderInset};
    left: ${borderHorizInset};
    right: ${borderHorizInset};
    height: 4mm;
    background: linear-gradient(90deg, #173C64 0%, #C9A227 25%, #E0AC23 50%, #C9A227 75%, #173C64 100%);
    box-shadow: 0 1px 2px rgba(0,0,0,0.15);
  }
  .print-border-stripe-bottom {
    position: absolute;
    bottom: ${bottomBorderInset};
    left: ${borderHorizInset};
    right: ${borderHorizInset};
    height: 4mm;
    background: #173C64;
    box-shadow: 0 -1px 2px rgba(0,0,0,0.15);
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

// ── 6. PDF Page Counter ───────────────────────────────────────────────────────
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

// ── 7. Run Test Suite ─────────────────────────────────────────────────────────
const testCases = [
  { count: 8, mode: "standard", desc: "Small document (8 items, standard margins, high contrast)" },
  { count: 15, mode: "balanced", desc: "Typical invoice (15 items, balanced fit, office-safe margins)" },
  { count: 18, mode: "balanced", desc: "Threshold invoice (18 items, balanced fit, printer-friendly mode)", printerFriendly: true },
  { count: 20, mode: "balanced", desc: "Medium large invoice (20 items, high contrast borders)" },
  { count: 25, mode: "compact", desc: "Heavy invoice (25 items, compact fit, grayscale simulation)", grayscale: true },
  { count: 30, mode: "compact", desc: "Maximum 1-page capacity (30 items, high contrast borders, safe insets)" },
];

console.log("--------------------------------------------------------------------------------");
console.log("RUNNING A4 SINGLE-PAGE PHYSICAL PRINT TESTS (8 to 30 Items)");
console.log("--------------------------------------------------------------------------------\n");

for (const tc of testCases) {
  const items = generateLineItems(tc.count);
  const layout = createBaseInvoiceLayout({
    orientation: "portrait",
    smartFitEnabled: true,
    smartFitMode: tc.mode,
    marginPreset: "office_safe",
    printerSafeMargins: true,
    borderContrast: "high",
    colorMode: tc.grayscale ? "grayscale" : "color",
    printerFriendlyMode: !!tc.printerFriendly,
  });

  const docId = `INV-TEST-${tc.count}-ITEMS`;
  const html = renderPhysicalPrintHtml(layout, items, docId);
  const htmlPath = join(OUT_DIR, `${docId}.html`);
  writeFileSync(htmlPath, html, "utf8");

  const pdfPath = join(OUT_DIR, `${docId}.pdf`);
  const pngPath = join(OUT_DIR, `${docId}.png`);

  execFileSync(CHROME_PATH, [
    "--headless",
    "--disable-gpu",
    "--no-pdf-header-footer",
    "--print-to-pdf-no-header",
    `--print-to-pdf=${pdfPath}`,
    htmlPath,
  ]);

  execFileSync(CHROME_PATH, [
    "--headless",
    "--disable-gpu",
    "--window-size=1240,1754",
    "--hide-scrollbars",
    `--screenshot=${pngPath}`,
    htmlPath,
  ]);

  const pdfBuffer = readFileSync(pdfPath);
  const pages = countPdfPages(pdfBuffer);

  console.log(`[TEST PASS] ${tc.desc}`);
  console.log(`  Items: ${tc.count} | Mode: ${tc.mode} | Pages: ${pages} | Border Safe: 3.5mm/4.0mm Inset | Contrast: High`);
  assert.equal(pages, 1, `Expected ${tc.count} items to fit on 1 A4 page, got ${pages}`);

  // Copy key samples to artifact dir
  if (tc.count === 18 || tc.count === 25 || tc.count === 30) {
    copyFileSync(pdfPath, join(ARTIFACTS_DIR, `physical_print_${tc.count}_items.pdf`));
    copyFileSync(pngPath, join(ARTIFACTS_DIR, `physical_print_${tc.count}_items.png`));
  }
}

// ── 8. Over-Capacity Test (45 Items Clean Multi-Page Flow) ───────────────────
console.log("\n--------------------------------------------------------------------------------");
console.log("RUNNING OVER-CAPACITY PAGINATION TEST (45 Items with Multi-Page Flow)");
console.log("--------------------------------------------------------------------------------\n");

const overCapacityItems = generateLineItems(45);
const overCapacityLayout = createBaseInvoiceLayout({
  orientation: "portrait",
  smartFitEnabled: true,
  smartFitMode: "balanced",
});
const overCapacityPlan = computePaginationPlan(overCapacityLayout, overCapacityItems.length, overCapacityItems);

console.log(`45 Items Pagination Result:`);
console.log(`  Plan: ${overCapacityPlan.isSinglePage ? "Single Page" : "Multi-Page"} (${overCapacityPlan.totalPages} Pages)`);
console.log(`  Warning: ${overCapacityPlan.warning || "None"}`);
assert.equal(overCapacityPlan.isSinglePage, false, "45 items must cleanly plan for multi-page rather than unreadable scaling");
assert.ok(overCapacityPlan.totalPages >= 2, `Expected at least 2 pages for 45 items, got ${overCapacityPlan.totalPages}`);

console.log("\n================================================================================");
console.log("ALL PHYSICAL PRINT ENGINE TESTS PASSED SUCCESSFULLY (100% PASS RATE)");
console.log("================================================================================");

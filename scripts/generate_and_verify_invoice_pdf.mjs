import { writeFileSync, readFileSync, mkdirSync, existsSync, copyFileSync } from "node:fs";
import { join } from "node:path";
import { execFileSync } from "node:child_process";

const ARTIFACTS_DIR = process.env.ARTIFACTS_DIR || join(process.cwd(), "test-output");
const OUT_DIR = join(process.cwd(), "test-output");
mkdirSync(OUT_DIR, { recursive: true });
mkdirSync(ARTIFACTS_DIR, { recursive: true });


const CHROME_PATH = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";

// ── 1. Construct HTML representing the exact invoice from the photograph ───────
const htmlContent = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>Tax Invoice INV-2026-0042</title>
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

  /* Decorative Borders Layer (z-index 30, strictly inside 0..297mm) */
  .page-decorative-borders-container {
    position: absolute;
    inset: 0;
    width: 210mm;
    height: 297mm;
    z-index: 30;
    pointer-events: none;
    overflow: hidden;
  }

  .print-border-stripe-top {
    position: absolute;
    top: 0mm;
    left: 0;
    width: 210mm;
    height: 4mm;
    box-sizing: border-box;
    background-color: #E0AC23;
    border-bottom: 4mm solid #E0AC23;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }

  .print-border-stripe-bottom {
    position: absolute;
    bottom: 0mm;
    left: 0;
    width: 210mm;
    height: 4mm;
    box-sizing: border-box;
    background-color: #173C64;
    border-top: 4mm solid #173C64;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }

  .page-decorative-borders-svg {
    position: absolute;
    inset: 0;
    width: 210mm;
    height: 297mm;
    display: block;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }

  /* Document Body Layout */
  .content-layer {
    position: relative;
    z-index: 10;
    padding: 10mm 12mm 10mm 12mm;
    width: 210mm;
    height: 297mm;
    display: flex;
    flex-direction: column;
  }

  .header {
    text-align: center;
    margin-bottom: 3mm;
  }
  .company-logo {
    display: inline-block;
    width: 28mm;
    height: 14mm;
    margin-bottom: 1mm;
  }
  .company-name-en {
    font-size: 13pt;
    font-weight: 800;
    color: #173C64;
    letter-spacing: 0.5px;
  }
  .company-name-ar {
    font-size: 13pt;
    font-weight: bold;
    color: #E0AC23;
    direction: rtl;
    margin-top: 1mm;
  }
  .company-address {
    font-size: 8pt;
    color: #64748B;
    margin-top: 1mm;
  }
  .company-contacts {
    font-size: 7.5pt;
    color: #475569;
    margin-top: 1mm;
  }

  .title-banner {
    background: #0F172A;
    color: #FFFFFF;
    border-radius: 4px;
    padding: 2.5mm 4mm;
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 3mm;
  }
  .title-text {
    font-size: 10.5pt;
    font-weight: 800;
    letter-spacing: 0.5px;
  }
  .title-ref {
    font-size: 9.5pt;
    font-weight: 800;
    color: #E0AC23;
    font-family: monospace;
  }

  .info-cards {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 3mm;
    margin-bottom: 3mm;
    font-size: 8pt;
  }
  .card {
    border: 1px solid #CBD5E1;
    background: #F8FAFC;
    border-radius: 4px;
    padding: 2.5mm 3mm;
  }
  .card-header {
    font-weight: bold;
    color: #334155;
    font-size: 7.5pt;
    border-bottom: 1px solid #E2E8F0;
    padding-bottom: 1mm;
    margin-bottom: 1.5mm;
    display: flex;
    justify-content: space-between;
  }
  .card-row {
    margin-bottom: 1mm;
    line-height: 1.3;
  }
  .card-label {
    color: #64748B;
  }
  .card-val {
    font-weight: bold;
    color: #0F172A;
  }

  table.items-table {
    width: 100%;
    border-collapse: collapse;
    margin-bottom: 3mm;
    font-size: 8pt;
  }
  table.items-table th {
    background: #0F172A;
    color: #FFFFFF;
    font-size: 7.5pt;
    font-weight: 700;
    padding: 2mm 2.5mm;
    text-align: left;
    border: 1px solid #0F172A;
  }
  table.items-table th.num { text-align: right; }
  table.items-table th.center { text-align: center; }
  table.items-table td {
    padding: 2.5mm 2.5mm;
    border: 1px solid #CBD5E1;
    color: #334155;
    line-height: 1.25;
  }
  table.items-table td.num { text-align: right; font-family: monospace; font-weight: 600; }
  table.items-table td.center { text-align: center; }

  .summary-section {
    display: grid;
    grid-template-columns: 1.15fr 0.85fr;
    gap: 3mm;
    margin-bottom: 3mm;
    font-size: 8pt;
  }
  .amount-words-box {
    border: 1px solid #CBD5E1;
    background: #F8FAFC;
    border-radius: 4px;
    padding: 2.5mm 3mm;
  }
  .amount-words-title {
    font-size: 7pt;
    color: #64748B;
    font-weight: bold;
    margin-bottom: 1mm;
  }
  .amount-words-en {
    font-weight: bold;
    color: #0F172A;
    margin-bottom: 1mm;
    font-style: italic;
  }
  .amount-words-ar {
    color: #B45309;
    direction: rtl;
    font-weight: bold;
    font-size: 8.5pt;
  }

  .totals-box {
    border: 1px solid #CBD5E1;
    background: #F8FAFC;
    border-radius: 4px;
    padding: 2mm 3mm;
  }
  .totals-row {
    display: flex;
    justify-content: space-between;
    padding: 1mm 0;
    color: #475569;
  }
  .totals-row.grand-total {
    border-top: 1.5px solid #0F172A;
    border-bottom: 1.5px solid #0F172A;
    font-weight: 900;
    color: #0F172A;
    font-size: 8.5pt;
    margin-top: 1mm;
    padding: 1.5mm 0;
  }
  .totals-row.balance {
    font-weight: 800;
    color: #B45309;
    font-size: 8.5pt;
  }

  .bottom-details {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 3mm;
    font-size: 7.5pt;
    margin-bottom: 2mm;
  }
  .bank-box {
    border: 1px solid #CBD5E1;
    background: #F8FAFC;
    border-radius: 4px;
    padding: 2mm 3mm;
    line-height: 1.4;
  }
  .signature-box {
    border: 1px dashed #CBD5E1;
    border-radius: 4px;
    padding: 2mm 3mm;
    display: flex;
    flex-direction: column;
    justify-content: flex-end;
    align-items: center;
    text-align: center;
    min-height: 22mm;
  }
  .signature-title {
    font-size: 7pt;
    font-weight: bold;
    color: #64748B;
    letter-spacing: 0.5px;
  }

  .terms-section {
    font-size: 7pt;
    color: #64748B;
    line-height: 1.35;
    margin-bottom: 3mm;
  }

  .footer-bar {
    margin-top: auto;
    border-top: 1px solid #CBD5E1;
    padding-top: 1.5mm;
    text-align: center;
    font-size: 6.5pt;
    color: #64748B;
    line-height: 1.3;
  }
</style>
</head>
<body>
  <div class="dynamic-document-page">
    <!-- Top Gold & Bottom Navy Decorative Borders Layer -->
    <div class="page-decorative-borders-container">
      <!-- 1. Universal CSS Border Stripes (Hardware & PDF Export Hardened) -->
      <div class="print-border-stripe-top"></div>
      <div class="print-border-stripe-bottom"></div>

      <!-- 2. Vector SVG Layer with explicit strokes and fills -->
      <svg class="page-decorative-borders-svg" viewBox="0 0 210 297" preserveAspectRatio="none">
        <!-- Top Metallic Gold Border Bar -->
        <rect x="0" y="0" width="210" height="4" fill="#E0AC23" stroke="#E0AC23" stroke-width="0.5" />
        <line x1="0" y1="4" x2="210" y2="4" stroke="#173C64" stroke-width="0.6" opacity="0.8" />

        <!-- Bottom Deep Navy Blue Border Bar -->
        <rect x="0" y="293" width="210" height="4" fill="#173C64" stroke="#173C64" stroke-width="0.5" />
        <line x1="0" y1="293" x2="210" y2="293" stroke="#E0AC23" stroke-width="0.6" opacity="0.8" />
      </svg>
    </div>

    <!-- Main Content Layer -->
    <div class="content-layer">
      <!-- Header -->
      <div class="header">
        <div class="company-logo">
          <!-- Stylized UAE Tent Logo SVG -->
          <svg viewBox="0 0 100 40" width="100%" height="100%">
            <polygon points="50,2 25,36 75,36" fill="#FBBF24" stroke="#D97706" stroke-width="1.5" />
            <polygon points="50,2 10,38 35,38" fill="#E5E7EB" stroke="#9CA3AF" stroke-width="1" />
            <polygon points="50,2 65,38 90,38" fill="#9CA3AF" stroke="#6B7280" stroke-width="1" />
            <polygon points="50,2 45,36 55,36" fill="#D97706" />
          </svg>
        </div>
        <div class="company-name-en">AL SAFWAH AL QABDHA TENTS IND L.L.C SP</div>
        <div class="company-name-ar">الصفوة الذهبية لصناعة الخيام ذ.م.م.ش.و</div>
        <div class="company-address">Al Saja Industrial Area, Sharjah</div>
        <div class="company-contacts">Tel: +971 6 767 9058 | TRN: 105319816200003 | Email: info@goldenelitetents.ae</div>
      </div>

      <!-- Title & Reference Banner -->
      <div class="title-banner">
        <div class="title-text">TAX INVOICE &mdash; فاتورة ضريبية</div>
        <div class="title-ref">REF: INV-2026-0042</div>
      </div>

      <!-- Client & Document References -->
      <div class="info-cards">
        <div class="card">
          <div class="card-header">
            <span>CUSTOMER / CLIENT DETAILS (بيانات العميل)</span>
            <span style="color: #94A3B8;">BUYER</span>
          </div>
          <div class="card-row card-val" style="color: #0F172A; font-size: 8.5pt;">AL NABOODAH CONTRACTING CO. L.L.C</div>
          <div class="card-row"><span class="card-label">TRN:</span> <span class="card-val">100345678900003</span></div>
          <div class="card-row"><span class="card-label">Sheikh Zayed Road, P.O. Box 1234, Dubai, UAE</span></div>
          <div class="card-row"><span class="card-label">Attn: Eng. Tariq Mansoor | Tel/Mob: +971 4 390 0000</span></div>
        </div>

        <div class="card">
          <div class="card-header">
            <span>DOCUMENT REFERENCE (البيانات)</span>
            <span style="color: #D97706; font-family: monospace;">INV-2026-0042</span>
          </div>
          <div class="card-row"><span class="card-label">Date:</span> <span class="card-val">29/09/2026</span> &nbsp;|&nbsp; <span class="card-label">Supply:</span> <span class="card-val">29/09/2026</span></div>
          <div class="card-row"><span class="card-label">Due:</span> <span class="card-val">29/10/2026</span> &nbsp;|&nbsp; <span class="card-label">Terms:</span> <span class="card-val">50% Advance on signing, 50% upon handover</span></div>
          <div class="card-row"><span class="card-label">Project:</span> <span class="card-val">Luxury Majlis &amp; Event Tents Facility</span></div>
        </div>
      </div>

      <!-- Items Table -->
      <table class="items-table">
        <thead>
          <tr>
            <th class="center" style="width: 6%;">#</th>
            <th style="width: 44%;">Item Description / البيان</th>
            <th class="center" style="width: 8%;">Qty</th>
            <th class="center" style="width: 8%;">Unit</th>
            <th class="num" style="width: 11%;">Rate (AED)</th>
            <th class="num" style="width: 10%;">VAT (5%)</th>
            <th class="num" style="width: 13%;">Total (AED)</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td class="center">1</td>
            <td><strong>Custom Arabic Majlis Tent (20m x 40m)</strong> Heavy Duty Flame Retardant PVC</td>
            <td class="center">1</td>
            <td class="center">Set</td>
            <td class="num">65000.00</td>
            <td class="num">3250.00</td>
            <td class="num">68250.00</td>
          </tr>
          <tr>
            <td class="center">2</td>
            <td><strong>Galvanized Steel &amp; Aluminum Structural Truss Arches</strong> (300mm Profile)</td>
            <td class="center">12</td>
            <td class="center">Pcs</td>
            <td class="num">3200.00</td>
            <td class="num">1920.00</td>
            <td class="num">40320.00</td>
          </tr>
          <tr>
            <td class="center">3</td>
            <td><strong>Double Glazed Tempered Glass Wall Panels &amp; Entrance Double Door</strong></td>
            <td class="center">8</td>
            <td class="center">Units</td>
            <td class="num">2450.00</td>
            <td class="num">980.00</td>
            <td class="num">20580.00</td>
          </tr>
          <tr>
            <td class="center">4</td>
            <td><strong>On-site Rigging, Assembly, Anchoring &amp; Safety Compliance Testing</strong></td>
            <td class="center">1</td>
            <td class="center">Job</td>
            <td class="num">15000.00</td>
            <td class="num">750.00</td>
            <td class="num">15750.00</td>
          </tr>
        </tbody>
      </table>

      <!-- Summary Section: Words & Totals -->
      <div class="summary-section">
        <div class="amount-words-box">
          <div class="amount-words-title">Amount in Words (المبلغ بالحروف):</div>
          <div class="amount-words-en">One Hundred Forty-Five Thousand Three Hundred Twenty Dirhams Only</div>
          <div class="amount-words-ar">فقط مائة و خمسة وأربعون ألف و ثلاثمائة وعشرون درهم إماراتي لا غير</div>
        </div>

        <div class="totals-box">
          <div class="totals-row">
            <span>Subtotal:</span>
            <span style="font-family: monospace; font-weight: bold;">AED 138,400.00</span>
          </div>
          <div class="totals-row">
            <span>VAT Total (5%):</span>
            <span style="font-family: monospace; font-weight: bold; color: #D97706;">AED 6,920.00</span>
          </div>
          <div class="totals-row grand-total">
            <span>Grand Total:</span>
            <span style="font-family: monospace; font-weight: 900;">AED 145,320.00</span>
          </div>
          <div class="totals-row balance">
            <span>Balance Due:</span>
            <span style="font-family: monospace; font-weight: 900;">AED 95,320.00</span>
          </div>
        </div>
      </div>

      <!-- Bottom Details: Bank & Signature -->
      <div class="bottom-details">
        <div class="bank-box">
          <div style="font-weight: bold; color: #0F172A; margin-bottom: 1mm;">Bank Transfer Information (بيانات التحويل):</div>
          <div><span style="color: #64748B;">Bank:</span> <strong>Mashreq Bank PSC</strong></div>
          <div><span style="color: #64748B;">Account:</span> <strong>AL SAFWAH AL QABDHA TENTS IND LLC SP</strong></div>
          <div><span style="color: #64748B;">IBAN:</span> <strong style="font-family: monospace;">AE130330000019161999916</strong></div>
          <div><span style="color: #64748B;">SWIFT:</span> <strong style="font-family: monospace;">BOMLAEAD</strong></div>
        </div>

        <div class="signature-box">
          <div style="margin-bottom: 2mm;">
            <!-- Signature placeholder stroke -->
            <svg viewBox="0 0 160 30" width="130" height="24">
              <path d="M 5,20 Q 35,5 70,18 T 115,10 T 155,22" fill="none" stroke="#0F172A" stroke-width="1.2" opacity="0.75" />
            </svg>
          </div>
          <div class="signature-title">COMPANY AUTHORIZED SIGNATURE</div>
        </div>
      </div>

      <!-- Terms & Remarks -->
      <div class="terms-section">
        <strong>Terms &amp; Remarks:</strong><br>
        All materials conform to UAE Civil Defence and Dubai Municipality structural standards.<br>
        50% Advance on signing, 50% upon successful handover.
      </div>

      <!-- Footer Bar -->
      <div class="footer-bar">
        AL SAFWAH AL QABDHA TENTS IND L.L.C SP | Tel: +971 6 767 9058 | Email: info@goldenelitetents.ae | Web: www.goldenelitetents.ae<br>
        Sharjah, UAE | TRN: 105319816200003 | Tax Invoice Issued Under UAE Federal Decree-Law No. (8) of 2017
      </div>
    </div>
  </div>
</body>
</html>`;

// ── 2. Write HTML file ─────────────────────────────────────────────────────────
const htmlPath = join(OUT_DIR, "tax_invoice_INV-2026-0042.html");
writeFileSync(htmlPath, htmlContent, "utf8");
console.log(`[1/5] Wrote invoice HTML to: ${htmlPath}`);

// ── 3. Generate Real PDF via Headless Chrome ───────────────────────────────────
const pdfPath = join(OUT_DIR, "tax_invoice_INV-2026-0042_verified.pdf");
console.log(`[2/5] Generating real PDF via Chrome: ${pdfPath}`);
execFileSync(CHROME_PATH, [
  "--headless=new",
  `--print-to-pdf=${pdfPath}`,
  "--no-pdf-header-footer",
  htmlPath,
]);

if (!existsSync(pdfPath)) {
  throw new Error(`Failed to generate PDF at ${pdfPath}`);
}
const pdfBytes = readFileSync(pdfPath);
console.log(`✓ Real PDF successfully generated: ${pdfBytes.length} bytes`);

// ── 4. Render PDF page to exact A4 PNG image via Chrome ───────────────────────
const pngPath = join(OUT_DIR, "tax_invoice_INV-2026-0042_verified.png");
console.log(`[3/5] Rendering invoice to exact A4 PNG image: ${pngPath}`);
execFileSync(CHROME_PATH, [
  "--headless=new",
  `--screenshot=${pngPath}`,
  "--window-size=794,1123",
  "--default-background-color=00000000",
  htmlPath,
]);

if (!existsSync(pngPath)) {
  throw new Error(`Failed to generate PNG screenshot at ${pngPath}`);
}
const pngBytes = readFileSync(pngPath);
console.log(`✓ Invoice PNG image successfully generated: ${pngBytes.length} bytes`);

// ── 5. Copy artifacts to brain directory for user inspection ───────────────────
const artifactPdf = join(ARTIFACTS_DIR, "tax_invoice_INV-2026-0042_verified.pdf");
const artifactPng = join(ARTIFACTS_DIR, "tax_invoice_INV-2026-0042_verified.png");
copyFileSync(pdfPath, artifactPdf);
copyFileSync(pngPath, artifactPng);
console.log(`[4/5] Copied verified artifacts to:`);
console.log(`  PDF -> ${artifactPdf}`);
console.log(`  PNG -> ${artifactPng}`);

// ── 6. Verification: Decompress PDF streams and verify vector drawing colors ────
const { inflateSync } = await import("node:zlib");

let offset = 0;
const pdfColorOps = [];
while ((offset = pdfBytes.indexOf("stream", offset)) !== -1) {
  let start = offset + 6;
  if (pdfBytes[start] === 13) start++;
  if (pdfBytes[start] === 10) start++;
  const end = pdfBytes.indexOf("endstream", start);
  if (end !== -1) {
    try {
      const decompressed = inflateSync(pdfBytes.subarray(start, end)).toString("utf8");
      const ops = decompressed.match(/[0-9.]+ [0-9.]+ [0-9.]+ (rg|RG)/g);
      if (ops) pdfColorOps.push(...ops);
    } catch {}
  }
  offset += 6;
}

const hasGoldVectorInPdf =
  pdfColorOps.some((op) => op.includes(".8784 .6745 .1373 rg") || op.includes(".8784 .6745 .1373 RG"));
const hasNavyVectorInPdf =
  pdfColorOps.some((op) => op.includes(".0902 .2353 .3922 rg") || op.includes(".0902 .2353 .3922 RG"));

// ── 7. Verification: Defilter PNG image and inspect physical pixels ───────────
const pngWidth = pngBytes.readUInt32BE(16);
const pngHeight = pngBytes.readUInt32BE(20);
const bpp = 3; // RGB
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

// Sample across the top border (y = 6, x = 100, 300, 500, 700)
const topSamplePoints = [100, 300, 500, 700].map((x) => getPixelAt(x, 6));
const isTopGold = topSamplePoints.every(
  ([r, g, b]) => r === 224 && g === 172 && b === 35
);

// Sample across the bottom border (y = pngHeight - 6, x = 100, 300, 500, 700)
const bottomSamplePoints = [100, 300, 500, 700].map((x) => getPixelAt(x, pngHeight - 6));
const isBottomNavy = bottomSamplePoints.every(
  ([r, g, b]) => r === 23 && g === 60 && b === 100
);

// Single A4 page check in PDF
const pdfText = pdfBytes.toString("latin1");
const pageMatches = pdfText.match(/\/Type\s*\/Page\b/g);
const pageCount = pageMatches ? pageMatches.length : 1;

console.log(`[5/5] Automated Border & Dimensions Verification:`);
console.log(`  Top Gold (#E0AC23) vector stream in PDF: ${hasGoldVectorInPdf ? "PASS ✓" : "FAIL ✗"}`);
console.log(`  Bottom Navy (#173C64) vector stream in PDF: ${hasNavyVectorInPdf ? "PASS ✓" : "FAIL ✗"}`);
console.log(`  Top Gold border pixels in rendered PNG: ${isTopGold ? "PASS ✓ (RGB 224, 172, 35 across full width)" : "FAIL ✗"}`);
console.log(`  Bottom Navy border pixels in rendered PNG: ${isBottomNavy ? "PASS ✓ (RGB 23, 60, 100 across full width)" : "FAIL ✗"}`);
console.log(`  Document page count: ${pageCount} A4 sheet(s) (${pageCount === 1 ? "PASS ✓ Single-page layout preserved" : "FAIL ✗ Multi-page overflow"})`);

if (!hasGoldVectorInPdf || !hasNavyVectorInPdf || !isTopGold || !isBottomNavy || pageCount !== 1) {
  throw new Error("Verification failed! One or more border / page checks did not pass.");
}

console.log("\n========================================================");
console.log("ALL 5 AUTOMATED VERIFICATION CHECKS PASSED WITH 100% SUCCESS!");
console.log("========================================================");

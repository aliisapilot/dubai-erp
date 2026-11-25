import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import * as pdfjsLib from "pdfjs-dist/legacy/build/pdf.mjs";
import puppeteer from "puppeteer-core";
import {
  buildPdfDocumentHtml,
  renderPdfFromHtmlSheets,
  sanitizeCssForPdf,
  sanitizeDocumentHtmlForPdf,
} from "../lib/serverPdfRenderer";

const ROOT = process.cwd();
const OUT_DIR = path.join(ROOT, "test-output");
fs.mkdirSync(OUT_DIR, { recursive: true });

let passed = 0;
let failed = 0;

function assert(cond: boolean, label: string, detail?: string) {
  if (cond) {
    passed++;
    console.log(`  [PASS] ${label}`);
  } else {
    failed++;
    console.error(`  [FAIL] ${label}${detail ? ` -> ${detail}` : ""}`);
  }
}

/**
 * Mirrors client-side mobile media query exclusion from `collectDocumentCssText`
 * so server tests exercise identical desktop-only CSS rules as live browser capture.
 */
function stripMobileMediaFromGlobalsCss(rawCss: string): string {
  return rawCss.replace(/@media\s+screen\s+and\s+\(max-width:\s*767px\)\s*\{[\s\S]*?\n\}/g, "");
}

function buildDesktopDocumentCss(): string {
  const globalsCss = fs.readFileSync(path.join(ROOT, "app/globals.css"), "utf8");
  const cleanGlobals = stripMobileMediaFromGlobalsCss(globalsCss);

  const layoutStyles = `
    .erp-doc-wrap {
      box-sizing: border-box;
      width: 210mm;
      min-height: 297mm;
      height: 297mm;
      padding: 12mm 14mm 12mm 14mm;
      background: #ffffff;
      color: #0f172a;
      font-family: 'Inter', Arial, sans-serif;
      display: flex;
      flex-direction: column;
      justify-content: space-between;
      position: relative;
      overflow: hidden;
    }
    .erp-doc-wrap.landscape {
      width: 297mm;
      min-height: 210mm;
      height: 210mm;
    }
    .erp-watermark {
      position: absolute;
      left: 50%;
      top: 56%;
      transform: translate(-50%, -50%);
      width: 110mm;
      opacity: 0.08;
      pointer-events: none;
      z-index: 0;
    }
    .erp-content {
      position: relative;
      z-index: 2;
    }
    .erp-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      border-bottom: 3px solid #1e3a5f;
      padding-bottom: 8px;
      margin-bottom: 10px;
      gap: 12px;
    }
    .erp-header-en {
      font-size: 15px;
      font-weight: 700;
      color: #1e3a5f;
      line-height: 1.3;
    }
    .erp-header-ar {
      font-family: 'Noto Sans Arabic', Arial, sans-serif;
      font-size: 14px;
      font-weight: 700;
      color: #1e3a5f;
      direction: rtl;
      text-align: right;
      line-height: 1.5;
    }
    .erp-title-bar {
      background: #1e3a5f;
      color: #ffffff;
      padding: 6px 12px;
      font-size: 13px;
      font-weight: 700;
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 10px;
      border-radius: 3px;
    }
    .erp-two-col {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 12px;
      margin-bottom: 10px;
    }
    .erp-box {
      border: 1px solid #cbd5e1;
      border-radius: 4px;
      padding: 8px 10px;
      font-size: 10.5px;
      line-height: 1.45;
      background: rgba(255, 255, 255, 0.92);
    }
    .erp-box-hdr {
      display: flex;
      justify-content: space-between;
      font-weight: 700;
      color: #1e3a5f;
      border-bottom: 1px solid #e2e8f0;
      padding-bottom: 4px;
      margin-bottom: 5px;
      font-size: 10px;
    }
    .erp-table {
      width: 100%;
      border-collapse: collapse;
      font-size: 9.5px;
      margin-bottom: 10px;
    }
    .erp-table th {
      background: #1e3a5f;
      color: #ffffff;
      padding: 6px 6px;
      text-align: left;
      font-weight: 600;
      border: 1px solid #1e3a5f;
    }
    .erp-table td {
      padding: 5.5px 6px;
      border: 1px solid #cbd5e1;
      vertical-align: top;
      line-height: 1.35;
    }
    .erp-table tr:nth-child(even) td {
      background: #f8fafc;
    }
    .num { text-align: right !important; white-space: nowrap; }
    .erp-summary-grid {
      display: grid;
      grid-template-columns: 1.25fr 0.75fr;
      gap: 12px;
      margin-bottom: 10px;
    }
    .erp-total-row {
      display: flex;
      justify-content: space-between;
      padding: 3px 0;
      font-size: 10.5px;
      line-height: 1.4;
    }
    .erp-total-grand {
      font-weight: 700;
      font-size: 11.5px;
      color: #1e3a5f;
      border-top: 1.5px solid #1e3a5f;
      padding-top: 5px;
      margin-top: 4px;
    }
    .erp-footer {
      border-top: 2px solid #d4af37;
      padding-top: 6px;
      display: flex;
      justify-content: space-between;
      font-size: 9px;
      color: #475569;
      position: relative;
      z-index: 2;
    }
  `;

  return `${cleanGlobals}\n${layoutStyles}`;
}

function buildInvoiceSheetsHtml(totalItems: number): string[] {
  const rowsPerPage = 12;
  const sheetCount = Math.max(1, Math.ceil(totalItems / rowsPerPage));
  const sheets: string[] = [];
  let grandTotal = 0;

  const allItems = Array.from({ length: totalItems }, (_, i) => {
    const qty = (i + 1) * 2;
    const rate = 125 + (i % 7) * 15;
    const net = qty * rate;
    const vat = net * 0.05;
    const lineTotal = net + vat;
    grandTotal += lineTotal;
    return {
      idx: i + 1,
      desc: `Heavy Duty PVC Tensile Shade Structure Module #${i + 1} (خيمة صناعية مقاومة للحرارة)`,
      qty,
      unit: i % 2 === 0 ? "Sqm" : "Pcs",
      rate: rate.toFixed(2),
      vat: vat.toFixed(2),
      total: lineTotal.toFixed(2),
    };
  });

  const subtotal = (grandTotal / 1.05).toFixed(2);
  const vatTotal = (grandTotal - Number(subtotal)).toFixed(2);

  for (let page = 0; page < sheetCount; page++) {
    const start = page * rowsPerPage;
    const slice = allItems.slice(start, start + rowsPerPage);
    const isLast = page === sheetCount - 1;

    const rowsHtml = slice
      .map(
        (row) => `
      <tr>
        <td style="width:28px;">${row.idx}</td>
        <td>${row.desc}</td>
        <td class="num" style="width:45px;">${row.qty}</td>
        <td style="width:48px;">${row.unit}</td>
        <td class="num" style="width:68px;">${row.rate}</td>
        <td class="num" style="width:62px;">${row.vat}</td>
        <td class="num" style="width:74px;">${row.total}</td>
      </tr>`
      )
      .join("");

    const summaryHtml = isLast
      ? `
      <div class="erp-summary-grid">
        <div class="erp-box">
          <div class="erp-box-hdr">
            <span>Amount in Words</span>
            <span class="font-arabic" dir="rtl">المبلغ بالحروف</span>
          </div>
          <div>UAE Dirhams Only — Grand Total AED ${grandTotal.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
        </div>
        <div class="erp-box">
          <div class="erp-total-row"><span>Subtotal</span><span>AED ${subtotal}</span></div>
          <div class="erp-total-row"><span>VAT (5%)</span><span>AED ${vatTotal}</span></div>
          <div class="erp-total-row erp-total-grand"><span>Grand Total</span><span>AED ${grandTotal.toFixed(2)}</span></div>
        </div>
      </div>
      <div class="erp-two-col">
        <div class="erp-box">
          <div class="erp-box-hdr">
            <span>Bank Information</span>
            <span class="font-arabic" dir="rtl">بيانات التحويل البنكي</span>
          </div>
          <div>Bank: Mashreq Bank PSC, Dubai UAE</div>
          <div>Account Name: Al Safwa Tents &amp; Sheds LLC</div>
          <div>IBAN: AE130330000019101999916 | SWIFT: BOMLAEAD</div>
        </div>
        <div class="erp-box">
          <div class="erp-box-hdr">
            <span>Payment Terms &amp; Remarks</span>
            <span class="font-arabic" dir="rtl">الشروط والملاحظات</span>
          </div>
          <div>1. 50% advance upon LPO confirmation, 50% on delivery.</div>
          <div>2. Quotation valid for 15 calendar days from issue date.</div>
        </div>
      </div>`
      : `<div class="erp-box" style="text-align:right;font-style:italic;">Continued on Page ${page + 2} of ${sheetCount}...</div>`;

    sheets.push(`
      <div class="dynamic-document-page erp-doc-wrap" data-orientation="portrait" style="transform: scale(0.45);">
        <img class="erp-watermark" src="/company-assets/watermark.png" alt="" />
        <div class="erp-content">
          <div class="erp-header">
            <div>
              <div class="erp-header-en">AL SAFWA TENTS &amp; SHEDS INSTALLATION LLC</div>
              <div style="font-size:10px;color:#475569;">Industrial Area 13, Sharjah, United Arab Emirates | TRN: 100451829300003</div>
            </div>
            <img src="__PDF_ASSET_1__" alt="Logo" style="height:44px;width:auto;" />
            <div style="text-align:right;">
              <div class="erp-header-ar" dir="rtl">شركة الصفوة للخيام والمظلات ذ.م.م</div>
              <div class="font-arabic" dir="rtl" style="font-size:10px;color:#475569;">المنطقة الصناعية ١٣، الشارقة، الإمارات</div>
            </div>
          </div>

          <div class="erp-title-bar">
            <span>QUOTATION / TAX ESTIMATE (Items: ${totalItems})</span>
            <span class="font-arabic" dir="rtl">عرض سعر رسمي — صفحة ${page + 1} من ${sheetCount}</span>
          </div>

          <div class="erp-two-col">
            <div class="erp-box">
              <div class="erp-box-hdr">
                <span>CUSTOMER DETAILS</span>
                <span class="font-arabic" dir="rtl">بيانات العميل</span>
              </div>
              <div><strong>AL KARWAN SOLUTION FZC</strong></div>
              <div>P.O. Box 124588, Sharjah Airport International Free Zone</div>
              <div>TRN: 100293847100003 | Tel: +971 6 557 8890</div>
            </div>
            <div class="erp-box">
              <div class="erp-box-hdr">
                <span>DOCUMENT REFERENCE</span>
                <span class="font-arabic" dir="rtl">بيانات المستند</span>
              </div>
              <div>Document No: <strong>QUO-2026-005</strong></div>
              <div>Issue Date: 25 Nov 2026 | Validity: 15 Days</div>
              <div>Scope: Tensile PVC Shade Fabrication &amp; Installation</div>
            </div>
          </div>

          <table class="erp-table">
            <thead>
              <tr>
                <th>#</th>
                <th>Description</th>
                <th class="num">Qty</th>
                <th>Unit</th>
                <th class="num">Rate (AED)</th>
                <th class="num">VAT (5%)</th>
                <th class="num">Total (AED)</th>
              </tr>
            </thead>
            <tbody>${rowsHtml}</tbody>
          </table>

          ${summaryHtml}
        </div>
        <div class="erp-footer">
          <span>Dubai ERP Authoritative A4 Server PDF</span>
          <span>Page ${page + 1} of ${sheetCount}</span>
        </div>
      </div>
    `);
  }

  return sheets;
}

function buildSoaSheetHtml(): string {
  const rows = [
    ["01 Oct 2026", "OPENING", "Opening Balance Carried Forward", "12,500.00", "0.00", "12,500.00"],
    ["05 Oct 2026", "INV-2026-101", "Fabrication & Supply of Heavy Tent Shed 15x20m", "24,150.00", "0.00", "36,650.00"],
    ["14 Oct 2026", "RV-2026-044", "Bank Transfer Settlement — Ref: BT992018 (Elegance Tents)", "0.00", "5,821.20", "30,828.80"],
    ["22 Oct 2026", "INV-2026-119", "Repair & Tensioning of PVC Canopy Membrane", "8,400.00", "0.00", "39,228.80"],
    ["31 Oct 2026", "RV-2026-052", "Online Transfer Received — Invoice INV-2026-101 Part", "0.00", "10,000.00", "29,228.80"],
  ];

  const rowsHtml = rows
    .map(
      (r) => `
    <tr>
      <td>${r[0]}</td>
      <td>${r[1]}</td>
      <td>${r[2]}</td>
      <td class="num">${r[3]}</td>
      <td class="num">${r[4]}</td>
      <td class="num"><strong>${r[5]}</strong></td>
    </tr>`
    )
    .join("");

  return `
    <div class="dynamic-document-page erp-doc-wrap" data-orientation="portrait">
      <div class="erp-content">
        <div class="erp-header">
          <div>
            <div class="erp-header-en">STATEMENT OF ACCOUNT</div>
            <div style="font-size:10px;color:#475569;">Customer: Elegance Tents And Sheds Installation | SOA137-26</div>
          </div>
          <div class="erp-header-ar" dir="rtl">كشف حساب العميل</div>
        </div>
        <div class="erp-two-col">
          <div class="erp-box">
            <div><strong>Statement Ref:</strong> SOA137-26</div>
            <div><strong>Period:</strong> 01 Oct 2026 – 31 Oct 2026</div>
          </div>
          <div class="erp-box">
            <div><strong>Total Debits:</strong> AED 45,050.00</div>
            <div><strong>Total Credits:</strong> AED 15,821.20</div>
            <div><strong>Closing Balance:</strong> AED 29,228.80</div>
          </div>
        </div>
        <table class="erp-table">
          <thead>
            <tr>
              <th>Date</th>
              <th>Reference</th>
              <th>Description</th>
              <th class="num">Debit (AED)</th>
              <th class="num">Credit (AED)</th>
              <th class="num">Balance (AED)</th>
            </tr>
          </thead>
          <tbody>${rowsHtml}</tbody>
        </table>
      </div>
      <div class="erp-footer">
        <span>Generated Server-Side A4 Statement</span>
        <span>Closing Balance Due: AED 29,228.80</span>
      </div>
    </div>
  `;
}

function buildLandscapeSheetHtml(): string {
  return `
    <div class="dynamic-document-page erp-doc-wrap landscape" data-orientation="landscape">
      <div class="erp-content">
        <div class="erp-header">
          <div>
            <div class="erp-header-en">MONTHLY EMPLOYEE ATTENDANCE REGISTER — NOVEMBER 2026</div>
            <div style="font-size:10px;color:#475569;">AL SAFWA TENTS &amp; SHEDS LLC — A4 LANDSCAPE SHEET</div>
          </div>
          <div class="erp-header-ar" dir="rtl">كشف الحضور الشهري للعمال</div>
        </div>
        <table class="erp-table">
          <thead>
            <tr>
              <th>Emp #</th>
              <th>Employee Name</th>
              <th>Role</th>
              <th class="num">Regular Days</th>
              <th class="num">Overtime Hrs</th>
              <th class="num">Absent</th>
              <th class="num">Net Payable (AED)</th>
            </tr>
          </thead>
          <tbody>
            <tr><td>EMP-001</td><td>Muhammad Ali Khan</td><td>Senior Welder</td><td class="num">26</td><td class="num">18.5</td><td class="num">0</td><td class="num">4,850.00</td></tr>
            <tr><td>EMP-002</td><td>Rashid Al Maktoum</td><td>Site Supervisor</td><td class="num">26</td><td class="num">10.0</td><td class="num">0</td><td class="num">7,200.00</td></tr>
            <tr><td>EMP-003</td><td>Sajid Hussain</td><td>PVC Technician</td><td class="num">25</td><td class="num">24.0</td><td class="num">1</td><td class="num">4,410.00</td></tr>
          </tbody>
        </table>
      </div>
      <div class="erp-footer">
        <span>Dubai ERP Landscape Attendance Sheet</span>
        <span>Page 1 of 1</span>
      </div>
    </div>
  `;
}

interface TextBox {
  str: string;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

async function auditGeneratedPdf(
  pdfBuf: Buffer,
  expectedPages: number,
  landscape: boolean,
  expectedSubstrings: string[]
): Promise<{ text: string; numPages: number }> {
  const uint8 = new Uint8Array(pdfBuf);
  const doc = await pdfjsLib.getDocument({ data: uint8, verbosity: 0 }).promise;
  const numPages = doc.numPages;

  assert(numPages === expectedPages, `Exact A4 page count == ${expectedPages}`, `got ${numPages}`);

  let fullText = "";
  let totalOverlapCollisions = 0;

  for (let p = 1; p <= numPages; p++) {
    const page = await doc.getPage(p);
    const vp = page.getViewport({ scale: 1 });
    const expectedW = landscape ? 841.89 : 595.28;
    const expectedH = landscape ? 595.28 : 841.89;

    assert(
      Math.abs(vp.width - expectedW) < 2.5 && Math.abs(vp.height - expectedH) < 2.5,
      `Page ${p} A4 MediaBox dimensions (${expectedW.toFixed(1)}x${expectedH.toFixed(1)}pt)`,
      `got ${vp.width.toFixed(2)}x${vp.height.toFixed(2)}pt`
    );

    const content = await page.getTextContent();
    const boxes: TextBox[] = [];
    let pageText = "";

    for (const rawItem of content.items) {
      if (!("str" in rawItem)) continue;
      const str = rawItem.str;
      if (!str || !str.trim()) continue;
      pageText += str + " ";

      const tr = rawItem.transform;
      const x = tr[4];
      const y = tr[5];
      const h = Math.max(Math.abs(tr[3]) || rawItem.height || 8, 4);
      const w = Math.max(rawItem.width || 0, 2);

      boxes.push({
        str: str.trim(),
        x1: x,
        y1: y,
        x2: x + w,
        y2: y + h,
      });
    }

    fullText += pageText + "\n";
    assert(pageText.trim().length > 80, `Page ${p} contains extracted vector text`, `chars=${pageText.trim().length}`);

    // Detect 2D text bounding-box collisions (>5pt horizontal and >4pt vertical overlap between distinct items)
    for (let i = 0; i < boxes.length; i++) {
      for (let j = i + 1; j < boxes.length; j++) {
        const a = boxes[i];
        const b = boxes[j];
        const overlapX = Math.min(a.x2, b.x2) - Math.max(a.x1, b.x1);
        const overlapY = Math.min(a.y2, b.y2) - Math.max(a.y1, b.y1);
        if (overlapX > 6 && overlapY > 4.5) {
          totalOverlapCollisions++;
          if (totalOverlapCollisions <= 3) {
            console.error(
              `    [OVERLAP p${p}] "${a.str}" vs "${b.str}" (overlapX=${overlapX.toFixed(1)}, overlapY=${overlapY.toFixed(1)})`
            );
          }
        }
      }
    }
  }

  assert(
    totalOverlapCollisions === 0,
    `Zero overlapping text bounding boxes across all ${numPages} pages`,
    `collisions=${totalOverlapCollisions}`
  );

  for (const sub of expectedSubstrings) {
    assert(fullText.includes(sub), `Vector text contains "${sub}"`);
  }

  return { text: fullText, numPages };
}

async function renderPdfPagesToPng(pdfFiles: Array<{ pdfPath: string; pngPath: string; label: string }>) {
  const server = http.createServer((req, res) => {
    const reqUrl = decodeURIComponent((req.url || "/").split("?")[0]);
    if (reqUrl === "/pdf.mjs") {
      res.writeHead(200, { "Content-Type": "application/javascript" });
      fs.createReadStream(path.join(ROOT, "node_modules/pdfjs-dist/build/pdf.mjs")).pipe(res);
      return;
    }
    if (reqUrl === "/pdf.worker.mjs") {
      res.writeHead(200, { "Content-Type": "application/javascript" });
      fs.createReadStream(path.join(ROOT, "node_modules/pdfjs-dist/build/pdf.worker.mjs")).pipe(res);
      return;
    }
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    res.end(`<!DOCTYPE html>
      <html><body style="margin:0;background:#fff;">
      <canvas id="c"></canvas>
      <script type="module">
        import * as pdfjsLib from "/pdf.mjs";
        pdfjsLib.GlobalWorkerOptions.workerSrc = "/pdf.worker.mjs";
        window.renderPdfBytes = async (byteArray) => {
          const doc = await pdfjsLib.getDocument({ data: new Uint8Array(byteArray), verbosity: 0 }).promise;
          const page = await doc.getPage(1);
          const vp = page.getViewport({ scale: 1.5 });
          const canvas = document.getElementById("c");
          canvas.width = vp.width;
          canvas.height = vp.height;
          await page.render({ canvasContext: canvas.getContext("2d"), viewport: vp }).promise;
          return { width: vp.width, height: vp.height, numPages: doc.numPages };
        };
      </script></body></html>`);
  });

  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const addr = server.address();
  const port = typeof addr === "object" && addr ? addr.port : 0;

  const browser = await puppeteer.launch({
    executablePath: "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
    headless: true,
  });

  try {
    const page = await browser.newPage();
    await page.goto(`http://127.0.0.1:${port}/`, { waitUntil: "networkidle0" });
    for (const item of pdfFiles) {
      const byteArray = Array.from(fs.readFileSync(item.pdfPath));
      const dims = await page.evaluate(
        (bytes: number[]) =>
          (window as unknown as {
            renderPdfBytes: (b: number[]) => Promise<{ width: number; height: number; numPages: number }>;
          }).renderPdfBytes(bytes),
        byteArray
      );
      await page.setViewport({ width: Math.ceil(dims.width), height: Math.ceil(dims.height), deviceScaleFactor: 1 });
      const canvasEl = await page.$("#c");
      if (canvasEl) {
        await canvasEl.screenshot({ path: item.pngPath });
      }
      assert(fs.existsSync(item.pngPath) && fs.statSync(item.pngPath).size > 5000, `Rendered PNG preview for ${item.label}`);
    }
  } finally {
    await browser.close().catch(() => {});
    server.close();
  }
}

async function main() {
  console.log("=== Step 2: Server Chromium PDF Renderer & Visual Audit ===");

  // 1. Sanitization & anti-injection tests
  const dirtyHtml = `<div onclick="alert(1)"><script>fetch("http://evil")</script><iframe src="x"></iframe><a href="javascript:alert(1)">Link</a><img src="__PDF_ASSET_1__" /><img src="__PDF_ASSET_BAD__" />OK</div>`;
  const cleanHtml = sanitizeDocumentHtmlForPdf(dirtyHtml);
  assert(!cleanHtml.includes("<script"), "HTML sanitizer strips <script>");
  assert(!cleanHtml.includes("<iframe"), "HTML sanitizer strips <iframe>");
  assert(!cleanHtml.includes("onclick="), "HTML sanitizer strips inline event handlers");
  assert(!cleanHtml.includes("javascript:"), "HTML sanitizer strips javascript: URLs");

  const dirtyCss = `<style>body { color: expression(alert(1)); }</style>@import url(http://evil.css); .ok { color: #000; }`;
  const cleanCss = sanitizeCssForPdf(dirtyCss);
  assert(!cleanCss.includes("<style") && !cleanCss.includes("@import") && !cleanCss.includes("expression("), "CSS sanitizer blocks <style>, @import, expression()");

  const logoBytes = fs.readFileSync(path.join(ROOT, "public/company-assets/logo.png"));
  const logoDataUri = `data:image/png;base64,${logoBytes.toString("base64")}`;
  const builtDoc = buildPdfDocumentHtml({
    sheetsHtml: [cleanHtml],
    cssText: ".ok { color: #000; }",
    assets: {
      __PDF_ASSET_1__: logoDataUri,
      __PDF_ASSET_BAD__: "data:text/html;base64,PHNjcmlwdD4=",
    },
    title: "SecurityTest",
  });
  assert(builtDoc.includes(logoDataUri), "Asset hydration replaces valid __PDF_ASSET_1__ image data URI");
  assert(!builtDoc.includes("data:text/html"), "Asset hydration rejects non-image __PDF_ASSET__ URIs");

  // 2. Render & audit 1, 10, 15, 30, 50 line items + SOA + Landscape PDFs
  const cssText = buildDesktopDocumentCss();
  const assets = { __PDF_ASSET_1__: logoDataUri };

  const invoiceCases = [
    { count: 1, expectedPages: 1, file: "sample_pdf_1_item.pdf" },
    { count: 10, expectedPages: 1, file: "sample_pdf_10_items.pdf" },
    { count: 15, expectedPages: 2, file: "sample_pdf_15_items.pdf" },
    { count: 30, expectedPages: 3, file: "sample_pdf_30_items.pdf" },
    { count: 50, expectedPages: 5, file: "sample_pdf_50_items.pdf" },
  ];

  for (const c of invoiceCases) {
    console.log(`\n[Case] Invoice ${c.count} items -> ${c.file}`);
    const sheetsHtml = buildInvoiceSheetsHtml(c.count);
    const pdfBuf = await renderPdfFromHtmlSheets({
      sheetsHtml,
      cssText,
      assets,
      landscape: false,
      title: `QUO-2026-005-${c.count}`,
    });
    const outPath = path.join(OUT_DIR, c.file);
    fs.writeFileSync(outPath, pdfBuf);
    assert(pdfBuf.subarray(0, 5).toString("ascii") === "%PDF-", `${c.file} starts with %PDF- signature`);
    await auditGeneratedPdf(pdfBuf, c.expectedPages, false, [
      "AL SAFWA TENTS & SHEDS INSTALLATION LLC",
      "AL KARWAN SOLUTION FZC",
      "QUO-2026-005",
      "AE130330000019101999916",
      `Module #${c.count}`,
    ]);
  }

  console.log("\n[Case] Customer Statement (SOA137-26) -> sample_soa_server.pdf");
  const soaPdf = await renderPdfFromHtmlSheets({
    sheetsHtml: [buildSoaSheetHtml()],
    cssText,
    landscape: false,
    title: "SOA137-26",
  });
  const soaPath = path.join(OUT_DIR, "sample_soa_server.pdf");
  fs.writeFileSync(soaPath, soaPdf);
  await auditGeneratedPdf(soaPdf, 1, false, [
    "STATEMENT OF ACCOUNT",
    "SOA137-26",
    "5,821.20",
    "29,228.80",
  ]);

  console.log("\n[Case] Landscape A4 Sheet -> sample_landscape.pdf");
  const landscapePdf = await renderPdfFromHtmlSheets({
    sheetsHtml: [buildLandscapeSheetHtml()],
    cssText,
    landscape: true,
    title: "Attendance-Landscape",
  });
  const landscapePath = path.join(OUT_DIR, "sample_landscape.pdf");
  fs.writeFileSync(landscapePath, landscapePdf);
  await auditGeneratedPdf(landscapePdf, 1, true, [
    "MONTHLY EMPLOYEE ATTENDANCE REGISTER",
    "Muhammad Ali Khan",
    "4,850.00",
  ]);

  console.log("\n[Visual Render] Rendering PDFs via pdfjs-dist to PNG for visual inspection...");
  await renderPdfPagesToPng([
    { pdfPath: path.join(OUT_DIR, "sample_pdf_1_item.pdf"), pngPath: path.join(OUT_DIR, "preview_1_item_p1.png"), label: "1-item invoice" },
    { pdfPath: path.join(OUT_DIR, "sample_pdf_15_items.pdf"), pngPath: path.join(OUT_DIR, "preview_15_items_p1.png"), label: "15-item invoice" },
    { pdfPath: path.join(OUT_DIR, "sample_soa_server.pdf"), pngPath: path.join(OUT_DIR, "preview_soa_p1.png"), label: "SOA statement" },
    { pdfPath: path.join(OUT_DIR, "sample_landscape.pdf"), pngPath: path.join(OUT_DIR, "preview_landscape_p1.png"), label: "Landscape sheet" },
  ]);

  console.log(`\nSUMMARY: ${passed} passed, ${failed} failed.`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

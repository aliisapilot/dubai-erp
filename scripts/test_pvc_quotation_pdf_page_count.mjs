import { writeFileSync, readFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import assert from "node:assert/strict";

const OUT_DIR = join(process.cwd(), "test-output");
mkdirSync(OUT_DIR, { recursive: true });

const CHROME_PATH = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const globalsCss = readFileSync(join(process.cwd(), "app", "globals.css"), "utf-8");

// Exact quotation HTML replicating QuotationTemplate.tsx with Al Karwan Solution FZC & 3 line items
const htmlContent = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>Quotation QUO-2026-0001</title>
<style>
  ${globalsCss}
  @page {
    size: A4 portrait;
    margin: 0;
  }
</style>
</head>
<body class="bg-white text-slate-800">
  <div class="print-template-wrapper">
    <div class="print-page print-document document-sheet single-page-doc relative mx-auto box-border min-h-[297mm] w-[210mm] border border-slate-200 bg-white p-[10mm] shadow-xl print:m-0 print:min-h-[297mm] print:w-[210mm] print:border-none print:p-[8mm] print:shadow-none overflow-hidden">
      
      <!-- Company DocHeader -->
      <div class="mb-3 pb-2 border-b-2 border-slate-900 flex justify-between items-center">
        <div>
          <div class="text-base font-bold text-slate-900 tracking-wider">AL SAFWAH AL QABDHA TENTS IND L.L.C SP</div>
          <div class="text-xs font-semibold text-amber-700">الصفوة الذهبية لصناعة الخيام ذ.م.م.ش.و</div>
          <div class="text-[9px] text-slate-500">TRN: 100519014200003 | Sharjah, United Arab Emirates</div>
        </div>
        <div class="text-right">
          <div class="bg-slate-900 text-white font-black text-xs px-3 py-1 rounded">QUOTATION / عرض أسعار</div>
          <div class="text-xs font-mono font-bold text-blue-700 mt-0.5">REF: QUO-2026-0001</div>
        </div>
      </div>

      <!-- Customer & Offer Details -->
      <div class="grid grid-cols-2 gap-3 mb-3 text-xs">
        <div class="rounded border border-slate-200 bg-slate-50/50 p-2.5">
          <div class="font-bold text-slate-900 uppercase text-[10px] mb-1.5 border-b border-slate-200 pb-1 flex justify-between">
            <span>Client Details (بيانات العميل):</span>
            <span class="text-slate-400 font-normal">Buyer</span>
          </div>
          <div class="space-y-0.5 text-slate-700 text-[11px]">
            <div class="font-bold text-slate-900 text-xs">Al Karwan Solution FZC</div>
            <div><span class="text-slate-500">TRN:</span> <span class="font-mono font-bold">100234567800003</span></div>
            <div><span class="text-slate-500">Address:</span> SAIF Zone, Sharjah, UAE</div>
            <div><span class="text-slate-500">Attention:</span> Purchase Dept (+971 6 555 4321)</div>
          </div>
        </div>

        <div class="rounded border border-slate-200 bg-slate-50/50 p-2.5">
          <div class="font-bold text-slate-900 uppercase text-[10px] mb-1.5 border-b border-slate-200 pb-1 flex justify-between">
            <span>Offer Details (بيانات العرض):</span>
            <span class="text-blue-700 font-semibold font-mono">QUO-2026-0001</span>
          </div>
          <div class="grid grid-cols-2 gap-y-1 text-slate-700 text-[11px]">
            <div><span class="text-slate-500">Date:</span> <span class="font-semibold text-slate-900">08/10/2026</span></div>
            <div><span class="text-slate-500">Validity:</span> <span class="font-semibold text-slate-900">30 Days</span></div>
            <div class="col-span-2"><span class="text-slate-500">Scope:</span> <span class="font-semibold text-slate-900">PVC Tank Liner — 3 Tanks (Ø7.19m × H6.05m)</span></div>
          </div>
        </div>
      </div>

      <!-- Quotation Items Table -->
      <div class="my-3 overflow-hidden rounded border border-slate-300">
        <table class="w-full text-xs text-left">
          <thead class="bg-slate-900 text-white font-semibold">
            <tr>
              <th class="py-2 px-2 text-center w-8">#</th>
              <th class="py-2 px-3">Item &amp; Specification (بيان الأصناف والمواصفات)</th>
              <th class="py-2 px-2 text-center w-14">Qty</th>
              <th class="py-2 px-2 text-center w-14">Unit</th>
              <th class="py-2 px-2 text-right w-24">Unit Rate (AED)</th>
              <th class="py-2 px-2 text-right w-20">VAT (5%)</th>
              <th class="py-2 px-3 text-right w-28">Total (AED)</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-slate-200 bg-white text-[11px]">
            <tr class="hover:bg-slate-50/50">
              <td class="py-2 px-2 text-center text-slate-400">1</td>
              <td class="py-2 px-3 font-medium text-slate-800">PVC Fabric Korean 900 GSM</td>
              <td class="py-2 px-2 text-center font-mono font-bold">891</td>
              <td class="py-2 px-2 text-center text-slate-600">Sqm</td>
              <td class="py-2 px-2 text-right font-mono">15.00</td>
              <td class="py-2 px-2 text-right font-mono text-amber-700">668.25</td>
              <td class="py-2 px-3 text-right font-mono font-bold text-slate-900">14,033.25</td>
            </tr>
            <tr class="hover:bg-slate-50/50">
              <td class="py-2 px-2 text-center text-slate-400">2</td>
              <td class="py-2 px-3 font-medium text-slate-800">PVC Fabrication / Welding</td>
              <td class="py-2 px-2 text-center font-mono font-bold">852</td>
              <td class="py-2 px-2 text-center text-slate-600">Mtr</td>
              <td class="py-2 px-2 text-right font-mono">8.00</td>
              <td class="py-2 px-2 text-right font-mono text-amber-700">340.80</td>
              <td class="py-2 px-3 text-right font-mono font-bold text-slate-900">7,156.80</td>
            </tr>
            <tr class="hover:bg-slate-50/50">
              <td class="py-2 px-2 text-center text-slate-400">3</td>
              <td class="py-2 px-3 font-medium text-slate-800">SS Eyelet 14mm</td>
              <td class="py-2 px-2 text-center font-mono font-bold">693</td>
              <td class="py-2 px-2 text-center text-slate-600">Pcs</td>
              <td class="py-2 px-2 text-right font-mono">1.50</td>
              <td class="py-2 px-2 text-right font-mono text-amber-700">51.98</td>
              <td class="py-2 px-3 text-right font-mono font-bold text-slate-900">1,091.48</td>
            </tr>
          </tbody>
        </table>
      </div>

      <!-- Financial Totals & Words -->
      <div class="grid grid-cols-12 gap-3 my-3">
        <div class="col-span-7 space-y-2 text-xs">
          <div class="rounded border border-slate-200 bg-slate-50/50 p-2.5 space-y-1">
            <div class="font-semibold text-slate-800 text-[10px]">Amount in Words:</div>
            <div class="text-slate-700 italic font-medium text-[11px]">Twenty-Two Thousand Two Hundred Eighty-One Dirhams and Fifty-Three Fils</div>
            <div class="text-slate-800 font-arabic text-right dir-rtl font-semibold text-[11px] pt-1 border-t border-slate-200/60">
              اثنان وعشرون ألفاً ومائتان وواحد وثمانون درهماً وثلاثة وخمسون فلساً
            </div>
          </div>

          <div class="rounded border border-slate-200 bg-slate-50/30 p-2 text-[10px] text-slate-600">
            <div class="font-bold text-slate-800 mb-0.5">Terms &amp; Conditions (الشروط والأحكام):</div>
            <div class="leading-relaxed">
              1. 50% Advance with official Purchase Order, 50% upon delivery / installation.<br/>
              2. Delivery: 7-10 working days from approval. Validity: 30 days.
            </div>
          </div>
        </div>

        <div class="col-span-5">
          <div class="rounded border border-slate-200 overflow-hidden text-xs">
            <div class="flex justify-between py-1.5 px-3 bg-slate-50/60 border-b border-slate-200">
              <span class="text-slate-600">Subtotal (Excl. VAT):</span>
              <span class="font-mono font-semibold">AED 21,220.50</span>
            </div>
            <div class="flex justify-between py-1.5 px-3 border-b border-slate-200">
              <span class="text-slate-600">VAT Total (5%):</span>
              <span class="font-mono font-semibold text-amber-700">AED 1,061.03</span>
            </div>
            <div class="flex justify-between py-2 px-3 bg-blue-50/60 border-b border-blue-200 font-bold text-slate-900 text-sm">
              <span>Total Offer (المجموع):</span>
              <span class="font-mono text-blue-900">AED 22,281.53</span>
            </div>
          </div>
        </div>
      </div>

      <!-- Signatures -->
      <div class="grid grid-cols-2 gap-4 border-t border-slate-200 pt-3 text-xs mt-4">
        <div>
          <div class="text-[10px] font-bold text-slate-700 uppercase">COMPANY AUTHORIZED SIGNATURE &amp; STAMP</div>
          <div class="h-16 flex items-end">
            <span class="text-[10px] text-slate-400">AL SAFWAH AL QABDHA TENTS IND L.L.C SP</span>
          </div>
        </div>
        <div class="text-right">
          <div class="text-[10px] font-bold text-slate-700 uppercase">CLIENT ACKNOWLEDGEMENT</div>
          <div class="h-16 flex items-end justify-end">
            <span class="text-[10px] text-slate-400">Al Karwan Solution FZC</span>
          </div>
        </div>
      </div>

      <!-- Footer -->
      <div class="mt-4 pt-2 border-t border-slate-200 text-center text-[9px] text-slate-500">
        Bank: Abu Dhabi Islamic Bank (ADIB) &bull; IBAN: AE000000000000000000000 &bull; Generated by Dubai ERP CRM
      </div>
    </div>
  </div>
</body>
</html>`;

const htmlPath = join(OUT_DIR, "pvc_quotation_print_test.html");
const pdfPath = join(OUT_DIR, "pvc_quotation_print_test.pdf");

writeFileSync(htmlPath, htmlContent, "utf-8");

// Generate PDF via Headless Chrome
execFileSync(CHROME_PATH, [
  "--headless=new",
  "--disable-gpu",
  "--no-pdf-header-footer",
  `--print-to-pdf=${pdfPath}`,
  htmlPath,
]);

console.log("Generated PDF to:", pdfPath);

const pdfBytes = readFileSync(pdfPath);
const pdfText = pdfBytes.toString("latin1");
const pageMatches = pdfText.match(/\/Type\s*\/Page\b/g);
const pageCount = pageMatches ? pageMatches.length : 1;

console.log("PDF Size in Bytes:", pdfBytes.length);
console.log("Detected Page Count:", pageCount);

assert.equal(pageCount, 1, `Expected exactly 1 page, but got ${pageCount} pages!`);
console.log("SUCCESS! PVC Tank Liner Quotation PDF renders in EXACTLY 1 page!");

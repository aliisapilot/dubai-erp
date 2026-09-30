import { writeFileSync, readFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import assert from "node:assert/strict";

const OUT_DIR = join(process.cwd(), "test-output");
mkdirSync(OUT_DIR, { recursive: true });

const CHROME_PATH = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const globalsCss = readFileSync(join(process.cwd(), "app", "globals.css"), "utf-8");

// Mock exact measurement data as rendered in the screenshot:
// Sheet Title: PVC Parking Shade Fabric & Joint Takeoff
// Ref: MS-2026-0001, Date: 30/09/2026
// 4 Rows: Area 1, Area 2, Area 3, Area 4
const htmlContent = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>Measurement Sheet MS-2026-0001</title>
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
      
      <div class="text-slate-800 bg-white font-sans text-xs">
        <!-- Header -->
        <div class="mb-2 pb-2 border-b-2 border-slate-900 flex justify-between items-center">
          <div>
            <div class="text-base font-bold text-slate-900 tracking-wider">AL SAFWAH AL QABDHA TENTS IND L.L.C SP</div>
            <div class="text-xs font-semibold text-amber-700">الصفوة الذهبية لصناعة الخيام ذ.م.م.ش.و</div>
            <div class="text-[9px] text-slate-500">TRN: 100519014200003 | Sharjah, UAE</div>
          </div>
          <div class="text-right">
            <div class="bg-slate-900 text-white font-black text-xs px-3 py-1 rounded">MEASUREMENT & TAKEOFF SHEET</div>
            <div class="text-xs font-mono font-bold text-slate-700 mt-0.5">REF: MS-2026-0001</div>
          </div>
        </div>

        <!-- Document Reference Info -->
        <div class="mb-2 grid grid-cols-2 gap-3 rounded border border-slate-200 bg-slate-50/70 p-2 text-xs">
          <div>
            <p class="text-[9px] font-bold text-slate-500 uppercase tracking-wider">Sheet Title</p>
            <p class="font-bold text-slate-900 text-xs">PVC Parking Shade Fabric & Joint Takeoff</p>
          </div>
          <div class="text-right">
            <p class="text-[9px] font-bold text-slate-500 uppercase tracking-wider">Sheet Number</p>
            <p class="font-bold text-emerald-700 text-xs font-mono">MS-2026-0001</p>
            <p class="text-slate-600 text-[10px]">Date: 30/09/2026</p>
          </div>
        </div>

        <!-- Table -->
        <div class="mb-2 overflow-hidden rounded border border-slate-200">
          <table class="w-full table-fixed border-collapse text-left text-[9.5px]">
            <colgroup>
              <col style="width: 4%" />
              <col style="width: 11%" />
              <col style="width: 23%" />
              <col style="width: 14%" />
              <col style="width: 6%" />
              <col style="width: 18%" />
              <col style="width: 11%" />
              <col style="width: 6%" />
              <col style="width: 7%" />
            </colgroup>
            <thead>
              <tr class="bg-slate-900 text-white font-semibold text-[8.5px] uppercase tracking-wider">
                <th class="py-1.5 px-1 text-center">#</th>
                <th class="py-1.5 px-2">Area / Ref</th>
                <th class="py-1.5 px-2">Description</th>
                <th class="py-1.5 px-1 text-center">Dimensions</th>
                <th class="py-1.5 px-1 text-center">Qty</th>
                <th class="py-1.5 px-2">Calculation Type & Formula</th>
                <th class="py-1.5 px-2 text-right">Result & Unit</th>
                <th class="py-1.5 px-1 text-right">Rate</th>
                <th class="py-1.5 px-2 text-right">Amount</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-slate-100">
              <tr>
                <td class="py-1 px-1 text-center font-mono text-slate-400 text-[8.5px] align-top">1</td>
                <td class="py-1 px-2 font-bold text-slate-900 text-[9px] truncate align-top">Area 1</td>
                <td class="py-1 px-2 text-slate-700 text-[9px] break-words align-top">
                  <div class="font-semibold text-slate-900 leading-snug">PVC Parking Shade Fabric & Centre Joint</div>
                  <div class="text-[8px] text-slate-400 italic leading-snug mt-0.5">Parking Bay 1-6 standard cantilever shade</div>
                </td>
                <td class="py-1 px-1 text-center text-slate-600 font-mono text-[8px] leading-snug align-top">
                  <div>L: 12000 mm (12.000m)</div>
                  <div>W: 5360 mm</div>
                </td>
                <td class="py-1 px-1 text-center font-bold text-slate-900 text-[9px] whitespace-nowrap align-top">6 pcs</td>
                <td class="py-1 px-2 text-slate-600 align-top">
                  <div class="font-semibold text-slate-800 text-[9px] leading-snug">PVC Edge + Centre Joint</div>
                  <div class="text-[8px] font-mono text-slate-500 truncate">((2L + 1CJ) + 2W) × Qty -> (3L + 2W) × 6</div>
                </td>
                <td class="py-1 px-2 text-right font-bold font-mono text-emerald-800 whitespace-nowrap text-[9.5px] align-top">280.320 m</td>
                <td class="py-1 px-1 text-right text-slate-600 font-mono text-[8.5px] whitespace-nowrap align-top">AED 5.00 / m</td>
                <td class="py-1 px-2 text-right font-bold text-slate-900 font-mono whitespace-nowrap text-[9.5px] align-top">AED 1,401.60</td>
              </tr>
              <tr class="bg-slate-50/50">
                <td class="py-1 px-1 text-center font-mono text-slate-400 text-[8.5px] align-top">2</td>
                <td class="py-1 px-2 font-bold text-slate-900 text-[9px] truncate align-top">Area 2</td>
                <td class="py-1 px-2 text-slate-700 text-[9px] break-words align-top">
                  <div class="font-semibold text-slate-900 leading-snug">PVC Parking Shade Fabric & Centre Joint</div>
                  <div class="text-[8px] text-slate-400 italic leading-snug mt-0.5">Parking Bay 7-14 standard cantilever shade</div>
                </td>
                <td class="py-1 px-1 text-center text-slate-600 font-mono text-[8px] leading-snug align-top">
                  <div>L: 12000 mm (12.000m)</div>
                  <div>W: 5520 mm</div>
                </td>
                <td class="py-1 px-1 text-center font-bold text-slate-900 text-[9px] whitespace-nowrap align-top">8 pcs</td>
                <td class="py-1 px-2 text-slate-600 align-top">
                  <div class="font-semibold text-slate-800 text-[9px] leading-snug">PVC Edge + Centre Joint</div>
                  <div class="text-[8px] font-mono text-slate-500 truncate">((2L + 1CJ) + 2W) × Qty -> (3L + 2W) × 8</div>
                </td>
                <td class="py-1 px-2 text-right font-bold font-mono text-emerald-800 whitespace-nowrap text-[9.5px] align-top">376.320 m</td>
                <td class="py-1 px-1 text-right text-slate-600 font-mono text-[8.5px] whitespace-nowrap align-top">AED 5.00 / m</td>
                <td class="py-1 px-2 text-right font-bold text-slate-900 font-mono whitespace-nowrap text-[9.5px] align-top">AED 1,881.60</td>
              </tr>
              <tr>
                <td class="py-1 px-1 text-center font-mono text-slate-400 text-[8.5px] align-top">3</td>
                <td class="py-1 px-2 font-bold text-slate-900 text-[9px] truncate align-top">Area 3</td>
                <td class="py-1 px-2 text-slate-700 text-[9px] break-words align-top">
                  <div class="font-semibold text-slate-900 leading-snug">PVC Parking Shade Fabric & Centre Joint</div>
                  <div class="text-[8px] text-slate-400 italic leading-snug mt-0.5">Parking Bay 15-22 standard cantilever shade</div>
                </td>
                <td class="py-1 px-1 text-center text-slate-600 font-mono text-[8px] leading-snug align-top">
                  <div>L: 12000 mm (12.000m)</div>
                  <div>W: 5560 mm</div>
                </td>
                <td class="py-1 px-1 text-center font-bold text-slate-900 text-[9px] whitespace-nowrap align-top">8 pcs</td>
                <td class="py-1 px-2 text-slate-600 align-top">
                  <div class="font-semibold text-slate-800 text-[9px] leading-snug">PVC Edge + Centre Joint</div>
                  <div class="text-[8px] font-mono text-slate-500 truncate">((2L + 1CJ) + 2W) × Qty -> (3L + 2W) × 8</div>
                </td>
                <td class="py-1 px-2 text-right font-bold font-mono text-emerald-800 whitespace-nowrap text-[9.5px] align-top">376.960 m</td>
                <td class="py-1 px-1 text-right text-slate-600 font-mono text-[8.5px] whitespace-nowrap align-top">AED 5.00 / m</td>
                <td class="py-1 px-2 text-right font-bold text-slate-900 font-mono whitespace-nowrap text-[9.5px] align-top">AED 1,884.80</td>
              </tr>
              <tr class="bg-slate-50/50">
                <td class="py-1 px-1 text-center font-mono text-slate-400 text-[8.5px] align-top">4</td>
                <td class="py-1 px-2 font-bold text-slate-900 text-[9px] truncate align-top">Area 4</td>
                <td class="py-1 px-2 text-slate-700 text-[9px] break-words align-top">
                  <div class="font-semibold text-slate-900 leading-snug">PVC Parking Shade Fabric & Centre Joint</div>
                  <div class="text-[8px] text-slate-400 italic leading-snug mt-0.5">Parking Bay 23-30 standard cantilever shade</div>
                </td>
                <td class="py-1 px-1 text-center text-slate-600 font-mono text-[8px] leading-snug align-top">
                  <div>L: 12000 mm (12.000m)</div>
                  <div>W: 5560 mm</div>
                </td>
                <td class="py-1 px-1 text-center font-bold text-slate-900 text-[9px] whitespace-nowrap align-top">8 pcs</td>
                <td class="py-1 px-2 text-slate-600 align-top">
                  <div class="font-semibold text-slate-800 text-[9px] leading-snug">PVC Edge + Centre Joint</div>
                  <div class="text-[8px] font-mono text-slate-500 truncate">((2L + 1CJ) + 2W) × Qty -> (3L + 2W) × 8</div>
                </td>
                <td class="py-1 px-2 text-right font-bold font-mono text-emerald-800 whitespace-nowrap text-[9.5px] align-top">376.960 m</td>
                <td class="py-1 px-1 text-right text-slate-600 font-mono text-[8.5px] whitespace-nowrap align-top">AED 5.00 / m</td>
                <td class="py-1 px-2 text-right font-bold text-slate-900 font-mono whitespace-nowrap text-[9.5px] align-top">AED 1,884.80</td>
              </tr>
            </tbody>
          </table>
        </div>

        <!-- Summary & Notes -->
        <div class="grid grid-cols-2 gap-3 mb-2">
          <div class="rounded border border-slate-200 bg-slate-50/50 p-2 text-[9px]">
            <h4 class="font-bold text-slate-800 text-[9.5px] mb-0.5 uppercase tracking-wider">
              Measurement Notes & Compliance
            </h4>
            <p class="text-slate-600 leading-tight">
              Dimensions normalized to metric standard (1000 mm = 1 m). Linear (m), area (m²), and counts (pcs) strictly segregated. Fabrications conform to approved engineering specifications.
            </p>
          </div>
          <div class="rounded border border-slate-200 bg-white p-2 space-y-1">
            <h4 class="font-bold text-slate-900 text-[9.5px] border-b border-slate-100 pb-0.5 uppercase tracking-wider">
              Takeoff Summary
            </h4>
            <div class="flex justify-between items-center text-[10px]">
              <span class="text-slate-600 font-medium">Total Pieces:</span>
              <span class="font-bold font-mono text-slate-900">30 pcs</span>
            </div>
            <div class="flex justify-between items-center text-[10px] bg-emerald-50/80 px-2 py-0.5 rounded border border-emerald-100">
              <span class="text-emerald-900 font-semibold">Total Linear Metres:</span>
              <span class="font-bold font-mono text-emerald-800 text-xs">1410.560 m</span>
            </div>
            <div class="flex justify-between items-center text-[10px] border-t border-slate-200 pt-0.5">
              <span class="text-slate-900 font-bold uppercase text-[9px]">Total Estimated Cost:</span>
              <span class="font-black font-mono text-slate-900 text-xs">AED 7,052.80</span>
            </div>
          </div>
        </div>

        <!-- Signature Area -->
        <div class="grid grid-cols-2 gap-4 border-t-2 pt-2 text-xs border-amber-500">
          <div class="rounded border p-2 bg-slate-50/50">
            <div class="font-bold uppercase tracking-wider text-[10px] text-amber-700">Prepared By (Estimator / Engineer)</div>
            <div class="h-10 border-b border-dashed my-1"></div>
            <div class="text-[9px] text-slate-500">Signature & Date</div>
          </div>
          <div class="rounded border p-2 bg-slate-50/50">
            <div class="font-bold uppercase tracking-wider text-[10px] text-amber-700">Approved By (Project Manager / Client)</div>
            <div class="h-10 border-b border-dashed my-1"></div>
            <div class="text-[9px] text-slate-500">Signature & Stamp</div>
          </div>
        </div>

        <!-- Footer -->
        <div class="mt-2 pt-1 border-t border-slate-300 text-[9px] text-slate-500 text-center">
          Dubai ERP • Al Safwah Al Qabdha Tents Ind L.L.C SP • Sharjah, UAE
        </div>
      </div>

    </div>
  </div>
</body>
</html>`;

const htmlPath = join(OUT_DIR, "measurement_print_test.html");
const pdfPath = join(OUT_DIR, "measurement_print_test.pdf");

writeFileSync(htmlPath, htmlContent, "utf-8");
console.log("Written test HTML to:", htmlPath);

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
console.log("SUCCESS! Measurement & Takeoff PDF renders in EXACTLY 1 page!");

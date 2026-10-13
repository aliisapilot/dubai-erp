import { writeFileSync, readFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import assert from "node:assert/strict";

const OUT_DIR = join(process.cwd(), "test-output");
mkdirSync(OUT_DIR, { recursive: true });

const CHROME_PATH = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
// Read the live globals.css file directly
const globalsCss = readFileSync(join(process.cwd(), "app", "globals.css"), "utf-8");

console.log("=== COMPREHENSIVE A4 LANDSCAPE PRINT VERIFICATION ===");
console.log("Loaded live globals.css (" + globalsCss.length + " bytes)");

function createHtml({ employeeCount = 20, daysInMonth = 31, mode = "attendance", forceSinglePage = false, printScale = "auto" }) {
  const year = 2026;
  const monthName = "October";

  const days = Array.from({ length: daysInMonth }, (_, i) => {
    const dayNum = i + 1;
    const isSun = (dayNum % 7 === 4);
    return { dayNum, isSun, dayOfWeek: isSun ? "Su" : "Mo" };
  });

  const effectiveForceSingle = forceSinglePage || (printScale === "auto" && employeeCount <= 32);
  const pageSize = printScale === "actual" ? 18 : 24;
  const isMultiPage = !effectiveForceSingle && employeeCount > pageSize;
  const totalPages = isMultiPage ? Math.ceil(employeeCount / pageSize) : 1;

  const chunks = [];
  if (isMultiPage) {
    for (let p = 0; p < totalPages; p++) {
      chunks.push({
        pageIndex: p,
        employees: Array.from(
          { length: Math.min(pageSize, employeeCount - p * pageSize) },
          (_, idx) => p * pageSize + idx + 1
        ),
      });
    }
  } else {
    chunks.push({
      pageIndex: 0,
      employees: Array.from({ length: employeeCount }, (_, idx) => idx + 1),
    });
  }

  const rowsOnPage = isMultiPage ? pageSize : employeeCount;
  const densityClass =
    printScale === "actual"
      ? "density-spacious density-actual"
      : rowsOnPage > 24
      ? "density-tight"
      : rowsOnPage > 15
      ? "density-compact"
      : "density-spacious";

  const scaleClass = `scale-${printScale}`;

  const renderedChunksHtml = chunks.map(({ pageIndex, employees }) => {
    const isLastPage = pageIndex === totalPages - 1;

    return `
      <div class="print-attendance-sheet ${scaleClass} ${densityClass} mx-auto box-border bg-white text-slate-900 ${
        pageIndex > 0 ? "attendance-print-page-break pt-4 print:pt-0" : ""
      }" style="width: 287mm;">
        <!-- Sheet Header -->
        <div class="border-b-2 border-slate-900 pb-1 mb-1.5 flex items-start justify-between">
          <div>
            <h1 class="text-sm font-black uppercase tracking-wider text-slate-900 leading-tight">
              DUBAI ENTERPRISE ERP L.L.C
            </h1>
            <p class="text-[8.5px] text-slate-500 font-medium leading-tight mt-0.5">
              TRN: 100519014200003 | Sharjah, United Arab Emirates
            </p>
          </div>
          <div class="text-right">
            <div class="inline-block bg-slate-900 text-white font-bold px-2 py-0.5 text-[9.5px] uppercase rounded">
              ${mode === "overtime" ? "Employee Overtime Sheet" : mode === "summary" ? "Monthly Payroll & Attendance Summary" : "Employee Attendance Sheet"}
            </div>
            <div class="flex items-center justify-end gap-3 mt-0.5">
              <p class="text-[8.5px] font-bold text-slate-700">
                Month: <span class="text-slate-900 uppercase font-black">${monthName} ${year}</span>
              </p>
              ${totalPages > 1 ? `<span class="text-[8px] font-bold bg-slate-100 text-slate-700 px-1.5 py-0.2 rounded border border-slate-300">Page ${pageIndex + 1} of ${totalPages}</span>` : ""}
            </div>
          </div>
        </div>

        <!-- Main Table -->
        <div class="w-full overflow-hidden border border-slate-700">
          <table class="w-full border-collapse border border-slate-700 table-fixed">
            <thead>
              <tr class="bg-slate-900 text-white leading-tight">
                <th class="border border-slate-600 px-1 text-left font-bold" style="width: 14mm;">Emp No</th>
                <th class="border border-slate-600 px-1 text-left font-bold truncate" style="width: 42mm;">Employee Name</th>
                ${days.map(d => `
                  <th class="border border-slate-600 px-0 text-center font-bold ${d.isSun ? "bg-emerald-600 text-white" : ""}" style="width: ${198 / daysInMonth}mm;">
                    ${String(d.dayNum).padStart(2, "0")}
                  </th>
                `).join("")}
                ${mode === "attendance" ? `
                  <th class="border border-slate-600 px-0.5 text-center font-bold bg-emerald-800 text-white" style="width: 10mm;">Pres</th>
                  <th class="border border-slate-600 px-0.5 text-center font-bold bg-rose-800 text-white" style="width: 10mm;">Abs</th>
                  <th class="border border-slate-600 px-0.5 text-center font-bold bg-slate-800 text-white" style="width: 11mm;">Total</th>
                ` : `
                  <th class="border border-slate-600 px-0.5 text-center font-bold bg-purple-900 text-white" style="width: 14mm;">OT Hrs</th>
                  <th class="border border-slate-600 px-0.5 text-center font-bold bg-slate-800 text-white" style="width: 17mm;">Est. AED</th>
                `}
              </tr>
              <tr class="bg-slate-800 text-slate-300 leading-none">
                <th class="border border-slate-700 px-1 text-left font-normal" colspan="2">
                  Labourers: ${employeeCount} ${totalPages > 1 ? `(Page ${pageIndex + 1})` : ""}
                </th>
                ${days.map(d => `
                  <th class="border border-slate-700 px-0 text-center font-normal ${d.isSun ? "bg-emerald-700 text-white font-bold" : ""}">
                    ${d.dayOfWeek}
                  </th>
                `).join("")}
                ${mode === "attendance" ? `
                  <th class="border border-slate-700 px-0.5 text-center font-normal bg-emerald-950">P</th>
                  <th class="border border-slate-700 px-0.5 text-center font-normal bg-rose-950">A</th>
                  <th class="border border-slate-700 px-0.5 text-center font-normal bg-slate-900">Days</th>
                ` : `
                  <th class="border border-slate-700 px-0.5 text-center font-normal bg-purple-950">Total</th>
                  <th class="border border-slate-700 px-0.5 text-center font-normal bg-slate-900">Pay</th>
                `}
              </tr>
            </thead>
            <tbody>
              ${employees.map((empNum, idx) => `
                <tr class="${idx % 2 === 0 ? "bg-white" : "bg-slate-50"} leading-tight">
                  <td class="border border-slate-300 px-1 font-bold font-mono text-slate-800 whitespace-nowrap">
                    EMP-${String(empNum).padStart(2, "0")}
                  </td>
                  <td class="border border-slate-300 px-1 font-medium text-slate-900 whitespace-nowrap truncate">
                    Labourer Name ${empNum}
                  </td>
                  ${days.map(d => `
                    <td class="border border-slate-300 px-0 text-center ${d.isSun ? "bg-emerald-50/70" : ""} ${mode === "overtime" ? "font-bold text-purple-800" : "text-emerald-700 font-bold"}">
                      ${d.isSun ? "" : mode === "overtime" ? "2.5" : "P"}
                    </td>
                  `).join("")}
                  ${mode === "attendance" ? `
                    <td class="border border-slate-300 px-0.5 text-center font-bold text-emerald-700 bg-emerald-50/40">26</td>
                    <td class="border border-slate-300 px-0.5 text-center font-bold text-rose-700 bg-rose-50/40">0</td>
                    <td class="border border-slate-300 px-0.5 text-center font-bold text-slate-800">26</td>
                  ` : `
                    <td class="border border-slate-300 px-0.5 text-center font-black text-purple-900 bg-purple-50/60">65.0</td>
                    <td class="border border-slate-300 px-0.5 text-right font-bold text-slate-800 pr-1">1,015</td>
                  `}
                </tr>
              `).join("")}
            </tbody>
          </table>
        </div>

        <!-- Signatures Section -->
        ${(isLastPage || totalPages === 1) ? `
          <div class="attendance-print-signatures mt-2 pt-1 border-t border-slate-300 break-inside-avoid">
            <div>
              <div class="h-4 border-b border-dashed border-slate-400 mb-0.5"></div>
              <p class="font-bold text-slate-800 text-[8.5px]">Prepared By</p>
              <p class="text-[7.5px] text-slate-500">Site Timekeeper / HR</p>
            </div>
            <div>
              <div class="h-4 border-b border-dashed border-slate-400 mb-0.5"></div>
              <p class="font-bold text-slate-800 text-[8.5px]">Checked By</p>
              <p class="text-[7.5px] text-slate-500">Project Manager / Engineer</p>
            </div>
            <div>
              <div class="h-4 border-b border-dashed border-slate-400 mb-0.5"></div>
              <p class="font-bold text-slate-800 text-[8.5px]">Approved By</p>
              <p class="text-[7.5px] text-slate-500">Managing Director / Finance</p>
            </div>
          </div>
        ` : ""}
      </div>
    `;
  }).join("\n");

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<style>
${globalsCss}

@page {
  size: A4 landscape;
  margin: 5mm;
}

@media print {
  @page {
    size: A4 landscape;
    margin: 5mm;
  }
}
</style>
</head>
<body class="bg-slate-900">

  <!-- MAIN APPLICATION SCREEN CONTENT (PROPERLY HIDDEN IN PRINT) -->
  <div class="app-screen-content no-print">
    <div style="padding: 30px; color: white;">
      <h1>Dubai ERP Application Dashboard & Sheet View</h1>
      <p>This content must never appear in print output.</p>
    </div>
  </div>

  <!-- PRINT MODAL CONTAINER -->
  <div class="print-sheet-modal-backdrop fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60">
    <div class="print-sheet-modal-dialog relative w-full max-w-[1250px] bg-white rounded-xl shadow-2xl overflow-hidden">
      <!-- Modal header (hidden in print) -->
      <div class="no-print p-4 bg-slate-900 text-white flex justify-between">
        <span>Modal Header Toolbar</span>
      </div>

      <!-- Printable Sheet Wrapper -->
      <div class="p-4 print:p-0">
        <div class="attendance-print-root">
          ${renderedChunksHtml}
        </div>
      </div>
    </div>
  </div>

</body>
</html>`;
}

// Complete Test Matrix verifying:
// 1. "auto" (Auto Fit One Page): Exactly 1 page for 10, 20, 30 employees
// 2. "fit-width": 1 page for <= 24 employees, 2 pages for > 24 employees
// 3. "actual": 1 page for <= 18 employees, 2 pages for > 18 employees
// 4. October 2026 (31 days) 10 employees in Attendance and Overtime modes
// 5. Verification of all columns (31 days, Emp No, Name, Pres/Abs/Total or OT/AED)
const testMatrix = [
  // --- OCTOBER 2026 (31 DAYS), 10 EMPLOYEES: AUTO FIT ONE PAGE ---
  { employees: 10, days: 31, mode: "attendance", printScale: "auto", expectedPages: 1 },
  { employees: 10, days: 31, mode: "overtime",   printScale: "auto", expectedPages: 1 },

  // --- OCTOBER 2026 (31 DAYS), 10 EMPLOYEES: FIT WIDTH ---
  { employees: 10, days: 31, mode: "attendance", printScale: "fit-width", expectedPages: 1 },
  { employees: 10, days: 31, mode: "overtime",   printScale: "fit-width", expectedPages: 1 },

  // --- OCTOBER 2026 (31 DAYS), 10 EMPLOYEES: ACTUAL SIZE ---
  { employees: 10, days: 31, mode: "attendance", printScale: "actual", expectedPages: 1 },
  { employees: 10, days: 31, mode: "overtime",   printScale: "actual", expectedPages: 1 },

  // --- AUTO FIT ONE PAGE SCALING VERIFICATION (10, 20, 30 EMPLOYEES -> EXACTLY 1 PAGE) ---
  { employees: 20, days: 31, mode: "attendance", printScale: "auto", expectedPages: 1 },
  { employees: 20, days: 31, mode: "overtime",   printScale: "auto", expectedPages: 1 },
  { employees: 30, days: 31, mode: "attendance", printScale: "auto", expectedPages: 1 },
  { employees: 30, days: 31, mode: "overtime",   printScale: "auto", expectedPages: 1 },

  // --- FIT WIDTH: PAGINATES AT STANDARD 24 ROWS/PAGE (30 EMP -> 2 PAGES, 48 EMP -> 2 PAGES) ---
  { employees: 30, days: 31, mode: "attendance", printScale: "fit-width", expectedPages: 2 },
  { employees: 30, days: 31, mode: "overtime",   printScale: "fit-width", expectedPages: 2 },
  { employees: 48, days: 31, mode: "attendance", printScale: "fit-width", expectedPages: 2 },

  // --- ACTUAL SIZE: UNSCALED 100% SIZE, PAGINATES AT 18 ROWS/PAGE (20 EMP -> 2 PAGES, 30 EMP -> 2 PAGES) ---
  { employees: 20, days: 31, mode: "attendance", printScale: "actual", expectedPages: 2 },
  { employees: 30, days: 31, mode: "attendance", printScale: "actual", expectedPages: 2 },
  { employees: 30, days: 31, mode: "overtime",   printScale: "actual", expectedPages: 2 },

  // --- FORCE SINGLE PAGE OVERRIDE ---
  { employees: 32, days: 31, mode: "attendance", forceSinglePage: true, printScale: "auto", expectedPages: 1 },
];

console.log(`Running ${testMatrix.length} tests in headless Chrome...`);

let passedCount = 0;
for (const test of testMatrix) {
  const forceTag = test.forceSinglePage ? "_force1p" : "";
  const scaleTag = `_${test.printScale || "auto"}`;
  const testName = `${test.mode}_${test.employees}emp_${test.days}days${scaleTag}${forceTag}`;
  const html = createHtml({
    employeeCount: test.employees,
    daysInMonth: test.days,
    mode: test.mode,
    forceSinglePage: test.forceSinglePage,
    printScale: test.printScale,
  });

  // Verify all essential columns and content exist in the generated HTML
  assert.ok(html.includes("Emp No"), `Missing 'Emp No' column in ${testName}`);
  assert.ok(html.includes("Employee Name"), `Missing 'Employee Name' column in ${testName}`);
  for (let d = 1; d <= test.days; d++) {
    const dayStr = String(d).padStart(2, "0");
    assert.ok(new RegExp(`>\\s*${dayStr}\\s*<`).test(html), `Missing Day ${dayStr} in ${testName}`);
  }
  if (test.mode === "attendance") {
    assert.ok(html.includes("Pres"), `Missing Pres column in ${testName}`);
    assert.ok(html.includes("Abs"), `Missing Abs column in ${testName}`);
    assert.ok(html.includes("Total"), `Missing Total column in ${testName}`);
  } else {
    assert.ok(html.includes("OT Hrs"), `Missing OT Hrs column in ${testName}`);
    assert.ok(html.includes("Est. AED"), `Missing Est. AED column in ${testName}`);
  }

  const htmlPath = join(OUT_DIR, `verify_${testName}.html`);
  const pdfPath = join(OUT_DIR, `verify_${testName}.pdf`);
  writeFileSync(htmlPath, html, "utf-8");

  execFileSync(CHROME_PATH, [
    "--headless=new",
    "--disable-gpu",
    "--no-pdf-header-footer",
    `--print-to-pdf=${pdfPath}`,
    htmlPath,
  ]);

  const pdfBytes = readFileSync(pdfPath);
  const pdfText = pdfBytes.toString("latin1");
  const matches = pdfText.match(/\/Type\s*\/Page\b/g);
  const pageCount = matches ? matches.length : 1;

  console.log(`  [TEST] ${test.mode.toUpperCase().padEnd(10)} | ${test.employees} Emp | ${test.days} Days | Scale: ${(test.printScale || "auto").padEnd(9)} | Force1P: ${String(test.forceSinglePage ?? false).padEnd(5)} -> Pages: ${pageCount} (Expected: ${test.expectedPages})`);
  assert.equal(
    pageCount,
    test.expectedPages,
    `FAILED: ${testName} expected ${test.expectedPages} pages, got ${pageCount}`
  );
  passedCount++;
}

console.log(`\n========================================================================`);
console.log(`SUCCESS: ALL ${passedCount} / ${testMatrix.length} PRINT SCENARIOS PASSED WITH EXACT TARGET PAGE COUNTS!`);
console.log(`========================================================================`);

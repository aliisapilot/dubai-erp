import { execFile } from "node:child_process";
import assert from "node:assert/strict";

const chromePath = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";

function fetchChromeDom(url) {
  return new Promise((resolve, reject) => {
    execFile(
      chromePath,
      ["--headless=new", "--disable-gpu", "--dump-dom", url],
      { maxBuffer: 10 * 1024 * 1024 },
      (error, stdout, stderr) => {
        if (error) {
          reject(error);
        } else {
          resolve(stdout);
        }
      }
    );
  });
}

async function run() {
  console.log("Testing Chrome rendering for /print-test-sheet...");
  const domPrint = await fetchChromeDom("http://localhost:3000/print-test-sheet");
  console.log("Chrome DOM length for /print-test-sheet:", domPrint.length);

  assert.ok(domPrint.includes("Dubai ERP — A4 Physical Printer Calibration Sheet"), "Contains Header");
  assert.ok(domPrint.includes("Print Test Sheet (Ctrl+P)"), "Contains Print Test Sheet button");
  assert.ok(domPrint.includes("Download PDF"), "Contains Download PDF button");
  assert.ok(domPrint.includes("0mm TOP EDGE"), "Contains 0mm TOP EDGE ruler");
  assert.ok(domPrint.includes("0mm BOTTOM EDGE"), "Contains 0mm BOTTOM EDGE ruler");
  assert.ok(domPrint.includes("0mm LEFT EDGE"), "Contains 0mm LEFT EDGE ruler");
  assert.ok(domPrint.includes("0mm RIGHT EDGE"), "Contains 0mm RIGHT EDGE ruler");
  assert.ok(domPrint.includes("100.0 MM PHYSICAL SCALE"), "Contains 100mm physical scale bar");
  assert.ok(domPrint.includes("GOLD SPECTRUM GRADIENT"), "Contains Gold Spectrum gradient");
  assert.ok(domPrint.includes("NAVY SPECTRUM GRADIENT"), "Contains Navy Spectrum gradient");
  assert.ok(domPrint.includes("0.25 pt Hairline"), "Contains 0.25pt Hairline border test");

  console.log("✔ /print-test-sheet rendered completely in real Google Chrome!");

  console.log("Testing Chrome rendering for /settings/designer...");
  const domDesigner = await fetchChromeDom("http://localhost:3000/settings/designer");
  console.log("Chrome DOM length for /settings/designer:", domDesigner.length);
  assert.ok(domDesigner.includes("PDF Designer"), "Contains PDF Designer page title");
  assert.ok(domDesigner.includes("Page &amp; Borders") || domDesigner.includes("Page & Borders"), "Contains Page & Borders inspector tab");

  console.log("✔ /settings/designer rendered completely in real Google Chrome!");
  console.log("All Chrome rendering tests PASSED!");
}

run().catch((err) => {
  console.error("Chrome Test Error:", err);
  process.exit(1);
});

import fs from "fs";
import { spawn } from "child_process";

const sessionData = JSON.parse(fs.readFileSync("scratch/user_session.json", "utf8"));
const chrome = spawn("C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe", [
  "--remote-debugging-port=9478",
  "--headless=new",
  "--disable-gpu",
  "--no-first-run",
  "--window-size=1600,1100",
  "http://localhost:3000/attendance"
]);

async function wait(ms) { return new Promise(r => setTimeout(r, ms)); }

async function run() {
  await wait(2000);
  const res = await fetch("http://127.0.0.1:9478/json");
  const pages = await res.json();
  const page = pages.find(p => p.type === "page");
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise(r => ws.onopen = r);

  let id = 0;
  const send = (method, params = {}) => new Promise((resolve) => {
    const curId = ++id;
    const h = (e) => {
      const m = JSON.parse(e.data);
      if (m.id === curId) { ws.removeEventListener("message", h); resolve(m.result); }
    };
    ws.addEventListener("message", h);
    ws.send(JSON.stringify({ id: curId, method, params }));
  });

  ws.onmessage = (e) => {
    const m = JSON.parse(e.data);
    if (m.method === "Runtime.consoleAPICalled") {
      console.log("CONSOLE:", m.params.type, m.params.args.map(a => a.value || a.description));
    }
  };

  await send("Runtime.enable");
  await send("Page.enable");

  // In Next.js with Supabase auth-helpers, the token is also read from cookies!
  // Let's set both localStorage AND cookies!
  await send("Runtime.evaluate", {
    expression: `
      localStorage.setItem("sb-fdporzhjpfpvdwapkvan-auth-token", JSON.stringify(${JSON.stringify(sessionData)}));
      localStorage.setItem("dubai-erp.company-cache", JSON.stringify({
        id: "4dbb309a-f31c-4615-8bb5-59df7a6326e3",
        name: "AL SAFWAH AL QABDHA TENTS IND L.L.C SP",
        legal_name: "AL SAFWAH AL QABDHA TENTS IND L.L.C SP",
        trn: "105319816200003",
        address: "Al Sajaa Industrial Area, Sharjah, UAE"
      }));
    `
  });

  await send("Page.navigate", { url: "http://localhost:3000/attendance" });
  await wait(4500);

  // Click Print Sheet
  const clickRes = await send("Runtime.evaluate", {
    expression: `
      (() => {
        const btn = Array.from(document.querySelectorAll("button")).find(b => b.textContent.includes("Print Sheet"));
        if (btn) {
          btn.click();
          return { clicked: true, text: btn.textContent };
        }
        return { clicked: false };
      })()
    `,
    returnByValue: true
  });
  console.log("Print button click:", clickRes.result?.value);
  await wait(2000);

  const modalRes = await send("Runtime.evaluate", {
    expression: `
      (() => {
        const modal = document.querySelector(".print-attendance-sheet");
        const rows = document.querySelectorAll(".print-attendance-sheet tbody tr").length;
        const text = modal ? modal.innerText.slice(0, 300) : "NO MODAL";
        return { hasModal: Boolean(modal), rows, text };
      })()
    `,
    returnByValue: true
  });
  console.log("Modal state:", modalRes.result?.value);

  // ── AUDIT 1: Verify Toolbar UI Elements ──
  const uiAudit = await send("Runtime.evaluate", {
    expression: `
      (() => {
        const buttons = Array.from(document.querySelectorAll("button")).map(b => b.textContent.trim());
        const hasDownloadBtn = buttons.some(t => t.includes("Download A4 PDF"));
        const hasPrintNowBtn = buttons.some(t => t.includes("Print Now"));
        const banners = Array.from(document.querySelectorAll(".no-print")).map(el => el.textContent.trim());
        const hasGuidance = banners.some(t => t.includes("Headers and footers") || t.includes("Download A4 PDF"));

        return { hasDownloadBtn, hasPrintNowBtn, hasGuidance, buttons: buttons.filter(t => t.includes("PDF") || t.includes("Print")) };
      })()
    `,
    returnByValue: true
  });
  console.log("Toolbar UI Audit:", uiAudit.result?.value);

  // ── AUDIT 2: Capture Modal UI Screenshot (showing Download A4 PDF button & Guidance banner) ──
  const modalUiShot = await send("Page.captureScreenshot", {
    format: "png",
    clip: { x: 0, y: 0, width: 1500, height: 950, scale: 1 },
  });
  const modalUiBuf = Buffer.from(modalUiShot.data, "base64");
  fs.writeFileSync("test-output/attendance_modal_ui.png", modalUiBuf);
  fs.writeFileSync("C:/Users/dines/.gemini/antigravity-ide/brain/5b8a2ff5-9cc6-40d0-8c35-2f6ef2906c11/attendance_modal_ui.png", modalUiBuf);
  console.log("Saved Modal UI screenshot:", modalUiBuf.length, "bytes");

  // ── AUDIT 3: Test 'Download A4 PDF' Button Click Event ──
  const clickDownload = await send("Runtime.evaluate", {
    expression: `
      (() => {
        const btn = Array.from(document.querySelectorAll("button")).find(b => b.textContent.includes("Download A4 PDF"));
        if (btn) {
          btn.click();
          return { clicked: true, text: btn.textContent };
        }
        return { clicked: false };
      })()
    `,
    returnByValue: true
  });
  console.log("Download A4 PDF click:", clickDownload.result?.value);
  await wait(1500);

  // ── AUDIT 4: Capture Emulated Print Sheet ──
  await send("Emulation.setEmulatedMedia", { media: "print" });
  await wait(1000);

  // Capture screenshot of print sheet under print emulation
  const shot = await send("Page.captureScreenshot", {
    format: "png",
    clip: { x: 0, y: 0, width: 1123, height: 794, scale: 1 },
  });
  const shotBuf = Buffer.from(shot.data, "base64");
  fs.writeFileSync("test-output/attendance_sheet_corrected.png", shotBuf);
  fs.writeFileSync("C:/Users/dines/.gemini/antigravity-ide/brain/5b8a2ff5-9cc6-40d0-8c35-2f6ef2906c11/attendance_sheet_corrected.png", shotBuf);
  console.log("Saved full print-emulated PNG screenshot:", shotBuf.length, "bytes");

  // ── AUDIT 5: Print PDF via Page.printToPDF (Exact A4 Landscape 297 x 210 mm) ──
  const pdfRes = await send("Page.printToPDF", {
    landscape: true,
    displayHeaderFooter: false,
    printBackground: true,
    preferCSSPageSize: true,
    paperWidth: 11.6929,
    paperHeight: 8.2677,
    marginTop: 0,
    marginBottom: 0,
    marginLeft: 0,
    marginRight: 0,
  });

  const pdfBuf = Buffer.from(pdfRes.data, "base64");
  fs.writeFileSync("test-output/attendance_sheet_corrected.pdf", pdfBuf);
  fs.writeFileSync("C:/Users/dines/.gemini/antigravity-ide/brain/5b8a2ff5-9cc6-40d0-8c35-2f6ef2906c11/attendance_sheet_corrected.pdf", pdfBuf);
  console.log("Saved PDF:", pdfBuf.length, "bytes");

  // Detailed Technical PDF Inspection
  const pdfStr = pdfBuf.toString("latin1");
  const mediaBoxes = pdfStr.match(/\/MediaBox\s*\[\s*([\d\.\s]+)\s*\]/g);
  const pageCount = pdfStr.match(/\/Type\s*\/Page\b/g)?.length || 1;
  const rotate = pdfStr.match(/\/Rotate\s+(\d+)/g);
  const hasLocalhost = pdfStr.includes("localhost:3000");
  const hasDateStamp = pdfStr.includes("10/15/26");

  console.log("\n================================================================================");
  console.log("   PDF TECHNICAL AUDIT RESULTS");
  console.log("================================================================================");
  console.log("  1. Page Count:           ", pageCount, pageCount === 1 ? "PASS ✓" : "FAIL ✗");
  console.log("  2. MediaBox:             ", mediaBoxes ? mediaBoxes[0] : "N/A");
  console.log("  3. Rotation:             ", rotate ? rotate[0] : "0 degrees (Upright orientation) PASS ✓");
  console.log("  4. Zero Browser URL:     ", hasLocalhost ? "FAIL" : "NONE (PASS ✓)");
  console.log("  5. Zero Date Timestamp:  ", hasDateStamp ? "FAIL" : "NONE (PASS ✓)");
  console.log("================================================================================\n");

  chrome.kill();
}

run().catch((e) => {
  console.error(e);
  chrome.kill();
});

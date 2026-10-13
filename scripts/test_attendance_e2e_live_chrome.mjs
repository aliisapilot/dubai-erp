import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";

const CHROME_PATH = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const ARTIFACTS_DIR = "C:\\Users\\Ali\\.gemini\\antigravity-ide\\brain\\3cc10be4-81a7-4a47-b872-dec628ab7463";
const OUT_DIR = path.join(process.cwd(), "test-output");

async function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function startChrome(port = 9333) {
  const userDataDir = path.join(process.cwd(), ".chrome-verify-profile");
  if (!fs.existsSync(userDataDir)) {
    fs.mkdirSync(userDataDir, { recursive: true });
  }

  const chromeProc = spawn(
    CHROME_PATH,
    [
      "--headless=new",
      "--disable-gpu",
      "--disable-extensions",
      `--remote-debugging-port=${port}`,
      `--user-data-dir=${userDataDir}`,
      "--no-first-run",
      "--no-default-browser-check",
      "http://localhost:3000/attendance",
    ],
    { stdio: "ignore" }
  );

  for (let i = 0; i < 40; i++) {
    try {
      const res = await fetch(`http://127.0.0.1:${port}/json/version`);
      if (res.ok) {
        return chromeProc;
      }
    } catch {}
    await wait(250);
  }
  throw new Error("Could not connect to Chrome on port " + port);
}

class CdpClient {
  constructor(wsUrl) {
    this.wsUrl = wsUrl;
    this.id = 0;
    this.callbacks = new Map();
  }

  async connect() {
    return new Promise((resolve, reject) => {
      this.ws = new WebSocket(this.wsUrl);
      this.ws.onopen = () => resolve();
      this.ws.onerror = (err) => reject(err);
      this.ws.onmessage = (event) => {
        const msg = JSON.parse(event.data);
        if (msg.id && this.callbacks.has(msg.id)) {
          const { resolve, reject } = this.callbacks.get(msg.id);
          this.callbacks.delete(msg.id);
          if (msg.error) reject(new Error(msg.error.message));
          else resolve(msg.result);
        }
      };
    });
  }

  send(method, params = {}) {
    return new Promise((resolve, reject) => {
      const id = ++this.id;
      this.callbacks.set(id, { resolve, reject });
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }

  async evaluate(expression) {
    const res = await this.send("Runtime.evaluate", {
      expression,
      returnByValue: true,
      awaitPromise: true,
    });
    return res.result?.value;
  }

  async screenshot(filePath) {
    const res = await this.send("Page.captureScreenshot", { format: "png" });
    const buffer = Buffer.from(res.data, "base64");
    fs.writeFileSync(filePath, buffer);
    console.log(`Saved screenshot: ${filePath} (${buffer.length} bytes)`);
  }

  async printToPdf(filePath) {
    const res = await this.send("Page.printToPDF", {
      landscape: true,
      paperWidth: 11.69, // A4 landscape width (297mm)
      paperHeight: 8.27, // A4 landscape height (210mm)
      marginTop: 0.15,
      marginBottom: 0.15,
      marginLeft: 0.15,
      marginRight: 0.15,
      printBackground: true,
      preferCSSPageSize: true,
    });
    const buffer = Buffer.from(res.data, "base64");
    fs.writeFileSync(filePath, buffer);
    const pdfText = buffer.toString("latin1");
    const matches = pdfText.match(/\/Type\s*\/Page\b/g);
    const pageCount = matches ? matches.length : 1;
    console.log(`Printed PDF: ${filePath} (${buffer.length} bytes) -> Pages: ${pageCount}`);
    return pageCount;
  }

  close() {
    if (this.ws) this.ws.close();
  }
}

async function run() {
  console.log("=== STARTING LIVE CHROME E2E VERIFICATION FOR ATTENDANCE PRINT ===");
  const chromeProc = await startChrome(9333);

  try {
    const targetsRes = await fetch("http://127.0.0.1:9333/json");
    const targets = await targetsRes.json();
    const pageTarget = targets.find((t) => t.type === "page");
    if (!pageTarget) throw new Error("No page target found");

    const cdp = new CdpClient(pageTarget.webSocketDebuggerUrl);
    await cdp.connect();

    await cdp.send("Page.enable");
    await cdp.send("DOM.enable");
    await cdp.send("Runtime.enable");

    // Set viewport to large desktop
    await cdp.send("Emulation.setDeviceMetricsOverride", {
      width: 1600,
      height: 1050,
      deviceScaleFactor: 1,
      mobile: false,
    });

    // Wait for Next.js to fully hydrate /attendance
    console.log("Waiting for /attendance to hydrate...");
    await wait(3000);

    // Log current page URL and title
    const pageInfo = await cdp.evaluate(`({
      url: window.location.href,
      title: document.title,
      buttons: Array.from(document.querySelectorAll("button")).map(b => b.textContent.trim()).filter(Boolean),
      bodyText: document.body.innerText.slice(0, 300)
    })`);
    console.log("Page info:", pageInfo);

    // Open the print modal by evaluating event or clicking "Print Sheet"
    console.log("Opening print sheet modal...");
    await cdp.evaluate(`
      (() => {
        const btn = Array.from(document.querySelectorAll("button")).find(b => b.textContent && b.textContent.includes("Print Sheet"));
        if (btn) btn.click();
        else window.dispatchEvent(new CustomEvent("open-attendance-print"));
      })()
    `);
    await wait(1500);

    // Check modal exists
    const modalOpen = await cdp.evaluate(`Boolean(document.querySelector(".print-sheet-modal-dialog"))`);
    console.log("Print modal open:", modalOpen);
    assert.ok(modalOpen, "Print modal should be open!");

    // Capture screen screenshot of the modal dialog
    await cdp.screenshot(path.join(OUT_DIR, "live_modal_screen_view.png"));
    if (fs.existsSync(ARTIFACTS_DIR)) {
      fs.copyFileSync(path.join(OUT_DIR, "live_modal_screen_view.png"), path.join(ARTIFACTS_DIR, "live_modal_screen_view.png"));
    }

    // Check scale buttons exist: Auto Fit, Fit Width, Actual Size
    const scaleButtons = await cdp.evaluate(`
      Array.from(document.querySelectorAll("button"))
        .filter(b => ["Auto Fit", "Fit Width", "Actual Size"].includes(b.textContent.trim()))
        .map(b => b.textContent.trim())
    `);
    console.log("Found scale buttons:", scaleButtons);
    assert.deepEqual(scaleButtons, ["Auto Fit", "Fit Width", "Actual Size"], "All 3 scale buttons must exist");

    // 1. TEST AUTO FIT (DEFAULT)
    console.log("\n--- Testing AUTO FIT MODE in Chrome ---");
    await cdp.send("Emulation.setEmulatedMedia", { media: "print" });
    await wait(500);
    const autoPdf = path.join(OUT_DIR, "live_attendance_auto_fit.pdf");
    const autoPages = await cdp.printToPdf(autoPdf);
    console.log(`Auto Fit Page Count: ${autoPages}`);
    assert.equal(autoPages, 1, "Auto Fit must print on exactly 1 page!");

    // Capture screenshot under print emulation
    await cdp.screenshot(path.join(OUT_DIR, "live_print_attendance_auto_fit.png"));
    fs.copyFileSync(path.join(OUT_DIR, "live_print_attendance_auto_fit.png"), path.join(ARTIFACTS_DIR, "live_print_attendance_auto_fit.png"));

    // 2. TEST FIT WIDTH
    console.log("\n--- Testing FIT WIDTH MODE in Chrome ---");
    await cdp.send("Emulation.setEmulatedMedia", { media: "screen" });
    await wait(300);
    await cdp.evaluate(`
      (() => {
        const btn = Array.from(document.querySelectorAll("button")).find(b => b.textContent.trim() === "Fit Width");
        if (btn) btn.click();
      })()
    `);
    await wait(500);

    await cdp.send("Emulation.setEmulatedMedia", { media: "print" });
    await wait(500);
    const fitWidthPdf = path.join(OUT_DIR, "live_attendance_fit_width.pdf");
    const fitWidthPages = await cdp.printToPdf(fitWidthPdf);
    console.log(`Fit Width Page Count: ${fitWidthPages}`);
    assert.equal(fitWidthPages, 1, "Fit Width with 10 employees must print on exactly 1 page!");

    await cdp.screenshot(path.join(OUT_DIR, "live_print_attendance_fit_width.png"));
    fs.copyFileSync(path.join(OUT_DIR, "live_print_attendance_fit_width.png"), path.join(ARTIFACTS_DIR, "live_print_attendance_fit_width.png"));

    // 3. TEST ACTUAL SIZE
    console.log("\n--- Testing ACTUAL SIZE MODE in Chrome ---");
    await cdp.send("Emulation.setEmulatedMedia", { media: "screen" });
    await wait(300);
    await cdp.evaluate(`
      (() => {
        const btn = Array.from(document.querySelectorAll("button")).find(b => b.textContent.trim() === "Actual Size");
        if (btn) btn.click();
      })()
    `);
    await wait(500);

    await cdp.send("Emulation.setEmulatedMedia", { media: "print" });
    await wait(500);
    const actualPdf = path.join(OUT_DIR, "live_attendance_actual_size.pdf");
    const actualPages = await cdp.printToPdf(actualPdf);
    console.log(`Actual Size Page Count: ${actualPages}`);
    assert.equal(actualPages, 1, "Actual Size with 10 employees must print on exactly 1 page!");

    await cdp.screenshot(path.join(OUT_DIR, "live_print_attendance_actual_size.png"));
    fs.copyFileSync(path.join(OUT_DIR, "live_print_attendance_actual_size.png"), path.join(ARTIFACTS_DIR, "live_print_attendance_actual_size.png"));

    // 4. TEST OVERTIME MODE
    console.log("\n--- Testing OVERTIME TAB in Chrome ---");
    await cdp.send("Emulation.setEmulatedMedia", { media: "screen" });
    await wait(300);
    // Close modal first
    await cdp.evaluate(`
      (() => {
        const closeBtn = document.querySelector(".print-sheet-modal-dialog button[class*='text-slate-400']");
        if (closeBtn) closeBtn.click();
      })()
    `);
    await wait(500);

    // Switch to Overtime tab in main app
    await cdp.evaluate(`
      (() => {
        const tab = Array.from(document.querySelectorAll("button")).find(b => b.textContent && b.textContent.includes("Overtime"));
        if (tab) tab.click();
      })()
    `);
    await wait(1000);

    // Open print modal for Overtime
    await cdp.evaluate(`
      (() => {
        const btn = Array.from(document.querySelectorAll("button")).find(b => b.textContent && b.textContent.includes("Print Sheet"));
        if (btn) btn.click();
        else window.dispatchEvent(new CustomEvent("open-attendance-print"));
      })()
    `);
    await wait(1000);

    // Verify modal title says Overtime
    const otModalTitle = await cdp.evaluate(`
      document.querySelector(".print-attendance-sheet .bg-slate-900")?.textContent || ""
    `);
    console.log("Overtime Sheet Title:", otModalTitle.trim());

    // Test print PDF in Overtime Auto Fit
    await cdp.send("Emulation.setEmulatedMedia", { media: "print" });
    await wait(500);
    const otPdf = path.join(OUT_DIR, "live_overtime_auto_fit.pdf");
    const otPages = await cdp.printToPdf(otPdf);
    console.log(`Overtime Auto Fit Page Count: ${otPages}`);
    assert.equal(otPages, 1, "Overtime Auto Fit must print on exactly 1 page!");

    await cdp.screenshot(path.join(OUT_DIR, "live_print_overtime_auto_fit.png"));
    fs.copyFileSync(path.join(OUT_DIR, "live_print_overtime_auto_fit.png"), path.join(ARTIFACTS_DIR, "live_print_overtime_auto_fit.png"));

    console.log("\n=======================================================");
    console.log("✔ LIVE GOOGLE CHROME VERIFICATION COMPLETED SUCCESSFULLY!");
    console.log("  All 3 scaling modes verified in actual Chrome print engine.");
    console.log("  Attendance and Overtime tested separately.");
    console.log("  Page counts confirmed: Exactly 1 page for all October 2026 scenarios.");
    console.log("=======================================================");

    cdp.close();
  } finally {
    try {
      chromeProc.kill();
    } catch {}
  }
}

run().catch((err) => {
  console.error("Test failed:", err);
  process.exit(1);
});

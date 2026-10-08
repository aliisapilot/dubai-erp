import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";

const CHROME_PATH = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const ARTIFACTS_DIR = "C:\\Users\\Ali\\.gemini\\antigravity-ide\\brain\\f491699e-bf47-4dcd-8e78-667e907e7d64";

async function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function startChrome(port = 9222) {
  const userDataDir = path.join(process.cwd(), ".chrome-test-profile");
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
      "http://localhost:3000/measurements",
    ],
    { stdio: "ignore" }
  );

  for (let i = 0; i < 30; i++) {
    try {
      const res = await fetch(`http://127.0.0.1:${port}/json/version`);
      if (res.ok) {
        return chromeProc;
      }
    } catch {}
    await wait(200);
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

  close() {
    if (this.ws) this.ws.close();
  }
}

async function runBrowserTests() {
  console.log("=== Launching Google Chrome for E2E Browser Verification ===");
  const chromeProc = await startChrome(9222);

  try {
    const targetsRes = await fetch("http://127.0.0.1:9222/json");
    const targets = await targetsRes.json();
    console.log("Found targets:", targets.map(t => ({ type: t.type, title: t.title, url: t.url })));
    const pageTarget = targets.find((t) => t.type === "page" && (t.url.includes("3000") || t.title.includes("measurements") || t.url.includes("localhost"))) || targets.find((t) => t.type === "page");
    if (!pageTarget) throw new Error("No page target found!");
    const cdp = new CdpClient(pageTarget.webSocketDebuggerUrl);
    await cdp.connect();
    console.log("Connected to Chrome via CDP WebSocket:", pageTarget.url);

    await cdp.send("Page.enable");
    await cdp.send("Runtime.enable");

    // =========================================================================
    // 1. DESKTOP VIEWPORT TEST (1280 x 800)
    // =========================================================================
    console.log("\n--- 1. Testing Desktop Viewport (1280x800) ---");
    await cdp.send("Emulation.setDeviceMetricsOverride", {
      width: 1280,
      height: 800,
      deviceScaleFactor: 1,
      mobile: false,
    });

    // Wait for page load and hydration
    for (let i = 0; i < 40; i++) {
      const currentUrl = await cdp.evaluate("location.href");
      const buttonCount = await cdp.evaluate("document.querySelectorAll('button').length");
      const hasSpinner = await cdp.evaluate("!!document.querySelector('.animate-spin')");
      if (currentUrl?.includes("measurements") && buttonCount > 0 && !hasSpinner) {
        break;
      }
      await wait(500);
    }

    const currentUrl = await cdp.evaluate("location.href");
    console.log("Current URL:", currentUrl);
    const desktopPageTitle = await cdp.evaluate("document.title");
    console.log("Desktop Page Title:", desktopPageTitle);
    const bodyHtml = await cdp.evaluate("document.body?.innerHTML || ''");
    console.log("Body HTML len:", bodyHtml.length, "Body HTML:", bodyHtml);

    // Verify "PVC Tank Liner" button is present on the page
    const pvcButtonCount = await cdp.evaluate(`
      Array.from(document.querySelectorAll('button')).filter(b => b.textContent.includes('PVC Tank Liner')).length
    `);
    console.log("Found 'PVC Tank Liner' buttons on main page:", pvcButtonCount);
    assert.ok(pvcButtonCount >= 1, "At least one 'PVC Tank Liner' button is visible on the main page");

    // Screenshot of main measurements page
    await cdp.screenshot(path.join(ARTIFACTS_DIR, "measurements_page_desktop.png"));

    // Click the PVC Tank Liner button to open calculator
    console.log("Clicking 'PVC Tank Liner' button to open calculator...");
    const clickResult = await cdp.evaluate(`
      (() => {
        try {
          const btn = Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes('PVC Tank Liner'));
          if (!btn) return 'BUTTON_NOT_FOUND';
          btn.click();
          return 'CLICKED: ' + btn.innerText;
        } catch (e) {
          return 'ERROR: ' + e.message;
        }
      })()
    `);
    console.log("Click result:", clickResult);
    await wait(1200);

    // Verify modal is open and shows PVC Tank Liner Calculator
    const modalContainer = await cdp.evaluate(`!!document.querySelector('.fixed.inset-0')`);
    assert.ok(modalContainer, "Modal container (.fixed.inset-0) opened successfully");

    const modalHtml = await cdp.evaluate(`document.querySelector('.fixed.inset-0')?.innerHTML || ''`);
    const modalText = await cdp.evaluate(`document.querySelector('.fixed.inset-0')?.innerText || ''`);
    console.log("Modal innerText preview:", modalText.slice(0, 300));
    assert.ok(modalHtml.includes("Tank Details") || modalText.toUpperCase().includes("TANK DETAILS"), "Contains 'Tank Details' section");
    assert.ok(modalHtml.includes("Tank Diameter") || modalText.includes("Tank Diameter"), "Contains 'Tank Diameter' input");
    assert.ok(modalHtml.includes("Tank Height") || modalText.includes("Tank Height"), "Contains 'Tank Height' input");
    assert.ok(modalHtml.includes("Fabric Width") || modalText.includes("Fabric Width"), "Contains 'Fabric Width' input");
    assert.ok(modalHtml.includes("Welding Size on Seam") || modalText.includes("Welding Size on Seam"), "Contains 'Welding Size on Seam'");
    assert.ok(modalHtml.includes("40 MM") || modalText.includes("40 MM"), "Contains 40 MM welding seam result");
    assert.ok(modalHtml.includes("69.65") || modalText.includes("69.65"), "Displays 69.65 RM");
    assert.ok(modalHtml.includes("208.95") || modalText.includes("208.95"), "Displays 208.95 M²");
    assert.ok(modalHtml.includes("Add to Sheet") || modalText.includes("Add to Sheet"), "Displays 'Add to Sheet' button");

    console.log("✔ Desktop modal opened with full PVC Tank Liner calculator (69.65 RM, 208.95 M², 40 MM welding seam)");
    await cdp.screenshot(path.join(ARTIFACTS_DIR, "pvc_calculator_modal_desktop.png"));

    // Click "Add to Sheet"
    console.log("Clicking 'Add to Sheet' button...");
    await cdp.evaluate(`
      const addBtn = Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes('Add to Sheet'));
      if (addBtn) addBtn.click();
    `);
    await wait(1500);

    // Verify row was added to sheet table
    const tableText = await cdp.evaluate(`document.body.innerText`);
    assert.ok(tableText.includes("PVC TANK LINER"), "Table contains 'PVC TANK LINER'");
    assert.ok(tableText.includes("69.65 RM"), "Table displays '69.65 RM'");
    assert.ok(tableText.includes("208.95 M²"), "Table displays '208.95 M²'");
    console.log("✔ PVC Tank Liner row added to sheet table successfully!");

    await cdp.screenshot(path.join(ARTIFACTS_DIR, "sheet_with_pvc_row_desktop.png"));

    // Click "Edit" on the newly added row
    console.log("Testing Reopen/Edit: Clicking 'Edit' on PVC Tank Liner row...");
    await cdp.evaluate(`
      const editBtn = document.querySelector('button[title*=\"Edit\"]') || Array.from(document.querySelectorAll('button')).find(b => b.querySelector('svg') && b.title === 'Edit row' || b.textContent.includes('Edit'));
      if (editBtn) editBtn.click();
    `);
    await wait(800);

    const editModalText = await cdp.evaluate(`document.body.innerText`);
    assert.ok(editModalText.includes("Update Measurement") || editModalText.includes("Save Calculation"), "Edit modal opened with update action");
    assert.ok(editModalText.includes("69.65"), "Reopened calculator preserved 69.65 RM");
    console.log("✔ Reopened existing PVC Tank Liner row cleanly for editing!");

    // Close modal
    await cdp.evaluate(`
      const cancelBtn = Array.from(document.querySelectorAll('button')).find(b => b.textContent.trim() === 'Cancel');
      if (cancelBtn) cancelBtn.click();
    `);
    await wait(500);

    // Now test clicking "Add Measurement Row" and selecting "PVC Tank Liner" from the option pills
    console.log("Testing Add Measurement Row workflow with type pills...");
    await cdp.evaluate(`
      const addRowBtn = Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes('Add Measurement Row'));
      if (addRowBtn) addRowBtn.click();
    `);
    await wait(800);

    // Click the "PVC Tank Liner" pill
    console.log("Clicking 'PVC Tank Liner' pill in Calculation Type selector...");
    await cdp.evaluate(`
      const pills = Array.from(document.querySelectorAll('button[role=\"tab\"]'));
      const linerPill = pills.find(p => p.textContent.includes('PVC Tank Liner'));
      if (linerPill) linerPill.click();
    `);
    await wait(1000);

    const switchedModalHtml = await cdp.evaluate(`document.querySelector('.fixed.inset-0')?.innerHTML || ''`);
    const switchedModalText = await cdp.evaluate(`document.querySelector('.fixed.inset-0')?.innerText || ''`);
    assert.ok(switchedModalHtml.includes("Tank Details") || switchedModalText.toUpperCase().includes("TANK DETAILS"), "Switched to PVC Tank Liner calculator via pill!");
    assert.ok(switchedModalHtml.includes("69.65") || switchedModalText.includes("69.65"), "Pill switch computed 69.65 RM");
    console.log("✔ Calculation Type pill 'PVC Tank Liner' switched to complete calculator!");

    // Close modal
    await cdp.evaluate(`
      const cancelBtn = Array.from(document.querySelectorAll('button')).find(b => b.textContent.trim() === 'Cancel');
      if (cancelBtn) cancelBtn.click();
    `);
    await wait(600);

    // =========================================================================
    // 2. MOBILE VIEWPORT TEST (375 x 667, iPhone SE / standard mobile)
    // =========================================================================
    console.log("\n--- 2. Testing Mobile Viewport (375x667) ---");
    await cdp.send("Emulation.setDeviceMetricsOverride", {
      width: 375,
      height: 667,
      deviceScaleFactor: 2,
      mobile: true,
    });
    await wait(600);

    await cdp.screenshot(path.join(ARTIFACTS_DIR, "measurements_page_mobile.png"));

    // Click PVC Tank Liner button on mobile
    console.log("Opening PVC Tank Liner on mobile...");
    await cdp.evaluate(`
      const btn = Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes('PVC Tank Liner'));
      if (btn) btn.click();
    `);
    await wait(1200);

    const mobileModalHtml = await cdp.evaluate(`document.querySelector('.fixed.inset-0')?.innerHTML || ''`);
    const mobileModalText = await cdp.evaluate(`document.querySelector('.fixed.inset-0')?.innerText || ''`);
    assert.ok(mobileModalHtml.includes("Tank Details") || mobileModalText.toUpperCase().includes("TANK DETAILS"), "Mobile shows Tank Details");
    assert.ok(mobileModalHtml.includes("Running Meter") || mobileModalText.toUpperCase().includes("RUNNING METER"), "Mobile shows Running Meter");
    assert.ok(mobileModalHtml.includes("69.65") || mobileModalText.includes("69.65"), "Mobile shows 69.65 RM");

    await cdp.screenshot(path.join(ARTIFACTS_DIR, "pvc_calculator_modal_mobile.png"));
    console.log("✔ Mobile viewport verified: complete calculator rendered and responsive!");

    cddpClose: {
      cdp.close();
    }

    console.log("\n=======================================================");
    console.log("✔ ALL E2E BROWSER VERIFICATIONS PASSED IN REAL CHROME!");
    console.log("=======================================================");
  } finally {
    try {
      chromeProc.kill("SIGKILL");
    } catch {}
  }
}

runBrowserTests().catch((err) => {
  console.error("Browser Test Error:", err);
  process.exit(1);
});

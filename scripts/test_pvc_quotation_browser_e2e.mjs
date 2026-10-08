import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";

const CHROME_PATH = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const ARTIFACTS_DIR = "C:\\Users\\Ali\\.gemini\\antigravity-ide\\brain\\f491699e-bf47-4dcd-8e78-667e907e7d64";

async function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function startChrome(port = 9224) {
  const userDataDir = path.join(process.cwd(), ".chrome-test-profile-ref");
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

  async send(method, params = {}) {
    const id = ++this.id;
    return new Promise((resolve, reject) => {
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
    if (res.exceptionDetails) {
      throw new Error("Eval error: " + JSON.stringify(res.exceptionDetails));
    }
    return res.result?.value;
  }

  async captureScreenshot(filepath) {
    const res = await this.send("Page.captureScreenshot", { format: "png" });
    const buffer = Buffer.from(res.data, "base64");
    fs.writeFileSync(filepath, buffer);
  }

  close() {
    if (this.ws) this.ws.close();
  }
}

async function runTest() {
  console.log("Starting Chrome on port 9224...");
  const chromeProc = await startChrome(9224);

  try {
    const targetsRes = await fetch("http://127.0.0.1:9224/json");
    const targets = await targetsRes.json();
    const pageTarget = targets.find((t) => t.type === "page");
    if (!pageTarget) throw new Error("No page target found");

    const client = new CdpClient(pageTarget.webSocketDebuggerUrl);
    await client.connect();

    await client.send("Page.enable");
    await client.send("DOM.enable");
    await client.send("Runtime.enable");

    // 1. Desktop Test
    console.log("Setting desktop viewport (1440x900)...");
    await client.send("Emulation.setDeviceMetricsOverride", {
      width: 1440,
      height: 900,
      deviceScaleFactor: 1,
      mobile: false,
    });

    console.log("Navigating to http://localhost:3000/measurements ...");
    await client.send("Page.navigate", { url: "http://localhost:3000/measurements" });
    await wait(2500);

    // Click "PVC Tank Liner" button on top action bar
    console.log("Clicking 'PVC Tank Liner' action button...");
    const clickedPvcButton = await client.evaluate(`
      (() => {
        const btns = Array.from(document.querySelectorAll("button"));
        const btn = btns.find(b => b.innerText.includes("PVC Tank Liner"));
        if (btn) { btn.click(); return true; }
        return false;
      })()
    `);
    assert.ok(clickedPvcButton, "Should find and click PVC Tank Liner button");
    await wait(1000);

    // Verify calculator modal opened and "Create Quotation" button is visible
    console.log("Verifying 'Create Quotation' button is present...");
    const hasCreateQuoteBtn = await client.evaluate(`
      (() => {
        const btns = Array.from(document.querySelectorAll("button"));
        const btn = btns.find(b => b.innerText.includes("Create Quotation"));
        return !!btn;
      })()
    `);
    assert.ok(hasCreateQuoteBtn, "Calculator must have 'Create Quotation' button");

    // Click "Create Quotation" button
    console.log("Clicking 'Create Quotation' button...");
    await client.evaluate(`
      (() => {
        const btns = Array.from(document.querySelectorAll("button"));
        const btn = btns.find(b => b.innerText.includes("Create Quotation"));
        if (btn) btn.click();
      })()
    `);
    await wait(1200);

    // Verify Quotation modal opened
    const modalTitle = await client.evaluate(`
      (() => {
        const headings = Array.from(document.querySelectorAll("h3"));
        const match = headings.find(h => h.innerText.includes("PVC Tank Liner Takeoff & Quotation"));
        return match ? match.innerText : headings.map(h => h.innerText).join(" | ");
      })()
    `);
    console.log("Modal title found:", modalTitle);
    assert.match(modalTitle, /PVC Tank Liner Takeoff & Quotation/, "Quotation modal should be open");

    // Click "Load Reference QTN145/26 (3 Tanks • AED 22,281.52)"
    console.log("Loading Reference QTN145/26 Test Case...");
    const clickedPreset = await client.evaluate(`
      (() => {
        const btns = Array.from(document.querySelectorAll("button"));
        const btn = btns.find(b => b.innerText.includes("Load Reference QTN145/26"));
        if (btn) { btn.click(); return true; }
        return false;
      })()
    `);
    assert.ok(clickedPreset, "Should click Load Reference QTN145/26 button");
    await wait(800);

    // Check Section A Customer Quotation figures in UI
    const quotationReport = await client.evaluate(`
      (() => {
        const inputVals = Array.from(document.querySelectorAll("input, textarea")).map(i => i.value).join(" ");
        const bodyText = document.body.innerText + " " + inputVals;
        return {
          hasAlKarwan: bodyText.includes("Al Karwan Solution FZC"),
          hasNet: bodyText.includes("21,220.50"),
          hasVatRef: bodyText.includes("1,061.02"), // Reference QTN145/26 VAT
          hasGrandTotalRef: bodyText.includes("22,281.52"), // Reference QTN145/26 Total
          hasItem1: bodyText.includes("PVC Fabric Korean 900 GSM"),
          hasItem2: bodyText.includes("PVC Fabrication / Welding"),
          hasItem3: bodyText.includes("SS Eyelet 14mm"),
        };
      })()
    `);
    console.log("Customer Quotation Section A results:", quotationReport);
    assert.ok(quotationReport.hasAlKarwan, "Customer Al Karwan Solution FZC should be populated");
    assert.ok(quotationReport.hasNet, "Net amount must show AED 21,220.50");
    assert.ok(quotationReport.hasVatRef, "Reference VAT amount must show AED 1,061.02");
    assert.ok(quotationReport.hasGrandTotalRef, "Reference Grand Total must show AED 22,281.52");
    assert.ok(quotationReport.hasItem1, "Should list PVC Fabric Korean 900 GSM");
    assert.ok(quotationReport.hasItem2, "Should list PVC Fabrication / Welding");
    assert.ok(quotationReport.hasItem3, "Should list SS Eyelet 14mm");

    // Capture desktop Section A screenshot
    const desktopSectionAPath = path.join(ARTIFACTS_DIR, "pvc_quotation_modal_desktop.png");
    await client.captureScreenshot(desktopSectionAPath);
    console.log("Section A screenshot saved to:", desktopSectionAPath);

    // 2. Test Section B: Switch to Internal Costing (Private)
    console.log("Switching to Section B: Internal Costing — Private...");
    const clickedCostingTab = await client.evaluate(`
      (() => {
        const btns = Array.from(document.querySelectorAll("button"));
        const btn = btns.find(b => b.innerText.includes("Internal Costing"));
        if (btn) { btn.click(); return true; }
        return false;
      })()
    `);
    assert.ok(clickedCostingTab, "Should click Internal Costing tab");
    await wait(800);

    // Verify Section B Internal Costing rendered
    const costingReport = await client.evaluate(`
      (() => {
        const bodyText = document.body.innerText.toLowerCase();
        return {
          hasConfidential: bodyText.includes("confidential"),
          hasFabricInput: bodyText.includes("pvc fabric purchase rate"),
          hasWeldingInput: bodyText.includes("welding / fabrication cost"),
          hasEyeletInput: bodyText.includes("ss eyelet purchase cost"),
          hasProfitAnalysis: bodyText.includes("profitability") && bodyText.includes("margin"),
        };
      })()
    `);
    console.log("Internal Costing Section B results:", costingReport);
    assert.ok(costingReport.hasConfidential, "Must show Confidential Internal Costing banner");
    assert.ok(costingReport.hasFabricInput, "Must have PVC Fabric purchase rate input");
    assert.ok(costingReport.hasWeldingInput, "Must have Welding/Fabrication cost input");
    assert.ok(costingReport.hasEyeletInput, "Must have Eyelet purchase cost input");
    assert.ok(costingReport.hasProfitAnalysis, "Must have Profitability & Margin Analysis");

    // Capture desktop Section B Internal Costing screenshot
    const desktopCostingPath = path.join(ARTIFACTS_DIR, "pvc_internal_costing_desktop.png");
    await client.captureScreenshot(desktopCostingPath);
    console.log("Section B Internal Costing screenshot saved to:", desktopCostingPath);

    // 3. Mobile Viewport Test (390x844 iPhone 12/13/14)
    console.log("Setting mobile viewport (390x844)...");
    await client.send("Emulation.setDeviceMetricsOverride", {
      width: 390,
      height: 844,
      deviceScaleFactor: 2,
      mobile: true,
    });
    await wait(600);

    const mobilePath = path.join(ARTIFACTS_DIR, "pvc_quotation_modal_mobile.png");
    await client.captureScreenshot(mobilePath);
    console.log("Mobile screenshot saved to:", mobilePath);

    client.close();
    console.log("\nALL PVC QUOTATION & INTERNAL COSTING E2E BROWSER TESTS PASSED 100%!");
  } finally {
    try {
      chromeProc.kill();
    } catch {}
    // Clean up temporary test profile
    try {
      fs.rmSync(path.join(process.cwd(), ".chrome-test-profile-ref"), { recursive: true, force: true });
    } catch {}
  }
}

runTest().catch((err) => {
  console.error("Test failed:", err);
  process.exit(1);
});

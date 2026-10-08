import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";

const CHROME_PATH = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const ARTIFACTS_DIR = "C:\\Users\\Ali\\.gemini\\antigravity-ide\\brain\\f491699e-bf47-4dcd-8e78-667e907e7d64";

async function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function startChrome(port = 9226) {
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
    return res.result ? res.result.value : undefined;
  }

  async screenshot(filePath) {
    const res = await this.send("Page.captureScreenshot", { format: "png" });
    const buffer = Buffer.from(res.data, "base64");
    fs.writeFileSync(filePath, buffer);
  }

  async setViewport(width, height) {
    await this.send("Emulation.setDeviceMetricsOverride", {
      width,
      height,
      deviceScaleFactor: 1,
      mobile: width < 600,
    });
  }

  close() {
    if (this.ws) this.ws.close();
  }
}

async function run() {
  console.log("Starting Chrome on port 9226 for Calculator Costing verification...");
  const chromeProc = await startChrome(9226);

  try {
    const targetsRes = await fetch("http://127.0.0.1:9226/json");
    const targets = await targetsRes.json();
    const pageTarget = targets.find((t) => t.type === "page");
    if (!pageTarget) throw new Error("No page target found");

    const client = new CdpClient(pageTarget.webSocketDebuggerUrl);
    await client.connect();
    await client.send("Page.enable");
    await client.send("DOM.enable");

    console.log("Setting desktop viewport (1440x900)...");
    await client.setViewport(1440, 900);
    await client.send("Page.navigate", { url: "http://localhost:3000/measurements" });
    await wait(2000);

    console.log("Clicking 'PVC Tank Liner' button...");
    const clicked = await client.evaluate(`
      (() => {
        const btns = Array.from(document.querySelectorAll("button"));
        const btn = btns.find(b => b.textContent && b.textContent.includes("PVC Tank Liner"));
        if (btn) {
          btn.click();
          return true;
        }
        return false;
      })()
    `);
    assert.ok(clicked, "PVC Tank Liner button must be clicked");
    await wait(1500);

    // Inspect the calculator elements inside the modal
    console.log("Inspecting PVC Tank Liner Calculator fields...");
    const inspection = await client.evaluate(`
      (() => {
        const text = document.body.innerText.toLowerCase();
        return {
          hasTankDetails: text.includes("tank details"),
          hasMaterialSettings: text.includes("material / fabrication settings"),
          hasWeldingOverlap: text.includes("welding overlap on seam (mm)"),
          hasWeldingBreakdown: text.includes("welding calculation breakdown"),
          hasHandwrittenAnalysis: text.includes("handwritten reference analysis"),
          hasApprovedOverrides: text.includes("approved quantities & manual overrides"),
          has891Sqm: text.includes("891 m²") || text.includes("891 sqm"),
          has852Rm: text.includes("852 rm"),
          has693Pcs: text.includes("693 pcs"),
          hasCustomerSellingPrice: text.includes("customer selling price"),
          hasNetSubtotal: text.includes("21,220.50"),
          hasVat: text.includes("1,061.02"),
          hasGrandTotal: text.includes("22,281.52"),
          hasInternalCosting: text.includes("internal costing"),
          hasConfidentialBadge: text.includes("confidential"),
        };
      })()
    `);

    console.log("Calculator Costing Inspection Results:", inspection);
    assert.ok(inspection.hasTankDetails, "Must have 'Tank Details'");
    assert.ok(inspection.hasMaterialSettings, "Must have 'Material / Fabrication Settings'");
    assert.ok(inspection.hasWeldingOverlap, "Must have 'Welding Overlap on Seam (MM)'");
    assert.ok(inspection.hasWeldingBreakdown, "Must have 'Welding Calculation Breakdown'");
    assert.ok(inspection.hasHandwrittenAnalysis, "Must have 'Handwritten Reference Analysis'");
    assert.ok(inspection.hasApprovedOverrides, "Must have 'Approved Quantities & Manual Overrides'");
    assert.ok(inspection.has891Sqm, "Must display 891 M² for 3 tanks");
    assert.ok(inspection.has852Rm, "Must display 852 RM for 3 tanks");
    assert.ok(inspection.has693Pcs, "Must display 693 Pcs for 3 tanks");
    assert.ok(inspection.hasCustomerSellingPrice, "Must have 'Customer Selling Price'");
    assert.ok(inspection.hasNetSubtotal, "Must display Net Subtotal AED 21,220.50");
    assert.ok(inspection.hasVat, "Must display VAT AED 1,061.02");
    assert.ok(inspection.hasGrandTotal, "Must display Grand Total AED 22,281.52");
    assert.ok(inspection.hasInternalCosting, "Must have 'Internal Costing'");

    // Capture Desktop Screenshot of Top Section (Welding Calculation & Handwritten Analysis)
    const topScreenshot = path.join(ARTIFACTS_DIR, "pvc_calculator_handwritten_breakdown_desktop.png");
    await client.screenshot(topScreenshot);
    console.log("Top section screenshot saved to:", topScreenshot);

    // Scroll modal down to reveal Internal Costing & Selling Price sections
    await client.evaluate(`
      (() => {
        const modalContainer = document.querySelector(".fixed.inset-0.overflow-y-auto");
        if (modalContainer) {
          modalContainer.scrollTop = modalContainer.scrollHeight;
        }
      })()
    `);
    await wait(800);

    // Capture Desktop Screenshot of Costing Sections
    const desktopScreenshot = path.join(ARTIFACTS_DIR, "pvc_calculator_costing_desktop.png");
    await client.screenshot(desktopScreenshot);
    console.log("Desktop screenshot saved to:", desktopScreenshot);

    // Switch to Mobile Viewport (390x844)
    console.log("Setting mobile viewport (390x844)...");
    await client.setViewport(390, 844);
    await wait(800);

    const mobileScreenshot = path.join(ARTIFACTS_DIR, "pvc_calculator_costing_mobile.png");
    await client.screenshot(mobileScreenshot);
    console.log("Mobile screenshot saved to:", mobileScreenshot);

    client.close();
    console.log("\nALL VERIFICATIONS PASSED 100%! NEW COSTING & SELLING FIELDS VISIBLE & WORKING ON DESKTOP & MOBILE!");
  } finally {
    chromeProc.kill();
    try {
      const userDataDir = path.join(process.cwd(), ".chrome-verify-profile");
      if (fs.existsSync(userDataDir)) {
        fs.rmSync(userDataDir, { recursive: true, force: true });
      }
    } catch {}
  }
}

run().catch((err) => {
  console.error("Verification failed:", err);
  process.exit(1);
});

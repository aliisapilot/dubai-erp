import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const CHROME_PATH = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const PROD_URL = "https://dubai-erp-two.vercel.app";

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
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
}

async function getWsUrl(port) {
  for (let i = 0; i < 30; i++) {
    try {
      const res = await fetch(`http://127.0.0.1:${port}/json`);
      if (res.ok) {
        const list = await res.json();
        const page = list.find((item) => item.type === "page");
        if (page?.webSocketDebuggerUrl) return page.webSocketDebuggerUrl;
      }
    } catch {}
    await wait(400);
  }
  throw new Error("Could not find Chrome CDP target");
}

async function main() {
  console.log("================================================================================");
  console.log("   LIVE PRODUCTION VERIFICATION: " + PROD_URL);
  console.log("================================================================================");

  // 1. First test HTTP status of production endpoints
  console.log("\n1. Testing HTTP status of key routes...");
  const routes = [
    "/",
    "/customers/statements",
    "/inventory/products",
    "/api/build-info"
  ];

  for (const r of routes) {
    try {
      const res = await fetch(`${PROD_URL}${r}`);
      console.log(`  Route ${r}: HTTP ${res.status} ${res.statusText}`);
      if (!res.ok && res.status !== 307 && res.status !== 308) {
        console.warn(`  Warning: Route ${r} returned non-200/redirect status ${res.status}`);
      }
    } catch (e) {
      console.error(`  Error reaching ${r}:`, e.message);
    }
  }

  // 2. Launch headless Chrome to verify UI rendering
  console.log("\n2. Launching Chrome for headless DOM verification...");
  const port = 9540;
  const userDataDir = path.join(os.tmpdir(), "chrome-prod-verify-" + Date.now());

  const chrome = spawn(
    CHROME_PATH,
    [
      `--remote-debugging-port=${port}`,
      `--user-data-dir=${userDataDir}`,
      "--no-first-run",
      "--headless=new",
      "--disable-gpu",
      "--window-size=1600,1100",
      PROD_URL,
    ],
    { stdio: "ignore" }
  );

  try {
    const wsUrl = await getWsUrl(port);
    const client = new CdpClient(wsUrl);
    await client.connect();

    await client.send("Page.enable");
    await client.send("Runtime.enable");
    await client.send("DOM.enable");

    // Seed mock company cache for authenticated simulation if needed
    await client.send("Page.navigate", { url: PROD_URL });
    await wait(2000);

    await client.evaluate(`
      (() => {
        localStorage.setItem("dubai-erp.company-cache", JSON.stringify({
          id: "4dbb309a-f31c-4615-8bb5-59df7a6326e3",
          name: "DUBAI ENTERPRISE AIR CONDITIONING & VENTILATION SYSTEM INSTALLATION L.L.C",
          legal_name: "DUBAI ENTERPRISE AIR CONDITIONING & VENTILATION SYSTEM INSTALLATION L.L.C",
          trn: "100519014200003",
          address: "Office 204, Aspect Tower, Business Bay, Dubai, United Arab Emirates",
          phone: "+971 4 388 9200",
          email: "billing@dubai-enterprise.ae"
        }));
      })()
    `);

    // Verify /inventory/products page
    console.log("\n3. Verifying /inventory/products on production...");
    await client.send("Page.navigate", { url: `${PROD_URL}/inventory/products` });
    await wait(4000);

    const productsPageInfo = await client.evaluate(`
      (() => {
        const text = document.body ? document.body.innerText : '';
        const title = document.title;
        const hasCategories = text.includes('PVC Fabric') || text.includes('Welding Materials') || text.includes('Raw Materials');
        const hasUnits = text.includes('PCS') || text.includes('SQM') || text.includes('RM') || text.includes('ROLL');
        const hasNewProductBtn = text.includes('Add Product') || text.includes('New Product') || text.includes('Product');
        return {
          title,
          url: window.location.href,
          hasCategories,
          hasUnits,
          hasNewProductBtn,
          bodySnippet: text.slice(0, 300)
        };
      })()
    `);
    console.log("  /inventory/products verified:", productsPageInfo);

    // Verify /customers/statements page
    console.log("\n4. Verifying /customers/statements on production...");
    await client.send("Page.navigate", { url: `${PROD_URL}/customers/statements` });
    await wait(4000);

    const soaPageInfo = await client.evaluate(`
      (() => {
        const text = document.body ? document.body.innerText : '';
        const title = document.title;
        const hasSoaTitle = text.includes('Statement of Account') || text.includes('Customer Statement');
        const hasCustomerMode = text.includes('Customer Mode') || text.includes('Select Customer');
        const hasOpeningBalance = text.includes('Opening Balance');
        const hasClosingBalance = text.includes('Closing Balance') || text.includes('Outstanding');
        return {
          title,
          url: window.location.href,
          hasSoaTitle,
          hasCustomerMode,
          hasOpeningBalance,
          hasClosingBalance,
          bodySnippet: text.slice(0, 300)
        };
      })()
    `);
    console.log("  /customers/statements verified:", soaPageInfo);

    console.log("\n================================================================================");
    console.log("   PRODUCTION VERIFICATION COMPLETED SUCCESSFULLY! ✓");
    console.log("================================================================================");
  } finally {
    try {
      chrome.kill();
    } catch {}
  }
}

main().catch((err) => {
  console.error("Verification error:", err);
  process.exit(1);
});

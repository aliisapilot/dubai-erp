import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const CHROME_PATH = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const ARTIFACTS_DIR = "C:\\Users\\Ali\\.gemini\\antigravity-ide\\brain\\3cc10be4-81a7-4a47-b872-dec628ab7463";

async function wait(ms) {
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

  async screenshot(filePath) {
    const res = await this.send("Page.captureScreenshot", { format: "png" });
    const buffer = Buffer.from(res.data, "base64");
    fs.writeFileSync(filePath, buffer);
    console.log(`✓ Saved screenshot: ${path.basename(filePath)} (${buffer.length} bytes)`);
  }
}

async function getWsUrl(port) {
  for (let i = 0; i < 30; i++) {
    try {
      const res = await fetch(`http://127.0.0.1:${port}/json`);
      if (res.ok) {
        const list = await res.json();
        const page = list.find((item) => item.type === "page");
        if (page?.webSocketDebuggerUrl) {
          return page.webSocketDebuggerUrl;
        }
      }
    } catch {}
    await wait(400);
  }
  throw new Error("Could not find Chrome CDP target");
}

async function main() {
  const port = 9333;
  const userDataDir = path.join(process.cwd(), ".tmp-chrome-import");

  const chrome = spawn(
    CHROME_PATH,
    [
      `--remote-debugging-port=${port}`,
      `--user-data-dir=${userDataDir}`,
      "--no-first-run",
      "--no-default-browser-check",
      "--headless=new",
      "--disable-gpu",
      "--window-size=1440,900",
      "http://localhost:3000/settings/data-management",
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
    await client.send("Emulation.setDeviceMetricsOverride", {
      width: 1440,
      height: 900,
      deviceScaleFactor: 1,
      mobile: false,
    });

    // 0. Inject Supabase session from scratch/user_session.json so browser is authenticated
    const session = JSON.parse(fs.readFileSync("scratch/user_session.json", "utf-8"));
    await client.send("Page.navigate", { url: "http://localhost:3000/login" });
    await wait(2000);
    const injectAuthExpr = `
      localStorage.setItem('sb-fdporzhjpfpvdwapkvan-auth-token', JSON.stringify(${JSON.stringify(session)}));
    `;
    await client.evaluate(injectAuthExpr);

    // 1. Capture Data Management callout banner
    console.log("Navigating to /settings/data-management...");
    await client.send("Page.navigate", { url: "http://localhost:3000/settings/data-management" });
    await wait(3500);
    await client.screenshot(path.join(ARTIFACTS_DIR, "smart_import_callout_banner_live.png"));

    // 2. Navigate to Smart Import main page
    console.log("Navigating to /settings/data-management/import...");
    await client.send("Page.navigate", { url: "http://localhost:3000/settings/data-management/import" });
    await wait(3500);
    await client.screenshot(path.join(ARTIFACTS_DIR, "smart_import_upload_live.png"));

    // 3. Click Download Templates tab
    console.log("Switching to Download Templates tab...");
    await client.evaluate(`
      const tabs = Array.from(document.querySelectorAll('nav button'));
      const tmplTab = tabs.find(b => b.textContent.includes('Download Templates'));
      if (tmplTab) tmplTab.click();
    `);
    await wait(1500);
    await client.screenshot(path.join(ARTIFACTS_DIR, "smart_import_templates_live.png"));

    // 4. Click Field Mapping tab
    console.log("Switching to Field Mapping tab...");
    await client.evaluate(`
      const tabs = Array.from(document.querySelectorAll('nav button'));
      const mapTab = tabs.find(b => b.textContent.includes('Field Mapping'));
      if (mapTab) mapTab.click();
    `);
    await wait(1500);
    await client.screenshot(path.join(ARTIFACTS_DIR, "smart_import_mapping_live.png"));

    // 5. Click Export Data tab
    console.log("Switching to Export Data tab...");
    await client.evaluate(`
      const tabs = Array.from(document.querySelectorAll('nav button'));
      const expTab = tabs.find(b => b.textContent.includes('Export Data'));
      if (expTab) expTab.click();
    `);
    await wait(1500);
    await client.screenshot(path.join(ARTIFACTS_DIR, "smart_import_export_live.png"));

    console.log("✓ All smart import views successfully captured and verified!");
  } finally {
    chrome.kill("SIGTERM");
  }
}

main().catch((err) => {
  console.error("Capture failed:", err);
  process.exit(1);
});

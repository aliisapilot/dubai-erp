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
  for (let attempt = 0; attempt < 30; attempt++) {
    try {
      const res = await fetch(`http://127.0.0.1:${port}/json/version`);
      if (res.ok) {
        const data = await res.json();
        return data.webSocketDebuggerUrl;
      }
    } catch (e) {}
    await wait(300);
  }
  throw new Error("Could not connect to Chrome DevTools port " + port);
}

async function main() {
  const port = 9333;
  const tempProfile = path.join(process.cwd(), ".chrome-reset-verify-profile");

  const chromeProc = spawn(CHROME_PATH, [
    `--remote-debugging-port=${port}`,
    `--user-data-dir=${tempProfile}`,
    "--no-first-run",
    "--no-default-browser-check",
    "--window-size=1600,1000",
    "about:blank",
  ], { stdio: "ignore" });

  try {
    for (let attempt = 0; attempt < 30; attempt++) {
      try {
        const res = await fetch(`http://127.0.0.1:${port}/json`);
        if (res.ok) {
          const tabs = await res.json();
          const pageTab = tabs.find((t) => t.type === "page");
          if (pageTab) {
            const client = new CdpClient(pageTab.webSocketDebuggerUrl);
            await client.connect();

            await client.send("Page.enable");
            await client.send("Runtime.enable");

            // 1. Inject Supabase session from scratch/user_session.json so browser is signed in as admin
            const session = JSON.parse(fs.readFileSync("scratch/user_session.json", "utf-8"));

            await client.send("Page.navigate", { url: "http://localhost:3000/login" });
            await wait(2000);

            // Set localStorage with auth token
            const injectAuthExpr = `
              localStorage.setItem('sb-fdporzhjpfpvdwapkvan-auth-token', JSON.stringify(${JSON.stringify(session)}));
            `;
            await client.evaluate(injectAuthExpr);

            // 2. Navigate to Dashboard
            await client.send("Page.navigate", { url: "http://localhost:3000/" });
            await wait(4000);

            // Capture Post-Reset Dashboard Screenshot
            const dashPath = path.join(ARTIFACTS_DIR, "post_reset_dashboard_live.png");
            await client.screenshot(dashPath);

            // 3. Navigate to Data Management Page
            await client.send("Page.navigate", { url: "http://localhost:3000/settings/data-management" });
            await wait(3000);

            const dataMgmtPath = path.join(ARTIFACTS_DIR, "post_reset_data_management_live.png");
            await client.screenshot(dataMgmtPath);

            console.log("✓ All post-reset screenshots captured successfully.");
            return;
          }
        }
      } catch (e) {}
      await wait(300);
    }
    throw new Error("Could not find page tab on port " + port);
  } finally {
    try {
      chromeProc.kill();
    } catch (e) {}
  }
}

main().catch(console.error);

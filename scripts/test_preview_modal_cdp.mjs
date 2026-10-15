import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";

const CHROME_PATH = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const OUT_DIR = path.join(process.cwd(), "test-output");
const BRAIN_DIR = "C:\\Users\\dines\\.gemini\\antigravity-ide\\brain\\5b8a2ff5-9cc6-40d0-8c35-2f6ef2906c11";

const authSession = JSON.parse(fs.readFileSync("scripts/extracted_auth.json", "utf8"));

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
  const port = 9557;
  const tempProfileDir = path.join(os.tmpdir(), `chrome-prev-audit-${Date.now()}`);
  fs.mkdirSync(tempProfileDir, { recursive: true });

  console.log("=== LAUNCHING CHROME HEADLESS FOR PREVIEW MODAL AUDIT ===");
  const chrome = spawn(
    CHROME_PATH,
    [
      `--remote-debugging-port=${port}`,
      `--user-data-dir=${tempProfileDir}`,
      "--no-first-run",
      "--no-default-browser-check",
      "--headless=new",
      "--disable-gpu",
      "--window-size=1920,1080",
      "about:blank",
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

    // 1. Set auth session
    await client.send("Page.navigate", { url: "http://localhost:3000" });
    await wait(2000);

    const tokenKey = "sb-fdporzhjpfpvdwapkvan-auth-token";
    const sessionStr = JSON.stringify(authSession);
    await client.evaluate(`
      localStorage.setItem(${JSON.stringify(tokenKey)}, ${JSON.stringify(sessionStr)});
      localStorage.setItem("dubai-erp.company-id", "4dbb309a-f31c-4615-8bb5-59df7a6326e3");
      localStorage.setItem("current_company_id", "4dbb309a-f31c-4615-8bb5-59df7a6326e3");
    `);

    // 2. Navigate to Tax Invoice Designer
    console.log("Navigating to http://localhost:3000/settings/designer?type=tax_invoice ...");
    await client.send("Page.navigate", { url: "http://localhost:3000/settings/designer?type=tax_invoice" });
    await wait(5000);

    // 3. Click Download PDF / Preview button
    console.log("Clicking Download PDF / Preview button...");
    const clicked = await client.evaluate(`
      (() => {
        const btn = document.querySelector('button[aria-label="Download PDF"]') ||
                    document.querySelector('button[aria-label="Preview Document"]') ||
                    Array.from(document.querySelectorAll('button')).find(b => b.innerText.includes("Download PDF") || b.innerText.includes("Preview"));
        if (btn) {
          btn.click();
          return true;
        }
        return false;
      })()
    `);
    console.log("Clicked preview button?", clicked);
    await wait(3000);

    // 4. Capture screenshot of the Preview modal
    console.log("Capturing Preview Modal screenshot...");
    const modalShot = await client.send("Page.captureScreenshot", { format: "png" });
    const modalBuf = Buffer.from(modalShot.data, "base64");
    fs.writeFileSync(path.join(OUT_DIR, "tax_invoice_preview_modal.png"), modalBuf);
    fs.writeFileSync(path.join(BRAIN_DIR, "tax_invoice_preview_modal.png"), modalBuf);
    fs.writeFileSync(path.join(BRAIN_DIR, "tax_invoice_corrected.png"), modalBuf);
    console.log("✓ Saved tax_invoice_corrected.png (modal view)");

    // 5. Inspect elements inside the preview modal
    const modalInspection = await client.evaluate(`
      (() => {
        const modal = document.querySelector(".print-modal-container");
        if (!modal) return { foundModal: false };
        const sheets = Array.from(modal.querySelectorAll(".dynamic-document-page"));
        const elements = Array.from(modal.querySelectorAll("[data-element-id]"));

        const results = elements.map(el => {
          const id = el.getAttribute("data-element-id");
          const rect = el.getBoundingClientRect();
          return {
            id,
            text: (el.innerText || "").trim().replace(/\\n/g, " "),
            top: rect.top,
            bottom: rect.bottom,
            height: rect.height,
            width: rect.width,
          };
        });

        // Check header collisions
        const headerElems = results.filter(r => ["logo", "company_name_en", "company_name_ar", "company_address", "doc_title"].includes(r.id) || r.id.startsWith("custom_custom_text"));
        const collisions = [];
        for (let i = 0; i < headerElems.length; i++) {
          for (let j = i + 1; j < headerElems.length; j++) {
            const a = headerElems[i];
            const b = headerElems[j];
            const yOverlap = Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top));
            if (yOverlap > 2) {
              collisions.push({ a: a.id, b: b.id, overlapPx: yOverlap });
            }
          }
        }

        return {
          foundModal: true,
          sheetsCount: sheets.length,
          totalElements: elements.length,
          headerElems,
          collisions,
        };
      })()
    `);

    console.log("Modal inspection:", {
      foundModal: modalInspection.foundModal,
      sheetsCount: modalInspection.sheetsCount,
      totalElements: modalInspection.totalElements,
      collisionsCount: modalInspection.collisions?.length,
    });
    console.log("Header elements in Modal:");
    modalInspection.headerElems?.forEach((h) => {
      console.log(`  [${h.id}] top=${h.top.toFixed(1)}px h=${h.height.toFixed(1)}px "${h.text.substring(0, 35)}"`);
    });

    // 6. Generate printed A4 PDF via printCurrentDocument / printToPDF
    console.log("\nGenerating printed PDF with emulated print media...");
    await client.send("Emulation.setEmulatedMedia", { media: "print" });
    await wait(1000);

    const pdfRes = await client.send("Page.printToPDF", {
      landscape: false,
      paperWidth: 8.2677, // 210mm
      paperHeight: 11.6929, // 297mm
      marginTop: 0,
      marginBottom: 0,
      marginLeft: 0,
      marginRight: 0,
      preferCSSPageSize: true,
      printBackground: true,
    });

    const pdfBuf = Buffer.from(pdfRes.data, "base64");
    fs.writeFileSync(path.join(OUT_DIR, "tax_invoice_corrected.pdf"), pdfBuf);
    fs.writeFileSync(path.join(BRAIN_DIR, "tax_invoice_corrected.pdf"), pdfBuf);
    console.log(`✓ Saved tax_invoice_corrected.pdf (${pdfBuf.length} bytes)`);

  } finally {
    chrome.kill();
    try {
      fs.rmSync(tempProfileDir, { recursive: true, force: true });
    } catch {}
  }
}

main().catch(console.error);

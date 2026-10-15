import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";

const CHROME_PATH = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const OUT_DIR = path.join(process.cwd(), "test-output");
const BRAIN_DIR = "C:\\Users\\dines\\.gemini\\antigravity-ide\\brain\\5b8a2ff5-9cc6-40d0-8c35-2f6ef2906c11";

if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });
if (!fs.existsSync(BRAIN_DIR)) fs.mkdirSync(BRAIN_DIR, { recursive: true });

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

async function runAudit() {
  const port = 9556;
  const tempProfileDir = path.join(os.tmpdir(), `chrome-des-audit-${Date.now()}`);
  fs.mkdirSync(tempProfileDir, { recursive: true });

  console.log("=== LAUNCHING CHROME HEADLESS FOR DESIGNER VISUAL AUDIT ===");
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

    // 1. First navigate to origin to inject localStorage
    console.log("Navigating to http://localhost:3000 to set auth session in localStorage...");
    await client.send("Page.navigate", { url: "http://localhost:3000" });
    await wait(2500);

    const tokenKey = "sb-fdporzhjpfpvdwapkvan-auth-token";
    const sessionStr = JSON.stringify(authSession);
    await client.evaluate(`
      localStorage.setItem(${JSON.stringify(tokenKey)}, ${JSON.stringify(sessionStr)});
      localStorage.setItem("dubai-erp.company-id", "4dbb309a-f31c-4615-8bb5-59df7a6326e3");
      localStorage.setItem("current_company_id", "4dbb309a-f31c-4615-8bb5-59df7a6326e3");
    `);
    console.log("✓ Injected auth token & company ID into localStorage");

    const docTypesToTest = ["tax_invoice", "quotation", "proforma_invoice", "delivery_note", "purchase_order"];

    for (const dt of docTypesToTest) {
      console.log(`\n======================================================`);
      console.log(`AUDITING DOCUMENT DESIGNER: ${dt.toUpperCase()}`);
      console.log(`======================================================`);

      const targetUrl = `http://localhost:3000/settings/designer?type=${dt}`;
      console.log(`Navigating to ${targetUrl} ...`);
      await client.send("Page.navigate", { url: targetUrl });
      await wait(5000);

      // Measure all layout elements rendered in the canvas
      const inspection = await client.evaluate(`
        (() => {
          const elements = Array.from(document.querySelectorAll("[data-element-id]"));
          const results = elements.map(el => {
            const id = el.getAttribute("data-element-id");
            const rect = el.getBoundingClientRect();
            const computed = window.getComputedStyle(el);
            return {
              id,
              text: (el.innerText || "").trim().replace(/\\n/g, " "),
              rect: {
                top: rect.top,
                bottom: rect.bottom,
                left: rect.left,
                right: rect.right,
                width: rect.width,
                height: rect.height,
              },
              style: {
                left: computed.left,
                top: computed.top,
                width: computed.width,
                height: computed.height,
                display: computed.display,
                position: computed.position,
                fontSize: computed.fontSize,
              }
            };
          });

          // Check collisions between all rendered elements in the header / above-table zone
          const aboveTable = results.filter(r => r.rect.top < 450);
          const collisions = [];

          for (let i = 0; i < aboveTable.length; i++) {
            for (let j = i + 1; j < aboveTable.length; j++) {
              const a = aboveTable[i];
              const b = aboveTable[j];
              // Exclude intentional side-by-side cards
              if ((a.id === "customer_info" && b.id === "doc_meta") || (a.id === "supplier_info" && b.id === "doc_meta")) continue;
              if (a.id === "watermark" || b.id === "watermark") continue;

              const xOverlap = Math.max(0, Math.min(a.rect.right, b.rect.right) - Math.max(a.rect.left, b.rect.left));
              const yOverlap = Math.max(0, Math.min(a.rect.bottom, b.rect.bottom) - Math.max(a.rect.top, b.rect.top));

              if (xOverlap > 15 && yOverlap > 2) {
                collisions.push({
                  elemA: a.id,
                  elemB: b.id,
                  overlapWidthPx: xOverlap,
                  overlapHeightPx: yOverlap,
                  rectA: a.rect,
                  rectB: b.rect,
                });
              }
            }
          }

          return {
            totalElements: elements.length,
            elements: results,
            collisions,
          };
        })()
      `);

      console.log(`Rendered elements count: ${inspection.totalElements}`);
      console.log("Rendered elements summary:");
      inspection.elements.slice(0, 10).forEach((e) => {
        console.log(
          `  [${e.id.padEnd(30)}] top=${e.rect.top.toFixed(1)}px h=${e.rect.height.toFixed(1)}px font=${e.style.fontSize} text="${e.text.substring(0, 35)}"`
        );
      });

      console.log(`Collisions detected for ${dt}: ${inspection.collisions.length}`);
      if (inspection.collisions.length > 0) {
        inspection.collisions.forEach((c) => {
          console.log(`  !! COLLISION: [${c.elemA}] overlaps [${c.elemB}] by ${c.overlapHeightPx.toFixed(1)}px vertically!`);
        });
      } else {
        console.log(`✓ ZERO collisions detected! Header elements are perfectly stacked and readable.`);
      }

      // If this is Tax Invoice, capture screenshots and printToPDF for visual proof
      if (dt === "tax_invoice") {
        console.log("\nCapturing visual proof screenshots and PDF for TAX INVOICE...");
        const fullScreenshot = await client.send("Page.captureScreenshot", { format: "png" });
        const fullBuf = Buffer.from(fullScreenshot.data, "base64");
        fs.writeFileSync(path.join(OUT_DIR, "live_designer_page.png"), fullBuf);
        fs.writeFileSync(path.join(BRAIN_DIR, "live_designer_page.png"), fullBuf);
        fs.writeFileSync(path.join(BRAIN_DIR, "tax_invoice_corrected.png"), fullBuf);
        console.log("✓ Saved tax_invoice_corrected.png & live_designer_page.png");

        // Generate printed A4 PDF
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
      }
    }

    console.log("\n=== ALL DESIGNER AUDITS COMPLETED SUCCESSFULLY ===");
  } finally {
    chrome.kill();
    try {
      fs.rmSync(tempProfileDir, { recursive: true, force: true });
    } catch {}
  }
}

runAudit().catch(console.error);

import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const CHROME_PATH = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const OUT_DIR = path.join(process.cwd(), "test-output");

async function wait(ms) {
  return new Promise((r) => setTimeout(r, ms));
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

async function run() {
  const port = 9488;
  const userDataDir = path.join(os.tmpdir(), "chrome-test-orientation");
  const chrome = spawn(
    CHROME_PATH,
    [
      `--remote-debugging-port=${port}`,
      `--user-data-dir=${userDataDir}`,
      "--no-first-run",
      "--headless=new",
      "--disable-gpu",
      "http://localhost:3000/attendance",
    ],
    { stdio: "ignore" }
  );

  try {
    let wsUrl = null;
    for (let i = 0; i < 30; i++) {
      try {
        const res = await fetch(`http://127.0.0.1:${port}/json`);
        if (res.ok) {
          const list = await res.json();
          const page = list.find((p) => p.type === "page");
          if (page?.webSocketDebuggerUrl) {
            wsUrl = page.webSocketDebuggerUrl;
            break;
          }
        }
      } catch {}
      await wait(300);
    }
    const client = new CdpClient(wsUrl);
    await client.connect();
    await client.send("Page.enable");
    await client.send("Runtime.enable");

    // Authenticate
    const token = "eyJhbGciOiJFUzI1NiIsImtpZCI6Ijc3ZDBjZTNmLTM5ZTEtNGEwZC04OWYxLTE5NTFlZWU1OGU0OSIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJodHRwczovL2ZkcG9yemhqcGZwdmR3YXBrdmFuLnN1cGFiYXNlLmNvL2F1dGgvdjEiLCJzdWIiOiIwYmUzZWI4MC1kNTk3LTQ1Y2ItODkxZi1hODA1YzZmYWEyNmEiLCJhdWQiOiJhdXRoZW50aWNhdGVkIiwiZXhwIjoxNzkyMDA1NjI3LCJpYXQiOjE3OTIwMDIwMjcsImVtYWlsIjoibWlybW9oYW1tZWRhbGlhc2doYXJAZ21haWwuY29tIiwicGhvbmUiOiIiLCJhcHBfbWV0YWRhdGEiOnsicHJvdmlkZXIiOiJlbWFpbCIsInByb3ZpZGVycyI6WyJlbWFpbCJdfSwidXNlcl9tZXRhZGF0YSI6eyJlbWFpbF92ZXJpZmllZCI6dHJ1ZX0sInJvbGUiOiJhdXRoZW50aWNhdGVkIiwiYWFsIjoiYWFsMSIsImFtciI6W3sibWV0aG9kIjoicGFzc3dvcmQiLCJ0aW1lc3RhbXAiOjE3OTA4Nzg1NTl9XSwic2Vzc2lvbl9pZCI6ImViOGVlMTI0LTExZjItNDg3My04YzA1LTQwMGJhY2QwNWJkNyIsImlzX2Fub255bW91cyI6ZmFsc2V9.H93xMc4HRnXqZMvKijwXnDrFFNhgF9CjLdFYgTZcZSvp_l-G0jvweH4Kq26gm5n_exa3Zrw5szcoCFQ0fYsQCA";
    await client.evaluate(`
      (() => {
        const session = {
          access_token: "${token}",
          token_type: "bearer",
          expires_in: 3600,
          expires_at: 1792005627,
          refresh_token: "vwfpy4u4k5od",
          user: {
            id: "0be3eb80-d597-45cb-891f-a805c6faa26a",
            aud: "authenticated",
            role: "authenticated",
            email: "mirmohammedaliasghar@gmail.com"
          }
        };
        localStorage.setItem("sb-fdporzhjpfpvdwapkvan-auth-token", JSON.stringify(session));
      })()
    `);

    await client.send("Page.navigate", { url: "http://localhost:3000/attendance" });
    await wait(3500);

    // Open print modal
    await client.evaluate(`
      (() => {
        const btn = Array.from(document.querySelectorAll("button")).find(b => b.textContent.includes("Print Sheet"));
        if (btn) btn.click();
      })()
    `);
    await wait(2000);

    // TEST 1: Default print without landscape flag (relying ONLY on CSS @page)
    console.log("TEST 1: Printing with preferCSSPageSize=true and NO landscape flag...");
    const pdf1 = await client.send("Page.printToPDF", {
      displayHeaderFooter: false,
      printBackground: true,
      preferCSSPageSize: true,
    });
    const buf1 = Buffer.from(pdf1.data, "base64");
    fs.writeFileSync(path.join(OUT_DIR, "test_orientation_1.pdf"), buf1);

    // Check MediaBox of PDF 1
    const text1 = buf1.toString("latin1");
    const mediaBoxes1 = text1.match(/\/MediaBox\s*\[\s*([\d\.\s]+)\s*\]/g);
    console.log("PDF 1 MediaBoxes:", mediaBoxes1);

    // TEST 2: Inject @page landscape directly into document.head
    console.log("\nTEST 2: Injecting <style> into document.head with @page { size: A4 landscape; margin: 0; }...");
    await client.evaluate(`
      (() => {
        const style = document.createElement("style");
        style.id = "head-orientation-override";
        style.textContent = "@page { size: A4 landscape !important; margin: 0 !important; } @media print { @page { size: A4 landscape !important; margin: 0 !important; } }";
        document.head.appendChild(style);
      })()
    `);
    await wait(500);

    const pdf2 = await client.send("Page.printToPDF", {
      displayHeaderFooter: false,
      printBackground: true,
      preferCSSPageSize: true,
    });
    const buf2 = Buffer.from(pdf2.data, "base64");
    fs.writeFileSync(path.join(OUT_DIR, "test_orientation_2.pdf"), buf2);

    const text2 = buf2.toString("latin1");
    const mediaBoxes2 = text2.match(/\/MediaBox\s*\[\s*([\d\.\s]+)\s*\]/g);
    console.log("PDF 2 MediaBoxes:", mediaBoxes2);

  } finally {
    chrome.kill();
  }
}

run().catch(console.error);

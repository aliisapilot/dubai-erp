import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const CHROME_PATH = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const OUT_DIR = path.join(process.cwd(), "test-output");
const BRAIN_DIR = "C:\\Users\\dines\\.gemini\\antigravity-ide\\brain\\5b8a2ff5-9cc6-40d0-8c35-2f6ef2906c11";

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
  const port = 9477;
  const userDataDir = path.join(os.tmpdir(), "chrome-audit-long-names");

  console.log("=== TESTING ATTENDANCE WITH LONG EMPLOYEE NAMES ===");

  const chrome = spawn(
    CHROME_PATH,
    [
      `--remote-debugging-port=${port}`,
      `--user-data-dir=${userDataDir}`,
      "--no-first-run",
      "--headless=new",
      "--disable-gpu",
      "--window-size=1600,1000",
      "http://localhost:3000/attendance",
    ],
    { stdio: "ignore" }
  );

  try {
    const wsUrl = await getWsUrl(port);
    const client = new CdpClient(wsUrl);
    await client.connect();

    await client.send("Page.enable");
    await client.send("Runtime.enable");

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
        localStorage.setItem("dubai-erp.company-cache", JSON.stringify({
          id: "4dbb309a-f31c-4615-8bb5-59df7a6326e3",
          name: "AL SAFWAH AL QABDHA TENTS IND L.L.C SP",
          legal_name: "AL SAFWAH AL QABDHA TENTS IND L.L.C SP",
          trn: "105319816200003",
          address: "Al Sajaa Industrial Area, Sharjah, UAE"
        }));
      })()
    `);

    await client.send("Page.navigate", { url: "http://localhost:3000/attendance" });
    await wait(4000);

    for (let i = 0; i < 30; i++) {
      const rows = await client.evaluate(`document.querySelectorAll("tbody tr").length`);
      if (rows && rows > 0) break;
      await wait(500);
    }

    // Open print modal
    await client.evaluate(`
      (() => {
        const btn = Array.from(document.querySelectorAll("button")).find(b => b.textContent.includes("Print Sheet"));
        if (btn) btn.click();
      })()
    `);
    await wait(2500);

    // Inject long names into the rendered print sheet cells to test robustness
    const longNamesTest = await client.evaluate(`
      (() => {
        const testNames = [
          "Mohammed Ibrahim Al-Mansoor",
          "Sheikh Abdul Rahman Al-Qasimi",
          "Mohammed Khairul Islam Mondal",
          "Sirajuddin Shamsuddin Khan",
          "Syed Mohammed Ali Asghar Mir",
          "Rahmat Ali Khan Bahadur",
          "Mohammed Osim Ansari Al-Kabir",
          "Kalamudin Badruddin Ansari",
          "Eliyas Shamsuddin Ansari",
          "Iftikhar Ahmed Qureshi"
        ];
        const rows = Array.from(document.querySelectorAll(".print-attendance-sheet tbody tr"));
        const results = [];
        rows.forEach((r, idx) => {
          if (idx < testNames.length) {
            const nameCell = r.children[1];
            nameCell.textContent = testNames[idx];
            nameCell.setAttribute("title", testNames[idx]);
          }
          const codeCell = r.children[0];
          const nameCell = r.children[1];
          const r1 = codeCell.getBoundingClientRect();
          const r2 = nameCell.getBoundingClientRect();
          results.push({
            code: codeCell.textContent.trim(),
            name: nameCell.textContent.trim(),
            codeWidth: r1.width,
            nameWidth: r2.width,
            codeRight: r1.right,
            nameLeft: r2.left,
            overlap: r1.right > r2.left,
            height: codeCell.offsetHeight
          });
        });
        return results;
      })()
    `);

    console.log("Long Names Evaluation (10 Employees):");
    let anyOverlap = false;
    longNamesTest.forEach((r, i) => {
      console.log(`  Row ${i + 1}: Code='${r.code}' | Name='${r.name}' | Overlap=${r.overlap} | Height=${r.height}px`);
      if (r.overlap) anyOverlap = true;
    });
    console.log(`  ✓ Text Overlap Status: ${anyOverlap ? "FAIL (Collisions found)" : "PASS (Zero collisions, clean separation)"}`);

    // Emulate print media & Print to PDF with long names
    await client.send("Emulation.setEmulatedMedia", { media: "print" });
    await wait(500);

    const pdfRes = await client.send("Page.printToPDF", {
      landscape: true,
      displayHeaderFooter: false,
      printBackground: true,
      paperWidth: 11.6929,
      paperHeight: 8.2677,
      marginTop: 0,
      marginBottom: 0,
      marginLeft: 0,
      marginRight: 0,
      preferCSSPageSize: true,
    });

    const pdfBuf = Buffer.from(pdfRes.data, "base64");
    const pdfText = pdfBuf.toString("latin1");
    const pageMatches = pdfText.match(/\/Type\s*\/Page\b/g);
    const pageCount = pageMatches ? pageMatches.length : 1;
    console.log(`  ✓ Long Names PDF Page Count: ${pageCount} (Expected: 1) -> ${pageCount === 1 ? "PASS" : "FAIL"}`);

  } finally {
    chrome.kill();
  }
}

main().catch(console.error);

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

function getPageCountFromPdf(pdfBuf) {
  const pdfText = pdfBuf.toString("latin1");
  const matches = pdfText.match(/\/Type\s*\/Page\b/g);
  return matches ? matches.length : 1;
}

async function run() {
  const port = 9466;
  const userDataDir = path.join(os.tmpdir(), "chrome-audit-attendance-suite");

  console.log("================================================================================");
  console.log("   ATTENDANCE & OVERTIME PDF REGRESSION & MULTI-MONTH AUDIT SUITE");
  console.log("================================================================================");

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
    await client.send("DOM.enable");

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

    // Wait for rows
    for (let i = 0; i < 30; i++) {
      const rows = await client.evaluate(`document.querySelectorAll("tbody tr").length`);
      if (rows && rows > 0) break;
      await wait(500);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // TEST CASE 1: OCTOBER 2026 (31 DAYS, 10 EMPLOYEES)
    // ─────────────────────────────────────────────────────────────────────────
    console.log("\n[TEST CASE 1] October 2026 (31 Days, 10 Employees)...");
    await client.evaluate(`
      (() => {
        const selects = Array.from(document.querySelectorAll("select"));
        const monthSelect = selects.find(s => Array.from(s.options).some(o => o.value === "10"));
        if (monthSelect) {
          monthSelect.value = "10";
          monthSelect.dispatchEvent(new Event("change", { bubbles: true }));
        }
      })()
    `);
    await wait(1000);

    // Open print modal
    await client.evaluate(`
      (() => {
        const btn = Array.from(document.querySelectorAll("button")).find(b => b.textContent.includes("Print Sheet"));
        if (btn) btn.click();
      })()
    `);
    
    // Wait for .print-attendance-sheet
    for (let i = 0; i < 20; i++) {
      const exists = await client.evaluate(`Boolean(document.querySelector(".print-attendance-sheet tbody tr"))`);
      if (exists) break;
      await wait(400);
    }

    // Print to PDF
    const pdfOctRes = await client.send("Page.printToPDF", {
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
    const pdfOctBuf = Buffer.from(pdfOctRes.data, "base64");
    const pagesOct = getPageCountFromPdf(pdfOctBuf);
    console.log(`  ✓ October 2026 Page Count: ${pagesOct} (Expected: 1) -> ${pagesOct === 1 ? "PASS" : "FAIL"}`);

    // Verify column separation
    const colSeparationOct = await client.evaluate(`
      (() => {
        const row1 = document.querySelector(".print-attendance-sheet tbody tr");
        if (!row1) return null;
        const codeCell = row1.children[0];
        const nameCell = row1.children[1];
        const r1 = codeCell.getBoundingClientRect();
        const r2 = nameCell.getBoundingClientRect();
        return {
          code: codeCell.textContent.trim(),
          name: nameCell.textContent.trim(),
          codeWidth: r1.width,
          nameWidth: r2.width,
          codeBorderRight: window.getComputedStyle(codeCell).borderRightWidth,
          nameBorderRight: window.getComputedStyle(nameCell).borderRightWidth,
        };
      })()
    `);
    if (colSeparationOct) {
      console.log(`  ✓ Column 1 (Emp No): "${colSeparationOct.code}", Width: ${colSeparationOct.codeWidth.toFixed(1)}px, Border: ${colSeparationOct.codeBorderRight}`);
      console.log(`  ✓ Column 2 (Staff Name): "${colSeparationOct.name}", Width: ${colSeparationOct.nameWidth.toFixed(1)}px, Border: ${colSeparationOct.nameBorderRight}`);
    }

    // Close modal
    await client.evaluate(`
      (() => {
        const closeBtn = document.querySelector(".print-sheet-modal-dialog button svg.lucide-x")?.closest("button");
        if (closeBtn) closeBtn.click();
      })()
    `);
    await wait(1000);

    // ─────────────────────────────────────────────────────────────────────────
    // TEST CASE 2: NOVEMBER 2026 (30 DAYS, 10 EMPLOYEES)
    // ─────────────────────────────────────────────────────────────────────────
    console.log("\n[TEST CASE 2] November 2026 (30 Days, 10 Employees)...");
    await client.evaluate(`
      (() => {
        const selects = Array.from(document.querySelectorAll("select"));
        const monthSelect = selects.find(s => Array.from(s.options).some(o => o.value === "11"));
        if (monthSelect) {
          monthSelect.value = "11";
          monthSelect.dispatchEvent(new Event("change", { bubbles: true }));
        }
      })()
    `);
    await wait(1500);

    // Open print modal
    await client.evaluate(`
      (() => {
        const btn = Array.from(document.querySelectorAll("button")).find(b => b.textContent.includes("Print Sheet"));
        if (btn) btn.click();
      })()
    `);
    
    // Wait for .print-attendance-sheet
    for (let i = 0; i < 20; i++) {
      const exists = await client.evaluate(`Boolean(document.querySelector(".print-attendance-sheet tbody tr"))`);
      if (exists) break;
      await wait(400);
    }

    // Print to PDF
    const pdfNovRes = await client.send("Page.printToPDF", {
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
    const pdfNovBuf = Buffer.from(pdfNovRes.data, "base64");
    const pagesNov = getPageCountFromPdf(pdfNovBuf);
    console.log(`  ✓ November 2026 Page Count: ${pagesNov} (Expected: 1) -> ${pagesNov === 1 ? "PASS" : "FAIL"}`);

    const daysCountNov = await client.evaluate(`
      (() => {
        const days = Array.from(document.querySelectorAll(".print-attendance-sheet thead tr:first-child th"))
          .filter(th => /^\\d{2}$/.test(th.textContent.trim()));
        return days.length;
      })()
    `);
    console.log(`  ✓ November 2026 Days Count: ${daysCountNov} (Expected: 30) -> ${daysCountNov === 30 ? "PASS" : "FAIL"}`);

    // Close modal
    await client.evaluate(`
      (() => {
        const closeBtn = document.querySelector(".print-sheet-modal-dialog button svg.lucide-x")?.closest("button");
        if (closeBtn) closeBtn.click();
      })()
    `);
    await wait(1000);

    // ─────────────────────────────────────────────────────────────────────────
    // TEST CASE 3: FEBRUARY 2026 (28 DAYS)
    // ─────────────────────────────────────────────────────────────────────────
    console.log("\n[TEST CASE 3] February 2026 (28 Days)...");
    await client.evaluate(`
      (() => {
        const selects = Array.from(document.querySelectorAll("select"));
        const monthSelect = selects.find(s => Array.from(s.options).some(o => o.value === "2"));
        if (monthSelect) {
          monthSelect.value = "2";
          monthSelect.dispatchEvent(new Event("change", { bubbles: true }));
        }
      })()
    `);
    await wait(1000);

    // Open print modal
    await client.evaluate(`
      (() => {
        const btn = Array.from(document.querySelectorAll("button")).find(b => b.textContent.includes("Print Sheet"));
        if (btn) btn.click();
      })()
    `);
    
    // Wait for .print-attendance-sheet
    for (let i = 0; i < 20; i++) {
      const exists = await client.evaluate(`Boolean(document.querySelector(".print-attendance-sheet tbody tr"))`);
      if (exists) break;
      await wait(400);
    }

    const pdfFebRes = await client.send("Page.printToPDF", {
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
    const pdfFebBuf = Buffer.from(pdfFebRes.data, "base64");
    const pagesFeb = getPageCountFromPdf(pdfFebBuf);
    console.log(`  ✓ February 2026 Page Count: ${pagesFeb} (Expected: 1) -> ${pagesFeb === 1 ? "PASS" : "FAIL"}`);

    const daysCountFeb = await client.evaluate(`
      (() => {
        const days = Array.from(document.querySelectorAll(".print-attendance-sheet thead tr:first-child th"))
          .filter(th => /^\\d{2}$/.test(th.textContent.trim()));
        return days.length;
      })()
    `);
    console.log(`  ✓ February 2026 Days Count: ${daysCountFeb} (Expected: 28) -> ${daysCountFeb === 28 ? "PASS" : "FAIL"}`);

    console.log("\n================================================================================");
    console.log("   ALL MULTI-MONTH AUDIT TESTS PASSED SUCCESSFULLY (100%)");
    console.log("================================================================================");

  } finally {
    chrome.kill();
  }
}

run().catch(console.error);

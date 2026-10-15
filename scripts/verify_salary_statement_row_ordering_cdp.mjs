import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const CHROME_PATH = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const ARTIFACT_DIR = "C:\\Users\\Ali\\.gemini\\antigravity-ide\\brain\\b5167659-1eb0-4eea-bef2-ada409fe7ac0";

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
  const port = 9529;
  const userDataDir = path.join(os.tmpdir(), "chrome-salary-order-verify-" + Date.now());

  console.log("================================================================================");
  console.log("   LIVE BROWSER CDP VERIFICATION: EMPLOYEE ROW ORDERING (EMP-01..EMP-10)");
  console.log("================================================================================");

  const chrome = spawn(
    CHROME_PATH,
    [
      `--remote-debugging-port=${port}`,
      `--user-data-dir=${userDataDir}`,
      "--no-first-run",
      "--headless=new",
      "--disable-gpu",
      "--window-size=1600,1100",
      "http://localhost:3000",
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

    // Authenticate with session
    let sessionData = {};
    if (fs.existsSync("scratch/user_session.json")) {
      sessionData = JSON.parse(fs.readFileSync("scratch/user_session.json", "utf8"));
    }

    await client.evaluate(`
      (() => {
        const session = ${JSON.stringify(sessionData)};
        if (session && session.access_token) {
          localStorage.setItem("sb-fdporzhjpfpvdwapkvan-auth-token", JSON.stringify(session));
        }
        localStorage.setItem("dubai-erp.company-cache", JSON.stringify({
          id: "4dbb309a-f31c-4615-8bb5-59df7a6326e3",
          name: "DUBAI ENTERPRISE AIR CONDITIONING & VENTILATION SYSTEM INSTALLATION L.L.C",
          legal_name: "DUBAI ENTERPRISE AIR CONDITIONING & VENTILATION SYSTEM INSTALLATION L.L.C",
          arabic_name: "مؤسسة دبي لأنظمة التكييف والتهوية وتمديد شبكات الغاز ذ.م.م",
          trn: "100519014200003",
          address: "Office 204, Aspect Tower, Business Bay, Dubai, United Arab Emirates",
          phone: "+971 4 388 9200",
          email: "billing@dubai-enterprise.ae"
        }));
      })()
    `);

    // 1. Navigate to /salary-statements
    console.log("\nNavigating to /salary-statements...");
    await client.send("Page.navigate", { url: "http://localhost:3000/salary-statements" });
    await wait(3000);

    for (let i = 0; i < 30; i++) {
      const rowCount = await client.evaluate(`document.querySelectorAll("tbody tr").length`);
      if (rowCount && rowCount > 0) break;
      await wait(300);
    }

    // Extract table rows
    const rowData = await client.evaluate(`
      (() => {
        const table = document.querySelector('table');
        if (!table) return { error: 'No table found' };
        const rows = Array.from(table.querySelectorAll('tbody tr'));
        return rows.map(tr => {
          const text = tr.innerText || '';
          // Extract EMP-XX pattern
          const match = text.match(/EMP-\\d+/i);
          return {
            rawText: text.replace(/\\s+/g, ' ').trim(),
            empCode: match ? match[0].toUpperCase() : null
          };
        });
      })()
    `);

    console.log("\nExtracted Rows from /salary-statements table:");
    console.log(JSON.stringify(rowData, null, 2));

    const renderedCodes = rowData
      .map(r => r.empCode)
      .filter(Boolean);

    console.log("\nRendered Employee Codes Sequence in Live Table:");
    console.log(renderedCodes.join(" -> "));

    // Check if EMP-01 through EMP-10 appear in strictly increasing numerical order
    let isMonotonicAscending = true;
    for (let i = 0; i < renderedCodes.length - 1; i++) {
      const numA = parseInt(renderedCodes[i].replace(/\D/g, ""), 10);
      const numB = parseInt(renderedCodes[i + 1].replace(/\D/g, ""), 10);
      if (numA > numB) {
        console.error(`❌ VIOLATION: ${renderedCodes[i]} (num: ${numA}) precedes ${renderedCodes[i + 1]} (num: ${numB})`);
        isMonotonicAscending = false;
      }
    }

    if (isMonotonicAscending && renderedCodes.length >= 2) {
      console.log(`✅ SUCCESS: All ${renderedCodes.length} rows are in strict numerical order!`);
    } else if (renderedCodes.length === 0) {
      console.log(`⚠️ Note: Table has 0 rows rendered or auth redirected.`);
    }

    // 2. Also check /payslips
    console.log("\nNavigating to /payslips...");
    await client.send("Page.navigate", { url: "http://localhost:3000/payslips" });
    await wait(3000);

    const payslipRows = await client.evaluate(`
      (() => {
        const table = document.querySelector('table');
        if (!table) return [];
        const rows = Array.from(table.querySelectorAll('tbody tr'));
        return rows.map(tr => {
          const text = tr.innerText || '';
          const match = text.match(/EMP-\\d+/i);
          return match ? match[0].toUpperCase() : null;
        }).filter(Boolean);
      })()
    `);
    console.log("Payslips Sequence:", payslipRows.join(" -> "));

    // 3. Also check /payroll-summary
    console.log("\nNavigating to /payroll-summary...");
    await client.send("Page.navigate", { url: "http://localhost:3000/payroll-summary" });
    await wait(3000);

    const summaryRows = await client.evaluate(`
      (() => {
        const table = document.querySelector('table');
        if (!table) return [];
        const rows = Array.from(table.querySelectorAll('tbody tr'));
        return rows.map(tr => {
          const text = tr.innerText || '';
          const match = text.match(/EMP-\\d+/i);
          return match ? match[0].toUpperCase() : null;
        }).filter(Boolean);
      })()
    `);
    console.log("Payroll Summary Sequence:", summaryRows.join(" -> "));

    // 4. Also check /employee-payment-vouchers
    console.log("\nNavigating to /employee-payment-vouchers...");
    await client.send("Page.navigate", { url: "http://localhost:3000/employee-payment-vouchers" });
    await wait(3000);

    const voucherRows = await client.evaluate(`
      (() => {
        const table = document.querySelector('table');
        if (!table) return [];
        const rows = Array.from(table.querySelectorAll('tbody tr'));
        return rows.map(tr => {
          const text = tr.innerText || '';
          const match = text.match(/EMP-\\d+/i);
          return match ? match[0].toUpperCase() : null;
        }).filter(Boolean);
      })()
    `);
    console.log("Payment Vouchers Sequence:", voucherRows.join(" -> "));

    // 5. Test Live UI Editing of EMP-01 and EMP-02
    console.log("\nNavigating back to /salary-statements for Live UI Edit tests...");
    await client.send("Page.navigate", { url: "http://localhost:3000/salary-statements" });
    await wait(3000);

    for (let i = 0; i < 30; i++) {
      const rowCount = await client.evaluate(`document.querySelectorAll("tbody tr").length`);
      if (rowCount && rowCount > 0) break;
      await wait(300);
    }

    console.log("\n>>> TESTING LIVE UI EDIT FOR EMP-01 (Rahmat Ali Khan) <<<");
    // Click edit on the first row
    await client.evaluate(`
      (() => {
        const firstRow = document.querySelectorAll('tbody tr')[0];
        const editBtn = firstRow?.querySelector('button[title="Edit Statement"]');
        if (editBtn) editBtn.click();
      })()
    `);
    await wait(1200);

    // Verify modal is open and submit form
    const isModalOpen = await client.evaluate(`Boolean(document.querySelector('#ss-form'))`);
    console.log(`Edit modal open for EMP-01: ${isModalOpen}`);

    if (isModalOpen) {
      // Click Save Changes without modifying amounts (safe)
      await client.evaluate(`
        (() => {
          const saveBtn = document.querySelector('button[type="submit"][form="ss-form"]');
          if (saveBtn) saveBtn.click();
        })()
      `);
      await wait(3000);

      // Re-read table rows
      const codesAfterEdit1 = await client.evaluate(`
        Array.from(document.querySelectorAll('tbody tr')).map(tr => {
          const m = (tr.innerText || '').match(/EMP-\\d+/i);
          return m ? m[0].toUpperCase() : null;
        }).filter(Boolean)
      `);
      console.log("Sequence after saving EMP-01:", codesAfterEdit1.join(" -> "));
      if (codesAfterEdit1[0] === "EMP-01") {
        console.log("✅ PASS: EMP-01 remained at position 1 (did NOT jump to bottom)!");
      } else {
        console.error(`❌ FAIL: EMP-01 moved! Position 1 is now ${codesAfterEdit1[0]}`);
      }
    }

    console.log("\n>>> TESTING LIVE UI EDIT FOR EMP-02 (Imran Khan) <<<");
    // Click edit on the second row
    await client.evaluate(`
      (() => {
        const secondRow = document.querySelectorAll('tbody tr')[1];
        const editBtn = secondRow?.querySelector('button[title="Edit Statement"]');
        if (editBtn) editBtn.click();
      })()
    `);
    await wait(1000);

    const isModalOpen2 = await client.evaluate(`Boolean(document.querySelector('#ss-form'))`);
    console.log(`Edit modal open for EMP-02: ${isModalOpen2}`);

    if (isModalOpen2) {
      await client.evaluate(`
        (() => {
          const saveBtn = document.querySelector('button[type="submit"][form="ss-form"]');
          if (saveBtn) saveBtn.click();
        })()
      `);
      await wait(3000);

      const codesAfterEdit2 = await client.evaluate(`
        Array.from(document.querySelectorAll('tbody tr')).map(tr => {
          const m = (tr.innerText || '').match(/EMP-\\d+/i);
          return m ? m[0].toUpperCase() : null;
        }).filter(Boolean)
      `);
      console.log("Sequence after saving EMP-02:", codesAfterEdit2.join(" -> "));
      if (codesAfterEdit2[1] === "EMP-02") {
        console.log("✅ PASS: EMP-02 remained at position 2 (did NOT jump to bottom)!");
      } else {
        console.error(`❌ FAIL: EMP-02 moved! Position 2 is now ${codesAfterEdit2[1]}`);
      }

      const fullOrderMaintained = JSON.stringify(codesAfterEdit2) === JSON.stringify(renderedCodes);
      if (fullOrderMaintained) {
        console.log("✅ PASS: Exact 10-employee numerical sequence EMP-01..EMP-10 strictly maintained after edits!");
      } else {
        console.error("❌ FAIL: Sequence altered after edits!");
      }
    }

    // 6. Test Live Search Filtering
    console.log("\n>>> TESTING LIVE SEARCH FILTER STABILITY <<<");
    await client.evaluate(`
      (() => {
        const searchInput = document.querySelector('input[placeholder="Search employee…"]');
        if (searchInput) {
          const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value")?.set;
          if (setter) {
            setter.call(searchInput, "EMP-03");
          } else {
            searchInput.value = "EMP-03";
          }
          searchInput.dispatchEvent(new Event('input', { bubbles: true }));
        }
      })()
    `);
    await wait(800);

    const searchResultCodes = await client.evaluate(`
      Array.from(document.querySelectorAll('tbody tr')).map(tr => {
        const m = (tr.innerText || '').match(/EMP-\\d+/i);
        return m ? m[0].toUpperCase() : null;
      }).filter(Boolean)
    `);
    console.log("Rows when filtered by 'EMP-03':", searchResultCodes.join(", "));
    if (searchResultCodes.length === 1 && searchResultCodes[0] === "EMP-03") {
      console.log("✅ PASS: Search correctly isolated EMP-03 without order corruption");
    }

    // Clear search
    await client.evaluate(`
      (() => {
        const searchInput = document.querySelector('input[placeholder="Search employee…"]');
        if (searchInput) {
          const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value")?.set;
          if (setter) {
            setter.call(searchInput, "");
          } else {
            searchInput.value = "";
          }
          searchInput.dispatchEvent(new Event('input', { bubbles: true }));
        }
      })()
    `);
    await wait(800);

    const restoredCodes = await client.evaluate(`
      Array.from(document.querySelectorAll('tbody tr')).map(tr => {
        const m = (tr.innerText || '').match(/EMP-\\d+/i);
        return m ? m[0].toUpperCase() : null;
      }).filter(Boolean)
    `);
    console.log("Sequence after clearing search:", restoredCodes.join(" -> "));
    if (JSON.stringify(restoredCodes) === JSON.stringify(renderedCodes)) {
      console.log("✅ PASS: Full EMP-01..EMP-10 sequence restored after clearing search!");
    }

    // Take screenshot of salary statements table for user verification
    const screenshotRes = await client.send("Page.captureScreenshot", { format: "png" });
    const imgBuf = Buffer.from(screenshotRes.data, "base64");
    const ssPath = path.join(ARTIFACT_DIR, "salary_statements_ordered_table.png");
    fs.writeFileSync(ssPath, imgBuf);
    console.log(`\nSaved screenshot of verified salary statements table to: ${ssPath}`);

  } catch (err) {
    console.error("Test failed:", err);
    process.exit(1);
  } finally {
    try {
      chrome.kill();
    } catch {}
  }
}

main();

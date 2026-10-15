import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const CHROME_PATH = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const OUT_DIR = path.join(process.cwd(), "test-output");
const BRAIN_DIR = "C:\\Users\\dines\\.gemini\\antigravity-ide\\brain\\5b8a2ff5-9cc6-40d0-8c35-2f6ef2906c11";

if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });
if (!fs.existsSync(BRAIN_DIR)) fs.mkdirSync(BRAIN_DIR, { recursive: true });

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
  const port = 9444;
  // Use os.tmpdir() so Turbopack does NOT watch it
  const userDataDir = path.join(os.tmpdir(), "chrome-audit-attendance");

  console.log("=== LAUNCHING CHROME HEADLESS FOR ATTENDANCE AUDIT ===");
  const chrome = spawn(
    CHROME_PATH,
    [
      `--remote-debugging-port=${port}`,
      `--user-data-dir=${userDataDir}`,
      "--no-first-run",
      "--no-default-browser-check",
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

    console.log("Navigating to http://localhost:3000/attendance ...");
    await client.send("Page.navigate", { url: "http://localhost:3000/attendance" });
    await wait(2000);

    // Inject user session into localStorage and window
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
          arabic_name: "الصفوه الذهبيه لصناعه الخيام ذ.م.م.ش.ش.و",
          trn: "100234567800003",
          address: "Al Quoz Industrial Area 3, Dubai, United Arab Emirates"
        }));
      })()
    `);

    // Reload with authenticated localStorage
    console.log("Reloading with authenticated session...");
    await client.send("Page.navigate", { url: "http://localhost:3000/attendance" });
    await wait(4000);

    // Wait until workbook finishes loading employees
    console.log("Waiting for employees to load from database...");
    for (let i = 0; i < 30; i++) {
      const rowCount = await client.evaluate(`document.querySelectorAll("tbody tr").length`);
      if (rowCount && rowCount > 0) {
        console.log(`✓ Loaded ${rowCount} employee rows in workbook.`);
        break;
      }
      await wait(500);
    }

    // Wait until workbook or buttons are rendered
    const statusInfo = await client.evaluate(`
      (() => {
        const title = document.querySelector("h1")?.textContent || "";
        const buttons = Array.from(document.querySelectorAll("button")).map(b => b.textContent.trim());
        const rows = document.querySelectorAll("tbody tr").length;
        return { title, buttonsCount: buttons.length, buttons: buttons.slice(0, 10), rows };
      })()
    `);
    console.log("Page state:", statusInfo);

    // Click "Print Sheet" or dispatch open-attendance-print
    console.log("Opening Print Sheet modal...");
    const clickRes = await client.evaluate(`
      (() => {
        const buttons = Array.from(document.querySelectorAll("button"));
        const printBtn = buttons.find(b => b.textContent.includes("Print Sheet"));
        if (printBtn) {
          printBtn.click();
          return { clicked: "button", text: printBtn.textContent };
        }
        window.dispatchEvent(new CustomEvent("open-attendance-print"));
        return { clicked: "event" };
      })()
    `);
    console.log("Print Sheet open result:", clickRes);
    await wait(2500);

    // Capture screen screenshot of modal preview
    const modalScreenRes = await client.send("Page.captureScreenshot", { format: "png" });
    const modalBuf = Buffer.from(modalScreenRes.data, "base64");
    fs.writeFileSync(path.join(OUT_DIR, "live_attendance_modal_preview.png"), modalBuf);
    fs.writeFileSync(path.join(BRAIN_DIR, "live_attendance_modal_preview.png"), modalBuf);
    console.log("✓ Saved live_attendance_modal_preview.png");

    // Inspect DOM elements and dark backgrounds before print emulation
    const domInspection = await client.evaluate(`
      (() => {
        const results = [];
        const all = Array.from(document.querySelectorAll("*"));
        for (const el of all) {
          const style = window.getComputedStyle(el);
          const bg = style.backgroundColor;
          const rect = el.getBoundingClientRect();
          if (bg && (bg.includes("rgb(15, 23, 42)") || bg.includes("rgb(2, 6, 23)") || bg.includes("rgb(11, 15, 25)"))) {
            results.push({
              tag: el.tagName,
              id: el.id,
              classes: typeof el.className === "string" ? el.className.substring(0, 60) : "",
              bg: bg,
              rect: { top: rect.top, left: rect.left, width: rect.width, height: rect.height }
            });
          }
        }
        return results;
      })()
    `);
    console.log("Dark background elements on screen:", domInspection.length);

    // EMULATE PRINT MEDIA
    console.log("\n--- Emulating print media ---");
    await client.send("Emulation.setEmulatedMedia", { media: "print" });
    await wait(1000);

    // Inspect DOM under print emulation
    const printInspection = await client.evaluate(`
      (() => {
        const results = [];
        const all = Array.from(document.querySelectorAll("*"));
        for (const el of all) {
          const style = window.getComputedStyle(el);
          const bg = style.backgroundColor;
          const rect = el.getBoundingClientRect();
          if (bg && (bg.includes("rgb(15, 23, 42)") || bg.includes("rgb(2, 6, 23)") || bg.includes("rgb(11, 15, 25)") || bg.includes("15, 23, 42"))) {
            results.push({
              tag: el.tagName,
              id: el.id,
              classes: typeof el.className === "string" ? el.className.substring(0, 80) : "",
              bg: bg,
              display: style.display,
              visibility: style.visibility,
              rect: { top: rect.top, left: rect.left, width: rect.width, height: rect.height }
            });
          }
        }
        const sheet = document.querySelector(".print-attendance-sheet");
        const sheetRect = sheet ? sheet.getBoundingClientRect() : null;
        const tableRows = document.querySelectorAll(".print-attendance-sheet tbody tr").length;
        const rootStyles = {
          html: window.getComputedStyle(document.documentElement).backgroundColor,
          body: window.getComputedStyle(document.body).backgroundColor,
        };

        // Find any element whose bottom is > 793px (210mm at 96 DPI) or causes page breaks
        const overflowElements = [];
        for (const el of all) {
          const s = window.getComputedStyle(el);
          if (s.display !== "none" && s.visibility !== "hidden") {
            const rect = el.getBoundingClientRect();
            if (rect.height > 0 && rect.bottom > 790) {
              overflowElements.push({
                tag: el.tagName,
                cls: typeof el.className === "string" ? el.className.substring(0, 50) : "",
                top: rect.top,
                bottom: rect.bottom,
                h: rect.height,
                text: el.textContent ? el.textContent.trim().substring(0, 40) : ""
              });
            }
          }
        }

        const sheetEl = document.querySelector(".print-attendance-sheet");
        const ancestors = [];
        let cur = sheetEl;
        while (cur && cur !== document.body) {
          const s = window.getComputedStyle(cur);
          const r = cur.getBoundingClientRect();
          ancestors.push({
            tag: cur.tagName,
            cls: typeof cur.className === "string" ? cur.className.substring(0, 40) : "",
            top: r.top,
            h: r.height,
            marginTop: s.marginTop,
            paddingTop: s.paddingTop,
            position: s.position,
            display: s.display,
          });
          cur = cur.parentElement;
        }
        const dialogEl = document.querySelector(".print-sheet-modal-dialog");
        const dialogChildren = [];
        if (dialogEl) {
          for (const ch of dialogEl.children) {
            const s = window.getComputedStyle(ch);
            const r = ch.getBoundingClientRect();
            dialogChildren.push({
              tag: ch.tagName,
              cls: typeof ch.className === "string" ? ch.className.substring(0, 40) : "",
              top: r.top,
              h: r.height,
              display: s.display,
              visibility: s.visibility,
            });
          }
        }

        return {
          darkElementsCount: results.length,
          darkElements: results.slice(0, 10),
          sheetRect: sheetRect ? { w: sheetRect.width, h: sheetRect.height } : null,
          tableRows,
          rootStyles,
          overflowCount: overflowElements.length,
          overflowElements: overflowElements.slice(0, 10),
          ancestors,
          dialogChildren,
        };
      })()
    `);

    console.log("\nPrint media DOM results:");
    console.log("  Dialog children:");
    printInspection.dialogChildren?.forEach(c => console.log("    CHILD:", c.tag, c.cls, `top=${c.top.toFixed(1)}, h=${c.h.toFixed(1)}, disp=${c.display}, vis=${c.visibility}`));
    console.log("  Ancestor chain from sheet up to body:");
    printInspection.ancestors?.forEach(a => console.log("    ANCESTOR:", a.tag, a.cls, `top=${a.top.toFixed(1)}, h=${a.h.toFixed(1)}, pos=${a.position}, disp=${a.display}, mt=${a.marginTop}, pt=${a.paddingTop}`));
    console.log("  Dark elements during print:", printInspection.darkElementsCount);
    if (printInspection.darkElements.length > 0) {
      printInspection.darkElements.forEach(d => console.log("    DARK:", d.tag, d.id, d.classes, d.bg));
    }
    console.log("  Sheet dimensions:", printInspection.sheetRect);
    console.log("  Attendance Table Rows:", printInspection.tableRows);
    console.log("  Root backgrounds:", printInspection.rootStyles);
    console.log("  Overflowing elements count (>790px):", printInspection.overflowCount);
    if (printInspection.overflowElements?.length > 0) {
      printInspection.overflowElements.forEach(o => console.log("    OVERFLOW:", o.tag, o.cls, `top=${o.top.toFixed(1)}, bottom=${o.bottom.toFixed(1)}, h=${o.h.toFixed(1)}`, `text='${o.text}'`));
    }

    // Capture screenshot under print emulation
    const printScreenRes = await client.send("Page.captureScreenshot", { format: "png" });
    const printScreenBuf = Buffer.from(printScreenRes.data, "base64");
    fs.writeFileSync(path.join(OUT_DIR, "attendance_sheet_corrected.png"), printScreenBuf);
    fs.writeFileSync(path.join(BRAIN_DIR, "attendance_sheet_corrected.png"), printScreenBuf);
    console.log("✓ Saved attendance_sheet_corrected.png (print emulated view)");

    // Audit column 1 and column 2 clearances and text separation
    const columnAudit = await client.evaluate(`
      (() => {
        const rows = Array.from(document.querySelectorAll(".print-attendance-sheet tbody tr"));
        const results = [];
        for (const r of rows) {
          const cells = r.querySelectorAll("td");
          if (cells.length >= 2) {
            const empCodeCell = cells[0];
            const nameCell = cells[1];
            const codeRect = empCodeCell.getBoundingClientRect();
            const nameRect = nameCell.getBoundingClientRect();
            const codeText = empCodeCell.textContent.trim();
            const nameText = nameCell.textContent.trim();
            const gap = nameRect.left - codeRect.right;
            results.push({
              code: codeText,
              name: nameText,
              codeWidth: codeRect.width,
              nameWidth: nameRect.width,
              gapBetween: gap,
              rowHeight: codeRect.height,
              touching: (codeRect.right > nameRect.left) || (codeText + nameText).includes(codeText + nameText),
            });
          }
        }
        return results;
      })()
    `);

    console.log("\n--- Column Clearance & Row Height Audit (First 5 Rows) ---");
    columnAudit.slice(0, 5).forEach((row, i) => {
      console.log(`  Row ${i + 1}: Code='${row.code}' (w=${row.codeWidth.toFixed(1)}px) | Name='${row.name}' (w=${row.nameWidth.toFixed(1)}px) | Gap=${row.gapBetween.toFixed(1)}px | Height=${row.rowHeight.toFixed(1)}px`);
    });

    // GENERATE ACTUAL PDF VIA Page.printToPDF with Zero Margins
    console.log("\nGenerating real Print-to-PDF with size A4 landscape and zero margins...");
    const pdfRes = await client.send("Page.printToPDF", {
      landscape: true,
      displayHeaderFooter: false,
      printBackground: true,
      paperWidth: 11.6929, // 297mm in inches
      paperHeight: 8.2677, // 210mm in inches
      marginTop: 0,
      marginBottom: 0,
      marginLeft: 0,
      marginRight: 0,
      preferCSSPageSize: true,
    });

    const pdfBuf = Buffer.from(pdfRes.data, "base64");
    const pdfOutPath = path.join(OUT_DIR, "live_attendance_chrome_print.pdf");
    fs.writeFileSync(pdfOutPath, pdfBuf);
    fs.writeFileSync(path.join(BRAIN_DIR, "live_attendance_chrome_print.pdf"), pdfBuf);
    fs.writeFileSync(path.join(BRAIN_DIR, "attendance_sheet_corrected.pdf"), pdfBuf);
    console.log(`✓ Saved live_attendance_chrome_print.pdf & attendance_sheet_corrected.pdf (${pdfBuf.length} bytes)`);

    // Count pages in generated PDF
    const pdfText = pdfBuf.toString("latin1");
    const pageMatches = pdfText.match(/\/Type\s*\/Page\b/g);
    const pageCount = pageMatches ? pageMatches.length : 1;
    console.log(`Live Chrome PDF Page Count: ${pageCount} Page(s)`);

    // Switch back to screen media
    await client.send("Emulation.setEmulatedMedia", { media: "" });

    // Now test 30-day month (November)
    console.log("\n--- Testing 30-day Month (November 2026) ---");
    const novTestRes = await client.evaluate(`
      (() => {
        // Change select month to November (11) if available
        const selects = Array.from(document.querySelectorAll("select"));
        const monthSelect = selects.find(s => Array.from(s.options).some(o => o.text.includes("November") || o.value === "11"));
        if (monthSelect) {
          monthSelect.value = "11";
          monthSelect.dispatchEvent(new Event("change", { bubbles: true }));
          return { success: true, month: "November" };
        }
        return { success: false };
      })()
    `);
    console.log("November switch result:", novTestRes);
    await wait(1500);

    // Audit days count
    const daysCount = await client.evaluate(`document.querySelectorAll(".print-attendance-sheet thead tr:first-child th").length`);
    console.log("Total columns in attendance table:", daysCount);

  } finally {
    chrome.kill();
  }
}

main().catch(console.error);

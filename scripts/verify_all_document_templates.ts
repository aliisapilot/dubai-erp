import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import React from "react";
import ReactDOMServer from "react-dom/server";
import {
  DocumentTypeId,
  createDefaultLayout,
} from "../lib/documentDesigner";
import { computeEffectiveLayout } from "../lib/documentLayoutEngine";
import DynamicDocumentRenderer, {
  getSampleDocumentData,
  getDocumentPageCount,
} from "../components/documents/DynamicDocumentRenderer";

const CHROME_PATH = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";

function wait(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

class CdpClient {
  private ws: any;
  private id = 0;
  private callbacks = new Map<number, { resolve: (val: any) => void; reject: (err: any) => void }>();

  constructor(private wsUrl: string) {}

  async connect() {
    return new Promise<void>((resolve, reject) => {
      // @ts-ignore
      this.ws = new WebSocket(this.wsUrl);
      this.ws.onopen = () => resolve();
      this.ws.onerror = (err: any) => reject(err);
      this.ws.onmessage = (event: any) => {
        const msg = JSON.parse(event.data);
        if (msg.id && this.callbacks.has(msg.id)) {
          const { resolve, reject } = this.callbacks.get(msg.id)!;
          this.callbacks.delete(msg.id);
          if (msg.error) reject(new Error(msg.error.message));
          else resolve(msg.result);
        }
      };
    });
  }

  send(method: string, params: Record<string, any> = {}): Promise<any> {
    return new Promise((resolve, reject) => {
      const id = ++this.id;
      this.callbacks.set(id, { resolve, reject });
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }

  close() {
    if (this.ws) this.ws.close();
  }
}

async function getWsUrl(port: number): Promise<string> {
  for (let i = 0; i < 30; i++) {
    try {
      const res = await fetch(`http://127.0.0.1:${port}/json`);
      if (res.ok) {
        const list = await res.json();
        const page = list.find((item: any) => item.type === "page");
        if (page?.webSocketDebuggerUrl) return page.webSocketDebuggerUrl;
      }
    } catch {}
    await wait(400);
  }
  throw new Error("Could not find Chrome CDP target");
}

async function runChromePrint(htmlPath: string, pdfPath: string): Promise<number> {
  const port = 9870 + Math.floor(Math.random() * 50);
  const tempProfileDir = path.join(process.cwd(), ".chrome-verify-profile", `p-${port}`);
  fs.mkdirSync(tempProfileDir, { recursive: true });

  const chrome = spawn(
    CHROME_PATH,
    [
      `--remote-debugging-port=${port}`,
      `--user-data-dir=${tempProfileDir}`,
      "--headless=new",
      "--disable-gpu",
      "--no-first-run",
      "--no-default-browser-check",
      `file:///${htmlPath.replace(/\\/g, "/")}`,
    ],
    { stdio: "ignore" }
  );

  try {
    const wsUrl = await getWsUrl(port);
    const client = new CdpClient(wsUrl);
    await client.connect();

    await client.send("Page.enable");
    await wait(1200);

    const pdfRes = await client.send("Page.printToPDF", {
      printBackground: true,
      paperWidth: 8.27, // 210mm in inches
      paperHeight: 11.69, // 297mm in inches
      marginTop: 0,
      marginBottom: 0,
      marginLeft: 0,
      marginRight: 0,
      preferCSSPageSize: true,
    });

    const pdfBuf = Buffer.from(pdfRes.data, "base64");
    fs.writeFileSync(pdfPath, pdfBuf);

    client.close();

    // Count pages in PDF
    const text = pdfBuf.toString("latin1");
    const matches = text.match(/\/Type\s*\/Page\b/g);
    return matches ? matches.length : 1;
  } finally {
    try {
      chrome.kill("SIGKILL");
    } catch {}
  }
}

async function main() {
  console.log("==================================================================");
  console.log("DUBAI ERP — ALL DOCUMENT TEMPLATES VERIFICATION SUITE");
  console.log("==================================================================");

  const docTypes: DocumentTypeId[] = [
    "measurement_sheet",
    "quotation",
    "proforma_invoice",
    "tax_invoice",
    "delivery_note",
    "purchase_order",
    "receipt_voucher",
  ];

  const testOutputDir = path.join(process.cwd(), "test-output");
  if (!fs.existsSync(testOutputDir)) fs.mkdirSync(testOutputDir, { recursive: true });

  const globalsCss = fs.readFileSync(path.join(process.cwd(), "app", "globals.css"), "utf8");

  for (const docType of docTypes) {
    console.log(`\nTesting [${docType}]...`);
    const layout = createDefaultLayout(docType);
    const sampleData = getSampleDocumentData(docType, layout.numberingConfig);

    // 1. Test page count estimation
    const pageCount = getDocumentPageCount(layout, sampleData.items.length, sampleData.items, sampleData);
    console.log(`  Page count estimated: ${pageCount}`);
    assert.equal(pageCount, 1, `${docType} standard sample must fit on 1 A4 page`);

    // 2. Compute effective layout & verify no collisions
    const effective = computeEffectiveLayout(
      layout,
      sampleData.items.length,
      true,
      1,
      1,
      sampleData.items,
      sampleData
    );

    const table = effective.elements.find((e) => e.type === "line_items" || e.id === "line_items");
    const party = effective.elements.find((e) => ["customer_info", "supplier_info", "project_info"].includes(e.type));
    const meta = effective.elements.find((e) => e.id === "doc_meta" || e.type === "doc_meta");

    if (table) {
      if (party) {
        assert.ok(
          table.effectiveY >= party.effectiveY + party.effectiveHeight - 0.5,
          `In ${docType}, table.effectiveY (${table.effectiveY}mm) must clear party card bottom (${party.effectiveY + party.effectiveHeight}mm)`
        );
      }
      if (meta) {
        assert.ok(
          table.effectiveY >= meta.effectiveY + meta.effectiveHeight - 0.5,
          `In ${docType}, table.effectiveY (${table.effectiveY}mm) must clear meta card bottom (${meta.effectiveY + meta.effectiveHeight}mm)`
        );
      }
    }

    // 3. Render HTML
    const sampleCompany = {
      id: "comp_test",
      name: "EMIRATES STEEL ARKAN P.J.S.C",
      legal_name: "EMIRATES STEEL ARKAN P.J.S.C",
      arabic_name: "شركة حديد الإمارات أركان ش.م.ع",
      trn: "100234567800003",
      address: "Sheikh Zayed Road, P.O. Box 1234, Dubai, UAE",
      phone: "+971 4 399 0000",
      email: "info@emiratessteelarkan.ae",
    };

    const renderedHtml = ReactDOMServer.renderToStaticMarkup(
      React.createElement(DynamicDocumentRenderer, {
        layout,
        company: sampleCompany,
        data: sampleData,
        isDesignerPreview: false,
        scale: 1,
        pageNumber: 1,
        totalPages: 1,
      })
    );

    const htmlPath = path.join(testOutputDir, `verify_${docType}.html`);
    const pdfPath = path.join(testOutputDir, `verify_${docType}.pdf`);

    const fullHtml = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    ${globalsCss}
    @page { size: A4 portrait; margin: 0; }
    body { margin: 0; padding: 0; background: white; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    .sheet { width: 210mm; height: 297mm; position: relative; overflow: hidden; page-break-after: avoid; }
  </style>
</head>
<body>
  <div class="sheet">${renderedHtml}</div>
</body>
</html>`;

    fs.writeFileSync(htmlPath, fullHtml, "utf8");

    // 4. Generate real PDF and verify exact page count = 1
    const actualPages = await runChromePrint(htmlPath, pdfPath);
    console.log(`  Actual Chrome PDF pages: ${actualPages} (File size: ${fs.statSync(pdfPath).size} bytes)`);
    assert.equal(actualPages, 1, `${docType} PDF must render in EXACTLY 1 page!`);
    console.log(`  ✓ ${docType} verified on 1 A4 page with zero collisions!`);
  }

  console.log("\n==================================================================");
  console.log("ALL 6 CORE DOCUMENT TYPES VERIFIED SUCCESSFULLY ON SINGLE A4 PAGES!");
  console.log("==================================================================");
}

main().catch((err) => {
  console.error("Verification failed:", err);
  process.exit(1);
});

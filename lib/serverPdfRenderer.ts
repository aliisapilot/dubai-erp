/**
 * Dubai ERP: Authoritative Server-Side Headless Chromium A4 PDF Renderer
 * =====================================================================
 * Renders the exact desktop document templates at fixed desktop dimensions (1280px, A4)
 * with embedded English (Inter) and Arabic (Noto Sans Arabic) WOFF2 fonts and local
 * assets so generated PDFs are bit-consistent vector PDFs across PC, iPhone, Android,
 * and Linux Vercel Serverless containers.
 */

import fs from "node:fs";
import path from "node:path";
import chromium from "@sparticuz/chromium";
import puppeteer, { type Browser } from "puppeteer-core";

export interface ServerPdfRenderInput {
  sheetsHtml: string[];
  cssText?: string;
  assets?: Record<string, string>;
  landscape?: boolean;
  title?: string;
}

const MIME_BY_EXT: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".gif": "image/gif",
  ".svg": "image/svg+xml",
  ".woff2": "font/woff2",
};

let cachedFontCss: string | null = null;
let sharedBrowser: Browser | null = null;
let launchingBrowser: Promise<Browser> | null = null;

function readBase64DataUrl(absPath: string): string | null {
  try {
    if (!fs.existsSync(/*turbopackIgnore: true*/ absPath)) return null;
    const ext = path.extname(absPath).toLowerCase();
    const mime = MIME_BY_EXT[ext] || "application/octet-stream";
    const buf = fs.readFileSync(/*turbopackIgnore: true*/ absPath);
    return `data:${mime};base64,${buf.toString("base64")}`;
  } catch {
    return null;
  }
}

/**
 * Loads bundled English & Arabic WOFF2 fonts once into `@font-face` CSS so Linux serverless
 * containers never fall back to missing glyphs or corrupted line metrics.
 */
function getBundledFontFaceCss(): string {
  if (cachedFontCss !== null) return cachedFontCss;

  const fontEntries = [
    {
      family: "Inter",
      weight: 400,
      file: "node_modules/@fontsource/inter/files/inter-latin-400-normal.woff2",
    },
    {
      family: "Inter",
      weight: 500,
      file: "node_modules/@fontsource/inter/files/inter-latin-500-normal.woff2",
    },
    {
      family: "Inter",
      weight: 600,
      file: "node_modules/@fontsource/inter/files/inter-latin-600-normal.woff2",
    },
    {
      family: "Inter",
      weight: 700,
      file: "node_modules/@fontsource/inter/files/inter-latin-700-normal.woff2",
    },
    {
      family: "Noto Sans Arabic",
      weight: 400,
      file: "node_modules/@fontsource/noto-sans-arabic/files/noto-sans-arabic-arabic-400-normal.woff2",
    },
    {
      family: "Noto Sans Arabic",
      weight: 700,
      file: "node_modules/@fontsource/noto-sans-arabic/files/noto-sans-arabic-arabic-700-normal.woff2",
    },
  ];

  const rules: string[] = [];
  for (const f of fontEntries) {
    const dataUrl = readBase64DataUrl(path.join(/*turbopackIgnore: true*/ process.cwd(), f.file));
    if (dataUrl) {
      rules.push(`
@font-face {
  font-family: '${f.family}';
  font-style: normal;
  font-weight: ${f.weight};
  font-display: block;
  src: url('${dataUrl}') format('woff2');
}`);
    }
  }

  // On headless Linux without Microsoft system fonts, alias Windows Arabic names cleanly to Noto Sans Arabic
  if (process.platform === "linux") {
    const ar400 = readBase64DataUrl(
      path.join(process.cwd(), "node_modules/@fontsource/noto-sans-arabic/files/noto-sans-arabic-arabic-400-normal.woff2")
    );
    const ar700 = readBase64DataUrl(
      path.join(process.cwd(), "node_modules/@fontsource/noto-sans-arabic/files/noto-sans-arabic-arabic-700-normal.woff2")
    );
    for (const alias of ["Segoe UI Arabic", "Amiri", "Traditional Arabic", "Noto Naskh Arabic"]) {
      if (ar400) {
        rules.push(`@font-face { font-family: '${alias}'; font-weight: 400; src: url('${ar400}') format('woff2'); }`);
      }
      if (ar700) {
        rules.push(`@font-face { font-family: '${alias}'; font-weight: 700; src: url('${ar700}') format('woff2'); }`);
      }
    }
  }

  cachedFontCss = rules.join("\n");
  return cachedFontCss;
}

/**
 * Resolves a safe local `public/` image asset (e.g. `/logo.png`, `/company-assets/...`) into a data URL.
 */
function resolvePublicAssetDataUrl(srcPath: string): string | null {
  try {
    const cleanRel = decodeURIComponent(srcPath.split("?")[0]).replace(/^\/+/, "");
    if (!cleanRel || cleanRel.includes("..")) return null;
    const publicDir = path.resolve(/*turbopackIgnore: true*/ process.cwd(), "public");
    const absTarget = path.resolve(/*turbopackIgnore: true*/ publicDir, cleanRel);
    if (!absTarget.startsWith(publicDir + path.sep)) return null;
    return readBase64DataUrl(absTarget);
  } catch {
    return null;
  }
}

/**
 * Sanitizes incoming HTML sheet snippets and inline CSS to prevent script execution or SSRF.
 */
export function sanitizeDocumentHtmlForPdf(html: string): string {
  return html
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/<iframe\b[^>]*>[\s\S]*?<\/iframe>/gi, "")
    .replace(/<object\b[^>]*>[\s\S]*?<\/object>/gi, "")
    .replace(/<embed\b[^>]*>/gi, "")
    .replace(/\son[a-z]+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, "")
    .replace(/(href|src|xlink:href)\s*=\s*(["'])\s*(?:javascript|vbscript):[\s\S]*?\2/gi, '$1=""')
    .trim();
}

export function sanitizeCssForPdf(css: string): string {
  return css
    .replace(/<\/?style\b[^>]*>/gi, "")
    .replace(/expression\s*\(/gi, "invalid(")
    .replace(/@import\b[^;]+;/gi, "");
}

function hydrateSheetAssets(html: string, assets: Record<string, string>): string {
  let out = html;

  // Replace deduplicated __PDF_ASSET_n__ keys with validated data:image/... URIs
  out = out.replace(/__PDF_ASSET_[a-zA-Z0-9_-]+__/g, (token) => {
    const val = assets[token];
    if (typeof val === "string" && /^data:image\/(?:png|jpeg|jpg|webp|gif|svg\+xml);base64,/i.test(val)) {
      return val;
    }
    return "";
  });

  // Resolve any remaining root-relative `src="/..."` or `url('/...')` public image paths from disk
  out = out.replace(/(src|href)=(["'])(\/[^"'?#\s]+(?:\?[^"']*)?)\2/gi, (full, attr, quote, relUrl) => {
    if (relUrl.startsWith("/_next/") || relUrl.startsWith("/api/")) return full;
    const inlined = resolvePublicAssetDataUrl(relUrl);
    return inlined ? `${attr}=${quote}${inlined}${quote}` : full;
  });

  return out;
}

async function resolveChromiumLaunchOptions(): Promise<{
  executablePath: string;
  args: string[];
  headless: boolean | "shell";
}> {
  const customEnvPath = process.env.CHROME_EXECUTABLE_PATH;
  if (customEnvPath && fs.existsSync(/*turbopackIgnore: true*/ customEnvPath)) {
    return {
      executablePath: customEnvPath,
      args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage", "--font-render-hinting=none"],
      headless: true,
    };
  }

  if (process.platform === "linux") {
    const bundledBinDir = path.join(/*turbopackIgnore: true*/ process.cwd(), "node_modules/@sparticuz/chromium/bin");
    try {
      chromium.setGraphicsMode = false;
      const execPath = await chromium.executablePath(
        fs.existsSync(/*turbopackIgnore: true*/ bundledBinDir) ? bundledBinDir : undefined
      );
      if (execPath) {
        return {
          executablePath: execPath,
          args: [...chromium.args, "--font-render-hinting=none"],
          headless: "shell",
        };
      }
    } catch (err) {
      console.warn("[ServerPdf] @sparticuz/chromium resolution fallback:", err);
    }

    for (const candidate of ["/usr/bin/google-chrome", "/usr/bin/chromium", "/usr/bin/chromium-browser"]) {
      if (fs.existsSync(/*turbopackIgnore: true*/ candidate)) {
        return {
          executablePath: candidate,
          args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage", "--font-render-hinting=none"],
          headless: true,
        };
      }
    }
  } else if (process.platform === "win32") {
    const candidates = [
      "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
      "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
      "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
      "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
    ];
    for (const c of candidates) {
      if (fs.existsSync(/*turbopackIgnore: true*/ c)) {
        return {
          executablePath: c,
          args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage", "--font-render-hinting=none"],
          headless: true,
        };
      }
    }
  } else if (process.platform === "darwin") {
    const candidates = [
      "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
      "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
    ];
    for (const c of candidates) {
      if (fs.existsSync(/*turbopackIgnore: true*/ c)) {
        return {
          executablePath: c,
          args: ["--no-sandbox", "--font-render-hinting=none"],
          headless: true,
        };
      }
    }
  }

  throw new Error("No Chromium binary available for server-side PDF generation.");
}

async function getBrowser(): Promise<Browser> {
  if (sharedBrowser && sharedBrowser.connected) {
    return sharedBrowser;
  }
  if (launchingBrowser) {
    return launchingBrowser;
  }
  launchingBrowser = (async () => {
    const launchOpts = await resolveChromiumLaunchOptions();
    const browser = await puppeteer.launch({
      executablePath: launchOpts.executablePath,
      args: launchOpts.args,
      headless: launchOpts.headless,
      defaultViewport: { width: 1280, height: 1800, deviceScaleFactor: 2 },
    });
    browser.on("disconnected", () => {
      if (sharedBrowser === browser) sharedBrowser = null;
    });
    sharedBrowser = browser;
    return browser;
  })();

  try {
    return await launchingBrowser;
  } finally {
    launchingBrowser = null;
  }
}

export function buildPdfDocumentHtml(input: ServerPdfRenderInput): string {
  const landscape = Boolean(input.landscape);
  const assets = input.assets || {};
  const bundledFonts = getBundledFontFaceCss();
  const sanitizedCss = sanitizeCssForPdf(input.cssText || "");
  const cleanTitle = (input.title || "Dubai ERP Document").replace(/[<>&"]/g, "");

  const renderedSheets = input.sheetsHtml
    .map((rawHtml) => hydrateSheetAssets(sanitizeDocumentHtmlForPdf(rawHtml), assets))
    .filter((s) => s.length > 0)
    .map((sheetHtml, idx, arr) => {
      const isLast = idx === arr.length - 1;
      return `<div class="pdf-sheet-slot${isLast ? " pdf-sheet-last" : ""}">${sheetHtml}</div>`;
    })
    .join("\n");

  const pageSizeW = landscape ? "297mm" : "210mm";
  const pageSizeH = landscape ? "210mm" : "297mm";

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<title>${cleanTitle}</title>
<style>
${bundledFonts}
${sanitizedCss}

@page {
  size: A4 ${landscape ? "landscape" : "portrait"};
  margin: 0;
}

html,
body {
  margin: 0 !important;
  padding: 0 !important;
  width: ${pageSizeW} !important;
  background: #ffffff !important;
  background-color: #ffffff !important;
  color: #0f172a !important;
  font-family: 'Inter', Arial, Helvetica, 'Segoe UI', sans-serif;
  -webkit-print-color-adjust: exact !important;
  print-color-adjust: exact !important;
  -webkit-text-size-adjust: 100% !important;
}

.font-arabic,
[dir="rtl"] {
  font-family: 'Noto Sans Arabic', 'Segoe UI Arabic', 'Amiri', 'Traditional Arabic', Arial, sans-serif;
}

.pdf-sheet-slot {
  display: block !important;
  margin: 0 auto !important;
  padding: 0 !important;
  width: ${pageSizeW} !important;
  box-sizing: border-box !important;
  page-break-after: always !important;
  break-after: page !important;
}

.pdf-sheet-slot.pdf-sheet-last {
  page-break-after: avoid !important;
  break-after: avoid !important;
}

.pdf-sheet-slot > .dynamic-document-page,
.pdf-sheet-slot > .print-document,
.pdf-sheet-slot > .document-sheet,
.pdf-sheet-slot > .print-attendance-sheet {
  transform: none !important;
  box-shadow: none !important;
  margin: 0 auto !important;
}

.dynamic-document-page[data-orientation="landscape"] {
  width: 297mm !important;
  min-width: 297mm !important;
  max-width: 297mm !important;
  height: 210mm !important;
  min-height: 210mm !important;
  max-height: 210mm !important;
}

.dynamic-document-page[data-orientation="landscape"] .page-decorative-borders-container {
  width: 297mm !important;
  height: 210mm !important;
  min-height: 210mm !important;
  max-height: 210mm !important;
}

@media print {
  html,
  body {
    width: ${pageSizeW} !important;
    min-height: ${pageSizeH} !important;
  }
  .pdf-sheet-slot > .dynamic-document-page {
    page-break-after: avoid !important;
    break-after: avoid !important;
  }
}
</style>
</head>
<body>
${renderedSheets}
</body>
</html>`;
}

/**
 * Generates an authoritative A4 PDF buffer from rendered HTML sheets using headless Chromium.
 */
export async function renderPdfFromHtmlSheets(input: ServerPdfRenderInput): Promise<Buffer> {
  if (!Array.isArray(input.sheetsHtml) || input.sheetsHtml.length === 0) {
    throw new Error("At least one rendered document sheet is required.");
  }

  const landscape = Boolean(input.landscape);
  const fullHtml = buildPdfDocumentHtml(input);
  const browser = await getBrowser();
  const page = await browser.newPage();

  try {
    await page.setViewport({ width: 1280, height: 1800, deviceScaleFactor: 2 });
    await page.setJavaScriptEnabled(false);
    await page.setRequestInterception(true);
    page.on("request", (req) => {
      const url = req.url();
      if (url.startsWith("data:") || url === "about:blank") {
        void req.continue();
      } else {
        void req.abort();
      }
    });

    await page.setContent(fullHtml, { waitUntil: "load", timeout: 30_000 });
    await page.emulateMediaType("print");

    // Ensure embedded web fonts & all inline data: images settle completely before PDF generation
    await page.evaluate(async () => {
      if (document.fonts && document.fonts.ready) {
        await document.fonts.ready;
      }
      const imgs = Array.from(document.querySelectorAll("img"));
      await Promise.all(
        imgs.map((img) => {
          if (img.complete) return Promise.resolve();
          return new Promise<void>((resolve) => {
            img.addEventListener("load", () => resolve(), { once: true });
            img.addEventListener("error", () => resolve(), { once: true });
          });
        })
      );
    });

    const pdfBytes = await page.pdf({
      format: "A4",
      landscape,
      printBackground: true,
      preferCSSPageSize: true,
      margin: { top: "0mm", right: "0mm", bottom: "0mm", left: "0mm" },
    });

    return Buffer.from(pdfBytes);
  } finally {
    await page.close().catch(() => {});
  }
}

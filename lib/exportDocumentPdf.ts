import { waitForDocumentImages } from "./printAssets";
import { sanitizeFilenamePart } from "./documentFilename";

export interface DocumentPdfExportOptions {
  filename?: string;
  scopeElement?: HTMLElement | null;
  action?: "download" | "share" | "blob" | "print";
  sheetsOverride?: HTMLElement[];
  landscape?: boolean;
}

export interface PdfDeliveryResult {
  filename: string;
  blob: Blob;
  method: "download" | "share" | "ios-fallback" | "blob" | "print";
  fallbackUrl?: string;
}

interface CachedPdfEntry {
  filename: string;
  blob: Blob;
  url: string;
}

let activeDownloadLock = false;
const inFlightPdfRequests = new Map<string, Promise<CachedPdfEntry>>();
const completedPdfCache = new Map<string, CachedPdfEntry>();

export function normalizePdfFilename(rawFilename?: string | null): string {
  const base = sanitizeFilenamePart((rawFilename || "Document").replace(/(\.pdf)+$/i, ""));
  return `${base || "Document"}.pdf`;
}

export function isIosDevice(): boolean {
  if (typeof navigator === "undefined") return false;
  return (
    /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1)
  );
}

export function isMobileBrowser(): boolean {
  if (typeof navigator === "undefined" || typeof window === "undefined") return false;
  if (isIosDevice()) return true;
  return /Android|webOS|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
}

export function isStandalonePwa(): boolean {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia?.("(display-mode: standalone)").matches ||
    Boolean((navigator as unknown as { standalone?: boolean }).standalone)
  );
}

function fastStringHash(str: string): string {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(36);
}

/**
 * Collects active CSS stylesheets from the current document, stripping `<768px` mobile screen
 * overrides so the server Chromium engine always renders desktop A4 geometry cleanly.
 */
export function collectDocumentCssText(): string {
  if (typeof document === "undefined") return "";
  const chunks: string[] = [];

  for (const sheet of Array.from(document.styleSheets)) {
    try {
      const rules = sheet.cssRules;
      if (!rules) continue;
      for (const rule of Array.from(rules)) {
        if (typeof CSSMediaRule !== "undefined" && rule instanceof CSSMediaRule) {
          const cond = (rule.conditionText || rule.media?.mediaText || "").toLowerCase();
          if (cond.includes("max-width: 767px") || cond.includes("max-width:767px")) {
            continue;
          }
        }
        chunks.push(rule.cssText);
      }
    } catch {
      // Skip cross-origin sheets without CORS access
      if (sheet.ownerNode instanceof HTMLStyleElement && sheet.ownerNode.textContent) {
        chunks.push(sheet.ownerNode.textContent);
      }
    }
  }

  return chunks.join("\n");
}

function resolveRelativePublicSrc(rawSrc: string): string | null {
  try {
    if (typeof window === "undefined") return rawSrc;
    const parsed = new URL(rawSrc, window.location.origin);
    if (
      parsed.origin === window.location.origin &&
      !parsed.pathname.startsWith("/_next/") &&
      !parsed.pathname.startsWith("/api/")
    ) {
      return `${parsed.pathname}${parsed.search}`;
    }
  } catch {
    // ignore malformed
  }
  return null;
}

async function fetchImageAsDataUrl(url: string): Promise<string | null> {
  try {
    const resp = await fetch(url);
    if (!resp.ok) return null;
    const blob = await resp.blob();
    return await new Promise<string | null>((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(typeof reader.result === "string" ? reader.result : null);
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

/**
 * Serializes rendered A4 sheet DOM elements without any live preview scale transforms,
 * deduplicating image binary payloads cleanly for fast Vercel serverless transmission.
 */
async function serializeSheetsForServerPdf(sheets: HTMLElement[]): Promise<{
  sheetsHtml: string[];
  assets: Record<string, string>;
  landscape: boolean;
}> {
  const assets: Record<string, string> = {};
  const assetKeyBySrc = new Map<string, string>();
  let assetCounter = 0;

  const landscape = sheets.some(
    (s) =>
      s.getAttribute("data-orientation") === "landscape" ||
      s.classList.contains("print-attendance-sheet") ||
      Boolean(s.querySelector('[data-orientation="landscape"]'))
  );

  // Deduplicate and inline non-public image sources (e.g. signed Supabase logos/stamps) once
  const uniqueExternalUrls = new Set<string>();
  for (const sheet of sheets) {
    for (const img of Array.from(sheet.querySelectorAll<HTMLImageElement>("img"))) {
      const rawSrc = img.getAttribute("src") || img.src || "";
      if (!rawSrc || rawSrc.startsWith("data:")) continue;
      if (resolveRelativePublicSrc(rawSrc)) continue;
      uniqueExternalUrls.add(rawSrc);
    }
  }

  await Promise.all(
    Array.from(uniqueExternalUrls).map(async (src) => {
      const dataUrl = await fetchImageAsDataUrl(src);
      if (dataUrl) {
        const token = `__PDF_ASSET_${assetCounter++}__`;
        assets[token] = dataUrl;
        assetKeyBySrc.set(src, token);
      }
    })
  );

  const sheetsHtml = sheets.map((sheet) => {
    const clone = sheet.cloneNode(true) as HTMLElement;
    clone.style.transform = "none";
    clone.style.boxShadow = "none";
    clone.style.margin = "0 auto";

    // Deduplicate embedded images via __PDF_ASSET_n__ or compact relative /public path
    for (const img of Array.from(clone.querySelectorAll<HTMLImageElement>("img"))) {
      const rawAttr = img.getAttribute("src") || "";
      const fullSrc = img.src || rawAttr;
      const publicRel = resolveRelativePublicSrc(rawAttr || fullSrc);
      if (publicRel) {
        img.setAttribute("src", publicRel);
      } else if (fullSrc.startsWith("data:") || rawAttr.startsWith("data:")) {
        const dataVal = rawAttr.startsWith("data:") ? rawAttr : fullSrc;
        let token = assetKeyBySrc.get(dataVal);
        if (!token) {
          token = `__PDF_ASSET_${assetCounter++}__`;
          assets[token] = dataVal;
          assetKeyBySrc.set(dataVal, token);
        }
        img.setAttribute("src", token);
      } else if (assetKeyBySrc.has(rawAttr) || assetKeyBySrc.has(fullSrc)) {
        const tok = assetKeyBySrc.get(rawAttr) || assetKeyBySrc.get(fullSrc)!;
        img.setAttribute("src", tok);
      }
    }

    // Never keep hidden screen-only controls inside server PDF pages
    for (const hidden of Array.from(clone.querySelectorAll<HTMLElement>(".no-print"))) {
      hidden.remove();
    }

    return clone.outerHTML;
  });

  return { sheetsHtml, assets, landscape };
}

async function getAuthHeaders(): Promise<Record<string, string>> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  try {
    const { supabase } = await import("./supabase");
    const { data } = await supabase.auth.getSession();
    const token = data?.session?.access_token;
    if (token) {
      headers.Authorization = `Bearer ${token}`;
    }
  } catch {
    // cookie fallback handled on server
  }
  return headers;
}

export function computeServerPdfCacheFingerprint(params: {
  filename: string;
  title?: string;
  landscape?: boolean;
  cssText?: string;
  assets?: Record<string, string>;
  sheetsHtml: string[];
}): string {
  const assetsHash = Object.keys(params.assets || {})
    .sort()
    .map((k) => `${k}:${fastStringHash(params.assets![k] || "")}`)
    .join(",");
  const cssHash = fastStringHash(params.cssText || "");
  return fastStringHash(
    `${params.filename}|${params.title || ""}|${params.landscape ? "L" : "P"}|${cssHash}|${assetsHash}|${params.sheetsHtml.join("\n")}`
  );
}

/**
 * Generates an authoritative server-side Chromium A4 PDF from arbitrary HTML sheets + CSS.
 * Used by both DOM document exports and spreadsheet-to-PDF reports (`SoaPreviewModal`).
 */
export async function renderHtmlToServerPdf(params: {
  sheetsHtml: string[];
  cssText?: string;
  assets?: Record<string, string>;
  filename: string;
  title?: string;
  landscape?: boolean;
  action?: "download" | "share" | "blob" | "print";
}): Promise<PdfDeliveryResult> {
  const filename = normalizePdfFilename(params.filename);
  const title = params.title || filename.replace(/\.pdf$/i, "");
  const resolvedCssText = params.cssText ?? collectDocumentCssText();
  const fingerprint = computeServerPdfCacheFingerprint({
    filename,
    title,
    landscape: Boolean(params.landscape),
    cssText: resolvedCssText,
    assets: params.assets,
    sheetsHtml: params.sheetsHtml,
  });

  let entry = completedPdfCache.get(fingerprint);
  if (!entry) {
    let promise = inFlightPdfRequests.get(fingerprint);
    if (!promise) {
      promise = (async () => {
        const headers = await getAuthHeaders();
        const res = await fetch("/api/pdf/render", {
          method: "POST",
          headers,
          body: JSON.stringify({
            sheetsHtml: params.sheetsHtml,
            cssText: resolvedCssText,
            assets: params.assets || {},
            filename,
            title,
            landscape: Boolean(params.landscape),
          }),
        });

        if (!res.ok) {
          let errMsg = `Server PDF engine failed (${res.status}).`;
          try {
            const errJson = (await res.json()) as { error?: string };
            if (errJson?.error) errMsg = errJson.error;
          } catch {
            // ignore non-JSON body
          }
          throw new Error(errMsg);
        }

        const contentType = (res.headers.get("content-type") || "").toLowerCase();
        const buf = await res.arrayBuffer();
        const bytes = new Uint8Array(buf);
        const hasPdfMagic =
          bytes.length >= 5 &&
          bytes[0] === 0x25 &&
          bytes[1] === 0x50 &&
          bytes[2] === 0x44 &&
          bytes[3] === 0x46 &&
          bytes[4] === 0x2d;

        if (!contentType.includes("application/pdf") || !hasPdfMagic) {
          throw new Error(
            "Server returned a non-PDF response (session expired or deployment protection active). Please refresh/sign in and retry."
          );
        }

        const blob = new Blob([buf], { type: "application/pdf" });
        const url = URL.createObjectURL(blob);

        // Keep max 8 cached PDFs to bound client memory
        if (completedPdfCache.size >= 8) {
          const oldestKey = completedPdfCache.keys().next().value;
          if (oldestKey) {
            const old = completedPdfCache.get(oldestKey);
            if (old) {
              setTimeout(() => {
                try {
                  URL.revokeObjectURL(old.url);
                } catch {}
              }, 60_000);
            }
            completedPdfCache.delete(oldestKey);
          }
        }

        const cached: CachedPdfEntry = { filename, blob, url };
        completedPdfCache.set(fingerprint, cached);
        return cached;
      })();
      inFlightPdfRequests.set(fingerprint, promise);
    }

    try {
      entry = await promise;
    } finally {
      inFlightPdfRequests.delete(fingerprint);
    }
  }

  return await deliverPdfBlob({
    blob: entry.blob,
    filename,
    action: params.action || "download",
    existingBlobUrl: entry.url,
  });
}

/**
 * Delivers a generated PDF Blob with its exact intended filename across Desktop,
 * Android Chrome, iOS Safari, and iOS installed PWAs.
 */
export async function deliverPdfBlob(params: {
  blob: Blob;
  filename: string;
  action?: "download" | "share" | "blob" | "print";
  existingBlobUrl?: string;
}): Promise<PdfDeliveryResult> {
  const filename = normalizePdfFilename(params.filename);
  const pdfBlob =
    params.blob.type === "application/pdf"
      ? params.blob
      : new Blob([params.blob], { type: "application/pdf" });

  const action = params.action || "download";
  if (action === "blob") {
    return { filename, blob: pdfBlob, method: "blob" };
  }

  const blobUrl = params.existingBlobUrl || URL.createObjectURL(pdfBlob);
  if (!params.existingBlobUrl) {
    setTimeout(() => {
      try {
        URL.revokeObjectURL(blobUrl);
      } catch {}
    }, 60_000);
  }

  // Mobile/iOS Print: Open authoritative server-generated PDF directly in native PDF viewer for AirPrint / Print
  if (action === "print") {
    const win = window.open(blobUrl, "_blank", "noopener");
    if (!win) {
      return { filename, blob: pdfBlob, method: "ios-fallback", fallbackUrl: blobUrl };
    }
    return { filename, blob: pdfBlob, method: "print", fallbackUrl: blobUrl };
  }

  // Native File Sharing (iOS Safari "Save to Files" / AirDrop / WhatsApp & Android Share)
  if (action === "share" && typeof navigator !== "undefined" && typeof File !== "undefined") {
    try {
      const pdfFile = new File([pdfBlob], filename, { type: "application/pdf" });
      if (typeof navigator.canShare === "function" && navigator.canShare({ files: [pdfFile] })) {
        await navigator.share({
          files: [pdfFile],
          title: filename.replace(/\.pdf$/i, ""),
        });
        return { filename, blob: pdfBlob, method: "share" };
      }
    } catch (shareErr: unknown) {
      if (shareErr instanceof Error && shareErr.name === "AbortError") {
        return { filename, blob: pdfBlob, method: "share" };
      }
      // Fall through to ios-fallback / standard download so the user always retains 1-tap access
      if (isIosDevice()) {
        return { filename, blob: pdfBlob, method: "ios-fallback", fallbackUrl: blobUrl };
      }
    }
  }

  if (activeDownloadLock) {
    return { filename, blob: pdfBlob, method: "blob", fallbackUrl: blobUrl };
  }

  activeDownloadLock = true;
  try {
    // On iOS standalone PWA, `<a download>` often navigates inside the webview without a back bar.
    // Invoke native Share Sheet first so "Save to Files" saves with the exact filename.
    if (isIosDevice() && isStandalonePwa() && typeof File !== "undefined") {
      try {
        const pdfFile = new File([pdfBlob], filename, { type: "application/pdf" });
        if (typeof navigator.canShare === "function" && navigator.canShare({ files: [pdfFile] })) {
          await navigator.share({
            files: [pdfFile],
            title: filename.replace(/\.pdf$/i, ""),
          });
          return { filename, blob: pdfBlob, method: "share" };
        }
      } catch (iosShareErr: unknown) {
        if (iosShareErr instanceof Error && iosShareErr.name === "AbortError") {
          return { filename, blob: pdfBlob, method: "share" };
        }
      }
    }

    const link = document.createElement("a");
    link.href = blobUrl;
    link.download = filename;
    link.rel = "noopener";
    link.style.display = "none";
    document.body.appendChild(link);
    link.click();
    setTimeout(() => {
      try {
        link.remove();
      } catch {}
    }, 250);

    if (isIosDevice()) {
      return { filename, blob: pdfBlob, method: "ios-fallback", fallbackUrl: blobUrl };
    }
    return { filename, blob: pdfBlob, method: "download" };
  } finally {
    setTimeout(() => {
      activeDownloadLock = false;
    }, 400);
  }
}

function resolveDocumentFilenameFromDom(
  explicitFilename: string | undefined,
  scopeElement?: HTMLElement | null
): string {
  let defaultFilename = explicitFilename;
  if (!defaultFilename) {
    const scopeEl = scopeElement instanceof HTMLElement ? scopeElement : null;
    const attrFilename =
      scopeEl?.getAttribute("data-document-filename") ||
      (scopeEl
        ? scopeEl.querySelector("[data-document-filename]")?.getAttribute("data-document-filename")
        : document.querySelector("[data-document-filename]")?.getAttribute("data-document-filename")) ||
      scopeEl?.getAttribute("data-document-title") ||
      (scopeEl
        ? scopeEl.querySelector("[data-document-title]")?.getAttribute("data-document-title")
        : document.querySelector("[data-document-title]")?.getAttribute("data-document-title"));

    if (attrFilename) {
      defaultFilename = attrFilename.endsWith(".pdf") ? attrFilename : `${attrFilename}.pdf`;
    } else {
      const docMeta = document.querySelector(
        "#print-preview-title, .title-ref, [data-element-id='doc_title'], [data-element-id='doc_meta']"
      );
      const text = docMeta?.textContent?.replace(/[\r\n\t]/g, " ").trim() || "";
      const match = text.match(/(INV|QUO|PRO|DN|PO|RCV|SOA|BILL|SLIP|HO|WMS|EPV|MS)[-\w]+/i);
      const docNumber = match ? match[0] : "Document";
      defaultFilename = `${docNumber}.pdf`;
    }
  }
  return normalizePdfFilename(defaultFilename);
}

async function resolveActiveSheets(options: DocumentPdfExportOptions): Promise<HTMLElement[]> {
  if (Array.isArray(options.sheetsOverride) && options.sheetsOverride.length > 0) {
    return options.sheetsOverride;
  }
  const root =
    options.scopeElement ||
    document.querySelector(".print-modal-container, .mobile-pdf-modal, .dynamic-document-pages, .print-template-wrapper") ||
    document;

  if (root.querySelector("[data-design-print-blocked]")) {
    throw new Error("Wait for the saved cloud design to finish loading before exporting this PDF.");
  }
  if (root.querySelector("[data-report-print-blocked]")) {
    throw new Error("Report data must finish loading before exporting this PDF.");
  }

  const sheets = Array.from(
    root.querySelectorAll<HTMLElement>(
      ".dynamic-document-page, .print-document, .document-sheet, .print-attendance-sheet"
    )
  ).filter((sheet) => sheet.offsetParent !== null || sheet.offsetWidth > 0 || sheet.offsetHeight > 0);

  if (!sheets.length) {
    throw new Error("No document sheet found to export. Please wait for the preview to load.");
  }

  const images = [...new Set(sheets.flatMap((sheet) => Array.from(sheet.querySelectorAll<HTMLImageElement>("img"))))];
  await waitForDocumentImages(images);

  if (document.fonts?.ready) {
    try {
      await document.fonts.ready;
    } catch {
      // ignore
    }
  }

  return sheets;
}

/**
 * Background pre-warms the server Chromium PDF Blob as soon as a preview modal opens
 * so iOS Safari `Share` and `Download` can immediately reuse the already-built PDF file
 * within WebKit's synchronous user activation window.
 */
export async function prefetchDocumentPdf(options: DocumentPdfExportOptions = {}): Promise<void> {
  if (typeof window === "undefined") return;
  try {
    await exportDocumentToPdf({ ...options, action: "blob" });
  } catch {
    // Non-blocking background warm-up; explicit button click surfaces actionable errors
  }
}

/**
 * Generates and delivers an authoritative server-rendered A4 PDF identical across
 * desktop PC, iPhone Safari, Android, and iOS installed PWAs.
 */
export async function exportDocumentToPdf(
  options: DocumentPdfExportOptions = {}
): Promise<PdfDeliveryResult> {
  if (typeof window === "undefined") {
    throw new Error("PDF export is only available in browser environments.");
  }

  const sheets = await resolveActiveSheets(options);
  const filename = resolveDocumentFilenameFromDom(options.filename, options.scopeElement);
  const { sheetsHtml, assets, landscape } = await serializeSheetsForServerPdf(sheets);
  const cssText = collectDocumentCssText();

  return await renderHtmlToServerPdf({
    sheetsHtml,
    cssText,
    assets,
    filename,
    title: filename.replace(/\.pdf$/i, ""),
    landscape: options.landscape ?? landscape,
    action: options.action || "download",
  });
}

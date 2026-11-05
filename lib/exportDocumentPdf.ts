import jsPDF from "jspdf";
import html2canvas from "html2canvas";
import { waitForDocumentImages } from "./printAssets";

export interface DocumentPdfExportOptions {
  filename?: string;
  scopeElement?: HTMLElement | null;
}

function createColorConverter() {
  if (typeof document === "undefined") return (s: string) => s;
  const canvas = document.createElement("canvas");
  canvas.width = 1;
  canvas.height = 1;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  const cache = new Map<string, string>();

  return function sanitizeColor(colorStr: string): string {
    if (!colorStr || typeof colorStr !== "string") return colorStr;
    if (
      !colorStr.includes("lab(") &&
      !colorStr.includes("oklch(") &&
      !colorStr.includes("color(") &&
      !colorStr.includes("color-mix(")
    ) {
      return colorStr;
    }
    if (cache.has(colorStr)) return cache.get(colorStr)!;
    try {
      if (!ctx) return colorStr;
      ctx.clearRect(0, 0, 1, 1);
      ctx.fillStyle = colorStr;
      ctx.fillRect(0, 0, 1, 1);
      const [r, g, b, a] = ctx.getImageData(0, 0, 1, 1).data;
      const res = a === 255 ? `rgb(${r}, ${g}, ${b})` : `rgba(${r}, ${g}, ${b}, ${(a / 255).toFixed(3)})`;
      cache.set(colorStr, res);
      return res;
    } catch {
      return colorStr;
    }
  };
}

function getSafeCssFallback(propName: string): string {
  const p = propName.toLowerCase();
  if (p.includes("color")) return "rgba(0, 0, 0, 0)";
  if (p.includes("radius")) return "0px 0px";
  if (
    p.includes("width") ||
    p.includes("height") ||
    p.includes("margin") ||
    p.includes("padding") ||
    p.includes("spacing")
  )
    return "0px";
  if (p.includes("style")) return "none";
  if (p.includes("image") || p.includes("shadow") || p.includes("transform")) return "none";
  if (p.includes("position")) return p.includes("background") ? "0% 0%" : "static";
  if (p.includes("origin")) return p.includes("transform") ? "50% 50%" : "border-box";
  if (p.includes("opacity")) return "1";
  if (p.includes("size")) return p.includes("font") ? "12px" : "auto";
  if (p.includes("display")) return "inline-block";
  if (p.includes("family")) return "sans-serif";
  if (p.includes("duration")) return "0s";
  if (p.includes("zindex") || p.includes("z-index")) return "auto";
  return "0px";
}

async function inlineImagesAsDataUrls(images: HTMLImageElement[]): Promise<void> {
  await Promise.all(
    images.map(async (img) => {
      if (!img.src || img.src.startsWith("data:")) return;
      try {
        const resp = await fetch(img.src);
        const blob = await resp.blob();
        const reader = new FileReader();
        const dataUrl = await new Promise<string>((resolve) => {
          reader.onloadend = () => resolve(reader.result as string);
          reader.readAsDataURL(blob);
        });
        img.src = dataUrl;
      } catch {
        try {
          const c = document.createElement("canvas");
          c.width = img.naturalWidth || img.width || 100;
          c.height = img.naturalHeight || img.height || 100;
          const ctx = c.getContext("2d");
          if (ctx) {
            ctx.drawImage(img, 0, 0);
            img.src = c.toDataURL("image/png");
          }
        } catch {
          // ignore
        }
      }
    })
  );
}

/**
 * Exports the active document (Invoice, Quotation, Delivery Note, etc.) directly
 * to a genuine A4 Portrait PDF (210 mm x 297 mm) with zero browser headers, footers, URLs, or dates.
 *
 * Captures the exact rendered DOM with 100% visual fidelity.
 */
export async function exportDocumentToPdf(
  options: DocumentPdfExportOptions = {}
): Promise<{ filename: string; blob: Blob }> {
  if (typeof window === "undefined") {
    throw new Error("PDF export is only available in browser environments.");
  }

  const root = options.scopeElement ||
    document.querySelector(".print-modal-container, .dynamic-document-pages, .print-template-wrapper") ||
    document;

  const sheets = Array.from(root.querySelectorAll<HTMLElement>(".dynamic-document-page, .print-document, .document-sheet"))
    .filter((sheet) => sheet.offsetParent !== null || sheet.offsetWidth > 0 || sheet.offsetHeight > 0);

  if (!sheets.length) {
    throw new Error("No document sheet found to export. Please ensure the preview is open.");
  }

  // Ensure all document images and fonts are fully settled before rasterizing
  const images = [...new Set(sheets.flatMap((sheet) => Array.from(sheet.querySelectorAll<HTMLImageElement>("img"))))];
  await waitForDocumentImages(images);
  await inlineImagesAsDataUrls(images);

  if (document.fonts?.ready) {
    try {
      await document.fonts.ready;
    } catch {
      // Font readiness fallback
    }
  }

  const sanitizeColor = createColorConverter();
  const origGetComputedStyle = window.getComputedStyle.bind(window);

  try {
    window.getComputedStyle = function (el: Element, pseudo?: string | null) {
      const style = origGetComputedStyle(el, pseudo);
      return new Proxy(style, {
        get(target, prop: string | symbol) {
          const propStr = typeof prop === "string" ? prop : String(prop);
          const val = Reflect.get(target, prop);

          if (propStr === "backgroundImage" || propStr === "listStyleImage") {
            if (typeof val === "string" && !val.includes("url(") && !val.includes("gradient(")) {
              return "none";
            }
          }
          if (typeof val === "string") {
            const trimmed = val.trim();
            if (trimmed === "") {
              return getSafeCssFallback(propStr);
            }
            if (
              val.includes("lab(") ||
              val.includes("oklch(") ||
              val.includes("color(") ||
              val.includes("color-mix(")
            ) {
              return sanitizeColor(val);
            }
          }
          if (typeof val === "function") {
            if (prop === "getPropertyValue") {
              return function (p: string) {
                if (p === "background-image" || p === "list-style-image") {
                  const v = target.getPropertyValue(p);
                  if (typeof v === "string" && !v.includes("url(") && !v.includes("gradient(")) {
                    return "none";
                  }
                }
                const v = target.getPropertyValue(p);
                if (typeof v === "string") {
                  if (v.trim() === "") {
                    return getSafeCssFallback(p);
                  }
                  return sanitizeColor(v);
                }
                return v;
              };
            }
            return val.bind(target);
          }
          return val;
        },
      });
    };

    // A4 Portrait dimensions in mm
    const a4WidthMm = 210;
    const a4HeightMm = 297;

    // Initialize jsPDF with genuine A4 portrait
    const pdf = new jsPDF({
      orientation: "portrait",
      unit: "mm",
      format: "a4",
      compress: true,
    });

    for (let i = 0; i < sheets.length; i++) {
      const sheet = sheets[i];

      if (i > 0) {
        pdf.addPage("a4", "portrait");
      }

      // Render sheet to high-resolution canvas with full container isolation
      const canvas = await html2canvas(sheet, {
        scale: 2,
        useCORS: true,
        allowTaint: false,
        logging: false,
        backgroundColor: "#ffffff",
        scrollX: 0,
        scrollY: 0,
        windowWidth: 794,
        windowHeight: 1123,
        onclone: (clonedDoc) => {
          const win = clonedDoc.defaultView || window;
          if (win && win !== window) {
            win.getComputedStyle = window.getComputedStyle;
          }

          const clonedSheets = clonedDoc.querySelectorAll<HTMLElement>(
            ".dynamic-document-page, .print-document, .document-sheet"
          );
          const clonedSheet = clonedSheets[i] || clonedSheets[0];
          if (clonedSheet) {
            clonedSheet.style.transform = "none";
            clonedSheet.style.boxShadow = "none";
            clonedSheet.style.margin = "0";
          }

          // Ensure Arabic elements retain cursive ligatures and zero letter-spacing
          clonedDoc.querySelectorAll<HTMLElement>("[dir='rtl'], .font-arabic").forEach((el) => {
            el.style.letterSpacing = "0px";
            el.style.fontFeatureSettings = '"liga" 1, "dlig" 1';
          });
        },
      });

      const imgData = canvas.toDataURL("image/png");
      const canvasAspect = canvas.width / canvas.height;
      const targetAspect = a4WidthMm / a4HeightMm;

      let renderW = a4WidthMm;
      let renderH = a4HeightMm;
      let offsetX = 0;
      let offsetY = 0;

      // Preserve true aspect ratio without optical distortion
      if (Math.abs(canvasAspect - targetAspect) > 0.01) {
        if (canvasAspect > targetAspect) {
          renderH = a4WidthMm / canvasAspect;
          offsetY = Math.max(0, (a4HeightMm - renderH) / 2);
        } else {
          renderW = a4HeightMm * canvasAspect;
          offsetX = Math.max(0, (a4WidthMm - renderW) / 2);
        }
      }

      pdf.addImage(imgData, "PNG", offsetX, offsetY, renderW, renderH, undefined, "FAST");
    }

    // Derive meaningful document filename
    let defaultFilename = options.filename;
    if (!defaultFilename) {
      const scopeEl = options.scopeElement instanceof HTMLElement ? options.scopeElement : null;
      const attrFilename = scopeEl?.getAttribute("data-document-filename") ||
        (scopeEl ? scopeEl.querySelector("[data-document-filename]")?.getAttribute("data-document-filename") : document.querySelector("[data-document-filename]")?.getAttribute("data-document-filename")) ||
        scopeEl?.getAttribute("data-document-title") ||
        (scopeEl ? scopeEl.querySelector("[data-document-title]")?.getAttribute("data-document-title") : document.querySelector("[data-document-title]")?.getAttribute("data-document-title"));

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

    // Ensure valid characters and .pdf extension
    if (defaultFilename) {
      defaultFilename = defaultFilename
        .replace(/[<>:"/\\|?*\x00-\x1F]/g, " ")
        .replace(/\s+/g, " ")
        .trim();
      if (!defaultFilename.toLowerCase().endsWith(".pdf")) {
        defaultFilename += ".pdf";
      }
    } else {
      defaultFilename = "Document.pdf";
    }

    // Trigger client download
    pdf.save(defaultFilename);

    const blob = pdf.output("blob");
    return { filename: defaultFilename, blob };
  } finally {
    window.getComputedStyle = origGetComputedStyle;
  }
}

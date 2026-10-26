import jsPDF from "jspdf";
import html2canvas from "html2canvas";
import { waitForDocumentImages } from "./printAssets";

export interface DocumentPdfExportOptions {
  filename?: string;
  scopeElement?: HTMLElement | null;
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

  if (document.fonts?.ready) {
    try {
      await document.fonts.ready;
    } catch {
      // Font readiness fallback
    }
  }

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
      allowTaint: true,
      logging: false,
      backgroundColor: "#ffffff",
      scrollX: 0,
      scrollY: 0,
      windowWidth: 794,
      windowHeight: 1123,
      onclone: (clonedDoc) => {
        const clonedSheets = clonedDoc.querySelectorAll<HTMLElement>(".dynamic-document-page, .print-document, .document-sheet");
        const clonedSheet = clonedSheets[i] || clonedSheets[0];
        if (clonedSheet) {
          // Isolate cloned sheet: strip away all outer borders, backgrounds, and scrollbars
          clonedDoc.body.innerHTML = "";
          clonedDoc.body.style.cssText =
            "margin:0!important;padding:0!important;width:210mm!important;height:297mm!important;min-height:297mm!important;max-height:297mm!important;background:#ffffff!important;background-color:#ffffff!important;overflow:hidden!important;";

          clonedSheet.style.transform = "none";
          clonedSheet.style.boxShadow = "none";
          clonedSheet.style.border = "none";
          clonedSheet.style.margin = "0";
          clonedSheet.style.width = "210mm";
          clonedSheet.style.minWidth = "210mm";
          clonedSheet.style.maxWidth = "210mm";
          clonedSheet.style.height = "297mm";
          clonedSheet.style.minHeight = "297mm";
          clonedSheet.style.maxHeight = "297mm";
          clonedSheet.style.boxSizing = "border-box";
          clonedSheet.style.backgroundColor = "#ffffff";
          clonedSheet.style.overflow = "hidden";
          clonedDoc.body.appendChild(clonedSheet);
        }
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
    const docMeta = document.querySelector("#print-preview-title, .title-ref, [data-element-id='doc_title'], [data-element-id='doc_meta']");
    const text = docMeta?.textContent?.replace(/[\r\n\t]/g, " ").trim() || "";
    const match = text.match(/(INV|QUO|PRO|DN|PO|RCV|SOA|BILL|SLIP|HO|WMS|EPV|MS)[-\w]+/i);
    const docNumber = match ? match[0] : "Document";
    defaultFilename = `${docNumber}.pdf`;
  }

  // Trigger client download
  pdf.save(defaultFilename);

  const blob = pdf.output("blob");
  return { filename: defaultFilename, blob };
}

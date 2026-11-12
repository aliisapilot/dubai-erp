import jsPDF from "jspdf";
import html2canvas from "html2canvas";
import { generateDocumentPdfFilename } from "./documentFilename";

export interface AttendancePdfExportOptions {
  monthName: string;
  year: number;
  mode?: "attendance" | "overtime" | "summary";
  containerElement?: HTMLElement | null;
}

/**
 * Exports the active Attendance & Overtime Print Sheet directly to a genuine
 * A4 Landscape PDF (297 mm x 210 mm) with zero browser headers, footers, URLs, or dates.
 *
 * Uses the exact DOM layout rendered in the preview modal to guarantee 100% visual consistency.
 */
export async function exportAttendanceToPdf({
  monthName,
  year,
  mode = "attendance",
  containerElement,
}: AttendancePdfExportOptions): Promise<{ filename: string; blob: Blob }> {
  const root = containerElement || document;
  const sheets = Array.from(root.querySelectorAll<HTMLElement>(".print-attendance-sheet"));

  if (!sheets.length) {
    throw new Error("No attendance sheet found to export. Please ensure the preview modal is open.");
  }

  // Ensure fonts are ready before rasterizing
  if (typeof document !== "undefined" && "fonts" in document && document.fonts?.ready) {
    try {
      await document.fonts.ready;
    } catch {
      // Font readiness fallback
    }
  }

  // A4 Landscape dimensions in mm
  const a4WidthMm = 297;
  const a4HeightMm = 210;

  // Initialize jsPDF with genuine A4 landscape
  const pdf = new jsPDF({
    orientation: "landscape",
    unit: "mm",
    format: "a4",
    compress: true,
  });

  for (let i = 0; i < sheets.length; i++) {
    const sheet = sheets[i];

    if (i > 0) {
      pdf.addPage("a4", "landscape");
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
      windowWidth: 1123,
      windowHeight: 794,
      onclone: (clonedDoc) => {
        const clonedSheet = clonedDoc.querySelectorAll<HTMLElement>(".print-attendance-sheet")[i];
        if (clonedSheet) {
          // Isolate cloned sheet: strip away all modal wrappers, dark backgrounds, scrollbars, and toolbars
          clonedDoc.body.innerHTML = "";
          clonedDoc.body.style.cssText =
            "margin:0!important;padding:0!important;width:297mm!important;height:210mm!important;min-height:210mm!important;max-height:210mm!important;background:#ffffff!important;background-color:#ffffff!important;overflow:hidden!important;";

          clonedSheet.style.transform = "none";
          clonedSheet.style.boxShadow = "none";
          clonedSheet.style.border = "none";
          clonedSheet.style.margin = "0";
          clonedSheet.style.padding = "7mm 7mm";
          clonedSheet.style.width = "297mm";
          clonedSheet.style.minWidth = "297mm";
          clonedSheet.style.maxWidth = "297mm";
          clonedSheet.style.height = "210mm";
          clonedSheet.style.minHeight = "210mm";
          clonedSheet.style.maxHeight = "210mm";
          clonedSheet.style.boxSizing = "border-box";
          clonedSheet.style.backgroundColor = "#ffffff";
          clonedSheet.style.display = "flex";
          clonedSheet.style.flexDirection = "column";
          clonedSheet.style.justifyContent = "space-between";
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

    // Never distort: preserve true aspect ratio with optical centering
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

  const docType =
    mode === "overtime"
      ? "overtime"
      : mode === "summary"
      ? "payroll_summary"
      : "attendance";

  const { filename } = generateDocumentPdfFilename({
    docType,
    period: `${monthName} ${year}`,
  });

  // Trigger client download
  pdf.save(filename);

  const blob = pdf.output("blob");
  return { filename, blob };
}

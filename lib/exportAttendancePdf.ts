import { generateDocumentPdfFilename } from "./documentFilename";
import { exportDocumentToPdf } from "./exportDocumentPdf";

export interface AttendancePdfExportOptions {
  monthName: string;
  year: number;
  mode?: "attendance" | "overtime" | "summary";
  containerElement?: HTMLElement | null;
}

/**
 * Exports the active Attendance & Overtime Print Sheet directly to a genuine
 * A4 Landscape PDF (297 mm x 210 mm) via the authoritative server Chromium renderer.
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

  const res = await exportDocumentToPdf({
    filename,
    sheetsOverride: sheets,
    landscape: true,
    action: "download",
  });

  return { filename: res.filename, blob: res.blob };
}

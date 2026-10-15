import jsPDF from "jspdf";
import html2canvas from "html2canvas";

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

  // A4 Landscape dimensions in mm
  const a4WidthMm = 297;
  const a4HeightMm = 210;

  // Initialize jsPDF with A4 landscape
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

    // Render sheet to high-resolution canvas (scale: 2 produces crisp ~192 DPI print-quality bitmap)
    const canvas = await html2canvas(sheet, {
      scale: 2,
      useCORS: true,
      allowTaint: true,
      logging: false,
      backgroundColor: "#ffffff",
      windowWidth: 1600,
      onclone: (clonedDoc) => {
        const clonedSheet = clonedDoc.querySelectorAll<HTMLElement>(".print-attendance-sheet")[i];
        if (clonedSheet) {
          clonedSheet.style.transform = "none";
          clonedSheet.style.boxShadow = "none";
          clonedSheet.style.border = "none";
          clonedSheet.style.margin = "0";
        }
      },
    });

    const imgData = canvas.toDataURL("image/png");
    pdf.addImage(imgData, "PNG", 0, 0, a4WidthMm, a4HeightMm, undefined, "FAST");
  }

  const prefix =
    mode === "overtime"
      ? "Employee_Overtime_Sheet"
      : mode === "summary"
      ? "Payroll_Attendance_Summary"
      : "Employee_Attendance_Sheet";
  const filename = `${prefix}_${monthName}_${year}.pdf`;

  // Trigger client download
  pdf.save(filename);

  const blob = pdf.output("blob");
  return { filename, blob };
}

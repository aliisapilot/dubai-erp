"use client";
import React from "react";
import { CompanyDocInfo } from "@/components/documents/DocHeader";
import { EmployeeInfo } from "./AttendanceImportModal";
import { MONTH_NAMES, formatEmployeeCode } from "@/lib/helpers";

export interface AttendanceSheetColors {
  sundayHighlight?: string;
  sundayHeader?: string;
  presentColor?: string;
  absentColor?: string;
  holidayColor?: string;
  leaveColor?: string;
  headerBg?: string;
  headerTextColor?: string;
}

interface AttendancePrintSheetProps {
  company: CompanyDocInfo | null;
  year: number;
  month: number;
  mode: "attendance" | "overtime" | "summary";
  employees: EmployeeInfo[];
  attendanceMap: Record<string, string>; // `${empId}_${dateStr}` -> status
  overtimeMap: Record<string, number>; // `${empId}_${dateStr}` -> hours
  forceSinglePage?: boolean;
  printScale?: "auto" | "fit-width" | "actual";
  colors?: AttendanceSheetColors;
}

export default function AttendancePrintSheet({
  company,
  year,
  month,
  mode,
  employees,
  attendanceMap,
  overtimeMap,
  forceSinglePage = false,
  printScale = "auto",
  colors,
}: AttendancePrintSheetProps) {
  const daysInMonth = new Date(year, month, 0).getDate();
  const monthName = MONTH_NAMES[month - 1] || "";
  const shortMonth = monthName.slice(0, 3);

  // Generate days array
  const days = Array.from({ length: daysInMonth }, (_, i) => {
    const dayNum = i + 1;
    const dateObj = new Date(year, month - 1, dayNum);
    const dayOfWeek = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][dateObj.getDay()];
    const isSunday = dateObj.getDay() === 0;
    const isWeekend = isSunday || dateObj.getDay() === 6;
    const dateStr = `${year}-${String(month).padStart(2, "0")}-${String(dayNum).padStart(2, "0")}`;
    return {
      dayNum,
      dayOfWeek: dayOfWeek.slice(0, 2),
      isSunday,
      isWeekend,
      dateStr,
      label: `${String(dayNum).padStart(2, "0")} ${shortMonth}`,
    };
  });

  // Dynamic pagination based on printScale and employee count
  // 1. "auto" (Auto Fit One Page): Up to 32 employees forced to fit on exactly 1 page
  // 2. "fit-width": 100% printable width (287mm), standard 24 employees per page
  // 3. "actual": 100% natural unscaled size, roomier cells and font, 18 employees per page
  const effectiveForceSingle = forceSinglePage || (printScale === "auto" && employees.length <= 32);
  const pageSize = printScale === "actual" ? 18 : 24;
  const isMultiPage = !effectiveForceSingle && employees.length > pageSize;

  const employeeChunks: EmployeeInfo[][] = isMultiPage
    ? Array.from({ length: Math.ceil(employees.length / pageSize) }, (_, idx) =>
        employees.slice(idx * pageSize, (idx + 1) * pageSize)
      )
    : [employees];

  // Dynamic density tier based on scale mode and rows per page
  const rowsOnPage = isMultiPage ? pageSize : employees.length;
  const densityClass =
    printScale === "actual"
      ? "density-spacious density-actual"
      : rowsOnPage > 24
      ? "density-tight"
      : rowsOnPage > 15
      ? "density-compact"
      : "density-spacious";

  const totalPages = employeeChunks.length;
  // Dynamic row height in mm ensuring optimal fill of the 210mm printable area without multi-page overflow
  const rowHeightMm =
    rowsOnPage <= 10
      ? 11.6
      : rowsOnPage <= 14
      ? 8.8
      : rowsOnPage <= 18
      ? 7.2
      : rowsOnPage <= 24
      ? 5.2
      : 4.2;

  return (
    <div className="attendance-print-root print-document document-sheet erp-document-surface w-full bg-white text-slate-900 font-sans print:p-0 print:m-0">
      <style dangerouslySetInnerHTML={{ __html: `
        @page {
          size: 297mm 210mm !important;
          margin: 0 !important;
        }
        @media print {
          @page {
            size: 297mm 210mm !important;
            margin: 0 !important;
          }
          html, body {
            width: 297mm !important;
            min-width: 297mm !important;
            max-width: 297mm !important;
            height: 210mm !important;
            min-height: 210mm !important;
            max-height: 210mm !important;
            background: #ffffff !important;
            background-color: #ffffff !important;
            margin: 0 !important;
            padding: 0 !important;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }
          .print-attendance-sheet {
            width: 297mm !important;
            min-width: 297mm !important;
            max-width: 297mm !important;
            height: 210mm !important;
            min-height: 210mm !important;
            max-height: 210mm !important;
            box-sizing: border-box !important;
            padding: 7mm 7mm !important;
            overflow: hidden !important;
            page-break-inside: avoid !important;
            break-inside: avoid !important;
            transform: none !important;
            display: flex !important;
            flex-direction: column !important;
            justify-content: space-between !important;
          }
        }
        .attendance-print-root,
        .attendance-print-root.document-sheet,
        .print-attendance-sheet,
        .print-attendance-sheet.document-sheet {
          background-color: #ffffff !important;
          color: #0f172a !important;
        }
        .attendance-print-root table {
          background-color: #ffffff !important;
          color: #0f172a !important;
        }
        .attendance-print-root .sunday-col-cell {
          background-color: ${colors?.sundayHighlight || "#d1fae5"} !important;
          color: ${colors?.sundayHeader || "#064e3b"} !important;
          border-left-color: ${colors?.sundayHighlight ? `${colors.sundayHighlight}99` : "#6ee7b7"} !important;
          border-right-color: ${colors?.sundayHighlight ? `${colors.sundayHighlight}99` : "#6ee7b7"} !important;
          font-weight: 700 !important;
        }
        .attendance-print-root .sunday-col-head {
          background-color: ${colors?.sundayHeader || "#059669"} !important;
          color: #ffffff !important;
          border-left-color: ${colors?.sundayHeader || "#10b981"} !important;
          border-right-color: ${colors?.sundayHeader || "#10b981"} !important;
          font-weight: 800 !important;
        }
        .attendance-print-root .sunday-col-subhead {
          background-color: ${colors?.sundayHeader || "#047857"} !important;
          color: #ffffff !important;
          border-left-color: ${colors?.sundayHeader || "#10b981"} !important;
          border-right-color: ${colors?.sundayHeader || "#10b981"} !important;
          font-weight: 700 !important;
        }
      `}} />

      {employeeChunks.map((chunk, pageIndex) => {
        const isLastPage = pageIndex === totalPages - 1;

        return (
          <div
            key={pageIndex}
            className={`print-attendance-sheet print-document document-sheet erp-document-surface scale-${printScale} ${densityClass} mx-auto box-border bg-white text-slate-900 flex flex-col justify-between ${
              pageIndex > 0 ? "attendance-print-page-break pt-4 print:pt-0" : ""
            }`}
            style={{
              width: "297mm",
              minWidth: "297mm",
              maxWidth: "297mm",
              height: "210mm",
              minHeight: "210mm",
              maxHeight: "210mm",
              padding: "7mm 7mm",
              boxSizing: "border-box",
            }}
          >
            {/* Top Block: Header + Attendance Table */}
            <div className="w-[283mm]">
              {/* Sheet Header - cleanly spanning the full 283mm printable width */}
              <div className="w-[283mm] border-b-2 border-slate-900 pb-2 mb-2 flex items-center justify-between">
              <div className="flex-1 min-w-0 pr-4">
                <h1 className="text-base sm:text-lg font-black uppercase tracking-wider text-slate-900 leading-tight truncate">
                  {company?.name || "DUBAI ENTERPRISE ERP L.L.C"}
                </h1>
                <p className="text-[9pt] text-slate-600 font-semibold leading-tight mt-0.5 truncate">
                  {company?.trn ? `TRN: ${company.trn}` : "Employee Attendance & Overtime Records"}
                  {company?.address ? ` | ${company.address}` : " | United Arab Emirates"}
                </p>
              </div>
              <div className="text-right shrink-0">
                <div
                  className="inline-block bg-slate-900 text-white font-black px-3.5 py-1 text-[10pt] uppercase rounded tracking-wide shadow-xs"
                  style={colors?.headerBg ? { backgroundColor: colors.headerBg, color: colors.headerTextColor || "#ffffff" } : {}}
                >
                  {mode === "overtime"
                    ? "Employee Overtime Sheet"
                    : mode === "summary"
                    ? "Monthly Payroll & Attendance Summary"
                    : "Employee Attendance Sheet"}
                </div>
                <div className="flex items-center justify-end gap-3 mt-1">
                  <p className="text-[9.5pt] font-extrabold text-slate-700">
                    Month: <span className="text-slate-900 uppercase font-black">{monthName} {year}</span>
                  </p>
                  {totalPages > 1 && (
                    <span className="text-[8.5pt] font-bold bg-slate-100 text-slate-700 px-2 py-0.5 rounded border border-slate-300">
                      Page {pageIndex + 1} of {totalPages}
                    </span>
                  )}
                </div>
              </div>
            </div>

            {/* Main Attendance Table - 283mm exactly: 18mm (Emp No) + 49mm (Name) + 180mm (Days) + 36mm (Summary) */}
            <div className="w-[283mm] overflow-hidden border-2 border-slate-700">
              <table className="w-[283mm] border-collapse table-fixed bg-white">
                <thead>
                  {/* Row 1: Header Titles & Day Numbers */}
                  <tr
                    className="bg-slate-900 text-white leading-tight"
                    style={colors?.headerBg ? { backgroundColor: colors.headerBg, color: colors.headerTextColor || "#ffffff" } : {}}
                  >
                    <th
                      className="border border-slate-600 border-r-2 border-r-slate-400 px-1 text-center font-bold text-[9pt] uppercase tracking-wide bg-slate-900 text-white"
                      style={{ width: "18mm" }}
                    >
                      Emp No
                    </th>
                    <th
                      className="border border-slate-600 border-r-2 border-r-slate-400 px-3 text-left font-bold text-[9pt] uppercase tracking-wide bg-slate-900 text-white"
                      style={{ width: "49mm" }}
                    >
                      Employee Name
                    </th>
                    {days.map((d) => (
                      <th
                        key={d.dayNum}
                        className={`border border-slate-600 px-0 text-center font-bold text-[8.5pt] ${
                          d.isSunday ? "sunday-col-head bg-emerald-600 text-white font-black" : ""
                        }`}
                        style={{ width: `${180 / daysInMonth}mm` }}
                      >
                        {String(d.dayNum).padStart(2, "0")}
                      </th>
                    ))}
                    {mode === "attendance" ? (
                      <>
                        <th className="border border-slate-600 border-l-2 border-l-slate-400 px-0.5 text-center font-bold bg-emerald-800 text-white text-[8.5pt]" style={{ width: "12mm" }}>
                          Pres
                        </th>
                        <th className="border border-slate-600 px-0.5 text-center font-bold bg-rose-800 text-white text-[8.5pt]" style={{ width: "12mm" }}>
                          Abs
                        </th>
                        <th className="border border-slate-600 px-0.5 text-center font-bold bg-slate-800 text-white text-[8.5pt]" style={{ width: "12mm" }}>
                          Total
                        </th>
                      </>
                    ) : mode === "overtime" ? (
                      <>
                        <th className="border border-slate-600 border-l-2 border-l-slate-400 px-0.5 text-center font-bold bg-purple-900 text-white text-[8.5pt]" style={{ width: "18mm" }}>
                          OT Hrs
                        </th>
                        <th className="border border-slate-600 px-0.5 text-center font-bold bg-slate-800 text-white text-[8.5pt]" style={{ width: "18mm" }}>
                          Est. AED
                        </th>
                      </>
                    ) : (
                      <>
                        <th className="border border-slate-600 border-l-2 border-l-slate-400 px-0.5 text-center font-bold bg-emerald-800 text-white text-[8.5pt]" style={{ width: "12mm" }}>
                          Pres
                        </th>
                        <th className="border border-slate-600 px-0.5 text-center font-bold bg-rose-800 text-white text-[8.5pt]" style={{ width: "12mm" }}>
                          Abs
                        </th>
                        <th className="border border-slate-600 px-0.5 text-center font-bold bg-purple-900 text-white text-[8.5pt]" style={{ width: "12mm" }}>
                          OT Hrs
                        </th>
                      </>
                    )}
                  </tr>

                  {/* Row 2: Sub-headers (Days of Week) - NO COLSPAN to preserve independent column boundaries */}
                  <tr className="bg-slate-800 text-slate-300 leading-none">
                    <th
                      className="border border-slate-700 border-r-2 border-r-slate-400 px-1 text-center font-bold text-[7.5pt] text-slate-300 bg-slate-800"
                      style={{ width: "18mm" }}
                    >
                      CODE
                    </th>
                    <th
                      className="border border-slate-700 border-r-2 border-r-slate-400 px-3 text-left font-bold text-[7.5pt] text-slate-300 bg-slate-800"
                      style={{ width: "49mm" }}
                    >
                      Staff ({employees.length})
                    </th>
                    {days.map((d) => (
                      <th
                        key={d.dayNum}
                        className={`border border-slate-700 px-0 text-center font-bold text-[7.5pt] ${
                          d.isSunday ? "sunday-col-subhead bg-emerald-700 text-white font-black" : ""
                        }`}
                        style={{ width: `${180 / daysInMonth}mm` }}
                      >
                        {d.dayOfWeek}
                      </th>
                    ))}
                    {mode === "attendance" ? (
                      <>
                        <th className="border border-slate-700 border-l-2 border-l-slate-400 px-0.5 text-center font-bold text-[7.5pt] bg-emerald-950 text-emerald-300">P</th>
                        <th className="border border-slate-700 px-0.5 text-center font-bold text-[7.5pt] bg-rose-950 text-rose-300">A</th>
                        <th className="border border-slate-700 px-0.5 text-center font-bold text-[7.5pt] bg-slate-900 text-slate-300">Days</th>
                      </>
                    ) : mode === "overtime" ? (
                      <>
                        <th className="border border-slate-700 border-l-2 border-l-slate-400 px-0.5 text-center font-bold text-[7.5pt] bg-purple-950 text-purple-300">Total</th>
                        <th className="border border-slate-700 px-0.5 text-center font-bold text-[7.5pt] bg-slate-900 text-slate-300">Pay</th>
                      </>
                    ) : (
                      <>
                        <th className="border border-slate-700 border-l-2 border-l-slate-400 px-0.5 text-center font-bold text-[7.5pt] bg-emerald-950 text-emerald-300">P</th>
                        <th className="border border-slate-700 px-0.5 text-center font-bold text-[7.5pt] bg-rose-950 text-rose-300">A</th>
                        <th className="border border-slate-700 px-0.5 text-center font-bold text-[7.5pt] bg-purple-950 text-purple-300">OT</th>
                      </>
                    )}
                  </tr>
                </thead>

                <tbody>
                  {chunk.map((emp, idxOnPage) => {
                    let pCount = 0;
                    let aCount = 0;
                    let otherCount = 0;
                    let totalOtHours = 0;

                    return (
                      <tr
                        key={emp.id}
                        className={`${idxOnPage % 2 === 0 ? "bg-white" : "bg-slate-50"} leading-tight`}
                        style={{ height: `${rowHeightMm}mm` }}
                      >
                        <td
                          className="border border-slate-300 border-r-2 border-r-slate-400 px-1 text-center font-bold font-mono text-slate-900 bg-slate-50/90 text-[10pt] whitespace-nowrap"
                          style={{ width: "18mm", height: `${rowHeightMm}mm` }}
                        >
                          {formatEmployeeCode(emp.employee_number)}
                        </td>
                        <td
                          className="border border-slate-300 border-r-2 border-r-slate-400 px-3 text-left font-bold text-slate-900 text-[10pt] whitespace-nowrap overflow-hidden text-ellipsis"
                          style={{ width: "49mm", height: `${rowHeightMm}mm` }}
                          title={emp.first_name || ""}
                        >
                          {emp.first_name || "Unnamed"}
                        </td>
                        {days.map((d) => {
                          const attStatus = attendanceMap[`${emp.id}_${d.dateStr}`];
                          const otHours = overtimeMap[`${emp.id}_${d.dateStr}`] || 0;

                          if (attStatus === "present") pCount++;
                          else if (attStatus === "absent") aCount++;
                          else if (attStatus) otherCount++;

                          totalOtHours += otHours;

                          if (mode === "overtime") {
                            return (
                              <td
                                key={d.dayNum}
                                className={`border border-slate-300 px-0 text-center font-bold text-[10pt] ${
                                  d.isSunday ? "sunday-col-cell" : ""
                                } ${otHours > 0 ? "text-purple-800 font-black" : "text-slate-300"}`}
                                style={{ width: `${180 / daysInMonth}mm`, height: `${rowHeightMm}mm` }}
                              >
                                {otHours > 0 ? otHours : ""}
                              </td>
                            );
                          }

                          let badge = "";
                          let cellColor = "";
                          let cellStyle: React.CSSProperties = {};
                          if (attStatus === "present") {
                            badge = "P";
                            if (colors?.presentColor) {
                              cellStyle = { color: colors.presentColor, fontWeight: "bold" };
                            } else {
                              cellColor = "text-emerald-700 font-bold";
                            }
                          } else if (attStatus === "absent") {
                            badge = "A";
                            if (colors?.absentColor) {
                              cellStyle = { color: colors.absentColor, fontWeight: "bold", backgroundColor: `${colors.absentColor}15` };
                            } else {
                              cellColor = "text-rose-700 font-black bg-rose-50/60";
                            }
                          } else if (attStatus === "leave") {
                            badge = "L";
                            if (colors?.leaveColor) {
                              cellStyle = { color: colors.leaveColor, fontWeight: "bold" };
                            } else {
                              cellColor = "text-amber-700 font-bold";
                            }
                          } else if (attStatus === "holiday") {
                            badge = "H";
                            if (colors?.holidayColor) {
                              cellStyle = { color: colors.holidayColor, fontWeight: "bold" };
                            } else {
                              cellColor = "text-sky-700 font-bold";
                            }
                          } else if (attStatus === "late") {
                            badge = "HD";
                            cellColor = "text-indigo-700 font-bold";
                          }

                          return (
                            <td
                              key={d.dayNum}
                              className={`border border-slate-300 px-0 text-center text-[10pt] font-extrabold ${
                                d.isSunday ? "sunday-col-cell" : ""
                              } ${cellColor}`}
                              style={{ width: `${180 / daysInMonth}mm`, height: `${rowHeightMm}mm`, ...cellStyle }}
                            >
                              {badge}
                            </td>
                          );
                        })}

                        {/* Summary Columns */}
                        {mode === "attendance" ? (
                          <>
                            <td
                              className="border border-slate-300 border-l-2 border-l-slate-400 px-0.5 text-center font-bold text-emerald-800 bg-emerald-50/50 text-[10pt]"
                              style={{ width: "12mm", height: `${rowHeightMm}mm` }}
                            >
                              {pCount}
                            </td>
                            <td
                              className="border border-slate-300 px-0.5 text-center font-bold text-rose-800 bg-rose-50/50 text-[10pt]"
                              style={{ width: "12mm", height: `${rowHeightMm}mm` }}
                            >
                              {aCount}
                            </td>
                            <td
                              className="border border-slate-300 px-0.5 text-center font-black text-slate-900 bg-slate-100/50 text-[10pt]"
                              style={{ width: "12mm", height: `${rowHeightMm}mm` }}
                            >
                              {pCount + aCount + otherCount}
                            </td>
                          </>
                        ) : mode === "overtime" ? (
                          <>
                            <td
                              className="border border-slate-300 border-l-2 border-l-slate-400 px-0.5 text-center font-black text-purple-900 bg-purple-50/60 text-[10pt]"
                              style={{ width: "18mm", height: `${rowHeightMm}mm` }}
                            >
                              {totalOtHours > 0 ? totalOtHours.toFixed(1) : "0"}
                            </td>
                            <td
                              className="border border-slate-300 px-0.5 text-right font-bold text-slate-800 pr-1.5 text-[9.5pt]"
                              style={{ width: "18mm", height: `${rowHeightMm}mm` }}
                            >
                              {emp.basic_salary
                                ? ((Number(emp.basic_salary) / 30 / 8) * 1.25 * totalOtHours).toLocaleString("en-US", {
                                    minimumFractionDigits: 0,
                                    maximumFractionDigits: 0,
                                  })
                                : "—"}
                            </td>
                          </>
                        ) : (
                          <>
                            <td
                              className="border border-slate-300 border-l-2 border-l-slate-400 px-0.5 text-center font-bold text-emerald-800 text-[10pt]"
                              style={{ width: "12mm", height: `${rowHeightMm}mm` }}
                            >
                              {pCount}
                            </td>
                            <td
                              className="border border-slate-300 px-0.5 text-center font-bold text-rose-800 text-[10pt]"
                              style={{ width: "12mm", height: `${rowHeightMm}mm` }}
                            >
                              {aCount}
                            </td>
                            <td
                              className="border border-slate-300 px-0.5 text-center font-black text-purple-900 bg-purple-50/60 text-[10pt]"
                              style={{ width: "12mm", height: `${rowHeightMm}mm` }}
                            >
                              {totalOtHours.toFixed(1)}
                            </td>
                          </>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            </div>

            {/* Bottom Block: Signatures & Legend Footnote - pinned to bottom of page */}
            <div className="w-[283mm] mt-auto pt-2">
              {(isLastPage || totalPages === 1) ? (
                <>
                  {/* Signature Section - 3 evenly spaced corporate verification blocks */}
                  <div className="attendance-print-signatures pt-2 border-t-2 border-slate-700 break-inside-avoid flex items-start justify-between w-[283mm]">
                    <div className="text-center" style={{ width: "88mm" }}>
                      <div className="h-10 border-b-2 border-dashed border-slate-400 mb-1.5 flex items-end justify-center pb-0.5">
                        <span className="text-[7.5pt] text-slate-400 italic">Authorized Signature &amp; Stamp</span>
                      </div>
                      <p className="font-extrabold text-slate-900 text-[9.5pt] uppercase tracking-wide">Prepared By</p>
                      <p className="text-[8pt] font-semibold text-slate-600">Site Timekeeper / HR Department</p>
                      <p className="text-[7.5pt] text-slate-400 mt-0.5">Date: ____ / ____ / {year}</p>
                    </div>
                    <div className="text-center" style={{ width: "88mm" }}>
                      <div className="h-10 border-b-2 border-dashed border-slate-400 mb-1.5 flex items-end justify-center pb-0.5">
                        <span className="text-[7.5pt] text-slate-400 italic">Authorized Signature &amp; Stamp</span>
                      </div>
                      <p className="font-extrabold text-slate-900 text-[9.5pt] uppercase tracking-wide">Checked By</p>
                      <p className="text-[8pt] font-semibold text-slate-600">Project Manager / Site Engineer</p>
                      <p className="text-[7.5pt] text-slate-400 mt-0.5">Date: ____ / ____ / {year}</p>
                    </div>
                    <div className="text-center" style={{ width: "88mm" }}>
                      <div className="h-10 border-b-2 border-dashed border-slate-400 mb-1.5 flex items-end justify-center pb-0.5">
                        <span className="text-[7.5pt] text-slate-400 italic">Authorized Signature &amp; Stamp</span>
                      </div>
                      <p className="font-extrabold text-slate-900 text-[9.5pt] uppercase tracking-wide">Approved By</p>
                      <p className="text-[8pt] font-semibold text-slate-600">Managing Director / Finance Controller</p>
                      <p className="text-[7.5pt] text-slate-400 mt-0.5">Date: ____ / ____ / {year}</p>
                    </div>
                  </div>

                  {/* Bottom Legend Footnote */}
                  <div className="w-[283mm] mt-2 pt-1 border-t border-slate-200 flex items-center justify-between text-[7.5pt] text-slate-500">
                    <div>
                      <span className="font-bold text-slate-700">STATUS LEGEND: </span>
                      <span className="font-bold text-emerald-700">P</span> = Present |{" "}
                      <span className="font-bold text-rose-700">A</span> = Absent |{" "}
                      <span className="font-bold text-amber-700">L</span> = Leave |{" "}
                      <span className="font-bold text-sky-700">H</span> = Holiday |{" "}
                      <span className="font-bold text-indigo-700">HD</span> = Half Day |{" "}
                      <span className="font-bold text-purple-700">OT</span> = Overtime
                    </div>
                    <div className="font-mono text-slate-400">
                      Dubai ERP Document Standard • Audit Verified
                    </div>
                  </div>
                </>
              ) : (
                <div className="w-[283mm] pt-1.5 border-t border-slate-200 flex items-center justify-between text-[8pt] text-slate-500">
                  <span className="font-medium text-slate-600">Official Attendance &amp; Overtime Record</span>
                  <span className="font-bold text-slate-800">Continued on Page {pageIndex + 2} of {totalPages} →</span>
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

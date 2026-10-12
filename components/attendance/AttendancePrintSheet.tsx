"use client";
import React from "react";
import { CompanyDocInfo } from "@/components/documents/DocHeader";
import { EmployeeInfo } from "./AttendanceImportModal";
import { MONTH_NAMES, formatEmployeeCode } from "@/lib/helpers";

interface AttendancePrintSheetProps {
  company: CompanyDocInfo | null;
  year: number;
  month: number;
  mode: "attendance" | "overtime" | "summary";
  employees: EmployeeInfo[];
  attendanceMap: Record<string, string>; // `${empId}_${dateStr}` -> status
  overtimeMap: Record<string, number>; // `${empId}_${dateStr}` -> hours
  forceSinglePage?: boolean;
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

  // Determine whether to chunk into multiple pages (> 30 employees unless forceSinglePage is set)
  const isMultiPage = !forceSinglePage && employees.length > 30;
  const pageSize = 24;
  const employeeChunks: EmployeeInfo[][] = isMultiPage
    ? Array.from({ length: Math.ceil(employees.length / pageSize) }, (_, idx) =>
        employees.slice(idx * pageSize, (idx + 1) * pageSize)
      )
    : [employees];

  // Dynamic density tier based on rows per page
  const rowsOnPage = isMultiPage ? pageSize : employees.length;
  const densityClass =
    rowsOnPage > 24
      ? "density-tight"
      : rowsOnPage > 15
      ? "density-compact"
      : "density-spacious";

  const totalPages = employeeChunks.length;

  return (
    <div className="attendance-print-root w-full bg-white text-slate-900 font-sans print:p-0 print:m-0">
      <style dangerouslySetInnerHTML={{ __html: `
        @page {
          size: A4 landscape;
          margin: 5mm;
        }
        @media print {
          @page {
            size: A4 landscape;
            margin: 5mm;
          }
          body {
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }
        }
      `}} />

      {employeeChunks.map((chunk, pageIndex) => {
        const isLastPage = pageIndex === totalPages - 1;

        return (
          <div
            key={pageIndex}
            className={`print-attendance-sheet ${densityClass} mx-auto box-border bg-white text-slate-900 ${
              pageIndex > 0 ? "attendance-print-page-break pt-4 print:pt-0" : ""
            }`}
            style={{ width: "287mm" }}
          >
            {/* Sheet Header */}
            <div className="border-b-2 border-slate-900 pb-1 mb-1.5 flex items-start justify-between">
              <div>
                <h1 className="text-sm font-black uppercase tracking-wider text-slate-900 leading-tight">
                  {company?.name || "DUBAI ENTERPRISE ERP L.L.C"}
                </h1>
                <p className="text-[8.5px] text-slate-500 font-medium leading-tight mt-0.5">
                  {company?.trn ? `TRN: ${company.trn}` : "Employee Attendance & Overtime Records"}
                  {company?.address ? ` | ${company.address}` : " | United Arab Emirates"}
                </p>
              </div>
              <div className="text-right">
                <div className="inline-block bg-slate-900 text-white font-bold px-2 py-0.5 text-[9.5px] uppercase rounded">
                  {mode === "overtime"
                    ? "Employee Overtime Sheet"
                    : mode === "summary"
                    ? "Monthly Payroll & Attendance Summary"
                    : "Employee Attendance Sheet"}
                </div>
                <div className="flex items-center justify-end gap-3 mt-0.5">
                  <p className="text-[8.5px] font-bold text-slate-700">
                    Month: <span className="text-slate-900 uppercase font-black">{monthName} {year}</span>
                  </p>
                  {totalPages > 1 && (
                    <span className="text-[8px] font-bold bg-slate-100 text-slate-700 px-1.5 py-0.2 rounded border border-slate-300">
                      Page {pageIndex + 1} of {totalPages}
                    </span>
                  )}
                </div>
              </div>
            </div>

            {/* Main Table */}
            <div className="w-full overflow-hidden border border-slate-700">
              <table className="w-full border-collapse border border-slate-700 table-fixed">
                <thead>
                  {/* Row 1: Header Titles & Day Numbers */}
                  <tr className="bg-slate-900 text-white leading-tight">
                    <th className="border border-slate-600 px-1 text-left font-bold" style={{ width: "14mm" }}>
                      Emp No
                    </th>
                    <th className="border border-slate-600 px-1 text-left font-bold truncate" style={{ width: "42mm" }}>
                      Employee Name
                    </th>
                    {days.map((d) => (
                      <th
                        key={d.dayNum}
                        className={`border border-slate-600 px-0 text-center font-bold ${
                          d.isSunday ? "bg-emerald-600 text-white" : ""
                        }`}
                        style={{ width: `${198 / daysInMonth}mm` }}
                      >
                        {String(d.dayNum).padStart(2, "0")}
                      </th>
                    ))}
                    {mode === "attendance" ? (
                      <>
                        <th className="border border-slate-600 px-0.5 text-center font-bold bg-emerald-800 text-white" style={{ width: "10mm" }}>
                          Pres
                        </th>
                        <th className="border border-slate-600 px-0.5 text-center font-bold bg-rose-800 text-white" style={{ width: "10mm" }}>
                          Abs
                        </th>
                        <th className="border border-slate-600 px-0.5 text-center font-bold bg-slate-800 text-white" style={{ width: "11mm" }}>
                          Total
                        </th>
                      </>
                    ) : mode === "overtime" ? (
                      <>
                        <th className="border border-slate-600 px-0.5 text-center font-bold bg-purple-900 text-white" style={{ width: "14mm" }}>
                          OT Hrs
                        </th>
                        <th className="border border-slate-600 px-0.5 text-center font-bold bg-slate-800 text-white" style={{ width: "17mm" }}>
                          Est. AED
                        </th>
                      </>
                    ) : (
                      <>
                        <th className="border border-slate-600 px-0.5 text-center font-bold bg-emerald-800 text-white" style={{ width: "10mm" }}>
                          Pres
                        </th>
                        <th className="border border-slate-600 px-0.5 text-center font-bold bg-rose-800 text-white" style={{ width: "10mm" }}>
                          Abs
                        </th>
                        <th className="border border-slate-600 px-0.5 text-center font-bold bg-purple-900 text-white" style={{ width: "11mm" }}>
                          OT Hrs
                        </th>
                      </>
                    )}
                  </tr>

                  {/* Row 2: Sub-headers (Days of Week) */}
                  <tr className="bg-slate-800 text-slate-300 leading-none">
                    <th className="border border-slate-700 px-1 text-left font-normal" colSpan={2}>
                      Labourers: {employees.length} {totalPages > 1 ? `(Showing ${pageIndex * pageSize + 1}-${Math.min((pageIndex + 1) * pageSize, employees.length)})` : ""}
                    </th>
                    {days.map((d) => (
                      <th
                        key={d.dayNum}
                        className={`border border-slate-700 px-0 text-center font-normal ${
                          d.isSunday ? "bg-emerald-700 text-white font-bold" : ""
                        }`}
                      >
                        {d.dayOfWeek}
                      </th>
                    ))}
                    {mode === "attendance" ? (
                      <>
                        <th className="border border-slate-700 px-0.5 text-center font-normal bg-emerald-950">P</th>
                        <th className="border border-slate-700 px-0.5 text-center font-normal bg-rose-950">A</th>
                        <th className="border border-slate-700 px-0.5 text-center font-normal bg-slate-900">Days</th>
                      </>
                    ) : mode === "overtime" ? (
                      <>
                        <th className="border border-slate-700 px-0.5 text-center font-normal bg-purple-950">Total</th>
                        <th className="border border-slate-700 px-0.5 text-center font-normal bg-slate-900">Pay</th>
                      </>
                    ) : (
                      <>
                        <th className="border border-slate-700 px-0.5 text-center font-normal bg-emerald-950">P</th>
                        <th className="border border-slate-700 px-0.5 text-center font-normal bg-rose-950">A</th>
                        <th className="border border-slate-700 px-0.5 text-center font-normal bg-purple-950">OT</th>
                      </>
                    )}
                  </tr>
                </thead>

                <tbody>
                  {chunk.map((emp, idxOnPage) => {
                    const globalIdx = pageIndex * pageSize + idxOnPage;
                    let pCount = 0;
                    let aCount = 0;
                    let otherCount = 0;
                    let totalOtHours = 0;

                    return (
                      <tr
                        key={emp.id}
                        className={`${idxOnPage % 2 === 0 ? "bg-white" : "bg-slate-50"} leading-tight`}
                      >
                        <td className="border border-slate-300 px-1 font-bold font-mono text-slate-800 whitespace-nowrap">
                          {formatEmployeeCode(emp.employee_number, globalIdx)}
                        </td>
                        <td className="border border-slate-300 px-1 font-medium text-slate-900 whitespace-nowrap truncate">
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
                                className={`border border-slate-300 px-0 text-center font-bold ${
                                  d.isSunday ? "bg-emerald-50/70" : ""
                                } ${otHours > 0 ? "text-purple-800 font-black" : "text-slate-300"}`}
                              >
                                {otHours > 0 ? otHours : ""}
                              </td>
                            );
                          }

                          let badge = "";
                          let cellColor = "";
                          if (attStatus === "present") {
                            badge = "P";
                            cellColor = "text-emerald-700 font-bold";
                          } else if (attStatus === "absent") {
                            badge = "A";
                            cellColor = "text-rose-700 font-black bg-rose-50/60";
                          } else if (attStatus === "leave") {
                            badge = "L";
                            cellColor = "text-amber-700 font-bold";
                          } else if (attStatus === "holiday") {
                            badge = "H";
                            cellColor = "text-sky-700 font-bold";
                          } else if (attStatus === "late") {
                            badge = "HD";
                            cellColor = "text-indigo-700 font-bold";
                          }

                          return (
                            <td
                              key={d.dayNum}
                              className={`border border-slate-300 px-0 text-center ${
                                d.isSunday ? "bg-emerald-50/70" : ""
                              } ${cellColor}`}
                            >
                              {badge}
                            </td>
                          );
                        })}

                        {/* Summary Columns */}
                        {mode === "attendance" ? (
                          <>
                            <td className="border border-slate-300 px-0.5 text-center font-bold text-emerald-700 bg-emerald-50/40">
                              {pCount}
                            </td>
                            <td className="border border-slate-300 px-0.5 text-center font-bold text-rose-700 bg-rose-50/40">
                              {aCount}
                            </td>
                            <td className="border border-slate-300 px-0.5 text-center font-bold text-slate-800">
                              {pCount + aCount + otherCount}
                            </td>
                          </>
                        ) : mode === "overtime" ? (
                          <>
                            <td className="border border-slate-300 px-0.5 text-center font-black text-purple-900 bg-purple-50/60">
                              {totalOtHours > 0 ? totalOtHours.toFixed(1) : "0"}
                            </td>
                            <td className="border border-slate-300 px-0.5 text-right font-bold text-slate-800 pr-1">
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
                            <td className="border border-slate-300 px-0.5 text-center font-bold text-emerald-700">
                              {pCount}
                            </td>
                            <td className="border border-slate-300 px-0.5 text-center font-bold text-rose-700">
                              {aCount}
                            </td>
                            <td className="border border-slate-300 px-0.5 text-center font-black text-purple-900 bg-purple-50/60">
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

            {/* Signature Section on the last page (or every page if single-page) */}
            {(isLastPage || totalPages === 1) && (
              <div className="attendance-print-signatures mt-2 pt-1 border-t border-slate-300 break-inside-avoid">
                <div>
                  <div className="h-4 border-b border-dashed border-slate-400 mb-0.5" />
                  <p className="font-bold text-slate-800 text-[8.5px]">Prepared By</p>
                  <p className="text-[7.5px] text-slate-500">Site Timekeeper / HR</p>
                </div>
                <div>
                  <div className="h-4 border-b border-dashed border-slate-400 mb-0.5" />
                  <p className="font-bold text-slate-800 text-[8.5px]">Checked By</p>
                  <p className="text-[7.5px] text-slate-500">Project Manager / Engineer</p>
                </div>
                <div>
                  <div className="h-4 border-b border-dashed border-slate-400 mb-0.5" />
                  <p className="font-bold text-slate-800 text-[8.5px]">Approved By</p>
                  <p className="text-[7.5px] text-slate-500">Managing Director / Finance</p>
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

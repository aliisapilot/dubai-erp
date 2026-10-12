"use client";
import React, { useState, useId } from "react";
import * as XLSX from "xlsx";
import { Upload, X, CheckCircle2, AlertTriangle, FileSpreadsheet, Loader2, ArrowRight } from "lucide-react";
import { MONTH_NAMES, formatEmployeeCode } from "@/lib/helpers";

export type AttendanceStatus = "present" | "absent" | "leave" | "holiday" | "late" | "early_departure";

export interface EmployeeInfo {
  id: string;
  employee_number: string | null;
  first_name: string | null;
  basic_salary?: number | null;
}

export interface ParsedAttendanceEntry {
  employee_id: string;
  attendance_date: string; // YYYY-MM-DD
  status: AttendanceStatus;
  regular_hours: number;
}

export interface ParsedOvertimeEntry {
  employee_id: string;
  overtime_date: string; // YYYY-MM-DD
  hours: number;
}

interface AttendanceImportModalProps {
  isOpen: boolean;
  onClose: () => void;
  employees: EmployeeInfo[];
  defaultYear: number;
  defaultMonth: number;
  onImportComplete: (attendance: ParsedAttendanceEntry[], overtime: ParsedOvertimeEntry[], overwrite: boolean) => Promise<void>;
}

export default function AttendanceImportModal({
  isOpen,
  onClose,
  employees,
  defaultYear,
  defaultMonth,
  onImportComplete,
}: AttendanceImportModalProps) {
  const fileInputId = useId();
  const [fileName, setFileName] = useState("");
  const [parsing, setParsing] = useState(false);
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState("");
  const [targetYear, setTargetYear] = useState(defaultYear);
  const [targetMonth, setTargetMonth] = useState(defaultMonth);
  const [overwriteExisting, setOverwriteExisting] = useState(true);
  const [importAttendance, setImportAttendance] = useState(true);
  const [importOvertime, setImportOvertime] = useState(true);

  // Parsed results
  const [matchedEmployeesCount, setMatchedEmployeesCount] = useState(0);
  const [unmatchedRows, setUnmatchedRows] = useState<{ rawCode: string; rawName: string; rowIndex: number }[]>([]);
  const [manualMappings, setManualMappings] = useState<Record<number, string>>({}); // rowIndex -> employeeId
  const [parsedAttendance, setParsedAttendance] = useState<ParsedAttendanceEntry[]>([]);
  const [parsedOvertime, setParsedOvertime] = useState<ParsedOvertimeEntry[]>([]);
  const [rawSheetData, setRawSheetData] = useState<{
    attRows: { empId: string | null; rawCode: string; rawName: string; rowIndex: number; days: Record<number, string> }[];
    otRows: { empId: string | null; rawCode: string; rawName: string; rowIndex: number; days: Record<number, number> }[];
  } | null>(null);

  if (!isOpen) return null;

  function normalizeCode(code: unknown): string {
    return String(code || "").trim().toUpperCase().replace(/[\s\-_]/g, "");
  }

  function normalizeName(name: unknown): string {
    return String(name || "").trim().toLowerCase().replace(/\s+/g, " ");
  }

  function findEmployeeMatch(rawCode: string, rawName: string): EmployeeInfo | undefined {
    const cleanCode = normalizeCode(rawCode);
    const cleanName = normalizeName(rawName);

    // 1. Try matching by employee number
    if (cleanCode) {
      const matchByCode = employees.find(e => normalizeCode(e.employee_number) === cleanCode);
      if (matchByCode) return matchByCode;
      // also check numeric part match: EMP01 matches EMP-1 or 1
      const numCode = cleanCode.replace(/[^0-9]/g, "");
      if (numCode) {
        const matchByNum = employees.find(e => normalizeCode(e.employee_number).replace(/[^0-9]/g, "") === numCode);
        if (matchByNum) return matchByNum;
      }
    }

    // 2. Try matching by name
    if (cleanName) {
      const matchByName = employees.find(e => normalizeName(e.first_name) === cleanName);
      if (matchByName) return matchByName;
      // Partial name match
      const matchPartial = employees.find(e => {
        const n = normalizeName(e.first_name);
        return n && (cleanName.includes(n) || n.includes(cleanName));
      });
      if (matchPartial) return matchPartial;
    }

    return undefined;
  }

  async function handleFileSelected(e: React.ChangeEvent<HTMLInputElement>) {
    const selectedFile = e.target.files?.[0];
    if (!selectedFile) return;

    setFileName(selectedFile.name);
    setError("");
    setParsing(true);

    try {
      const buffer = await selectedFile.arrayBuffer();
      const workbook = XLSX.read(buffer, { type: "array" });

      // Identify attendance and overtime sheets
      const sheetNames = workbook.SheetNames;
      const attSheetName = sheetNames.find(n => /attend/i.test(n)) || sheetNames[0];
      const otSheetName = sheetNames.find(n => /overtime|ot/i.test(n));

      // Parse Attendance Sheet
      const attWorksheet = workbook.Sheets[attSheetName];
      const attJson = attWorksheet ? (XLSX.utils.sheet_to_json(attWorksheet, { header: 1 }) as unknown[][]) : [];

      // Parse Overtime Sheet if found
      const otWorksheet = otSheetName ? workbook.Sheets[otSheetName] : null;
      const otJson = otWorksheet ? (XLSX.utils.sheet_to_json(otWorksheet, { header: 1 }) as unknown[][]) : [];

      // Detect header row and date columns in attendance sheet
      let headerRowIndex = -1;
      let colCodeIndex = -1;
      let colNameIndex = -1;
      const dateColMap: Record<number, number> = {}; // colIndex -> dayNumber (1..31)

      for (let r = 0; r < Math.min(10, attJson.length); r++) {
        const row = attJson[r] || [];
        for (let c = 0; c < row.length; c++) {
          const val = String(row[c] || "").trim();
          if (/emp\s*(no|id|code|#)?/i.test(val) && colCodeIndex === -1) {
            colCodeIndex = c;
            headerRowIndex = r;
          }
          if (/name/i.test(val) && colNameIndex === -1) {
            colNameIndex = c;
            headerRowIndex = r;
          }
        }
        if (headerRowIndex !== -1) break;
      }

      // If no explicit header row, fallback to 0 and 1
      if (colCodeIndex === -1) colCodeIndex = 0;
      if (colNameIndex === -1) colNameIndex = 1;
      if (headerRowIndex === -1) headerRowIndex = 2;

      // Detect date columns across rows 0 to headerRowIndex + 1
      for (let r = 0; r <= Math.min(headerRowIndex + 1, attJson.length - 1); r++) {
        const row = attJson[r] || [];
        for (let c = Math.max(colCodeIndex, colNameIndex) + 1; c < row.length; c++) {
          const val = String(row[c] || "").trim();
          // match "01 Oct", "1", "01", "01/10", "1-Oct"
          const matchDay = val.match(/\b([0-2]?[0-9]|3[01])\b/);
          if (matchDay && !dateColMap[c]) {
            const dayNum = parseInt(matchDay[1], 10);
            if (dayNum >= 1 && dayNum <= 31) {
              dateColMap[c] = dayNum;
            }
          }
          // Detect month in headers if present
          for (let m = 0; m < 12; m++) {
            if (new RegExp(MONTH_NAMES[m], "i").test(val) || new RegExp(MONTH_NAMES[m].slice(0, 3), "i").test(val)) {
              setTargetMonth(m + 1);
            }
          }
          // Detect year in headers if present (e.g. 2026)
          const matchYr = val.match(/\b(202[0-9]|203[0-9])\b/);
          if (matchYr) {
            setTargetYear(parseInt(matchYr[1], 10));
          }
        }
      }

      // If no date columns found by string, treat consecutive columns as days 1 to 31
      if (Object.keys(dateColMap).length === 0) {
        let startCol = Math.max(colCodeIndex, colNameIndex) + 1;
        for (let day = 1; day <= 31; day++) {
          dateColMap[startCol] = day;
          startCol++;
        }
      }

      // Extract rows
      const extractedAttRows: { empId: string | null; rawCode: string; rawName: string; rowIndex: number; days: Record<number, string> }[] = [];
      const extractedOtRows: { empId: string | null; rawCode: string; rawName: string; rowIndex: number; days: Record<number, number> }[] = [];
      const unmatched: { rawCode: string; rawName: string; rowIndex: number }[] = [];
      let matchedCount = 0;

      for (let r = headerRowIndex + 1; r < attJson.length; r++) {
        const row = attJson[r] || [];
        const rawCode = String(row[colCodeIndex] || "").trim();
        const rawName = String(row[colNameIndex] || "").trim();

        if (!rawCode && !rawName) continue; // skip blank row

        const matchedEmp = findEmployeeMatch(rawCode, rawName);
        if (matchedEmp) {
          matchedCount++;
        } else {
          unmatched.push({ rawCode, rawName, rowIndex: r });
        }

        const days: Record<number, string> = {};
        for (const [colIdxStr, dayNum] of Object.entries(dateColMap)) {
          const colIdx = Number(colIdxStr);
          const cellVal = String(row[colIdx] || "").trim().toUpperCase();
          if (cellVal) {
            days[dayNum] = cellVal;
          }
        }

        extractedAttRows.push({
          empId: matchedEmp?.id || null,
          rawCode,
          rawName,
          rowIndex: r,
          days,
        });
      }

      // Process Overtime sheet if present
      if (otJson.length > 0) {
        // Similar detection for OT
        const otHeaderRow = headerRowIndex;
        const otCodeCol = colCodeIndex;
        const otNameCol = colNameIndex;
        const otDateColMap: Record<number, number> = { ...dateColMap };

        for (let r = otHeaderRow + 1; r < otJson.length; r++) {
          const row = otJson[r] || [];
          const rawCode = String(row[otCodeCol] || "").trim();
          const rawName = String(row[otNameCol] || "").trim();
          if (!rawCode && !rawName) continue;

          const matchedEmp = findEmployeeMatch(rawCode, rawName);
          const days: Record<number, number> = {};
          for (const [colIdxStr, dayNum] of Object.entries(otDateColMap)) {
            const colIdx = Number(colIdxStr);
            const num = parseFloat(String(row[colIdx] || ""));
            if (!isNaN(num) && num > 0) {
              days[dayNum] = num;
            }
          }

          extractedOtRows.push({
            empId: matchedEmp?.id || null,
            rawCode,
            rawName,
            rowIndex: r,
            days,
          });
        }
      }

      setMatchedEmployeesCount(matchedCount);
      setUnmatchedRows(unmatched);
      setRawSheetData({ attRows: extractedAttRows, otRows: extractedOtRows });
      buildParsedEntries(extractedAttRows, extractedOtRows, {}, targetYear, targetMonth);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to parse workbook file.");
    } finally {
      setParsing(false);
    }
  }

  function buildParsedEntries(
    attRows: { empId: string | null; rawCode: string; rawName: string; rowIndex: number; days: Record<number, string> }[],
    otRows: { empId: string | null; rawCode: string; rawName: string; rowIndex: number; days: Record<number, number> }[],
    mappings: Record<number, string>,
    year: number,
    month: number
  ) {
    const daysInMonth = new Date(year, month, 0).getDate();
    const attList: ParsedAttendanceEntry[] = [];
    const otList: ParsedOvertimeEntry[] = [];

    // Build Attendance
    for (const row of attRows) {
      const empId = row.empId || mappings[row.rowIndex];
      if (!empId) continue;

      for (const [dayNumStr, val] of Object.entries(row.days)) {
        const day = Number(dayNumStr);
        if (day < 1 || day > daysInMonth) continue;

        const dateStr = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
        let status: AttendanceStatus = "present";
        const v = val.toUpperCase().trim();

        if (v === "A" || v === "ABSENT") status = "absent";
        else if (v === "L" || v === "LEAVE") status = "leave";
        else if (v === "H" || v === "HOLIDAY") status = "holiday";
        else if (v === "HD" || v === "LATE") status = "late";
        else if (v === "P" || v === "PRESENT") status = "present";
        else continue; // ignore non-attendance cells

        attList.push({
          employee_id: empId,
          attendance_date: dateStr,
          status,
          regular_hours: status === "present" ? 8 : 0,
        });
      }
    }

    // Build Overtime
    for (const row of otRows) {
      const empId = row.empId || mappings[row.rowIndex];
      if (!empId) continue;

      for (const [dayNumStr, hours] of Object.entries(row.days)) {
        const day = Number(dayNumStr);
        if (day < 1 || day > daysInMonth) continue;
        if (hours <= 0) continue;

        const dateStr = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
        otList.push({
          employee_id: empId,
          overtime_date: dateStr,
          hours,
        });
      }
    }

    setParsedAttendance(attList);
    setParsedOvertime(otList);
  }

  function handleManualMappingChange(rowIndex: number, empId: string) {
    const updated = { ...manualMappings, [rowIndex]: empId };
    setManualMappings(updated);
    if (rawSheetData) {
      buildParsedEntries(rawSheetData.attRows, rawSheetData.otRows, updated, targetYear, targetMonth);
    }
  }

  function handleYearMonthChange(newYear: number, newMonth: number) {
    setTargetYear(newYear);
    setTargetMonth(newMonth);
    if (rawSheetData) {
      buildParsedEntries(rawSheetData.attRows, rawSheetData.otRows, manualMappings, newYear, newMonth);
    }
  }

  async function handleConfirmImport() {
    if (parsedAttendance.length === 0 && parsedOvertime.length === 0) {
      setError("No valid attendance or overtime records found to import.");
      return;
    }

    setImporting(true);
    setError("");

    try {
      const attToImport = importAttendance ? parsedAttendance : [];
      const otToImport = importOvertime ? parsedOvertime : [];
      await onImportComplete(attToImport, otToImport, overwriteExisting);
      onClose();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to import attendance data.");
    } finally {
      setImporting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs overflow-y-auto">
      <div className="relative w-full max-w-3xl rounded-2xl bg-white shadow-2xl border border-slate-200 overflow-hidden my-8">
        {/* Modal Header */}
        <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4 bg-slate-900 text-white">
          <div className="flex items-center gap-3">
            <div className="rounded-lg bg-emerald-500/20 p-2 text-emerald-400">
              <FileSpreadsheet size={20} />
            </div>
            <div>
              <h2 className="text-lg font-bold text-white">Import Excel Attendance Workbook</h2>
              <p className="text-xs text-slate-300">Matches labourers safely and imports monthly P/A and Overtime</p>
            </div>
          </div>
          <button onClick={onClose} disabled={importing} className="rounded-lg p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 transition">
            <X size={20} />
          </button>
        </div>

        <div className="p-6 space-y-6 max-h-[75vh] overflow-y-auto">
          {error && (
            <div className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700 flex items-start gap-2.5">
              <AlertTriangle size={18} className="shrink-0 mt-0.5 text-rose-600" />
              <span>{error}</span>
            </div>
          )}

          {/* File Upload Section */}
          {!rawSheetData ? (
            <div className="border-2 border-dashed border-slate-300 rounded-2xl p-8 text-center hover:border-slate-500 transition bg-slate-50">
              <input
                type="file"
                id={fileInputId}
                accept=".xlsx, .xls, .csv"
                onChange={handleFileSelected}
                className="hidden"
                disabled={parsing}
              />
              <label htmlFor={fileInputId} className="cursor-pointer flex flex-col items-center">
                <div className="rounded-2xl bg-white p-4 shadow-sm border border-slate-200 text-slate-700 mb-3">
                  {parsing ? <Loader2 size={32} className="animate-spin text-emerald-600" /> : <Upload size={32} className="text-emerald-600" />}
                </div>
                <span className="text-base font-semibold text-slate-800">
                  {parsing ? "Analyzing workbook..." : "Click to select your Excel Attendance workbook"}
                </span>
                <span className="text-xs text-slate-500 mt-1">Supports standard .xlsx, .xls, or .csv (matches your Excel Attendance & Overtime tabs)</span>
              </label>
            </div>
          ) : (
            <div className="space-y-6">
              {/* File Info & Target Period */}
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider block">Source File</label>
                  <p className="text-sm font-bold text-slate-900 truncate mt-0.5">{fileName}</p>
                  <label htmlFor={fileInputId} className="text-xs text-emerald-600 hover:underline cursor-pointer inline-block mt-1">Change file</label>
                  <input type="file" id={fileInputId} accept=".xlsx, .xls, .csv" onChange={handleFileSelected} className="hidden" />
                </div>
                <div>
                  <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider block">Target Month</label>
                  <select
                    value={targetMonth}
                    onChange={e => handleYearMonthChange(targetYear, Number(e.target.value))}
                    className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-sm font-semibold text-slate-800 focus:outline-none"
                  >
                    {MONTH_NAMES.map((m, i) => (
                      <option key={i + 1} value={i + 1}>{m}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider block">Target Year</label>
                  <input
                    type="number"
                    min="2020"
                    max="2035"
                    value={targetYear}
                    onChange={e => handleYearMonthChange(Number(e.target.value), targetMonth)}
                    className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-sm font-semibold text-slate-800 focus:outline-none"
                  />
                </div>
              </div>

              {/* Parsing Overview Summary */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="rounded-xl border border-slate-200 bg-white p-3">
                  <span className="text-xs text-slate-500">Matched Labourers</span>
                  <p className="text-lg font-bold text-emerald-600 mt-0.5 flex items-center gap-1.5">
                    <CheckCircle2 size={16} />
                    {matchedEmployeesCount} / {rawSheetData.attRows.length}
                  </p>
                </div>
                <div className="rounded-xl border border-slate-200 bg-white p-3">
                  <span className="text-xs text-slate-500">Attendance Days</span>
                  <p className="text-lg font-bold text-slate-800 mt-0.5">{parsedAttendance.length} entries</p>
                </div>
                <div className="rounded-xl border border-slate-200 bg-white p-3">
                  <span className="text-xs text-slate-500">Overtime Hours</span>
                  <p className="text-lg font-bold text-violet-700 mt-0.5">
                    {parsedOvertime.reduce((s, r) => s + r.hours, 0).toFixed(1)} hrs
                  </p>
                </div>
                <div className="rounded-xl border border-slate-200 bg-white p-3">
                  <span className="text-xs text-slate-500">Unmatched Names</span>
                  <p className={`text-lg font-bold mt-0.5 ${unmatchedRows.length > 0 ? "text-amber-600" : "text-slate-400"}`}>
                    {unmatchedRows.length}
                  </p>
                </div>
              </div>

              {/* Unmatched Labourers Warning & Mapping Dropdown */}
              {unmatchedRows.length > 0 && (
                <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 space-y-3">
                  <div className="flex items-center gap-2">
                    <AlertTriangle size={18} className="text-amber-600" />
                    <h3 className="text-sm font-bold text-amber-900">
                      {unmatchedRows.length} Labourers in Excel could not be matched automatically
                    </h3>
                  </div>
                  <p className="text-xs text-amber-800">
                    Match them to your existing Dubai ERP employees below, or leave as &ldquo;Skip&rdquo; if not needed.
                  </p>
                  <div className="max-h-48 overflow-y-auto space-y-2 pr-1">
                    {unmatchedRows.map(u => (
                      <div key={u.rowIndex} className="flex items-center justify-between gap-3 bg-white p-2.5 rounded-lg border border-amber-200 text-xs">
                        <div className="truncate">
                          <span className="font-bold text-slate-900">{u.rawCode || "No Code"}</span> -{" "}
                          <span className="text-slate-700 font-medium">{u.rawName || "Unnamed"}</span>
                        </div>
                        <div className="flex items-center gap-1.5 shrink-0">
                          <ArrowRight size={14} className="text-slate-400" />
                          <select
                            value={manualMappings[u.rowIndex] || ""}
                            onChange={e => handleManualMappingChange(u.rowIndex, e.target.value)}
                            className="rounded-md border border-slate-300 bg-white px-2 py-1 text-xs focus:outline-none"
                          >
                            <option value="">— Skip Row —</option>
                            {employees.map((e, idx) => (
                              <option key={e.id} value={e.id}>
                                {formatEmployeeCode(e.employee_number, idx)} - {e.first_name}
                              </option>
                            ))}
                          </select>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Import Options Checkboxes */}
              <div className="rounded-xl border border-slate-200 bg-white p-4 space-y-3">
                <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">Import Options</span>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
                  <label className="flex items-center gap-2.5 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={importAttendance}
                      onChange={e => setImportAttendance(e.target.checked)}
                      className="rounded border-slate-300 text-slate-900 focus:ring-slate-900"
                    />
                    <span className="text-slate-800 font-medium">Import Attendance (P / A / Leaves)</span>
                  </label>
                  <label className="flex items-center gap-2.5 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={importOvertime}
                      onChange={e => setImportOvertime(e.target.checked)}
                      className="rounded border-slate-300 text-slate-900 focus:ring-slate-900"
                    />
                    <span className="text-slate-800 font-medium">Import Overtime Hours</span>
                  </label>
                  <label className="flex items-center gap-2.5 cursor-pointer col-span-1 sm:col-span-2">
                    <input
                      type="checkbox"
                      checked={overwriteExisting}
                      onChange={e => setOverwriteExisting(e.target.checked)}
                      className="rounded border-slate-300 text-slate-900 focus:ring-slate-900"
                    />
                    <span className="text-slate-700 text-xs">
                      Overwrite existing records for these dates if they already exist in ERP
                    </span>
                  </label>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="flex items-center justify-between border-t border-slate-200 px-6 py-4 bg-slate-50">
          <button
            type="button"
            onClick={onClose}
            disabled={importing}
            className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-100 transition disabled:opacity-50"
          >
            Cancel
          </button>
          {rawSheetData && (
            <button
              type="button"
              onClick={handleConfirmImport}
              disabled={importing || (parsedAttendance.length === 0 && parsedOvertime.length === 0)}
              className="flex items-center gap-2 rounded-lg bg-emerald-600 px-5 py-2 text-sm font-semibold text-white hover:bg-emerald-500 transition disabled:opacity-50 shadow-xs"
            >
              {importing ? <Loader2 size={16} className="animate-spin" /> : <FileSpreadsheet size={16} />}
              {importing ? "Importing Data..." : `Confirm & Import (${parsedAttendance.length + parsedOvertime.length} Records)`}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

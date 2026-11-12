"use client";
import React, { useEffect, useState, useMemo, useRef } from "react";
import * as XLSX from "xlsx";
import { supabase } from "@/lib/supabase";
import {
  ChevronLeft,
  ChevronRight,
  Save,
  Loader2,
  FileSpreadsheet,
  Printer,
  Download,
  Upload,
  CalendarCheck,
  Clock,
  Sparkles,
  Search,
  Filter,
  Check,
  RotateCcw,
  AlertCircle,
  AlertTriangle,
  HelpCircle,
  X,
  FileText,
  ShieldCheck,
  Settings,
  Palette,
} from "lucide-react";

import { getCompanyId, getCurrentCompany, MONTH_NAMES, fmtAED, formatEmployeeCode, compareEmployees } from "@/lib/helpers";
import { CompanyDocInfo } from "@/components/documents/DocHeader";
import { exportAttendanceToPdf } from "@/lib/exportAttendancePdf";
import AttendanceImportModal, {
  EmployeeInfo,
  ParsedAttendanceEntry,
  ParsedOvertimeEntry,
  AttendanceStatus,
} from "./AttendanceImportModal";
import AttendancePrintSheet, { AttendanceSheetColors } from "./AttendancePrintSheet";
import AttendanceColorCustomizerModal, {
  DEFAULT_ATTENDANCE_COLORS,
  ATTENDANCE_COLORS_STORAGE_KEY,
} from "./AttendanceColorCustomizerModal";
import EmployeePayrollChargesModal from "./EmployeePayrollChargesModal";
import SalarySlipTemplate, { SalarySlipData } from "@/components/documents/SalarySlipTemplate";
import EmployeePaymentVoucherTemplate, { PaymentVoucherData } from "@/components/documents/EmployeePaymentVoucherTemplate";
import PrintModal from "@/components/documents/PrintModal";
import {
  calculateAttendanceTotals,
  calculateOvertimeCharge,
  calculateAuthoritativeMonthlyOvertime,
  calculateCompletePayrollBreakdown,
  getMonthlyAdjustmentsForPeriod,
  saveMonthlyEmployeeAdjustment,
  syncSalaryStatementFromWorkbook,
  MonthlyEmployeeAdjustment,
  DEFAULT_MONTHLY_ADJUSTMENT,
  DEFAULT_PAYROLL_RULES,
  CompletePayrollBreakdown,
  OvertimeCostingMethod,
} from "@/lib/payrollWorkflowService";
import { generateDocumentPdfFilename } from "@/lib/documentFilename";

export type ExtendedEmployeeInfo = EmployeeInfo & {
  designation?: string | null;
  department?: string | null;
  bank_name?: string | null;
  account_number?: string | null;
  iban?: string | null;
  overtime_rate?: number | null;
  overtime_costing_method?: OvertimeCostingMethod | null;
  overtime_multiplier?: number | null;
};

interface MonthlyAttendanceOvertimeSheetProps {
  initialTab?: "attendance" | "overtime" | "summary";
  onSwitchToLegacy?: () => void;
}

export default function MonthlyAttendanceOvertimeSheet({
  initialTab = "attendance",
  onSwitchToLegacy,
}: MonthlyAttendanceOvertimeSheetProps) {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1); // 1-12
  const [activeTab, setActiveTab] = useState<"attendance" | "overtime" | "summary">(initialTab);

  const [employees, setEmployees] = useState<ExtendedEmployeeInfo[]>([]);
  const [attendanceRecords, setAttendanceRecords] = useState<Record<string, { id?: string; status: AttendanceStatus; remarks?: string }>>({});
  const [overtimeRecords, setOvertimeRecords] = useState<Record<string, { id?: string; hours: number; approval_status?: string }>>({});

  // Monthly adjustments (manual present/payable days adjustments, custom overtime rates/charges)
  const [monthlyAdjustments, setMonthlyAdjustments] = useState<Record<string, MonthlyEmployeeAdjustment>>({});
  // Existing salary statements for this month (for sync status indicator)
  const [salaryStatementsForMonth, setSalaryStatementsForMonth] = useState<Record<string, { id: string; status: string; net_salary: number }>>({});

  // Modal states for Payroll Charges, Payslip and Payment Voucher
  const [selectedChargesEmp, setSelectedChargesEmp] = useState<ExtendedEmployeeInfo | null>(null);
  const [activeSlipModal, setActiveSlipModal] = useState<SalarySlipData | null>(null);
  const [activeVoucherModal, setActiveVoucherModal] = useState<PaymentVoucherData | null>(null);
  const [batchSyncing, setBatchSyncing] = useState(false);

  // Pending unsaved edits: key is `${empId}_${dateStr}`
  const [pendingAtt, setPendingAtt] = useState<Record<string, { status: AttendanceStatus; employee_id: string; date: string }>>({});
  const [pendingOt, setPendingOt] = useState<Record<string, { hours: number; employee_id: string; date: string }>>({});

  // UI States
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState("");

  // Excel Box Selection & Range States
  const [selectedCell, setSelectedCell] = useState<{ empIdx: number; dayIdx: number } | null>(null);
  const selectedCellRef = useRef<{ empIdx: number; dayIdx: number } | null>(null);
  selectedCellRef.current = selectedCell;

  const [selectionRange, setSelectionRange] = useState<{
    startEmp: number;
    endEmp: number;
    startDay: number;
    endDay: number;
  } | null>(null);
  const selectionRangeRef = useRef<{
    startEmp: number;
    endEmp: number;
    startDay: number;
    endDay: number;
  } | null>(null);
  selectionRangeRef.current = selectionRange;

  const [isSelectingRange, setIsSelectingRange] = useState(false);
  const isSelectingRangeRef = useRef(false);
  isSelectingRangeRef.current = isSelectingRange;

  const [rangeDragStart, setRangeDragStart] = useState<{ empIdx: number; dayIdx: number } | null>(null);
  const rangeDragStartRef = useRef<{ empIdx: number; dayIdx: number } | null>(null);
  rangeDragStartRef.current = rangeDragStart;

  // Excel Autofill Handle States (Bottom-right corner handle drag)
  const [isDraggingFill, setIsDraggingFill] = useState(false);
  const isDraggingFillRef = useRef(false);
  isDraggingFillRef.current = isDraggingFill;

  const [fillDragSource, setFillDragSource] = useState<{ empIdx: number; dayIdx: number } | null>(null);
  const fillDragSourceRef = useRef<{ empIdx: number; dayIdx: number } | null>(null);
  fillDragSourceRef.current = fillDragSource;

  const [fillDragTarget, setFillDragTarget] = useState<{ empIdx: number; dayIdx: number } | null>(null);
  const fillDragTargetRef = useRef<{ empIdx: number; dayIdx: number } | null>(null);
  fillDragTargetRef.current = fillDragTarget;

  const [customRangeOt, setCustomRangeOt] = useState<string>("2");
  const numberTypingBufferRef = useRef<{ text: string; lastTime: number }>({ text: "", lastTime: 0 });

  const [showImportModal, setShowImportModal] = useState(false);
  const [showPrintModal, setShowPrintModal] = useState(() => {
    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);
      return params.get("print") === "1" || params.get("print") === "true";
    }
    return false;
  });
  const [forceSinglePage, setForceSinglePage] = useState(false);
  const [printScale, setPrintScale] = useState<"auto" | "fit-width" | "actual">("auto");
  const [company, setCompany] = useState<CompanyDocInfo | null>(null);
  const [notification, setNotification] = useState<{ type: "success" | "error"; message: string } | null>(null);
  const [showBulkMenu, setShowBulkMenu] = useState(false);
  const [showColorModal, setShowColorModal] = useState(false);
  const [sheetColors, setSheetColors] = useState<AttendanceSheetColors>(() => {
    if (typeof window === "undefined") return DEFAULT_ATTENDANCE_COLORS;
    try {
      const custom = localStorage.getItem(ATTENDANCE_COLORS_STORAGE_KEY);
      if (custom) return { ...DEFAULT_ATTENDANCE_COLORS, ...JSON.parse(custom) };

      const stored = localStorage.getItem("dubai-erp.custom-color-presets");
      if (stored) {
        const presets = JSON.parse(stored);
        if (Array.isArray(presets) && presets.length > 0) {
          const last = presets[presets.length - 1];
          if (last?.branding) {
            return {
              ...DEFAULT_ATTENDANCE_COLORS,
              sundayHighlight: last.branding.attendanceSundayHighlight || DEFAULT_ATTENDANCE_COLORS.sundayHighlight,
              sundayHeader: last.branding.attendanceSundayHeader || DEFAULT_ATTENDANCE_COLORS.sundayHeader,
              presentColor: last.branding.attendancePresentColor || DEFAULT_ATTENDANCE_COLORS.presentColor,
              absentColor: last.branding.attendanceAbsentColor || DEFAULT_ATTENDANCE_COLORS.absentColor,
              holidayColor: last.branding.attendanceHolidayColor || DEFAULT_ATTENDANCE_COLORS.holidayColor,
              leaveColor: last.branding.attendanceLeaveColor || DEFAULT_ATTENDANCE_COLORS.leaveColor,
              headerBg: last.branding.tableHeaderBg || DEFAULT_ATTENDANCE_COLORS.headerBg,
              headerTextColor: last.branding.tableHeaderTextColor || DEFAULT_ATTENDANCE_COLORS.headerTextColor,
            };
          }
        }
      }
    } catch {
      // Ignore fallback
    }
    return DEFAULT_ATTENDANCE_COLORS;
  });

  const tableContainerRef = useRef<HTMLDivElement>(null);

  // Month navigation
  const daysInMonth = useMemo(() => new Date(year, month, 0).getDate(), [year, month]);
  const monthName = MONTH_NAMES[month - 1] || "";
  const shortMonth = monthName.slice(0, 3);
  const periodStr = `${year}-${String(month).padStart(2, "0")}`;

  const days = useMemo(() => {
    return Array.from({ length: daysInMonth }, (_, i) => {
      const dayNum = i + 1;
      const dateObj = new Date(year, month - 1, dayNum);
      const dayOfWeek = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][dateObj.getDay()];
      const isSunday = dateObj.getDay() === 0;
      const dateStr = `${year}-${String(month).padStart(2, "0")}-${String(dayNum).padStart(2, "0")}`;
      return {
        dayNum,
        dayOfWeek,
        isSunday,
        dateStr,
        label: `${String(dayNum).padStart(2, "0")} ${shortMonth}`,
      };
    });
  }, [year, month, daysInMonth, shortMonth]);

  const [refreshKey, setRefreshKey] = useState(0);

  // Dynamic page style injection to guarantee genuine A4 Landscape (297 x 210 mm)
  // without relying on named pages, and clean up cleanly when closing preview
  useEffect(() => {
    if (!showPrintModal) return;
    const styleId = "attendance-page-size-override";
    let style = document.getElementById(styleId) as HTMLStyleElement | null;
    if (!style) {
      style = document.createElement("style");
      style.id = styleId;
      document.head.appendChild(style);
    }
    style.textContent = `
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
          margin: 0 !important;
          padding: 0 !important;
          background: #ffffff !important;
        }
      }
    `;
    return () => {
      const el = document.getElementById(styleId);
      if (el) el.remove();
    };
  }, [showPrintModal]);

  const [downloadingPdf, setDownloadingPdf] = useState(false);

  const handleDownloadPdf = async () => {
    if (downloadingPdf) return;
    setDownloadingPdf(true);
    try {
      const monthName = MONTH_NAMES[month - 1] || "Month";
      const printRoot = document.querySelector(".print-sheet-modal-dialog") as HTMLElement | null;
      await exportAttendanceToPdf({
        monthName,
        year,
        mode: activeTab,
        containerElement: printRoot,
      });
      setNotification({
        type: "success",
        message: `Successfully downloaded genuine A4 Landscape PDF for ${monthName} ${year}.`,
      });
      setTimeout(() => setNotification(null), 4000);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to export PDF";
      setNotification({
        type: "error",
        message: `PDF Export failed: ${msg}`,
      });
      setTimeout(() => setNotification(null), 5000);
    } finally {
      setDownloadingPdf(false);
    }
  };

  // Load Data Effect
  useEffect(() => {
    let ignore = false;
    async function fetchData() {
      try {
        setLoadError("");
        const startDate = `${periodStr}-01`;
        const endDate = `${periodStr}-${String(daysInMonth).padStart(2, "0")}`;

        const [empsRes, attRes, otRes, comp] = await Promise.all([
          supabase
            .from("employees")
            .select("id, employee_number, first_name, designation, department, bank_name, account_number, iban, basic_salary, status")
            .in("status", ["active", "Active"])
            .order("employee_number"),
          supabase.from("attendance").select("*").gte("attendance_date", startDate).lte("attendance_date", endDate),
          supabase.from("overtime").select("*").gte("overtime_date", startDate).lte("overtime_date", endDate),
          getCurrentCompany(),
        ]);

        if (ignore) return;
        if (comp) setCompany(comp as CompanyDocInfo);

        if (empsRes.error) {
          console.error("[MonthlyAttendanceOvertimeSheet] Error loading employees:", empsRes.error);
          setLoadError(`Database query failed: ${empsRes.error.message}`);
          setEmployees([]);
          setLoading(false);
          return;
        }

        // Natural numerical sort for employee codes (EMP-01, EMP-02 ... EMP-10 ...)
        const sortedEmps = ((empsRes.data || []) as ExtendedEmployeeInfo[]).sort(compareEmployees);
        setEmployees(sortedEmps);

        // Fetch monthly payroll adjustments and existing statements
        if (comp?.id) {
          const [adjs, stmtsRes] = await Promise.all([
            getMonthlyAdjustmentsForPeriod(comp.id, periodStr),
            supabase
              .from("salary_statements")
              .select("id, employee_id, status, net_salary")
              .eq("company_id", comp.id)
              .gte("payroll_month", startDate)
              .lte("payroll_month", `${periodStr}-31`),
          ]);
          if (!ignore) {
            setMonthlyAdjustments(adjs);
            const sMap: Record<string, { id: string; status: string; net_salary: number }> = {};
            (stmtsRes.data || []).forEach(s => {
              if (s.employee_id) sMap[s.employee_id] = { id: s.id, status: s.status, net_salary: Number(s.net_salary) || 0 };
            });
            setSalaryStatementsForMonth(sMap);
          }
        }

        // Map Attendance
        const aMap: Record<string, { id?: string; status: AttendanceStatus; remarks?: string }> = {};
        (attRes.data || []).forEach(r => {
          if (r.employee_id && r.attendance_date) {
            const cleanDate = String(r.attendance_date).split("T")[0].trim();
            aMap[`${r.employee_id}_${cleanDate}`] = {
              id: r.id,
              status: (r.status as AttendanceStatus) || "present",
              remarks: r.remarks,
            };
          }
        });
        setAttendanceRecords(aMap);

        // Map Overtime with date normalization, multiple-entry summation, and attendance fallback
        const oMap: Record<string, { id?: string; hours: number; approval_status?: string }> = {};
        (otRes.data || []).forEach(r => {
          if (r.employee_id && r.overtime_date) {
            const cleanDate = String(r.overtime_date).split("T")[0].trim();
            const key = `${r.employee_id}_${cleanDate}`;
            const currentHours = oMap[key]?.hours || 0;
            oMap[key] = {
              id: r.id,
              hours: currentHours + (Number(r.hours) || 0),
              approval_status: r.approval_status || "approved",
            };
          }
        });
        (attRes.data || []).forEach(r => {
          if (r.employee_id && r.attendance_date && Number(r.overtime_hours) > 0) {
            const cleanDate = String(r.attendance_date).split("T")[0].trim();
            const key = `${r.employee_id}_${cleanDate}`;
            if (!oMap[key] || oMap[key].hours === 0) {
              oMap[key] = {
                id: r.id,
                hours: Number(r.overtime_hours) || 0,
                approval_status: "approved",
              };
            }
          }
        });
        setOvertimeRecords(oMap);
        setPendingAtt({});
        setPendingOt({});
      } catch (err: unknown) {
        if (!ignore) {
          const msg = err instanceof Error ? err.message : "Failed to load monthly attendance";
          setLoadError(msg);
          setNotification({
            type: "error",
            message: msg,
          });
        }
      } finally {
        if (!ignore) {
          setLoading(false);
        }
      }
    }

    void fetchData();
    return () => {
      ignore = true;
    };
  }, [periodStr, daysInMonth, refreshKey]);

  // Unsaved changes beforeunload protection
  const hasUnsavedChanges = Object.keys(pendingAtt).length > 0 || Object.keys(pendingOt).length > 0;
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (hasUnsavedChanges) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [hasUnsavedChanges]);

  // Keyboard shortcut Ctrl+S
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "s") {
        e.preventDefault();
        if (hasUnsavedChanges && !saving) {
          void saveAllChanges();
        }
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  });

  // Open print modal via Navbar "Print Page" event or Ctrl+P
  useEffect(() => {
    const handleOpenPrint = () => setShowPrintModal(true);
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "p") {
        e.preventDefault();
        setShowPrintModal(true);
      }
    };
    window.addEventListener("open-attendance-print", handleOpenPrint);
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("open-attendance-print", handleOpenPrint);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, []);

  // Filtered employees (matches name or EMP-01 format)
  const filteredEmployees = useMemo(() => {
    if (!search.trim()) return employees;
    const q = search.toLowerCase().trim();
    return employees.filter((e) => {
      const code = formatEmployeeCode(e.employee_number).toLowerCase();
      const raw = (e.employee_number || "").toLowerCase();
      const name = (e.first_name || "").toLowerCase();
      return name.includes(q) || code.includes(q) || raw.includes(q);
    });
  }, [employees, search]);

  // Normalized Range boundaries for rendering & actions
  const normalizedRange = useMemo(() => {
    if (!selectionRange) return null;
    return {
      minEmp: Math.min(selectionRange.startEmp, selectionRange.endEmp),
      maxEmp: Math.max(selectionRange.startEmp, selectionRange.endEmp),
      minDay: Math.min(selectionRange.startDay, selectionRange.endDay),
      maxDay: Math.max(selectionRange.startDay, selectionRange.endDay),
    };
  }, [selectionRange]);

  const selectedCellCount = useMemo(() => {
    if (!normalizedRange) return 0;
    return (normalizedRange.maxEmp - normalizedRange.minEmp + 1) * (normalizedRange.maxDay - normalizedRange.minDay + 1);
  }, [normalizedRange]);

  const normalizedFillTarget = useMemo(() => {
    if (!isDraggingFill || !fillDragSource || !fillDragTarget) return null;
    return {
      minEmp: Math.min(fillDragSource.empIdx, fillDragTarget.empIdx),
      maxEmp: Math.max(fillDragSource.empIdx, fillDragTarget.empIdx),
      minDay: Math.min(fillDragSource.dayIdx, fillDragTarget.dayIdx),
      maxDay: Math.max(fillDragSource.dayIdx, fillDragTarget.dayIdx),
    };
  }, [isDraggingFill, fillDragSource, fillDragTarget]);

  // Helper getters
  function getAttendanceStatus(empId: string, dateStr: string): AttendanceStatus | "" {
    const key = `${empId}_${dateStr}`;
    if (pendingAtt[key] !== undefined) return pendingAtt[key].status;
    return attendanceRecords[key]?.status || "";
  }

  function getOvertimeHours(empId: string, dateStr: string): number {
    const key = `${empId}_${dateStr}`;
    if (pendingOt[key] !== undefined) return pendingOt[key].hours;
    return overtimeRecords[key]?.hours || 0;
  }

  // Attendance click toggle
  function handleAttendanceCellClick(empId: string, dateStr: string, currentStatus: string) {
    let nextStatus: AttendanceStatus | "" = "present";
    if (!currentStatus) nextStatus = "present";
    else if (currentStatus === "present") nextStatus = "absent";
    else if (currentStatus === "absent") nextStatus = "leave";
    else if (currentStatus === "leave") nextStatus = "holiday";
    else if (currentStatus === "holiday") nextStatus = ""; // clear
    else nextStatus = "present";

    const key = `${empId}_${dateStr}`;
    if (!nextStatus) {
      setPendingAtt(prev => ({ ...prev, [key]: { status: "" as AttendanceStatus, employee_id: empId, date: dateStr } }));
    } else {
      setPendingAtt(prev => ({ ...prev, [key]: { status: nextStatus as AttendanceStatus, employee_id: empId, date: dateStr } }));
    }
  }

  // Overtime input update
  function handleOvertimeChange(empId: string, dateStr: string, val: string) {
    const hours = Math.max(0, parseFloat(val) || 0);
    const key = `${empId}_${dateStr}`;
    setPendingOt(prev => ({ ...prev, [key]: { hours, employee_id: empId, date: dateStr } }));
  }

  // Excel Box Navigation
  function navigateToCell(newEmpIdx: number, newDayIdx: number, extendSelection: boolean = false) {
    if (filteredEmployees.length === 0 || days.length === 0) return;
    const clampedEmp = Math.max(0, Math.min(filteredEmployees.length - 1, newEmpIdx));
    const clampedDay = Math.max(0, Math.min(days.length - 1, newDayIdx));

    setSelectedCell({ empIdx: clampedEmp, dayIdx: clampedDay });

    if (extendSelection && selectionRangeRef.current) {
      setSelectionRange({
        startEmp: selectionRangeRef.current.startEmp,
        startDay: selectionRangeRef.current.startDay,
        endEmp: clampedEmp,
        endDay: clampedDay,
      });
    } else {
      setSelectionRange({
        startEmp: clampedEmp,
        endEmp: clampedEmp,
        startDay: clampedDay,
        endDay: clampedDay,
      });
    }

    const emp = filteredEmployees[clampedEmp];
    const day = days[clampedDay];
    if (emp && day) {
      const cellEl = document.getElementById(`cell-${emp.id}-${day.dateStr}`);
      if (cellEl) {
        cellEl.scrollIntoView({ block: "nearest", inline: "nearest" });
      }
    }
  }

  // Selection Range Fill Functions
  function fillSelectedRangeAttendance(status: AttendanceStatus | "") {
    if (!normalizedRange) return;
    const updates: Record<string, { status: AttendanceStatus; employee_id: string; date: string }> = { ...pendingAtt };
    for (let e = normalizedRange.minEmp; e <= normalizedRange.maxEmp; e++) {
      const emp = filteredEmployees[e];
      if (!emp) continue;
      for (let d = normalizedRange.minDay; d <= normalizedRange.maxDay; d++) {
        const day = days[d];
        if (!day) continue;
        updates[`${emp.id}_${day.dateStr}`] = {
          status: status as AttendanceStatus,
          employee_id: emp.id,
          date: day.dateStr,
        };
      }
    }
    setPendingAtt(updates);
  }

  function fillSelectedRangeOvertime(hours: number) {
    if (!normalizedRange) return;
    const updates: Record<string, { hours: number; employee_id: string; date: string }> = { ...pendingOt };
    for (let e = normalizedRange.minEmp; e <= normalizedRange.maxEmp; e++) {
      const emp = filteredEmployees[e];
      if (!emp) continue;
      for (let d = normalizedRange.minDay; d <= normalizedRange.maxDay; d++) {
        const day = days[d];
        if (!day) continue;
        updates[`${emp.id}_${day.dateStr}`] = {
          hours: Math.max(0, hours),
          employee_id: emp.id,
          date: day.dateStr,
        };
      }
    }
    setPendingOt(updates);
  }

  // Column, Row and All selections
  function selectColumn(dayIdx: number) {
    if (filteredEmployees.length === 0) return;
    setSelectedCell({ empIdx: 0, dayIdx });
    setSelectionRange({
      startEmp: 0,
      endEmp: filteredEmployees.length - 1,
      startDay: dayIdx,
      endDay: dayIdx,
    });
  }

  function selectRow(empIdx: number) {
    if (days.length === 0) return;
    setSelectedCell({ empIdx, dayIdx: 0 });
    setSelectionRange({
      startEmp: empIdx,
      endEmp: empIdx,
      startDay: 0,
      endDay: days.length - 1,
    });
  }

  function selectAll() {
    if (filteredEmployees.length === 0 || days.length === 0) return;
    setSelectedCell({ empIdx: 0, dayIdx: 0 });
    setSelectionRange({
      startEmp: 0,
      endEmp: filteredEmployees.length - 1,
      startDay: 0,
      endDay: days.length - 1,
    });
  }

  // Excel Autofill execution
  function applyAutofill(source: { empIdx: number; dayIdx: number }, target: { empIdx: number; dayIdx: number }) {
    const sourceEmp = filteredEmployees[source.empIdx];
    const sourceDay = days[source.dayIdx];
    if (!sourceEmp || !sourceDay) return;

    const minEmp = Math.min(source.empIdx, target.empIdx);
    const maxEmp = Math.max(source.empIdx, target.empIdx);
    const minDay = Math.min(source.dayIdx, target.dayIdx);
    const maxDay = Math.max(source.dayIdx, target.dayIdx);

    if (activeTab === "attendance") {
      const sourceStatus = getAttendanceStatus(sourceEmp.id, sourceDay.dateStr);
      const updates: Record<string, { status: AttendanceStatus; employee_id: string; date: string }> = { ...pendingAtt };
      for (let e = minEmp; e <= maxEmp; e++) {
        const emp = filteredEmployees[e];
        if (!emp) continue;
        for (let d = minDay; d <= maxDay; d++) {
          const day = days[d];
          if (!day) continue;
          updates[`${emp.id}_${day.dateStr}`] = {
            status: sourceStatus as AttendanceStatus,
            employee_id: emp.id,
            date: day.dateStr,
          };
        }
      }
      setPendingAtt(updates);
    } else if (activeTab === "overtime") {
      const sourceHours = getOvertimeHours(sourceEmp.id, sourceDay.dateStr);
      const updates: Record<string, { hours: number; employee_id: string; date: string }> = { ...pendingOt };
      for (let e = minEmp; e <= maxEmp; e++) {
        const emp = filteredEmployees[e];
        if (!emp) continue;
        for (let d = minDay; d <= maxDay; d++) {
          const day = days[d];
          if (!day) continue;
          updates[`${emp.id}_${day.dateStr}`] = {
            hours: sourceHours,
            employee_id: emp.id,
            date: day.dateStr,
          };
        }
      }
      setPendingOt(updates);
    }

    setSelectionRange({
      startEmp: minEmp,
      endEmp: maxEmp,
      startDay: minDay,
      endDay: maxDay,
    });
  }

  const applyAutofillRef = useRef(applyAutofill);
  applyAutofillRef.current = applyAutofill;

  const navigateToCellRef = useRef(navigateToCell);
  navigateToCellRef.current = navigateToCell;

  const fillSelectedRangeAttendanceRef = useRef(fillSelectedRangeAttendance);
  fillSelectedRangeAttendanceRef.current = fillSelectedRangeAttendance;

  const fillSelectedRangeOvertimeRef = useRef(fillSelectedRangeOvertime);
  fillSelectedRangeOvertimeRef.current = fillSelectedRangeOvertime;

  // Global mouse up for range drag & autofill drag
  useEffect(() => {
    function handleGlobalMouseUp() {
      if (isDraggingFillRef.current && fillDragSourceRef.current && fillDragTargetRef.current) {
        applyAutofillRef.current(fillDragSourceRef.current, fillDragTargetRef.current);
      }
      setIsSelectingRange(false);
      setRangeDragStart(null);
      setIsDraggingFill(false);
      setFillDragSource(null);
      setFillDragTarget(null);
    }

    window.addEventListener("mouseup", handleGlobalMouseUp);
    return () => window.removeEventListener("mouseup", handleGlobalMouseUp);
  }, []);

  // Excel Keyboard Navigation and Manual Value Entry
  useEffect(() => {
    function handleGlobalKeyDown(e: KeyboardEvent) {
      const activeEl = document.activeElement;
      if (activeEl && (activeEl.tagName === "INPUT" || activeEl.tagName === "TEXTAREA" || activeEl.tagName === "SELECT")) {
        if (!activeEl.classList.contains("ot-cell-input")) {
          return;
        }
      }

      const current = selectedCellRef.current;
      if (!current) return;
      const { empIdx, dayIdx } = current;

      // Navigation
      if (e.key === "ArrowRight") {
        e.preventDefault();
        navigateToCellRef.current(empIdx, dayIdx + 1, e.shiftKey);
        return;
      }
      if (e.key === "ArrowLeft") {
        e.preventDefault();
        navigateToCellRef.current(empIdx, dayIdx - 1, e.shiftKey);
        return;
      }
      if (e.key === "ArrowDown") {
        e.preventDefault();
        navigateToCellRef.current(empIdx + 1, dayIdx, e.shiftKey);
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        navigateToCellRef.current(empIdx - 1, dayIdx, e.shiftKey);
        return;
      }
      if (e.key === "Tab") {
        e.preventDefault();
        if (e.shiftKey) {
          if (dayIdx > 0) navigateToCellRef.current(empIdx, dayIdx - 1);
          else if (empIdx > 0) navigateToCellRef.current(empIdx - 1, days.length - 1);
        } else {
          if (dayIdx < days.length - 1) navigateToCellRef.current(empIdx, dayIdx + 1);
          else if (empIdx < filteredEmployees.length - 1) navigateToCellRef.current(empIdx + 1, 0);
        }
        return;
      }
      if (e.key === "Enter") {
        e.preventDefault();
        if (e.shiftKey) navigateToCellRef.current(empIdx - 1, dayIdx);
        else navigateToCellRef.current(empIdx + 1, dayIdx);
        return;
      }
      if (e.key === "Escape") {
        e.preventDefault();
        setSelectionRange(null);
        setSelectedCell(null);
        return;
      }

      // Manual values entry
      const currentRange = selectionRangeRef.current;
      const isMulti = currentRange && (currentRange.startEmp !== currentRange.endEmp || currentRange.startDay !== currentRange.endDay);

      if (activeTab === "attendance") {
        const keyUpper = e.key.toUpperCase();
        if (keyUpper === "P") {
          e.preventDefault();
          if (isMulti) {
            fillSelectedRangeAttendanceRef.current("present");
          } else {
            const emp = filteredEmployees[empIdx];
            const d = days[dayIdx];
            if (emp && d) {
              setPendingAtt(prev => ({ ...prev, [`${emp.id}_${d.dateStr}`]: { status: "present", employee_id: emp.id, date: d.dateStr } }));
              navigateToCellRef.current(empIdx, dayIdx + 1);
            }
          }
          return;
        }
        if (keyUpper === "A") {
          e.preventDefault();
          if (isMulti) {
            fillSelectedRangeAttendanceRef.current("absent");
          } else {
            const emp = filteredEmployees[empIdx];
            const d = days[dayIdx];
            if (emp && d) {
              setPendingAtt(prev => ({ ...prev, [`${emp.id}_${d.dateStr}`]: { status: "absent", employee_id: emp.id, date: d.dateStr } }));
              navigateToCellRef.current(empIdx, dayIdx + 1);
            }
          }
          return;
        }
        if (keyUpper === "L") {
          e.preventDefault();
          if (isMulti) {
            fillSelectedRangeAttendanceRef.current("leave");
          } else {
            const emp = filteredEmployees[empIdx];
            const d = days[dayIdx];
            if (emp && d) {
              setPendingAtt(prev => ({ ...prev, [`${emp.id}_${d.dateStr}`]: { status: "leave", employee_id: emp.id, date: d.dateStr } }));
              navigateToCellRef.current(empIdx, dayIdx + 1);
            }
          }
          return;
        }
        if (keyUpper === "H") {
          e.preventDefault();
          if (isMulti) {
            fillSelectedRangeAttendanceRef.current("holiday");
          } else {
            const emp = filteredEmployees[empIdx];
            const d = days[dayIdx];
            if (emp && d) {
              setPendingAtt(prev => ({ ...prev, [`${emp.id}_${d.dateStr}`]: { status: "holiday", employee_id: emp.id, date: d.dateStr } }));
              navigateToCellRef.current(empIdx, dayIdx + 1);
            }
          }
          return;
        }
        if (e.key === "Backspace" || e.key === "Delete" || e.key === " ") {
          e.preventDefault();
          if (isMulti) {
            fillSelectedRangeAttendanceRef.current("");
          } else {
            const emp = filteredEmployees[empIdx];
            const d = days[dayIdx];
            if (emp && d) {
              setPendingAtt(prev => ({ ...prev, [`${emp.id}_${d.dateStr}`]: { status: "" as AttendanceStatus, employee_id: emp.id, date: d.dateStr } }));
            }
          }
          return;
        }
      } else if (activeTab === "overtime") {
        const key = e.key;
        if (/^[0-9.]$/.test(key)) {
          if (activeEl?.tagName === "INPUT") return;
          e.preventDefault();
          const emp = filteredEmployees[empIdx];
          const d = days[dayIdx];
          if (!emp || !d) return;

          const nowMs = Date.now();
          let newText = key;
          if (nowMs - numberTypingBufferRef.current.lastTime < 900 && numberTypingBufferRef.current.text) {
            newText = numberTypingBufferRef.current.text + key;
          }
          numberTypingBufferRef.current = { text: newText, lastTime: nowMs };
          const numVal = parseFloat(newText);
          if (!isNaN(numVal) && numVal >= 0 && numVal <= 24) {
            if (isMulti) {
              fillSelectedRangeOvertimeRef.current(numVal);
            } else {
              handleOvertimeChange(emp.id, d.dateStr, String(numVal));
            }
          }
          return;
        }
        if (key === "+" || key === "=") {
          e.preventDefault();
          const emp = filteredEmployees[empIdx];
          const d = days[dayIdx];
          if (!emp || !d) return;
          const otKey = `${emp.id}_${d.dateStr}`;
          const currentH = pendingOt[otKey] !== undefined ? pendingOt[otKey].hours : (overtimeRecords[otKey]?.hours || 0);
          const nextH = Math.min(24, Math.round((currentH + 0.5) * 2) / 2);
          if (isMulti) {
            fillSelectedRangeOvertimeRef.current(nextH);
          } else {
            handleOvertimeChange(emp.id, d.dateStr, String(nextH));
          }
          return;
        }
        if (key === "-") {
          e.preventDefault();
          const emp = filteredEmployees[empIdx];
          const d = days[dayIdx];
          if (!emp || !d) return;
          const otKey = `${emp.id}_${d.dateStr}`;
          const currentH = pendingOt[otKey] !== undefined ? pendingOt[otKey].hours : (overtimeRecords[otKey]?.hours || 0);
          const nextH = Math.max(0, Math.round((currentH - 0.5) * 2) / 2);
          if (isMulti) {
            fillSelectedRangeOvertimeRef.current(nextH);
          } else {
            handleOvertimeChange(emp.id, d.dateStr, String(nextH));
          }
          return;
        }
        if (e.key === "Backspace" || e.key === "Delete") {
          if (activeEl?.tagName === "INPUT") return;
          e.preventDefault();
          numberTypingBufferRef.current = { text: "", lastTime: 0 };
          if (isMulti) {
            fillSelectedRangeOvertimeRef.current(0);
          } else {
            const emp = filteredEmployees[empIdx];
            const d = days[dayIdx];
            if (emp && d) {
              handleOvertimeChange(emp.id, d.dateStr, "0");
            }
          }
          return;
        }
      }
    }

    window.addEventListener("keydown", handleGlobalKeyDown);
    return () => window.removeEventListener("keydown", handleGlobalKeyDown);
  }, [activeTab, filteredEmployees, days, pendingAtt, pendingOt, overtimeRecords, attendanceRecords]);

  // Bulk Quick Operations
  function markWeekdaysPresent() {
    const newEdits: Record<string, { status: AttendanceStatus; employee_id: string; date: string }> = { ...pendingAtt };
    employees.forEach(emp => {
      days.forEach(d => {
        if (!d.isSunday) {
          const key = `${emp.id}_${d.dateStr}`;
          const current = getAttendanceStatus(emp.id, d.dateStr);
          if (!current) {
            newEdits[key] = { status: "present", employee_id: emp.id, date: d.dateStr };
          }
        }
      });
    });
    setPendingAtt(newEdits);
    setShowBulkMenu(false);
    setNotification({ type: "success", message: "Marked all Mon–Sat as Present for employees without entries." });
  }

  function markTodayPresentAll() {
    const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
    const newEdits: Record<string, { status: AttendanceStatus; employee_id: string; date: string }> = { ...pendingAtt };
    employees.forEach(emp => {
      const key = `${emp.id}_${todayStr}`;
      newEdits[key] = { status: "present", employee_id: emp.id, date: todayStr };
    });
    setPendingAtt(newEdits);
    setShowBulkMenu(false);
    setNotification({ type: "success", message: "Marked today as Present for all labourers." });
  }

  function clearAllPending() {
    setPendingAtt({});
    setPendingOt({});
    setShowBulkMenu(false);
    setNotification({ type: "success", message: "Reset unsaved changes." });
  }

  // Monthly Adjustment persistence handlers
  async function handleSaveEmployeeAdjustment(empId: string, adj: MonthlyEmployeeAdjustment) {
    if (!company?.id) return;
    await saveMonthlyEmployeeAdjustment(company.id, empId, periodStr, adj);
    setMonthlyAdjustments(prev => ({ ...prev, [empId]: adj }));
  }

  async function handleSyncEmployeeStatement(emp: ExtendedEmployeeInfo, breakdown: CompletePayrollBreakdown, notes: string) {
    if (!company?.id) return;
    let otHours = 0;
    days.forEach(d => { otHours += getOvertimeHours(emp.id, d.dateStr); });
    const adj = monthlyAdjustments[emp.id] || DEFAULT_MONTHLY_ADJUSTMENT;
    const effectiveOt = Math.max(0, otHours + (adj.overtime_hours_adjustment || 0));

    const res = await syncSalaryStatementFromWorkbook({
      companyId: company.id,
      employeeId: emp.id,
      year,
      month,
      breakdown,
      overtimeHours: effectiveOt,
      status: "draft",
      notes,
    });
    setSalaryStatementsForMonth(prev => ({
      ...prev,
      [emp.id]: { id: res.id, status: "draft", net_salary: breakdown.netSalary },
    }));
  }

  // Batch Sync all employees to Salary Statements
  async function handleBatchSyncAllStatements() {
    if (!company?.id || filteredEmployees.length === 0) return;
    setBatchSyncing(true);
    setNotification(null);
    let syncedCount = 0;
    try {
      for (const emp of filteredEmployees) {
        const adj = monthlyAdjustments[emp.id] || DEFAULT_MONTHLY_ADJUSTMENT;
        const employeeStatuses = days.map(d => getAttendanceStatus(emp.id, d.dateStr));
        const attTotals = calculateAttendanceTotals(employeeStatuses, daysInMonth, DEFAULT_PAYROLL_RULES.workingDaysDivisor, {
          presentAdj: adj.present_days_adjustment,
          payableAdj: adj.payable_days_adjustment,
        });
        let rawOt = 0;
        days.forEach(d => { rawOt += getOvertimeHours(emp.id, d.dateStr); });
        const otTotals = calculateAuthoritativeMonthlyOvertime({
          rawHours: rawOt,
          basicSalary: Number(emp.basic_salary) || 0,
          adjustment: adj,
          employeeOvertimeRate: emp.overtime_rate,
          employeeCostingMethod: emp.overtime_costing_method,
          rules: DEFAULT_PAYROLL_RULES,
        });
        const breakdown = calculateCompletePayrollBreakdown({
          basicSalary: Number(emp.basic_salary) || 0,
          payableDays: attTotals.payableDays,
          standardDays: DEFAULT_PAYROLL_RULES.workingDaysDivisor,
          overtimeCharge: otTotals.isApproved ? otTotals.totalCharge : 0,
        });
        const note = `Batch synced from Attendance & Overtime Workbook (${periodStr})`;
        await syncSalaryStatementFromWorkbook({
          companyId: company.id,
          employeeId: emp.id,
          year,
          month,
          breakdown,
          overtimeHours: otTotals.effectiveHours,
          status: "draft",
          notes: note,
        });
        syncedCount++;
      }
      setNotification({ type: "success", message: `Successfully synchronized ${syncedCount} employee salary statements for ${periodStr}!` });
      setRefreshKey(k => k + 1);
    } catch (err: unknown) {
      setNotification({ type: "error", message: err instanceof Error ? err.message : "Error during batch synchronization" });
    } finally {
      setBatchSyncing(false);
    }
  }

  // SAVE ALL DAILY CHANGES TO SUPABASE
  async function saveAllChanges() {
    if (!hasUnsavedChanges) return;
    setSaving(true);
    setNotification(null);

    try {
      const cid = await getCompanyId();

      // 1. Process Attendance changes
      const attEntries = Object.values(pendingAtt);
      for (const edit of attEntries) {
        const existing = attendanceRecords[`${edit.employee_id}_${edit.date}`];

        if (!edit.status) {
          if (existing?.id) {
            await supabase.from("attendance").delete().eq("id", existing.id);
          }
        } else if (existing?.id) {
          await supabase.from("attendance").update({
            status: edit.status,
            regular_hours: edit.status === "present" ? 8 : edit.status === "late" ? 4 : 0,
            updated_at: new Date().toISOString(),
          }).eq("id", existing.id);
        } else {
          await supabase.from("attendance").insert({
            company_id: cid,
            employee_id: edit.employee_id,
            attendance_date: edit.date,
            status: edit.status,
            regular_hours: edit.status === "present" ? 8 : edit.status === "late" ? 4 : 0,
            overtime_hours: 0,
          });
        }
      }

      // 2. Process Overtime changes
      const otEntries = Object.values(pendingOt);
      for (const edit of otEntries) {
        const existing = overtimeRecords[`${edit.employee_id}_${edit.date}`];

        if (edit.hours <= 0) {
          if (existing?.id) {
            await supabase.from("overtime").delete().eq("id", existing.id);
          }
        } else if (existing?.id) {
          await supabase.from("overtime").update({
            hours: edit.hours,
            approval_status: "approved",
            updated_at: new Date().toISOString(),
          }).eq("id", existing.id);
        } else {
          await supabase.from("overtime").insert({
            company_id: cid,
            employee_id: edit.employee_id,
            overtime_date: edit.date,
            hours: edit.hours,
            approval_status: "approved",
          });
        }
      }

      setNotification({ type: "success", message: "All attendance and overtime updates saved successfully!" });
      setLoading(true);
      setRefreshKey(k => k + 1);
    } catch (err: unknown) {
      setNotification({
        type: "error",
        message: err instanceof Error ? err.message : "Error saving attendance to database",
      });
    } finally {
      setSaving(false);
    }
  }

  // Handle Import from Excel Modal
  async function handleImportApply(
    importedAtt: ParsedAttendanceEntry[],
    importedOt: ParsedOvertimeEntry[],
    overwrite: boolean
  ) {
    setSaving(true);
    try {
      const cid = await getCompanyId();

      for (const item of importedAtt) {
        const existing = attendanceRecords[`${item.employee_id}_${item.attendance_date}`];
        if (existing?.id) {
          if (overwrite) {
            await supabase.from("attendance").update({
              status: item.status,
              regular_hours: item.regular_hours,
              updated_at: new Date().toISOString(),
            }).eq("id", existing.id);
          }
        } else {
          await supabase.from("attendance").insert({
            company_id: cid,
            employee_id: item.employee_id,
            attendance_date: item.attendance_date,
            status: item.status,
            regular_hours: item.regular_hours,
            overtime_hours: 0,
          });
        }
      }

      for (const item of importedOt) {
        const existing = overtimeRecords[`${item.employee_id}_${item.overtime_date}`];
        if (existing?.id) {
          if (overwrite) {
            await supabase.from("overtime").update({
              hours: item.hours,
              approval_status: "approved",
              updated_at: new Date().toISOString(),
            }).eq("id", existing.id);
          }
        } else {
          await supabase.from("overtime").insert({
            company_id: cid,
            employee_id: item.employee_id,
            overtime_date: item.overtime_date,
            hours: item.hours,
            approval_status: "approved",
          });
        }
      }

      setNotification({
        type: "success",
        message: `Successfully imported ${importedAtt.length} attendance and ${importedOt.length} overtime records!`,
      });
      setLoading(true);
      setRefreshKey(k => k + 1);
    } catch (err: unknown) {
      setNotification({
        type: "error",
        message: err instanceof Error ? err.message : "Failed to import attendance data.",
      });
    } finally {
      setSaving(false);
    }
  }

  // Export to Excel (.xlsx)
  function exportToExcel() {
    const wb = XLSX.utils.book_new();

    // 1. Attendance Sheet
    const attData: (string | number)[][] = [];
    attData.push([`Employee Attendance Sheet - ${monthName} ${year}`]);
    attData.push([]);
    const attHeader = [
      "Emp No",
      "Employee Name",
      ...days.map(d => `${String(d.dayNum).padStart(2, "0")} ${shortMonth} (${d.dayOfWeek.slice(0, 2)})`),
      "Present (P)",
      "Half Days (HD)",
      "Absent (A)",
      "Payable Days",
    ];
    attData.push(attHeader);

    employees.forEach((emp) => {
      const empStatuses = days.map(d => getAttendanceStatus(emp.id, d.dateStr));
      const adj = monthlyAdjustments[emp.id] || DEFAULT_MONTHLY_ADJUSTMENT;
      const attTotals = calculateAttendanceTotals(empStatuses, daysInMonth, DEFAULT_PAYROLL_RULES.workingDaysDivisor, {
        presentAdj: adj.present_days_adjustment,
        payableAdj: adj.payable_days_adjustment,
      });

      const rowVals: string[] = empStatuses.map(s => {
        if (s === "present") return "P";
        if (s === "late") return "HD";
        if (s === "absent") return "A";
        if (s === "leave") return "L";
        if (s === "holiday") return "H";
        return "";
      });

      attData.push([
        formatEmployeeCode(emp.employee_number),
        emp.first_name || "",
        ...rowVals,
        attTotals.presentDaysCount,
        attTotals.halfDaysCount,
        attTotals.absentDaysCount,
        attTotals.payableDays,
      ]);
    });
    const wsAtt = XLSX.utils.aoa_to_sheet(attData);
    XLSX.utils.book_append_sheet(wb, wsAtt, "Attendance");

    // 2. Overtime Sheet
    const otData: (string | number)[][] = [];
    otData.push([`Employee Overtime Sheet - ${monthName} ${year}`]);
    otData.push([]);
    const otHeader = [
      "Emp No",
      "Employee Name",
      ...days.map(d => `${String(d.dayNum).padStart(2, "0")} ${shortMonth} (${d.dayOfWeek.slice(0, 2)})`),
      "Recorded OT Hrs",
      "OT Hours Adj",
      "Effective OT Hrs",
      "Costing Method",
      "OT Rate (AED/h)",
      "OT Charge (AED)",
      "Approval Status",
    ];
    otData.push(otHeader);

    employees.forEach((emp) => {
      let rawOt = 0;
      const rowVals: (number | string)[] = days.map(d => {
        const h = getOvertimeHours(emp.id, d.dateStr);
        rawOt += h;
        return h > 0 ? h : "";
      });

      const adj = monthlyAdjustments[emp.id] || DEFAULT_MONTHLY_ADJUSTMENT;
      const otTotals = calculateOvertimeCharge(Number(emp.basic_salary) || 0, rawOt, adj, DEFAULT_PAYROLL_RULES);

      otData.push([
        formatEmployeeCode(emp.employee_number),
        emp.first_name || "",
        ...rowVals,
        Number(rawOt.toFixed(1)),
        adj.overtime_hours_adjustment || 0,
        otTotals.effectiveHours,
        adj.overtime_costing_method,
        otTotals.hourlyRate,
        otTotals.totalCharge,
        otTotals.isApproved ? "Approved" : "Pending",
      ]);
    });
    const wsOt = XLSX.utils.aoa_to_sheet(otData);
    XLSX.utils.book_append_sheet(wb, wsOt, "Overtime");

    // 3. Summary Sheet
    const sumData: (string | number)[][] = [];
    sumData.push([`Monthly Attendance & Payroll Summary - ${monthName} ${year}`]);
    sumData.push([]);
    sumData.push([
      "Emp No",
      "Employee Name",
      "Basic Salary (AED)",
      "Present Days",
      "Payable Days",
      "OT Hours",
      "OT Charge (AED)",
      "Est. Net Salary (AED)",
      "Statement Status",
    ]);

    employees.forEach((emp) => {
      const empStatuses = days.map(d => getAttendanceStatus(emp.id, d.dateStr));
      const adj = monthlyAdjustments[emp.id] || DEFAULT_MONTHLY_ADJUSTMENT;
      const attTotals = calculateAttendanceTotals(empStatuses, daysInMonth, DEFAULT_PAYROLL_RULES.workingDaysDivisor, {
        presentAdj: adj.present_days_adjustment,
        payableAdj: adj.payable_days_adjustment,
      });

      let rawOt = 0;
      days.forEach(d => { rawOt += getOvertimeHours(emp.id, d.dateStr); });
      const otTotals = calculateOvertimeCharge(Number(emp.basic_salary) || 0, rawOt, adj, DEFAULT_PAYROLL_RULES);

      const breakdown = calculateCompletePayrollBreakdown({
        basicSalary: Number(emp.basic_salary) || 0,
        payableDays: attTotals.payableDays,
        standardDays: DEFAULT_PAYROLL_RULES.workingDaysDivisor,
        overtimeCharge: otTotals.isApproved ? otTotals.totalCharge : 0,
      });

      const stmt = salaryStatementsForMonth[emp.id];

      sumData.push([
        formatEmployeeCode(emp.employee_number),
        emp.first_name || "",
        emp.basic_salary || 0,
        attTotals.actualAttendanceDays,
        attTotals.payableDays,
        otTotals.effectiveHours,
        otTotals.totalCharge,
        breakdown.netSalary,
        stmt?.status || "Draft",
      ]);
    });
    const wsSum = XLSX.utils.aoa_to_sheet(sumData);
    XLSX.utils.book_append_sheet(wb, wsSum, "Summary");

    // Save
    XLSX.writeFile(wb, `Dubai_ERP_Attendance_Payroll_${year}_${String(month).padStart(2, "0")}.xlsx`);
  }

  // Monthly summary metrics
  const totalEmployees = employees.length;
  const { totalPresentDays, totalAbsentDays, totalOtHoursMonth, totalOtChargesMonth } = useMemo(() => {
    let p = 0;
    let a = 0;
    let ot = 0;
    let otCharges = 0;

    employees.forEach(emp => {
      let empOt = 0;
      days.forEach(d => {
        const key = `${emp.id}_${d.dateStr}`;
        const s = pendingAtt[key] !== undefined ? pendingAtt[key].status : (attendanceRecords[key]?.status || "");
        const h = pendingOt[key] !== undefined ? pendingOt[key].hours : (overtimeRecords[key]?.hours || 0);
        if (s === "present") p++;
        else if (s === "absent") a++;
        empOt += h;
      });
      ot += empOt;
      const adj = monthlyAdjustments[emp.id] || DEFAULT_MONTHLY_ADJUSTMENT;
      const otCalc = calculateAuthoritativeMonthlyOvertime({
        rawHours: empOt,
        basicSalary: Number(emp.basic_salary) || 0,
        adjustment: adj,
        employeeOvertimeRate: emp.overtime_rate,
        employeeCostingMethod: emp.overtime_costing_method,
        rules: DEFAULT_PAYROLL_RULES,
      });
      if (otCalc.isApproved) otCharges += otCalc.totalCharge;
    });

    return {
      totalPresentDays: p,
      totalAbsentDays: a,
      totalOtHoursMonth: ot,
      totalOtChargesMonth: otCharges,
    };
  }, [employees, days, pendingAtt, pendingOt, attendanceRecords, overtimeRecords, monthlyAdjustments]);

  // Navigate months
  function prevMonth() {
    setLoading(true);
    if (month === 1) {
      setYear(y => y - 1);
      setMonth(12);
    } else {
      setMonth(m => m - 1);
    }
  }

  function nextMonth() {
    setLoading(true);
    if (month === 12) {
      setYear(y => y + 1);
      setMonth(1);
    } else {
      setMonth(m => m + 1);
    }
  }

  function jumpToCurrentMonth() {
    setLoading(true);
    setYear(now.getFullYear());
    setMonth(now.getMonth() + 1);
  }

  return (
    <div className="flex flex-col min-h-[calc(100vh-56px)] bg-slate-900 text-slate-100 select-none print:bg-white print:min-h-0 print:h-auto print:p-0 print:m-0 print:block">
      <div className="app-screen-content no-print print:hidden flex flex-col flex-1">
        {/* Top Banner / Navigation Bar */}
      <div className="bg-slate-900 border-b border-slate-800 sticky top-0 z-40 shadow-xs">
        <div className="max-w-[1700px] mx-auto px-4 py-2.5 flex items-center justify-between gap-3 flex-wrap">
          {/* Title & Month Selector */}
          <div className="flex items-center gap-3 flex-wrap">
            <div className="flex items-center gap-2.5">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 shrink-0">
                <CalendarCheck size={17} />
              </div>
              <div>
                <h1 className="text-sm sm:text-base font-bold text-white tracking-tight leading-none">
                  Attendance &amp; Overtime Workbook
                </h1>
                <p className="text-[11px] text-slate-400 hidden md:block mt-0.5">
                  Monthly Labourer Registry &amp; Payroll Workflow
                </p>
              </div>
            </div>

            <div className="h-5 w-px bg-slate-800 hidden sm:block mx-1" />

            {/* Month & Year Control */}
            <div className="flex items-center gap-1 bg-slate-800/90 border border-slate-700/80 rounded-lg p-0.5 text-xs">
              <button
                type="button"
                onClick={prevMonth}
                title="Previous Month"
                className="p-1 rounded text-slate-400 hover:text-white hover:bg-slate-700 transition cursor-pointer"
              >
                <ChevronLeft size={15} />
              </button>

              <select
                value={month}
                onChange={e => setMonth(Number(e.target.value))}
                className="bg-transparent font-semibold text-white px-1.5 py-0.5 focus:outline-none cursor-pointer rounded"
              >
                {MONTH_NAMES.map((m, i) => (
                  <option key={i + 1} value={i + 1} className="bg-slate-800 text-white">{m}</option>
                ))}
              </select>

              <select
                value={year}
                onChange={e => setYear(Number(e.target.value))}
                className="bg-transparent font-semibold text-slate-300 px-1 py-0.5 focus:outline-none cursor-pointer rounded"
              >
                {[2023, 2024, 2025, 2026, 2027, 2028, 2029, 2030].map(y => (
                  <option key={y} value={y} className="bg-slate-800 text-white">{y}</option>
                ))}
              </select>

              <button
                type="button"
                onClick={nextMonth}
                title="Next Month"
                className="p-1 rounded text-slate-400 hover:text-white hover:bg-slate-700 transition cursor-pointer"
              >
                <ChevronRight size={15} />
              </button>

              <button
                type="button"
                onClick={jumpToCurrentMonth}
                className="text-[11px] font-medium px-2 py-0.5 rounded text-slate-300 hover:text-white hover:bg-slate-700 transition cursor-pointer border-l border-slate-700 ml-0.5"
              >
                Today
              </button>
            </div>
          </div>

          {/* Action Toolbar */}
          <div className="flex items-center gap-1.5 flex-wrap">
            {onSwitchToLegacy && (
              <button
                type="button"
                onClick={onSwitchToLegacy}
                className="h-8 px-2.5 text-xs font-medium rounded-lg border border-slate-700 bg-slate-800/80 text-slate-300 hover:bg-slate-700 hover:text-white transition flex items-center gap-1.5 cursor-pointer"
              >
                <FileText size={13} className="text-slate-400" />
                <span>Daily View</span>
              </button>
            )}

            {/* Batch Sync to Salary Statements Button */}
            <button
              type="button"
              onClick={() => void handleBatchSyncAllStatements()}
              disabled={batchSyncing || filteredEmployees.length === 0}
              className="h-8 px-2.5 text-xs font-semibold rounded-lg border border-purple-500/30 bg-purple-500/10 text-purple-300 hover:bg-purple-500/20 transition flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
              title="Automatically generate or update official Salary Statements for all labourers for this month"
            >
              {batchSyncing ? <Loader2 size={13} className="animate-spin text-purple-400" /> : <ShieldCheck size={13} className="text-purple-400" />}
              <span>Sync Statements</span>
            </button>

            {/* Import Button */}
            <button
              type="button"
              onClick={() => setShowImportModal(true)}
              className="h-8 px-2.5 text-xs font-semibold rounded-lg border border-emerald-500/30 bg-emerald-500/10 text-emerald-300 hover:bg-emerald-500/20 transition flex items-center gap-1.5 cursor-pointer"
            >
              <Upload size={13} className="text-emerald-400" />
              <span>Import</span>
            </button>

            {/* Export Button */}
            <button
              type="button"
              onClick={exportToExcel}
              className="h-8 px-2.5 text-xs font-medium rounded-lg border border-slate-700 bg-slate-800/80 text-slate-300 hover:bg-slate-700 hover:text-white transition flex items-center gap-1.5 cursor-pointer"
            >
              <FileSpreadsheet size={13} className="text-emerald-400" />
              <span>Export</span>
            </button>

            {/* Print Button */}
            <button
              type="button"
              onClick={() => setShowPrintModal(true)}
              className="h-8 px-2.5 text-xs font-medium rounded-lg border border-slate-700 bg-slate-800/80 text-slate-300 hover:bg-slate-700 hover:text-white transition flex items-center gap-1.5 cursor-pointer"
            >
              <Printer size={13} className="text-slate-400" />
              <span>Print Sheet</span>
            </button>

            {/* Save Button with Unsaved Counter */}
            <button
              type="button"
              onClick={() => void saveAllChanges()}
              disabled={!hasUnsavedChanges || saving}
              className={`h-8 px-3 text-xs font-bold rounded-lg transition flex items-center gap-1.5 cursor-pointer shadow-sm ${
                hasUnsavedChanges
                  ? "bg-emerald-600 hover:bg-emerald-500 text-white animate-pulse ring-2 ring-emerald-400"
                  : "bg-slate-800 text-slate-400 border border-slate-700 cursor-default"
              }`}
            >
              {saving ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />}
              <span>{saving ? "Saving..." : hasUnsavedChanges ? `Save (${Object.keys(pendingAtt).length + Object.keys(pendingOt).length}) [Ctrl+S]` : "Saved"}</span>
            </button>
          </div>
        </div>

        {/* Tab Switcher & Quick Filters Bar */}
        <div className="border-t border-slate-800 bg-slate-900/90">
          <div className="max-w-[1700px] mx-auto px-4 py-2 flex items-center justify-between gap-3 flex-wrap">
            {/* Main Excel-like Tabs (Clean Segmented Control) */}
            <div className="flex items-center gap-0.5 bg-slate-800/90 border border-slate-700/80 p-0.5 rounded-lg text-xs font-semibold shrink-0">
              <button
                type="button"
                onClick={() => setActiveTab("attendance")}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md transition cursor-pointer ${
                  activeTab === "attendance"
                    ? "bg-slate-700 text-white shadow-xs"
                    : "text-slate-400 hover:text-slate-200 hover:bg-slate-800/60"
                }`}
              >
                <CalendarCheck size={13} className={activeTab === "attendance" ? "text-emerald-400" : "text-slate-500"} />
                <span>Attendance</span>
              </button>

              <button
                type="button"
                onClick={() => setActiveTab("overtime")}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md transition cursor-pointer ${
                  activeTab === "overtime"
                    ? "bg-slate-700 text-white shadow-xs"
                    : "text-slate-400 hover:text-slate-200 hover:bg-slate-800/60"
                }`}
              >
                <Clock size={13} className={activeTab === "overtime" ? "text-violet-400" : "text-slate-500"} />
                <span>Overtime</span>
              </button>

              <button
                type="button"
                onClick={() => setActiveTab("summary")}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md transition cursor-pointer ${
                  activeTab === "summary"
                    ? "bg-slate-700 text-white shadow-xs"
                    : "text-slate-400 hover:text-slate-200 hover:bg-slate-800/60"
                }`}
              >
                <Sparkles size={13} className={activeTab === "summary" ? "text-amber-400" : "text-slate-500"} />
                <span>Payroll Summary</span>
              </button>
            </div>

            {/* Quick Metrics Strip (Non-Wrapping Sleek Badges) */}
            <div className="flex items-center gap-2 text-xs flex-wrap">
              <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-slate-800/60 border border-slate-700/60 whitespace-nowrap">
                <span className="text-slate-400 font-medium">Labourers:</span>
                <span className="font-bold text-white font-mono">{loadError ? "—" : totalEmployees}</span>
              </div>

              <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-emerald-950/40 border border-emerald-800/50 whitespace-nowrap">
                <span className="text-emerald-400/80 font-medium">Present:</span>
                <span className="font-bold text-emerald-300 font-mono">{loadError ? "—" : `${totalPresentDays} d`}</span>
              </div>

              <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-rose-950/40 border border-rose-800/50 whitespace-nowrap">
                <span className="text-rose-400/80 font-medium">Absent:</span>
                <span className="font-bold text-rose-300 font-mono">{loadError ? "—" : `${totalAbsentDays} d`}</span>
              </div>

              <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-purple-950/40 border border-purple-800/50 whitespace-nowrap">
                <span className="text-purple-300/80 font-medium">Total OT:</span>
                <span className="font-bold text-purple-200 font-mono">{loadError ? "—" : `${totalOtHoursMonth.toFixed(1)} hrs`}</span>
              </div>

              <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-emerald-950/40 border border-emerald-800/50 whitespace-nowrap">
                <span className="text-emerald-400/80 font-medium">OT Charges:</span>
                <span className="font-bold text-emerald-300 font-mono">{loadError ? "—" : fmtAED(totalOtChargesMonth)}</span>
              </div>
            </div>

            {/* Search & Bulk Actions */}
            <div className="flex items-center gap-2">
              <div className="relative">
                <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                <input
                  type="text"
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  placeholder="Search labourers..."
                  className="h-8 pl-8 pr-7 text-xs rounded-lg border border-slate-700 bg-slate-800 text-white placeholder:text-slate-500 focus:bg-slate-750 focus:border-emerald-500 focus:outline-none w-36 sm:w-44 transition"
                />
                {search && (
                  <button onClick={() => setSearch("")} className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-200">
                    <X size={12} />
                  </button>
                )}
              </div>

              {/* Bulk Menu Trigger */}
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setShowBulkMenu(!showBulkMenu)}
                  className="h-8 flex items-center gap-1.5 px-2.5 text-xs font-semibold rounded-lg border border-slate-700 bg-slate-800 text-slate-300 hover:bg-slate-750 hover:text-white transition cursor-pointer whitespace-nowrap"
                >
                  <Filter size={13} className="text-slate-400" />
                  <span>Quick Fill</span>
                </button>

                {showBulkMenu && (
                  <div className="absolute right-0 mt-1 w-64 rounded-xl bg-slate-900 shadow-2xl border border-slate-700 py-1.5 z-50 text-xs">
                    <button
                      onClick={markWeekdaysPresent}
                      className="w-full text-left px-3 py-2 hover:bg-slate-800 text-slate-200 flex items-center gap-2 font-medium cursor-pointer"
                    >
                      <Check size={14} className="text-emerald-400" />
                      <span>Fill Mon–Sat as Present (P)</span>
                    </button>
                    <button
                      onClick={markTodayPresentAll}
                      className="w-full text-left px-3 py-2 hover:bg-slate-800 text-slate-200 flex items-center gap-2 font-medium cursor-pointer"
                    >
                      <CalendarCheck size={14} className="text-blue-400" />
                      <span>Mark Today Present for all</span>
                    </button>
                    <div className="border-t border-slate-800 my-1" />
                    <button
                      onClick={clearAllPending}
                      className="w-full text-left px-3 py-2 hover:bg-rose-950/50 text-rose-400 flex items-center gap-2 font-medium cursor-pointer"
                    >
                      <RotateCcw size={14} />
                      <span>Discard Unsaved Edits</span>
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Notification Toast */}
      {notification && (
        <div className="max-w-[1600px] mx-auto w-full px-4 pt-3 transition">
          <div
            className={`rounded-xl p-3 text-xs flex items-center justify-between font-medium ${
              notification.type === "success"
                ? "bg-emerald-50 text-emerald-900 border border-emerald-200"
                : "bg-rose-50 text-rose-900 border border-rose-200"
            }`}
          >
            <span>{notification.message}</span>
            <button onClick={() => setNotification(null)} className="text-slate-400 hover:text-slate-700">
              <X size={14} />
            </button>
          </div>
        </div>
      )}

      {/* Main Table Content */}
      <div className="flex-1 max-w-[1600px] w-full mx-auto p-4 flex flex-col">
        {loading ? (
          <div className="flex-1 flex flex-col items-center justify-center py-32 bg-slate-800/60 rounded-2xl border border-slate-700 shadow-xs">
            <Loader2 size={32} className="animate-spin text-emerald-400 mb-3" />
            <p className="text-sm font-semibold text-slate-300">Loading monthly attendance & payroll workbook...</p>
          </div>
        ) : loadError ? (
          <div className="flex-1 flex flex-col items-center justify-center py-32 bg-slate-800/60 rounded-2xl border border-rose-700/60 shadow-xs text-center p-6">
            <AlertCircle size={36} className="text-rose-400 mb-2" />
            <h3 className="text-base font-bold text-white">Database Query Error</h3>
            <p className="text-xs text-rose-300 mt-1 max-w-md font-mono">{loadError}</p>
            <button
              type="button"
              onClick={() => { setLoading(true); setRefreshKey(k => k + 1); }}
              className="mt-4 inline-flex items-center gap-1.5 px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-bold transition shadow-sm cursor-pointer"
            >
              <RotateCcw size={14} /> Retry Query
            </button>
          </div>
        ) : filteredEmployees.length === 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center py-32 bg-slate-800/60 rounded-2xl border border-slate-700 shadow-xs text-center p-6">
            <AlertCircle size={36} className="text-slate-400 mb-2" />
            <h3 className="text-base font-bold text-white">No labourers found</h3>
            <p className="text-xs text-slate-400 mt-1 max-w-md">
              {search ? "No labourers match your current search query." : "No active labourers found in your Dubai ERP company database."}
            </p>
          </div>
        ) : (
          <div
            ref={tableContainerRef}
            className="document-sheet attendance-white-sheet flex-1 bg-white rounded-xl border border-slate-300 shadow-xl overflow-auto max-h-[calc(100vh-175px)] relative"
          >
            <table className="w-full border-collapse text-xs bg-white text-slate-900">
              {/* Table Header: Sticky Top */}
              <thead className="sticky top-0 z-30 bg-slate-100 text-slate-800 shadow-xs border-b-2 border-slate-300">
                <tr>
                  {/* Top-Left Header: Emp No (Click to select all) */}
                  <th
                    onClick={selectAll}
                    title="Click to select all cells"
                    className="sticky left-0 z-40 bg-slate-100 text-slate-900 px-3 py-2 text-left font-black tracking-wide border-r border-b-2 border-slate-300 w-20 min-w-[75px] cursor-pointer hover:bg-slate-200 transition select-none shadow-[2px_0_4px_-2px_rgba(0,0,0,0.06)]"
                  >
                    Emp No
                  </th>
                  <th className="sticky left-[75px] z-40 bg-slate-100 text-slate-900 px-3 py-2 text-left font-black tracking-wide border-r border-b-2 border-slate-300 w-44 min-w-[170px] shadow-[2px_0_4px_-2px_rgba(0,0,0,0.06)]">
                    Employee Name
                  </th>

                  {/* Date Column Headers (01 to 31) - Click to select column */}
                  {days.map((d, dayIdx) => {
                    const isColSelected = normalizedRange && normalizedRange.minDay <= dayIdx && normalizedRange.maxDay >= dayIdx;
                    const isColActive = selectedCell?.dayIdx === dayIdx;

                    return (
                      <th
                        key={d.dayNum}
                        onClick={() => selectColumn(dayIdx)}
                        title={`Click to select Day ${d.dayNum} column for all labourers`}
                        className={`px-1 py-1 text-center font-bold border-r border-b-2 min-w-[36px] w-9 cursor-pointer transition select-none ${
                          isColSelected
                            ? "bg-emerald-700 text-white ring-2 ring-emerald-300 ring-inset border-emerald-800"
                            : isColActive
                            ? "bg-slate-200 text-slate-900 border-slate-300"
                            : d.isSunday
                            ? "bg-emerald-600 text-white font-black border-emerald-700"
                            : "bg-slate-100 text-slate-700 hover:bg-slate-200 border-slate-300"
                        }`}
                      >
                        <div className={`text-[11px] leading-tight font-black ${d.isSunday || isColSelected ? "text-white" : "text-slate-800"}`}>
                          {String(d.dayNum).padStart(2, "0")}
                        </div>
                        <div className={`text-[9px] uppercase font-bold ${d.isSunday || isColSelected ? "text-emerald-100" : "text-slate-500"}`}>
                          {d.dayOfWeek.slice(0, 3)}
                        </div>
                      </th>
                    );
                  })}

                  {/* Summary Columns */}
                  {activeTab === "attendance" ? (
                    <>
                      <th className="px-2 py-2 text-center font-bold bg-emerald-100 text-emerald-900 border-r border-b border-slate-300 min-w-[44px]" title="Actual Present Days">
                        Pres (P)
                      </th>
                      <th className="px-2 py-2 text-center font-bold bg-amber-100 text-amber-900 border-r border-b border-slate-300 min-w-[36px]" title="Half Days (0.5d)">
                        HD
                      </th>
                      <th className="px-2 py-2 text-center font-bold bg-rose-100 text-rose-900 border-r border-b border-slate-300 min-w-[40px]" title="Absent Days">
                        Abs (A)
                      </th>
                      <th className="px-2 py-2 text-center font-bold bg-blue-100 text-blue-900 border-r border-b border-slate-300 min-w-[55px]" title="Payable Days (Distinguished from attendance)">
                        Payable (d)
                      </th>
                      <th className="px-2 py-2 text-center font-bold bg-slate-200 text-slate-800 border-b border-slate-300 min-w-[50px]">
                        Charges
                      </th>
                    </>
                  ) : activeTab === "overtime" ? (
                    <>
                      <th className="px-2 py-2 text-center font-bold bg-purple-100 text-purple-900 border-r border-b border-slate-300 min-w-[55px]" title="Effective Overtime Hours">
                        OT Hrs
                      </th>
                      <th className="px-2 py-2 text-center font-bold bg-slate-100 text-slate-800 border-r border-b border-slate-300 min-w-[65px]" title="Costing Method: Auto / Hourly / Flat">
                        Method
                      </th>
                      <th className="px-2 py-2 text-center font-bold bg-slate-100 text-slate-800 border-r border-b border-slate-300 min-w-[55px]" title="Rate per Hour (AED)">
                        Rate
                      </th>
                      <th className="px-2 py-2 text-center font-bold bg-emerald-100 text-emerald-900 border-r border-b border-slate-300 min-w-[75px]" title="Total Overtime Charge (AED)">
                        OT Charge
                      </th>
                      <th className="px-2 py-2 text-center font-bold bg-slate-100 text-slate-800 border-r border-b border-slate-300 min-w-[60px]" title="Approval status for payroll">
                        Status
                      </th>
                      <th className="px-2 py-2 text-center font-bold bg-slate-200 text-slate-800 border-b border-slate-300 min-w-[50px]">
                        Charges
                      </th>
                    </>
                  ) : (
                    <>
                      <th className="px-2 py-2 text-center font-bold bg-emerald-100 text-emerald-900 border-r border-b border-slate-300 min-w-[44px]">
                        Pres (d)
                      </th>
                      <th className="px-2 py-2 text-center font-bold bg-blue-100 text-blue-900 border-r border-b border-slate-300 min-w-[48px]">
                        Payable
                      </th>
                      <th className="px-2 py-2 text-center font-bold bg-purple-100 text-purple-900 border-r border-b border-slate-300 min-w-[48px]">
                        OT Hrs
                      </th>
                      <th className="px-2 py-2 text-center font-bold bg-emerald-100 text-emerald-900 border-r border-b border-slate-300 min-w-[70px]">
                        OT Charge
                      </th>
                      <th className="px-2 py-2 text-center font-bold bg-slate-100 text-slate-900 border-r border-b border-slate-300 min-w-[75px]">
                        Est. Net
                      </th>
                      <th className="px-2 py-2 text-center font-bold bg-slate-100 text-slate-800 border-r border-b border-slate-300 min-w-[55px]">
                        Sync
                      </th>
                      <th className="px-2 py-2 text-center font-bold bg-slate-200 text-slate-800 border-b border-slate-300 min-w-[50px]">
                        Action
                      </th>
                    </>
                  )}
                </tr>
              </thead>

              {/* Table Body */}
              <tbody className="divide-y divide-slate-200">
                {filteredEmployees.map((emp, empIdx) => {
                  let totalOt = 0;
                  const employeeStatuses = days.map(d => getAttendanceStatus(emp.id, d.dateStr));
                  days.forEach(d => { totalOt += getOvertimeHours(emp.id, d.dateStr); });

                  const adj = monthlyAdjustments[emp.id] || DEFAULT_MONTHLY_ADJUSTMENT;
                  const attTotals = calculateAttendanceTotals(employeeStatuses, daysInMonth, DEFAULT_PAYROLL_RULES.workingDaysDivisor, {
                    presentAdj: adj.present_days_adjustment,
                    payableAdj: adj.payable_days_adjustment,
                  });
                  const otTotals = calculateAuthoritativeMonthlyOvertime({
                    rawHours: totalOt,
                    basicSalary: Number(emp.basic_salary) || 0,
                    adjustment: adj,
                    employeeOvertimeRate: emp.overtime_rate,
                    employeeCostingMethod: emp.overtime_costing_method,
                    rules: DEFAULT_PAYROLL_RULES,
                  });
                  const breakdown = calculateCompletePayrollBreakdown({
                    basicSalary: Number(emp.basic_salary) || 0,
                    payableDays: attTotals.payableDays,
                    standardDays: DEFAULT_PAYROLL_RULES.workingDaysDivisor,
                    overtimeCharge: otTotals.isApproved ? otTotals.totalCharge : 0,
                  });
                  const stmt = salaryStatementsForMonth[emp.id];

                  const isFullRowSelected = Boolean(
                    normalizedRange &&
                    normalizedRange.minEmp <= empIdx &&
                    normalizedRange.maxEmp >= empIdx &&
                    normalizedRange.minDay === 0 &&
                    normalizedRange.maxDay === days.length - 1
                  );
                  const isRowActive = selectedCell?.empIdx === empIdx;

                  return (
                    <tr
                      key={emp.id}
                      className={`hover:bg-slate-50 transition-colors ${empIdx % 2 === 0 ? "bg-white" : "bg-slate-50/50"}`}
                    >
                      {/* Frozen Column 1: Emp No - strictly EMP-01, EMP-02, EMP-03... Click to select row */}
                      <td
                        onClick={() => selectRow(empIdx)}
                        title="Click to select entire row"
                        className={`sticky left-0 z-20 px-3 py-1.5 font-bold font-mono text-xs border-r border-b border-slate-300 whitespace-nowrap cursor-pointer transition select-none shadow-[2px_0_4px_-2px_rgba(0,0,0,0.06)] ${
                          isFullRowSelected
                            ? "bg-emerald-100 text-emerald-950 font-black ring-1 ring-emerald-500"
                            : isRowActive
                            ? "bg-slate-200 text-slate-900 font-black"
                            : "bg-slate-50 text-slate-800 hover:bg-slate-200"
                        }`}
                      >
                        {formatEmployeeCode(emp.employee_number)}
                      </td>

                      {/* Frozen Column 2: Employee Name */}
                      <td
                        onClick={() => selectRow(empIdx)}
                        className={`sticky left-[75px] z-20 px-3 py-1.5 font-semibold border-r border-b border-slate-300 whitespace-nowrap truncate max-w-[170px] cursor-pointer shadow-[2px_0_4px_-2px_rgba(0,0,0,0.06)] ${
                          isFullRowSelected
                            ? "bg-emerald-50 text-emerald-950 font-bold ring-1 ring-emerald-500"
                            : isRowActive
                            ? "bg-slate-100 text-slate-900 font-bold"
                            : "bg-white text-slate-900 hover:bg-slate-50"
                        }`}
                      >
                        <span title={emp.first_name || ""}>{emp.first_name || "Unnamed"}</span>
                      </td>

                      {/* Day Columns (01..31) */}
                      {days.map((d, dayIdx) => {
                        const status = getAttendanceStatus(emp.id, d.dateStr);
                        const otHours = getOvertimeHours(emp.id, d.dateStr);

                        const isPending =
                          pendingAtt[`${emp.id}_${d.dateStr}`] !== undefined ||
                          pendingOt[`${emp.id}_${d.dateStr}`] !== undefined;

                        const isSelected = selectedCell?.empIdx === empIdx && selectedCell?.dayIdx === dayIdx;
                        const inRange =
                          normalizedRange &&
                          empIdx >= normalizedRange.minEmp &&
                          empIdx <= normalizedRange.maxEmp &&
                          dayIdx >= normalizedRange.minDay &&
                          dayIdx <= normalizedRange.maxDay;

                        const inFill =
                          normalizedFillTarget &&
                          empIdx >= normalizedFillTarget.minEmp &&
                          empIdx <= normalizedFillTarget.maxEmp &&
                          dayIdx >= normalizedFillTarget.minDay &&
                          dayIdx <= normalizedFillTarget.maxDay;

                        const isCornerOfRange =
                          normalizedRange
                            ? empIdx === normalizedRange.maxEmp && dayIdx === normalizedRange.maxDay
                            : isSelected;

                        const isSun = d.isSunday;
                        const cellId = `cell-${emp.id}-${d.dateStr}`;

                        return (
                          <td
                            key={d.dayNum}
                            id={cellId}
                            tabIndex={0}
                            onMouseDown={(e) => {
                              if (e.button !== 0) return;
                              setIsSelectingRange(true);
                              setRangeDragStart({ empIdx, dayIdx });
                              setSelectedCell({ empIdx, dayIdx });
                              setSelectionRange({
                                startEmp: empIdx,
                                endEmp: empIdx,
                                startDay: dayIdx,
                                endDay: dayIdx,
                              });
                            }}
                            onMouseEnter={() => {
                              if (isDraggingFill) {
                                setFillDragTarget({ empIdx, dayIdx });
                              } else if (isSelectingRange && rangeDragStart) {
                                setSelectionRange({
                                  startEmp: rangeDragStart.empIdx,
                                  endEmp: empIdx,
                                  startDay: rangeDragStart.dayIdx,
                                  endDay: dayIdx,
                                });
                              }
                            }}
                            onClick={() => {
                              if (activeTab === "attendance" && (!normalizedRange || (normalizedRange.minEmp === normalizedRange.maxEmp && normalizedRange.minDay === normalizedRange.maxDay))) {
                                handleAttendanceCellClick(emp.id, d.dateStr, status);
                              }
                            }}
                            className={`p-0 text-center border-r border-b cursor-cell transition select-none relative ${
                              isSun && !isSelected && !inRange && !inFill && !isPending
                                ? "bg-emerald-100 text-emerald-950 font-bold border-emerald-300"
                                : "border-slate-200"
                            } ${
                              inFill
                                ? "ring-2 ring-dashed ring-emerald-600 bg-emerald-100/50 z-20"
                                : isSelected
                                ? activeTab === "overtime"
                                  ? "ring-2 ring-purple-600 ring-inset bg-purple-50/70 z-20 font-bold"
                                  : "ring-2 ring-emerald-600 ring-inset bg-emerald-50/70 z-20 font-bold"
                                : inRange
                                ? activeTab === "overtime"
                                  ? "bg-purple-100/50 ring-1 ring-purple-400/50 z-10"
                                  : "bg-emerald-100/50 ring-1 ring-emerald-400/50 z-10"
                                : ""
                            } ${
                              isPending && !isSelected && !inRange ? "bg-amber-50/60" : ""
                            }`}
                          >
                            {/* Excel Fill Handle Square on corner */}
                            {(isCornerOfRange || isSelected) && (
                              <div
                                onMouseDown={(e) => {
                                  e.stopPropagation();
                                  e.preventDefault();
                                  setIsDraggingFill(true);
                                  setFillDragSource({ empIdx, dayIdx });
                                  setFillDragTarget({ empIdx, dayIdx });
                                }}
                                title="Drag across rows or columns to autofill"
                                className={`absolute -bottom-1 -right-1 w-2.5 h-2.5 border-2 border-white cursor-crosshair z-30 shadow-xs hover:scale-125 transition-transform ${
                                  activeTab === "overtime" ? "bg-purple-700" : "bg-emerald-700"
                                }`}
                              />
                            )}

                            {/* Cell Content */}
                            {activeTab === "attendance" ? (
                              <div className="h-8 flex items-center justify-center font-bold text-xs">
                                {status === "present" ? (
                                  <span className="text-emerald-700 font-bold">P</span>
                                ) : status === "absent" ? (
                                  <span className="inline-block w-5 h-5 leading-5 text-[11px] bg-rose-600 text-white font-black rounded-xs shadow-2xs">
                                    A
                                  </span>
                                ) : status === "late" ? (
                                  <span className="inline-block px-1 h-5 leading-5 text-[9px] bg-amber-200 text-amber-900 font-bold rounded-xs shadow-2xs">
                                    HD
                                  </span>
                                ) : status === "leave" ? (
                                  <span className="inline-block w-5 h-5 leading-5 text-[10px] bg-amber-100 text-amber-800 font-bold rounded-xs">
                                    L
                                  </span>
                                ) : status === "holiday" ? (
                                  <span className="inline-block w-5 h-5 leading-5 text-[10px] bg-sky-100 text-sky-800 font-bold rounded-xs">
                                    H
                                  </span>
                                ) : (
                                  <span className={isSun ? "text-emerald-500 font-black" : "text-slate-300 font-bold"}>·</span>
                                )}
                              </div>
                            ) : activeTab === "overtime" ? (
                              <div className="h-8 p-0.5 flex items-center justify-center">
                                <input
                                  type="number"
                                  min="0"
                                  max="24"
                                  step="0.5"
                                  value={otHours > 0 ? otHours : ""}
                                  placeholder="-"
                                  onFocus={() => {
                                    setSelectedCell({ empIdx, dayIdx });
                                    setSelectionRange({ startEmp: empIdx, endEmp: empIdx, startDay: dayIdx, endDay: dayIdx });
                                  }}
                                  onChange={e => handleOvertimeChange(emp.id, d.dateStr, e.target.value)}
                                  className={`ot-cell-input w-full h-full text-center text-xs font-bold rounded focus:outline-none focus:bg-white focus:ring-1 focus:ring-purple-600 ${
                                    otHours > 0
                                      ? "bg-purple-100 text-purple-900 font-black"
                                      : isSun
                                      ? "bg-transparent text-emerald-950 placeholder:text-emerald-500 font-bold"
                                      : "bg-transparent text-slate-700 placeholder:text-slate-400"
                                  }`}
                                />
                              </div>
                            ) : (
                              // Summary Tab View
                              <div className="h-8 flex flex-col items-center justify-center text-[10px] font-bold">
                                {status === "present" ? (
                                  <span className={isSun ? "text-emerald-900 font-black" : "text-emerald-700"}>P</span>
                                ) : status === "absent" ? (
                                  <span className="text-rose-600">A</span>
                                ) : status === "late" ? (
                                  <span className="text-amber-800">HD</span>
                                ) : (
                                  <span className={isSun ? "text-emerald-500 font-black" : "text-slate-300"}>·</span>
                                )}
                                {otHours > 0 && (
                                  <span className="text-[9px] text-purple-700 font-extrabold leading-none mt-0.5">
                                    +{otHours}h
                                  </span>
                                )}
                              </div>
                            )}
                          </td>
                        );
                      })}

                      {/* Summary Columns per Employee */}
                      {activeTab === "attendance" ? (
                        <>
                          <td className="px-2 py-1.5 text-center font-bold text-emerald-800 bg-emerald-50/60 border-r border-slate-200">
                            {attTotals.presentDaysCount}
                          </td>
                          <td className="px-2 py-1.5 text-center font-bold text-amber-800 bg-amber-50/60 border-r border-slate-200">
                            {attTotals.halfDaysCount > 0 ? `${attTotals.halfDaysCount}` : "0"}
                          </td>
                          <td className="px-2 py-1.5 text-center font-bold text-rose-700 bg-rose-50/60 border-r border-slate-200">
                            {attTotals.absentDaysCount}
                          </td>
                          <td className="px-2 py-1.5 text-center font-black text-blue-900 bg-blue-50/80 border-r border-slate-200" title={`Payable Days (Adjustment: ${adj.payable_days_adjustment})`}>
                            {attTotals.payableDays} d
                          </td>
                          <td className="px-1 py-1 text-center bg-slate-50">
                            <button
                              type="button"
                              onClick={() => setSelectedChargesEmp(emp)}
                              className="p-1 rounded-md text-slate-500 hover:text-slate-900 hover:bg-slate-200 transition"
                              title="Edit Attendance & Overtime Charges"
                            >
                              <Settings size={14} className="mx-auto" />
                            </button>
                          </td>
                        </>
                      ) : activeTab === "overtime" ? (
                        <>
                          <td className="px-2 py-1.5 text-center font-black text-purple-900 bg-purple-50/70 border-r border-slate-200">
                            {otTotals.effectiveHours > 0 ? otTotals.effectiveHours.toFixed(1) : "0"}
                          </td>
                          <td className="px-1.5 py-1 text-center border-r border-slate-200 font-medium">
                            <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                              adj.overtime_costing_method === "manual_fixed"
                                ? "bg-amber-100 text-amber-800"
                                : adj.overtime_costing_method === "hourly_rate"
                                ? "bg-blue-100 text-blue-800"
                                : "bg-purple-100 text-purple-800"
                            }`}>
                              {adj.overtime_costing_method === "manual_fixed" ? "Flat" : adj.overtime_costing_method === "hourly_rate" ? "Rate" : "Auto"}
                            </span>
                          </td>
                          <td className="px-1.5 py-1.5 text-right font-mono text-[11px] text-slate-700 border-r border-slate-200">
                            {otTotals.hourlyRate.toFixed(1)}
                          </td>
                          <td className="px-2 py-1.5 text-right font-black text-emerald-800 bg-emerald-50/60 border-r border-slate-200">
                            {otTotals.totalCharge > 0 ? fmtAED(otTotals.totalCharge) : "0"}
                          </td>
                          <td className="px-1.5 py-1 text-center border-r border-slate-200">
                            <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                              otTotals.isApproved ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-800"
                            }`}>
                              {otTotals.isApproved ? "Approved" : "Draft"}
                            </span>
                          </td>
                          <td className="px-1 py-1 text-center bg-slate-50">
                            <button
                              type="button"
                              onClick={() => setSelectedChargesEmp(emp)}
                              className="p-1 rounded-md text-slate-500 hover:text-slate-900 hover:bg-slate-200 transition"
                              title="Edit Overtime Charges & Rate"
                            >
                              <Settings size={14} className="mx-auto" />
                            </button>
                          </td>
                        </>
                      ) : (
                        <>
                          <td className="px-2 py-1.5 text-center font-bold text-emerald-700 border-r border-slate-200">
                            {attTotals.actualAttendanceDays} d
                          </td>
                          <td className="px-2 py-1.5 text-center font-bold text-blue-900 bg-blue-50/50 border-r border-slate-200">
                            {attTotals.payableDays} d
                          </td>
                          <td className="px-2 py-1.5 text-center font-black text-purple-900 border-r border-slate-200">
                            {otTotals.effectiveHours > 0 ? otTotals.effectiveHours.toFixed(1) : "0"}
                          </td>
                          <td className="px-2 py-1.5 text-right font-bold text-emerald-800 bg-emerald-50/60 border-r border-slate-200">
                            {otTotals.totalCharge > 0 ? fmtAED(otTotals.totalCharge) : "0"}
                          </td>
                          <td className="px-2 py-1.5 text-right font-black text-slate-900 bg-slate-100/60 border-r border-slate-200">
                            {fmtAED(breakdown.netSalary)}
                          </td>
                          <td className="px-1.5 py-1 text-center border-r border-slate-200">
                            <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                              stmt?.status === "paid"
                                ? "bg-emerald-100 text-emerald-800"
                                : stmt?.status === "approved"
                                ? "bg-blue-100 text-blue-800"
                                : stmt?.status === "draft"
                                ? "bg-amber-100 text-amber-800"
                                : "bg-slate-100 text-slate-600"
                            }`}>
                              {stmt?.status ? stmt.status : "Draft"}
                            </span>
                          </td>
                          <td className="px-1 py-1 text-center bg-slate-50">
                            <button
                              type="button"
                              onClick={() => setSelectedChargesEmp(emp)}
                              className="px-2 py-1 rounded-md text-[11px] font-bold bg-slate-900 text-white hover:bg-slate-800 transition shadow-2xs"
                              title="Open Payroll Breakdown Drawer"
                            >
                              Charges
                            </button>
                          </td>
                        </>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Floating Excel Selection Action Bar (Appears when dragging multiple cells) */}
        {normalizedRange && selectedCellCount > 1 && (
          <div className="fixed bottom-7 left-1/2 -translate-x-1/2 z-50 bg-slate-900/95 backdrop-blur-md text-white px-4 py-2.5 rounded-2xl shadow-2xl border border-slate-700 flex items-center gap-3 animate-in fade-in slide-in-from-bottom-2 duration-150">
            <div className="flex items-center gap-1.5 pr-3 border-r border-slate-700 text-xs font-bold text-slate-300">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              <span>{selectedCellCount} boxes selected</span>
            </div>

            {activeTab === "attendance" ? (
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => fillSelectedRangeAttendance("present")}
                  className="flex items-center gap-1 px-3 py-1 text-xs font-bold bg-emerald-600 hover:bg-emerald-500 rounded-lg shadow-xs transition"
                >
                  <span>Fill P (Present)</span>
                </button>
                <button
                  type="button"
                  onClick={() => fillSelectedRangeAttendance("absent")}
                  className="flex items-center gap-1 px-3 py-1 text-xs font-bold bg-rose-600 hover:bg-rose-500 rounded-lg shadow-xs transition"
                >
                  <span>Fill A (Absent)</span>
                </button>
                <button
                  type="button"
                  onClick={() => fillSelectedRangeAttendance("leave")}
                  className="flex items-center gap-1 px-3 py-1 text-xs font-bold bg-amber-600 hover:bg-amber-500 rounded-lg shadow-xs transition"
                >
                  <span>Fill L (Leave)</span>
                </button>
                <button
                  type="button"
                  onClick={() => fillSelectedRangeAttendance("holiday")}
                  className="flex items-center gap-1 px-3 py-1 text-xs font-bold bg-sky-600 hover:bg-sky-500 rounded-lg shadow-xs transition"
                >
                  <span>Fill H (Holiday)</span>
                </button>
                <button
                  type="button"
                  onClick={() => fillSelectedRangeAttendance("")}
                  className="px-2.5 py-1 text-xs font-medium bg-slate-800 hover:bg-rose-900 text-slate-300 rounded-lg transition"
                >
                  Clear All
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-1.5">
                {[0.5, 1, 1.5, 2, 3, 4, 8].map(h => (
                  <button
                    key={h}
                    type="button"
                    onClick={() => fillSelectedRangeOvertime(h)}
                    className="px-2.5 py-1 text-xs font-bold bg-purple-700 hover:bg-purple-600 rounded-lg shadow-xs transition"
                  >
                    {h}h
                  </button>
                ))}
                <div className="flex items-center gap-1 pl-2 border-l border-slate-700">
                  <input
                    type="number"
                    min="0"
                    max="24"
                    step="0.5"
                    value={customRangeOt}
                    onChange={e => setCustomRangeOt(e.target.value)}
                    className="w-14 px-1.5 py-1 text-xs bg-slate-800 text-white rounded border border-slate-700 text-center font-bold focus:outline-none"
                    placeholder="Hrs"
                  />
                  <button
                    type="button"
                    onClick={() => fillSelectedRangeOvertime(parseFloat(customRangeOt) || 0)}
                    className="px-2.5 py-1 text-xs font-bold bg-emerald-600 hover:bg-emerald-500 rounded-lg transition"
                  >
                    Set
                  </button>
                  <button
                    type="button"
                    onClick={() => fillSelectedRangeOvertime(0)}
                    className="px-2.5 py-1 text-xs font-medium bg-slate-800 hover:bg-rose-900 text-slate-300 rounded-lg transition ml-1"
                  >
                    Clear (0h)
                  </button>
                </div>
              </div>
            )}

            <button
              type="button"
              onClick={() => {
                setSelectionRange(null);
                setSelectedCell(null);
              }}
              className="p-1 text-slate-400 hover:text-white rounded-md transition ml-1"
              title="Deselect (Esc)"
            >
              <X size={15} />
            </button>
          </div>
        )}

        {/* Bottom Legend & Keyboard Guide */}
        <div className="mt-3 flex flex-wrap items-center justify-between gap-3 text-xs text-slate-300 bg-slate-900 p-2.5 rounded-xl border border-slate-800">
          <div className="flex items-center gap-3 flex-wrap">
            <span className="font-semibold text-slate-200 flex items-center gap-1">
              <HelpCircle size={14} className="text-slate-400" /> Excel Shortcuts & Payroll Legend:
            </span>
            <span className="flex items-center gap-1">
              <span className="font-bold text-emerald-400">P</span> = Present (1.0d)
            </span>
            <span className="flex items-center gap-1">
              <span className="inline-block px-1 text-[10px] bg-amber-200 text-amber-900 font-bold rounded-xs">HD</span> = Half Day (0.5d)
            </span>
            <span className="flex items-center gap-1">
              <span className="inline-block px-1 text-[10px] bg-rose-600 text-white font-bold rounded-xs">A</span> = Absent
            </span>
            <span className="flex items-center gap-1">
              <span className="inline-block px-1 text-[10px] bg-amber-100 text-amber-900 font-bold rounded-xs">L</span> = Leave
            </span>
            <span className="flex items-center gap-1">
              <span className="inline-block px-1 text-[10px] bg-sky-200 text-sky-900 font-bold rounded-xs">H</span> = Holiday
            </span>
            <span className="flex items-center gap-1">
              <span className="w-3 h-3 bg-emerald-600 rounded-xs inline-block" /> = Sunday
            </span>
          </div>
          <div className="text-[11px] text-slate-400">
            Arrow keys navigate · Click & drag boxes/headers to select · Click [Charges] to edit overtime charges & sync payroll · <kbd className="px-1 py-0.5 bg-slate-800 border border-slate-700 rounded font-mono text-[10px] text-slate-300">Ctrl+S</kbd> to save
          </div>
        </div>
      </div>
      </div>

      {/* Employee Payroll Charges & Breakdown Modal */}
      {selectedChargesEmp && (
        <EmployeePayrollChargesModal
          isOpen={Boolean(selectedChargesEmp)}
          onClose={() => setSelectedChargesEmp(null)}
          employee={selectedChargesEmp}
          empCode={formatEmployeeCode(selectedChargesEmp.employee_number)}
          year={year}
          month={month}
          dailyAttendance={days.map(d => getAttendanceStatus(selectedChargesEmp.id, d.dateStr))}
          daysInMonth={daysInMonth}
          rawOtHours={days.reduce((sum, d) => sum + getOvertimeHours(selectedChargesEmp.id, d.dateStr), 0)}
          currentAdjustment={monthlyAdjustments[selectedChargesEmp.id] || DEFAULT_MONTHLY_ADJUSTMENT}
          existingStatement={salaryStatementsForMonth[selectedChargesEmp.id] || null}
          onSaveAdjustment={async (adj) => {
            await handleSaveEmployeeAdjustment(selectedChargesEmp.id, adj);
          }}
          onSyncStatement={async (breakdown, notes) => {
            await handleSyncEmployeeStatement(selectedChargesEmp, breakdown, notes);
          }}
          onOpenPayslip={(slipData) => setActiveSlipModal(slipData)}
          onOpenVoucher={(voucherData) => setActiveVoucherModal(voucherData)}
        />
      )}

      {/* Salary Slip Print Modal */}
      {activeSlipModal && (() => {
        const docFile = generateDocumentPdfFilename({
          docType: "payslip",
          employeeName: activeSlipModal.employee_name,
          month: Number(activeSlipModal.month) || undefined,
          year: Number(activeSlipModal.year) || undefined,
        });
        return (
          <PrintModal
            isOpen={Boolean(activeSlipModal)}
            onClose={() => setActiveSlipModal(null)}
            documentFilename={docFile.filename}
            documentTitle={docFile.title}
          >
            <SalarySlipTemplate company={company} slip={activeSlipModal} onClose={() => setActiveSlipModal(null)} />
          </PrintModal>
        );
      })()}

      {/* Payment Voucher Print Modal */}
      {activeVoucherModal && (() => {
        const docFile = generateDocumentPdfFilename({
          docType: "employee_payment_voucher",
          docNumber: activeVoucherModal.voucher_number,
          employeeName: activeVoucherModal.employee_name,
          month: Number(activeVoucherModal.month) || undefined,
          year: Number(activeVoucherModal.year) || undefined,
        });
        return (
          <PrintModal
            isOpen={Boolean(activeVoucherModal)}
            onClose={() => setActiveVoucherModal(null)}
            documentFilename={docFile.filename}
            documentTitle={docFile.title}
          >
            <EmployeePaymentVoucherTemplate company={company} voucher={activeVoucherModal} onClose={() => setActiveVoucherModal(null)} />
          </PrintModal>
        );
      })()}


      {/* Excel Import Modal */}
      <AttendanceImportModal
        isOpen={showImportModal}
        onClose={() => setShowImportModal(false)}
        employees={employees}
        defaultYear={year}
        defaultMonth={month}
        onImportComplete={handleImportApply}
      />

      {/* Unconditional Print Container (guarantees browser print always renders clean landscape sheet) */}
      {!showPrintModal && (
        <div className="hidden print:block print-document document-sheet erp-document-surface">
          <AttendancePrintSheet
            company={company}
            year={year}
            month={month}
            mode={activeTab}
            employees={filteredEmployees}
            attendanceMap={Object.fromEntries(
              filteredEmployees.flatMap(e =>
                days.map(d => [`${e.id}_${d.dateStr}`, getAttendanceStatus(e.id, d.dateStr)])
              )
            )}
            overtimeMap={Object.fromEntries(
              filteredEmployees.flatMap(e =>
                days.map(d => [`${e.id}_${d.dateStr}`, getOvertimeHours(e.id, d.dateStr)])
              )
            )}
            forceSinglePage={forceSinglePage}
            printScale={printScale}
            colors={sheetColors}
          />
        </div>
      )}

      {/* Print View Modal */}
      {showPrintModal && (
        <div className="print-modal-container print-sheet-modal-backdrop fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-xs overflow-y-auto print:p-0 print:m-0 print:bg-transparent print:static print:overflow-visible">
          <div className="print-sheet-modal-dialog relative w-full max-w-[1300px] rounded-2xl bg-slate-900 shadow-2xl border border-slate-700 overflow-hidden my-4 print:border-none print:shadow-none print:my-0 print:max-w-none print:w-full print:bg-transparent">

            {/* ── Injected @page zoom hint for Chrome/Edge print engine ── */}
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
                .attendance-print-scale-root {
                  width: 297mm !important;
                  max-width: 297mm !important;
                  padding: 0 !important;
                  margin: 0 auto !important;
                  box-shadow: none !important;
                  border: none !important;
                  transform: none !important;
                }
              }
            `}} />

            {/* Modal Header */}
            <div className="flex items-center justify-between border-b border-slate-800 px-6 py-3.5 bg-slate-900 text-white no-print print:hidden">
              <div className="flex items-center gap-2.5">
                <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                  <Printer size={15} />
                </div>
                <div>
                  <h3 className="text-sm sm:text-base font-bold text-white leading-tight">Printable Attendance &amp; Overtime Sheet</h3>
                  <p className="text-[10px] text-slate-400">A4 Landscape • 297 × 210 mm • Margins: None (0) • Headers/Footers: Off</p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                {/* Print Settings Recommendation Badge */}
                <div className="hidden lg:flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-slate-800/80 border border-slate-700 text-[11px] text-slate-300">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400"></span>
                  <span>Print Hint: <strong>Margins: None</strong> • <strong>Headers/Footers: Off</strong></span>
                </div>

                {/* ── Print Scale Picker ── */}
                <div className="flex items-center gap-1 bg-slate-800 p-0.5 rounded-lg border border-slate-700 no-print">
                  {([
                    { id: "auto"      , label: "Auto Fit",   title: "Scale content to fit exactly one A4 landscape page" },
                    { id: "fit-width" , label: "Fit Width",  title: "Expand table to fill the full page width, rows may paginate" },
                    { id: "actual"    , label: "Actual Size", title: "No scaling — print at 100% (may overflow to multiple pages)" },
                  ] as { id: "auto" | "fit-width" | "actual"; label: string; title: string }[]).map((opt) => (
                    <button
                      key={opt.id}
                      type="button"
                      title={opt.title}
                      onClick={() => setPrintScale(opt.id)}
                      className={`px-2.5 py-1 rounded-md text-[11px] font-bold transition-all cursor-pointer ${
                        printScale === opt.id
                          ? "bg-emerald-600 text-white shadow-xs"
                          : "text-slate-400 hover:text-white hover:bg-slate-700"
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>

                {/* ── Palette Color Customizer Button ── */}
                <button
                  type="button"
                  onClick={() => setShowColorModal(true)}
                  className="flex items-center gap-1.5 rounded-lg bg-slate-800 border border-slate-700 px-3 py-1.5 text-xs font-bold text-slate-300 hover:text-white hover:bg-slate-700 transition cursor-pointer shadow-xs active:scale-95 no-print"
                  title="Customize Sunday column highlights, status badges, and table header accents"
                >
                  <Palette size={14} className="text-emerald-400" />
                  <span>Colors</span>
                </button>

                {/* ── Download A4 PDF Button (Primary Direct Clean Export) ── */}
                <button
                  type="button"
                  disabled={downloadingPdf}
                  onClick={handleDownloadPdf}
                  className="flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3.5 py-1.5 text-xs font-bold text-white hover:bg-emerald-500 transition cursor-pointer shadow-xs active:scale-95 disabled:opacity-50"
                  title="Download genuine A4 Landscape PDF directly without browser headers, footers or URL stamps"
                >
                  {downloadingPdf ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />}
                  <span>{downloadingPdf ? "Generating PDF..." : "Download A4 PDF"}</span>
                </button>

                {/* ── Print Now (Browser Print Dialog) ── */}
                <button
                  type="button"
                  onClick={() => window.print()}
                  className="flex items-center gap-1.5 rounded-lg bg-slate-800 border border-slate-700 px-3 py-1.5 text-xs font-bold text-slate-200 hover:text-white hover:bg-slate-700 transition cursor-pointer shadow-xs active:scale-95"
                  title="Print or Save via browser dialog (remember to uncheck 'Headers and footers' in Chrome)"
                >
                  <Printer size={14} /> Print Now
                </button>
                <button
                  type="button"
                  onClick={() => setShowPrintModal(false)}
                  className="rounded-lg p-1 text-slate-400 hover:text-white hover:bg-slate-800 transition cursor-pointer"
                >
                  <X size={20} />
                </button>
              </div>
            </div>

            {/* Print Guidance Banner: clear Chrome instructions for Headers/Footers */}
            <div className="no-print bg-slate-800/95 border-b border-slate-700 px-6 py-2 flex items-center justify-between text-xs text-slate-300 flex-wrap gap-2">
              <div className="flex items-center gap-2">
                <span className="flex h-4 w-4 items-center justify-center rounded-full bg-emerald-500/20 text-emerald-400 font-bold text-[9px]">✓</span>
                <span>
                  <strong className="text-white">Recommended:</strong> Click <strong className="text-emerald-400">Download A4 PDF</strong> for an instant clean document with zero browser URLs or stamps.
                </span>
              </div>
              <div className="flex items-center gap-1.5 text-slate-400 text-[11px]">
                <span className="w-1.5 h-1.5 rounded-full bg-amber-400 shrink-0"></span>
                <span>For <strong>Print Now</strong>: In Chrome print preview, open <em>More settings</em> → uncheck <em>Headers and footers</em>.</span>
              </div>
            </div>

            {/* High Employee Count Notice & Multi-page Selector (Calibrated for >24 Employees) */}
            {filteredEmployees.length > 24 && (
              <div className="no-print bg-slate-800/90 border-b border-slate-700/80 px-6 py-2.5 flex items-center justify-between text-xs text-slate-300 flex-wrap gap-2">
                <div className="flex items-center gap-2">
                  <AlertTriangle size={15} className="text-amber-400 shrink-0" />
                  <span>
                    <strong className="text-white">{filteredEmployees.length} Labourers Detected:</strong> A single A4 landscape sheet is calibrated for up to 24 employees to guarantee audit-grade legibility (≥7.5pt). Multi-page layout (24/page) is applied.
                  </span>
                </div>
                <div className="flex items-center gap-1.5 bg-slate-900 p-1 rounded-lg border border-slate-700">
                  <button
                    type="button"
                    onClick={() => setForceSinglePage(false)}
                    className={`px-2.5 py-1 rounded text-xs font-bold transition cursor-pointer ${
                      !forceSinglePage
                        ? "bg-emerald-600 text-white shadow-2xs"
                        : "text-slate-400 hover:text-white"
                    }`}
                  >
                    Multi-Page (Recommended)
                  </button>
                  <button
                    type="button"
                    onClick={() => setForceSinglePage(true)}
                    className={`px-2.5 py-1 rounded text-xs font-bold transition cursor-pointer ${
                      forceSinglePage
                        ? "bg-emerald-600 text-white shadow-2xs"
                        : "text-slate-400 hover:text-white"
                    }`}
                  >
                    Force 1-Page
                  </button>
                </div>
              </div>
            )}

            {/* Desk Surface Preview Container */}
            <div className="p-4 sm:p-6 bg-slate-950/80 overflow-y-auto max-h-[78vh] flex justify-center print:p-0 print:m-0 print:bg-transparent print:overflow-visible print:max-h-none print:block">

              {/* Paper Sheet Document Surface - Clean 1:1 match with print dimensions */}
              <div
                className={`attendance-print-scale-root print-document document-sheet erp-document-surface bg-white text-slate-900 shadow-2xl rounded-xs border border-slate-300 print:shadow-none print:border-none print:p-0 print:m-0 print:rounded-none mx-auto transition-all p-0 w-fit overflow-x-auto`}
              >
                <AttendancePrintSheet
                  company={company}
                  year={year}
                  month={month}
                  mode={activeTab}
                  employees={filteredEmployees}
                  attendanceMap={Object.fromEntries(
                    filteredEmployees.flatMap(e =>
                      days.map(d => [`${e.id}_${d.dateStr}`, getAttendanceStatus(e.id, d.dateStr)])
                    )
                  )}
                  overtimeMap={Object.fromEntries(
                    filteredEmployees.flatMap(e =>
                      days.map(d => [`${e.id}_${d.dateStr}`, getOvertimeHours(e.id, d.dateStr)])
                    )
                  )}
                  forceSinglePage={forceSinglePage}
                  printScale={printScale}
                  colors={sheetColors}
                />
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Color Customizer Modal */}
      <AttendanceColorCustomizerModal
        isOpen={showColorModal}
        onClose={() => setShowColorModal(false)}
        currentColors={sheetColors}
        onSave={(newColors) => {
          setSheetColors(newColors);
          setNotification({
            type: "success",
            message: "Attendance print sheet colors updated and saved persistently.",
          });
          setTimeout(() => setNotification(null), 3000);
        }}
      />
    </div>
  );
}

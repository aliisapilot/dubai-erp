"use client";
import React, { useState } from "react";
import {
  X,
  Save,
  CheckCircle2,
  Clock,
  CalendarCheck,
  Calculator,
  Printer,
  FileCheck2,
  ShieldCheck,
  Loader2,
  ChevronDown,
  ChevronRight,
} from "lucide-react";
import {
  MonthlyEmployeeAdjustment,
  DEFAULT_PAYROLL_RULES,
  calculateAttendanceTotals,
  calculateAuthoritativeMonthlyOvertime,
  calculateCompletePayrollBreakdown,
  CompletePayrollBreakdown,
  OvertimeCostingMethod,
} from "@/lib/payrollWorkflowService";
import { EmployeeInfo, AttendanceStatus } from "./AttendanceImportModal";
import { SalarySlipData } from "@/components/documents/SalarySlipTemplate";
import { PaymentVoucherData } from "@/components/documents/EmployeePaymentVoucherTemplate";
import { fmtAED } from "@/lib/helpers";

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December"
];

interface EmployeePayrollChargesModalProps {
  isOpen: boolean;
  onClose: () => void;
  employee: EmployeeInfo & {
    designation?: string | null;
    department?: string | null;
    bank_name?: string | null;
    account_number?: string | null;
    iban?: string | null;
    overtime_rate?: number | null;
    overtime_costing_method?: OvertimeCostingMethod | null;
    overtime_multiplier?: number | null;
  };
  empCode: string;
  year: number;
  month: number;
  dailyAttendance: (AttendanceStatus | "HD" | "")[];
  daysInMonth: number;
  rawOtHours: number;
  currentAdjustment: MonthlyEmployeeAdjustment;
  existingStatement?: { id: string; status: string; net_salary: number } | null;
  onSaveAdjustment: (adj: MonthlyEmployeeAdjustment) => Promise<void>;
  onSyncStatement: (breakdown: CompletePayrollBreakdown, notes: string) => Promise<void>;
  onOpenPayslip: (slipData: SalarySlipData) => void;
  onOpenVoucher: (voucherData: PaymentVoucherData) => void;
}

export default function EmployeePayrollChargesModal({
  isOpen,
  onClose,
  employee,
  empCode,
  year,
  month,
  dailyAttendance,
  daysInMonth,
  rawOtHours,
  currentAdjustment,
  existingStatement,
  onSaveAdjustment,
  onSyncStatement,
  onOpenPayslip,
  onOpenVoucher,
}: EmployeePayrollChargesModalProps) {
  // Determine effective initial costing method:
  // Default is "hourly_rate" per user instructions, but preserve existing saved method if set
  const initialCostingMethod: OvertimeCostingMethod =
    currentAdjustment?.overtime_costing_method ||
    employee?.overtime_costing_method ||
    "hourly_rate";

  // Initial hourly rate: check adjustment first, then employee profile, then auto formula
  const basicSalary = Number(employee?.basic_salary) || 0;
  const autoUaeRate = basicSalary > 0
    ? Number(((basicSalary / 30 / 8) * (employee?.overtime_multiplier || 1.25)).toFixed(2))
    : 0;

  const initialRate =
    currentAdjustment?.overtime_rate != null
      ? currentAdjustment.overtime_rate
      : employee?.overtime_rate != null
      ? employee.overtime_rate
      : autoUaeRate;

  // Local editable adjustment state
  const [form, setForm] = useState<MonthlyEmployeeAdjustment>(() => ({
    ...currentAdjustment,
    overtime_costing_method: initialCostingMethod,
    overtime_rate: initialRate > 0 ? initialRate : null,
  }));

  const [prevSyncKey, setPrevSyncKey] = useState<string>(
    `${employee?.id}-${year}-${month}-${isOpen}`
  );
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [saving, setSaving] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [notification, setNotification] = useState<{
    type: "success" | "error";
    message: string;
  } | null>(null);

  // Sync state during render when employee or modal open state changes
  const currentKey = `${employee?.id}-${year}-${month}-${isOpen}`;
  if (prevSyncKey !== currentKey) {
    setPrevSyncKey(currentKey);
    const resolvedMethod: OvertimeCostingMethod =
      currentAdjustment?.overtime_costing_method ||
      employee?.overtime_costing_method ||
      "hourly_rate";
    const resolvedRate =
      currentAdjustment?.overtime_rate != null
        ? currentAdjustment.overtime_rate
        : employee?.overtime_rate != null
        ? employee.overtime_rate
        : autoUaeRate;

    setForm({
      ...currentAdjustment,
      overtime_costing_method: resolvedMethod,
      overtime_rate: resolvedRate > 0 ? resolvedRate : null,
    });
    setNotification(null);
  }

  if (!isOpen) return null;

  const monthName = MONTH_NAMES[month - 1] || "";
  const periodStr = `${monthName} ${year}`;

  // 1. Attendance calculation
  const attResult = calculateAttendanceTotals(
    dailyAttendance,
    daysInMonth,
    DEFAULT_PAYROLL_RULES.workingDaysDivisor,
    {
      presentAdj: Number(form.present_days_adjustment) || 0,
      payableAdj: Number(form.payable_days_adjustment) || 0,
    }
  );

  // 2. Authoritative Overtime calculation (shared with workbook & payroll)
  const otResult = calculateAuthoritativeMonthlyOvertime({
    rawHours: rawOtHours,
    basicSalary,
    adjustment: form,
    employeeOvertimeRate: employee?.overtime_rate,
    employeeCostingMethod: employee?.overtime_costing_method,
    rules: DEFAULT_PAYROLL_RULES,
  });

  // 3. Complete Payroll Breakdown
  const breakdown = calculateCompletePayrollBreakdown({
    basicSalary,
    housingAllowance: 0,
    transportAllowance: 0,
    otherAllowances: 0,
    payableDays: attResult.payableDays,
    standardDays: DEFAULT_PAYROLL_RULES.workingDaysDivisor,
    overtimeCharge: otResult.isApproved ? otResult.totalCharge : 0,
    advanceDeduction: 0,
    otherDeductions: 0,
  });

  async function handleSaveCharges() {
    setSaving(true);
    setNotification(null);
    try {
      await onSaveAdjustment(form);
      setNotification({
        type: "success",
        message: "Overtime & payroll charges saved successfully!",
      });
    } catch (err: unknown) {
      setNotification({
        type: "error",
        message: err instanceof Error ? err.message : "Failed to save charges",
      });
    } finally {
      setSaving(false);
    }
  }

  async function handleSyncToStatement() {
    setSyncing(true);
    setNotification(null);
    try {
      await onSaveAdjustment(form);
      const note = `Synced from Overtime Workbook: ${attResult.payableDays} payable days, ${otResult.effectiveHours} OT hrs via ${form.overtime_costing_method}.`;
      await onSyncStatement(breakdown, note);
      setNotification({
        type: "success",
        message: `Salary Statement for ${periodStr} synchronized successfully!`,
      });
    } catch (err: unknown) {
      setNotification({
        type: "error",
        message: err instanceof Error ? err.message : "Failed to sync salary statement",
      });
    } finally {
      setSyncing(false);
    }
  }

  function handlePreviewSlip() {
    const slipData: SalarySlipData = {
      employee_name: employee.first_name || "Employee",
      employee_id: empCode,
      designation: employee.designation || undefined,
      department: employee.department || undefined,
      bank_name: employee.bank_name || undefined,
      account_number: employee.account_number || undefined,
      iban: employee.iban || undefined,
      month: month,
      year: year,
      basic_salary: breakdown.basicSalary,
      housing_allowance: breakdown.housingAllowance,
      transport_allowance: breakdown.transportAllowance,
      other_allowances: breakdown.otherAllowances,
      overtime_amount: breakdown.overtimeCharge,
      absence_deduction: breakdown.absenceDeduction,
      advance_deduction: breakdown.advanceDeduction,
      other_deductions: breakdown.otherDeductions,
      total_earnings: breakdown.grossSalary,
      total_deductions: breakdown.totalDeductions,
      net_pay: breakdown.netSalary,
      status: existingStatement?.status || "Draft",
    };
    onOpenPayslip(slipData);
  }

  function handlePreviewVoucher() {
    const voucherData: PaymentVoucherData = {
      voucher_number: `PV-${year}-${String(month).padStart(2, "0")}-${empCode.replace(/\D/g, "")}`,
      voucher_date: `${year}-${String(month).padStart(2, "0")}-28`,
      employee_name: employee.first_name || "Employee",
      employee_id: empCode,
      designation: employee.designation || undefined,
      month: month,
      year: year,
      net_amount: breakdown.netSalary,
      payment_method: "Bank Transfer",
      bank_name: employee.bank_name || undefined,
      notes: `Salary Payment for ${periodStr} - Payable Days: ${attResult.payableDays}, OT: ${otResult.effectiveHours} hrs`,
    };
    onOpenVoucher(voucherData);
  }

  // Costing method handler ensuring mutual exclusivity
  const activeMethod = form.overtime_costing_method || "hourly_rate";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs overflow-y-auto">
      <div className="relative w-full max-w-2xl bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden my-6 animate-in fade-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="bg-slate-900 text-white px-6 py-4 flex items-center justify-between border-b border-slate-800">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-purple-600/20 text-purple-400 border border-purple-500/30">
              <Clock size={20} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-mono text-xs px-2 py-0.5 rounded bg-slate-800 text-emerald-400 font-bold border border-slate-700">
                  {empCode}
                </span>
                <h2 className="text-base font-bold text-white leading-tight">
                  {employee.first_name || "Employee"} — Overtime & Payroll Charges
                </h2>
              </div>
              <p className="text-xs text-slate-400 mt-0.5">
                Period: <span className="text-white font-medium">{periodStr}</span> · Basic Salary:{" "}
                <span className="text-emerald-400 font-semibold">{fmtAED(basicSalary)}</span>
                {employee.designation ? ` · ${employee.designation}` : ""}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition"
          >
            <X size={20} />
          </button>
        </div>

        {/* Notifications */}
        {notification && (
          <div className="px-6 pt-3">
            <div
              className={`p-3 rounded-xl text-xs flex items-center justify-between font-medium ${
                notification.type === "success"
                  ? "bg-emerald-50 text-emerald-900 border border-emerald-200"
                  : "bg-rose-50 text-rose-900 border border-rose-200"
              }`}
            >
              <span>{notification.message}</span>
              <button
                onClick={() => setNotification(null)}
                className="text-slate-400 hover:text-slate-700"
              >
                <X size={14} />
              </button>
            </div>
          </div>
        )}

        <div className="p-6 space-y-5 max-h-[72vh] overflow-y-auto">
          {/* PRIMARY OVERTIME CHARGE CARD (Simplified layout per Part 2) */}
          <div className="rounded-xl border border-purple-200 bg-purple-50/40 p-5 space-y-4">
            {/* Top row: Employee, Period, Calculated Overtime Hours */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="bg-white p-3 rounded-xl border border-slate-200 shadow-2xs">
                <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider block">
                  Employee
                </span>
                <span className="text-sm font-bold text-slate-900 block truncate mt-0.5">
                  {employee.first_name || "Employee"}
                </span>
                <span className="font-mono text-xs text-slate-400">{empCode}</span>
              </div>

              <div className="bg-white p-3 rounded-xl border border-slate-200 shadow-2xs">
                <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider block">
                  Payroll Period
                </span>
                <span className="text-sm font-bold text-slate-900 block mt-0.5">
                  {periodStr}
                </span>
                <span className="text-xs text-slate-400">{daysInMonth} calendar days</span>
              </div>

              <div className="bg-white p-3 rounded-xl border border-purple-200 shadow-2xs">
                <span className="text-[11px] font-semibold text-purple-700 uppercase tracking-wider block">
                  Overtime Hours
                </span>
                <span className="text-lg font-black text-purple-900 block mt-0.5">
                  {otResult.effectiveHours.toFixed(1)} hrs
                </span>
                <span className="text-[11px] text-slate-500 block">
                  Raw: {rawOtHours.toFixed(1)} hrs
                  {form.overtime_hours_adjustment !== 0 && (
                    <span className="text-purple-600 font-semibold ml-1">
                      ({form.overtime_hours_adjustment > 0 ? "+" : ""}
                      {form.overtime_hours_adjustment.toFixed(1)} adj)
                    </span>
                  )}
                </span>
              </div>
            </div>

            {/* Payment Method Selector (Strictly mutually exclusive, default Hourly Rate) */}
            <div>
              <label className="block text-xs font-bold text-slate-800 mb-2">
                Payment Method (Choose one):
              </label>

              <div className="grid grid-cols-2 gap-3">
                {/* Method 1: Hourly Rate (Default) */}
                <button
                  type="button"
                  onClick={() => setForm({ ...form, overtime_costing_method: "hourly_rate" })}
                  className={`flex flex-col p-3 rounded-xl border text-left transition ${
                    activeMethod === "hourly_rate"
                      ? "border-purple-600 bg-purple-100/70 ring-1 ring-purple-600 shadow-xs"
                      : "border-slate-200 bg-white hover:bg-slate-50"
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-sm text-slate-900">Hourly Rate</span>
                    <span
                      className={`h-4 w-4 rounded-full border flex items-center justify-center ${
                        activeMethod === "hourly_rate"
                          ? "border-purple-600 bg-purple-600"
                          : "border-slate-300"
                      }`}
                    >
                      {activeMethod === "hourly_rate" && (
                        <span className="h-1.5 w-1.5 rounded-full bg-white" />
                      )}
                    </span>
                  </div>
                  <span className="text-xs text-slate-500 mt-1">
                    Hours × Rate per Hour
                  </span>
                </button>

                {/* Method 2: Fixed Amount */}
                <button
                  type="button"
                  onClick={() => setForm({ ...form, overtime_costing_method: "manual_fixed" })}
                  className={`flex flex-col p-3 rounded-xl border text-left transition ${
                    activeMethod === "manual_fixed"
                      ? "border-purple-600 bg-purple-100/70 ring-1 ring-purple-600 shadow-xs"
                      : "border-slate-200 bg-white hover:bg-slate-50"
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-sm text-slate-900">Fixed Amount</span>
                    <span
                      className={`h-4 w-4 rounded-full border flex items-center justify-center ${
                        activeMethod === "manual_fixed"
                          ? "border-purple-600 bg-purple-600"
                          : "border-slate-300"
                      }`}
                    >
                      {activeMethod === "manual_fixed" && (
                        <span className="h-1.5 w-1.5 rounded-full bg-white" />
                      )}
                    </span>
                  </div>
                  <span className="text-xs text-slate-500 mt-1">
                    Direct flat charge entered manually
                  </span>
                </button>
              </div>

              {/* Advanced Auto UAE method indicator if active */}
              {activeMethod === "auto" && (
                <div className="mt-2 text-xs bg-amber-50 border border-amber-200 text-amber-900 p-2.5 rounded-lg flex items-center justify-between">
                  <span>Currently using Advanced UAE Formula: (Basic / 30d / 8h) × 1.25</span>
                  <button
                    type="button"
                    onClick={() => setForm({ ...form, overtime_costing_method: "hourly_rate" })}
                    className="underline font-bold hover:text-amber-950"
                  >
                    Switch to Hourly Rate
                  </button>
                </div>
              )}
            </div>

            {/* Editable Rate or Amount Input & Live Calculation */}
            <div className="bg-white p-4 rounded-xl border border-slate-200 space-y-3">
              {activeMethod === "hourly_rate" ? (
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1.5">
                    Hourly Rate (AED / hour):
                  </label>
                  <div className="flex items-center gap-3">
                    <div className="relative flex-1">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-400">
                        AED
                      </span>
                      <input
                        type="number"
                        step="0.05"
                        min="0"
                        value={form.overtime_rate ?? ""}
                        placeholder={autoUaeRate > 0 ? autoUaeRate.toFixed(2) : "0.00"}
                        onChange={(e) => {
                          const val = parseFloat(e.target.value);
                          setForm({ ...form, overtime_rate: isNaN(val) ? null : val });
                        }}
                        className="w-full pl-12 pr-4 py-2 text-sm rounded-lg border border-slate-300 font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-purple-600"
                      />
                    </div>
                    <div className="text-xs text-slate-500 whitespace-nowrap">
                      Formula: <b>{otResult.effectiveHours.toFixed(1)} hrs</b> × AED{" "}
                      <b>{otResult.hourlyRate.toFixed(2)}</b>
                    </div>
                  </div>
                </div>
              ) : activeMethod === "manual_fixed" ? (
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1.5">
                    Fixed Overtime Amount (AED Flat):
                  </label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-400">
                      AED
                    </span>
                    <input
                      type="number"
                      step="0.05"
                      min="0"
                      value={form.overtime_manual_amount ?? ""}
                      placeholder="0.00"
                      onChange={(e) => {
                        const val = parseFloat(e.target.value);
                        setForm({ ...form, overtime_manual_amount: isNaN(val) ? null : val });
                      }}
                      className="w-full pl-12 pr-4 py-2 text-sm rounded-lg border border-slate-300 font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-purple-600"
                    />
                  </div>
                </div>
              ) : (
                <div className="text-xs text-slate-700">
                  Auto formula rate: <b>AED {otResult.hourlyRate.toFixed(2)} / hr</b> (Basic: AED {basicSalary})
                </div>
              )}

              {/* Total Overtime Charge & Approval Status Card */}
              <div className="pt-2 border-t border-slate-100 flex flex-wrap items-center justify-between gap-3">
                <div>
                  <span className="text-xs text-slate-500 font-medium block">
                    Total Overtime Charge
                  </span>
                  <span className="text-2xl font-black text-emerald-700 tracking-tight">
                    {fmtAED(otResult.totalCharge)}
                  </span>
                  {!otResult.isApproved && (
                    <span className="text-[11px] text-amber-700 block font-medium">
                      (Excluded from payroll totals until approved)
                    </span>
                  )}
                </div>

                {/* Approval Status Toggle */}
                <div className="flex items-center gap-2">
                  <span className="text-xs text-slate-600 font-medium">Status:</span>
                  <button
                    type="button"
                    onClick={() => setForm({ ...form, overtime_approved: !form.overtime_approved })}
                    className={`py-1.5 px-3 rounded-lg text-xs font-bold transition flex items-center gap-1.5 shadow-2xs ${
                      form.overtime_approved
                        ? "bg-emerald-600 text-white hover:bg-emerald-700"
                        : "bg-amber-100 text-amber-900 border border-amber-300 hover:bg-amber-200"
                    }`}
                  >
                    <ShieldCheck size={14} />
                    <span>{form.overtime_approved ? "✓ Approved" : "Pending Approval"}</span>
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* ADVANCED SETTINGS COLLAPSIBLE SECTION (Per Part 2) */}
          <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
            <button
              type="button"
              onClick={() => setShowAdvanced(!showAdvanced)}
              className="w-full px-4 py-3 bg-slate-50 hover:bg-slate-100 flex items-center justify-between text-left transition"
            >
              <div className="flex items-center gap-2 text-xs font-bold text-slate-800">
                {showAdvanced ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                <span>Advanced Settings & Adjustments</span>
                <span className="text-[11px] font-normal text-slate-500">
                  (Attendance adjustments, audit reasons, hours offset)
                </span>
              </div>
              <div className="text-xs font-medium text-slate-500">
                Payable Days: <b>{attResult.payableDays} d</b>
              </div>
            </button>

            {showAdvanced && (
              <div className="p-4 space-y-4 border-t border-slate-200 bg-white">
                {/* Attendance & Payable Days */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                      <CalendarCheck size={15} className="text-emerald-700" />
                      <span>Attendance & Payable Days</span>
                    </span>
                    <div className="text-xs text-slate-500">
                      Actual Worked: <b>{attResult.actualAttendanceDays} d</b> · Payable:{" "}
                      <b>{attResult.payableDays} d</b>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                    <div>
                      <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                        Manual Present Days Adjustment (+/- days)
                      </label>
                      <input
                        type="number"
                        step="0.5"
                        value={form.present_days_adjustment || ""}
                        placeholder="0"
                        onChange={(e) =>
                          setForm({ ...form, present_days_adjustment: parseFloat(e.target.value) || 0 })
                        }
                        className="w-full px-3 py-1.5 text-xs rounded-lg border border-slate-200 font-bold text-slate-800 focus:outline-none focus:ring-1 focus:ring-emerald-600"
                      />
                    </div>

                    <div>
                      <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                        Manual Payable Days Adjustment (+/- days)
                      </label>
                      <input
                        type="number"
                        step="0.5"
                        value={form.payable_days_adjustment || ""}
                        placeholder="0"
                        onChange={(e) =>
                          setForm({ ...form, payable_days_adjustment: parseFloat(e.target.value) || 0 })
                        }
                        className="w-full px-3 py-1.5 text-xs rounded-lg border border-slate-200 font-bold text-slate-800 focus:outline-none focus:ring-1 focus:ring-emerald-600"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                      Attendance Correction Remarks / Audit Reason
                    </label>
                    <input
                      type="text"
                      value={form.attendance_remarks || ""}
                      placeholder="e.g. Approved site off-day compensation, medical excuse..."
                      onChange={(e) => setForm({ ...form, attendance_remarks: e.target.value })}
                      className="w-full px-3 py-1.5 text-xs rounded-lg border border-slate-200 text-slate-800 focus:outline-none focus:ring-1 focus:ring-emerald-600"
                    />
                  </div>
                </div>

                {/* Overtime Hours Adjustment & Project Remarks */}
                <div className="pt-3 border-t border-slate-100 space-y-3">
                  <span className="text-xs font-bold text-slate-800 block">
                    Overtime Adjustments & Remarks
                  </span>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div>
                      <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                        Hours Adjustment (+/- hrs)
                      </label>
                      <input
                        type="number"
                        step="0.5"
                        value={form.overtime_hours_adjustment || ""}
                        placeholder="0"
                        onChange={(e) =>
                          setForm({ ...form, overtime_hours_adjustment: parseFloat(e.target.value) || 0 })
                        }
                        className="w-full px-3 py-1.5 text-xs rounded-lg border border-slate-200 font-bold text-slate-800 focus:outline-none focus:ring-1 focus:ring-purple-600"
                      />
                    </div>

                    <div className="sm:col-span-2">
                      <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                        Overtime Remarks / Project Reference
                      </label>
                      <input
                        type="text"
                        value={form.overtime_remarks || ""}
                        placeholder="e.g. Rigging shift, weekend emergency delivery..."
                        onChange={(e) => setForm({ ...form, overtime_remarks: e.target.value })}
                        className="w-full px-3 py-1.5 text-xs rounded-lg border border-slate-200 text-slate-800 focus:outline-none focus:ring-1 focus:ring-purple-600"
                      />
                    </div>
                  </div>

                  {/* Optional UAE standard formula button */}
                  <div className="pt-1 flex items-center justify-between text-xs bg-slate-50 p-2.5 rounded-lg border border-slate-200">
                    <div>
                      <span className="font-semibold text-slate-800 block">
                        UAE Standard Auto Formula
                      </span>
                      <span className="text-[11px] text-slate-500">
                        (Basic Salary / 30 days / 8 hrs) × 1.25 multiplier = AED {autoUaeRate.toFixed(2)}/hr
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => setForm({ ...form, overtime_costing_method: "auto" })}
                      className={`px-2.5 py-1 rounded text-xs font-bold transition ${
                        activeMethod === "auto"
                          ? "bg-purple-600 text-white"
                          : "bg-white border border-slate-300 text-slate-700 hover:bg-slate-100"
                      }`}
                    >
                      {activeMethod === "auto" ? "✓ Active" : "Apply Auto Method"}
                    </button>
                  </div>
                </div>

                {/* Salary Breakdown Preview */}
                <div className="pt-3 border-t border-slate-100">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                      <Calculator size={14} className="text-slate-600" />
                      <span>Live Salary Breakdown Preview</span>
                    </span>
                    <span className="text-[11px] text-slate-400">
                      Official Statement: {existingStatement?.status || "Unsynchronized"}
                    </span>
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                    <div className="p-2 rounded bg-slate-50 border border-slate-200">
                      <span className="text-[10px] text-slate-500 block">Basic Salary</span>
                      <span className="font-bold text-slate-900">{fmtAED(breakdown.basicSalary)}</span>
                    </div>

                    <div className="p-2 rounded bg-purple-50 border border-purple-200">
                      <span className="text-[10px] text-purple-700 block">Overtime</span>
                      <span className="font-bold text-purple-900">
                        +{fmtAED(otResult.isApproved ? otResult.totalCharge : 0)}
                      </span>
                    </div>

                    <div className="p-2 rounded bg-rose-50 border border-rose-200">
                      <span className="text-[10px] text-rose-700 block">Deductions</span>
                      <span className="font-bold text-rose-800">
                        -{fmtAED(breakdown.totalDeductions)}
                      </span>
                    </div>

                    <div className="p-2 rounded bg-slate-900 text-white">
                      <span className="text-[10px] text-slate-300 block">Net Salary</span>
                      <span className="font-black text-emerald-400">{fmtAED(breakdown.netSalary)}</span>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Footer Actions (Per Part 2) */}
        <div className="bg-slate-100 border-t border-slate-200 px-6 py-3.5 flex flex-wrap items-center justify-between gap-3">
          {/* Secondary Actions */}
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handlePreviewSlip}
              disabled={saving || syncing}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 disabled:opacity-50 transition"
              title="Preview and export Payslip PDF"
            >
              <Printer size={14} className="text-slate-500" />
              <span>Preview Payslip</span>
            </button>

            <button
              type="button"
              onClick={handlePreviewVoucher}
              disabled={saving || syncing}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 disabled:opacity-50 transition"
              title="Preview and export Payment Voucher PDF"
            >
              <FileCheck2 size={14} className="text-blue-600" />
              <span>Payment Voucher</span>
            </button>
          </div>

          {/* Primary Actions: Cancel, Save, Save & Sync */}
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              disabled={saving || syncing}
              className="px-3.5 py-1.5 text-xs font-semibold rounded-lg border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 disabled:opacity-50 transition"
            >
              Cancel
            </button>

            <button
              type="button"
              onClick={handleSaveCharges}
              disabled={saving || syncing}
              className="flex items-center gap-1.5 px-4 py-1.5 text-xs font-bold rounded-lg border border-slate-300 bg-white text-slate-900 hover:bg-slate-50 disabled:opacity-50 transition shadow-2xs"
            >
              {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
              <span>{saving ? "Saving…" : "Save"}</span>
            </button>

            <button
              type="button"
              onClick={handleSyncToStatement}
              disabled={saving || syncing}
              className="flex items-center gap-1.5 px-4 py-1.5 text-xs font-bold rounded-lg bg-emerald-700 text-white hover:bg-emerald-600 disabled:opacity-50 transition shadow-xs"
            >
              {syncing ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle2 size={14} />}
              <span>{syncing ? "Syncing…" : "Save & Sync Salary Statement"}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

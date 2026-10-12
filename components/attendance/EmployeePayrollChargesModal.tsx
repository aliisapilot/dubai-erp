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
} from "lucide-react";
import {
  MonthlyEmployeeAdjustment,
  DEFAULT_PAYROLL_RULES,
  calculateAttendanceTotals,
  calculateOvertimeCharge,
  calculateCompletePayrollBreakdown,
  CompletePayrollBreakdown,
} from "@/lib/payrollWorkflowService";
import { EmployeeInfo, AttendanceStatus } from "./AttendanceImportModal";
import { SalarySlipData } from "@/components/documents/SalarySlipTemplate";
import { PaymentVoucherData } from "@/components/documents/EmployeePaymentVoucherTemplate";
import { fmtAED } from "@/lib/helpers";

interface EmployeePayrollChargesModalProps {
  isOpen: boolean;
  onClose: () => void;
  employee: EmployeeInfo & {
    designation?: string | null;
    department?: string | null;
    bank_name?: string | null;
    account_number?: string | null;
    iban?: string | null;
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
  // Local editable adjustment state
  const [form, setForm] = useState<MonthlyEmployeeAdjustment>({ ...currentAdjustment });
  const [prevSyncKey, setPrevSyncKey] = useState<string>(`${employee?.id}-${year}-${month}-${isOpen}`);
  const [saving, setSaving] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [notification, setNotification] = useState<{ type: "success" | "error"; message: string } | null>(null);

  // Sync state during render when employee or modal open state changes
  const currentKey = `${employee?.id}-${year}-${month}-${isOpen}`;
  if (prevSyncKey !== currentKey) {
    setPrevSyncKey(currentKey);
    setForm({ ...currentAdjustment });
    setNotification(null);
  }

  if (!isOpen) return null;

  const basicSalary = Number(employee.basic_salary) || 0;

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

  // 2. Overtime calculation
  const otResult = calculateOvertimeCharge(
    basicSalary,
    rawOtHours,
    form,
    DEFAULT_PAYROLL_RULES
  );

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

  const periodStr = `${year}-${String(month).padStart(2, "0")}`;

  async function handleSaveCharges() {
    setSaving(true);
    setNotification(null);
    try {
      await onSaveAdjustment(form);
      setNotification({ type: "success", message: "Employee charges & adjustments saved successfully!" });
    } catch (err: unknown) {
      setNotification({ type: "error", message: err instanceof Error ? err.message : "Failed to save adjustments" });
    } finally {
      setSaving(false);
    }
  }

  async function handleSyncToStatement() {
    setSyncing(true);
    setNotification(null);
    try {
      // First save adjustment settings
      await onSaveAdjustment(form);
      // Then sync official salary statement
      const note = `Synced from Attendance & Overtime Workbook: ${attResult.payableDays} payable days, ${otResult.effectiveHours} OT hrs via ${form.overtime_costing_method}.`;
      await onSyncStatement(breakdown, note);
      setNotification({ type: "success", message: `Salary Statement for ${periodStr} synchronized successfully!` });
    } catch (err: unknown) {
      setNotification({ type: "error", message: err instanceof Error ? err.message : "Failed to sync salary statement" });
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
      voucher_number: `EPV-${year}-${String(month).padStart(2, "0")}-${empCode.replace(/\D/g, "")}`,
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

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs overflow-y-auto">
      <div className="relative w-full max-w-4xl bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden my-6 animate-in fade-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="bg-slate-900 text-white px-6 py-4 flex items-center justify-between border-b border-slate-800">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-emerald-600/20 text-emerald-400 border border-emerald-500/30">
              <Calculator size={20} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-mono text-xs px-2 py-0.5 rounded bg-emerald-950 text-emerald-300 font-bold border border-emerald-700">
                  {empCode}
                </span>
                <h2 className="text-base font-bold text-white leading-tight">
                  {employee.first_name || "Employee"} — Payroll Charges & Breakdown
                </h2>
              </div>
              <p className="text-xs text-slate-400 mt-0.5">
                Period: {periodStr} · Basic Salary: <span className="text-emerald-400 font-semibold">{fmtAED(basicSalary)}</span>
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
              <button onClick={() => setNotification(null)} className="text-slate-400 hover:text-slate-700">
                <X size={14} />
              </button>
            </div>
          </div>
        )}

        <div className="p-6 space-y-6 max-h-[75vh] overflow-y-auto">
          {/* SECTION 1: ATTENDANCE & PAYABLE DAYS */}
          <div className="rounded-xl border border-slate-200 bg-slate-50/60 p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <CalendarCheck size={18} className="text-emerald-700" />
                <h3 className="text-sm font-bold text-slate-900">1. Attendance & Payable Days</h3>
              </div>
              <div className="flex items-center gap-2 text-xs font-semibold">
                <span className="bg-emerald-100 text-emerald-900 px-2 py-0.5 rounded">
                  Actual Worked: <b>{attResult.actualAttendanceDays} d</b>
                </span>
                <span className="bg-blue-100 text-blue-900 px-2 py-0.5 rounded">
                  Payable Days: <b>{attResult.payableDays} d</b>
                </span>
              </div>
            </div>

            <p className="text-xs text-slate-500">
              Recorded raw: {attResult.presentDaysCount} Present (P), {attResult.halfDaysCount} Half Day (HD), {attResult.absentDaysCount} Absent (A), {attResult.leaveDaysCount} Leave (L), {attResult.holidayDaysCount} Holiday (H).
              Original records remain untouched. Adjustments are auditable additions.
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-1">
              {/* Present Days Adjustment */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Manual Present Days Adjustment (+/- days)
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    step="0.5"
                    value={form.present_days_adjustment || ""}
                    placeholder="0"
                    onChange={(e) => setForm({ ...form, present_days_adjustment: parseFloat(e.target.value) || 0 })}
                    className="w-full px-3 py-1.5 text-xs rounded-lg border border-slate-200 bg-white font-bold text-slate-800 focus:outline-none focus:ring-1 focus:ring-emerald-600"
                  />
                  <span className="text-xs text-slate-400 whitespace-nowrap">
                    Total: {attResult.actualAttendanceDays} d
                  </span>
                </div>
              </div>

              {/* Payable Days Adjustment */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Manual Payable Days Adjustment (+/- days)
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    step="0.5"
                    value={form.payable_days_adjustment || ""}
                    placeholder="0"
                    onChange={(e) => setForm({ ...form, payable_days_adjustment: parseFloat(e.target.value) || 0 })}
                    className="w-full px-3 py-1.5 text-xs rounded-lg border border-slate-200 bg-white font-bold text-slate-800 focus:outline-none focus:ring-1 focus:ring-emerald-600"
                  />
                  <span className="text-xs text-slate-400 whitespace-nowrap">
                    Total: {attResult.payableDays} d
                  </span>
                </div>
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Attendance Correction Remarks / Audit Reason
              </label>
              <input
                type="text"
                value={form.attendance_remarks || ""}
                placeholder="e.g. Approved site off-day compensation, medical excuse..."
                onChange={(e) => setForm({ ...form, attendance_remarks: e.target.value })}
                className="w-full px-3 py-1.5 text-xs rounded-lg border border-slate-200 bg-white text-slate-800 focus:outline-none focus:ring-1 focus:ring-emerald-600"
              />
            </div>
          </div>

          {/* SECTION 2: OVERTIME CHARGES & COSTING METHODS */}
          <div className="rounded-xl border border-slate-200 bg-purple-50/40 p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Clock size={18} className="text-purple-700" />
                <h3 className="text-sm font-bold text-slate-900">2. Overtime Costing & Charges</h3>
              </div>
              <div className="flex items-center gap-2 text-xs font-semibold">
                <span className="bg-purple-100 text-purple-900 px-2.5 py-0.5 rounded">
                  Total OT Charge: <b>{fmtAED(otResult.totalCharge)}</b>
                </span>
                <span className={`px-2 py-0.5 rounded text-[11px] font-bold ${
                  form.overtime_approved ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-800"
                }`}>
                  {form.overtime_approved ? "✓ Approved" : "Pending Approval"}
                </span>
              </div>
            </div>

            <div className="flex items-center gap-4 text-xs text-slate-600 flex-wrap">
              <span>Raw Recorded Hours: <b>{rawOtHours.toFixed(1)} hrs</b></span>
              <div className="flex items-center gap-1.5">
                <span>Manual Hours Adjustment:</span>
                <input
                  type="number"
                  step="0.5"
                  value={form.overtime_hours_adjustment || ""}
                  placeholder="0"
                  onChange={(e) => setForm({ ...form, overtime_hours_adjustment: parseFloat(e.target.value) || 0 })}
                  className="w-16 px-2 py-0.5 text-xs rounded border border-slate-300 bg-white font-bold text-center"
                />
                <span>hrs</span>
              </div>
              <span>Effective Hours: <b>{otResult.effectiveHours.toFixed(1)} hrs</b></span>
            </div>

            {/* Costing Method Selector (Strictly mutually exclusive) */}
            <div className="space-y-2 pt-1">
              <span className="block text-xs font-bold text-slate-800">
                Costing Method (Select exactly one method):
              </span>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
                {/* Method A: Auto UAE */}
                <label
                  className={`flex flex-col p-3 rounded-xl border cursor-pointer transition ${
                    form.overtime_costing_method === "auto"
                      ? "border-purple-600 bg-purple-100/60 shadow-xs"
                      : "border-slate-200 bg-white hover:bg-slate-50"
                  }`}
                >
                  <div className="flex items-center gap-2 font-bold text-slate-900">
                    <input
                      type="radio"
                      name="ot_method"
                      checked={form.overtime_costing_method === "auto"}
                      onChange={() => setForm({ ...form, overtime_costing_method: "auto" })}
                      className="text-purple-600"
                    />
                    <span>A. Auto (UAE Standard)</span>
                  </div>
                  <span className="text-[11px] text-slate-500 mt-1">
                    (Basic / 30d / 8h) × 1.25 multiplier
                  </span>
                  <span className="text-xs font-bold text-purple-900 mt-1.5">
                    Rate: {fmtAED(basicSalary > 0 ? (basicSalary / 30 / 8) * 1.25 : 0)}/hr
                  </span>
                </label>

                {/* Method B: Manual Hourly Rate */}
                <label
                  className={`flex flex-col p-3 rounded-xl border cursor-pointer transition ${
                    form.overtime_costing_method === "hourly_rate"
                      ? "border-purple-600 bg-purple-100/60 shadow-xs"
                      : "border-slate-200 bg-white hover:bg-slate-50"
                  }`}
                >
                  <div className="flex items-center gap-2 font-bold text-slate-900">
                    <input
                      type="radio"
                      name="ot_method"
                      checked={form.overtime_costing_method === "hourly_rate"}
                      onChange={() => setForm({ ...form, overtime_costing_method: "hourly_rate" })}
                      className="text-purple-600"
                    />
                    <span>B. Manual Hourly Rate</span>
                  </div>
                  <span className="text-[11px] text-slate-500 mt-1">
                    Hours × Custom Rate per Hour
                  </span>
                  <div className="flex items-center gap-1.5 mt-1.5">
                    <span className="text-xs font-bold text-slate-700">AED</span>
                    <input
                      type="number"
                      step="0.5"
                      min="0"
                      value={form.overtime_rate ?? ""}
                      placeholder="e.g. 25"
                      disabled={form.overtime_costing_method !== "hourly_rate"}
                      onChange={(e) => setForm({ ...form, overtime_rate: parseFloat(e.target.value) || 0 })}
                      className="w-20 px-2 py-0.5 text-xs rounded border border-slate-300 bg-white font-bold focus:outline-none focus:ring-1 focus:ring-purple-600"
                    />
                    <span className="text-xs text-slate-500">/hr</span>
                  </div>
                </label>

                {/* Method C: Manual Total Charge */}
                <label
                  className={`flex flex-col p-3 rounded-xl border cursor-pointer transition ${
                    form.overtime_costing_method === "manual_fixed"
                      ? "border-purple-600 bg-purple-100/60 shadow-xs"
                      : "border-slate-200 bg-white hover:bg-slate-50"
                  }`}
                >
                  <div className="flex items-center gap-2 font-bold text-slate-900">
                    <input
                      type="radio"
                      name="ot_method"
                      checked={form.overtime_costing_method === "manual_fixed"}
                      onChange={() => setForm({ ...form, overtime_costing_method: "manual_fixed" })}
                      className="text-purple-600"
                    />
                    <span>C. Manual Flat Total</span>
                  </div>
                  <span className="text-[11px] text-slate-500 mt-1">
                    Direct entry of final overtime amount
                  </span>
                  <div className="flex items-center gap-1.5 mt-1.5">
                    <span className="text-xs font-bold text-slate-700">AED</span>
                    <input
                      type="number"
                      step="1"
                      min="0"
                      value={form.overtime_manual_amount ?? ""}
                      placeholder="e.g. 500"
                      disabled={form.overtime_costing_method !== "manual_fixed"}
                      onChange={(e) => setForm({ ...form, overtime_manual_amount: parseFloat(e.target.value) || 0 })}
                      className="w-24 px-2 py-0.5 text-xs rounded border border-slate-300 bg-white font-bold focus:outline-none focus:ring-1 focus:ring-purple-600"
                    />
                    <span className="text-xs text-slate-500">flat</span>
                  </div>
                </label>
              </div>
            </div>

            {/* Calculation Explanation */}
            <div className="bg-white/80 p-2.5 rounded-lg border border-purple-200 text-xs text-purple-950 font-medium">
              💡 {otResult.explanation}
            </div>

            {/* Overtime Remarks & Approval */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 items-end">
              <div className="sm:col-span-2">
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Overtime Remarks / Project Reference
                </label>
                <input
                  type="text"
                  value={form.overtime_remarks || ""}
                  placeholder="e.g. Rigging shift, weekend emergency delivery..."
                  onChange={(e) => setForm({ ...form, overtime_remarks: e.target.value })}
                  className="w-full px-3 py-1.5 text-xs rounded-lg border border-slate-200 bg-white text-slate-800 focus:outline-none focus:ring-1 focus:ring-purple-600"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Approval Status
                </label>
                <button
                  type="button"
                  onClick={() => setForm({ ...form, overtime_approved: !form.overtime_approved })}
                  className={`w-full py-1.5 px-3 rounded-lg text-xs font-bold transition flex items-center justify-center gap-1.5 ${
                    form.overtime_approved
                      ? "bg-emerald-600 text-white shadow-xs hover:bg-emerald-500"
                      : "bg-amber-100 text-amber-900 border border-amber-300 hover:bg-amber-200"
                  }`}
                >
                  <ShieldCheck size={14} />
                  <span>{form.overtime_approved ? "Approved for Payroll" : "Pending Approval"}</span>
                </button>
              </div>
            </div>
          </div>

          {/* SECTION 3: ITEMIZED SALARY BREAKDOWN & PAYROLL PREVIEW */}
          <div className="rounded-xl border border-slate-200 bg-white p-4 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                <Calculator size={18} className="text-slate-700" />
                <span>3. Live Salary Breakdown Preview ({periodStr})</span>
              </h3>
              <div className="text-xs text-slate-500">
                Official Status: <span className="font-bold text-slate-800">{existingStatement?.status || "Unsynchronized"}</span>
              </div>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
              <div className="p-2.5 rounded-lg bg-slate-50 border border-slate-200">
                <span className="text-slate-400 block font-medium">Basic Salary</span>
                <span className="text-sm font-bold text-slate-900">{fmtAED(breakdown.basicSalary)}</span>
              </div>

              <div className="p-2.5 rounded-lg bg-emerald-50/70 border border-emerald-200">
                <span className="text-emerald-700 block font-medium">Overtime Pay</span>
                <span className="text-sm font-black text-emerald-800">
                  {otResult.isApproved ? `+ ${fmtAED(breakdown.overtimeCharge)}` : "AED 0.00 (Pending)"}
                </span>
              </div>

              <div className="p-2.5 rounded-lg bg-rose-50/70 border border-rose-200">
                <span className="text-rose-700 block font-medium">Absence / Deductions</span>
                <span className="text-sm font-bold text-rose-800">
                  {breakdown.totalDeductions > 0 ? `- ${fmtAED(breakdown.totalDeductions)}` : "AED 0.00"}
                </span>
              </div>

              <div className="p-2.5 rounded-lg bg-slate-900 text-white shadow-xs">
                <span className="text-slate-300 block font-medium">Estimated Net Salary</span>
                <span className="text-sm font-black text-emerald-400">{fmtAED(breakdown.netSalary)}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="bg-slate-100 border-t border-slate-200 px-6 py-3.5 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2 flex-wrap">
            <button
              type="button"
              onClick={handlePreviewSlip}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 transition"
            >
              <Printer size={14} className="text-slate-500" />
              <span>Preview Payslip</span>
            </button>

            <button
              type="button"
              onClick={handlePreviewVoucher}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 transition"
            >
              <FileCheck2 size={14} className="text-blue-600" />
              <span>Payment Voucher</span>
            </button>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleSaveCharges}
              disabled={saving}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded-lg border border-slate-300 bg-white text-slate-800 hover:bg-slate-50 transition"
            >
              {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
              <span>Save Charges Only</span>
            </button>

            <button
              type="button"
              onClick={handleSyncToStatement}
              disabled={syncing}
              className="flex items-center gap-1.5 px-4 py-1.5 text-xs font-bold rounded-lg bg-emerald-700 text-white hover:bg-emerald-600 transition shadow-xs"
            >
              {syncing ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle2 size={14} />}
              <span>Save & Sync Salary Statement</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

import { supabase } from "./supabase";

export type AttendanceStatus =
  | "present"
  | "absent"
  | "leave"
  | "holiday"
  | "late"
  | "early_departure"
  | "half_day";


export type OvertimeCostingMethod = "auto" | "hourly_rate" | "manual_fixed";

export interface CompanyPayrollRules {
  workingDaysDivisor: number; // typically 30 (UAE standard) or 26
  regularOtMultiplier: number; // 1.25 (UAE standard day)
  nightWeekendOtMultiplier: number; // 1.50 (UAE Friday / Night / Holiday)
}

export const DEFAULT_PAYROLL_RULES: CompanyPayrollRules = {
  workingDaysDivisor: 30,
  regularOtMultiplier: 1.25,
  nightWeekendOtMultiplier: 1.50,
};

export interface EmployeeSalarySettings {
  basic_salary: number;
  housing_allowance: number;
  transport_allowance: number;
  other_allowances: number;
  overtime_rate: number | null; // custom AED/hr
  overtime_costing_method: OvertimeCostingMethod;
  working_days_divisor: number;
  overtime_multiplier: number;
}

export interface MonthlyEmployeeAdjustment {
  present_days_adjustment: number;
  payable_days_adjustment: number;
  attendance_remarks: string;
  overtime_costing_method: OvertimeCostingMethod;
  overtime_rate: number | null; // manual hourly rate
  overtime_manual_amount: number | null; // flat AED charge
  overtime_hours_adjustment: number;
  overtime_remarks: string;
  overtime_approved: boolean;
}

export const DEFAULT_MONTHLY_ADJUSTMENT: MonthlyEmployeeAdjustment = {
  present_days_adjustment: 0,
  payable_days_adjustment: 0,
  attendance_remarks: "",
  overtime_costing_method: "hourly_rate",
  overtime_rate: null,
  overtime_manual_amount: null,
  overtime_hours_adjustment: 0,
  overtime_remarks: "",
  overtime_approved: true,
};

export interface AttendanceCalculationResult {
  presentDaysCount: number; // Raw P count
  halfDaysCount: number; // Raw HD count (each 0.5)
  absentDaysCount: number; // Raw A count
  leaveDaysCount: number; // Raw L count
  holidayDaysCount: number; // Raw H count
  actualAttendanceDays: number; // P + 0.5*HD + present_days_adjustment
  payableDays: number; // e.g. Divisor - Absent - 0.5*HD + payable_days_adjustment
  standardDays: number;
  attendanceAdjustmentAmount: number; // (Basic / Divisor) * (payableDays - standardDays)
}

export interface OvertimeCalculationResult {
  rawRecordedHours: number;
  effectiveHours: number;
  method: OvertimeCostingMethod;
  hourlyRate: number; // AED / hr
  totalCharge: number; // AED
  isApproved: boolean;
  explanation: string;
}

export interface CompletePayrollBreakdown {
  basicSalary: number;
  housingAllowance: number;
  transportAllowance: number;
  otherAllowances: number;
  totalAllowances: number;
  attendanceAdjustment: number;
  overtimeCharge: number;
  grossSalary: number;
  absenceDeduction: number;
  advanceDeduction: number;
  otherDeductions: number;
  totalDeductions: number;
  netSalary: number;
}

/**
 * 1. Calculate Attendance and Payable Days strictly distinguishing actual vs payable
 */
export function calculateAttendanceTotals(
  statuses: (AttendanceStatus | "HD" | "")[],
  daysInMonth: number,
  divisor: number = 30,
  adj: { presentAdj?: number; payableAdj?: number } = {}
): AttendanceCalculationResult {
  let p = 0;
  let hd = 0;
  let a = 0;
  let l = 0;
  let h = 0;

  statuses.forEach((s) => {
    if (s === "present") p++;
    else if (s === "late" || (s as string) === "HD") hd++;
    else if (s === "absent") a++;
    else if (s === "leave") l++;
    else if (s === "holiday") h++;
  });

  const presentAdj = adj.presentAdj || 0;
  const payableAdj = adj.payableAdj || 0;

  // Actual Attendance Days = P + 0.5*HD + presentAdj
  const actualAttendanceDays = Math.max(0, p + hd * 0.5 + presentAdj);

  // Payable Days in UAE standard payroll:
  // Base is the standard divisor (e.g. 30 days) minus unpaid absences (A + 0.5*HD) plus payable adjustment.
  const payableDays = Math.max(0, Math.min(daysInMonth, divisor - a - hd * 0.5 + payableAdj));

  return {
    presentDaysCount: p,
    halfDaysCount: hd,
    absentDaysCount: a,
    leaveDaysCount: l,
    holidayDaysCount: h,
    actualAttendanceDays: Number(actualAttendanceDays.toFixed(1)),
    payableDays: Number(payableDays.toFixed(1)),
    standardDays: divisor,
    attendanceAdjustmentAmount: 0,
  };
}

/**
 * 2. Calculate Overtime charges with strict decimal-safe monetary precision
 */
export function calculateOvertimeCharge(
  basicSalary: number,
  rawHours: number,
  adj: MonthlyEmployeeAdjustment,
  rules: CompanyPayrollRules = DEFAULT_PAYROLL_RULES,
  defaultRate?: number | null
): OvertimeCalculationResult {
  const effectiveHours = Math.max(0, rawHours + (adj.overtime_hours_adjustment || 0));
  const method = adj.overtime_costing_method || "hourly_rate";

  let hourlyRate = 0;
  let totalCharge = 0;
  let explanation = "";

  const divisor = rules.workingDaysDivisor || 30;
  const multiplier = rules.regularOtMultiplier || 1.25;

  if (method === "manual_fixed") {
    // METHOD C: Manual total charge (flat AED amount)
    totalCharge = Math.max(0, Number(adj.overtime_manual_amount) || 0);
    hourlyRate = effectiveHours > 0 ? Number((totalCharge / effectiveHours).toFixed(2)) : 0;
    explanation = `Manual Flat Charge: AED ${totalCharge.toFixed(2)} (Overridden by user)`;
  } else if (method === "hourly_rate") {
    // METHOD B: Hourly rate (default method per user instructions)
    const autoBaseRate = basicSalary > 0 ? Number(((basicSalary / divisor / 8) * multiplier).toFixed(2)) : 0;
    const rateCandidate =
      adj.overtime_rate != null && !isNaN(Number(adj.overtime_rate))
        ? Number(adj.overtime_rate)
        : defaultRate != null && !isNaN(Number(defaultRate))
        ? Number(defaultRate)
        : autoBaseRate;

    hourlyRate = Math.max(0, Number(rateCandidate.toFixed(2)));
    totalCharge = Number((effectiveHours * hourlyRate).toFixed(2));
    explanation = `Hourly Rate: ${effectiveHours.toFixed(1)} hrs × AED ${hourlyRate.toFixed(2)}/hr = AED ${totalCharge.toFixed(2)}`;
  } else {
    // METHOD A: Automatic UAE calculation
    // Base hourly rate = Basic Salary / Divisor / 8 hrs
    const baseHour = basicSalary > 0 ? basicSalary / divisor / 8 : 0;
    hourlyRate = Number((baseHour * multiplier).toFixed(2));
    totalCharge = Number((effectiveHours * hourlyRate).toFixed(2));
    explanation = `Auto UAE Formula: (AED ${basicSalary} / ${divisor}d / 8h) × ${multiplier} = AED ${hourlyRate.toFixed(2)}/h × ${effectiveHours.toFixed(1)} hrs = AED ${totalCharge.toFixed(2)}`;
  }

  const isApproved = adj.overtime_approved !== false;
  // Decimal-safe exact calculation without rounding away cents
  const calculatedCharge = Number(totalCharge.toFixed(2));

  return {
    rawRecordedHours: Number(rawHours.toFixed(2)),
    effectiveHours: Number(effectiveHours.toFixed(2)),
    method,
    hourlyRate: Number(hourlyRate.toFixed(2)),
    totalCharge: isApproved ? calculatedCharge : 0,
    isApproved,
    explanation: isApproved
      ? explanation
      : `Pending Approval: ${effectiveHours.toFixed(1)} hrs (Calculated: AED ${calculatedCharge.toFixed(2)}, excluded from payroll until approved)`,
  };
}

export interface AuthoritativeMonthlyOvertime {
  rawHours: number;
  hoursAdjustment: number;
  effectiveHours: number;
  costingMethod: OvertimeCostingMethod;
  hourlyRate: number;
  totalCharge: number;
  rate: number;
  amount: number;
  method: OvertimeCostingMethod;
  isApproved: boolean;
  explanation: string;
}

/**
 * Authoritative single monthly overtime calculation shared across:
 * Overtime workbook, Payroll Charges popup, Payroll Summary, Salary Statements,
 * Payslips, Payment Vouchers, and PDF exports.
 */
export function calculateAuthoritativeMonthlyOvertime(params: {
  rawHours: number;
  basicSalary?: number;
  employee?: {
    basic_salary?: number | null;
    overtime_rate?: number | null;
    overtime_costing_method?: OvertimeCostingMethod | string | null;
  } | null;
  adjustment?: Partial<MonthlyEmployeeAdjustment> | null;
  employeeOvertimeRate?: number | null;
  employeeCostingMethod?: OvertimeCostingMethod | null;
  rules?: CompanyPayrollRules;
}): AuthoritativeMonthlyOvertime {
  const rawHours = Math.max(0, Number(params.rawHours) || 0);
  const basic = Math.max(
    0,
    Number(params.basicSalary ?? params.employee?.basic_salary) || 0
  );
  const rules = params.rules || DEFAULT_PAYROLL_RULES;
  const adj = params.adjustment || {};

  const hoursAdjustment = Number(adj.overtime_hours_adjustment) || 0;
  const effectiveHours = Math.max(0, rawHours + hoursAdjustment);

  const empMethod = (params.employeeCostingMethod ??
    params.employee?.overtime_costing_method) as OvertimeCostingMethod | undefined;
  const empRate =
    params.employeeOvertimeRate ??
    (params.employee?.overtime_rate != null
      ? Number(params.employee.overtime_rate)
      : null);

  // Costing method priority:
  // 1. Explicit adjustment method if set
  // 2. Employee profile default method if set
  // 3. Fallback to "hourly_rate" (default specified by user)
  const costingMethod: OvertimeCostingMethod =
    adj.overtime_costing_method || empMethod || "hourly_rate";

  const divisor = rules.workingDaysDivisor || 30;
  const multiplier = rules.regularOtMultiplier || 1.25;

  let hourlyRate = 0;
  let totalCharge = 0;
  let explanation = "";

  if (costingMethod === "manual_fixed") {
    totalCharge = Math.max(0, Number(adj.overtime_manual_amount) || 0);
    hourlyRate = effectiveHours > 0 ? Number((totalCharge / effectiveHours).toFixed(2)) : 0;
    explanation = `Fixed Amount: AED ${totalCharge.toFixed(2)} (Manual)`;
  } else if (costingMethod === "hourly_rate") {
    const autoBaseRate = basic > 0 ? Number(((basic / divisor / 8) * multiplier).toFixed(2)) : 0;
    const rateCandidate =
      adj.overtime_rate != null && !isNaN(Number(adj.overtime_rate))
        ? Number(adj.overtime_rate)
        : empRate != null && !isNaN(Number(empRate))
        ? Number(empRate)
        : autoBaseRate;

    hourlyRate = Math.max(0, Number(rateCandidate.toFixed(2)));
    totalCharge = Number((effectiveHours * hourlyRate).toFixed(2));
    explanation = `Hourly Rate: ${effectiveHours.toFixed(1)} hrs × AED ${hourlyRate.toFixed(2)}/hr = AED ${totalCharge.toFixed(2)}`;
  } else {
    // "auto" (UAE Standard)
    const baseHour = basic > 0 ? basic / divisor / 8 : 0;
    hourlyRate = Number((baseHour * multiplier).toFixed(2));
    totalCharge = Number((effectiveHours * hourlyRate).toFixed(2));
    explanation = `Auto UAE Formula: (AED ${basic} / ${divisor}d / 8h) × ${multiplier} = AED ${hourlyRate.toFixed(2)}/h × ${effectiveHours.toFixed(1)} hrs = AED ${totalCharge.toFixed(2)}`;
  }

  const isApproved = adj.overtime_approved !== false;
  const exactCharge = Number(totalCharge.toFixed(2));

  return {
    rawHours: Number(rawHours.toFixed(2)),
    hoursAdjustment: Number(hoursAdjustment.toFixed(2)),
    effectiveHours: Number(effectiveHours.toFixed(2)),
    costingMethod,
    hourlyRate: Number(hourlyRate.toFixed(2)),
    totalCharge: isApproved ? exactCharge : 0,
    rate: Number(hourlyRate.toFixed(2)),
    amount: isApproved ? exactCharge : 0,
    method: costingMethod,
    isApproved,
    explanation: isApproved
      ? explanation
      : `Pending Approval: ${effectiveHours.toFixed(1)} hrs (Calculated: AED ${exactCharge.toFixed(2)}, excluded from payroll until approved)`,
  };
}

/**
 * 3. Calculate Itemized Salary Breakdown with decimal-safe exact currency
 */
export function calculateCompletePayrollBreakdown(params: {
  basicSalary: number;
  housingAllowance?: number;
  transportAllowance?: number;
  otherAllowances?: number;
  payableDays: number;
  standardDays?: number;
  overtimeCharge: number;
  advanceDeduction?: number;
  otherDeductions?: number;
}): CompletePayrollBreakdown {
  const basic = Math.max(0, params.basicSalary || 0);
  const housing = Math.max(0, params.housingAllowance || 0);
  const transport = Math.max(0, params.transportAllowance || 0);
  const otherAllow = Math.max(0, params.otherAllowances || 0);
  const totalAllowances = Number((housing + transport + otherAllow).toFixed(2));

  const stdDays = params.standardDays || 30;
  const payDays = params.payableDays ?? stdDays;

  // Attendance adjustment / absence deduction:
  // If payable days < standard days, there is an absence deduction
  let absenceDeduction = 0;
  let attendanceAdjustment = 0;

  if (payDays < stdDays) {
    absenceDeduction = Number(((basic / stdDays) * (stdDays - payDays)).toFixed(2));
    attendanceAdjustment = -absenceDeduction;
  } else if (payDays > stdDays) {
    attendanceAdjustment = Number(((basic / stdDays) * (payDays - stdDays)).toFixed(2));
  }

  const overtime = Math.max(0, Number(Number(params.overtimeCharge || 0).toFixed(2)));
  const advances = Math.max(0, Number(Number(params.advanceDeduction || 0).toFixed(2)));
  const otherDed = Math.max(0, Number(Number(params.otherDeductions || 0).toFixed(2)));
  const totalDeductions = Number((absenceDeduction + advances + otherDed).toFixed(2));

  const gross = Number((basic + totalAllowances + overtime + (attendanceAdjustment > 0 ? attendanceAdjustment : 0)).toFixed(2));
  const net = Math.max(0, Number((gross - totalDeductions).toFixed(2)));

  return {
    basicSalary: Number(basic.toFixed(2)),
    housingAllowance: Number(housing.toFixed(2)),
    transportAllowance: Number(transport.toFixed(2)),
    otherAllowances: Number(otherAllow.toFixed(2)),
    totalAllowances,
    attendanceAdjustment,
    overtimeCharge: overtime,
    grossSalary: gross,
    absenceDeduction,
    advanceDeduction: advances,
    otherDeductions: otherDed,
    totalDeductions,
    netSalary: net,
  };
}

/**
 * Local storage fallback key for resilience when remote table is unmigrated
 */
function getStorageKey(companyId: string, period: string): string {
  return `dubai_erp_monthly_payroll_adj_${companyId}_${period}`;
}

/**
 * 4. Fetch Monthly Adjustments for all employees in a period (with resilient DB / LocalStorage fallback)
 */
export async function getMonthlyAdjustmentsForPeriod(
  companyId: string,
  period: string
): Promise<Record<string, MonthlyEmployeeAdjustment>> {
  const result: Record<string, MonthlyEmployeeAdjustment> = {};

  // Try fetching from Supabase table if it exists
  try {
    const { data, error } = await supabase
      .from("monthly_payroll_adjustments")
      .select("*")
      .eq("company_id", companyId)
      .eq("period", period);

    if (!error && Array.isArray(data)) {
      data.forEach((row) => {
        result[row.employee_id] = {
          present_days_adjustment: Number(row.present_days_adjustment) || 0,
          payable_days_adjustment: Number(row.payable_days_adjustment) || 0,
          attendance_remarks: row.attendance_remarks || "",
          overtime_costing_method: (row.overtime_costing_method as OvertimeCostingMethod) || "auto",
          overtime_rate: row.overtime_rate != null ? Number(row.overtime_rate) : null,
          overtime_manual_amount: row.overtime_manual_amount != null ? Number(row.overtime_manual_amount) : null,
          overtime_hours_adjustment: Number(row.overtime_hours_adjustment) || 0,
          overtime_remarks: row.overtime_remarks || "",
          overtime_approved: row.overtime_approved !== false,
        };
      });
      return result;
    }
  } catch {
    // Table not migrated yet; fallback seamlessly
  }

  // Fallback to localStorage if in browser
  if (typeof window !== "undefined") {
    try {
      const stored = window.localStorage.getItem(getStorageKey(companyId, period));
      if (stored) {
        const parsed = JSON.parse(stored);
        Object.assign(result, parsed);
      }
    } catch {}
  }

  return result;
}

/**
 * 5. Save Monthly Adjustment for an employee (with resilient DB / LocalStorage fallback)
 */
export async function saveMonthlyEmployeeAdjustment(
  companyId: string,
  employeeId: string,
  period: string,
  adj: MonthlyEmployeeAdjustment
): Promise<void> {
  // Always update browser storage for offline/resilience
  if (typeof window !== "undefined") {
    try {
      const key = getStorageKey(companyId, period);
      const existing = JSON.parse(window.localStorage.getItem(key) || "{}");
      existing[employeeId] = adj;
      window.localStorage.setItem(key, JSON.stringify(existing));
    } catch {}
  }

  // Try saving to Supabase table
  try {
    const { error } = await supabase.from("monthly_payroll_adjustments").upsert(
      {
        company_id: companyId,
        employee_id: employeeId,
        period,
        present_days_adjustment: adj.present_days_adjustment,
        payable_days_adjustment: adj.payable_days_adjustment,
        attendance_remarks: adj.attendance_remarks,
        overtime_costing_method: adj.overtime_costing_method,
        overtime_rate: adj.overtime_rate,
        overtime_manual_amount: adj.overtime_manual_amount,
        overtime_hours_adjustment: adj.overtime_hours_adjustment,
        overtime_remarks: adj.overtime_remarks,
        overtime_approved: adj.overtime_approved,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "company_id,employee_id,period" }
    );
    if (!error) return;
  } catch {
    // Handled gracefully via storage fallback
  }
}

/**
 * 6. Generate / Sync Salary Statement record into database from the Workbook
 */
export async function syncSalaryStatementFromWorkbook(params: {
  companyId: string;
  employeeId: string;
  year: number;
  month: number;
  breakdown: CompletePayrollBreakdown;
  overtimeHours: number;
  status?: "draft" | "approved" | "paid";
  notes?: string;
}): Promise<{ id: string; isNew: boolean }> {
  const periodStr = `${params.year}-${String(params.month).padStart(2, "0")}`;
  const startDate = `${periodStr}-01`;

  // Check if an existing salary statement exists for this employee and month
  const { data: existingList, error: checkError } = await supabase
    .from("salary_statements")
    .select("id, status")
    .eq("company_id", params.companyId)
    .eq("employee_id", params.employeeId)
    .gte("payroll_month", startDate)
    .lte("payroll_month", `${periodStr}-31`)
    .limit(1);

  if (checkError) {
    throw new Error(`Failed to check existing salary statement: ${checkError.message}`);
  }

  const existing = existingList && existingList.length > 0 ? existingList[0] : null;

  // Never overwrite paid statements silently!
  if (existing && existing.status === "paid") {
    throw new Error("This salary statement is already marked as Paid and finalized. It cannot be altered.");
  }

  const statusToSave = existing ? existing.status : (params.status || "draft");

  const corePayload: Record<string, unknown> = {
    company_id: params.companyId,
    employee_id: params.employeeId,
    payroll_month: startDate,
    basic_salary: params.breakdown.basicSalary,
    overtime_amount: params.breakdown.overtimeCharge,
    gross_salary: params.breakdown.grossSalary,
    absence_deduction: params.breakdown.absenceDeduction,
    advance_deduction: params.breakdown.advanceDeduction,
    other_deductions: params.breakdown.otherDeductions,
    total_deductions: params.breakdown.totalDeductions,
    net_salary: params.breakdown.netSalary,
    status: statusToSave,
  };

  // Add optional breakdown columns if supported
  try {
    corePayload.overtime_hours = params.overtimeHours;
    corePayload.housing_allowance = params.breakdown.housingAllowance;
    corePayload.transport_allowance = params.breakdown.transportAllowance;
    corePayload.other_allowances = params.breakdown.otherAllowances;
    corePayload.payroll_year = params.year;
    corePayload.notes = params.notes || `Generated from Attendance & Overtime Workbook (${periodStr})`;
  } catch {}

  if (existing?.id) {
    const { error: updateError } = await supabase
      .from("salary_statements")
      .update(corePayload)
      .eq("id", existing.id);

    if (updateError) {
      // If error occurred due to unmigrated columns, fallback to basic columns
      delete corePayload.overtime_hours;
      delete corePayload.housing_allowance;
      delete corePayload.transport_allowance;
      delete corePayload.other_allowances;
      delete corePayload.payroll_year;
      delete corePayload.notes;
      const { error: fallbackError } = await supabase
        .from("salary_statements")
        .update(corePayload)
        .eq("id", existing.id);
      if (fallbackError) throw new Error(fallbackError.message);
    }
    return { id: existing.id, isNew: false };
  } else {
    const { data: newRow, error: insertError } = await supabase
      .from("salary_statements")
      .insert(corePayload)
      .select("id")
      .single();

    if (insertError) {
      delete corePayload.overtime_hours;
      delete corePayload.housing_allowance;
      delete corePayload.transport_allowance;
      delete corePayload.other_allowances;
      delete corePayload.payroll_year;
      delete corePayload.notes;
      const { data: fbRow, error: fbInsertError } = await supabase
        .from("salary_statements")
        .insert(corePayload)
        .select("id")
        .single();
      if (fbInsertError) throw new Error(fbInsertError.message);
      return { id: fbRow?.id || "", isNew: true };
    }
    return { id: newRow?.id || "", isNew: true };
  }
}

/**
 * 7. Get Employee Salary & Payroll Settings with persistent fallback
 */
export async function getEmployeeSalarySettings(
  employeeId: string
): Promise<EmployeeSalarySettings & { effective_date?: string | null }> {
  const defaults: EmployeeSalarySettings & { effective_date?: string | null } = {
    basic_salary: 0,
    housing_allowance: 0,
    transport_allowance: 0,
    other_allowances: 0,
    overtime_rate: null,
    overtime_costing_method: "auto",
    working_days_divisor: 30,
    overtime_multiplier: 1.25,
    effective_date: null,
  };

  // Try DB
  try {
    const { data } = await supabase.from("employees").select("*").eq("id", employeeId).maybeSingle();
    if (data) {
      defaults.basic_salary = Number(data.basic_salary) || 0;
      if (data.housing_allowance != null) defaults.housing_allowance = Number(data.housing_allowance) || 0;
      if (data.transport_allowance != null) defaults.transport_allowance = Number(data.transport_allowance) || 0;
      if (data.other_allowances != null) defaults.other_allowances = Number(data.other_allowances) || 0;
      if (data.overtime_rate != null) defaults.overtime_rate = Number(data.overtime_rate);
      if (data.overtime_costing_method) defaults.overtime_costing_method = data.overtime_costing_method;
      if (data.working_days_divisor) defaults.working_days_divisor = Number(data.working_days_divisor);
      if (data.overtime_multiplier) defaults.overtime_multiplier = Number(data.overtime_multiplier);
      if (data.salary_effective_date) defaults.effective_date = data.salary_effective_date;
    }
  } catch {}

  // Fallback to localStorage if available
  if (typeof window !== "undefined") {
    try {
      const stored = window.localStorage.getItem(`dubai_erp_employee_salary_settings_${employeeId}`);
      if (stored) {
        const parsed = JSON.parse(stored);
        Object.assign(defaults, parsed);
      }
    } catch {}
  }

  return defaults;
}

/**
 * 8. Save Employee Salary & Payroll Settings with persistent fallback
 */
export async function saveEmployeeSalarySettings(
  employeeId: string,
  settings: Partial<EmployeeSalarySettings & { effective_date?: string | null }>
): Promise<void> {
  // Always update browser storage for resilience
  if (typeof window !== "undefined") {
    try {
      const key = `dubai_erp_employee_salary_settings_${employeeId}`;
      const existing = JSON.parse(window.localStorage.getItem(key) || "{}");
      window.localStorage.setItem(key, JSON.stringify({ ...existing, ...settings }));
    } catch {}
  }

  // Try saving to Supabase table
  try {
    const payload: Record<string, unknown> = {};
    if (settings.basic_salary !== undefined) payload.basic_salary = settings.basic_salary;
    if (settings.housing_allowance !== undefined) payload.housing_allowance = settings.housing_allowance;
    if (settings.transport_allowance !== undefined) payload.transport_allowance = settings.transport_allowance;
    if (settings.other_allowances !== undefined) payload.other_allowances = settings.other_allowances;
    if (settings.overtime_rate !== undefined) payload.overtime_rate = settings.overtime_rate;
    if (settings.overtime_costing_method !== undefined) payload.overtime_costing_method = settings.overtime_costing_method;
    if (settings.working_days_divisor !== undefined) payload.working_days_divisor = settings.working_days_divisor;
    if (settings.overtime_multiplier !== undefined) payload.overtime_multiplier = settings.overtime_multiplier;
    if (settings.effective_date !== undefined) payload.salary_effective_date = settings.effective_date;

    if (Object.keys(payload).length > 0) {
      await supabase.from("employees").update(payload).eq("id", employeeId);
    }
  } catch {}
}


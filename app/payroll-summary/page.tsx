"use client";
import ReportLoadState from "@/components/ReportLoadState";
import { useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";
import { BarChart3, Loader2 } from "lucide-react";
import { fmtAED } from "@/lib/helpers";

type SS = { id: string; employee_id: string | null; payroll_month: string | number | null; gross_salary: number | null; net_salary: number | null; overtime_amount: number | null; status: string | null };
type Employee = { id: string; first_name: string | null; name?: string | null };
const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
const now = new Date();

export default function PayrollSummaryPage() {
  const [records, setRecords] = useState<SS[]>([]);
  const [empMap, setEmpMap] = useState<Record<string, Employee>>({});
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth()+1);
  const [loading, setLoading] = useState(true);

  const [loadError, setLoadError] = useState("");
  const [loadedPeriod, setLoadedPeriod] = useState("");
  const requestVersion = useRef(0);

  async function load() {
    const version = ++requestVersion.current;
    setLoadError("");
    try {
    setLoading(true);
    const startDate = `${year}-${String(month).padStart(2, "0")}-01`;
    const lastDay = new Date(year, month, 0).getDate();
    const endDate = `${year}-${String(month).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;

    const [{ data: ss, error: salaryError }, { data: emps, error: employeeError }] = await Promise.all([
      supabase.from("salary_statements").select("*").gte("payroll_month", startDate).lte("payroll_month", endDate),
      supabase.from("employees").select("id, first_name").order("first_name"),
    ]);
    if (salaryError || employeeError) throw new Error((salaryError || employeeError)!.message);
    if (version !== requestVersion.current) return;
    setLoadedPeriod(`${year}-${month}`);
    setRecords((ss || []) as SS[]);
    const em: Record<string, Employee> = {};
    (emps || []).forEach((e: Employee) => { em[e.id] = e; });
    setEmpMap(em);
    } catch (err) {
      if (version === requestVersion.current) { setLoadError(err instanceof Error ? err.message : "Could not load payroll."); setLoadedPeriod(`${year}-${month}`); }
    } finally {
      if (version === requestVersion.current) setLoading(false);
    }
  }

  // The selected payroll period is the complete refresh key.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { void Promise.resolve().then(load); }, [year, month]);

  const totalGross = records.reduce((s,r) => s + (r.gross_salary||0), 0);
  const totalOT = records.reduce((s,r) => s + (r.overtime_amount||0), 0);
  const totalDed = records.reduce((s,r) => s + ((r.gross_salary||0) - (r.net_salary||0)), 0);
  const totalNet = records.reduce((s,r) => s + (r.net_salary||0), 0);
  const finalized = records.filter(r => ["paid", "approved", "Finalized", "Paid", "Approved"].includes(r.status || "")).length;
  const draft = records.filter(r => !["paid", "approved", "Finalized", "Paid", "Approved"].includes(r.status || "")).length;



  return (
    <main className="min-h-screen bg-slate-50">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-5">
          <div className="flex items-center gap-3">
            <div className="rounded-xl bg-slate-900 p-2.5 text-white"><BarChart3 size={22} /></div>
            <div><h1 className="text-2xl font-bold text-slate-900">Payroll Summary</h1><p className="text-sm text-slate-500">Monthly payroll overview and totals</p></div>
          </div>
          <div className="flex gap-3">
            <select value={month} onChange={e=>setMonth(Number(e.target.value))} className="rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm focus:border-slate-400 focus:outline-none appearance-none">
              {MONTHS.map((m,i)=><option key={i+1} value={i+1}>{m}</option>)}
            </select>
            <input type="number" value={year} onChange={e=>setYear(Number(e.target.value))} min="2020" max="2099" className="w-24 rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm focus:border-slate-400 focus:outline-none" />
          </div>
        </div>
      </header>
      <div className="mx-auto max-w-7xl px-6 py-8">
        {loading || loadedPeriod !== `${year}-${month}` || loadError ? <ReportLoadState loading={loading || loadedPeriod !== `${year}-${month}`} error={loadError} onRetry={() => void load()} /> : <>
        <div className="mb-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
          {[["Total Employees",records.length,"slate"],["Gross Payroll",fmtAED(totalGross),"emerald"],["OT Amount",fmtAED(totalOT),"amber"],["Total Deductions",fmtAED(totalDed),"red"],["Net Payroll",fmtAED(totalNet),"emerald"],["Finalized",finalized,"emerald"],["Draft/Pending",draft,"amber"]].map(([l,v,c])=>(
            <div key={String(l)} className="rounded-xl border border-slate-200 bg-white px-4 py-4">
              <p className="text-xs text-slate-500 font-medium">{l}</p>
              <p className={`mt-1 text-xl font-bold ${c==="emerald"?"text-emerald-600":c==="amber"?"text-amber-600":c==="red"?"text-red-500":"text-slate-700"}`}>{v}</p>
            </div>
          ))}
        </div>
        {loading ? <div className="flex justify-center py-24"><Loader2 size={28} className="animate-spin text-slate-400" /></div> : records.length === 0 ? (
          <div className="rounded-xl border border-slate-200 bg-white py-20 text-center"><BarChart3 size={40} className="mx-auto mb-3 text-slate-300" /><p className="text-sm text-slate-500">No payroll records for {MONTHS[month-1]} {year}.</p></div>
        ) : (
          <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
            <table className="w-full text-sm">
              <thead><tr className="border-b border-slate-100 bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                <th className="px-4 py-3">Employee</th><th className="px-4 py-3 text-right">Gross</th><th className="px-4 py-3 text-right">OT</th><th className="px-4 py-3 text-right">Deductions</th><th className="px-4 py-3 text-right">Net Salary</th><th className="px-4 py-3 text-center">Status</th>
              </tr></thead>
              <tbody className="divide-y divide-slate-100">
                {records.map(r=>(
                  <tr key={r.id} className="hover:bg-slate-50">
                    <td className="px-4 py-3 font-semibold text-slate-900">{empMap[r.employee_id||""]?.first_name || empMap[r.employee_id||""]?.name || "—"}</td>
                    <td className="px-4 py-3 text-right text-slate-700">{fmtAED(r.gross_salary)}</td>
                    <td className="px-4 py-3 text-right text-amber-600">{fmtAED(r.overtime_amount)}</td>
                    <td className="px-4 py-3 text-right text-red-500">- {fmtAED((r.gross_salary || 0) - (r.net_salary || 0))}</td>
                    <td className="px-4 py-3 text-right font-bold text-slate-900">{fmtAED(r.net_salary)}</td>
                    <td className="px-4 py-3 text-center"><span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${r.status==="Finalized"?"bg-emerald-50 text-emerald-700":"bg-amber-50 text-amber-700"}`}>{r.status||"Draft"}</span></td>
                  </tr>
                ))}
                <tr className="bg-slate-900 font-bold text-white">
                  <td className="px-4 py-3">TOTALS</td>
                  <td className="px-4 py-3 text-right">{fmtAED(totalGross)}</td>
                  <td className="px-4 py-3 text-right text-amber-300">{fmtAED(totalOT)}</td>
                  <td className="px-4 py-3 text-right text-red-300">- {fmtAED(totalDed)}</td>
                  <td className="px-4 py-3 text-right text-emerald-400">{fmtAED(totalNet)}</td>
                  <td className="px-4 py-3"></td>
                </tr>
              </tbody>
            </table>
          </div>
        )}
        </>}
      </div>
    </main>
  );
}

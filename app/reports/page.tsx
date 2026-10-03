"use client";
import ReportLoadState from "@/components/ReportLoadState";
import { readReportQuery } from "@/lib/reportData";
import { useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";
import { BarChart3 } from "lucide-react";
import { fmtAED, fmtDate } from "@/lib/helpers";

type Tab = "sales" | "purchasing" | "vat" | "customers" | "suppliers" | "inventory" | "hr";

export default function ReportsPage() {
  const [tab, setTab] = useState<Tab>("sales");
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<Record<string, unknown[]>>({});

  const [loadError, setLoadError] = useState("");
  const [loadedTab, setLoadedTab] = useState<Tab | null>(null);
  const requestVersion = useRef(0);

  async function loadReport() {
    const version = ++requestVersion.current;
    setLoading(true);
    setLoadError("");
    const d: Record<string, unknown[]> = {};
    try {
      if (tab === "sales") {
        const [q, pi, ti] = await Promise.all([
          supabase.from("quotations").select("*").order("quotation_date", { ascending: false }),
          supabase.from("proforma_invoices").select("*").order("proforma_date", { ascending: false }),
          supabase.from("tax_invoices").select("*").order("invoice_date", { ascending: false }),
        ].map(readReportQuery));
        d.quotations = q||[]; d.proformas = pi||[]; d.invoices = ti||[];
      } else if (tab === "purchasing") {
        const po = await readReportQuery(supabase.from("purchase_orders").select("*").order("order_date", { ascending: false }));
        d.purchase_orders = po||[];
      } else if (tab === "vat") {
        const [ti, poi] = await Promise.all([
          supabase.from("tax_invoices").select("*").order("invoice_date", { ascending: false }),
          supabase.from("purchase_orders").select("*").order("order_date", { ascending: false }),
        ].map(readReportQuery));
        d.sales_invoices = ti||[]; d.purchase_orders = poi||[];
      } else if (tab === "customers") {
        const [c, pay] = await Promise.all([
          supabase.from("customers").select("*").order("name"),
          supabase.from("payments").select("*").in("payment_type", ["customer_receipt", "customer"]),
        ].map(readReportQuery));
        d.customers = c||[]; d.payments = pay||[];
      } else if (tab === "suppliers") {
        const [s, pay] = await Promise.all([
          supabase.from("suppliers").select("*").order("name"),
          supabase.from("payments").select("*").in("payment_type", ["supplier_payment", "supplier"]),
        ].map(readReportQuery));
        d.suppliers = s||[]; d.payments = pay||[];
      } else if (tab === "inventory") {
        const [p, sm] = await Promise.all([
          supabase.from("products").select("*").order("name"),
          supabase.from("stock_movements").select("*").order("created_at", { ascending: false }),
        ].map(readReportQuery));
        d.products = p||[]; d.movements = sm||[];
      } else if (tab === "hr") {
        const [e, att, ot, ss] = await Promise.all([
          supabase.from("employees").select("*").order("first_name"),
          supabase.from("attendance").select("*").order("attendance_date", { ascending: false }),
          supabase.from("overtime").select("*").order("overtime_date", { ascending: false }),
          supabase.from("salary_statements").select("*").order("created_at", { ascending: false }),
        ].map(readReportQuery));
        d.employees = e||[]; d.attendance = att||[]; d.overtime = ot||[]; d.salary_statements = ss||[];
      }
      if (version === requestVersion.current) { setData(d); setLoadedTab(tab); }
    } catch (err) {
      if (version === requestVersion.current) { setLoadError(err instanceof Error ? err.message : "Could not load report."); setLoadedTab(tab); }
    } finally {
      if (version === requestVersion.current) setLoading(false);
    }
  }

  // The active report tab is the complete refresh key.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { void Promise.resolve().then(loadReport); }, [tab]);

  const tabs: {key: Tab; label: string}[] = [
    { key: "sales", label: "Sales" }, { key: "purchasing", label: "Purchasing" }, { key: "vat", label: "VAT" },
    { key: "customers", label: "Customers" }, { key: "suppliers", label: "Suppliers" },
    { key: "inventory", label: "Inventory" }, { key: "hr", label: "HR & Payroll" },
  ];

  const statCard = (label: string, value: string|number, sub?: string) => (
    <div key={label} className="rounded-xl border border-slate-200 bg-white px-4 py-4">
      <p className="text-xs text-slate-500 font-medium">{label}</p>
      <p className="mt-1 text-xl font-bold text-slate-900">{value}</p>
      {sub && <p className="text-xs text-slate-400">{sub}</p>}
    </div>
  );

  return (
    <main className="min-h-screen bg-slate-50">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-5">
          <div className="flex items-center gap-3">
            <div className="rounded-xl bg-slate-900 p-2.5 text-white"><BarChart3 size={22}/></div>
            <div><h1 className="text-2xl font-bold text-slate-900">Reports</h1><p className="text-sm text-slate-500">Live data reports across all ERP modules</p></div>
          </div>
        </div>
        <div className="flex gap-1 overflow-x-auto px-6 pb-0">
          {tabs.map(t => (
            <button key={t.key} onClick={()=>setTab(t.key)} className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${tab===t.key?"border-slate-900 text-slate-900":"border-transparent text-slate-500 hover:text-slate-700"}`}>{t.label}</button>
          ))}
        </div>
      </header>
      <div className="mx-auto max-w-7xl px-6 py-8">
        {loading || loadedTab !== tab || loadError ? <ReportLoadState loading={loading || loadedTab !== tab} error={loadError} onRetry={() => void loadReport()} /> : (
          <>
            {/* SALES */}
            {tab === "sales" && (() => {
              const qs = (data.quotations||[]) as {status:string; total_amount:number}[];
              const pis = (data.proformas||[]) as {status:string; total_amount:number}[];
              const tis = (data.invoices||[]) as {invoice_number:string; status:string; total_amount:number; vat_amount:number; invoice_date:string; subtotal:number}[];
              return (
                <div className="space-y-6">
                  <div className="grid grid-cols-4 gap-4">
                    {statCard("Total Quotations", qs.length)}
                    {statCard("Total Proformas", pis.length)}
                    {statCard("Total Invoices", tis.length)}
                    {statCard("Total Invoice Value", fmtAED(tis.reduce((s,i)=>s+(i.total_amount||0),0)))}
                  </div>
                  <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
                    <div className="border-b border-slate-100 px-4 py-3 flex justify-between items-center"><p className="font-semibold text-slate-900">Tax Invoices</p></div>
                    <table className="w-full text-sm"><thead><tr className="bg-slate-50 text-xs font-semibold uppercase text-slate-500"><th className="px-4 py-2 text-left">Invoice No.</th><th className="px-4 py-2 text-left">Date</th><th className="px-4 py-2 text-right">Subtotal</th><th className="px-4 py-2 text-right">VAT</th><th className="px-4 py-2 text-right">Total</th><th className="px-4 py-2 text-center">Status</th></tr></thead>
                    <tbody className="divide-y divide-slate-100">{tis.slice(0,50).map((ti,i)=><tr key={i} className="hover:bg-slate-50"><td className="px-4 py-2 font-mono text-xs">{ti.invoice_number||"—"}</td><td className="px-4 py-2 text-slate-600">{fmtDate(ti.invoice_date)}</td><td className="px-4 py-2 text-right">{fmtAED(ti.subtotal||0)}</td><td className="px-4 py-2 text-right text-amber-600">{fmtAED(ti.vat_amount)}</td><td className="px-4 py-2 text-right font-bold">{fmtAED(ti.total_amount)}</td><td className="px-4 py-2 text-center text-xs">{ti.status}</td></tr>)}</tbody>
                    </table>
                  </div>
                </div>
              );
            })()}

            {/* PURCHASING */}
            {tab === "purchasing" && (() => {
              const pos = (data.purchase_orders||[]) as {purchase_order_number:string; status:string; total_amount:number; vat_amount:number; order_date:string}[];
              return (
                <div className="space-y-6">
                  <div className="grid grid-cols-4 gap-4">
                    {statCard("Total POs", pos.length)}
                    {statCard("Draft", pos.filter(p=>(p.status||"").toLowerCase()==="draft").length)}
                    {statCard("Received", pos.filter(p=>(p.status||"").toLowerCase()==="received").length)}
                    {statCard("Total Value", fmtAED(pos.reduce((s,p)=>s+(p.total_amount||0),0)))}
                  </div>
                  <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
                    <table className="w-full text-sm"><thead><tr className="bg-slate-50 text-xs font-semibold uppercase text-slate-500"><th className="px-4 py-2 text-left">PO No.</th><th className="px-4 py-2 text-left">Date</th><th className="px-4 py-2 text-right">VAT</th><th className="px-4 py-2 text-right">Total</th><th className="px-4 py-2 text-center">Status</th></tr></thead>
                    <tbody className="divide-y divide-slate-100">{pos.slice(0,50).map((po,i)=><tr key={i} className="hover:bg-slate-50"><td className="px-4 py-2 font-mono text-xs">{po.purchase_order_number||"—"}</td><td className="px-4 py-2 text-slate-600">{fmtDate(po.order_date)}</td><td className="px-4 py-2 text-right text-amber-600">{fmtAED(po.vat_amount)}</td><td className="px-4 py-2 text-right font-bold">{fmtAED(po.total_amount)}</td><td className="px-4 py-2 text-center text-xs">{po.status}</td></tr>)}</tbody>
                    </table>
                  </div>
                </div>
              );
            })()}

            {/* VAT */}
            {tab === "vat" && (() => {
              const tis = (data.sales_invoices||[]) as {status:string; vat_amount:number; subtotal:number; total_amount:number}[];
              const pos = (data.purchase_orders||[]) as {status:string; vat_amount:number; subtotal:number}[];
              const finalTis = tis.filter(ti=>["final", "issued", "paid", "partially_paid", "overdue"].includes((ti.status||"").toLowerCase().replaceAll(" ", "_")));
              const outputVAT = finalTis.reduce((s,ti)=>s+(ti.vat_amount||0),0);
              const inputVAT = pos.filter(po=>(po.status||"").toLowerCase()==="received").reduce((s,po)=>s+(po.vat_amount||0),0);
              return (
                <div className="space-y-6">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-6 py-5 space-y-3">
                      <p className="font-semibold text-emerald-800">Output VAT (Sales)</p>
                      {statCard("Taxable Sales", fmtAED(finalTis.reduce((s,ti)=>s+(ti.subtotal||0),0)))}
                      {statCard("Output VAT Collected", fmtAED(outputVAT))}
                    </div>
                    <div className="rounded-xl border border-blue-200 bg-blue-50 px-6 py-5 space-y-3">
                      <p className="font-semibold text-blue-800">Input VAT (Purchases)</p>
                      {statCard("Taxable Purchases", fmtAED(pos.filter(p=>(p.status||"").toLowerCase()==="received").reduce((s,p)=>s+(p.subtotal||0),0)))}
                      {statCard("Input VAT Paid", fmtAED(inputVAT))}
                    </div>
                  </div>
                  <div className="rounded-xl border-2 border-slate-900 bg-slate-900 px-6 py-5 flex justify-between text-white">
                    <span className="text-lg font-bold">VAT Payable (Net)</span>
                    <span className={`text-2xl font-black ${outputVAT-inputVAT>=0?"text-amber-400":"text-emerald-400"}`}>{fmtAED(outputVAT - inputVAT)}</span>
                  </div>
                </div>
              );
            })()}

            {/* CUSTOMERS */}
            {tab === "customers" && (() => {
              const cs = (data.customers||[]) as {id:string; name:string; active:boolean; customer_code:string}[];
              const pays = ((data.payments||[]) as {customer_id:string; amount:number; status?:string|null}[]).filter(p=>(p.status||"completed").toLowerCase()==="completed");
              return (
                <div className="space-y-6">
                  <div className="grid grid-cols-3 gap-4">
                    {statCard("Total Customers", cs.length)}
                    {statCard("Active", cs.filter(c=>c.active).length)}
                    {statCard("Total Received", fmtAED(pays.reduce((s,p)=>s+(p.amount||0),0)))}
                  </div>
                  <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
                    <table className="w-full text-sm"><thead><tr className="bg-slate-50 text-xs font-semibold uppercase text-slate-500"><th className="px-4 py-2 text-left">Code</th><th className="px-4 py-2 text-left">Name</th><th className="px-4 py-2 text-right">Total Paid</th><th className="px-4 py-2 text-center">Status</th></tr></thead>
                    <tbody className="divide-y divide-slate-100">{cs.map((c,i)=><tr key={i} className="hover:bg-slate-50"><td className="px-4 py-2 font-mono text-xs">{c.customer_code||"—"}</td><td className="px-4 py-2 font-semibold">{c.name}</td><td className="px-4 py-2 text-right">{fmtAED(pays.filter(p=>p.customer_id===c.id).reduce((s,p)=>s+(p.amount||0),0))}</td><td className="px-4 py-2 text-center"><span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${c.active?"bg-emerald-50 text-emerald-700":"bg-slate-100 text-slate-500"}`}>{c.active?"Active":"Inactive"}</span></td></tr>)}</tbody>
                    </table>
                  </div>
                </div>
              );
            })()}

            {/* SUPPLIERS */}
            {tab === "suppliers" && (() => {
              const ss = (data.suppliers||[]) as {id:string; name:string; active:boolean; supplier_code:string}[];
              const pays = ((data.payments||[]) as {supplier_id:string; amount:number; status?:string|null}[]).filter(p=>(p.status||"completed").toLowerCase()==="completed");
              return (
                <div className="space-y-6">
                  <div className="grid grid-cols-3 gap-4">
                    {statCard("Total Suppliers", ss.length)}
                    {statCard("Active", ss.filter(s=>s.active).length)}
                    {statCard("Total Paid Out", fmtAED(pays.reduce((s,p)=>s+(p.amount||0),0)))}
                  </div>
                  <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
                    <table className="w-full text-sm"><thead><tr className="bg-slate-50 text-xs font-semibold uppercase text-slate-500"><th className="px-4 py-2 text-left">Code</th><th className="px-4 py-2 text-left">Name</th><th className="px-4 py-2 text-right">Total Paid</th><th className="px-4 py-2 text-center">Status</th></tr></thead>
                    <tbody className="divide-y divide-slate-100">{ss.map((s,i)=><tr key={i} className="hover:bg-slate-50"><td className="px-4 py-2 font-mono text-xs">{s.supplier_code||"—"}</td><td className="px-4 py-2 font-semibold">{s.name}</td><td className="px-4 py-2 text-right">{fmtAED(pays.filter(p=>p.supplier_id===s.id).reduce((ss2,p)=>ss2+(p.amount||0),0))}</td><td className="px-4 py-2 text-center"><span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${s.active?"bg-emerald-50 text-emerald-700":"bg-slate-100 text-slate-500"}`}>{s.active?"Active":"Inactive"}</span></td></tr>)}</tbody>
                    </table>
                  </div>
                </div>
              );
            })()}

            {/* INVENTORY */}
            {tab === "inventory" && (() => {
              const prods = (data.products||[]) as {id:string; sku:string; name:string; category:string; current_stock:number; minimum_stock:number; cost_price:number; selling_price:number; active:boolean}[];
              const movs = (data.movements||[]) as {movement_type:string; quantity:number; created_at:string}[];
              const lowStock = prods.filter(p=>p.active&&(p.current_stock||0)<=(p.minimum_stock||0));
              return (
                <div className="space-y-6">
                  <div className="grid grid-cols-3 gap-4">
                    {statCard("Total Products", prods.length)}
                    {statCard("Low Stock", lowStock.length, "At or below minimum")}
                    {statCard("Stock Movements", movs.length)}
                  </div>
                  <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
                    <div className="border-b border-slate-100 px-4 py-3"><p className="font-semibold text-slate-900">Current Stock Levels</p></div>
                    <table className="w-full text-sm"><thead><tr className="bg-slate-50 text-xs font-semibold uppercase text-slate-500"><th className="px-4 py-2 text-left">SKU</th><th className="px-4 py-2 text-left">Product</th><th className="px-4 py-2 text-center">Current Stock</th><th className="px-4 py-2 text-center">Min Stock</th><th className="px-4 py-2 text-center">Status</th></tr></thead>
                    <tbody className="divide-y divide-slate-100">{prods.map((p,i)=><tr key={i} className="hover:bg-slate-50"><td className="px-4 py-2 font-mono text-xs">{p.sku||"—"}</td><td className="px-4 py-2 font-semibold">{p.name}</td><td className="px-4 py-2 text-center tabular-nums">{p.current_stock||0}</td><td className="px-4 py-2 text-center tabular-nums text-slate-500">{p.minimum_stock||0}</td><td className="px-4 py-2 text-center"><span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${(p.current_stock||0)<=(p.minimum_stock||0)?"bg-amber-50 text-amber-700":"bg-emerald-50 text-emerald-700"}`}>{(p.current_stock||0)<=(p.minimum_stock||0)?"Low Stock":"OK"}</span></td></tr>)}</tbody>
                    </table>
                  </div>
                </div>
              );
            })()}

            {/* HR */}
            {tab === "hr" && (() => {
              const emps = (data.employees||[]) as {id:string; first_name:string; designation:string; department:string; basic_salary:number; status:string}[];
              const atts = (data.attendance||[]) as {status:string}[];
              const ots = (data.overtime||[]) as {hours:number; approval_status:string}[];
              const sss = (data.salary_statements||[]) as {net_salary:number; gross_salary:number; status:string}[];
              return (
                <div className="space-y-6">
                  <div className="grid grid-cols-4 gap-4">
                    {statCard("Employees", emps.filter(e=>e.status?.toLowerCase()==="active").length, "Active")}
                    {statCard("Total Payroll", fmtAED(sss.filter(s=>["paid", "approved", "Finalized", "Paid", "Approved"].includes(s.status || "")).reduce((s,r)=>s+(r.net_salary||0),0)), "Approved / Paid")}
                    {statCard("Approved OT Hours", ots.filter(o=>o.approval_status?.toLowerCase()==="approved").reduce((s,o)=>s+(Number(o.hours)||0),0).toFixed(1))}
                    {statCard("Attendance Records", atts.length)}
                  </div>
                  <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
                    <div className="border-b border-slate-100 px-4 py-3"><p className="font-semibold text-slate-900">Employees</p></div>
                    <table className="w-full text-sm"><thead><tr className="bg-slate-50 text-xs font-semibold uppercase text-slate-500"><th className="px-4 py-2 text-left">Name</th><th className="px-4 py-2 text-left">Designation</th><th className="px-4 py-2 text-left">Department</th><th className="px-4 py-2 text-right">Basic Salary</th><th className="px-4 py-2 text-center">Status</th></tr></thead>
                    <tbody className="divide-y divide-slate-100">{emps.map((e,i)=>{ const active = e.status?.toLowerCase() === "active"; return <tr key={i} className="hover:bg-slate-50"><td className="px-4 py-2 font-semibold">{e.first_name}</td><td className="px-4 py-2 text-slate-600">{e.designation||"—"}</td><td className="px-4 py-2 text-slate-600">{e.department||"—"}</td><td className="px-4 py-2 text-right">{fmtAED(e.basic_salary)}</td><td className="px-4 py-2 text-center"><span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${active?"bg-emerald-50 text-emerald-700":"bg-slate-100 text-slate-500"}`}>{active ? "Active" : e.status || "Active"}</span></td></tr>;})}</tbody>
                    </table>
                  </div>
                </div>
              );
            })()}
          </>
        )}
      </div>
    </main>
  );
}

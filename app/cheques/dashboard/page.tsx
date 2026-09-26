"use client";

import { useEffect, useState, useMemo } from "react";
import Link from "next/link";
import {
  Calendar as CalendarIcon, ChevronLeft, ChevronRight, Wallet, ArrowDownLeft,
  ArrowUpRight, Clock, AlertTriangle, CheckCircle2, ShieldAlert, Filter,
  Building2, Search, ArrowRight, Printer, RefreshCw
} from "lucide-react";
import { fetchCheques } from "@/lib/chequeService";
import {
  ChequeRecord, computeChequeMetrics, formatChequeStatus,
  chequeStatusBadge, getChequeUrgency, isChequeOverdue, UAE_BANKS
} from "@/lib/chequeTypes";
import { fmtAED, fmtDate, todayISO } from "@/lib/helpers";

export default function ChequeDashboardPage() {
  const [cheques, setCheques] = useState<ChequeRecord[]>([]);
  const [loading, setLoading] = useState(true);

  // Calendar State (Current month being viewed)
  const [currentDate, setCurrentDate] = useState(() => new Date());
  const [selectedDateCheques, setSelectedDateCheques] = useState<{ date: string; items: ChequeRecord[] } | null>(null);

  // Filters
  const [directionFilter, setDirectionFilter] = useState<"all" | "incoming" | "outgoing">("all");
  const [bankFilter, setBankFilter] = useState<string>("all");
  const [search, setSearch] = useState("");

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    setLoading(true);
    try {
      const data = await fetchCheques();
      setCheques(data);
    } catch (err) {
      console.error("Dashboard load cheques error:", err);
    } finally {
      setLoading(false);
    }
  }

  // Filtered cheques
  const filteredCheques = useMemo(() => {
    return cheques.filter((c) => {
      if (directionFilter !== "all" && c.cheque_type !== directionFilter) return false;
      if (bankFilter !== "all" && c.bank_name !== bankFilter) return false;
      if (!search.trim()) return true;
      const s = search.toLowerCase();
      const party = c.cheque_type === "incoming" ? c.customer?.name || c.payee_name : c.supplier?.name || c.payee_name;
      return (
        c.cheque_number.toLowerCase().includes(s) ||
        (party && party.toLowerCase().includes(s)) ||
        c.bank_name.toLowerCase().includes(s)
      );
    });
  }, [cheques, directionFilter, bankFilter, search]);

  const metrics = useMemo(() => computeChequeMetrics(filteredCheques), [filteredCheques]);

  // Urgent Lists
  const overdueList = useMemo(() => {
    return filteredCheques.filter((c) => isChequeOverdue(c.due_date, c.status));
  }, [filteredCheques]);

  const dueSoonList = useMemo(() => {
    return filteredCheques
      .filter((c) => {
        if (c.status === "cleared" || c.status === "cancelled") return false;
        const urgency = getChequeUrgency(c.due_date, c.status);
        return !urgency.isOverdue && urgency.days <= 7;
      })
      .sort((a, b) => a.due_date.localeCompare(b.due_date));
  }, [filteredCheques]);

  // Calendar calculations
  const year = currentDate.getFullYear();
  const month = currentDate.getMonth(); // 0-indexed

  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const firstDayOfWeek = new Date(year, month, 1).getDay(); // 0 is Sunday

  const monthName = currentDate.toLocaleString("default", { month: "long" });

  // Map cheques to due dates (YYYY-MM-DD)
  const chequesByDate = useMemo(() => {
    const map: Record<string, ChequeRecord[]> = {};
    for (const c of filteredCheques) {
      if (!map[c.due_date]) map[c.due_date] = [];
      map[c.due_date].push(c);
    }
    return map;
  }, [filteredCheques]);

  function prevMonth() {
    setCurrentDate(new Date(year, month - 1, 1));
  }

  function nextMonth() {
    setCurrentDate(new Date(year, month + 1, 1));
  }

  function goToday() {
    setCurrentDate(new Date());
  }

  return (
    <main className="min-h-screen bg-slate-50 text-slate-900 pb-16">
      {/* Header */}
      <header className="border-b border-slate-200 bg-white sticky top-0 z-20 shadow-xs">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-4 px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="rounded-xl bg-slate-900 p-2.5 text-white shadow-sm">
              <CalendarIcon size={22} className="text-emerald-400" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-2xl font-black text-slate-900 tracking-tight">Cheque Calendar &amp; Dashboard</h1>
                <span className="rounded-md bg-blue-50 text-blue-700 border border-blue-200 px-2 py-0.5 text-xs font-bold">
                  Liquidity &amp; Maturity
                </span>
              </div>
              <p className="text-xs text-slate-500">
                Visualize incoming receipts, outgoing disbursements, and maturity timelines
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2.5">
            <Link
              href="/cheques"
              className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 shadow-xs"
            >
              <Wallet size={15} className="text-slate-500" />
              Cheque Register
            </Link>

            <Link
              href="/reports/cheques"
              className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 shadow-xs"
            >
              <Printer size={15} className="text-slate-500" />
              Cheque Reports
            </Link>

            <button
              type="button"
              onClick={loadData}
              className="rounded-lg p-2 border border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
              title="Refresh"
            >
              <RefreshCw size={15} className={loading ? "animate-spin text-emerald-600" : ""} />
            </button>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-7xl px-6 py-6 space-y-6">
        {/* KPI Strip */}
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3.5">
          <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-xs">
            <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Total Inward</span>
            <p className="mt-1 text-xl font-black text-emerald-700">{fmtAED(metrics.totalIncomingAmount)}</p>
            <p className="text-[10px] text-slate-400 mt-0.5">{metrics.totalIncomingCount} cheques received</p>
          </div>

          <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-xs">
            <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Total Outward</span>
            <p className="mt-1 text-xl font-black text-blue-700">{fmtAED(metrics.totalOutgoingAmount)}</p>
            <p className="text-[10px] text-slate-400 mt-0.5">{metrics.totalOutgoingCount} cheques issued</p>
          </div>

          <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-xs">
            <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Net Position</span>
            <p className={`mt-1 text-xl font-black ${metrics.netPosition >= 0 ? "text-emerald-700" : "text-rose-700"}`}>
              {fmtAED(metrics.netPosition)}
            </p>
            <p className="text-[10px] text-slate-400 mt-0.5">Inward minus Outward</p>
          </div>

          <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-xs">
            <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Pending In Hand</span>
            <p className="mt-1 text-xl font-black text-amber-600">{fmtAED(metrics.pendingAmount)}</p>
            <p className="text-[10px] text-slate-400 mt-0.5">Not yet deposited</p>
          </div>

          <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-xs">
            <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">In Bank Clearing</span>
            <p className="mt-1 text-xl font-black text-indigo-600">{fmtAED(metrics.depositedAmount)}</p>
            <p className="text-[10px] text-slate-400 mt-0.5">Deposited, awaiting funds</p>
          </div>

          <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-xs">
            <span className="text-[11px] font-semibold text-rose-700 uppercase tracking-wider">Overdue Risk</span>
            <p className="mt-1 text-xl font-black text-rose-700">{fmtAED(metrics.overdueAmount)}</p>
            <p className="text-[10px] text-rose-600 mt-0.5">{metrics.overdueCount} cheques overdue</p>
          </div>
        </div>

        {/* Filters */}
        <div className="rounded-xl border border-slate-200 bg-white p-3.5 shadow-xs flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold text-slate-700 flex items-center gap-1">
              <Filter size={14} /> Filter:
            </span>
            <div className="flex items-center rounded-lg bg-slate-100 p-0.5 text-xs">
              <button
                type="button"
                onClick={() => setDirectionFilter("all")}
                className={`px-3 py-1 rounded font-semibold transition-all ${
                  directionFilter === "all" ? "bg-white shadow-xs text-slate-900" : "text-slate-600"
                }`}
              >
                All Cheques
              </button>
              <button
                type="button"
                onClick={() => setDirectionFilter("incoming")}
                className={`px-3 py-1 rounded font-semibold transition-all ${
                  directionFilter === "incoming" ? "bg-emerald-600 text-white shadow-xs" : "text-slate-600"
                }`}
              >
                Incoming
              </button>
              <button
                type="button"
                onClick={() => setDirectionFilter("outgoing")}
                className={`px-3 py-1 rounded font-semibold transition-all ${
                  directionFilter === "outgoing" ? "bg-slate-900 text-white shadow-xs" : "text-slate-600"
                }`}
              >
                Outgoing
              </button>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className="relative">
              <Search size={14} className="absolute left-2.5 top-2 text-slate-400" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search cheques in calendar..."
                className="rounded-lg border border-slate-200 pl-8 pr-3 py-1 text-xs focus:border-slate-400 focus:outline-none bg-slate-50/50 w-56"
              />
            </div>

            <select
              value={bankFilter}
              onChange={(e) => setBankFilter(e.target.value)}
              className="rounded-lg border border-slate-200 px-2.5 py-1 text-xs focus:border-slate-400 focus:outline-none bg-white"
            >
              <option value="all">All UAE Banks</option>
              {UAE_BANKS.map((b) => (
                <option key={b} value={b}>
                  {b}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Main Grid: Calendar (2/3) + Urgent Alerts (1/3) */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Calendar Widget */}
          <div className="lg:col-span-2 rounded-xl border border-slate-200 bg-white p-5 shadow-xs">
            {/* Calendar Controls */}
            <div className="flex items-center justify-between mb-4 border-b border-slate-100 pb-3">
              <div className="flex items-center gap-3">
                <h2 className="text-lg font-black text-slate-900 tracking-tight">
                  {monthName} {year}
                </h2>
                <button
                  type="button"
                  onClick={goToday}
                  className="rounded-md border border-slate-200 px-2 py-0.5 text-[11px] font-semibold text-slate-700 hover:bg-slate-50"
                >
                  Today
                </button>
              </div>

              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={prevMonth}
                  className="rounded p-1.5 text-slate-500 hover:text-slate-900 hover:bg-slate-100 transition-colors"
                >
                  <ChevronLeft size={18} />
                </button>
                <button
                  type="button"
                  onClick={nextMonth}
                  className="rounded p-1.5 text-slate-500 hover:text-slate-900 hover:bg-slate-100 transition-colors"
                >
                  <ChevronRight size={18} />
                </button>
              </div>
            </div>

            {/* Days Header */}
            <div className="grid grid-cols-7 gap-1 text-center font-bold text-slate-400 text-[11px] uppercase tracking-wider mb-1">
              <div>Sun</div>
              <div>Mon</div>
              <div>Tue</div>
              <div>Wed</div>
              <div>Thu</div>
              <div>Fri</div>
              <div>Sat</div>
            </div>

            {/* Calendar Day Cells */}
            <div className="grid grid-cols-7 gap-1.5">
              {/* Empty leading padding */}
              {Array.from({ length: firstDayOfWeek }).map((_, i) => (
                <div key={`empty-${i}`} className="min-h-[88px] rounded-lg bg-slate-50/40 border border-transparent" />
              ))}

              {/* Month Days */}
              {Array.from({ length: daysInMonth }).map((_, i) => {
                const dayNum = i + 1;
                const dateStr = `${year}-${String(month + 1).padStart(2, "0")}-${String(dayNum).padStart(2, "0")}`;
                const isToday = dateStr === todayISO();
                const dayCheques = chequesByDate[dateStr] || [];

                const incomingSum = dayCheques
                  .filter((c) => c.cheque_type === "incoming")
                  .reduce((s, c) => s + (Number(c.amount) || 0), 0);
                const outgoingSum = dayCheques
                  .filter((c) => c.cheque_type === "outgoing")
                  .reduce((s, c) => s + (Number(c.amount) || 0), 0);

                return (
                  <div
                    key={dateStr}
                    onClick={() => {
                      if (dayCheques.length > 0) {
                        setSelectedDateCheques({ date: dateStr, items: dayCheques });
                      }
                    }}
                    className={`min-h-[88px] rounded-lg p-1.5 border transition-all text-xs flex flex-col justify-between ${
                      dayCheques.length > 0
                        ? "cursor-pointer hover:border-slate-400 hover:shadow-xs bg-white"
                        : "bg-slate-50/50 border-slate-100"
                    } ${isToday ? "ring-2 ring-emerald-500 border-emerald-400 bg-emerald-50/20" : "border-slate-200"}`}
                  >
                    <div className="flex items-center justify-between">
                      <span
                        className={`text-[11px] font-bold rounded-full w-5 h-5 flex items-center justify-center ${
                          isToday ? "bg-emerald-600 text-white" : "text-slate-700"
                        }`}
                      >
                        {dayNum}
                      </span>
                      {dayCheques.length > 0 && (
                        <span className="text-[10px] font-semibold text-slate-400 font-mono">
                          {dayCheques.length} chq
                        </span>
                      )}
                    </div>

                    <div className="space-y-0.5 my-1">
                      {incomingSum > 0 && (
                        <div className="rounded bg-emerald-50 border border-emerald-200 px-1 py-0.5 text-[9px] font-bold text-emerald-800 truncate">
                          +{fmtAED(incomingSum)}
                        </div>
                      )}
                      {outgoingSum > 0 && (
                        <div className="rounded bg-blue-50 border border-blue-200 px-1 py-0.5 text-[9px] font-bold text-blue-800 truncate">
                          -{fmtAED(outgoingSum)}
                        </div>
                      )}
                    </div>

                    {dayCheques.some((c) => isChequeOverdue(c.due_date, c.status)) && (
                      <span className="text-[9px] text-rose-600 font-bold flex items-center gap-0.5">
                        <AlertTriangle size={9} /> Overdue
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Urgent Action & Due Soon Sidebar */}
          <div className="space-y-5">
            {/* Overdue Cheques */}
            <div className="rounded-xl border border-rose-200 bg-white p-4 shadow-xs">
              <div className="flex items-center justify-between border-b border-rose-100 pb-2.5 mb-3">
                <div className="flex items-center gap-1.5 text-rose-700 font-bold text-sm">
                  <ShieldAlert size={16} />
                  <span>Overdue Cheques ({overdueList.length})</span>
                </div>
                <Link
                  href="/cheques?status=overdue"
                  className="text-[11px] font-semibold text-rose-600 hover:text-rose-800 flex items-center gap-0.5"
                >
                  View All <ArrowRight size={11} />
                </Link>
              </div>

              {overdueList.length === 0 ? (
                <div className="py-6 text-center text-xs text-slate-400">
                  <CheckCircle2 size={22} className="mx-auto text-emerald-500 mb-1" />
                  No overdue cheques!
                </div>
              ) : (
                <div className="space-y-2 max-h-56 overflow-y-auto custom-scrollbar">
                  {overdueList.slice(0, 5).map((c) => (
                    <div
                      key={c.id}
                      className="p-2.5 rounded-lg border border-rose-100 bg-rose-50/50 text-xs flex items-center justify-between"
                    >
                      <div>
                        <div className="flex items-center gap-1.5 font-bold text-slate-900">
                          <span className="font-mono">#{c.cheque_number}</span>
                          <span className="text-[10px] text-slate-500">({c.bank_name})</span>
                        </div>
                        <p className="text-[11px] text-slate-600 truncate max-w-[160px] mt-0.5">
                          {c.customer?.name || c.supplier?.name || c.payee_name}
                        </p>
                        <span className="text-[10px] text-rose-700 font-semibold block mt-0.5">
                          Due: {fmtDate(c.due_date)}
                        </span>
                      </div>
                      <div className="text-right">
                        <span className="font-mono font-black text-rose-700">{fmtAED(c.amount)}</span>
                        <Link
                          href={`/cheques?search=${encodeURIComponent(c.cheque_number)}`}
                          className="block text-[10px] text-emerald-700 font-bold hover:underline mt-1"
                        >
                          Action &rarr;
                        </Link>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Maturing Soon (Next 7 Days) */}
            <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-xs">
              <div className="flex items-center justify-between border-b border-slate-100 pb-2.5 mb-3">
                <div className="flex items-center gap-1.5 text-slate-900 font-bold text-sm">
                  <Clock size={16} className="text-amber-500" />
                  <span>Maturing Next 7 Days ({dueSoonList.length})</span>
                </div>
              </div>

              {dueSoonList.length === 0 ? (
                <p className="py-6 text-center text-xs text-slate-400">No cheques due in next 7 days.</p>
              ) : (
                <div className="space-y-2 max-h-64 overflow-y-auto custom-scrollbar">
                  {dueSoonList.slice(0, 6).map((c) => {
                    const urgency = getChequeUrgency(c.due_date, c.status);
                    const isInc = c.cheque_type === "incoming";

                    return (
                      <div
                        key={c.id}
                        className="p-2.5 rounded-lg border border-slate-100 bg-slate-50 text-xs flex items-center justify-between"
                      >
                        <div>
                          <div className="flex items-center gap-1.5 font-bold text-slate-900">
                            <span className="font-mono">#{c.cheque_number}</span>
                            <span
                              className={`rounded px-1 text-[9px] font-bold uppercase ${
                                isInc ? "bg-emerald-100 text-emerald-800" : "bg-blue-100 text-blue-800"
                              }`}
                            >
                              {isInc ? "In" : "Out"}
                            </span>
                          </div>
                          <p className="text-[11px] text-slate-600 truncate max-w-[150px] mt-0.5">
                            {c.customer?.name || c.supplier?.name || c.payee_name}
                          </p>
                          <span className={`inline-block mt-1 rounded px-1.5 text-[9px] ${urgency.badgeClass}`}>
                            {urgency.label}
                          </span>
                        </div>
                        <div className="text-right">
                          <span className="font-mono font-bold text-slate-900">{fmtAED(c.amount)}</span>
                          <span className="block text-[10px] text-slate-400 mt-0.5">{fmtDate(c.due_date)}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* DATE INSPECTOR MODAL */}
      {selectedDateCheques && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 backdrop-blur-xs p-4">
          <div className="w-full max-w-xl rounded-2xl bg-white shadow-2xl border border-slate-200 overflow-hidden">
            <div className="flex items-center justify-between border-b border-slate-100 px-5 py-3.5 bg-slate-900 text-white">
              <div className="flex items-center gap-2">
                <CalendarIcon size={16} className="text-emerald-400" />
                <h3 className="font-bold text-sm">
                  Cheques Due on {fmtDate(selectedDateCheques.date)} ({selectedDateCheques.items.length})
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setSelectedDateCheques(null)}
                className="text-slate-400 hover:text-white"
              >
                ✕
              </button>
            </div>

            <div className="p-4 max-h-96 overflow-y-auto space-y-2.5">
              {selectedDateCheques.items.map((c) => {
                const isInc = c.cheque_type === "incoming";
                return (
                  <div
                    key={c.id}
                    className="p-3 rounded-xl border border-slate-200 bg-slate-50 flex items-center justify-between text-xs"
                  >
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-mono font-bold text-slate-900">#{c.cheque_number}</span>
                        <span
                          className={`rounded px-1.5 py-0.2 text-[10px] font-bold uppercase ${
                            isInc ? "bg-emerald-100 text-emerald-800" : "bg-blue-100 text-blue-800"
                          }`}
                        >
                          {isInc ? "Inward" : "Outward"}
                        </span>
                        <span className={`rounded-full px-2 text-[10px] font-bold ${chequeStatusBadge(c.status)}`}>
                          {formatChequeStatus(c.status)}
                        </span>
                      </div>
                      <p className="text-slate-700 font-medium mt-1">
                        {c.customer?.name || c.supplier?.name || c.payee_name}
                      </p>
                      <p className="text-[11px] text-slate-400">{c.bank_name}</p>
                    </div>

                    <div className="text-right">
                      <span className="font-mono font-black text-slate-900 text-sm">{fmtAED(c.amount)}</span>
                      <Link
                        href={`/cheques?search=${encodeURIComponent(c.cheque_number)}`}
                        className="block text-[11px] text-emerald-600 font-semibold hover:underline mt-1"
                      >
                        Open in Register &rarr;
                      </Link>
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="p-3 border-t border-slate-100 bg-slate-50 flex justify-end">
              <button
                type="button"
                onClick={() => setSelectedDateCheques(null)}
                className="rounded-lg bg-slate-900 px-4 py-1.5 text-xs font-semibold text-white hover:bg-slate-800"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}

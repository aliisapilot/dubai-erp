"use client";

import { useEffect, useState, useMemo } from "react";
import MobileLayout from "@/components/mobile/MobileLayout";
import {
  Wallet, Clock, AlertTriangle, CheckCircle2, Search,
  ArrowDownLeft, ArrowUpRight, ShieldAlert, RefreshCw, Loader2
} from "lucide-react";
import { fetchCheques } from "@/lib/chequeService";
import {
  ChequeRecord, formatChequeStatus, chequeStatusBadge,
  getChequeUrgency, isChequeOverdue, computeChequeMetrics
} from "@/lib/chequeTypes";
import { fmtAED, fmtDate, todayISO } from "@/lib/helpers";

type TabType = "due_today" | "upcoming" | "overdue" | "all";

export default function MobileChequesPage() {
  const [cheques, setCheques] = useState<ChequeRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<TabType>("due_today");
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
      console.error("Failed to load cheques:", err);
    } finally {
      setLoading(false);
    }
  }

  // Filtered dataset
  const filteredCheques = useMemo(() => {
    return cheques.filter((c) => {
      // 1. Tab filter
      if (activeTab === "due_today") {
        if (c.due_date !== todayISO() || c.status === "cleared" || c.status === "cancelled") return false;
      } else if (activeTab === "upcoming") {
        const urgency = getChequeUrgency(c.due_date, c.status);
        if (urgency.isOverdue || urgency.isDueToday || urgency.days > 14 || c.status === "cleared" || c.status === "cancelled") {
          return false;
        }
      } else if (activeTab === "overdue") {
        if (!isChequeOverdue(c.due_date, c.status)) return false;
      }

      // 2. Search
      if (!search.trim()) return true;
      const s = search.toLowerCase();
      const party = c.cheque_type === "incoming" ? c.customer?.name || c.payee_name : c.supplier?.name || c.payee_name;

      return (
        c.cheque_number.toLowerCase().includes(s) ||
        (party && party.toLowerCase().includes(s)) ||
        c.bank_name.toLowerCase().includes(s)
      );
    });
  }, [cheques, activeTab, search]);

  const metrics = useMemo(() => computeChequeMetrics(cheques), [cheques]);

  return (
    <MobileLayout>
      <div className="p-4 space-y-4">
        {/* Header Title & Notice */}
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-black text-white tracking-tight flex items-center gap-2">
              <Wallet size={18} className="text-emerald-400" />
              Cheque Reminders
            </h2>
            <p className="text-[11px] text-slate-400 mt-0.5">
              Read-only view of PDC and maturity deadlines
            </p>
          </div>

          <button
            type="button"
            onClick={loadData}
            className="p-2 text-slate-400 hover:text-white"
            title="Refresh Reminders"
          >
            <RefreshCw size={14} className={loading ? "animate-spin text-emerald-400" : ""} />
          </button>
        </div>

        {/* Tab Selector */}
        <div className="grid grid-cols-4 gap-1 p-1 rounded-xl bg-slate-900 border border-slate-800 text-xs">
          <button
            type="button"
            onClick={() => setActiveTab("due_today")}
            className={`py-2 rounded-lg font-bold transition-all text-center relative ${
              activeTab === "due_today" ? "bg-amber-600 text-white shadow-xs" : "text-slate-400 hover:text-white"
            }`}
          >
            Due Today
            {metrics.dueTodayCount > 0 && (
              <span className="absolute -top-1 -right-1 h-3.5 w-3.5 rounded-full bg-amber-400 text-slate-900 font-black text-[9px] flex items-center justify-center">
                {metrics.dueTodayCount}
              </span>
            )}
          </button>

          <button
            type="button"
            onClick={() => setActiveTab("upcoming")}
            className={`py-2 rounded-lg font-bold transition-all text-center ${
              activeTab === "upcoming" ? "bg-blue-600 text-white shadow-xs" : "text-slate-400 hover:text-white"
            }`}
          >
            Upcoming
          </button>

          <button
            type="button"
            onClick={() => setActiveTab("overdue")}
            className={`py-2 rounded-lg font-bold transition-all text-center relative ${
              activeTab === "overdue" ? "bg-rose-600 text-white shadow-xs" : "text-slate-400 hover:text-white"
            }`}
          >
            Overdue
            {metrics.overdueCount > 0 && (
              <span className="absolute -top-1 -right-1 h-3.5 w-3.5 rounded-full bg-rose-400 text-slate-900 font-black text-[9px] flex items-center justify-center">
                {metrics.overdueCount}
              </span>
            )}
          </button>

          <button
            type="button"
            onClick={() => setActiveTab("all")}
            className={`py-2 rounded-lg font-bold transition-all text-center ${
              activeTab === "all" ? "bg-slate-800 text-white shadow-xs" : "text-slate-400 hover:text-white"
            }`}
          >
            All Cheques
          </button>
        </div>

        {/* Search */}
        <div className="relative">
          <Search size={16} className="absolute left-3 top-2.5 text-slate-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search cheques by #, bank, party..."
            className="w-full rounded-xl border border-slate-800 bg-slate-900 pl-9 pr-3 py-2 text-xs text-white placeholder-slate-500 focus:border-emerald-500 focus:outline-none"
          />
        </div>

        {/* Cheques List */}
        <div className="space-y-3">
          {loading ? (
            <div className="py-16 text-center text-slate-400">
              <Loader2 size={24} className="animate-spin mx-auto text-emerald-400 mb-2" />
              <p className="text-xs">Fetching reminders...</p>
            </div>
          ) : filteredCheques.length === 0 ? (
            <div className="py-16 text-center text-slate-500 rounded-2xl border border-dashed border-slate-800 bg-slate-900/30 p-6">
              <CheckCircle2 size={32} className="mx-auto text-emerald-500 mb-2" />
              <p className="text-sm font-semibold text-slate-300">No cheques in this section</p>
              <p className="text-xs text-slate-500 mt-1">All cheques are settled or up to date.</p>
            </div>
          ) : (
            filteredCheques.map((c) => {
              const isInc = c.cheque_type === "incoming";
              const party = isInc
                ? c.customer?.name || c.payee_name || "Customer"
                : c.supplier?.name || c.payee_name || "Supplier";
              const urgency = getChequeUrgency(c.due_date, c.status);

              return (
                <div
                  key={c.id}
                  className={`rounded-2xl border p-4 shadow-sm space-y-2.5 ${
                    urgency.isOverdue
                      ? "border-rose-900/50 bg-rose-950/20"
                      : urgency.isDueToday
                      ? "border-amber-900/50 bg-amber-950/20"
                      : "border-slate-800/80 bg-slate-900/90"
                  }`}
                >
                  {/* Top: Cheque Number & Amount */}
                  <div className="flex items-start justify-between">
                    <div>
                      <div className="flex items-center gap-1.5 mb-0.5">
                        <span
                          className={`rounded px-1.5 py-0.2 text-[9px] font-bold uppercase ${
                            isInc ? "bg-emerald-500/20 text-emerald-300" : "bg-blue-500/20 text-blue-300"
                          }`}
                        >
                          {isInc ? "Inward" : "Outward"}
                        </span>
                        <span className={`rounded-full px-2 text-[9px] font-bold ${chequeStatusBadge(c.status)}`}>
                          {formatChequeStatus(c.status)}
                        </span>
                      </div>
                      <h4 className="font-mono font-bold text-sm text-white">#{c.cheque_number}</h4>
                    </div>

                    <div className="text-right">
                      <span className="font-mono font-black text-sm text-white block">
                        {fmtAED(c.amount)}
                      </span>
                      <span className="text-[10px] text-slate-400 block font-mono">AED</span>
                    </div>
                  </div>

                  {/* Bank & Party */}
                  <div className="border-t border-slate-800/60 pt-2 text-xs space-y-1">
                    <div className="flex justify-between">
                      <span className="text-slate-400">Drawee Bank:</span>
                      <span className="font-medium text-slate-200">{c.bank_name}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-400">{isInc ? "Received From:" : "Payable To:"}</span>
                      <span className="font-semibold text-slate-200 truncate max-w-[200px]">{party}</span>
                    </div>
                  </div>

                  {/* Due Date & Urgency Badge */}
                  <div className="flex items-center justify-between border-t border-slate-800/60 pt-2 text-xs">
                    <div>
                      <span className="text-[10px] text-slate-500 block leading-none">Maturity Date</span>
                      <span className="font-mono text-xs text-white block mt-0.5 font-bold">
                        {fmtDate(c.due_date)}
                      </span>
                    </div>

                    <span className={`px-2 py-0.5 rounded text-[10px] ${urgency.badgeClass}`}>
                      {urgency.label}
                    </span>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </MobileLayout>
  );
}

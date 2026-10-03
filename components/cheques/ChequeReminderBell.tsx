"use client";

import { useEffect, useState, useRef } from "react";
import Link from "next/link";
import { Bell, AlertTriangle, Clock, Calendar, CheckCircle2, RefreshCw, X, ArrowUpRight } from "lucide-react";
import { ChequeReminderRecord } from "@/lib/chequeTypes";
import { fetchActiveReminders, evaluateAndTriggerReminders } from "@/lib/chequeService";
import { fmtDate } from "@/lib/helpers";
import { supabase } from "@/lib/supabase";

export default function ChequeReminderBell() {
  const [reminders, setReminders] = useState<ChequeReminderRecord[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    loadReminders();
    // Close dropdown on outside click
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  async function loadReminders() {
    setLoading(true);
    try {
      const data = await fetchActiveReminders();
      setReminders(data);
    } catch (err) {
      console.warn("Could not load reminders:", err);
    } finally {
      setLoading(false);
    }
  }

  async function handleSync() {
    setSyncing(true);
    try {
      await evaluateAndTriggerReminders();
      await loadReminders();
    } catch (err) {
      console.error("Sync reminders error:", err);
    } finally {
      setSyncing(false);
    }
  }

  async function markAsRead(reminderId: string) {
    try {
      await supabase
        .from("cheque_reminders")
        .update({ status: "read", read_at: new Date().toISOString() })
        .eq("id", reminderId);
      setReminders((prev) => prev.filter((r) => r.id !== reminderId));
    } catch (err) {
      console.error("Failed to dismiss reminder:", err);
    }
  }

  async function markAllAsRead() {
    try {
      const ids = reminders.map((r) => r.id);
      if (!ids.length) return;
      await supabase
        .from("cheque_reminders")
        .update({ status: "read", read_at: new Date().toISOString() })
        .in("id", ids);
      setReminders([]);
    } catch (err) {
      console.error("Failed to dismiss all reminders:", err);
    }
  }

  const unreadCount = reminders.length;
  const overdueCount = reminders.filter((r) => r.reminder_type === "overdue").length;

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        type="button"
        onClick={() => {
          setIsOpen((p) => !p);
          if (!isOpen) loadReminders();
        }}
        className="relative rounded-lg p-2 text-slate-300 hover:bg-slate-800 hover:text-white transition-colors"
        title="Cheque Maturity Reminders"
        aria-label="Cheque Maturity Reminders"
      >
        <Bell size={18} />
        {unreadCount > 0 && (
          <span
            className={`absolute -top-0.5 -right-0.5 flex h-4 w-4 items-center justify-center rounded-full text-[10px] font-bold text-white shadow-sm ${
              overdueCount > 0 ? "bg-rose-500 animate-pulse" : "bg-amber-500"
            }`}
          >
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </button>

      {isOpen && (
        <div className="absolute right-0 mt-2 w-96 max-w-[calc(100vw-2rem)] rounded-xl border border-slate-700 bg-slate-900 text-slate-100 shadow-2xl z-50 overflow-hidden">
          {/* Header */}
          <div className="flex items-center justify-between border-b border-slate-800 px-4 py-3 bg-slate-950/70">
            <div className="flex items-center gap-2">
              <Clock size={16} className="text-amber-400" />
              <span className="font-semibold text-sm text-white">Cheque Reminders</span>
              {unreadCount > 0 && (
                <span className="rounded-full bg-amber-500/20 px-2 py-0.5 text-[10px] font-bold text-amber-300 border border-amber-500/30">
                  {unreadCount} Active
                </span>
              )}
            </div>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={handleSync}
                disabled={syncing}
                title="Scan cheques and generate reminders"
                className="rounded p-1 text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
              >
                <RefreshCw size={13} className={syncing ? "animate-spin text-emerald-400" : ""} />
              </button>
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                className="rounded p-1 text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
              >
                <X size={14} />
              </button>
            </div>
          </div>

          {/* List */}
          <div className="max-h-80 overflow-y-auto divide-y divide-slate-800/60 custom-scrollbar">
            {loading ? (
              <div className="p-6 text-center text-xs text-slate-400">Loading alerts...</div>
            ) : reminders.length === 0 ? (
              <div className="p-8 text-center">
                <CheckCircle2 size={28} className="mx-auto text-emerald-400 mb-2 opacity-80" />
                <p className="text-xs font-medium text-slate-300">All cheques up to date!</p>
                <p className="text-[11px] text-slate-500 mt-1">No pending maturity notices or overdue cheques.</p>
              </div>
            ) : (
              reminders.map((rem) => {
                const isOverdue = rem.reminder_type === "overdue";
                const isToday = rem.reminder_type === "due_today";

                return (
                  <div
                    key={rem.id}
                    className={`p-3 text-xs transition-colors hover:bg-slate-800/40 flex items-start justify-between gap-3 ${
                      isOverdue ? "bg-rose-950/20" : isToday ? "bg-amber-950/20" : ""
                    }`}
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5 mb-1">
                        {isOverdue ? (
                          <AlertTriangle size={13} className="text-rose-400 shrink-0" />
                        ) : isToday ? (
                          <Clock size={13} className="text-amber-400 shrink-0" />
                        ) : (
                          <Calendar size={13} className="text-blue-400 shrink-0" />
                        )}
                        <span
                          className={`font-semibold truncate ${
                            isOverdue ? "text-rose-300" : isToday ? "text-amber-300" : "text-slate-200"
                          }`}
                        >
                          {rem.notification_title}
                        </span>
                      </div>
                      <p className="text-slate-400 text-[11px] leading-relaxed line-clamp-2">
                        {rem.notification_message}
                      </p>
                      <div className="mt-2 flex items-center justify-between text-[10px] text-slate-500">
                        <span>Due: {fmtDate(rem.due_date)}</span>
                        <Link
                          href={`/cheques?search=${encodeURIComponent(rem.cheque?.cheque_number || "")}`}
                          onClick={() => setIsOpen(false)}
                          className="text-emerald-400 hover:text-emerald-300 flex items-center gap-0.5 font-medium"
                        >
                          View Cheque <ArrowUpRight size={10} />
                        </Link>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => markAsRead(rem.id)}
                      title="Dismiss reminder"
                      className="text-slate-500 hover:text-slate-300 p-1 shrink-0"
                    >
                      <X size={12} />
                    </button>
                  </div>
                );
              })
            )}
          </div>

          {/* Footer */}
          <div className="border-t border-slate-800 px-4 py-2.5 bg-slate-950/70 flex items-center justify-between text-xs">
            {unreadCount > 0 ? (
              <button
                type="button"
                onClick={markAllAsRead}
                className="text-[11px] text-slate-400 hover:text-white transition-colors"
              >
                Mark all as read
              </button>
            ) : (
              <span className="text-[11px] text-slate-500">Deduplicated notifications</span>
            )}
            <Link
              href="/cheques/dashboard"
              onClick={() => setIsOpen(false)}
              className="text-[11px] font-semibold text-emerald-400 hover:text-emerald-300 flex items-center gap-1"
            >
              Open Calendar <ArrowUpRight size={11} />
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}

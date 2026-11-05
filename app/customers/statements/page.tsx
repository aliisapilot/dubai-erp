"use client";
import ReportLoadState from "@/components/ReportLoadState";

import { useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";
import {
  FileSpreadsheet,
  Loader2,
  Printer,
  ArrowLeft,
  Columns2,
  Sliders,
  ExternalLink,
  X,
  CheckCircle2,
  ShieldCheck,
  Check,
  Save,
  Pencil,
  History,
  AlertTriangle,
  AlertCircle,
  Clock,
  Plus,
  Trash2,
} from "lucide-react";
import Link from "next/link";
import StatementOfAccountTemplate, { StatementData, StatementEntry } from "@/components/documents/StatementOfAccountTemplate";
import PrintModal from "@/components/documents/PrintModal";
import { CompanyDocInfo } from "@/components/documents/DocHeader";
import { getCurrentCompany, getCompanyId, todayISO, fmtAED, generateDocNumber } from "@/lib/helpers";
import { generateDocumentPdfFilename } from "@/lib/documentFilename";
import { CustomPartyData } from "@/lib/documentCustomer";
import { createSOA101ReferenceLayout } from "@/lib/documentDesigner";
import { formatDisplayDocNumber, detectDocumentCollisions, DocumentMappingItem } from "@/lib/helpers";
import DocumentNumberMappingPreviewModal from "@/components/documents/DocumentNumberMappingPreviewModal";
import { parseCustomPartyFromNotes } from "@/lib/documentCustomer";
import DynamicDocumentRenderer, { getSampleDocumentData, MockDocumentData } from "@/components/documents/DynamicDocumentRenderer";

type Customer = {
  id: string;
  name: string | null;
  customer_code: string | null;
  trn: string | null;
  address: string | null;
  phone: string | null;
  opening_balance?: number | null;
  opening_balance_date?: string | null;
};

export type BalanceHistoryEntry = {
  id: string;
  customer_id: string;
  old_amount: number;
  new_amount: number;
  reason?: string | null;
  created_at: string;
  user_email?: string | null;
};

type Invoice = {
  id: string;
  customer_id: string | null;
  invoice_number: string | null;
  invoice_date: string | null;
  total_amount: number | null;
  status: string | null;
};

type Payment = {
  id: string;
  customer_id: string | null;
  payment_number: string | null;
  payment_date: string | null;
  amount: number | null;
  payment_method: string | null;
  reference_number: string | null;
  status?: string | null;
};

type ReceiptVoucher = {
  id: string;
  customer_id: string | null;
  voucher_number: string | null;
  voucher_date: string | null;
  amount: number | null;
  payment_method: string | null;
  cheque_number: string | null;
  status?: string | null;
};

function normalizeCustomerName(name?: string | null): string {
  if (!name) return "";
  return name
    .toLowerCase()
    .replace(/\b(l\.?l\.?c\.?|fzc|fze|sp|co|company|trading|services|fix|installation|est|wll)\b/gi, "")
    .replace(/[^a-z0-9]/gi, "")
    .trim();
}

export default function StatementOfAccountPage() {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [company, setCompany] = useState<CompanyDocInfo | null>(null);
  const [selectedCustomerId, setSelectedCustomerId] = useState("");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState(todayISO());
  const [openingBalance, setOpeningBalance] = useState(0);
  const [openingBalanceInput, setOpeningBalanceInput] = useState<string>("0.00");
  const [appliedOpeningBalance, setAppliedOpeningBalance] = useState<number>(0);

  // Payment / Credit Modal States
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [customerInvoices, setCustomerInvoices] = useState<{ id: string; invoice_number: string; invoice_date: string; total_amount: number }[]>([]);
  const [savingPayment, setSavingPayment] = useState(false);
  const [paymentMessage, setPaymentMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [paymentForm, setPaymentForm] = useState({
    date: todayISO(),
    amount: "",
    payment_method: "Bank Transfer",
    voucher_number: "",
    tax_invoice_id: "",
    cheque_number: "",
    cheque_date: "",
    bank_name: "",
    notes: "",
  });
  const [partyMode, setPartyMode] = useState<"existing" | "custom">("existing");
  const [customCustomer, setCustomCustomer] = useState<CustomPartyData>({
    name: "",
    address: "",
    contact_person: "",
    phone: "",
    email: "",
    trn: "",
    project_name: "",
  });

  const [loading, setLoading] = useState(true);
  const [calculating, setCalculating] = useState(false);
  const [statement, setStatement] = useState<StatementData | null>(null);
  const [showPrintModal, setShowPrintModal] = useState(false);
  const [activeTemplate, setActiveTemplate] = useState<"default" | "soa_reference">("default");
  const [showCompareModal, setShowCompareModal] = useState(false);
  const [showMappingModal, setShowMappingModal] = useState(false);
  const [auditMappings, setAuditMappings] = useState<DocumentMappingItem[]>([]);
  const [compareDataMode, setCompareDataMode] = useState<"sample" | "live">("live");

  const [loadError, setLoadError] = useState("");
  const requestVersion = useRef(0);

  // Opening Balance Persistence & Audit States
  const [savedOpeningBalance, setSavedOpeningBalance] = useState<number | null>(null);
  const [isEditingBalance, setIsEditingBalance] = useState(false);
  const [balanceReason, setBalanceReason] = useState("");
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [showHistoryModal, setShowHistoryModal] = useState(false);
  const [balanceHistory, setBalanceHistory] = useState<BalanceHistoryEntry[]>([]);
  const [savingBalance, setSavingBalance] = useState(false);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [balanceMessage, setBalanceMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  async function loadCustomerOpeningBalance(customerId: string, currentCusts?: Customer[]) {
    if (!customerId) return;
    const pool = currentCusts || customers;
    const cust = pool.find(c => c.id === customerId);
    let val: number | null = cust?.opening_balance != null ? Number(cust.opening_balance) : null;

    if (val === null) {
      try {
        const { data } = await supabase
          .from("customers")
          .select("opening_balance")
          .eq("id", customerId)
          .maybeSingle();
        if (data && data.opening_balance != null) {
          val = Number(data.opening_balance);
        }
      } catch {}
    }

    if (val === null && typeof window !== "undefined") {
      try {
        const stored = localStorage.getItem(`dubai-erp.customer-opening-balance.${customerId}`);
        if (stored !== null && !isNaN(Number(stored))) {
          val = Number(stored);
        }
      } catch {}
    }

    const finalBal = val !== null ? val : 0;
    setSavedOpeningBalance(val);
    setOpeningBalance(finalBal);
    setAppliedOpeningBalance(finalBal);
    setOpeningBalanceInput(finalBal.toFixed(2));
    setIsEditingBalance(false);
    setBalanceMessage(null);
  }

  async function handleSaveOpeningBalance(confirmed = false) {
    const parsed = parseFloat(openingBalanceInput);
    const cleanAmount = isNaN(parsed) ? 0 : Math.round(parsed * 100) / 100;
    setOpeningBalance(cleanAmount);
    setOpeningBalanceInput(cleanAmount.toFixed(2));

    if (partyMode === "custom") {
      setAppliedOpeningBalance(cleanAmount);
      setBalanceMessage({ type: "success", text: `Opening balance applied to statement: ${fmtAED(cleanAmount)}` });
      return;
    }

    if (!selectedCustomerId) return;

    // Prevent duplicate entries if the balance hasn't changed
    if (savedOpeningBalance !== null && cleanAmount === savedOpeningBalance) {
      setBalanceMessage({ type: "success", text: `Opening balance is already up to date (${fmtAED(cleanAmount)}).` });
      setIsEditingBalance(false);
      return;
    }

    // Require explicit confirmation modal if editing an existing non-zero balance
    if (savedOpeningBalance !== null && savedOpeningBalance !== 0 && !confirmed) {
      setShowConfirmModal(true);
      return;
    }

    setSavingBalance(true);
    setBalanceMessage(null);
    try {
      const { data: authData } = await supabase.auth.getUser();
      const user = authData?.user;
      const companyId = company?.id || (await getCompanyId().catch(() => null));

      // 1. Persist to customers table
      try {
        await supabase
          .from("customers")
          .update({
            opening_balance: cleanAmount,
            opening_balance_date: todayISO(),
          })
          .eq("id", selectedCustomerId);
      } catch (e) {
        console.warn("Could not update opening_balance column on customers:", e);
      }

      // 2. Insert audit log record
      const oldAmt = savedOpeningBalance ?? 0;
      const newAmt = cleanAmount;
      const auditEntry: BalanceHistoryEntry = {
        id: typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : String(Date.now()),
        customer_id: selectedCustomerId,
        old_amount: oldAmt,
        new_amount: newAmt,
        reason: balanceReason.trim() || (oldAmt === 0 ? "Initial opening balance setup" : "Opening balance adjustment"),
        created_at: new Date().toISOString(),
        user_email: user?.email || "Current User",
      };

      if (companyId) {
        try {
          await supabase.from("customer_opening_balance_history").insert({
            company_id: companyId,
            customer_id: selectedCustomerId,
            old_amount: oldAmt,
            new_amount: newAmt,
            reason: auditEntry.reason,
            created_by: user?.id || null,
            user_email: auditEntry.user_email,
          });
        } catch (e) {
          console.warn("Could not insert into customer_opening_balance_history:", e);
        }
      }

      // 3. Local resilience cache
      if (typeof window !== "undefined") {
        try {
          localStorage.setItem(`dubai-erp.customer-opening-balance.${selectedCustomerId}`, String(cleanAmount));
          const prevLogsRaw = localStorage.getItem(`dubai-erp.customer-balance-history.${selectedCustomerId}`);
          const prevLogs: BalanceHistoryEntry[] = prevLogsRaw ? JSON.parse(prevLogsRaw) : [];
          localStorage.setItem(
            `dubai-erp.customer-balance-history.${selectedCustomerId}`,
            JSON.stringify([auditEntry, ...prevLogs])
          );
        } catch {}
      }

      // 4. Update memory states
      setSavedOpeningBalance(cleanAmount);
      setOpeningBalance(cleanAmount);
      setAppliedOpeningBalance(cleanAmount);
      setOpeningBalanceInput(cleanAmount.toFixed(2));
      setIsEditingBalance(false);
      setShowConfirmModal(false);
      setBalanceReason("");
      setCustomers(prev =>
        prev.map(c => (c.id === selectedCustomerId ? { ...c, opening_balance: cleanAmount } : c))
      );
      setBalanceMessage({
        type: "success",
        text: `Opening balance saved successfully: ${fmtAED(cleanAmount)}`,
      });
    } catch (err) {
      setBalanceMessage({
        type: "error",
        text: err instanceof Error ? err.message : "Failed to save opening balance.",
      });
    } finally {
      setSavingBalance(false);
    }
  }


  async function handleOpenPaymentModal() {
    setPaymentMessage(null);
    const cid = company?.id || (await getCompanyId().catch(() => null));
    let nextVoucherNo = "RV-001";
    if (cid) {
      try {
        nextVoucherNo = await generateDocNumber(cid, "RV");
      } catch (e) {
        console.warn("Could not generate RV doc number:", e);
      }
    }
    if (selectedCustomerId) {
      try {
        const { data: invs } = await supabase
          .from("tax_invoices")
          .select("id, invoice_number, invoice_date, total_amount")
          .eq("customer_id", selectedCustomerId)
          .neq("status", "cancelled")
          .order("invoice_date", { ascending: false });
        setCustomerInvoices(invs || []);
      } catch (e) {
        console.warn("Could not fetch customer invoices:", e);
      }
    } else {
      setCustomerInvoices([]);
    }

    setPaymentForm({
      date: todayISO(),
      amount: "",
      payment_method: "Bank Transfer",
      voucher_number: nextVoucherNo,
      tax_invoice_id: "",
      cheque_number: "",
      cheque_date: "",
      bank_name: "",
      notes: "",
    });
    setShowPaymentModal(true);
  }

  async function handleSavePayment(e?: React.FormEvent) {
    if (e) e.preventDefault();
    const cleanAmt = Math.round((parseFloat(paymentForm.amount) || 0) * 100) / 100;
    if (cleanAmt <= 0) {
      setPaymentMessage({ type: "error", text: "Please enter a valid payment amount greater than zero." });
      return;
    }
    if (!paymentForm.voucher_number.trim()) {
      setPaymentMessage({ type: "error", text: "Please enter a Receipt Voucher / Reference number." });
      return;
    }

    setSavingPayment(true);
    setPaymentMessage(null);
    try {
      const cid = company?.id || (await getCompanyId().catch(() => null));
      const targetCustId = partyMode === "existing" ? selectedCustomerId : null;

      const payload: Record<string, unknown> = {
        voucher_number: paymentForm.voucher_number.trim(),
        voucher_date: paymentForm.date,
        amount: cleanAmt,
        payment_method: paymentForm.payment_method,
        cheque_number: paymentForm.cheque_number.trim() || null,
        cheque_date: paymentForm.cheque_date || null,
        bank_name: paymentForm.bank_name.trim() || null,
        tax_invoice_id: paymentForm.tax_invoice_id || null,
        notes: paymentForm.notes.trim() || `Payment received via ${paymentForm.payment_method}`,
        status: "completed",
      };

      if (cid) payload.company_id = cid;
      if (targetCustId) payload.customer_id = targetCustId;

      if (partyMode === "custom") {
        payload.customer_name = customCustomer.name.trim();
        payload.customer_address = customCustomer.address?.trim() || null;
        payload.customer_trn = customCustomer.trn?.trim() || null;
      }

      const { error: insertErr } = await supabase.from("receipt_vouchers").insert(payload);
      if (insertErr) {
        throw new Error(insertErr.message);
      }

      setBalanceMessage({
        type: "success",
        text: `Customer payment of ${fmtAED(cleanAmt)} recorded successfully (${paymentForm.voucher_number.trim()}).`,
      });

      setShowPaymentModal(false);
      await generateStatement();
    } catch (err) {
      setPaymentMessage({
        type: "error",
        text: err instanceof Error ? err.message : "Failed to save payment record.",
      });
    } finally {
      setSavingPayment(false);
    }
  }

  async function handleVoidTransaction(entry: StatementEntry) {
    if (!entry.voucher_id && !entry.payment_id) return;
    const confirmVoid = typeof window !== "undefined" && window.confirm(
      `Are you sure you want to void payment credit ${entry.reference_no} (${fmtAED(entry.credit)})?\n\nThis will mark the record as void and remove the credit from the statement without deleting financial history.`
    );
    if (!confirmVoid) return;

    try {
      if (entry.voucher_id) {
        await supabase
          .from("receipt_vouchers")
          .update({ status: "void" })
          .eq("id", entry.voucher_id);
      }
      if (entry.payment_id) {
        await supabase
          .from("payments")
          .update({ status: "void" })
          .eq("id", entry.payment_id);
      }
      setBalanceMessage({
        type: "success",
        text: `Payment ${entry.reference_no} has been voided. Running balance updated.`,
      });
      await generateStatement();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to void transaction.");
    }
  }

  async function fetchBalanceHistory() {
    if (!selectedCustomerId) return;
    setHistoryLoading(true);
    try {
      let logs: BalanceHistoryEntry[] = [];
      try {
        const { data, error } = await supabase
          .from("customer_opening_balance_history")
          .select("id, customer_id, old_amount, new_amount, reason, created_at, user_email")
          .eq("customer_id", selectedCustomerId)
          .order("created_at", { ascending: false });
        if (!error && data) {
          logs = (data as unknown as Record<string, unknown>[]).map((d) => ({
            id: String(d.id || ""),
            customer_id: String(d.customer_id || ""),
            old_amount: Number(d.old_amount) || 0,
            new_amount: Number(d.new_amount) || 0,
            reason: (d.reason as string) || null,
            created_at: String(d.created_at || ""),
            user_email: (d.user_email as string) || null,
          }));
        }
      } catch {}

      if (typeof window !== "undefined") {
        try {
          const stored = localStorage.getItem(`dubai-erp.customer-balance-history.${selectedCustomerId}`);
          if (stored) {
            const localLogs: BalanceHistoryEntry[] = JSON.parse(stored);
            const existingIds = new Set(logs.map(l => l.id));
            for (const ll of localLogs) {
              if (!existingIds.has(ll.id)) {
                logs.push(ll);
              }
            }
          }
        } catch {}
      }

      logs.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
      setBalanceHistory(logs);
      setShowHistoryModal(true);
    } finally {
      setHistoryLoading(false);
    }
  }

  async function loadInitialData() {
    setLoadError("");
    try {
      setLoading(true);
      let custsList: Customer[] = [];
      const [{ data: custsWithBal, error: custWithBalError }, co] = await Promise.all([
        supabase.from("customers").select("id, name, customer_code, trn, address, phone, opening_balance").eq("active", true).order("name"),
        getCurrentCompany(),
      ]);

      if (!custWithBalError && custsWithBal) {
        custsList = custsWithBal as Customer[];
      } else {
        const { data: custsBasic, error: basicError } = await supabase
          .from("customers")
          .select("id, name, customer_code, trn, address, phone")
          .eq("active", true)
          .order("name");
        if (basicError) throw new Error(basicError.message);
        custsList = (custsBasic || []) as Customer[];
      }

      setCustomers(custsList);
      if (co) setCompany(co as CompanyDocInfo);
      if (custsList.length > 0) {
        const urlParams = typeof window !== "undefined" ? new URLSearchParams(window.location.search) : null;
        const qCid = urlParams?.get("customer_id");
        const initId = (qCid && custsList.some(c => c.id === qCid)) ? qCid : custsList[0].id;
        setSelectedCustomerId(initId);
        void loadCustomerOpeningBalance(initId, custsList);
      }
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : "Could not load customers.");
    } finally {
      setLoading(false);
    }
  }

  async function generateStatement() {
    if (partyMode === "existing" && !selectedCustomerId) return;
    if (partyMode === "custom" && !customCustomer.name.trim()) return;

    const version = ++requestVersion.current;
    setCalculating(true);
    setLoadError("");
    setStatement(null);
    try {
      let custName = "";
      let custTrn: string | null = null;
      let custAddress: string | null = null;
      let custPhone: string | null = null;
      let custCode = "";

      let allInvs: Invoice[] = [];
      let pays: Payment[] = [];
      let rcvs: ReceiptVoucher[] = [];
      const companyId = company?.id || (await getCompanyId().catch(() => null));

      if (partyMode === "existing") {
        const cust = customers.find(c => c.id === selectedCustomerId);
        if (!cust) {
          setCalculating(false);
          return;
        }
        custName = cust.name || "Customer";
        custTrn = cust.trn;
        custAddress = cust.address;
        custPhone = cust.phone;
        custCode = cust.customer_code || cust.id.slice(0, 4).toUpperCase();

        // 1. Direct invoices linked by customer_id
        let directQuery = supabase
          .from("tax_invoices")
          .select("id, customer_id, company_id, invoice_number, invoice_date, total_amount, status, notes")
          .eq("customer_id", selectedCustomerId);
        if (companyId) directQuery = directQuery.eq("company_id", companyId);

        // 2. Also search for any unlinked invoices or custom invoices in the same company
        let unlinkedQuery = supabase
          .from("tax_invoices")
          .select("id, customer_id, company_id, invoice_number, invoice_date, total_amount, status, notes")
          .is("customer_id", null);
        if (companyId) unlinkedQuery = unlinkedQuery.eq("company_id", companyId);

        const paysPromise = supabase
          .from("payments")
          .select("id, customer_id, payment_number, payment_date, amount, payment_method, reference_number")
          .eq("customer_id", selectedCustomerId)
          .order("payment_date", { ascending: true });

        const rcvsPromise = supabase
          .from("receipt_vouchers")
          .select("id, customer_id, voucher_number, voucher_date, amount, payment_method, cheque_number")
          .eq("customer_id", selectedCustomerId)
          .order("voucher_date", { ascending: true });

        const [directRes, unlinkedRes, paysRes, rcvsRes] = await Promise.all([
          directQuery.order("invoice_date", { ascending: true }),
          unlinkedQuery.limit(100),
          paysPromise,
          rcvsPromise,
        ]);

        if (directRes.error) throw new Error(directRes.error.message);
        allInvs = (directRes.data || []) as Invoice[];
        pays = (paysRes.data || []) as Payment[];
        rcvs = (rcvsRes.data || []) as ReceiptVoucher[];

        // Safely resolve unlinked invoices using normalized names and TRN
        if (unlinkedRes.data && unlinkedRes.data.length > 0) {
          const normTarget = normalizeCustomerName(custName);
          for (const uInv of unlinkedRes.data) {
            const parsedParty = parseCustomPartyFromNotes(uInv.notes, "CUSTOM_CUSTOMER");
            const trnMatch = Boolean(parsedParty?.trn && custTrn && parsedParty.trn.trim() === custTrn.trim());
            const nameMatch = Boolean(parsedParty?.name && normalizeCustomerName(parsedParty.name) === normTarget);

            if (trnMatch || nameMatch) {
              allInvs.push(uInv as Invoice);
              // Asynchronously heal relationship in Supabase
              void supabase
                .from("tax_invoices")
                .update({ customer_id: selectedCustomerId })
                .eq("id", uInv.id);
            }
          }
        }
      } else {
        custName = customCustomer.name.trim();
        custTrn = customCustomer.trn?.trim() || null;
        custAddress = customCustomer.address?.trim() || null;
        custPhone = customCustomer.phone?.trim() || null;
        custCode = "CUST-DIRECT";

        // Query tax_invoices for this company safely without selecting non-existent SQL column customer_name
        let custInvQuery = supabase
          .from("tax_invoices")
          .select("id, customer_id, company_id, invoice_number, invoice_date, total_amount, status, notes");
        if (companyId) custInvQuery = custInvQuery.eq("company_id", companyId);

        const [rawInvsRes, rcvsRes] = await Promise.all([
          custInvQuery.order("invoice_date", { ascending: true }),
          supabase
            .from("receipt_vouchers")
            .select("id, customer_id, voucher_number, voucher_date, amount, payment_method, cheque_number, notes")
            .order("voucher_date", { ascending: true }),
        ]);

        if (rawInvsRes.error) throw new Error(rawInvsRes.error.message);
        const normTarget = normalizeCustomerName(custName);

        (rawInvsRes.data || []).forEach((r) => {
          const parsed = parseCustomPartyFromNotes(r.notes, "CUSTOM_CUSTOMER");
          const trnMatch = Boolean(parsed?.trn && custTrn && parsed.trn.trim() === custTrn.trim());
          const nameMatch = Boolean(parsed?.name && normalizeCustomerName(parsed.name) === normTarget);
          if (trnMatch || nameMatch) {
            allInvs.push(r as Invoice);
          }
        });
        rcvs = (rcvsRes.data || []) as ReceiptVoucher[];
      }

      if (version !== requestVersion.current) return;

      // Build collision audit mappings for preview modal
      const rawDocMappings = allInvs.map(inv => ({
        id: inv.id,
        number: inv.invoice_number || "INV",
        docType: "tax_invoice" as const,
        customerName: custName,
        date: inv.invoice_date || undefined,
        totalAmount: Number(inv.total_amount) || 0,
      }));
      const collisionAudit = detectDocumentCollisions(rawDocMappings, "tax_invoice");
      setAuditMappings(collisionAudit.mappings);

      // Build unified transactions list
      type RawTx = {
        date: string;
        reference_no: string;
        original_reference: string;
        invoice_id?: string;
        voucher_id?: string;
        payment_id?: string;
        description: string;
        debit: number;
        credit: number;
      };

      const rawTxs: RawTx[] = [];
      const seenInvoiceIds = new Set<string>();

      allInvs.forEach((inv: Invoice) => {
        if (seenInvoiceIds.has(inv.id)) return;
        seenInvoiceIds.add(inv.id);

        const st = (inv.status || "").toLowerCase().trim();
        // Only exclude cancelled and void invoices from customer statement balances
        if (st === "cancelled" || st === "void") return;

        if (inv.invoice_date) {
          const simplifiedRef = formatDisplayDocNumber(inv.invoice_number, "tax_invoice");
          rawTxs.push({
            date: inv.invoice_date,
            reference_no: simplifiedRef,
            original_reference: inv.invoice_number || "INV",
            invoice_id: inv.id,
            description: `Tax Invoice ${simplifiedRef}`,
            debit: Number(inv.total_amount) || 0,
            credit: 0,
          });
        }
      });

      const seenPaymentIds = new Set<string>();
      (pays || []).forEach((p: Payment) => {
        if (seenPaymentIds.has(p.id)) return;
        seenPaymentIds.add(p.id);
        if ((p.status || "completed").toLowerCase() !== "completed") return;
        if (p.payment_date) {
          const simplifiedPayRef = formatDisplayDocNumber(p.payment_number || p.reference_number || "PAY", "employee_payment_voucher");
          rawTxs.push({
            date: p.payment_date,
            reference_no: simplifiedPayRef,
            original_reference: p.payment_number || p.reference_number || "PAY",
            payment_id: p.id,
            description: `Payment Received (${p.payment_method || "Cash"})`,
            debit: 0,
            credit: Number(p.amount) || 0,
          });
        }
      });

      const seenVoucherIds = new Set<string>();
      (rcvs || []).forEach((rcv: ReceiptVoucher) => {
        if (seenVoucherIds.has(rcv.id)) return;
        seenVoucherIds.add(rcv.id);
        const rst = (rcv.status || "").toLowerCase().trim();
        if (rst === "cancelled" || rst === "void") return;
        if (rcv.voucher_date) {
          const simplifiedVoucherRef = formatDisplayDocNumber(rcv.voucher_number || "RV", "receipt_voucher");
          rawTxs.push({
            date: rcv.voucher_date,
            reference_no: simplifiedVoucherRef,
            original_reference: rcv.voucher_number || "RV",
            voucher_id: rcv.id,
            description: `Receipt Voucher (${rcv.payment_method || "Cash"}${rcv.cheque_number ? ` - Chq: ${rcv.cheque_number}` : ""})`,
            debit: 0,
            credit: Number(rcv.amount) || 0,
          });
        }
      });

      // Sort chronologically
      rawTxs.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

      // Calculate opening balance before `fromDate`
      let computedOpening = Number(openingBalance) || 0;
      const filteredTxs: RawTx[] = [];

      rawTxs.forEach(tx => {
        if (fromDate && tx.date < fromDate) {
          computedOpening += (tx.debit - tx.credit);
        } else if (!toDate || tx.date <= toDate) {
          filteredTxs.push(tx);
        }
      });

      // Compute running balance line-by-line
      let currentBalance = computedOpening;
      const entries: StatementEntry[] = filteredTxs.map(tx => {
        currentBalance += (tx.debit - tx.credit);
        return {
          date: tx.date,
          reference_no: tx.reference_no,
          original_reference: tx.original_reference,
          invoice_id: tx.invoice_id,
          voucher_id: tx.voucher_id,
          payment_id: tx.payment_id,
          description: tx.description,
          debit: tx.debit,
          credit: tx.credit,
          balance: currentBalance,
        };
      });

      // Universal document numbering: Clean simplified SOA sequence
      const custIdx = customers.findIndex(c => c.id === selectedCustomerId);
      const stNumber = formatDisplayDocNumber(`SOA-${custIdx >= 0 ? custIdx + 1 : 1}`, "customer_statement");

      const statementData: StatementData = {
        statement_number: stNumber,
        statement_date: todayISO(),
        from_date: fromDate || null,
        to_date: toDate || null,
        customer_name: custName,
        customer_trn: custTrn,
        customer_address: custAddress,
        customer_phone: custPhone,
        customer_code: custCode,
        opening_balance: computedOpening,
        entries,
        closing_balance: currentBalance,
      };

      if (version === requestVersion.current) setStatement(statementData);
    } catch (err) {
      if (version === requestVersion.current) setLoadError(err instanceof Error ? err.message : "Could not load statement transactions.");
    } finally {
      if (version === requestVersion.current) setCalculating(false);
    }
  }

  useEffect(() => {
    void Promise.resolve().then(loadInitialData);
  }, []);

  useEffect(() => {
    if ((partyMode === "existing" && selectedCustomerId) || (partyMode === "custom" && customCustomer.name.trim())) {
      void Promise.resolve().then(generateStatement);
    }
    return () => { requestVersion.current++; };
  }, [selectedCustomerId, fromDate, toDate, appliedOpeningBalance, partyMode, customCustomer.name, customCustomer.trn, customCustomer.address, customCustomer.phone]);

  if (loading || loadError) return <ReportLoadState loading={loading} error={loadError} onRetry={() => void (customers.length ? generateStatement() : loadInitialData())} />;

  return (
    <main className="min-h-screen bg-slate-50">
      <div className="app-screen-content no-print">
        <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-5">
          <div className="flex items-center gap-3">
            <Link
              href="/customers"
              className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition"
              title="Back to Customers"
            >
              <ArrowLeft size={20} />
            </Link>
            <div className="rounded-xl bg-slate-900 p-2.5 text-white">
              <FileSpreadsheet size={22} />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-slate-900">Statement of Account</h1>
              <p className="text-sm text-slate-500">Customer ledger balances, invoices, payments, and running balance</p>
            </div>
          </div>
          {statement && (
            <div className="flex items-center gap-2.5">
              <div className="flex items-center bg-slate-100 rounded-lg p-0.5 border border-slate-200 text-xs">
                <button
                  type="button"
                  onClick={() => setActiveTemplate("default")}
                  className={`px-3 py-1.5 rounded-md font-medium transition ${
                    activeTemplate === "default"
                      ? "bg-white text-slate-900 font-semibold shadow-sm"
                      : "text-slate-600 hover:text-slate-900"
                  }`}
                  title="Current saved statement layout in production"
                >
                  Current Template
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTemplate("soa_reference")}
                  className={`px-3 py-1.5 rounded-md font-medium transition flex items-center gap-1.5 ${
                    activeTemplate === "soa_reference"
                      ? "bg-slate-900 text-white font-semibold shadow-sm"
                      : "text-slate-600 hover:text-slate-900"
                  }`}
                  title="SOA-101 Al Karwan Reference (Classic Ledger) layout"
                >
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400"></span>
                  SOA-101 Reference
                </button>
              </div>

              <button
                type="button"
                onClick={() => setShowMappingModal(true)}
                className="flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 hover:text-slate-900 transition shadow-sm"
                title="View mapping between original database numbers and simplified display references"
              >
                <FileSpreadsheet size={15} className="text-blue-600" />
                Numbering Preview
              </button>

              <button
                type="button"
                onClick={() => setShowCompareModal(true)}
                className="flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 hover:text-slate-900 transition shadow-sm"
                title="View side-by-side comparison with original reference PDF"
              >
                <Columns2 size={16} className="text-slate-500" />
                Compare with Reference SOA
              </button>

              <button
                type="button"
                onClick={() => setShowPrintModal(true)}
                className="flex items-center gap-2 rounded-lg bg-slate-900 px-4 py-2 text-xs font-semibold text-white hover:bg-slate-800 transition shadow-sm"
              >
                <Printer size={16} /> Print / Export A4
              </button>
            </div>
          )}
        </div>
      </header>

      <div className="mx-auto max-w-7xl px-6 py-8">
        {/* Filter Controls Card */}
        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm mb-6 space-y-4">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <div>
              <span className="text-xs font-bold uppercase tracking-wider text-slate-500">Customer Mode</span>
              <p className="text-[11px] text-slate-400">Select an existing account or enter custom customer details directly</p>
            </div>
            <div className="flex items-center rounded-lg bg-slate-100 p-0.5 border border-slate-200 text-xs">
              <button
                type="button"
                onClick={() => setPartyMode("existing")}
                className={`px-3 py-1 rounded-md font-medium transition ${
                  partyMode === "existing"
                    ? "bg-white text-slate-900 font-semibold shadow-sm"
                    : "text-slate-500 hover:text-slate-900"
                }`}
              >
                Existing Customer
              </button>
              <button
                type="button"
                onClick={() => setPartyMode("custom")}
                className={`px-3 py-1 rounded-md font-medium transition ${
                  partyMode === "custom"
                    ? "bg-white text-slate-900 font-semibold shadow-sm"
                    : "text-slate-500 hover:text-slate-900"
                }`}
              >
                Custom Customer
              </button>
            </div>
          </div>

          {partyMode === "existing" ? (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
              <div>
                <label className="mb-1 block font-semibold text-slate-700">Select Customer</label>
                <select
                  value={selectedCustomerId}
                  onChange={e => {
                    const newCid = e.target.value;
                    setSelectedCustomerId(newCid);
                    void loadCustomerOpeningBalance(newCid);
                  }}
                  className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs focus:border-slate-400 focus:outline-none"
                >
                  {customers.map(c => (
                    <option key={c.id} value={c.id}>
                      {c.name} {c.customer_code ? `(${c.customer_code})` : ""}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="mb-1 block font-semibold text-slate-700">From Date</label>
                <input
                  type="date"
                  value={fromDate}
                  onChange={e => setFromDate(e.target.value)}
                  className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs focus:border-slate-400 focus:outline-none"
                />
              </div>

              <div>
                <label className="mb-1 block font-semibold text-slate-700">To Date</label>
                <input
                  type="date"
                  value={toDate}
                  onChange={e => setToDate(e.target.value)}
                  className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs focus:border-slate-400 focus:outline-none"
                />
              </div>

              {/* Dedicated Initial Opening Balance Section */}
              <div className="md:col-span-3 rounded-xl border border-slate-200 bg-slate-50/80 p-4 mt-1">
                <div className="flex flex-wrap items-center justify-between gap-2 mb-2.5">
                  <div className="flex items-center gap-2 flex-wrap">
                    <label className="font-bold text-slate-800 text-xs flex items-center gap-1.5">
                      Initial Opening Balance (AED)
                      <span className="text-[11px] text-slate-500 font-normal">
                        — Ledger balance brought forward prior to transaction entries
                      </span>
                    </label>
                    {savedOpeningBalance !== null ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-0.5 text-[11px] font-semibold text-emerald-700 border border-emerald-200">
                        <CheckCircle2 size={12} /> Stored in DB: {fmtAED(savedOpeningBalance)}
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-0.5 text-[11px] font-medium text-slate-600 border border-slate-200">
                        Not yet stored in DB
                      </span>
                    )}
                    {isEditingBalance && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2.5 py-0.5 text-[11px] font-semibold text-amber-700 border border-amber-200 animate-pulse">
                        <AlertCircle size={12} /> Editing Mode
                      </span>
                    )}
                  </div>

                  <button
                    type="button"
                    onClick={fetchBalanceHistory}
                    disabled={historyLoading}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 hover:text-slate-900 shadow-sm transition"
                    title="View opening balance audit log"
                  >
                    <History size={14} className="text-slate-500" />
                    {historyLoading ? "Loading..." : "View Balance History"}
                  </button>
                </div>

                <div className="flex flex-wrap items-center gap-3">
                  <div className="relative min-w-[220px] max-w-sm flex-1">
                    <span className="absolute left-3 top-2 text-xs font-bold text-slate-400">AED</span>
                    <input
                      type="text"
                      inputMode="decimal"
                      value={openingBalanceInput}
                      disabled={savedOpeningBalance !== null && !isEditingBalance}
                      onChange={e => {
                        const val = e.target.value;
                        if (/^[0-9]*\.?[0-9]*$/.test(val)) {
                          setOpeningBalanceInput(val);
                        }
                      }}
                      onBlur={() => {
                        const parsed = parseFloat(openingBalanceInput);
                        const clean = isNaN(parsed) ? 0 : Math.round(parsed * 100) / 100;
                        setOpeningBalance(clean);
                        setOpeningBalanceInput(clean.toFixed(2));
                      }}
                      onKeyDown={e => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          const parsed = parseFloat(openingBalanceInput);
                          const clean = isNaN(parsed) ? 0 : Math.round(parsed * 100) / 100;
                          setOpeningBalance(clean);
                          setOpeningBalanceInput(clean.toFixed(2));
                          (e.target as HTMLInputElement).blur();
                        }
                      }}
                      placeholder="0.00"
                      className={`w-full rounded-lg border pl-12 pr-3 py-2 text-xs font-mono font-bold focus:outline-none transition ${
                        savedOpeningBalance !== null && !isEditingBalance
                          ? "bg-slate-100/90 border-slate-200 text-slate-700 cursor-not-allowed"
                          : "bg-white border-blue-500 text-slate-900 shadow-sm focus:ring-1 focus:ring-blue-500"
                      }`}
                    />
                  </div>

                  {savedOpeningBalance !== null && !isEditingBalance ? (
                    <button
                      type="button"
                      onClick={() => setIsEditingBalance(true)}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 hover:text-slate-900 transition shadow-sm"
                      title="Edit customer opening balance"
                    >
                      <Pencil size={13} className="text-slate-500" />
                      Edit Opening Balance
                    </button>
                  ) : (
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => handleSaveOpeningBalance(false)}
                        disabled={savingBalance}
                        className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-4 py-2 text-xs font-semibold text-white hover:bg-emerald-700 transition shadow-sm disabled:opacity-50"
                      >
                        {savingBalance ? (
                          <>
                            <Loader2 size={14} className="animate-spin" /> Saving...
                          </>
                        ) : (
                          <>
                            <Save size={14} /> Save Opening Balance
                          </>
                        )}
                      </button>

                      {isEditingBalance && (
                        <button
                          type="button"
                          onClick={() => {
                            setIsEditingBalance(false);
                            const prev = savedOpeningBalance ?? 0;
                            setOpeningBalance(prev);
                            setAppliedOpeningBalance(prev);
                            setOpeningBalanceInput(prev.toFixed(2));
                            setBalanceMessage(null);
                          }}
                          className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-600 hover:bg-slate-50 transition"
                        >
                          Cancel
                        </button>
                      )}
                    </div>
                  )}
                </div>

                {balanceMessage && (
                  <div
                    className={`mt-2.5 flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium ${
                      balanceMessage.type === "success"
                        ? "bg-emerald-50 text-emerald-800 border border-emerald-200"
                        : "bg-rose-50 text-rose-800 border border-rose-200"
                    }`}
                  >
                    {balanceMessage.type === "success" ? <CheckCircle2 size={14} /> : <AlertTriangle size={14} />}
                    <span>{balanceMessage.text}</span>
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="rounded-lg border border-amber-200 bg-amber-50 p-2.5 text-xs text-amber-800">
                ✍️ <strong>Custom Customer Statement</strong>: Enter customer details directly. No entry will be added to your customer directory.
              </div>
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4 text-xs">
                <div className="md:col-span-2">
                  <label className="mb-1 block font-semibold text-slate-700">Customer / Company Name <span className="text-red-500">*</span></label>
                  <input
                    type="text"
                    value={customCustomer.name}
                    onChange={e => setCustomCustomer(prev => ({ ...prev, name: e.target.value }))}
                    placeholder="e.g. Al-Futtaim Engineering LLC"
                    required
                    className="w-full rounded-lg border border-amber-300 bg-white px-3 py-2 text-xs font-semibold focus:border-amber-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="mb-1 block font-semibold text-slate-700">TRN (Optional)</label>
                  <input
                    type="text"
                    value={customCustomer.trn}
                    onChange={e => setCustomCustomer(prev => ({ ...prev, trn: e.target.value }))}
                    placeholder="100XXXXXXXXX003"
                    className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-mono focus:border-slate-400 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="mb-1 block font-semibold text-slate-700">Phone (Optional)</label>
                  <input
                    type="text"
                    value={customCustomer.phone}
                    onChange={e => setCustomCustomer(prev => ({ ...prev, phone: e.target.value }))}
                    placeholder="+971 50 123 4567"
                    className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs focus:border-slate-400 focus:outline-none"
                  />
                </div>
                <div className="md:col-span-2">
                  <label className="mb-1 block font-semibold text-slate-700">Address / Location (Optional)</label>
                  <input
                    type="text"
                    value={customCustomer.address}
                    onChange={e => setCustomCustomer(prev => ({ ...prev, address: e.target.value }))}
                    placeholder="Plot / Street / Emirate"
                    className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs focus:border-slate-400 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="mb-1 block font-semibold text-slate-700">From Date</label>
                  <input
                    type="date"
                    value={fromDate}
                    onChange={e => setFromDate(e.target.value)}
                    className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs focus:border-slate-400 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="mb-1 block font-semibold text-slate-700">To Date</label>
                  <input
                    type="date"
                    value={toDate}
                    onChange={e => setToDate(e.target.value)}
                    className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs focus:border-slate-400 focus:outline-none"
                  />
                </div>
                <div className="md:col-span-2">
                  <label className="mb-1 block font-semibold text-slate-700">Initial Opening Balance (AED)</label>
                  <input
                    type="text"
                    inputMode="decimal"
                    value={openingBalanceInput}
                    onChange={e => {
                      const val = e.target.value;
                      if (/^[0-9]*\.?[0-9]*$/.test(val)) {
                        setOpeningBalanceInput(val);
                      }
                    }}
                    onBlur={() => {
                      const parsed = parseFloat(openingBalanceInput);
                      const clean = isNaN(parsed) ? 0 : Math.round(parsed * 100) / 100;
                      setOpeningBalance(clean);
                      setAppliedOpeningBalance(clean);
                      setOpeningBalanceInput(clean.toFixed(2));
                    }}
                    onKeyDown={e => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        const parsed = parseFloat(openingBalanceInput);
                        const clean = isNaN(parsed) ? 0 : Math.round(parsed * 100) / 100;
                        setOpeningBalance(clean);
                        setAppliedOpeningBalance(clean);
                        setOpeningBalanceInput(clean.toFixed(2));
                        (e.target as HTMLInputElement).blur();
                      }
                    }}
                    placeholder="0.00"
                    className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-mono font-bold focus:border-slate-400 focus:outline-none"
                  />
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Live Statement Preview Table */}
        {loading || calculating ? (
          <div className="flex justify-center py-24">
            <Loader2 size={28} className="animate-spin text-slate-400" />
          </div>
        ) : !statement ? (
          <div className="rounded-xl border border-slate-200 bg-white py-20 text-center text-slate-500">
            Select a customer to generate their statement of account.
          </div>
        ) : (
          <div className="space-y-4">
            {/* KPI Banner */}
            <div className="grid grid-cols-3 gap-4">
              <div className="rounded-xl border border-slate-200 bg-white p-4">
                <span className="text-xs text-slate-500 block font-medium">Opening Balance</span>
                <span className="text-lg font-bold font-mono text-slate-800">
                  {statement.opening_balance.toLocaleString("en-US", { minimumFractionDigits: 2 })} AED
                </span>
              </div>
              <div className="rounded-xl border border-slate-200 bg-white p-4">
                <span className="text-xs text-slate-500 block font-medium">Total Charges (Invoiced)</span>
                <span className="text-lg font-bold font-mono text-rose-700">
                  {statement.entries.reduce((s, e) => s + e.debit, 0).toLocaleString("en-US", { minimumFractionDigits: 2 })} AED
                </span>
              </div>
              <div className="rounded-xl border border-slate-200 bg-white p-4">
                <span className="text-xs text-slate-500 block font-medium">Total Received (Credits)</span>
                <span className="text-lg font-bold font-mono text-emerald-700">
                  {statement.entries.reduce((s, e) => s + e.credit, 0).toLocaleString("en-US", { minimumFractionDigits: 2 })} AED
                </span>
              </div>
            </div>

            {/* Table */}
            <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
              <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
                <div>
                  <h2 className="font-bold text-slate-900 text-sm">{statement.customer_name}</h2>
                  <p className="text-xs text-slate-500">Ref: {statement.statement_number}</p>
                </div>
                <div className="flex items-center gap-4">
                  <button
                    type="button"
                    onClick={handleOpenPaymentModal}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3.5 py-2 text-xs font-semibold text-white hover:bg-emerald-700 transition shadow-sm"
                  >
                    <Plus size={14} /> Add Payment / Credit
                  </button>
                  <div className="text-right">
                    <span className="text-xs text-slate-500 block">Outstanding Closing Balance:</span>
                    <span className="text-base font-extrabold font-mono text-slate-900">
                      {statement.closing_balance.toLocaleString("en-US", { minimumFractionDigits: 2 })} AED
                    </span>
                  </div>
                </div>
              </div>

              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-100 bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                    <th className="px-4 py-3">Date</th>
                    <th className="px-4 py-3">Ref No</th>
                    <th className="px-4 py-3">Description</th>
                    <th className="px-4 py-3 text-right">Debit (Charges)</th>
                    <th className="px-4 py-3 text-right">Credit (Paid)</th>
                    <th className="px-4 py-3 text-right">Running Balance</th>
                    <th className="px-3 py-3 text-center w-16">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-xs">
                  <tr className="bg-slate-50/60 font-semibold text-slate-700">
                    <td className="px-4 py-2.5 font-mono">{fromDate || "—"}</td>
                    <td className="px-4 py-2.5 font-mono">—</td>
                    <td className="px-4 py-2.5">Opening Balance Brought Forward</td>
                    <td className="px-4 py-2.5 text-right font-mono">—</td>
                    <td className="px-4 py-2.5 text-right font-mono">—</td>
                    <td className="px-4 py-2.5 text-right font-mono text-slate-900 font-bold">
                      {statement.opening_balance.toLocaleString("en-US", { minimumFractionDigits: 2 })} AED
                    </td>
                    <td className="px-3 py-2.5 text-center text-slate-400">—</td>
                  </tr>

                  {statement.entries.map((e, idx) => (
                    <tr key={idx} className="hover:bg-slate-50">
                      <td className="px-4 py-2.5 text-slate-600 font-mono">
                        {e.date ? new Date(e.date).toLocaleDateString("en-GB") : "—"}
                      </td>
                      <td className="px-4 py-2.5 font-mono font-bold">
                        {e.invoice_id ? (
                          <Link
                            href={`/tax-invoices?id=${e.invoice_id}`}
                            className="inline-flex items-center gap-1 text-blue-600 hover:text-blue-800 hover:underline"
                            title={`Open Tax Invoice (${e.original_reference || e.reference_no})`}
                          >
                            {e.reference_no}
                            <ExternalLink size={11} className="opacity-70" />
                          </Link>
                        ) : (
                          <span className="text-slate-800">{e.reference_no}</span>
                        )}
                      </td>
                      <td className="px-4 py-2.5 text-slate-800">{e.description}</td>
                      <td className="px-4 py-2.5 text-right font-mono text-rose-700">
                        {e.debit > 0 ? e.debit.toLocaleString("en-US", { minimumFractionDigits: 2 }) : "—"}
                      </td>
                      <td className="px-4 py-2.5 text-right font-mono text-emerald-700 font-semibold">
                        {e.credit > 0 ? e.credit.toLocaleString("en-US", { minimumFractionDigits: 2 }) : "—"}
                      </td>
                      <td className="px-4 py-2.5 text-right font-mono font-bold text-slate-900">
                        {e.balance.toLocaleString("en-US", { minimumFractionDigits: 2 })} AED
                      </td>
                      <td className="px-3 py-2.5 text-center">
                        {(e.voucher_id || e.payment_id) ? (
                          <button
                            type="button"
                            onClick={() => handleVoidTransaction(e)}
                            className="text-slate-400 hover:text-rose-600 transition p-1 rounded"
                            title="Void this payment credit"
                          >
                            <Trash2 size={13} />
                          </button>
                        ) : (
                          <span className="text-slate-300">—</span>
                        )}
                      </td>
                    </tr>
                  ))}

                  {statement.entries.length === 0 && (
                    <tr>
                      <td colSpan={7} className="px-4 py-8 text-center text-slate-400">
                        No transactions found for the selected period.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}
        </div>
      </div>

      {/* A4 Print Modal */}
      {statement && (() => {
        const docFile = generateDocumentPdfFilename({
          docType: "customer_statement",
          docNumber: statement.statement_number,
          partyName: statement.customer_name,
          date: statement.statement_date,
        });
        return (
          <PrintModal
            isOpen={showPrintModal}
            onClose={() => setShowPrintModal(false)}
            documentFilename={docFile.filename}
            documentTitle={docFile.title}
          >
            <StatementOfAccountTemplate
              company={company}
              statement={statement}
              overrideLayout={activeTemplate === "soa_reference" ? createSOA101ReferenceLayout() : undefined}
              onClose={() => setShowPrintModal(false)}
            />
          </PrintModal>
        );
      })()}

      {/* Side-by-Side Comparison Modal */}
      {showCompareModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-3 md:p-6 overflow-hidden">
          <div className="relative w-full max-w-7xl max-h-[96vh] flex flex-col bg-slate-100 rounded-2xl shadow-2xl border border-slate-300 overflow-hidden">
            {/* Modal Header */}
            <div className="flex items-center justify-between px-6 py-4 bg-white border-b border-slate-200">
              <div className="flex items-center gap-3">
                <div className="rounded-xl bg-slate-900 p-2 text-white">
                  <Columns2 size={20} />
                </div>
                <div>
                  <div className="flex items-center gap-2.5">
                    <h2 className="text-lg font-bold text-slate-900">
                      Statement of Account: Reference PDF vs Editable Template
                    </h2>
                    <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2.5 py-0.5 text-[11px] font-semibold text-amber-800 border border-amber-200">
                      <ShieldCheck size={13} className="text-amber-600" />
                      Original Statement Design Preserved
                    </span>
                  </div>
                  <p className="text-xs text-slate-500">
                    Comparing uploaded reference &quot;SOA101-26 Al Karwan Solution FZC.pdf&quot; against the recreated A4 editable design
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-3">
                <Link
                  href="/settings/designer?type=customer_statement"
                  className="flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 hover:text-slate-900 transition"
                  target="_blank"
                >
                  <Sliders size={14} className="text-slate-500" />
                  Open in PDF Designer
                  <ExternalLink size={12} className="text-slate-400" />
                </Link>
                <button
                  type="button"
                  onClick={() => setShowCompareModal(false)}
                  className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition"
                >
                  <X size={20} />
                </button>
              </div>
            </div>

            {/* Modal Sub-toolbar for right side controls */}
            <div className="flex items-center justify-between px-6 py-2.5 bg-slate-50 border-b border-slate-200 text-xs">
              <div className="flex items-center gap-2">
                <span className="font-semibold text-slate-700">Data Binding Source:</span>
                <div className="inline-flex rounded-lg bg-white p-0.5 border border-slate-200">
                  <button
                    type="button"
                    onClick={() => setCompareDataMode("live")}
                    className={`px-3 py-1 rounded-md font-medium transition ${
                      compareDataMode === "live"
                        ? "bg-slate-900 text-white font-semibold"
                        : "text-slate-600 hover:text-slate-900"
                    }`}
                  >
                    Live ERP Customer ({statement?.customer_name || "Current Customer"})
                  </button>
                  <button
                    type="button"
                    onClick={() => setCompareDataMode("sample")}
                    className={`px-3 py-1 rounded-md font-medium transition ${
                      compareDataMode === "sample"
                        ? "bg-slate-900 text-white font-semibold"
                        : "text-slate-600 hover:text-slate-900"
                    }`}
                  >
                    Al Karwan Sample Data (from PDF)
                  </button>
                </div>
              </div>

              <div className="flex items-center gap-3 text-xs">
                <span className="text-slate-500">
                  Active in Preview:{" "}
                  <strong className="text-slate-900">
                    {activeTemplate === "soa_reference" ? "SOA-101 Reference" : "Current Production Template"}
                  </strong>
                </span>
                <button
                  type="button"
                  onClick={() => setActiveTemplate(activeTemplate === "soa_reference" ? "default" : "soa_reference")}
                  className={`px-3 py-1 rounded-lg border font-semibold transition ${
                    activeTemplate === "soa_reference"
                      ? "border-emerald-300 bg-emerald-50 text-emerald-800"
                      : "border-slate-300 bg-white text-slate-700 hover:bg-slate-100"
                  }`}
                >
                  {activeTemplate === "soa_reference" ? "✓ Using Reference Template" : "Switch to Reference for Printing"}
                </button>
              </div>
            </div>

            {/* Modal Body: Two Columns side-by-side */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 p-6 overflow-y-auto flex-1 bg-slate-200/70">
              {/* Left Column: Uploaded Reference PDF */}
              <div className="flex flex-col rounded-xl bg-white border border-slate-300 shadow-md overflow-hidden">
                <div className="flex items-center justify-between px-4 py-3 bg-slate-800 text-white">
                  <div className="flex items-center gap-2">
                    <span className="inline-block w-2.5 h-2.5 rounded-full bg-amber-400"></span>
                    <span className="font-bold text-xs uppercase tracking-wide">
                      Uploaded Visual Reference (SOA101-26)
                    </span>
                  </div>
                  <span className="text-[11px] text-slate-300">
                    Al Karwan Solution FZC &bull; 10-Mar-2026
                  </span>
                </div>

                <div className="p-4 bg-slate-50/70 overflow-auto flex justify-center">
                  {/* Recreated Visual Reference Card */}
                  <div className="w-[480px] bg-white border border-slate-300 rounded shadow-sm p-4 text-[9px] text-slate-900 space-y-3 font-sans leading-tight">
                    {/* Header */}
                    <div className="flex justify-between items-start border-b border-transparent pb-1">
                      {/* Logo and Name */}
                      <div className="flex flex-col items-start gap-1">
                        <div className="w-16 h-12 flex items-center justify-center">
                          {company?.logo_url ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={company.logo_url} alt="Logo" className="max-h-full max-w-full object-contain" />
                          ) : (
                            <div className="w-14 h-10 border border-dashed border-amber-400 bg-amber-50 rounded flex items-center justify-center text-[8px] font-bold text-amber-700">
                              LOGO
                            </div>
                          )}
                        </div>
                        <div className="text-[8px] font-bold text-[#B58A2A] leading-tight">
                          الصفوه الذهبيه لصناعه الخيام ذ.م.م.ش.و
                        </div>
                        <div className="text-[7.5px] font-bold text-[#B58A2A] leading-tight">
                          AL SAFWAH AL QABDHA TENTS IND L.L.C SP
                        </div>
                      </div>

                      {/* Title & Details Box */}
                      <div className="flex flex-col items-end gap-2">
                        <h1 className="text-xl font-extrabold text-slate-900 tracking-tight">
                          Statement of Account
                        </h1>
                        <table className="border border-slate-300 text-[8px] border-collapse w-44">
                          <tbody>
                            <tr className="border-b border-slate-300">
                              <td className="px-1.5 py-0.5 font-medium text-slate-600 bg-slate-50">Date:</td>
                              <td className="px-1.5 py-0.5 text-right font-mono">March 10, 2026</td>
                            </tr>
                            <tr className="border-b border-slate-300">
                              <td className="px-1.5 py-0.5 font-medium text-slate-600 bg-slate-50">Statement #:</td>
                              <td className="px-1.5 py-0.5 text-right font-mono">SOA101-26</td>
                            </tr>
                            <tr className="border-b border-slate-300">
                              <td className="px-1.5 py-0.5 font-medium text-slate-600 bg-slate-50">Customer ID:</td>
                              <td className="px-1.5 py-0.5 text-right font-mono">CUST-101</td>
                            </tr>
                            <tr>
                              <td className="px-1.5 py-0.5 font-medium text-slate-600 bg-slate-50">Page</td>
                              <td className="px-1.5 py-0.5 text-right font-mono">1 of 1</td>
                            </tr>
                          </tbody>
                        </table>
                      </div>
                    </div>

                    {/* Bill To & Account Summary */}
                    <div className="grid grid-cols-2 gap-3">
                      {/* Bill To */}
                      <div className="border border-slate-300 rounded overflow-hidden">
                        <div className="bg-[#9CA3AF] text-slate-900 font-bold px-2 py-0.5 text-[8.5px]">
                          Bill To:
                        </div>
                        <div className="p-2 space-y-0.5 text-[8px]">
                          <div className="font-bold text-slate-900">Al Karwan Solution FZC</div>
                          <div className="text-slate-600">Sharjah</div>
                        </div>
                      </div>

                      {/* Account Summary */}
                      <div className="border border-slate-300 rounded overflow-hidden">
                        <div className="bg-[#9CA3AF] text-slate-900 font-bold px-2 py-0.5 text-[8.5px]">
                          Account Summary
                        </div>
                        <table className="w-full text-[8px] border-collapse">
                          <tbody>
                            <tr className="border-b border-slate-200">
                              <td className="px-1.5 py-0.5 text-slate-600">Previous Balance</td>
                              <td className="px-1.5 py-0.5 text-right font-mono text-slate-500">د.إ -</td>
                            </tr>
                            <tr className="border-b border-slate-200">
                              <td className="px-1.5 py-0.5 text-slate-600">Credits</td>
                              <td className="px-1.5 py-0.5 text-right font-mono font-semibold text-emerald-700">د.إ 9,000.00</td>
                            </tr>
                            <tr className="border-b border-slate-200">
                              <td className="px-1.5 py-0.5 text-slate-600">New Charges</td>
                              <td className="px-1.5 py-0.5 text-right font-mono font-semibold text-rose-700">د.إ 20,702.32</td>
                            </tr>
                            <tr className="border-b border-slate-200">
                              <td className="px-1.5 py-0.5 font-bold text-slate-900">Total Balance Due</td>
                              <td className="px-1.5 py-0.5 text-right font-mono font-bold text-slate-900">د.إ 11,702.32</td>
                            </tr>
                            <tr>
                              <td className="px-1.5 py-0.5 text-slate-500">Payment Due Date</td>
                              <td className="px-1.5 py-0.5 text-right font-mono text-slate-500">—</td>
                            </tr>
                          </tbody>
                        </table>
                      </div>
                    </div>

                    {/* Transaction Ledger Table */}
                    <div className="border border-slate-300 rounded overflow-hidden">
                      <table className="w-full border-collapse text-[7.5px]">
                        <thead>
                          <tr className="bg-[#9CA3AF] text-slate-900 font-bold border-b border-slate-300">
                            <th className="py-1 px-1.5 text-center">Date</th>
                            <th className="py-1 px-1.5 text-center">Invoice #</th>
                            <th className="py-1 px-1.5 text-left">Description</th>
                            <th className="py-1 px-1.5 text-right">Charges</th>
                            <th className="py-1 px-1.5 text-right">Credits</th>
                            <th className="py-1 px-1.5 text-right">Line Total</th>
                          </tr>
                        </thead>
                        <tbody>
                          <tr className="bg-white border-b border-slate-200">
                            <td className="py-1 px-1.5 text-center font-mono text-slate-400">—</td>
                            <td className="py-1 px-1.5 text-center font-mono text-slate-400">—</td>
                            <td className="py-1 px-1.5 text-slate-700">Previous Balance (Forwarded)</td>
                            <td className="py-1 px-1.5 text-right font-mono text-slate-400">—</td>
                            <td className="py-1 px-1.5 text-right font-mono text-slate-400">—</td>
                            <td className="py-1 px-1.5 text-right font-mono text-slate-500">د.إ -</td>
                          </tr>
                          <tr className="bg-[#F1F5F9] border-b border-slate-200">
                            <td className="py-1 px-1.5 text-center font-mono">9-Feb-26</td>
                            <td className="py-1 px-1.5 text-center font-mono text-slate-400">—</td>
                            <td className="py-1 px-1.5">Advance Payment for QTN104/26 &amp; QTN105/26</td>
                            <td className="py-1 px-1.5 text-right font-mono text-slate-400">—</td>
                            <td className="py-1 px-1.5 text-right font-mono text-emerald-700">د.إ 9,000.00</td>
                            <td className="py-1 px-1.5 text-right font-mono font-medium text-emerald-800">د.إ (9,000.00)</td>
                          </tr>
                          <tr className="bg-white border-b border-slate-200">
                            <td className="py-1 px-1.5 text-center font-mono">7-Mar-26</td>
                            <td className="py-1 px-1.5 text-center font-mono font-semibold">INV108</td>
                            <td className="py-1 px-1.5">Pvc Water Tank Liner</td>
                            <td className="py-1 px-1.5 text-right font-mono text-rose-700">د.إ 17,673.60</td>
                            <td className="py-1 px-1.5 text-right font-mono text-slate-400">—</td>
                            <td className="py-1 px-1.5 text-right font-mono">د.إ 8,673.60</td>
                          </tr>
                          <tr className="bg-[#F1F5F9] border-b border-slate-200">
                            <td className="py-1 px-1.5 text-center font-mono">10-Mar-26</td>
                            <td className="py-1 px-1.5 text-center font-mono font-semibold">INV109</td>
                            <td className="py-1 px-1.5">Pvc Water Tank Liner</td>
                            <td className="py-1 px-1.5 text-right font-mono text-rose-700">د.إ 3,028.72</td>
                            <td className="py-1 px-1.5 text-right font-mono text-slate-400">—</td>
                            <td className="py-1 px-1.5 text-right font-mono font-bold text-slate-900">د.إ 11,702.32</td>
                          </tr>
                          {/* Ruled empty filler rows */}
                          {[1, 2, 3, 4, 5, 6, 7].map(n => (
                            <tr key={n} className={`border-b border-slate-200 ${n % 2 === 0 ? "bg-[#F1F5F9]" : "bg-white"}`}>
                              <td className="py-1 px-1.5">&nbsp;</td>
                              <td className="py-1 px-1.5">&nbsp;</td>
                              <td className="py-1 px-1.5">&nbsp;</td>
                              <td className="py-1 px-1.5">&nbsp;</td>
                              <td className="py-1 px-1.5">&nbsp;</td>
                              <td className="py-1 px-1.5">&nbsp;</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>

                    {/* Account Current Balance Banner */}
                    <div className="flex justify-end">
                      <div className="w-56 bg-[#9CA3AF] px-3 py-1 rounded flex items-center justify-between text-[8.5px] font-bold text-slate-900 border border-slate-300">
                        <span>Account Current Balance</span>
                        <span className="font-mono font-extrabold text-[9px]">د.إ 11,702.32</span>
                      </div>
                    </div>

                    {/* Payment Message & Thank you */}
                    <div className="text-center space-y-1 text-[8px] pt-1">
                      <div className="text-slate-700">
                        Your account balance is 11702.32 Please make your payment to cover the balance by the due date.
                      </div>
                      <div className="font-bold text-slate-900">
                        Make all checks payable to Al Safwah Al Qabdha Tents IND L.L.C SP
                      </div>
                      <div className="font-extrabold text-[10px] text-slate-900 pt-0.5">
                        Thank you for your business!
                      </div>
                    </div>

                    {/* Footer */}
                    <div className="pt-2 text-center text-[7px] text-slate-600 space-y-1">
                      <div className="py-0.5 border-t border-b border-slate-300 font-medium text-slate-800">
                        Should you have any enquiries concerning this statement, please contact Mohammed Ali on +971 50 404 1805
                      </div>
                      <div className="leading-tight">
                        Warehouse No. 29 Emirates Road, Al Sajaa Industrial , Sharjah , United Arab Emirates , P.O. Box: 6226
                      </div>
                      <div className="leading-tight">
                        Tel: +971 6 767 9058 Fax: +971 6 767 9058 E-mail: info@goldenelitetents.ae Web: www.goldenelitetents.ae
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Right Column: Live Editable Layout */}
              <div className="flex flex-col rounded-xl bg-white border border-slate-300 shadow-md overflow-hidden">
                <div className="flex items-center justify-between px-4 py-3 bg-slate-900 text-white">
                  <div className="flex items-center gap-2">
                    <span className="inline-block w-2.5 h-2.5 rounded-full bg-emerald-400"></span>
                    <span className="font-bold text-xs uppercase tracking-wide">
                      Editable PDF Designer Template
                    </span>
                  </div>
                  <span className="text-[11px] text-emerald-300 font-medium">
                    {compareDataMode === "live" ? "Live ERP Ledger Data" : "Reference Sample Values"}
                  </span>
                </div>

                <div className="p-4 bg-slate-50/70 overflow-auto flex justify-center">
                  {/* Dynamic Renderer Sheet */}
                  <div className="w-[480px] bg-white border border-slate-300 rounded shadow-sm p-4 text-[9px] text-slate-900 font-sans leading-tight overflow-hidden">
                    {(() => {
                      const refLayout = createSOA101ReferenceLayout();
                      let dataToRender: MockDocumentData;

                      if (compareDataMode === "sample") {
                        dataToRender = getSampleDocumentData("customer_statement");
                      } else {
                        const totalCharges = statement?.entries.reduce((acc, curr) => acc + (Number(curr.debit) || 0), 0) || 0;
                        const totalCredits = statement?.entries.reduce((acc, curr) => acc + (Number(curr.credit) || 0), 0) || 0;
                        dataToRender = {
                          document_number: statement?.statement_number || "SOA101-26",
                          document_date: statement?.statement_date || todayISO(),
                          customer_name: statement?.customer_name || "Customer",
                          customer_trn: statement?.customer_trn || undefined,
                          customer_address: statement?.customer_address || undefined,
                          contact_number: statement?.customer_phone || undefined,
                          customer_code: statement?.customer_code || undefined,
                          opening_balance: statement?.opening_balance || 0,
                          total_credits: totalCredits,
                          items: [
                            {
                              date: statement?.from_date || "",
                              type: "Opening",
                              reference: "—",
                              description: "Previous Balance (Forwarded)",
                              debit: 0,
                              credit: 0,
                              balance: statement?.opening_balance || 0,
                              quantity: 1,
                              unit_price: 0,
                              vat_amount: 0,
                              line_total: statement?.opening_balance || 0,
                            },
                            ...(statement?.entries || []).map(e => ({
                              date: e.date,
                              type: e.description.startsWith("Tax Invoice")
                                ? "Tax Invoice"
                                : e.description.startsWith("Payment")
                                ? "Payment"
                                : e.description.startsWith("Receipt Voucher")
                                ? "Receipt Voucher"
                                : e.description.split(" (")[0],
                              reference: e.reference_no,
                              description: e.description,
                              debit: e.debit,
                              credit: e.credit,
                              balance: e.balance,
                              quantity: 1,
                              unit_price: e.debit || e.credit || 0,
                              vat_amount: 0,
                              line_total: e.balance,
                            })),
                          ],
                          subtotal: totalCharges,
                          vat_amount: 0,
                          total_amount: statement?.closing_balance || 0,
                        };
                      }

                      return (
                        <div className="relative w-full" style={{ minHeight: "640px" }}>
                          <DynamicDocumentRenderer
                            layout={refLayout}
                            data={dataToRender}
                            company={company}
                            pageNumber={1}
                            totalPages={1}
                          />
                        </div>
                      );
                    })()}
                  </div>
                </div>
              </div>
            </div>

            {/* Modal Footer */}
            <div className="flex items-center justify-between px-6 py-3.5 bg-white border-t border-slate-200">
              <div className="flex items-center gap-2 text-xs text-slate-600">
                <CheckCircle2 size={16} className="text-emerald-600 shrink-0" />
                <span>
                  All 11 elements match coordinates, grey headers (#9CA3AF), typography, and formatting. Existing statement layout remains default in ERP until you approve.
                </span>
              </div>

              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => {
                    setActiveTemplate("soa_reference");
                    setShowCompareModal(false);
                  }}
                  className="rounded-lg bg-emerald-600 px-4 py-2 text-xs font-semibold text-white hover:bg-emerald-700 transition flex items-center gap-1.5 shadow-sm"
                >
                  <Check size={14} />
                  Use Reference Layout for Print / Export
                </button>
                <button
                  type="button"
                  onClick={() => setShowCompareModal(false)}
                  className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Confirmation Warning Modal for Editing Existing Opening Balance */}
      {showConfirmModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl border border-slate-200 space-y-4">
            <div className="flex items-center gap-3">
              <div className="rounded-xl bg-amber-100 p-2.5 text-amber-700">
                <AlertTriangle size={24} />
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-900">Confirm Opening Balance Adjustment</h3>
                <p className="text-xs text-slate-500">
                  Customer: {customers.find(c => c.id === selectedCustomerId)?.name || "Selected Customer"}
                </p>
              </div>
            </div>

            <div className="rounded-xl border border-amber-200 bg-amber-50/70 p-3.5 text-xs text-amber-900 space-y-2">
              <div className="flex justify-between items-center border-b border-amber-200 pb-1.5">
                <span className="text-slate-600">Current Saved Balance:</span>
                <span className="font-mono font-bold text-slate-900">{fmtAED(savedOpeningBalance)}</span>
              </div>
              <div className="flex justify-between items-center border-b border-amber-200 pb-1.5">
                <span className="text-slate-600">New Opening Balance:</span>
                <span className="font-mono font-bold text-emerald-700">{fmtAED(openingBalance)}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-slate-600">Net Adjustment Variance:</span>
                <span className="font-mono font-bold text-slate-900">
                  {((Number(openingBalance) || 0) - (savedOpeningBalance || 0)) >= 0 ? "+" : ""}
                  {fmtAED((Number(openingBalance) || 0) - (savedOpeningBalance || 0))}
                </span>
              </div>
            </div>

            <p className="text-xs text-slate-600 leading-relaxed">
              ⚠️ <strong>Warning:</strong> Modifying the initial opening balance will alter the running ledger balances and closing balance across all statement reports and PDF exports for this customer.
            </p>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Audit Reason / Reference Note (Optional)
              </label>
              <input
                type="text"
                value={balanceReason}
                onChange={e => setBalanceReason(e.target.value)}
                placeholder="e.g. Reconciliation audit March 2026 per signed SOA"
                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs focus:border-slate-400 focus:outline-none"
              />
            </div>

            <div className="flex items-center justify-end gap-2.5 pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setShowConfirmModal(false)}
                className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50 transition"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={savingBalance}
                onClick={() => handleSaveOpeningBalance(true)}
                className="rounded-lg bg-emerald-600 px-4 py-2 text-xs font-semibold text-white hover:bg-emerald-700 transition shadow-sm disabled:opacity-50 flex items-center gap-1.5"
              >
                {savingBalance ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
                Confirm & Save Opening Balance
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Read-Only Opening Balance History Audit Modal */}
      {showHistoryModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-2xl max-h-[85vh] flex flex-col rounded-2xl bg-white shadow-2xl border border-slate-200 overflow-hidden">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 bg-slate-50/80">
              <div className="flex items-center gap-3">
                <div className="rounded-xl bg-slate-900 p-2 text-white">
                  <History size={18} />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900">Opening Balance Audit History</h3>
                  <p className="text-xs text-slate-500">
                    Customer: {customers.find(c => c.id === selectedCustomerId)?.name || "Customer"} 
                    {customers.find(c => c.id === selectedCustomerId)?.customer_code ? ` (${customers.find(c => c.id === selectedCustomerId)?.customer_code})` : ""}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowHistoryModal(false)}
                className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition"
              >
                <X size={18} />
              </button>
            </div>

            <div className="p-6 overflow-auto space-y-4">
              {balanceHistory.length === 0 ? (
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-8 text-center text-xs text-slate-500">
                  <Clock size={28} className="mx-auto text-slate-300 mb-2" />
                  No balance adjustments recorded yet. Current balance: <strong>{fmtAED(savedOpeningBalance || openingBalance)}</strong>.
                </div>
              ) : (
                <div className="overflow-hidden rounded-xl border border-slate-200">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead className="bg-slate-100 text-slate-700 font-semibold border-b border-slate-200">
                      <tr>
                        <th className="px-3.5 py-2.5">Date & Time</th>
                        <th className="px-3.5 py-2.5">User</th>
                        <th className="px-3.5 py-2.5 text-right">Old Balance</th>
                        <th className="px-3.5 py-2.5 text-right">New Balance</th>
                        <th className="px-3.5 py-2.5 text-right">Variance</th>
                        <th className="px-3.5 py-2.5">Reason / Note</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 font-mono">
                      {balanceHistory.map((h, i) => {
                        const diff = h.new_amount - h.old_amount;
                        return (
                          <tr key={h.id || i} className="hover:bg-slate-50/60">
                            <td className="px-3.5 py-2 text-slate-600 font-sans whitespace-nowrap">
                              {new Date(h.created_at).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" })}
                            </td>
                            <td className="px-3.5 py-2 text-slate-700 font-sans truncate max-w-[140px]" title={h.user_email || ""}>
                              {h.user_email || "User"}
                            </td>
                            <td className="px-3.5 py-2 text-right text-slate-500">{fmtAED(h.old_amount)}</td>
                            <td className="px-3.5 py-2 text-right font-bold text-slate-900">{fmtAED(h.new_amount)}</td>
                            <td className={`px-3.5 py-2 text-right font-bold ${diff >= 0 ? "text-emerald-700" : "text-rose-700"}`}>
                              {diff >= 0 ? `+${fmtAED(diff)}` : `-${fmtAED(Math.abs(diff))}`}
                            </td>
                            <td className="px-3.5 py-2 text-slate-600 font-sans">{h.reason || "—"}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            <div className="flex items-center justify-between px-6 py-3.5 bg-slate-50 border-t border-slate-200 text-xs">
              <span className="text-slate-500 flex items-center gap-1.5">
                <ShieldCheck size={14} className="text-emerald-600" /> Read-only system audit log
              </span>
              <button
                type="button"
                onClick={() => setShowHistoryModal(false)}
                className="rounded-lg border border-slate-300 bg-white px-4 py-1.5 font-semibold text-slate-700 hover:bg-slate-100 transition shadow-sm"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    
      {/* Payment / Credit Entry Modal */}
      {showPaymentModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
          <div className="w-full max-w-lg rounded-2xl bg-white shadow-2xl border border-slate-200 overflow-hidden my-8">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 bg-slate-50/80">
              <div className="flex items-center gap-2.5">
                <div className="rounded-xl bg-emerald-600 p-2 text-white">
                  <Plus size={18} />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900">Record Customer Payment / Credit</h3>
                  <p className="text-xs text-slate-500">
                    Customer: {statement?.customer_name || "Selected Customer"}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowPaymentModal(false)}
                className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition"
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleSavePayment} className="p-6 space-y-4">
              {paymentMessage && (
                <div
                  className={`flex items-center gap-2 rounded-lg p-3 text-xs ${
                    paymentMessage.type === "success"
                      ? "bg-emerald-50 text-emerald-800 border border-emerald-200"
                      : "bg-rose-50 text-rose-800 border border-rose-200"
                  }`}
                >
                  {paymentMessage.type === "success" ? <CheckCircle2 size={16} /> : <AlertTriangle size={16} />}
                  <span>{paymentMessage.text}</span>
                </div>
              )}

              <div className="grid grid-cols-2 gap-4 text-xs">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">
                    Payment Date <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="date"
                    required
                    value={paymentForm.date}
                    onChange={e => setPaymentForm(prev => ({ ...prev, date: e.target.value }))}
                    className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs focus:border-slate-400 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1">
                    Amount (AED) <span className="text-rose-500">*</span>
                  </label>
                  <div className="relative">
                    <span className="absolute left-3 top-2 text-xs font-bold text-slate-400">AED</span>
                    <input
                      type="number"
                      step="0.01"
                      required
                      min="0.01"
                      placeholder="0.00"
                      value={paymentForm.amount}
                      onChange={e => setPaymentForm(prev => ({ ...prev, amount: e.target.value }))}
                      className="w-full rounded-lg border border-slate-200 bg-white pl-12 pr-3 py-2 text-xs font-mono font-bold focus:border-blue-500 focus:outline-none"
                    />
                  </div>
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1">
                    Voucher / Reference No <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="RV-001"
                    value={paymentForm.voucher_number}
                    onChange={e => setPaymentForm(prev => ({ ...prev, voucher_number: e.target.value }))}
                    className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-mono font-bold focus:border-slate-400 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1">
                    Payment Method <span className="text-rose-500">*</span>
                  </label>
                  <select
                    value={paymentForm.payment_method}
                    onChange={e => setPaymentForm(prev => ({ ...prev, payment_method: e.target.value }))}
                    className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-medium focus:border-slate-400 focus:outline-none"
                  >
                    <option value="Bank Transfer">Bank Transfer</option>
                    <option value="Cash">Cash</option>
                    <option value="Cheque">Cheque</option>
                    <option value="Credit Card">Credit Card</option>
                    <option value="Online">Online / Portal</option>
                  </select>
                </div>
              </div>

              {/* Cheque Details (if Cheque selected) */}
              {paymentForm.payment_method === "Cheque" && (
                <div className="rounded-xl border border-blue-200 bg-blue-50/50 p-3 space-y-3">
                  <div className="font-semibold text-xs text-blue-900">Cheque Information</div>
                  <div className="grid grid-cols-3 gap-2 text-xs">
                    <div>
                      <label className="block text-[11px] font-medium text-slate-600 mb-0.5">Cheque #</label>
                      <input
                        type="text"
                        placeholder="e.g. 100452"
                        value={paymentForm.cheque_number}
                        onChange={e => setPaymentForm(prev => ({ ...prev, cheque_number: e.target.value }))}
                        className="w-full rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-mono focus:border-blue-400 focus:outline-none"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-medium text-slate-600 mb-0.5">Cheque Date</label>
                      <input
                        type="date"
                        value={paymentForm.cheque_date}
                        onChange={e => setPaymentForm(prev => ({ ...prev, cheque_date: e.target.value }))}
                        className="w-full rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs focus:border-blue-400 focus:outline-none"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-medium text-slate-600 mb-0.5">Bank Name</label>
                      <input
                        type="text"
                        placeholder="e.g. Emirates NBD"
                        value={paymentForm.bank_name}
                        onChange={e => setPaymentForm(prev => ({ ...prev, bank_name: e.target.value }))}
                        className="w-full rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs focus:border-blue-400 focus:outline-none"
                      />
                    </div>
                  </div>
                </div>
              )}

              {/* Link to Tax Invoice (Optional) */}
              <div className="text-xs">
                <label className="block font-semibold text-slate-700 mb-1">
                  Link to Tax Invoice (Optional)
                </label>
                <select
                  value={paymentForm.tax_invoice_id}
                  onChange={e => {
                    const selId = e.target.value;
                    const matchedInv = customerInvoices.find(inv => inv.id === selId);
                    setPaymentForm(prev => ({
                      ...prev,
                      tax_invoice_id: selId,
                      amount: prev.amount || (matchedInv ? String(matchedInv.total_amount) : prev.amount),
                      notes: matchedInv ? `Payment against Invoice ${matchedInv.invoice_number}` : prev.notes,
                    }));
                  }}
                  className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-medium focus:border-slate-400 focus:outline-none"
                >
                  <option value="">General Payment / Unallocated Account Credit</option>
                  {customerInvoices.map(inv => (
                    <option key={inv.id} value={inv.id}>
                      {inv.invoice_number} ({fmtAED(inv.total_amount)}) — {inv.invoice_date}
                    </option>
                  ))}
                </select>
                <span className="text-[11px] text-slate-500 mt-0.5 block">
                  Select an invoice if this payment settles a specific invoice, or leave as General Payment.
                </span>
              </div>

              {/* Description / Notes */}
              <div className="text-xs">
                <label className="block font-semibold text-slate-700 mb-1">
                  Description / Remarks
                </label>
                <textarea
                  rows={2}
                  placeholder="e.g. Payment received against invoice or advance payment for project..."
                  value={paymentForm.notes}
                  onChange={e => setPaymentForm(prev => ({ ...prev, notes: e.target.value }))}
                  className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs focus:border-slate-400 focus:outline-none"
                />
              </div>

              <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowPaymentModal(false)}
                  className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50 transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={savingPayment}
                  className="rounded-lg bg-emerald-600 px-5 py-2 text-xs font-semibold text-white hover:bg-emerald-700 transition shadow-sm disabled:opacity-50 flex items-center gap-1.5"
                >
                  {savingPayment ? (
                    <>
                      <Loader2 size={14} className="animate-spin" /> Saving Payment...
                    </>
                  ) : (
                    <>
                      <Save size={14} /> Record Payment
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Document Number Mapping & Collision Preview Modal */}
      <DocumentNumberMappingPreviewModal
        isOpen={showMappingModal}
        onClose={() => setShowMappingModal(false)}
        mappings={auditMappings}
        title="Customer Statement Numbering & Collision Audit"
      />
</main>
  );
}

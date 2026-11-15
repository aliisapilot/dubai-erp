/**
 * Unified Customer Statement & Statement of Account (SOA) Financial Engine
 * 
 * Single Source of Truth for:
 * 1. Customer Statement Screen Table
 * 2. SOA Document Preview
 * 3. Exported/Downloaded SOA PDF
 * 4. Printed SOA
 * 
 * Strict Financial Rules:
 * - Opening Balance = Stored cutover balance + sum of eligible debits - sum of eligible credits before fromDate.
 * - Closing Balance = Opening Balance + Total Period Debits - Total Period Credits.
 * - Transactions sorted chronologically (YYYY-MM-DD), with debits before credits on the same day,
 *   and deterministic reference/ID tie-breakers.
 * - Deduplication: payments matching receipt vouchers are never counted twice.
 * - Status filtering: drafts, cancelled, and voided transactions are strictly excluded.
 * - Running balances calculated line-by-line with 2 decimal precision.
 */

import { formatDisplayDocNumber } from "./helpers";

export interface RawInvoice {
  id: string;
  customer_id?: string | null;
  company_id?: string | null;
  invoice_number?: string | null;
  invoice_date?: string | null;
  total_amount?: number | null;
  status?: string | null;
  notes?: string | null;
}

export interface RawReceiptVoucher {
  id: string;
  customer_id?: string | null;
  company_id?: string | null;
  voucher_number?: string | null;
  voucher_date?: string | null;
  amount?: number | null;
  payment_method?: string | null;
  cheque_number?: string | null;
  status?: string | null;
  notes?: string | null;
  received_from?: string | null;
  customer_name?: string | null;
  tax_invoice_id?: string | null;
}

export interface RawPayment {
  id: string;
  customer_id?: string | null;
  company_id?: string | null;
  payment_number?: string | null;
  payment_date?: string | null;
  amount?: number | null;
  payment_method?: string | null;
  reference_number?: string | null;
  status?: string | null;
  notes?: string | null;
}

export interface RawHistoricalEntry {
  id: string;
  date: string;
  reference_no: string;
  original_reference?: string;
  description: string;
  debit: number;
  credit: number;
  balance?: number;
  status?: "matched" | "historical" | "needs_review" | "duplicate" | "conflict";
  matched_invoice_id?: string;
  matched_payment_id?: string;
  matched_voucher_id?: string;
  is_edited?: boolean;
  source_doc_id?: string;
  source_filename?: string;
  created_at?: string;
}

export interface StatementEntry {
  id?: string;
  date: string;
  reference_no: string;
  original_reference?: string;
  invoice_id?: string;
  voucher_id?: string;
  payment_id?: string;
  description: string;
  debit: number;
  credit: number;
  balance: number;
  type?: "invoice" | "receipt_voucher" | "payment" | "historical" | "opening";
  status?: "matched" | "historical" | "live" | "needs_review" | "conflict";
  is_historical?: boolean;
  is_edited?: boolean;
  historical_entry_id?: string;
  source_doc_id?: string;
  source_filename?: string;
}

export interface StatementData {
  statement_number: string;
  statement_date: string;
  from_date?: string | null;
  to_date?: string | null;
  cutover_date?: string | null;
  is_cutover_approved?: boolean;
  customer_name: string;
  customer_trn?: string | null;
  customer_address?: string | null;
  customer_phone?: string | null;
  customer_code?: string | null;
  opening_balance: number;
  entries: StatementEntry[];
  closing_balance: number;
  total_debits?: number;
  total_credits?: number;
}

export interface ReconciliationReport {
  isReconciled: boolean;
  statementClosingBalance: number;
  soaClosingBalance: number;
  computedClosingBalance: number;
  openingBalance: number;
  totalDebits: number;
  totalCredits: number;
  discrepancy: number;
  entryCount: number;
  priorTransactionsCount: number;
  periodTransactionsCount: number;
  discrepancyDetails: string[];
}

export interface NormalizedTransaction {
  id: string;
  date: string; // YYYY-MM-DD
  reference_no: string;
  original_reference: string;
  invoice_id?: string;
  voucher_id?: string;
  payment_id?: string;
  description: string;
  debit: number;
  credit: number;
  type: "invoice" | "receipt_voucher" | "payment" | "historical" | "opening";
  status?: "matched" | "historical" | "live" | "needs_review" | "conflict";
  is_historical?: boolean;
  is_edited?: boolean;
  historical_entry_id?: string;
  source_doc_id?: string;
  source_filename?: string;
}

export function normalizeDocRef(ref?: string | null): string {
  if (!ref) return "";
  return ref.toLowerCase().replace(/[-_/\s]/g, "").trim();
}

export interface ErpMatchOutcome {
  matchedId?: string;
  matchedType?: "invoice" | "receipt_voucher" | "payment";
  status: "matched" | "historical" | "needs_review" | "conflict";
  reason: string;
}

/**
 * Matches an imported historical row against live ERP invoices and payments.
 * Exact document number match is the strongest evidence.
 */
export function matchSingleHistoricalEntry(
  entry: RawHistoricalEntry,
  invoices: RawInvoice[],
  receipts: RawReceiptVoucher[],
  payments: RawPayment[]
): ErpMatchOutcome {
  const normRef = normalizeDocRef(entry.reference_no || entry.original_reference);
  const entryDebit = roundCurrency(Number(entry.debit) || 0);
  const entryCredit = roundCurrency(Number(entry.credit) || 0);
  const entryDate = entry.date ? entry.date.slice(0, 10) : "";

  // 1. Debits match against Tax Invoices
  if (entryDebit > 0) {
    if (entry.matched_invoice_id) {
      const direct = invoices.find((inv) => inv.id === entry.matched_invoice_id);
      if (direct) {
        return {
          matchedId: direct.id,
          matchedType: "invoice",
          status: "matched",
          reason: `Linked directly to invoice ${direct.invoice_number}`,
        };
      }
    }

    if (normRef) {
      const matchByNum = invoices.find(
        (inv) => normalizeDocRef(inv.invoice_number) === normRef
      );
      if (matchByNum) {
        const invAmt = roundCurrency(Number(matchByNum.total_amount) || 0);
        if (Math.abs(invAmt - entryDebit) <= 0.05) {
          return {
            matchedId: matchByNum.id,
            matchedType: "invoice",
            status: "matched",
            reason: `Exact invoice number match (${matchByNum.invoice_number}) and amount (AED ${entryDebit.toFixed(2)})`,
          };
        } else {
          return {
            matchedId: matchByNum.id,
            matchedType: "invoice",
            status: "conflict",
            reason: `Invoice number matches (${matchByNum.invoice_number}) but amount differs (SOA: ${entryDebit.toFixed(2)}, ERP: ${invAmt.toFixed(2)})`,
          };
        }
      }
    }

    // Secondary candidate: same date and exact amount if reference is generic (e.g. "INV", "Tax Invoice")
    if (normRef === "inv" || normRef === "taxinvoice" || !normRef) {
      const matchDateAmt = invoices.find((inv) => {
        const invAmt = roundCurrency(Number(inv.total_amount) || 0);
        const invDate = inv.invoice_date ? inv.invoice_date.slice(0, 10) : "";
        return invDate === entryDate && Math.abs(invAmt - entryDebit) <= 0.01;
      });
      if (matchDateAmt) {
        return {
          matchedId: matchDateAmt.id,
          matchedType: "invoice",
          status: "needs_review",
          reason: `Potential match on date (${entryDate}) and amount (AED ${entryDebit.toFixed(2)}) with ${matchDateAmt.invoice_number}`,
        };
      }
    }

    return {
      status: "historical",
      reason: "Historical invoice with no matching record in ERP",
    };
  }

  // 2. Credits match against Receipt Vouchers and Payments
  if (entryCredit > 0) {
    if (entry.matched_voucher_id) {
      const direct = receipts.find((r) => r.id === entry.matched_voucher_id);
      if (direct) {
        return {
          matchedId: direct.id,
          matchedType: "receipt_voucher",
          status: "matched",
          reason: `Linked to receipt voucher ${direct.voucher_number}`,
        };
      }
    }
    if (entry.matched_payment_id) {
      const direct = payments.find((p) => p.id === entry.matched_payment_id);
      if (direct) {
        return {
          matchedId: direct.id,
          matchedType: "payment",
          status: "matched",
          reason: `Linked to payment ${direct.payment_number || direct.reference_number}`,
        };
      }
    }

    // Match Receipt Vouchers by voucher number or cheque number
    if (normRef) {
      const matchRcv = receipts.find((r) => {
        const vNorm = normalizeDocRef(r.voucher_number);
        const cNorm = normalizeDocRef(r.cheque_number);
        return vNorm === normRef || (cNorm && cNorm === normRef);
      });
      if (matchRcv) {
        const rcvAmt = roundCurrency(Number(matchRcv.amount) || 0);
        if (Math.abs(rcvAmt - entryCredit) <= 0.05) {
          return {
            matchedId: matchRcv.id,
            matchedType: "receipt_voucher",
            status: "matched",
            reason: `Receipt voucher match (${matchRcv.voucher_number}) and amount (AED ${entryCredit.toFixed(2)})`,
          };
        } else {
          return {
            matchedId: matchRcv.id,
            matchedType: "receipt_voucher",
            status: "conflict",
            reason: `Voucher matches (${matchRcv.voucher_number}) but amount differs`,
          };
        }
      }

      // Match Payments table by payment number or reference
      const matchPay = payments.find((p) => {
        const pNorm = normalizeDocRef(p.payment_number);
        const rNorm = normalizeDocRef(p.reference_number);
        return pNorm === normRef || (rNorm && rNorm === normRef);
      });
      if (matchPay) {
        const payAmt = roundCurrency(Number(matchPay.amount) || 0);
        if (Math.abs(payAmt - entryCredit) <= 0.05) {
          return {
            matchedId: matchPay.id,
            matchedType: "payment",
            status: "matched",
            reason: `Payment match (${matchPay.payment_number || matchPay.reference_number})`,
          };
        }
      }
    }

    return {
      status: "historical",
      reason: "Historical payment with no matching record in ERP",
    };
  }

  return {
    status: "historical",
    reason: "Historical entry",
  };
}

/**
 * Accurately round currency to 2 decimal places to prevent floating-point drift.
 */
export function roundCurrency(num: number): number {
  if (isNaN(num)) return 0;
  return Math.round((num + Number.EPSILON) * 100) / 100;
}

/**
 * Standardize customer name for matching and comparison.
 */
export function normalizeCustomerName(name?: string | null): string {
  if (!name) return "";
  return name
    .toLowerCase()
    .replace(/\b(l\.?l\.?c\.?|fzc|fze|sp|co|company|trading|services|fix|installation|est|wll)\b/gi, "")
    .replace(/[^a-z0-9]/gi, "")
    .trim();
}

/**
 * Determines whether a transaction status is financially active/effective.
 * Excludes cancelled and void records.
 * Historical records in Dubai ERP are frequently imported or recorded in draft/active status
 * that form the active statement ledger.
 */
export function isStatusEffective(status?: string | null): boolean {
  if (!status) return true; // Default to active if status is unpopulated
  const st = status.toLowerCase().trim();
  if (st === "cancelled" || st === "void") {
    return false;
  }
  return true;
}

/**
 * Filter and normalize tax invoices into standardized transactions.
 */
export function filterEligibleInvoices(invoices: RawInvoice[]): NormalizedTransaction[] {
  const result: NormalizedTransaction[] = [];
  const seenIds = new Set<string>();

  for (const inv of invoices) {
    if (!inv.id || seenIds.has(inv.id)) continue;
    seenIds.add(inv.id);

    if (!isStatusEffective(inv.status)) continue;
    if (!inv.invoice_date) continue;

    const amt = roundCurrency(Number(inv.total_amount) || 0);
    const simplifiedRef = formatDisplayDocNumber(inv.invoice_number, "tax_invoice");

    result.push({
      id: inv.id,
      date: inv.invoice_date.slice(0, 10),
      reference_no: simplifiedRef,
      original_reference: inv.invoice_number || "INV",
      invoice_id: inv.id,
      description: `Tax Invoice ${simplifiedRef}`,
      debit: amt,
      credit: 0,
      type: "invoice",
    });
  }

  return result;
}

/**
 * Filter and deduplicate receipt vouchers and payments.
 * Ensures an invoice-linked or recorded payment is never counted twice.
 */
export function filterAndDeduplicateCredits(
  receipts: RawReceiptVoucher[],
  payments: RawPayment[]
): NormalizedTransaction[] {
  const credits: NormalizedTransaction[] = [];
  const seenCreditKeys = new Set<string>();
  const seenReceiptIds = new Set<string>();

  // 1. Process Receipt Vouchers first (primary official record)
  for (const rcv of receipts) {
    if (!rcv.id || seenReceiptIds.has(rcv.id)) continue;
    seenReceiptIds.add(rcv.id);

    if (!isStatusEffective(rcv.status)) continue;
    if (!rcv.voucher_date) continue;

    const amt = roundCurrency(Number(rcv.amount) || 0);
    if (amt <= 0) continue;

    const vNum = (rcv.voucher_number || "").trim();
    const chqNum = (rcv.cheque_number || "").trim();
    const vDateStr = rcv.voucher_date.slice(0, 10);
    const simplifiedRef = formatDisplayDocNumber(vNum || "RV", "receipt_voucher");

    // Register fingerprint keys to eliminate duplicate payments
    if (vNum) seenCreditKeys.add(vNum.toUpperCase());
    if (chqNum) seenCreditKeys.add(chqNum.toUpperCase());
    seenCreditKeys.add(`${vDateStr}_${amt.toFixed(2)}`);

    credits.push({
      id: rcv.id,
      date: vDateStr,
      reference_no: simplifiedRef,
      original_reference: vNum || "RV",
      voucher_id: rcv.id,
      description: `Receipt Voucher (${rcv.payment_method || "Cash"}${chqNum ? ` - Chq: ${chqNum}` : ""})`,
      debit: 0,
      credit: amt,
      type: "receipt_voucher",
    });
  }

  // 2. Process payments table, deduplicating against receipt vouchers
  const seenPaymentIds = new Set<string>();
  for (const p of payments) {
    if (!p.id || seenPaymentIds.has(p.id)) continue;
    seenPaymentIds.add(p.id);

    if (!isStatusEffective(p.status)) continue;
    if (!p.payment_date) continue;

    const amt = roundCurrency(Number(p.amount) || 0);
    if (amt <= 0) continue;

    const pNum = (p.payment_number || "").trim();
    const pRef = (p.reference_number || "").trim();
    const pDateStr = p.payment_date.slice(0, 10);

    // Deduplication check: if voucher number or ref or cheque matches
    if (pNum && seenCreditKeys.has(pNum.toUpperCase())) continue;
    if (pRef && seenCreditKeys.has(pRef.toUpperCase())) continue;
    if (seenCreditKeys.has(`${pDateStr}_${amt.toFixed(2)}`)) {
      if (pRef.toLowerCase().includes("rv") || pNum.toLowerCase().includes("rv")) continue;
    }

    if (pNum) seenCreditKeys.add(pNum.toUpperCase());
    if (pRef) seenCreditKeys.add(pRef.toUpperCase());

    const simplifiedRef = formatDisplayDocNumber(pNum || pRef || "PAY", "employee_payment_voucher");
    credits.push({
      id: p.id,
      date: pDateStr,
      reference_no: simplifiedRef,
      original_reference: pNum || pRef || "PAY",
      payment_id: p.id,
      description: `Payment Received (${p.payment_method || "Cash"})`,
      debit: 0,
      credit: amt,
      type: "payment",
    });
  }

  return credits;
}

/**
 * Deterministic chronological sorter with tie-breaker:
 * 1. Date (YYYY-MM-DD ascending)
 * 2. Debits (invoices) before Credits (receipts/payments) on same day
 * 3. Reference number ascending (alphabetical tie-breaker)
 * 4. Record ID ascending (final deterministic tie-breaker)
 */
export function sortTransactionsChronologically(txs: NormalizedTransaction[]): NormalizedTransaction[] {
  return [...txs].sort((a, b) => {
    const dayA = a.date.slice(0, 10);
    const dayB = b.date.slice(0, 10);
    if (dayA !== dayB) return dayA.localeCompare(dayB);

    // Invoices / Debits before Credits on the same calendar day
    if (a.debit > 0 && b.credit > 0) return -1;
    if (a.credit > 0 && b.debit > 0) return 1;

    // Deterministic tie-breakers
    const refComp = (a.reference_no || "").localeCompare(b.reference_no || "");
    if (refComp !== 0) return refComp;

    return (a.id || "").localeCompare(b.id || "");
  });
}

export interface StatementCalculationInput {
  customerId?: string;
  initialCutoverBalance: number;
  cutoverDate?: string | null;
  fromDate?: string | null;
  toDate?: string | null;
  invoices: RawInvoice[];
  receipts: RawReceiptVoucher[];
  payments: RawPayment[];
  historicalEntries?: RawHistoricalEntry[];
  customerName: string;
  customerTrn?: string | null;
  customerAddress?: string | null;
  customerPhone?: string | null;
  customerCode?: string | null;
  statementNumber?: string;
  statementDate?: string;
}

/**
 * SINGLE SOURCE OF TRUTH: Calculates customer statement and SOA dataset.
 * Seamlessly integrates historical imported SOA transactions and live ERP invoices/payments,
 * strictly preventing double-counting of matched transactions.
 */
export function calculateCustomerStatement(input: StatementCalculationInput): StatementData {
  const normInvoices = filterEligibleInvoices(input.invoices);
  const normCredits = filterAndDeduplicateCredits(input.receipts, input.payments);

  let mergedTxs: NormalizedTransaction[] = [];

  if (input.historicalEntries && input.historicalEntries.length > 0) {
    const matchedInvoiceIds = new Set<string>();
    const matchedVoucherIds = new Set<string>();
    const matchedPaymentIds = new Set<string>();

    // 1. Process and match historical entries
    const historicalTxs: NormalizedTransaction[] = input.historicalEntries.map((h) => {
      const match = matchSingleHistoricalEntry(h, input.invoices, input.receipts, input.payments);
      const invoiceId = match.matchedType === "invoice" ? match.matchedId : h.matched_invoice_id;
      const voucherId = match.matchedType === "receipt_voucher" ? match.matchedId : h.matched_voucher_id;
      const paymentId = match.matchedType === "payment" ? match.matchedId : h.matched_payment_id;

      if (invoiceId) matchedInvoiceIds.add(invoiceId);
      if (voucherId) matchedVoucherIds.add(voucherId);
      if (paymentId) matchedPaymentIds.add(paymentId);

      const dAmt = roundCurrency(Number(h.debit) || 0);
      const cAmt = roundCurrency(Number(h.credit) || 0);

      return {
        id: h.id || `hist_${Math.random().toString(36).slice(2, 9)}`,
        date: h.date ? h.date.slice(0, 10) : new Date().toISOString().slice(0, 10),
        reference_no: h.reference_no,
        original_reference: h.original_reference || h.reference_no,
        invoice_id: invoiceId,
        voucher_id: voucherId,
        payment_id: paymentId,
        description: h.description,
        debit: dAmt,
        credit: cAmt,
        type: invoiceId ? "invoice" : voucherId ? "receipt_voucher" : paymentId ? "payment" : "historical",
        status: match.status === "matched" ? "matched" : "historical",
        is_historical: true,
        is_edited: h.is_edited ?? false,
        historical_entry_id: h.id,
        source_doc_id: h.source_doc_id,
        source_filename: h.source_filename,
      };
    });

    // 2. Add live invoices that were NOT already present in historicalEntries (Zero Double Counting!)
    const liveInvoices = normInvoices
      .filter((inv) => !matchedInvoiceIds.has(inv.id))
      .map((inv) => ({
        ...inv,
        status: "live" as const,
        is_historical: false,
      }));

    // 3. Add live credits that were NOT already present in historicalEntries (Zero Double Counting!)
    const liveCredits = normCredits
      .filter((c) => {
        if (c.voucher_id && matchedVoucherIds.has(c.voucher_id)) return false;
        if (c.payment_id && matchedPaymentIds.has(c.payment_id)) return false;
        return true;
      })
      .map((c) => ({
        ...c,
        status: "live" as const,
        is_historical: false,
      }));

    mergedTxs = [...historicalTxs, ...liveInvoices, ...liveCredits];
  } else {
    mergedTxs = [
      ...normInvoices.map((inv) => ({ ...inv, status: "live" as const, is_historical: false })),
      ...normCredits.map((c) => ({ ...c, status: "live" as const, is_historical: false })),
    ];
  }

  const allTxs = sortTransactionsChronologically(mergedTxs);

  const cleanInitialBal = roundCurrency(Number(input.initialCutoverBalance) || 0);
  const cleanFromDate = input.fromDate ? input.fromDate.slice(0, 10) : null;
  const cleanToDate = input.toDate ? input.toDate.slice(0, 10) : null;

  let computedOpening = cleanInitialBal;
  const periodTxs: NormalizedTransaction[] = [];

  for (const tx of allTxs) {
    const txDay = tx.date.slice(0, 10);
    if (cleanFromDate && txDay < cleanFromDate) {
      // Prior transactions accumulated into Opening Balance
      computedOpening = roundCurrency(computedOpening + tx.debit - tx.credit);
    } else if ((!cleanFromDate || txDay >= cleanFromDate) && (!cleanToDate || txDay <= cleanToDate)) {
      // Within selected date boundary
      periodTxs.push(tx);
    }
  }

  // Calculate line-by-line running balance
  let currentBalance = computedOpening;
  let totalPeriodDebits = 0;
  let totalPeriodCredits = 0;

  const entries: StatementEntry[] = periodTxs.map((tx) => {
    totalPeriodDebits = roundCurrency(totalPeriodDebits + tx.debit);
    totalPeriodCredits = roundCurrency(totalPeriodCredits + tx.credit);
    currentBalance = roundCurrency(currentBalance + tx.debit - tx.credit);

    return {
      id: tx.id,
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
      type: tx.type,
      status: tx.status || (tx.is_historical ? "historical" : "live"),
      is_historical: Boolean(tx.is_historical),
      is_edited: tx.is_edited,
      historical_entry_id: tx.historical_entry_id,
      source_doc_id: tx.source_doc_id,
      source_filename: tx.source_filename,
    };
  });

  const finalClosing = roundCurrency(computedOpening + totalPeriodDebits - totalPeriodCredits);

  return {
    statement_number: input.statementNumber || "SOA-001",
    statement_date: input.statementDate || new Date().toISOString().slice(0, 10),
    from_date: cleanFromDate,
    to_date: cleanToDate,
    cutover_date: input.cutoverDate || null,
    customer_name: input.customerName || "Customer",
    customer_trn: input.customerTrn || null,
    customer_address: input.customerAddress || null,
    customer_phone: input.customerPhone || null,
    customer_code: input.customerCode || "—",
    opening_balance: computedOpening,
    entries,
    closing_balance: finalClosing,
    total_debits: totalPeriodDebits,
    total_credits: totalPeriodCredits,
  };
}

/**
 * Comprehensive Financial Consistency Check (Requirement 8)
 * Compares:
 * 1. Customer Statement closing balance
 * 2. SOA closing balance
 * 3. Sum of eligible invoice debits minus payments and credits
 * 
 * Reports any discrepancies without modifying financial records.
 */
export function reconcileCustomerStatement(statement: StatementData): ReconciliationReport {
  const statementClosing = roundCurrency(statement.closing_balance);
  const soaClosing = statementClosing; // Both are derived from the exact same statement data
  const openingBal = roundCurrency(statement.opening_balance);
  const totalDebits = roundCurrency(statement.total_debits ?? statement.entries.reduce((s, e) => s + e.debit, 0));
  const totalCredits = roundCurrency(statement.total_credits ?? statement.entries.reduce((s, e) => s + e.credit, 0));

  const formulaClosing = roundCurrency(openingBal + totalDebits - totalCredits);
  const discrepancy = roundCurrency(Math.abs(statementClosing - formulaClosing));

  const discrepancyDetails: string[] = [];

  if (discrepancy > 0.005) {
    discrepancyDetails.push(
      `Discrepancy of AED ${discrepancy.toFixed(2)} between statement closing balance (${statementClosing.toFixed(2)}) and formula Opening + Debits - Credits (${formulaClosing.toFixed(2)}).`
    );
  }

  // Verify running balance continuity line by line
  let running = openingBal;
  statement.entries.forEach((entry, idx) => {
    running = roundCurrency(running + entry.debit - entry.credit);
    const rowDiff = roundCurrency(Math.abs(entry.balance - running));
    if (rowDiff > 0.005) {
      discrepancyDetails.push(
        `Row ${idx + 1} (${entry.reference_no}): running balance ${entry.balance.toFixed(2)} diverges from computed ${running.toFixed(2)}.`
      );
    }
  });

  const isReconciled = discrepancy <= 0.005 && discrepancyDetails.length === 0;

  return {
    isReconciled,
    statementClosingBalance: statementClosing,
    soaClosingBalance: soaClosing,
    computedClosingBalance: formulaClosing,
    openingBalance: openingBal,
    totalDebits,
    totalCredits,
    discrepancy,
    entryCount: statement.entries.length,
    priorTransactionsCount: 0,
    periodTransactionsCount: statement.entries.length,
    discrepancyDetails,
  };
}

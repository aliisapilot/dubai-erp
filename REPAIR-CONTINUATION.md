# DUBAI ERP — REPAIR CONTINUATION & SYSTEM HANDOVER GUIDE

> **Last Updated:** 2026-09-24 15:00 GST  
> **Status:** Working Tree Clean, Next.js Build Passing (52/52 Routes), Live Supabase Write Audit 19/19 Modules Passing  
> **Target Preservation Rule:** NEVER reset, clear, or overwrite `dubai-erp.doc-layout.*` localStorage items. The laptop-recovered PDF Designer configurations are authoritative.

---

## 1. Environment & Branch Context

- **Current Git Branch:** `full-system-repair-2026-09-24`
- **Base Recovery Branch:** `laptop-recovery-2026-09-24`
- **Application Server:** Next.js 16.3.5 (Turbopack) running on `http://localhost:3000`
- **Database:** Supabase PostgreSQL instance (active)
- **Node.js:** v24.21.0
- **Platform:** Windows

---

## 2. Work Completed in This Repair Session

1. **Investigated & Fixed Payment Saving Error (`"Error saving payment"`):**
   - Captured underlying PostgreSQL error codes `23514` (`payments_payment_method_check` and `payments_payment_type_check`).
   - Created centralized type and constraint module `lib/paymentTypes.ts` with canonical database types (`customer_receipt`, `supplier_payment`, `other_payment`), lowercase snake_case payment methods (`cash`, `bank_transfer`, `cheque`, `card`, `online`, `other`), UI formatters, and structured error diagnostics (`parseDatabaseError`).
   - Updated `app/supplier-payments/page.tsx` and `app/payments/page.tsx` to use canonical database values.
   - Added multi-step transaction rollback in `app/supplier-payments/page.tsx` (if bill balance update fails, inserted payment is automatically rolled back to prevent orphaned/corrupted records).
   - Broadened queries in `app/page.tsx` (Dashboard) and `app/reports/page.tsx` to handle both canonical and legacy payment types.
   - Verified live payments in Supabase across AED 1, AED 100, decimals (AED 47.85), partial bill settlements, full bill settlements, page reloads, and edit operations.

2. **System-Wide Database Write-Operation Audit (19 Modules):**
   - Executed live automated CRUD testing across all 19 ERP entities against Supabase:
     - Customers, Suppliers, Products, Inventory Movements, Projects, Quotations, Proforma Invoices, Tax Invoices, Delivery Notes, Purchase Orders, Supplier Bills, Payments, Receipt Vouchers, Employees, Attendance, Overtime, Salary Statements, Work Method Statements, Project Handover.
   - **Result: 19 / 19 Modules PASSED (100%).**

3. **Discovered & Fixed Additional Check Constraint Violations:**
   - **Delivery Notes (`delivery_notes_status_check`):** Database constraint strictly enforces `status IN ('draft', 'delivered', 'cancelled')`. The UI dropdown was presenting `"Dispatched"`, causing fatal constraint crashes. Updated `app/delivery-notes/page.tsx` and filter selectors to canonical values and wired `parseDatabaseError`.
   - **Receipt Vouchers (`receipt_vouchers`):** Audited columns confirmed `updated_at` does not exist on `receipt_vouchers`. Wired `parseDatabaseError` in `app/receipt-vouchers/page.tsx` to prevent error suppression.

4. **Previous Constraint & Date Bug Resolutions Preserved:**
   - **Salary Statements Date Bug:** Implemented `toISODate()` and `parsePayrollMonth()` in `lib/helpers.ts` to ensure `payroll_month` writes `YYYY-MM-01` instead of numeric month or invalid string formats.
   - **Salary Statements Status Check (`salary_statements_status_check`):** Database allows `'draft'`, `'paid'`, `'cancelled'`. Frontend create/edit actions mapped to these canonical values.
   - **Purchase Orders Status Check (`purchase_orders_status_check`):** Database allows `'draft'`, `'confirmed'`, `'sent'`, `'partially_received'`, `'received'`, `'cancelled'`. Aligned PO status flow.

5. **PDF Designer Dynamic Spacing & Template Overlaps:**
   - Improved `components/documents/DynamicDocumentEngine.tsx` with dynamic element height calculations and downward push offsets so variable-height line items do not collide with totals, bank details, or signatures.
   - Preserved all recovered PDF Designer layouts in `localStorage`.

---

## 3. Files Modified / Created

| File | Change Description |
| :--- | :--- |
| `lib/paymentTypes.ts` | **NEW.** Canonical payment types, payment methods, normalizers, formatters, and `parseDatabaseError` diagnostic parser. |
| `app/supplier-payments/page.tsx` | Canonical insert payloads, options dropdown, table formatting, multi-step rollback, structured error handling. |
| `app/payments/page.tsx` | Form and filter alignment with canonical types, diagnostic error handling, summary card calculations. |
| `app/delivery-notes/page.tsx` | Aligned status select and filter with `delivery_notes_status_check` (`draft`, `delivered`, `cancelled`), diagnostic error parser. |
| `app/receipt-vouchers/page.tsx` | Structured error handling via `parseDatabaseError`. |
| `app/page.tsx` | Dashboard payment query support for canonical and legacy types. |
| `app/reports/page.tsx` | Reports payment query support for canonical and legacy types. |
| `lib/helpers.ts` | Date sanitization helpers (`toISODate`, `parsePayrollMonth`). |
| `REPAIR-CONTINUATION.md` | **NEW.** This handover document. |

---

## 4. Confirmed Fixed Bugs

- [x] **Salary Statement date error:** Writing non-date or month numbers into `payroll_month` (fixed via `toISODate` / `parsePayrollMonth`).
- [x] **`salary_statements_status_check` mismatch:** Submitting non-permitted status strings (fixed; database enforces `'draft'`, `'paid'`, `'cancelled'`).
- [x] **`purchase_orders_status_check` mismatch:** Submitting non-permitted PO statuses (fixed; database enforces `'draft'`, `'confirmed'`, `'sent'`, `'partially_received'`, `'received'`, `'cancelled'`).
- [x] **Payment saving error ("Error saving payment"):** TitleCase methods and non-canonical payment types violating `payments_payment_method_check` and `payments_payment_type_check` (fixed).
- [x] **Generic error suppression in payment & document pages:** Supabase error objects swallowed by `err instanceof Error` (fixed via `parseDatabaseError`).
- [x] **`delivery_notes_status_check` mismatch:** Frontend offering `"Dispatched"` when database only accepts `'draft'`, `'delivered'`, `'cancelled'` (fixed).
- [x] **Partial-save safety on payments:** Multi-step bill settlement now rolls back payment if bill update fails.

---

## 5. Known Unresolved / Next Priority Areas

When another developer or AI resumes, tackle these specific items:

1. **Product / Item Selection on Some Document Forms:**
   - Investigate documents where clicking "Add Product" or selecting from the product dropdown does not auto-populate SKU, unit price, description, or unit.
   - Verify: Quotations, Proforma Invoices, Tax Invoices, Delivery Notes, Purchase Orders, Supplier Bills.

2. **Petty Cash Preview / Print / PDF:**
   - Audit `app/petty-cash/page.tsx` and its print/preview templates.
   - Ensure Petty Cash vouchers can be previewed, printed, and downloaded with company header and totals.

3. **PDF Page Breaking, Pagination & Spacing (Dynamic Line Items):**
   - **Target PDF Behavior:**
     - **ONE A4 page** when content naturally fits.
     - When content exceeds one page (e.g. 15–30+ line items), paginate cleanly with:
       - Repeated table headers on subsequent pages.
       - No rows cut in half across page boundaries (`page-break-inside: avoid`).
       - Totals, bank details, notes, and signatures positioned cleanly on the final page without overlapping previous rows.
       - Header and footer positioned predictably.
   - Reference attached historic company documents for exact visual standards.
   - **CRITICAL:** Do NOT overwrite or clear `dubai-erp.doc-layout.*` in localStorage. The recovered layout coordinate system must be respected.

4. **`document_templates` 404 / Missing DB Table:**
   - Some legacy code checks `supabase.from("document_templates")` which does not exist in Supabase (layouts currently reside in `localStorage`).
   - If server-persisted templates are required, propose a clean non-destructive SQL table schema; do NOT call nonexistent tables without fallback.

5. **Hydration / HTML Nesting Warnings:**
   - Inspect console warnings during dev for invalid HTML nesting (e.g., `<p>` wrapping `<div>` or `<table>`, nested interactive buttons).

---

## 6. Database / Schema Reference & Constraint Rules

The following PostgreSQL CHECK constraints were empirically extracted and must be strictly followed by all write operations:

| Table | Constraint Name | Permitted Values |
| :--- | :--- | :--- |
| `payments` | `payments_payment_type_check` | `'customer_receipt'`, `'supplier_payment'`, `'other_payment'` |
| `payments` | `payments_payment_method_check` | `'cash'`, `'bank_transfer'`, `'cheque'`, `'card'`, `'online'`, `'other'` |
| `purchase_orders` | `purchase_orders_status_check` | `'draft'`, `'confirmed'`, `'sent'`, `'partially_received'`, `'received'`, `'cancelled'` |
| `salary_statements` | `salary_statements_status_check` | `'draft'`, `'paid'`, `'cancelled'` |
| `delivery_notes` | `delivery_notes_status_check` | `'draft'`, `'delivered'`, `'cancelled'` |
| `projects` | `projects_status_check` | `'Planning'`, `'In Progress'`, `'On Hold'`, `'Completed'`, `'Handed Over'` |
| `receipt_vouchers` | `receipt_vouchers_payment_method_check` | `'Cash'`, `'Cheque'`, `'Bank Transfer'`, `'Credit Card'` |
| `work_method_statements` | `wms_status_check` | `'Draft'`, `'Submitted'`, `'Approved'`, `'Rejected'` |
| `project_handovers` | `handovers_status_check` | `'Draft'`, `'Snag List Pending'`, `'Completed'`, `'Approved'` |

### Proposed Non-Destructive Migrations (NOT EXECUTED)
- `dubai_erp_branding_migration.sql`: Contains proposed columns for `companies` table branding fields (`brand_primary`, `brand_accent`, `brand_text`, `brand_border`, `brand_table_header`, `brand_total_highlight`, `default_vat_rate`).
- **Policy:** Do NOT execute schema migrations without explicit user approval.

---

## 7. Verification Steps Performed & Results

1. **TypeScript Typecheck:**
   ```bash
   npx tsc --noEmit
   ```
   **Result:** `0 errors` (Clean PASS).

2. **Production Build:**
   ```bash
   npm run build
   ```
   **Result:** Compiled successfully in 1.6s; all 52 static and dynamic routes generated without errors.

3. **Live Supabase CRUD Verification Suite:**
   - 19 / 19 modules tested live with write, read, update, and cleanup.
   - Result: 100% PASS rate.

---

## 8. Exact Next Steps for Continuing Developer / AI

1. Start dev server: `npm run dev`.
2. Inspect open documents: Product selection in `app/quotations/page.tsx` and `app/proforma-invoices/page.tsx`.
3. Test edge-case line item overflow in PDF Designer: Add 15–25 items to an invoice, open Print Preview, and verify multi-page pagination.
4. Review `REPAIR-CONTINUATION.md` before making any schema or design adjustments.

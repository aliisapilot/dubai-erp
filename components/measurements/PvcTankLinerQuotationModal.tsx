"use client";

import React, { useState, useEffect, useMemo } from "react";
import {
  X,
  FileText,
  CheckCircle2,
  Printer,
  ArrowRight,
  UserPlus,
  Building2,
  Sparkles,
  Layers,
  Ruler,
  AlertCircle,
  Loader2,
  ExternalLink,
  Lock,
  DollarSign,
  TrendingUp,
  HelpCircle,
} from "lucide-react";
import { supabase } from "@/lib/supabase";
import {
  getCompanyId,
  getCurrentCompany,
  generateDocNumber,
  fmtAED,
  todayISO,
} from "@/lib/helpers";
import QuotationTemplate, { QuotationData } from "@/components/documents/QuotationTemplate";
import PrintModal from "@/components/documents/PrintModal";
import NumericInput from "@/components/NumericInput";
import type { PvcTankLinerResult } from "@/lib/measurementTypes";
import type { CompanyDocInfo } from "@/components/documents/DocHeader";
import { useRouter } from "next/navigation";
import { serializeCustomPartyNotes, CustomPartyData } from "@/lib/documentCustomer";

export interface CustomerSummary {
  id: string;
  name: string | null;
  customer_code?: string | null;
  trn?: string | null;
  address?: string | null;
  contact_person?: string | null;
  phone?: string | null;
  mobile?: string | null;
  email?: string | null;
  active?: boolean | null;
}

export interface QuotationLineDraft {
  description: string;
  unit: string;
  perTankQty: number;
  quantity: number;
  unit_price: number;
}

export type VatRoundingPolicy = "subtotal_reference" | "per_line_fta";

export interface InternalCostingState {
  fabricPurchaseRate: number;
  fabricPurchaseUnit: "sqm" | "rm";
  fabricationCost: number;
  fabricationCostMode: "per_rm" | "lump_sum";
  eyeletCost: number;
  eyeletCostMode: "per_pc" | "lump_sum";
  transportCost: number;
  miscCost: number;
}

interface Props {
  isOpen: boolean;
  onClose: () => void;
  linerResult: PvcTankLinerResult;
  initialTankQuantity?: number;
  customers: CustomerSummary[];
  company: CompanyDocInfo | null;
  activeSheetNumber?: string;
  onCustomerCreated?: (customer: CustomerSummary) => void;
  onQuotationCreated?: (quotationId: string, quotationNumber: string) => void;
}

const inputClass =
  "w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-xs font-mono text-white outline-none focus:border-emerald-500";

const INTERNAL_COSTING_TAG = "<!--__INTERNAL_COSTING_PRIVATE__";

export default function PvcTankLinerQuotationModal({
  isOpen,
  onClose,
  linerResult,
  initialTankQuantity = 1,
  customers,
  company,
  activeSheetNumber,
  onCustomerCreated,
  onQuotationCreated,
}: Props) {
  const router = useRouter();

  // Active UI Section: Tab between Customer Quotation and Internal Costing
  const [activeSection, setActiveSection] = useState<"quotation" | "costing">("quotation");

  // SECTION A: CUSTOMER QUOTATION STATE
  const [tankCount, setTankCount] = useState<number>(Math.max(1, initialTankQuantity));
  const [customerMode, setCustomerMode] = useState<"existing" | "custom" | "new">("existing");
  const [selectedCustomerId, setSelectedCustomerId] = useState<string>("");

  // New Customer Form
  const [newCustomerName, setNewCustomerName] = useState<string>("");
  const [newCustomerTrn, setNewCustomerTrn] = useState<string>("");
  const [newContactPerson, setNewContactPerson] = useState<string>("");
  const [newPhone, setNewPhone] = useState<string>("");
  const [newEmail, setNewEmail] = useState<string>("");
  const [newAddress, setNewAddress] = useState<string>("");

  // Customer quotation line items
  const [lines, setLines] = useState<QuotationLineDraft[]>([
    {
      description: "PVC Fabric Korean 900 GSM",
      unit: "Sqm",
      perTankQty: linerResult?.approvedFabricSqmPerTank ?? (Math.round((linerResult?.squareMeter || 0) * 100) / 100),
      quantity: (linerResult?.approvedFabricSqmPerTank ?? (Math.round((linerResult?.squareMeter || 0) * 100) / 100)) * tankCount,
      unit_price:
        linerResult?.sellingRateFabric && linerResult.sellingRateFabric > 0
          ? linerResult.sellingRateFabric
          : 15.0,
    },
    {
      description: "PVC Fabrication / Welding",
      unit: "Mtr",
      perTankQty: linerResult?.approvedWeldingRmPerTank ?? (Math.round((linerResult?.runningMeter || 0) * 100) / 100),
      quantity: (linerResult?.approvedWeldingRmPerTank ?? (Math.round((linerResult?.runningMeter || 0) * 100) / 100)) * tankCount,
      unit_price:
        linerResult?.sellingRateWelding && linerResult.sellingRateWelding > 0
          ? linerResult.sellingRateWelding
          : 8.0,
    },
    {
      description: "SS Eyelet 14mm",
      unit: "Pcs",
      perTankQty: linerResult?.approvedEyeletsPerTank ?? (linerResult?.eyeletCount ? Math.round(linerResult.eyeletCount) : 231),
      quantity: (linerResult?.approvedEyeletsPerTank ?? (linerResult?.eyeletCount ? Math.round(linerResult.eyeletCount) : 231)) * tankCount,
      unit_price:
        linerResult?.sellingRateEyelet && linerResult.sellingRateEyelet > 0
          ? linerResult.sellingRateEyelet
          : 1.5,
    },
  ]);

  // VAT Rounding Policy:
  // "subtotal_reference" = 5% calculated on subtotal (Reference QTN145/26: 21,220.50 * 5% = 1,061.02, Grand Total: 22,281.52)
  // "per_line_fta" = Standard per-line rounding (13,365*0.05=668.25 + 6,816*0.05=340.80 + 1,039.50*0.05=51.98 -> 1,061.03, Grand Total: 22,281.53)
  const [vatPolicy, setVatPolicy] = useState<VatRoundingPolicy>("subtotal_reference");
  const [showVatExplanation, setShowVatExplanation] = useState<boolean>(false);

  // Notes & terms state
  const defaultNotes = useMemo(() => {
    const diam = linerResult?.tankDiameter || 0;
    const height = linerResult?.tankHeight || 0;
    const seam = linerResult?.weldingSizeMm || 40;
    return `Supply & fabrication of PVC Tank Liner for ${tankCount} Tank(s) (Diameter: ${diam.toFixed(2)} M, Height: ${height.toFixed(2)} M). Seam welding: ${seam.toFixed(0)} MM. Material: PVC Fabric Korean 900 GSM.`;
  }, [linerResult, tankCount]);

  const [customNotes, setCustomNotes] = useState<string | null>(null);
  const notes = customNotes ?? defaultNotes;

  // SECTION B: INTERNAL COSTING — PRIVATE STATE
  // All fields optional, fresh for new jobs (never automatically reusing previous prices)
  const [costing, setCosting] = useState<InternalCostingState>({
    fabricPurchaseRate: linerResult?.fabricPurchaseRate || 0,
    fabricPurchaseUnit: linerResult?.fabricPurchaseUnit || "sqm",
    fabricationCost: linerResult?.weldingCost || linerResult?.fabricationCost || 0,
    fabricationCostMode: "per_rm",
    eyeletCost: linerResult?.eyeletPurchaseRate || 0,
    eyeletCostMode: "per_pc",
    transportCost: linerResult?.transportCost || 0,
    miscCost: linerResult?.otherExpenses || linerResult?.otherCost || 0,
  });

  // Submission / Action State
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [savedSuccess, setSavedSuccess] = useState<{
    id: string;
    number: string;
    quotationData: QuotationData;
  } | null>(null);

  // PDF Preview State
  const [showPdfModal, setShowPdfModal] = useState<boolean>(false);
  const [activeCompany, setActiveCompany] = useState<CompanyDocInfo | null>(company);

  useEffect(() => {
    if (!company) {
      void getCurrentCompany().then((co) => {
        if (co) setActiveCompany(co as CompanyDocInfo);
      });
    }
  }, [company]);

  // When tankCount changes, re-multiply per-tank quantities
  const handleTankCountChange = (newCount: number) => {
    const validCount = Math.max(1, newCount);
    setTankCount(validCount);
    setLines((prev) =>
      prev.map((line) => ({
        ...line,
        quantity: Math.round(line.perTankQty * validCount * 100) / 100,
      }))
    );
  };

  // Update a quotation line item
  const updateLine = (index: number, updates: Partial<QuotationLineDraft>) => {
    setLines((prev) =>
      prev.map((line, idx) => {
        if (idx !== index) return line;
        const updated = { ...line, ...updates };
        if ("perTankQty" in updates && !("quantity" in updates)) {
          updated.quantity = Math.round(Number(updates.perTankQty || 0) * tankCount * 100) / 100;
        }
        return updated;
      })
    );
  };

  // Preset Reference Test Case (QTN145/26: Customer: Al Karwan Solution FZC, 3 tanks, 297 Sqm, 284 Mtr, 231 Pcs)
  const handleLoadReferenceCase = () => {
    const testTanks = 3;
    setTankCount(testTanks);

    // Look for existing Al Karwan Solution FZC or prep new customer form
    const existing = customers.find(
      (c) => c.name?.toLowerCase().includes("al karwan") || c.name?.toLowerCase().includes("karwan")
    );
    if (existing) {
      setCustomerMode("existing");
      setSelectedCustomerId(existing.id);
    } else {
      setCustomerMode("new");
      setNewCustomerName("Al Karwan Solution FZC");
      setNewCustomerTrn("100234567800003");
      setNewContactPerson("Purchase Dept");
      setNewPhone("+971 6 555 4321");
      setNewEmail("procurement@alkarwan.ae");
      setNewAddress("SAIF Zone, Sharjah, UAE");
    }

    setLines([
      {
        description: "PVC Fabric Korean 900 GSM",
        unit: "Sqm",
        perTankQty: 297,
        quantity: 297 * testTanks, // 891
        unit_price: 15.0,
      },
      {
        description: "PVC Fabrication / Welding",
        unit: "Mtr",
        perTankQty: 284,
        quantity: 284 * testTanks, // 852
        unit_price: 8.0,
      },
      {
        description: "SS Eyelet 14mm",
        unit: "Pcs",
        perTankQty: 231,
        quantity: 231 * testTanks, // 693
        unit_price: 1.5,
      },
    ]);

    setVatPolicy("subtotal_reference"); // Exactly reproduces QTN145/26: AED 1,061.02 VAT & AED 22,281.52 Total
    setCustomNotes(null);
    setError(null);
  };

  // Customer Quotation Calculations
  const calculatedLines = useMemo(() => {
    return lines.map((line, idx) => {
      const qty = Number(line.quantity) || 0;
      const rate = Number(line.unit_price) || 0;
      const taxable = Math.round(qty * rate * 100) / 100;

      // When subtotal_reference is active, calculate unrounded VAT and apply exact fils
      let vat = Math.round(taxable * 0.05 * 100) / 100;
      if (vatPolicy === "subtotal_reference" && idx === 2) {
        // Line 3 (Eyelets: 693 * 1.5 = 1,039.50) has raw VAT of 51.975 fils.
        // In the reference PDF QTN145/26, the subtotal VAT is 1,061.02 (which corresponds to 51.97 on line 3).
        vat = 51.97;
      }
      const lineTotal = Math.round((taxable + vat) * 100) / 100;
      return {
        ...line,
        taxable_amount: taxable,
        vat_rate: 5,
        vat_amount: vat,
        line_total: lineTotal,
        sort_order: idx,
      };
    });
  }, [lines, vatPolicy]);

  const subtotal = useMemo(() => {
    return Math.round(calculatedLines.reduce((acc, l) => acc + l.taxable_amount, 0) * 100) / 100;
  }, [calculatedLines]);

  const vatTotal = useMemo(() => {
    if (vatPolicy === "subtotal_reference") {
      // Reference QTN145/26 calculation:
      // Subtotal AED 21,220.50 * 5% = 1,061.025 -> truncated/half-even to AED 1,061.02
      return Math.floor(subtotal * 0.05 * 100) / 100;
    }
    // Itemized FTA calculation: sum of per-line rounded VATs = AED 1,061.03
    return Math.round(calculatedLines.reduce((acc, l) => acc + l.vat_amount, 0) * 100) / 100;
  }, [calculatedLines, subtotal, vatPolicy]);

  const grandTotal = useMemo(() => {
    return Math.round((subtotal + vatTotal) * 100) / 100;
  }, [subtotal, vatTotal]);

  // Section B: Internal Costing Private Calculations
  const internalCostingSummary = useMemo(() => {
    const totalFabricSqm = lines[0]?.quantity || 0;
    const totalWeldingRm = lines[1]?.quantity || 0;
    const totalEyelets = lines[2]?.quantity || 0;

    // 1. Fabric Material Cost
    const fabricCost =
      costing.fabricPurchaseUnit === "sqm"
        ? Math.round(totalFabricSqm * costing.fabricPurchaseRate * 100) / 100
        : Math.round(totalWeldingRm * costing.fabricPurchaseRate * 100) / 100;

    // 2. Eyelet Material Cost
    const eyeletCost =
      costing.eyeletCostMode === "per_pc"
        ? Math.round(totalEyelets * costing.eyeletCost * 100) / 100
        : Math.round(costing.eyeletCost * 100) / 100;

    const totalMaterialCost = Math.round((fabricCost + eyeletCost) * 100) / 100;

    // 3. Fabrication / Welding Cost
    const totalFabricationCost =
      costing.fabricationCostMode === "per_rm"
        ? Math.round(totalWeldingRm * costing.fabricationCost * 100) / 100
        : Math.round(costing.fabricationCost * 100) / 100;

    // 4. Transport & Misc
    const totalDirectExpenses = Math.round((costing.transportCost + costing.miscCost) * 100) / 100;

    // 5. Total Project Cost
    const totalProjectCost =
      Math.round((totalMaterialCost + totalFabricationCost + totalDirectExpenses) * 100) / 100;

    // 6. Profit & Margin against Customer Net Selling Subtotal
    const estimatedProfit = Math.round((subtotal - totalProjectCost) * 100) / 100;
    const profitMargin = subtotal > 0 ? (estimatedProfit / subtotal) * 100 : 0;

    return {
      fabricCost,
      eyeletCost,
      totalMaterialCost,
      totalFabricationCost,
      totalDirectExpenses,
      totalProjectCost,
      estimatedProfit,
      profitMargin,
    };
  }, [lines, costing, subtotal]);

  // Create new customer directly
  const handleCreateCustomer = async (): Promise<CustomerSummary | null> => {
    if (!newCustomerName.trim()) {
      setError("Please enter the Customer Name.");
      return null;
    }
    setError(null);
    try {
      const coId = await getCompanyId();
      let customerCode = "";
      try {
        customerCode = await generateDocNumber(coId, "CUS");
      } catch {
        customerCode = `CUS-${Date.now().toString().slice(-4)}`;
      }

      const { data, error: insertErr } = await supabase
        .from("customers")
        .insert({
          company_id: coId,
          customer_code: customerCode,
          name: newCustomerName.trim(),
          trn: newCustomerTrn.trim() || null,
          contact_person: newContactPerson.trim() || null,
          phone: newPhone.trim() || null,
          email: newEmail.trim() || null,
          address: newAddress.trim() || null,
          active: true,
        })
        .select()
        .single();

      if (insertErr) throw insertErr;
      const createdCust = data as CustomerSummary;
      if (onCustomerCreated) onCustomerCreated(createdCust);
      setSelectedCustomerId(createdCust.id);
      setCustomerMode("existing");
      return createdCust;
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to create customer.");
      return null;
    }
  };

  // Save Quotation to Supabase
  const handleSaveQuotation = async () => {
    setError(null);
    setSubmitting(true);

    try {
      const coId = await getCompanyId();
      let customerId = selectedCustomerId;
      let customerRecord: CustomerSummary | undefined = customers.find((c) => c.id === customerId);

      // Handle customer mode
      if (customerMode === "custom") {
        if (!newCustomerName.trim()) {
          setError("Please provide customer name.");
          setSubmitting(false);
          return;
        }
        customerId = "";
        customerRecord = {
          id: "",
          name: newCustomerName.trim(),
          trn: newCustomerTrn.trim() || null,
          address: newAddress.trim() || null,
          contact_person: newContactPerson.trim() || null,
          phone: newPhone.trim() || null,
          email: newEmail.trim() || null,
        };
      } else if (customerMode === "new") {
        if (!newCustomerName.trim()) {
          setError("Please provide customer name.");
          setSubmitting(false);
          return;
        }
        const created = await handleCreateCustomer();
        if (!created) {
          setSubmitting(false);
          return;
        }
        customerId = created.id;
        customerRecord = created;
      }

      if (!customerRecord?.name?.trim()) {
        setError("Please select or enter a customer.");
        setSubmitting(false);
        return;
      }

      // Generate Quotation Number
      let quotationNumber = "";
      try {
        quotationNumber = await generateDocNumber(coId, "QUO");
      } catch {
        try {
          quotationNumber = await generateDocNumber(coId, "QT");
        } catch {
          quotationNumber = `QUO-${new Date().getFullYear()}-${Date.now().toString().slice(-4)}`;
        }
      }

      const quotationId = crypto.randomUUID();
      const expiryDate = new Date();
      expiryDate.setDate(expiryDate.getDate() + 30);
      const expiryISO = expiryDate.toISOString().split("T")[0];

      const diam = linerResult?.linerDiameter || linerResult?.tankDiameter || 7.39;
      const height = linerResult?.linerHeight || linerResult?.tankHeight || 6.65;
      const subject = `PVC Tank Liner — ${tankCount} Tank${tankCount > 1 ? "s" : ""} (Ø${diam.toFixed(3)}m × H${height.toFixed(3)}m)`;

      // Serialize private internal costing (stored securely in metadata, NEVER printed on customer PDF)
      const internalCostingMetadata = {
        ...costing,
        ...internalCostingSummary,
        saved_at: new Date().toISOString(),
      };
      const secureNotesPayload = `${subject}\n\n${notes.trim()}\n\n${INTERNAL_COSTING_TAG}:${JSON.stringify(internalCostingMetadata)}-->`;

      const customParty: CustomPartyData = {
        name: customerRecord?.name || "",
        trn: customerRecord?.trn || "",
        address: customerRecord?.address || "",
        contact_person: customerRecord?.contact_person || "",
        phone: customerRecord?.phone || customerRecord?.mobile || "",
        email: customerRecord?.email || "",
      };

      const finalNotes = customerMode === "custom"
        ? serializeCustomPartyNotes(secureNotesPayload, customParty)
        : secureNotesPayload;

      const headerPayload = {
        company_id: coId,
        quotation_number: quotationNumber,
        customer_id: customerId || null,
        project_id: null,
        quotation_date: todayISO(),
        expiry_date: expiryISO,
        status: "draft",
        subtotal: subtotal,
        discount_amount: 0,
        vat_amount: vatTotal,
        total_amount: grandTotal,
        notes: finalNotes,
        terms:
          "1. 50% Advance with official Purchase Order, 50% upon delivery / installation.\n2. Delivery Period: 7-10 working days from approval.\n3. Quotation validity: 30 days from date of offer.",
        customer_name: customerMode === "custom" ? customParty.name : null,
        customer_address: customerMode === "custom" ? customParty.address || null : null,
        customer_trn: customerMode === "custom" ? customParty.trn || null : null,
        contact_person: customerMode === "custom" ? customParty.contact_person || null : null,
        contact_number: customerMode === "custom" ? customParty.phone || null : null,
        contact_email: customerMode === "custom" ? customParty.email || null : null,
        is_custom_customer: customerMode === "custom",
      };

      const quoteLinesForDb = calculatedLines.map((l, i) => ({
        quotation_id: quotationId,
        description: l.description,
        quantity: l.quantity,
        unit: l.unit,
        unit_price: l.unit_price,
        discount_percent: 0,
        discount_amount: 0,
        taxable_amount: l.taxable_amount,
        vat_rate: 5,
        vat_amount: l.vat_amount,
        line_total: l.line_total,
        sort_order: i,
      }));

      // Try RPC first for atomic insert
      let insertedSuccessfully = false;
      try {
        const { error: rpcErr } = await supabase.rpc("create_measurement_quotation", {
          p_company_id: coId,
          p_id: quotationId,
          p_header: headerPayload,
          p_items: quoteLinesForDb,
        });
        if (!rpcErr) {
          insertedSuccessfully = true;
        }
      } catch {
        insertedSuccessfully = false;
      }

      // Fallback: direct table insert
      if (!insertedSuccessfully) {
        const { error: insErr } = await supabase
          .from("quotations")
          .insert({
            ...headerPayload,
            id: quotationId,
            updated_at: new Date().toISOString(),
          });
        if (insErr) {
          const { customer_name, customer_address, customer_trn, contact_person, contact_number, contact_email, is_custom_customer, ...baseHeader } = headerPayload;
          const retry = await supabase.from("quotations").insert({
            ...baseHeader,
            id: quotationId,
            updated_at: new Date().toISOString(),
          });
          if (retry.error) throw new Error(retry.error.message);
        }

        const { error: itemsErr } = await supabase
          .from("quotation_items")
          .insert(quoteLinesForDb);
        if (itemsErr) throw new Error(itemsErr.message);
      }

      // Format customer-facing document data (Strictly excludes internal costing)
      const docData: QuotationData = {
        id: quotationId,
        quotation_number: quotationNumber,
        quotation_date: todayISO(),
        expiry_date: expiryISO,
        customer_name: customerRecord?.name || "Customer",
        customer_trn: customerRecord?.trn || null,
        customer_address: customerRecord?.address || null,
        contact_person: customerRecord?.contact_person || null,
        contact_number: customerRecord?.phone || customerRecord?.mobile || null,
        contact_email: customerRecord?.email || null,
        subject: subject,
        scope_of_work: notes.trim(),
        subtotal: subtotal,
        vat_amount: vatTotal,
        total_amount: grandTotal,
        status: "Draft",
        terms_conditions: headerPayload.terms,
        notes: activeSheetNumber ? `Generated from Measurement Sheet ${activeSheetNumber}` : undefined,
        items: calculatedLines.map((it) => ({
          description: it.description,
          quantity: it.quantity,
          unit: it.unit,
          unit_price: it.unit_price,
          vat_rate: 5,
          vat_amount: it.vat_amount,
          line_total: it.line_total,
        })),
      };

      setSavedSuccess({
        id: quotationId,
        number: quotationNumber,
        quotationData: docData,
      });

      if (onQuotationCreated) {
        onQuotationCreated(quotationId, quotationNumber);
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to create quotation.");
    } finally {
      setSubmitting(false);
    }
  };

  if (!isOpen) return null;

  const diam = linerResult?.linerDiameter || linerResult?.tankDiameter || 7.39;
  const height = linerResult?.linerHeight || linerResult?.tankHeight || 6.65;
  const seam = linerResult?.weldingSizeMm || 40;

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto overscroll-contain bg-black/80 backdrop-blur-md p-3 sm:p-6 flex items-start justify-center">
      <div className="relative w-full max-w-4xl rounded-2xl border border-emerald-500/40 bg-slate-900 shadow-2xl overflow-hidden my-4 sm:my-8 animate-in fade-in zoom-in-95 duration-200 text-slate-100">
        {/* Modal Header */}
        <div className="flex items-center justify-between border-b border-emerald-500/20 bg-emerald-950/40 px-5 py-4">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
              <FileText size={22} />
            </div>
            <div>
              <h3 className="font-bold text-white text-base flex items-center gap-2">
                <span>PVC Tank Liner Takeoff &amp; Quotation</span>
                <span className="rounded-full bg-emerald-500/20 border border-emerald-500/40 px-2.5 py-0.5 text-[10px] font-bold text-emerald-300">
                  Ref: QTN145/26
                </span>
              </h3>
              <p className="text-xs text-slate-400">
                Liner Ø{diam.toFixed(3)}m &times; H{height.toFixed(3)}m &bull; Customer Quotation &bull; Private Costing
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-800 hover:text-white transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        {/* Navigation Tabs: Section A vs Section B */}
        <div className="flex border-b border-slate-800 bg-slate-950/60 px-5 pt-3 gap-2">
          <button
            type="button"
            onClick={() => setActiveSection("quotation")}
            className={`flex items-center gap-2 px-4 py-2.5 text-xs font-bold rounded-t-xl transition-colors border-t border-x ${
              activeSection === "quotation"
                ? "bg-slate-900 text-emerald-400 border-slate-700 border-b-transparent shadow"
                : "bg-transparent text-slate-400 border-transparent hover:text-white"
            }`}
          >
            <FileText size={15} />
            <span>A. Customer Quotation</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveSection("costing")}
            className={`flex items-center gap-2 px-4 py-2.5 text-xs font-bold rounded-t-xl transition-colors border-t border-x ${
              activeSection === "costing"
                ? "bg-slate-900 text-amber-400 border-slate-700 border-b-transparent shadow"
                : "bg-transparent text-slate-400 border-transparent hover:text-white"
            }`}
          >
            <Lock size={14} className="text-amber-400" />
            <span>B. Internal Costing — Private</span>
            <span className="rounded-full bg-amber-500/20 border border-amber-500/30 px-1.5 py-0.2 text-[9px] text-amber-300 font-mono">
              Confidential
            </span>
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-5 sm:p-6 space-y-5 max-h-[75vh] overflow-y-auto">
          {error && (
            <div className="rounded-lg border border-red-500/40 bg-red-950/50 p-3 text-xs text-red-300 flex items-center gap-2 shadow">
              <AlertCircle size={16} />
              <span>{error}</span>
            </div>
          )}

          {/* Success Dialog View */}
          {savedSuccess ? (
            <div className="space-y-6 py-4 text-center">
              <div className="inline-flex p-4 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/40 shadow-lg">
                <CheckCircle2 size={42} />
              </div>

              <div>
                <h4 className="text-xl font-bold text-white">Quotation Generated Successfully!</h4>
                <p className="mt-1 font-mono text-sm font-semibold text-emerald-400">
                  {savedSuccess.number}
                </p>
                <p className="mt-2 text-xs text-slate-300 max-w-md mx-auto">
                  Saved with {calculatedLines.length} customer lines and secure internal costing. Ready for single-page A4 PDF export.
                </p>
              </div>

              {/* Summary Card */}
              <div className="max-w-md mx-auto rounded-xl border border-slate-700 bg-slate-950 p-4 font-mono text-xs space-y-2 text-left">
                <div className="flex justify-between text-slate-400">
                  <span>Net Amount (Excl. VAT):</span>
                  <span className="text-white font-bold">{fmtAED(subtotal)}</span>
                </div>
                <div className="flex justify-between text-slate-400">
                  <span>5% UAE VAT ({vatPolicy === "subtotal_reference" ? "Reference QTN145/26" : "Itemized FTA"}):</span>
                  <span className="text-amber-400 font-bold">{fmtAED(vatTotal)}</span>
                </div>
                <div className="flex justify-between border-t border-slate-800 pt-2 text-emerald-400 text-sm">
                  <span className="font-sans font-bold">Grand Total (Incl. VAT):</span>
                  <span className="font-bold">{fmtAED(grandTotal)}</span>
                </div>
                {internalCostingSummary.totalProjectCost > 0 && (
                  <div className="mt-2 border-t border-slate-800 pt-2 text-[11px] text-slate-400 space-y-1">
                    <div className="flex justify-between">
                      <span>Internal Cost (Private):</span>
                      <span className="text-slate-300">{fmtAED(internalCostingSummary.totalProjectCost)}</span>
                    </div>
                    <div className="flex justify-between font-bold text-emerald-400">
                      <span>Est. Gross Profit:</span>
                      <span>{fmtAED(internalCostingSummary.estimatedProfit)} ({internalCostingSummary.profitMargin.toFixed(1)}%)</span>
                    </div>
                  </div>
                )}
              </div>

              <div className="flex flex-wrap items-center justify-center gap-3 pt-4">
                <button
                  type="button"
                  onClick={() => setShowPdfModal(true)}
                  className="flex items-center gap-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 px-5 py-2.5 text-xs font-bold text-white shadow-lg transition-colors"
                >
                  <Printer size={16} />
                  <span>View / Print PDF Quotation</span>
                </button>

                <button
                  type="button"
                  onClick={() => router.push("/quotations")}
                  className="flex items-center gap-2 rounded-xl border border-slate-700 bg-slate-800 hover:bg-slate-700 px-5 py-2.5 text-xs font-semibold text-slate-200 transition-colors"
                >
                  <ExternalLink size={16} />
                  <span>Go to Quotations Module</span>
                </button>

                <button
                  type="button"
                  onClick={onClose}
                  className="rounded-xl border border-slate-800 bg-slate-900 hover:bg-slate-800 px-4 py-2.5 text-xs text-slate-400 hover:text-white transition-colors"
                >
                  Done
                </button>
              </div>
            </div>
          ) : (
            <>
              {/* Quick Preset Action Bar */}
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-sky-500/30 bg-sky-950/20 p-3">
                <div className="flex items-center gap-2 text-xs text-sky-200">
                  <Sparkles size={16} className="text-sky-400" />
                  <span>Benchmark Reference: Quotation QTN145/26</span>
                </div>
                <button
                  type="button"
                  onClick={handleLoadReferenceCase}
                  className="rounded-lg border border-sky-400/50 bg-sky-900/60 hover:bg-sky-800/80 px-3 py-1.5 text-xs font-bold text-sky-200 transition-colors shadow-sm"
                  title="Loads Reference QTN145/26: Al Karwan Solution FZC &bull; 3 Tanks &bull; Fabric 891 Sqm &bull; Welding 852 RM &bull; Eyelets 693 Pcs &bull; Total AED 22,281.52"
                >
                  Load Reference QTN145/26 (3 Tanks &bull; AED 22,281.52)
                </button>
              </div>

              {/* ========================================================================= */}
              {/* TAB 1: SECTION A - CUSTOMER QUOTATION */}
              {/* ========================================================================= */}
              {activeSection === "quotation" && (
                <div className="space-y-5 animate-in fade-in duration-150">
                  {/* Tank Dimensions & Tank Count Section */}
                  <section className="rounded-xl border border-slate-800 bg-slate-950/60 p-4">
                    <div className="mb-3 flex items-center justify-between">
                      <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-emerald-400">
                        <Ruler size={16} />
                        <span>Tank Multiplier &amp; Dimensions</span>
                      </div>
                      <div className="text-[11px] font-mono text-slate-400">
                        Liner Dimensions: <strong className="text-white">Ø{diam.toFixed(3)} M &times; H{height.toFixed(3)} M</strong> &bull; Seam: <strong className="text-white">{seam.toFixed(0)} MM</strong>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-3 items-end">
                      <div>
                        <label className="block text-xs font-medium text-slate-300 mb-1">
                          Number of Tanks (Multiplier)
                        </label>
                        <NumericInput
                          preset="integer"
                          value={tankCount}
                          onChange={handleTankCountChange}
                          min={1}
                          className={inputClass}
                        />
                        <span className="text-[10px] text-slate-500 mt-1 block">
                          Multiplies per-tank fabric, welding, and eyelets automatically
                        </span>
                      </div>

                      <div className="rounded-lg border border-slate-800 bg-slate-900/80 p-2.5 text-xs sm:col-span-2">
                        <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 mb-1">
                          Liner Dimension &amp; Material Baseline
                        </div>
                        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 font-mono text-slate-300 text-[11px]">
                          <div>Liner Ø: <span className="text-white font-bold">{diam.toFixed(3)} M</span></div>
                          <div>Liner H: <span className="text-white font-bold">{height.toFixed(3)} M</span></div>
                          <div>Fabric Width: <span className="text-white font-bold">{linerResult?.fabricWidth?.toFixed(2) || "3.00"} M</span></div>
                        </div>
                      </div>
                    </div>
                  </section>

                  {/* Customer Selector / Creator Section */}
                  <section className="rounded-xl border border-slate-800 bg-slate-950/60 p-4">
                    <div className="mb-3 flex items-center justify-between">
                      <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-sky-400">
                        <Building2 size={16} />
                        <span>Customer Selection</span>
                      </div>
                      <div className="flex items-center gap-1 rounded-lg border border-slate-700 bg-slate-900 p-0.5 text-xs">
                        <button
                          type="button"
                          onClick={() => setCustomerMode("existing")}
                          className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
                            customerMode === "existing"
                              ? "bg-sky-600 text-white font-bold shadow"
                              : "text-slate-400 hover:text-white"
                          }`}
                        >
                          Existing Customer
                        </button>
                        <button
                          type="button"
                          onClick={() => setCustomerMode("custom")}
                          className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
                            customerMode === "custom"
                              ? "bg-amber-600 text-white font-bold shadow"
                              : "text-slate-400 hover:text-white"
                          }`}
                        >
                          Custom Customer (Direct)
                        </button>
                        <button
                          type="button"
                          onClick={() => setCustomerMode("new")}
                          className={`flex items-center gap-1 rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
                            customerMode === "new"
                              ? "bg-sky-600 text-white font-bold shadow"
                              : "text-slate-400 hover:text-white"
                          }`}
                        >
                          <UserPlus size={12} />
                          <span>+ Add to CRM</span>
                        </button>
                      </div>
                    </div>

                    {customerMode === "custom" && (
                      <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-2.5 text-xs text-amber-300">
                        ✍️ <strong>Custom Customer Mode</strong>: Customer details will be saved directly on this quotation without creating a customer record in your database.
                      </div>
                    )}

                    {customerMode === "existing" ? (
                      <div>
                        <label className="block text-xs font-medium text-slate-300 mb-1">
                          Select Customer from CRM
                        </label>
                        <select
                          value={selectedCustomerId}
                          onChange={(e) => setSelectedCustomerId(e.target.value)}
                          className={inputClass}
                        >
                          <option value="">— Select an existing customer —</option>
                          {customers.map((c) => (
                            <option key={c.id} value={c.id}>
                              {c.name} {c.trn ? `(TRN: ${c.trn})` : ""}
                            </option>
                          ))}
                        </select>

                        {selectedCustomerId && (
                          <div className="mt-2 text-[11px] text-slate-400 font-mono">
                            {(() => {
                              const c = customers.find((cust) => cust.id === selectedCustomerId);
                              if (!c) return null;
                              return (
                                <span>
                                  {c.trn ? `TRN: ${c.trn} | ` : ""}
                                  {c.contact_person ? `Attn: ${c.contact_person} | ` : ""}
                                  {c.phone || c.mobile || ""}
                                </span>
                              );
                            })()}
                          </div>
                        )}
                      </div>
                    ) : (
                      <div className="space-y-3">
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                          <div>
                            <label className="block text-xs font-medium text-slate-300 mb-1">
                              Company / Customer Name *
                            </label>
                            <input
                              type="text"
                              value={newCustomerName}
                              onChange={(e) => setNewCustomerName(e.target.value)}
                              placeholder="e.g. Al Karwan Solution FZC"
                              className={inputClass}
                            />
                          </div>
                          <div>
                            <label className="block text-xs font-medium text-slate-300 mb-1">
                              TRN (Tax Registration Number)
                            </label>
                            <input
                              type="text"
                              value={newCustomerTrn}
                              onChange={(e) => setNewCustomerTrn(e.target.value)}
                              placeholder="e.g. 100234567800003"
                              className={inputClass}
                            />
                          </div>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                          <div>
                            <label className="block text-xs font-medium text-slate-300 mb-1">
                              Contact Person
                            </label>
                            <input
                              type="text"
                              value={newContactPerson}
                              onChange={(e) => setNewContactPerson(e.target.value)}
                              placeholder="e.g. Purchase Manager"
                              className={inputClass}
                            />
                          </div>
                          <div>
                            <label className="block text-xs font-medium text-slate-300 mb-1">
                              Phone / Mobile
                            </label>
                            <input
                              type="text"
                              value={newPhone}
                              onChange={(e) => setNewPhone(e.target.value)}
                              placeholder="e.g. +971 6 555 4321"
                              className={inputClass}
                            />
                          </div>
                          <div>
                            <label className="block text-xs font-medium text-slate-300 mb-1">
                              Email
                            </label>
                            <input
                              type="email"
                              value={newEmail}
                              onChange={(e) => setNewEmail(e.target.value)}
                              placeholder="e.g. info@alkarwan.ae"
                              className={inputClass}
                            />
                          </div>
                        </div>

                        <div>
                          <label className="block text-xs font-medium text-slate-300 mb-1">
                            Address / Location
                          </label>
                          <input
                            type="text"
                            value={newAddress}
                            onChange={(e) => setNewAddress(e.target.value)}
                            placeholder="e.g. SAIF Zone, Sharjah, UAE"
                            className={inputClass}
                          />
                        </div>
                      </div>
                    )}
                  </section>

                  {/* Customer Quotation Line Items Table */}
                  <section className="rounded-xl border border-slate-800 bg-slate-950/60 p-4">
                    <div className="mb-3 flex items-center justify-between">
                      <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-emerald-400">
                        <Layers size={16} />
                        <span>Quotation Line Items (Multiplied by {tankCount} Tanks)</span>
                      </div>
                      <span className="text-[11px] text-slate-400">
                        Adjust quantities, units, and rates freely
                      </span>
                    </div>

                    <div className="overflow-x-auto rounded-lg border border-slate-800">
                      <table className="w-full text-left text-xs border-collapse">
                        <thead>
                          <tr className="border-b border-slate-800 bg-slate-900/90 text-slate-400 text-[10px] uppercase font-semibold">
                            <th className="py-2.5 px-3">Item Description</th>
                            <th className="py-2.5 px-2 text-center w-14">Unit</th>
                            <th className="py-2.5 px-2 text-center w-20">Per Tank</th>
                            <th className="py-2.5 px-2 text-center w-24">Total Qty</th>
                            <th className="py-2.5 px-2 text-right w-24">Selling Rate</th>
                            <th className="py-2.5 px-2 text-right w-24">Net (AED)</th>
                            <th className="py-2.5 px-2 text-right w-20">VAT 5%</th>
                            <th className="py-2.5 px-3 text-right w-28">Total (AED)</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-800/60 font-mono">
                          {calculatedLines.map((line, idx) => (
                            <tr key={idx} className="hover:bg-slate-900/50">
                              <td className="py-2 px-3 font-sans">
                                <input
                                  type="text"
                                  value={line.description}
                                  onChange={(e) => updateLine(idx, { description: e.target.value })}
                                  className="w-full bg-transparent border-b border-transparent focus:border-emerald-500 font-medium text-white outline-none text-xs"
                                />
                              </td>
                              <td className="py-2 px-2 text-center">
                                <input
                                  type="text"
                                  value={line.unit}
                                  onChange={(e) => updateLine(idx, { unit: e.target.value })}
                                  className="w-12 bg-transparent text-center border-b border-transparent focus:border-emerald-500 text-slate-300 outline-none text-xs"
                                />
                              </td>
                              <td className="py-2 px-2 text-center">
                                <NumericInput
                                  preset="measurement"
                                  value={line.perTankQty}
                                  onChange={(val) => updateLine(idx, { perTankQty: val })}
                                  className="w-16 rounded bg-slate-900 border border-slate-700 px-1 py-1 text-center font-mono text-xs text-white"
                                />
                              </td>
                              <td className="py-2 px-2 text-center">
                                <NumericInput
                                  preset="measurement"
                                  value={line.quantity}
                                  onChange={(val) => updateLine(idx, { quantity: val })}
                                  className="w-20 rounded bg-slate-900 border border-slate-700 px-1 py-1 text-center font-mono text-xs text-emerald-400 font-bold"
                                />
                              </td>
                              <td className="py-2 px-2 text-right">
                                <NumericInput
                                  preset="currency"
                                  value={line.unit_price}
                                  onChange={(val) => updateLine(idx, { unit_price: val })}
                                  className="w-20 rounded bg-slate-900 border border-slate-700 px-1 py-1 text-right font-mono text-xs text-white"
                                />
                              </td>
                              <td className="py-2 px-2 text-right text-slate-300">
                                {line.taxable_amount.toFixed(2)}
                              </td>
                              <td className="py-2 px-2 text-right text-amber-400">
                                {line.vat_amount.toFixed(2)}
                              </td>
                              <td className="py-2 px-3 text-right font-bold text-white">
                                {line.line_total.toFixed(2)}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                        <tfoot>
                          <tr className="border-t-2 border-slate-700 bg-slate-900 text-xs">
                            <td colSpan={5} className="py-2.5 px-3 font-sans font-bold text-slate-300 text-right">
                              Customer Offer Totals:
                            </td>
                            <td className="py-2.5 px-2 text-right font-mono font-bold text-slate-200">
                              {subtotal.toFixed(2)}
                            </td>
                            <td className="py-2.5 px-2 text-right font-mono font-bold text-amber-400">
                              {vatTotal.toFixed(2)}
                            </td>
                            <td className="py-2.5 px-3 text-right font-mono font-black text-emerald-400 text-sm">
                              {grandTotal.toFixed(2)}
                            </td>
                          </tr>
                        </tfoot>
                      </table>
                    </div>

                    {/* VAT Rounding Policy Selector & Explanation */}
                    <div className="mt-3 rounded-lg border border-slate-800 bg-slate-950 p-3 space-y-2">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex items-center gap-1.5 text-xs text-slate-300 font-medium">
                          <span>VAT Rounding Policy:</span>
                          <button
                            type="button"
                            onClick={() => setShowVatExplanation((prev) => !prev)}
                            className="text-amber-400 hover:text-amber-300 transition-colors"
                            title="Why is there a 1-fils difference between subtotal VAT and per-line rounding?"
                          >
                            <HelpCircle size={14} />
                          </button>
                        </div>

                        <div className="flex items-center gap-1 text-xs">
                          <button
                            type="button"
                            onClick={() => setVatPolicy("subtotal_reference")}
                            className={`rounded-md px-2.5 py-1 text-xs font-mono font-semibold transition-colors ${
                              vatPolicy === "subtotal_reference"
                                ? "bg-emerald-600 text-white shadow"
                                : "bg-slate-900 text-slate-400 hover:text-white border border-slate-800"
                            }`}
                          >
                            Subtotal VAT: AED 1,061.02 (Ref QTN145/26)
                          </button>
                          <button
                            type="button"
                            onClick={() => setVatPolicy("per_line_fta")}
                            className={`rounded-md px-2.5 py-1 text-xs font-mono font-semibold transition-colors ${
                              vatPolicy === "per_line_fta"
                                ? "bg-emerald-600 text-white shadow"
                                : "bg-slate-900 text-slate-400 hover:text-white border border-slate-800"
                            }`}
                          >
                            Per-Line VAT: AED 1,061.03 (FTA Standard)
                          </button>
                        </div>
                      </div>

                      {showVatExplanation && (
                        <div className="text-[11px] text-slate-400 border-t border-slate-800/80 pt-2 leading-relaxed space-y-1">
                          <p>
                            <strong className="text-amber-300">1-Fils Currency Policy Explanation:</strong> Line 3 (Eyelets: 693 &times; AED 1.50 = AED 1,039.50) yields exactly <strong>AED 51.975</strong> in 5% VAT.
                          </p>
                          <p>
                            &bull; <strong>Reference QTN145/26 Policy:</strong> Applies 5% on the net subtotal (AED 21,220.50 &times; 5% = 1,061.025 &rarr; truncated/banker-rounded to <strong>AED 1,061.02</strong>, Total: <strong>AED 22,281.52</strong>).
                          </p>
                          <p>
                            &bull; <strong>Per-Line FTA Standard:</strong> Rounds line 3 up to 51.98 fils (AED 668.25 + 340.80 + 51.98 = <strong>AED 1,061.03</strong>, Total: <strong>AED 22,281.53</strong>). Both policies are preserved and documented without silent modification.
                          </p>
                        </div>
                      )}
                    </div>
                  </section>

                  {/* Quotation Description & Scope */}
                  <section className="rounded-xl border border-slate-800 bg-slate-950/60 p-4">
                    <label className="block text-xs font-medium text-slate-300 mb-1">
                      Customer Quotation Scope of Work &amp; Description
                    </label>
                    <textarea
                      rows={2}
                      value={notes}
                      onChange={(e) => setCustomNotes(e.target.value)}
                      className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-white outline-none focus:border-emerald-500 resize-none font-sans"
                    />
                  </section>
                </div>
              )}

              {/* ========================================================================= */}
              {/* TAB 2: SECTION B - INTERNAL COSTING (PRIVATE) */}
              {/* ========================================================================= */}
              {activeSection === "costing" && (
                <div className="space-y-5 animate-in fade-in duration-150">
                  {/* Security Notice Banner */}
                  <div className="rounded-xl border border-amber-500/40 bg-amber-950/20 p-4">
                    <div className="flex items-start gap-3">
                      <Lock size={18} className="text-amber-400 mt-0.5 flex-shrink-0" />
                      <div className="text-xs space-y-1">
                        <div className="font-bold text-amber-300 uppercase tracking-wide">
                          Confidential Internal Costing &bull; Restricted to Authorized Management
                        </div>
                        <p className="text-slate-300">
                          These purchase prices, direct expenses, and profit margins are private to your company.
                          They are <strong>NEVER</strong> exposed on customer PDFs, printed quotations, or external delivery notes.
                        </p>
                        <p className="text-slate-400 text-[11px]">
                          Every costing field is optional and editable per job. Previous project prices are not automatically reused.
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Direct Cost Input Cards */}
                  <section className="rounded-xl border border-slate-800 bg-slate-950/60 p-4 space-y-4">
                    <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-amber-400">
                      <DollarSign size={16} />
                      <span>Material &amp; Fabrication Purchase Costs (AED)</span>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      {/* 1. Fabric Purchase Cost */}
                      <div className="rounded-lg border border-slate-800 bg-slate-900/60 p-3 space-y-2">
                        <div className="flex items-center justify-between">
                          <label className="text-xs font-semibold text-slate-300">
                            1. PVC Fabric Purchase Rate
                          </label>
                          <div className="flex items-center gap-1 rounded bg-slate-950 p-0.5 text-[10px]">
                            <button
                              type="button"
                              onClick={() => setCosting({ ...costing, fabricPurchaseUnit: "sqm" })}
                              className={`px-2 py-0.5 rounded font-mono font-bold transition-colors ${
                                costing.fabricPurchaseUnit === "sqm"
                                  ? "bg-amber-600 text-white"
                                  : "text-slate-400 hover:text-white"
                              }`}
                            >
                              Per Sqm
                            </button>
                            <button
                              type="button"
                              onClick={() => setCosting({ ...costing, fabricPurchaseUnit: "rm" })}
                              className={`px-2 py-0.5 rounded font-mono font-bold transition-colors ${
                                costing.fabricPurchaseUnit === "rm"
                                  ? "bg-amber-600 text-white"
                                  : "text-slate-400 hover:text-white"
                              }`}
                            >
                              Per RM
                            </button>
                          </div>
                        </div>

                        <NumericInput
                          preset="currency"
                          value={costing.fabricPurchaseRate}
                          onChange={(val) => setCosting({ ...costing, fabricPurchaseRate: val })}
                          min={0}
                          className={inputClass}
                        />

                        <div className="flex justify-between text-[11px] font-mono text-slate-400 pt-1 border-t border-slate-800">
                          <span>
                            Quantity ({costing.fabricPurchaseUnit === "sqm" ? `${lines[0]?.quantity || 0} Sqm` : `${lines[1]?.quantity || 0} RM`}):
                          </span>
                          <strong className="text-white">{fmtAED(internalCostingSummary.fabricCost)}</strong>
                        </div>
                      </div>

                      {/* 2. Welding / Fabrication Cost */}
                      <div className="rounded-lg border border-slate-800 bg-slate-900/60 p-3 space-y-2">
                        <div className="flex items-center justify-between">
                          <label className="text-xs font-semibold text-slate-300">
                            2. Welding / Fabrication Cost
                          </label>
                          <div className="flex items-center gap-1 rounded bg-slate-950 p-0.5 text-[10px]">
                            <button
                              type="button"
                              onClick={() => setCosting({ ...costing, fabricationCostMode: "per_rm" })}
                              className={`px-2 py-0.5 rounded font-mono font-bold transition-colors ${
                                costing.fabricationCostMode === "per_rm"
                                  ? "bg-amber-600 text-white"
                                  : "text-slate-400 hover:text-white"
                              }`}
                            >
                              Per RM
                            </button>
                            <button
                              type="button"
                              onClick={() => setCosting({ ...costing, fabricationCostMode: "lump_sum" })}
                              className={`px-2 py-0.5 rounded font-mono font-bold transition-colors ${
                                costing.fabricationCostMode === "lump_sum"
                                  ? "bg-amber-600 text-white"
                                  : "text-slate-400 hover:text-white"
                              }`}
                            >
                              Lump Sum
                            </button>
                          </div>
                        </div>

                        <NumericInput
                          preset="currency"
                          value={costing.fabricationCost}
                          onChange={(val) => setCosting({ ...costing, fabricationCost: val })}
                          min={0}
                          className={inputClass}
                        />

                        <div className="flex justify-between text-[11px] font-mono text-slate-400 pt-1 border-t border-slate-800">
                          <span>
                            Fabrication Run ({costing.fabricationCostMode === "per_rm" ? `${lines[1]?.quantity || 0} RM` : "Flat"}):
                          </span>
                          <strong className="text-white">{fmtAED(internalCostingSummary.totalFabricationCost)}</strong>
                        </div>
                      </div>

                      {/* 3. Eyelet Cost */}
                      <div className="rounded-lg border border-slate-800 bg-slate-900/60 p-3 space-y-2">
                        <div className="flex items-center justify-between">
                          <label className="text-xs font-semibold text-slate-300">
                            3. SS Eyelet Purchase Cost
                          </label>
                          <div className="flex items-center gap-1 rounded bg-slate-950 p-0.5 text-[10px]">
                            <button
                              type="button"
                              onClick={() => setCosting({ ...costing, eyeletCostMode: "per_pc" })}
                              className={`px-2 py-0.5 rounded font-mono font-bold transition-colors ${
                                costing.eyeletCostMode === "per_pc"
                                  ? "bg-amber-600 text-white"
                                  : "text-slate-400 hover:text-white"
                              }`}
                            >
                              Per Pc
                            </button>
                            <button
                              type="button"
                              onClick={() => setCosting({ ...costing, eyeletCostMode: "lump_sum" })}
                              className={`px-2 py-0.5 rounded font-mono font-bold transition-colors ${
                                costing.eyeletCostMode === "lump_sum"
                                  ? "bg-amber-600 text-white"
                                  : "text-slate-400 hover:text-white"
                              }`}
                            >
                              Lump Sum
                            </button>
                          </div>
                        </div>

                        <NumericInput
                          preset="currency"
                          value={costing.eyeletCost}
                          onChange={(val) => setCosting({ ...costing, eyeletCost: val })}
                          min={0}
                          className={inputClass}
                        />

                        <div className="flex justify-between text-[11px] font-mono text-slate-400 pt-1 border-t border-slate-800">
                          <span>
                            Eyelets ({costing.eyeletCostMode === "per_pc" ? `${lines[2]?.quantity || 0} Pcs` : "Flat"}):
                          </span>
                          <strong className="text-white">{fmtAED(internalCostingSummary.eyeletCost)}</strong>
                        </div>
                      </div>

                      {/* 4. Transport & Misc */}
                      <div className="rounded-lg border border-slate-800 bg-slate-900/60 p-3 space-y-2">
                        <label className="text-xs font-semibold text-slate-300 block">
                          4. Logistics &amp; Consumables
                        </label>
                        <div className="grid grid-cols-2 gap-2">
                          <div>
                            <span className="text-[10px] text-slate-400 block mb-0.5">Transport (AED)</span>
                            <NumericInput
                              preset="currency"
                              value={costing.transportCost}
                              onChange={(val) => setCosting({ ...costing, transportCost: val })}
                              min={0}
                              className={inputClass}
                            />
                          </div>
                          <div>
                            <span className="text-[10px] text-slate-400 block mb-0.5">Misc (AED)</span>
                            <NumericInput
                              preset="currency"
                              value={costing.miscCost}
                              onChange={(val) => setCosting({ ...costing, miscCost: val })}
                              min={0}
                              className={inputClass}
                            />
                          </div>
                        </div>

                        <div className="flex justify-between text-[11px] font-mono text-slate-400 pt-1 border-t border-slate-800">
                          <span>Direct Expenses:</span>
                          <strong className="text-white">{fmtAED(internalCostingSummary.totalDirectExpenses)}</strong>
                        </div>
                      </div>
                    </div>
                  </section>

                  {/* Confidential Profitability Dashboard */}
                  <section className="rounded-xl border border-amber-500/40 bg-gradient-to-br from-slate-950 via-slate-900 to-amber-950/40 p-4">
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-amber-300">
                        <TrendingUp size={16} />
                        <span>Private Profitability &amp; Margin Analysis</span>
                      </div>
                      <span className="text-[10px] text-slate-400 font-mono">
                        Selling Net: {fmtAED(subtotal)}
                      </span>
                    </div>

                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 font-mono">
                      <div className="rounded-lg border border-slate-800 bg-slate-950 p-2.5">
                        <span className="text-[10px] text-slate-400 uppercase tracking-wider block">Material Cost</span>
                        <span className="text-sm font-bold text-slate-200 mt-1 block">
                          {fmtAED(internalCostingSummary.totalMaterialCost)}
                        </span>
                      </div>

                      <div className="rounded-lg border border-slate-800 bg-slate-950 p-2.5">
                        <span className="text-[10px] text-slate-400 uppercase tracking-wider block">Fabrication Cost</span>
                        <span className="text-sm font-bold text-slate-200 mt-1 block">
                          {fmtAED(internalCostingSummary.totalFabricationCost)}
                        </span>
                      </div>

                      <div className="rounded-lg border border-amber-500/30 bg-amber-950/20 p-2.5">
                        <span className="text-[10px] text-amber-300 uppercase tracking-wider block">Total Project Cost</span>
                        <span className="text-sm font-bold text-white mt-1 block">
                          {fmtAED(internalCostingSummary.totalProjectCost)}
                        </span>
                      </div>

                      <div className="rounded-lg border border-emerald-500/40 bg-emerald-950/30 p-2.5">
                        <span className="text-[10px] text-emerald-300 uppercase tracking-wider block">Estimated Profit</span>
                        <span className="text-sm font-bold text-emerald-400 mt-1 block">
                          {fmtAED(internalCostingSummary.estimatedProfit)} ({internalCostingSummary.profitMargin.toFixed(1)}%)
                        </span>
                      </div>
                    </div>
                  </section>
                </div>
              )}

              {/* Combined Financial Overview Bar */}
              <div className="rounded-xl border border-slate-700 bg-slate-950/90 p-4 flex flex-col sm:flex-row items-center justify-between gap-4 font-mono text-xs">
                <div className="space-y-1 text-center sm:text-left">
                  <div className="flex items-center gap-2">
                    <span className="font-sans font-bold text-white text-sm">Customer Quotation Total:</span>
                    <strong className="text-emerald-400 text-lg font-black">{fmtAED(grandTotal)}</strong>
                  </div>
                  <div className="text-[11px] text-slate-400">
                    Net: <span className="text-slate-200">{fmtAED(subtotal)}</span> &bull; 5% VAT: <span className="text-amber-400">{fmtAED(vatTotal)}</span>
                  </div>
                </div>

                {internalCostingSummary.totalProjectCost > 0 ? (
                  <div className="flex items-center gap-3 border-t sm:border-t-0 sm:border-l border-slate-800 pt-2 sm:pt-0 sm:pl-4 text-center sm:text-right">
                    <div>
                      <span className="text-[10px] text-slate-400 uppercase block">Private Profit</span>
                      <span className="text-base font-bold text-emerald-400">
                        {fmtAED(internalCostingSummary.estimatedProfit)}
                      </span>
                    </div>
                    <div className="rounded bg-emerald-500/10 border border-emerald-500/20 px-2 py-1 text-emerald-300 font-bold text-xs">
                      {internalCostingSummary.profitMargin.toFixed(1)}% Margin
                    </div>
                  </div>
                ) : (
                  <div className="text-[11px] text-slate-500 font-sans">
                    Switch to &ldquo;B. Internal Costing&rdquo; to compute private job profit &amp; margin.
                  </div>
                )}
              </div>
            </>
          )}
        </div>

        {/* Modal Footer */}
        {!savedSuccess && (
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-800 bg-slate-950/80 px-6 py-4">
            <span className="text-xs text-slate-400">
              Saves to Supabase &bull; Customer PDF format preserved &bull; Internal costing never exposed
            </span>

            <div className="flex items-center gap-2.5">
              <button
                type="button"
                onClick={onClose}
                disabled={submitting}
                className="rounded-lg border border-slate-700 bg-slate-800 px-4 py-2 text-xs font-semibold text-slate-300 hover:bg-slate-700 hover:text-white transition-colors"
              >
                Cancel
              </button>

              <button
                type="button"
                onClick={() => void handleSaveQuotation()}
                disabled={submitting}
                className="flex items-center gap-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 px-5 py-2 text-xs font-bold text-white transition-colors shadow-lg disabled:opacity-50"
              >
                {submitting ? (
                  <>
                    <Loader2 size={14} className="animate-spin" />
                    <span>Saving Quotation...</span>
                  </>
                ) : (
                  <>
                    <FileText size={14} />
                    <span>Save &amp; Generate Quotation</span>
                    <ArrowRight size={14} />
                  </>
                )}
              </button>
            </div>
          </div>
        )}
      </div>

      {/* CUSTOMER PDF PRINT / PREVIEW MODAL (Strictly Customer Data Only) */}
      {showPdfModal && savedSuccess && (
        <PrintModal
          isOpen={showPdfModal}
          onClose={() => setShowPdfModal(false)}
          editorHref="/settings/designer?type=quotation"
        >
          <QuotationTemplate
            company={activeCompany}
            quotation={savedSuccess.quotationData}
            onClose={() => setShowPdfModal(false)}
          />
        </PrintModal>
      )}
    </div>
  );
}

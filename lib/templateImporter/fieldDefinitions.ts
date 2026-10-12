/**
 * Dubai ERP: PDF Designer - Field Definitions & Dynamic Token Mapping
 * Maps ERP entity properties to standard tokens like {customer_name}, {document_number}, etc.
 */

export interface ErpFieldDefinition {
  token: string; // e.g. "{customer_name}"
  key: string;   // e.g. "customer_name"
  label: string;
  category: "company" | "document" | "customer" | "supplier" | "financial" | "hr" | "table";
  description: string;
  sampleValue: string;
  matchPatterns: RegExp[]; // Heuristics for auto-detecting this field in imported documents
}

export const ERP_FIELD_DEFINITIONS: ErpFieldDefinition[] = [
  // ── Company / Brand ───────────────────────────────────────────────────────────
  {
    token: "{company_name}",
    key: "company_name",
    label: "Company Name",
    category: "company",
    description: "Legal registered business name",
    sampleValue: "DUBAI ENTERPRISE ERP L.L.C",
    matchPatterns: [/dubai enterprise/i, /l\.?l\.?c/i, /company\s*name/i, /trading\s*co/i, /contracting/i],
  },
  {
    token: "{company_trn}",
    key: "company_trn",
    label: "Company TRN / Tax ID",
    category: "company",
    description: "UAE 15-digit Federal Tax Authority TRN",
    sampleValue: "100519014200003",
    matchPatterns: [/trn\b/i, /tax\s*reg/i, /vat\s*reg/i, /100\d{12}/],
  },
  {
    token: "{company_address}",
    key: "company_address",
    label: "Company Address",
    category: "company",
    description: "Office address, Emirate & UAE P.O. Box",
    sampleValue: "Industrial Area 13, P.O. Box 45000, Sharjah, United Arab Emirates",
    matchPatterns: [/p\.?o\.?\s*box/i, /industrial\s*area/i, /sharjah/i, /dubai,\s*uae/i],
  },
  {
    token: "{company_phone}",
    key: "company_phone",
    label: "Company Telephone",
    category: "company",
    description: "Main office phone / mobile",
    sampleValue: "+971 4 399 0000",
    matchPatterns: [/tel\b/i, /phone\b/i, /\+971/i, /fax\b/i],
  },
  {
    token: "{company_email}",
    key: "company_email",
    label: "Company Email",
    category: "company",
    description: "Official contact email address",
    sampleValue: "info@dubaierp.ae",
    matchPatterns: [/email\b/i, /@.*\.ae\b/i, /info@/i],
  },
  {
    token: "{company_website}",
    key: "company_website",
    label: "Company Website",
    category: "company",
    description: "Company domain website",
    sampleValue: "www.dubaierp.ae",
    matchPatterns: [/www\./i, /\.ae\b/i, /website\b/i],
  },

  // ── Document Metadata ───────────────────────────────────────────────────────
  {
    token: "{document_number}",
    key: "document_number",
    label: "Document Number / Reference",
    category: "document",
    description: "Invoice/Quote/PO reference number",
    sampleValue: "INV-2026-0042",
    matchPatterns: [/inv[-_]?\d+/i, /qt[-_]?\d+/i, /po[-_]?\d+/i, /ref(?:erence)?\s*[:#]/i, /invoice\s*no/i, /quote\s*no/i],
  },
  {
    token: "{document_date}",
    key: "document_date",
    label: "Document Date",
    category: "document",
    description: "Date of issue / document date",
    sampleValue: "12 Oct 2026",
    matchPatterns: [/date\s*[:#]/i, /issue\s*date/i, /dated/i, /\d{1,2}[-/.]\d{1,2}[-/.]\d{2,4}/],
  },
  {
    token: "{due_date}",
    key: "due_date",
    label: "Payment Due Date",
    category: "document",
    description: "Payment or settlement deadline",
    sampleValue: "11 Nov 2026",
    matchPatterns: [/due\s*date/i, /payment\s*due/i, /valid\s*until/i],
  },
  {
    token: "{supply_date}",
    key: "supply_date",
    label: "Date of Supply",
    category: "document",
    description: "UAE VAT Date of Supply / Delivery date",
    sampleValue: "12 Oct 2026",
    matchPatterns: [/supply\s*date/i, /delivery\s*date/i],
  },
  {
    token: "{payment_terms}",
    key: "payment_terms",
    label: "Payment Terms",
    category: "document",
    description: "Payment conditions or credit duration",
    sampleValue: "30 Days from Invoice Date / CDC Cheque",
    matchPatterns: [/payment\s*terms/i, /credit\s*terms/i, /terms\s*[:#]/i],
  },
  {
    token: "{project_name}",
    key: "project_name",
    label: "Project Name",
    category: "document",
    description: "Associated project title",
    sampleValue: "Luxury Majlis & Event Tents Facility",
    matchPatterns: [/project\s*[:#]/i, /project\s*name/i, /site\s*[:#]/i],
  },
  {
    token: "{project_number}",
    key: "project_number",
    label: "Project Code / Number",
    category: "document",
    description: "Internal ERP project identifier",
    sampleValue: "PRJ-2026-088",
    matchPatterns: [/prj[-_]?\d+/i, /project\s*no/i],
  },

  // ── Customer / Client Details ───────────────────────────────────────────────
  {
    token: "{customer_name}",
    key: "customer_name",
    label: "Customer / Client Name",
    category: "customer",
    description: "Full legal customer name",
    sampleValue: "AL NABOODAH CONTRACTING CO. L.L.C",
    matchPatterns: [/bill\s*to/i, /customer/i, /client/i, /m\/s\.?/i, /buyer/i, /al\s+naboodah/i],
  },
  {
    token: "{customer_trn}",
    key: "customer_trn",
    label: "Customer TRN",
    category: "customer",
    description: "Customer 15-digit UAE TRN",
    sampleValue: "100345678900003",
    matchPatterns: [/customer\s*trn/i, /client\s*trn/i, /buyer\s*trn/i],
  },
  {
    token: "{customer_address}",
    key: "customer_address",
    label: "Customer Address",
    category: "customer",
    description: "Customer office, city or P.O. Box",
    sampleValue: "Sheikh Zayed Road, P.O. Box 1234, Dubai, UAE",
    matchPatterns: [/address\s*[:#]/i, /sheikh\s*zayed/i, /dubai,\s*uae/i],
  },
  {
    token: "{contact_person}",
    key: "contact_person",
    label: "Contact Person / Attention",
    category: "customer",
    description: "Individual contact name",
    sampleValue: "Eng. Tariq Mansoor",
    matchPatterns: [/attn\b/i, /attention\b/i, /contact\s*person/i],
  },
  {
    token: "{contact_number}",
    key: "contact_number",
    label: "Customer Contact Number",
    category: "customer",
    description: "Customer telephone or mobile",
    sampleValue: "+971 4 399 0000",
    matchPatterns: [/mob\b/i, /customer\s*tel/i],
  },

  // ── Supplier / Vendor ───────────────────────────────────────────────────────
  {
    token: "{supplier_name}",
    key: "supplier_name",
    label: "Supplier / Vendor Name",
    category: "supplier",
    description: "Supplier entity name",
    sampleValue: "EMIRATES STEEL ARKAN P.J.S.C",
    matchPatterns: [/vendor/i, /supplier/i, /emirates\s*steel/i],
  },
  {
    token: "{supplier_trn}",
    key: "supplier_trn",
    label: "Supplier TRN",
    category: "supplier",
    description: "Supplier UAE TRN",
    sampleValue: "100234567800003",
    matchPatterns: [/supplier\s*trn/i, /vendor\s*trn/i],
  },

  // ── Financial Totals ────────────────────────────────────────────────────────
  {
    token: "{subtotal}",
    key: "subtotal",
    label: "Subtotal (Excl. VAT)",
    category: "financial",
    description: "Net amount before tax",
    sampleValue: "129,150.00",
    matchPatterns: [/subtotal/i, /total\s*excl/i, /taxable\s*amount/i, /net\s*amount/i],
  },
  {
    token: "{vat}",
    key: "vat",
    label: "VAT Total (5%)",
    category: "financial",
    description: "5% VAT tax total in AED",
    sampleValue: "6,457.50",
    matchPatterns: [/vat\s*\(?5%\)?/i, /vat\s*total/i, /tax\s*amount/i, /vat\s*amount/i],
  },
  {
    token: "{grand_total}",
    key: "grand_total",
    label: "Grand Total (Incl. VAT)",
    category: "financial",
    description: "Final gross total in AED",
    sampleValue: "135,607.50",
    matchPatterns: [/grand\s*total/i, /total\s*aed/i, /net\s*payable/i, /amount\s*due/i, /gross\s*total/i],
  },
  {
    token: "{amount_in_words}",
    key: "amount_in_words",
    label: "Amount in Words",
    category: "financial",
    description: "Formal currency words in English / Arabic",
    sampleValue: "One Hundred Thirty-Five Thousand Six Hundred Seven Dirhams and 50/100 Only",
    matchPatterns: [/amount\s*in\s*words/i, /dirhams\s*only/i, /المبلغ\s*بالحروف/],
  },

  // ── HR & Payroll ────────────────────────────────────────────────────────────
  {
    token: "{employee_name}",
    key: "employee_name",
    label: "Employee Name",
    category: "hr",
    description: "Labourer or staff full name",
    sampleValue: "Muhammad Rashid Khan",
    matchPatterns: [/employee\s*name/i, /worker\s*name/i, /staff\s*name/i, /labourer/i],
  },
  {
    token: "{employee_number}",
    key: "employee_number",
    label: "Employee Code / ID",
    category: "hr",
    description: "EMP-01, EMP-02 format employee code",
    sampleValue: "EMP-01",
    matchPatterns: [/emp[-_]?\d+/i, /employee\s*id/i, /badge\s*no/i],
  },
  {
    token: "{designation}",
    key: "designation",
    label: "Designation / Trade",
    category: "hr",
    description: "Job position or trade (e.g. Fabricator)",
    sampleValue: "PVC Fabricator & Welder",
    matchPatterns: [/designation/i, /position/i, /trade/i, /job\s*title/i],
  },
  {
    token: "{basic_salary}",
    key: "basic_salary",
    label: "Basic Salary",
    category: "hr",
    description: "Monthly basic salary in AED",
    sampleValue: "2,500.00",
    matchPatterns: [/basic\s*salary/i, /basic\s*pay/i],
  },
  {
    token: "{overtime_hours}",
    key: "overtime_hours",
    label: "Overtime Hours",
    category: "hr",
    description: "Total monthly overtime hours logged",
    sampleValue: "42.5",
    matchPatterns: [/overtime\s*hours/i, /overtime\s*hrs/i, /ot\s*hours/i, /ot\s*hrs/i],
  },
  {
    token: "{overtime_amount}",
    key: "overtime_amount",
    label: "Overtime Pay Amount",
    category: "hr",
    description: "Overtime compensation calculated in AED",
    sampleValue: "664.06",
    matchPatterns: [/ot\s*amount/i, /overtime\s*amount/i, /ot\s*pay/i],
  },
  {
    token: "{allowances}",
    key: "allowances",
    label: "Allowances",
    category: "hr",
    description: "Housing, transport and other allowances",
    sampleValue: "1,500.00",
    matchPatterns: [/allowance/i, /housing/i, /transportation/i],
  },
  {
    token: "{deductions}",
    key: "deductions",
    label: "Deductions",
    category: "hr",
    description: "Salary deductions, unpaid leave or advances",
    sampleValue: "0.00",
    matchPatterns: [/deductions?/i],
  },
  {
    token: "{net_salary}",
    key: "net_salary",
    label: "Net Salary / Net Pay",
    category: "hr",
    description: "Final take-home pay amount",
    sampleValue: "3,164.06",
    matchPatterns: [/net\s*salary/i, /net\s*pay/i, /take\s*home/i],
  },

  // ── Table Placeholder ───────────────────────────────────────────────────────
  {
    token: "{items}",
    key: "items",
    label: "Repeating Line Items Table",
    category: "table",
    description: "Dynamic table rows for items, description, quantities and rates",
    sampleValue: "[Dynamic Repeating Rows]",
    matchPatterns: [/item\s*description/i, /description/i, /unit\s*price/i, /qty/i],
  },
];

/**
 * Given text from an imported document, tests heuristic regexes to suggest the best ERP token.
 */
export function detectFieldTokenFromText(text: string): ErpFieldDefinition | null {
  if (!text || text.trim().length === 0) return null;
  const clean = text.trim();

  for (const field of ERP_FIELD_DEFINITIONS) {
    if (field.category === "table") continue; // handled separately
    for (const pattern of field.matchPatterns) {
      if (pattern.test(clean)) {
        return field;
      }
    }
  }

  return null;
}

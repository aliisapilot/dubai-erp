/**
 * Central PDF Filename & Document Title Engine
 * ============================================
 * Generates standardized, human-readable PDF filenames and browser print titles
 * following the authoritative Dubai ERP invoice naming style:
 *
 * Sales Documents:
 *   [Document Number] [Customer Name] - [Work Description].pdf
 *   e.g. INV145-26 Al Fajar Al Mashreq Shades & Tents Fix LLC - PVC Fabrication.pdf
 *   e.g. QT001-26 Al Fajar Al Mashreq Shades & Tents Fix LLC - PVC Fabrication.pdf
 *   e.g. PI001-26 Al Karwan Solution FZC - PVC Water Tank Liner.pdf
 *   e.g. DN001-26 Elegance Tents And Sheds Installation - HDPE Fabrication.pdf
 *   e.g. RV007-26 Al Fajar Al Mashreq Shades & Tents Fix LLC - Payment.pdf
 *
 * Purchasing Documents:
 *   [Document Number] [Supplier Name] - [Purchase Description].pdf
 *   e.g. PO001-26 Supplier Name - PVC Fabric Purchase.pdf
 *   Supplier Statement [Supplier Name] - [Period].pdf
 *   e.g. Supplier Statement Supplier Name - November 2026.pdf
 *
 * Customer Statements / SOA:
 *   [Saved SOA Number] [Customer Name] - Statement of Account.pdf
 *   e.g. SOA001-26 Customer Name - Statement of Account.pdf
 *   SOA [Customer Name] - [Period].pdf (when no saved SOA number)
 *   e.g. SOA Customer Name - November 2026.pdf
 *
 * HR and Payroll:
 *   Attendance [Period].pdf                 -> Attendance November 2026.pdf
 *   Overtime [Period].pdf                   -> Overtime November 2026.pdf
 *   Overtime [Employee Name] - [Period].pdf -> Overtime Imran Khan - November 2026.pdf
 *   Payroll Summary [Period].pdf            -> Payroll Summary November 2026.pdf
 *   Salary Statement [Employee Name] - [Period].pdf -> Salary Statement Rahmat Ali Khan - November 2026.pdf
 *   Payslip [Employee Name] - [Period].pdf  -> Payslip Rahmat Ali Khan - November 2026.pdf
 *   [Voucher Number] [Employee Name] - Salary [Period].pdf -> PV001-26 Rahmat Ali Khan - Salary November 2026.pdf
 *
 * Other ERP Documents:
 *   Measurement Sheet [Customer Name] - [Description].pdf
 *   Project [Project Number] [Customer Name] - [Description].pdf
 */

export interface DocumentFilenameInput {
  docType?: string | null;
  documentType?: string | null;
  docNumber?: string | null;
  documentNumber?: string | null;
  partyName?: string | null;
  customerName?: string | null;
  supplierName?: string | null;
  employeeName?: string | null;
  workDescription?: string | null;
  scopeOfWork?: string | null;
  projectName?: string | null;
  subject?: string | null;
  title?: string | null;
  notes?: string | null;
  items?: Array<{ description?: string | null; [key: string]: unknown }> | null;
  date?: string | null;
  period?: string | null;
  year?: number | null;
  month?: number | null;
  voucherNumber?: string | null;
  fallbackPrefix?: string | null;
}

const MONTH_NAMES = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

/**
 * Sanitizes a string for use in Windows and Unix file systems.
 * Preserves normal spaces, hyphens, and ampersands.
 * Removes forbidden characters: < > : " / \ | ? * and ASCII control characters.
 * Trims leading/trailing spaces and forbidden trailing dots.
 */
export function sanitizeFilenamePart(input?: string | null): string {
  if (!input) return "";
  return input
    .replace(/[<>:"/\\|?*\x00-\x1F]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/[. ]+$/, "");
}

/**
 * Formats an ISO or standard date into DD-MM-YYYY
 */
export function formatFilenameDate(dateStr?: string | null): string {
  if (!dateStr) return "";
  try {
    const cleanDateOnly = dateStr.trim().split("T")[0].trim();
    const parts = cleanDateOnly.split(/[-/]/);
    if (parts.length === 3) {
      if (parts[0].length === 4) {
        // YYYY-MM-DD
        const [year, month, day] = parts;
        return `${day.padStart(2, "0")}-${month.padStart(2, "0")}-${year}`;
      } else if (parts[2].length === 4) {
        // DD-MM-YYYY
        const [day, month, year] = parts;
        return `${day.padStart(2, "0")}-${month.padStart(2, "0")}-${year}`;
      }
    }
    const d = new Date(dateStr);
    if (!isNaN(d.getTime())) {
      const day = String(d.getDate()).padStart(2, "0");
      const month = String(d.getMonth() + 1).padStart(2, "0");
      const year = d.getFullYear();
      return `${day}-${month}-${year}`;
    }
  } catch {
    // fallback to sanitized raw
  }
  return sanitizeFilenamePart(dateStr);
}

/**
 * Formats a period string into e.g. "November 2026"
 */
export function formatFilenamePeriod(
  periodOrDate?: string | null,
  year?: number | null,
  month?: number | null
): string {
  if (month && year && month >= 1 && month <= 12) {
    return `${MONTH_NAMES[month - 1]} ${year}`;
  }
  if (!periodOrDate) {
    const now = new Date();
    return `${MONTH_NAMES[now.getMonth()]} ${now.getFullYear()}`;
  }
  const str = String(periodOrDate).trim();
  for (const m of MONTH_NAMES) {
    if (str.toLowerCase().includes(m.toLowerCase())) {
      const yrMatch = str.match(/\b(20\d\d)\b/);
      return yrMatch ? `${m} ${yrMatch[1]}` : str;
    }
  }
  const match = str.match(/^(\d{4})[-/](\d{1,2})/);
  if (match) {
    const y = parseInt(match[1], 10);
    const mo = parseInt(match[2], 10);
    if (mo >= 1 && mo <= 12) {
      return `${MONTH_NAMES[mo - 1]} ${y}`;
    }
  }
  return sanitizeFilenamePart(str);
}

/**
 * Normalizes document type strings into canonical identifier
 */
export function normalizeDocType(type?: string | null): string {
  if (!type) return "document";
  return type.toLowerCase().replace(/[-_\s]/g, "");
}

/**
 * Resolves a concise, professional work description from document data.
 * Priority:
 * 1. Saved work description or project name
 * 2. Saved subject/title
 * 3. Concise description from document items if unambiguous
 * 4. Fallback based on document type
 */
export function resolveWorkDescription(input: DocumentFilenameInput, normType: string): string {
  // 1. Explicit work description or project name
  const candidate1 = input.workDescription || input.scopeOfWork || input.projectName;
  if (candidate1 && candidate1.trim()) {
    return cleanWorkDescription(candidate1);
  }

  // 2. Saved subject or title
  const candidate2 = input.subject || input.title;
  if (candidate2 && candidate2.trim()) {
    return cleanWorkDescription(candidate2);
  }

  // 3. Concise item description if unambiguous
  if (input.items && Array.isArray(input.items) && input.items.length > 0) {
    const firstItemDesc = input.items[0]?.description;
    if (firstItemDesc && firstItemDesc.trim()) {
      const cleaned = cleanWorkDescription(firstItemDesc);
      if (cleaned && cleaned.length <= 40) {
        return cleaned;
      }
    }
  }

  // 4. Meaningful document-type fallback
  if (normType.includes("receipt") || normType === "rv") return "Payment";
  if (normType.includes("purchaseorder") || normType === "po") return "Purchase";
  if (normType.includes("delivery") || normType === "dn") return "Delivery";
  if (normType.includes("quotation") || normType === "quo" || normType === "qt") return "Fabrication";
  if (normType.includes("proforma") || normType === "pi") return "Fabrication";
  if (normType.includes("taxinvoice") || normType === "invoice" || normType === "inv") return "PVC Fabrication";
  if (normType.includes("measurement") || normType === "ms") return "Measurement";

  return "";
}

/**
 * Cleans and trims work description into a concise human-readable phrase
 */
function cleanWorkDescription(text: string): string {
  let s = sanitizeFilenamePart(text);
  s = s.replace(/[\r\n\t]+/g, " ").replace(/\s+/g, " ").trim();
  s = s.replace(/[,;.-]+$/, "").trim();

  // If description matches known common patterns, normalize cleanly
  const lower = s.toLowerCase();
  if (lower.includes("pvc water tank liner") || lower.includes("water tank liner")) return "PVC Water Tank Liner";
  if (lower.includes("pvc fabric purchase") || (lower.includes("pvc") && lower.includes("fabric") && lower.includes("purchase"))) return "PVC Fabric Purchase";
  if (lower.includes("pvc fabrication") || (lower.includes("pvc") && lower.includes("fabrication"))) return "PVC Fabrication";
  if (lower.includes("hdpe fabrication") || (lower.includes("hdpe") && lower.includes("fabrication"))) return "HDPE Fabrication";
  if (lower.includes("shades") && lower.includes("tents")) return "Shades & Tents";
  if (lower.includes("payment")) return "Payment";

  // Truncate cleanly at word boundary if overly verbose
  if (s.length > 45) {
    const truncated = s.slice(0, 42);
    const lastSpace = truncated.lastIndexOf(" ");
    s = (lastSpace > 15 ? truncated.slice(0, lastSpace) : truncated).trim();
  }
  return s;
}

/**
 * Standard prefix mapping for fallbacks
 */
export function getDefaultDocPrefix(docType?: string | null): string {
  const norm = normalizeDocType(docType);
  if (norm.includes("taxinvoice") || norm === "invoice" || norm === "inv") return "INV";
  if (norm.includes("quotation") || norm === "quo" || norm === "qt") return "QT";
  if (norm.includes("proforma") || norm === "pi") return "PI";
  if (norm.includes("delivery") || norm === "dn") return "DN";
  if (norm.includes("purchaseorder") || norm === "po") return "PO";
  if (norm.includes("receipt") || norm === "rv") return "RV";
  if (norm.includes("statement") || norm === "soa") return "SOA";
  if (norm.includes("supplierbill") || norm === "bill") return "BILL";
  if (norm.includes("salary") || norm === "slip" || norm === "payslip") return "SAL";
  if (norm.includes("voucher") || norm === "epv" || norm === "pv") return "PV";
  if (norm.includes("measurement") || norm === "ms") return "MS";
  return "DOC";
}

/**
 * Computes the standardized document PDF filename and browser page title.
 */
export function generateDocumentPdfFilename(input: DocumentFilenameInput): {
  filename: string;
  title: string;
} {
  const normType = normalizeDocType(input.docType || input.documentType);

  const party = sanitizeFilenamePart(
    input.partyName || input.customerName || input.supplierName || input.employeeName
  );
  const rawDocNumber = sanitizeFilenamePart(
    input.docNumber || input.documentNumber || input.voucherNumber
  );
  const period = formatFilenamePeriod(input.period || input.date, input.year, input.month);

  let baseTitle = "";

  // 1. HR & PAYROLL DOCUMENTS
  if (
    normType === "attendance" ||
    normType.includes("attendancesheet") ||
    normType.includes("monthlyattendance")
  ) {
    baseTitle = `Attendance ${period}`.trim();
  } else if (normType === "employee_overtime" || normType === "employeeovertime") {
    const emp = party || sanitizeFilenamePart(input.employeeName) || "Employee";
    baseTitle = `Overtime ${emp} - ${period}`.trim();
  } else if (normType === "overtime" || normType.includes("overtimesheet")) {
    baseTitle = `Overtime ${period}`.trim();
  } else if (normType === "payroll_summary" || normType === "payrollsummary") {
    baseTitle = `Payroll Summary ${period}`.trim();
  } else if (
    normType === "salary_statement" ||
    normType === "salarystatement" ||
    normType === "sal"
  ) {
    const emp = party || sanitizeFilenamePart(input.employeeName) || "Employee";
    baseTitle = `Salary Statement ${emp} - ${period}`.trim();
  } else if (normType === "payslip" || normType === "salary_slip" || normType === "salaryslip") {
    const emp = party || sanitizeFilenamePart(input.employeeName) || "Employee";
    baseTitle = `Payslip ${emp} - ${period}`.trim();
  } else if (
    normType === "employee_payment_voucher" ||
    normType === "employeepaymentvoucher" ||
    normType === "epv" ||
    normType === "pv"
  ) {
    const emp = party || sanitizeFilenamePart(input.employeeName) || "Employee";
    const ref = rawDocNumber || "PV";
    baseTitle = `${ref} ${emp} - Salary ${period}`.trim();
  }
  // 2. SUPPLIER STATEMENTS
  else if (normType === "supplier_statement" || normType === "supplierstatement") {
    const supp = party || "Supplier";
    baseTitle = `Supplier Statement ${supp} - ${period}`.trim();
  }
  // 3. CUSTOMER STATEMENTS / SOA
  else if (
    normType === "customer_statement" ||
    normType === "customerstatement" ||
    normType === "soa" ||
    (normType.includes("statement") &&
      !normType.includes("salary") &&
      !normType.includes("supplier") &&
      !normType.includes("method"))
  ) {
    const cust = party || "Customer";
    if (rawDocNumber) {
      baseTitle = `${rawDocNumber} ${cust} - Statement of Account`.trim();
    } else {
      baseTitle = `SOA ${cust} - ${period}`.trim();
    }
  }
  // 4. MEASUREMENT SHEETS
  else if (normType === "measurement_sheet" || normType === "measurementsheet" || normType === "measurement") {
    const cust = party || "Customer";
    const desc = resolveWorkDescription(input, normType) || "Measurements";
    if (rawDocNumber) {
      baseTitle = `${rawDocNumber} ${cust} - ${desc}`.trim();
    } else {
      baseTitle = `Measurement Sheet ${cust} - ${desc}`.trim();
    }
  }
  // 5. SALES & PURCHASING STANDARD DOCUMENTS
  // Format: [Document Number] [Customer/Supplier Name] - [Work Description]
  else {
    const prefix = input.fallbackPrefix || getDefaultDocPrefix(input.docType || input.documentType);
    const ref = rawDocNumber || prefix;
    const workDesc = resolveWorkDescription(input, normType);

    if (party && workDesc) {
      baseTitle = `${ref} ${party} - ${workDesc}`.trim();
    } else if (party) {
      baseTitle = `${ref} ${party}`.trim();
    } else if (workDesc) {
      baseTitle = `${ref} - ${workDesc}`.trim();
    } else {
      baseTitle = ref || "Document";
    }
  }

  // Fallback if empty
  if (!baseTitle) {
    baseTitle = "Document";
  }

  // Ensure filename does not exceed Windows safe path lengths
  if (baseTitle.length > 180) {
    baseTitle = baseTitle.slice(0, 180).trim();
    baseTitle = baseTitle.replace(/[. ]+$/, "");
  }

  // Ensure .pdf is added exactly once
  const cleanTitle = sanitizeFilenamePart(baseTitle);
  const cleanFilename = cleanTitle.toLowerCase().endsWith(".pdf")
    ? cleanTitle
    : `${cleanTitle}.pdf`;

  return {
    title: cleanTitle,
    filename: cleanFilename,
  };
}

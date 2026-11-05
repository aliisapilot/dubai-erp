/**
 * Document PDF Filename & Title Formatter
 * Generates standardized, sanitized filenames and titles across all Dubai ERP documents.
 *
 * Examples:
 * - Quotation:         QUO-101 - Al Karwan Solution FZC.pdf
 * - Tax Invoice:       INV-117 - Al Fajar Al Mashreq.pdf
 * - Proforma Invoice:  PI-001 - Customer Name.pdf
 * - Delivery Note:     DN-001 - Customer Name.pdf
 * - Purchase Order:    PO-001 - Supplier Name.pdf
 * - Receipt Voucher:   RV-001 - Customer Name.pdf
 * - Customer Statement:SOA-001 - Al Fajar Al Mashreq - 05-11-2026.pdf
 * - Supplier Bill:     BILL-001 - Supplier Name.pdf
 * - Salary Statement:  SAL-2026-11 - Employee Name.pdf
 */

export interface DocumentFilenameInput {
  docType?: string | null;
  docNumber?: string | null;
  partyName?: string | null;
  date?: string | null;
  fallbackPrefix?: string | null;
}

/**
 * Sanitizes a string for use in Windows and Unix file systems.
 * Removes characters: < > : " / \ | ? * and ASCII control characters.
 */
export function sanitizeFilenamePart(input?: string | null): string {
  if (!input) return "";
  return input
    .replace(/[<>:"/\\|?*\x00-\x1F]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/[. ]+$/, ""); // Avoid trailing dots or spaces which Windows forbids
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
 * Standard doc type prefix mapping
 */
export function getDefaultDocPrefix(docType?: string | null): string {
  if (!docType) return "DOC";
  const norm = docType.toLowerCase().replace(/[-_\s]/g, "");
  if (norm.includes("taxinvoice") || norm === "invoice") return "INV";
  if (norm.includes("quotation")) return "QUO";
  if (norm.includes("proforma")) return "PI";
  if (norm.includes("delivery")) return "DN";
  if (norm.includes("purchaseorder") || norm === "po") return "PO";
  if (norm.includes("receipt") || norm.includes("voucher") || norm === "rv") return "RV";
  if (norm.includes("statement") || norm.includes("soa")) return "SOA";
  if (norm.includes("supplierbill") || norm.includes("bill")) return "BILL";
  if (norm.includes("salary") || norm.includes("payslip")) return "SAL";
  if (norm.includes("methodstatement") || norm === "wms") return "MS";
  return "DOC";
}

/**
 * Computes standard document filename and browser page title for printing/downloading.
 */
export function generateDocumentPdfFilename(input: DocumentFilenameInput): {
  filename: string;
  title: string;
} {
  const { docType, docNumber, partyName, date, fallbackPrefix } = input;

  const cleanParty = sanitizeFilenamePart(partyName);
  const cleanRef = sanitizeFilenamePart(docNumber);
  const prefix = fallbackPrefix || getDefaultDocPrefix(docType);

  // Normalize document reference
  let refPart = cleanRef;
  if (!refPart) {
    refPart = prefix;
  }

  const normType = (docType || "").toLowerCase().replace(/[-_\s]/g, "");
  const isCustomerStatement =
    normType.includes("customerstatement") ||
    normType === "soa" ||
    (normType.includes("statement") && !normType.includes("salary") && !normType.includes("method"));

  let baseTitle = "";

  if (isCustomerStatement) {
    const formattedDate = formatFilenameDate(date || new Date().toISOString());
    const segments = [refPart, cleanParty, formattedDate].filter(Boolean);
    baseTitle = segments.join(" - ");
  } else {
    const segments = [refPart, cleanParty].filter(Boolean);
    baseTitle = segments.join(" - ");
  }

  if (!baseTitle) {
    baseTitle = "Document";
  }

  // Ensure title is within reasonable length
  if (baseTitle.length > 180) {
    baseTitle = baseTitle.slice(0, 180).trim();
  }

  return {
    title: baseTitle,
    filename: `${baseTitle}.pdf`,
  };
}

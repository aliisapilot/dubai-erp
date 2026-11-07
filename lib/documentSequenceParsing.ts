export function extractHistoricalSequence(reference: string, prefixes: readonly string[]): number | null {
  const cleanRef = reference.trim().toUpperCase();
  const searchPrefixes = prefixes.length > 0 ? prefixes : [""];

  for (const candidate of searchPrefixes) {
    const p = candidate.toUpperCase();
    if (p && !cleanRef.startsWith(p)) continue;
    const tail = p ? cleanRef.slice(p.length).replace(/^[-_ /]+/, "") : cleanRef;
    if (!tail) continue;

    const patterns = [
      /^20\d{2}[-_ /]+(\d{1,9})$/,           // e.g. 2026-0145 -> 145
      /^(\d{1,9})[-_ /]+20\d{2}$/,           // e.g. 145-2026 -> 145
      /^\d{2}[-_ /]+(\d{1,9})$/,             // e.g. 26-0145 -> 145
      /^(\d{1,9})\/\d{1,2}\/\d{2,4}$/,       // e.g. 145/10/26 -> 145
      /^(\d{1,9})(?:[-/]\d{2})?$/,           // e.g. 145, 145-26, 031 -> 145, 31
    ];
    for (const pattern of patterns) {
      const match = tail.match(pattern);
      if (match) {
        const number = Number(match[1]);
        if (Number.isSafeInteger(number) && number > 0) return number;
      }
    }
  }

  // Fallback: If no candidate prefix matched, check if raw reference ends with sequence
  const fallbackPatterns = [
    /^[A-Z]{1,6}[-_ /]*20\d{2}[-_ /]+(\d{1,9})$/,
    /^[A-Z]{1,6}[-_ /]*(\d{1,9})[-_ /]+20\d{2}$/,
    /^[A-Z]{1,6}[-_ /]*(\d{1,9})(?:[-/]\d{2})?$/,
  ];
  for (const pattern of fallbackPatterns) {
    const match = cleanRef.match(pattern);
    if (match) {
      const number = Number(match[1]);
      if (Number.isSafeInteger(number) && number > 0) return number;
    }
  }

  return null;
}

export function nextSequenceFromReferences(
  references: readonly string[],
  prefixes: readonly string[],
  configuredMinimum = 1,
): number {
  let highest = Math.max(0, Math.floor(configuredMinimum) - 1);
  for (const reference of references) {
    if (!reference) continue;
    const sequence = extractHistoricalSequence(reference, prefixes);
    if (sequence !== null) highest = Math.max(highest, sequence);
  }
  return highest + 1;
}

export function getCommonDocPrefixes(docType: string, configuredPrefix?: string): string[] {
  const result: string[] = [];
  if (configuredPrefix?.trim()) result.push(configuredPrefix.trim().toUpperCase());

  const map: Record<string, string[]> = {
    tax_invoice: ["INV", "TAX", "TI", "INVOICE"],
    quotation: ["QUO", "QTN", "QT", "QUOTATION"],
    proforma_invoice: ["PI", "PRO", "PINV", "PROFORMA"],
    delivery_note: ["DN", "DLV", "DELIVERY"],
    purchase_order: ["PO", "PUR", "ORDER"],
    receipt_voucher: ["RV", "RCV", "RECEIPT"],
    customer_statement: ["SOA", "STMT", "STATEMENT"],
    supplier_bill: ["BILL", "SB"],
    salary_statement: ["SLIP", "SAL", "PAYSLIP"],
    employee_payment_voucher: ["EPV", "PAY", "PV"],
    project_handover: ["HO"],
    work_method_statement: ["WMS"],
  };

  const list = map[docType] || [];
  for (const item of list) {
    const upper = item.toUpperCase();
    if (!result.includes(upper)) result.push(upper);
  }
  return result;
}

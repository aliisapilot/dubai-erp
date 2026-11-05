/**
 * Dubai ERP: Smart Import - High-Precision Data Extractor
 * Deterministically extracts business entities, document numbers, line items,
 * financial totals, and measurements from parsed files while maintaining exact source evidence.
 */

import type {
  DocumentType,
  ExtractedField,
  ExtractedLineItem,
  ExtractedMeasurement,
  SourceLocation,
} from "./types";
import type { DocxParseResult } from "./parsers/docxParser";
import type { XlsxParseResult } from "./parsers/xlsxParser";
import type { PdfParseResult } from "./parsers/pdfParser";

export interface ExtractionOutput {
  fields: Record<string, ExtractedField>;
  items: ExtractedLineItem[];
  measurements?: ExtractedMeasurement;
  rawSummary: {
    sheetsCount?: number;
    tablesCount?: number;
    pagesCount?: number;
    rawSnippets: { location: string; text: string }[];
  };
}

function parseNumber(val: unknown): number | null {
  if (val === null || val === undefined) return null;
  if (typeof val === "number") return isNaN(val) ? null : val;
  let str = String(val).trim();
  // Fix spaces before decimal point: "6 .00" -> "6.00"
  str = str.replace(/(\d+)\s+\.\s*(\d+)/g, "$1.$2");
  // Fix spaces before/in comma thousands: "2 ,719.00" -> "2719.00"
  str = str.replace(/(\d+)\s*,\s*(\d+)/g, "$1$2");
  str = str.replace(/(\d+)\s+(\d{3})(?=[^\d]|$)/g, "$1$2");
  const cleaned = str.replace(/[^0-9.-]/g, "");
  const num = parseFloat(cleaned);
  return isNaN(num) ? null : num;
}

function parseDate(val: unknown): string | null {
  if (!val) return null;
  const str = String(val).trim();
  // Try YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(str)) return str;

  // Try DD/MM/YYYY or DD-MM-YYYY
  const dmy = str.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
  if (dmy) {
    const day = dmy[1].padStart(2, "0");
    const month = dmy[2].padStart(2, "0");
    const year = dmy[3];
    return `${year}-${month}-${day}`;
  }

  // Try parsing with Date
  const d = new Date(str);
  if (!isNaN(d.getTime())) {
    return d.toISOString().split("T")[0];
  }
  return null;
}

// Regex patterns for header fields
const PATTERNS = {
  trn: /\b(100\d{12})\b/i,
  email: /\b([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})\b/i,
  phone: /(?:(?:tel|phone|mobile|cell|contact)[:\s]*)?(\+?971[-\s]?\d{1,2}[-\s]?\d{3}[-\s]?\d{4}|\b05\d{1}[-\s]?\d{3}[-\s]?\d{4}\b)/i,
  docNumber: /\b(QTN[-/_#\w]+|INV[-/_#\w]+|TAX[-/_#\w]+|DN[-/_#\w]+|PO[-/_#\w]+|LPO[-/_#\w]+|EXP[-/_#\w]+|CHQ[-/_#\w]+)\b/i,
  currency: /\b(AED|USD|EUR|SAR)\b/i,
};

// -------------------------------------------------------------
// DOCX Extractor
// -------------------------------------------------------------
export function extractFromDocx(
  parsed: DocxParseResult,
  fileName: string,
  docType: DocumentType
): ExtractionOutput {
  const fields: Record<string, ExtractedField> = {};
  const items: ExtractedLineItem[] = [];
  let measurement: ExtractedMeasurement | undefined = undefined;

  const rawSnippets: { location: string; text: string }[] = parsed.sourceSnippets.map(s => ({
    location: s.location.table
      ? `Table ${s.location.table}, Row ${s.location.row}, Col ${s.location.col}`
      : `Paragraph ${s.location.paragraph}`,
    text: s.text,
  }));

  // 1. Filename heuristic deconstruction (e.g., 'INV132-26 Al Fajar - Pvc Fabrication.docx')
  const baseName = fileName.split(/[/\\]/).pop() || fileName;
  const fnTripleMatch = baseName.match(/^([A-Za-z0-9/_-]+)\s+(.+?)\s+-\s+(.+?)\.(docx|pdf|xlsx|csv)$/i);
  const fnDoubleMatch = !fnTripleMatch ? baseName.match(/^([A-Za-z0-9/_-]+)\s+(.+?)\.(docx|pdf|xlsx|csv)$/i) : null;

  const fnDocNo = fnTripleMatch ? fnTripleMatch[1].trim() : fnDoubleMatch ? fnDoubleMatch[1].trim() : null;
  const fnCustOrSupp = fnTripleMatch ? fnTripleMatch[2].trim() : fnDoubleMatch ? fnDoubleMatch[2].trim() : null;
  const fnProj = fnTripleMatch ? fnTripleMatch[3].trim() : null;

  // 2. Scan tables for Key-Value metadata pairs (e.g., Table 1 header tables)
  for (const table of parsed.tables) {
    const headerRow = table.rows[0];
    const headerTexts = headerRow.cells.map(c => c.text.toLowerCase().trim());
    let descCol = headerTexts.findIndex(h => /desc|particular|specification|service|scope|details/i.test(h));
    if (descCol === -1) {
      descCol = headerTexts.findIndex(h => /item/i.test(h) && !/item\s*(?:no|number|#|code|seq|id|sr)/i.test(h));
    }
    const isItemTable = descCol !== -1 && headerTexts.some(h => /qty|unit|rate|price|amount|total/i.test(h));

    if (!isItemTable) {
      for (const row of table.rows) {
        for (let i = 0; i < row.cells.length; i++) {
          const cell = row.cells[i];
          const text = cell.text.trim();
          const nextCell = row.cells[i + 1];
          const nextText = nextCell?.text?.trim() || "";
          const loc: SourceLocation = { file: fileName, table: table.tableIndex, row: row.rowIndex, col: cell.colIndex, rawText: text };

          // Customer / Supplier
          if (!fields.customer_name && !fields.supplier_name) {
            if (/^(?:company|customer(?:\s*name)?|client(?:\s*name)?|supplier(?:\s*name)?|vendor(?:\s*name)?|m\/s|sold\s*to|bill\s*to)$/i.test(text) && nextText) {
              if (!/al\s*safwah|golden\s*elite/i.test(nextText)) {
                const targetKey = docType === "purchase_order" || docType === "supplier_bill" ? "supplier_name" : "customer_name";
                fields[targetKey] = {
                  fieldKey: targetKey,
                  label: targetKey === "supplier_name" ? "Supplier Name" : "Customer Name",
                  value: nextText,
                  source: { ...loc, col: nextCell?.colIndex, rawText: `${text}: ${nextText}` },
                  confidence: 0.98,
                  validationStatus: "valid",
                  originalRawValue: nextText,
                };
              }
            } else if (/^to:\s*(.+)$/i.test(text)) {
              const custVal = text.replace(/^to:\s*/i, "").trim();
              if (custVal && !/al\s*safwah|golden\s*elite/i.test(custVal)) {
                const targetKey = docType === "purchase_order" || docType === "supplier_bill" ? "supplier_name" : "customer_name";
                fields[targetKey] = {
                  fieldKey: targetKey,
                  label: targetKey === "supplier_name" ? "Supplier Name" : "Customer Name",
                  value: custVal,
                  source: loc,
                  confidence: 0.95,
                  validationStatus: "valid",
                  originalRawValue: text,
                };
              }
            }
          }

          // Document Date
          if (!fields.document_date) {
            if (/^(?:date|dated)$/i.test(text) && nextText) {
              const pDate = parseDate(nextText);
              if (pDate) {
                fields.document_date = {
                  fieldKey: "document_date",
                  label: "Document Date",
                  value: pDate,
                  source: { ...loc, col: nextCell?.colIndex, rawText: `${text}: ${nextText}` },
                  confidence: 0.98,
                  validationStatus: "valid",
                  originalRawValue: nextText,
                };
              }
            } else {
              const dMatch = text.match(/(?:date|dated)[:\s]+([0-9]{1,2}[/-][0-9]{1,2}[/-][0-9]{2,4}|[0-9]{4}-[0-9]{2}-[0-9]{2})/i);
              if (dMatch) {
                const pDate = parseDate(dMatch[1]);
                if (pDate) {
                  fields.document_date = {
                    fieldKey: "document_date",
                    label: "Document Date",
                    value: pDate,
                    source: loc,
                    confidence: 0.95,
                    validationStatus: "valid",
                    originalRawValue: text,
                  };
                }
              }
            }
          }

          // Document Number
          if (!fields.document_number) {
            if (/^(?:invoice\s*(?:no\.?|number)|quotation\s*(?:no\.?|number)|qtn\s*(?:no\.?|number)|dn\s*(?:no\.?|number)|po\s*(?:no\.?|number)|lpo\s*(?:no\.?|number)|ref\s*(?:no\.?|number)|statement\s*(?:no\.?|number|#|ref)?|soa\s*(?:no\.?|number|#)?)$/i.test(text) && nextText) {
              fields.document_number = {
                fieldKey: "document_number",
                label: "Document Number",
                value: nextText,
                source: { ...loc, col: nextCell?.colIndex, rawText: `${text}: ${nextText}` },
                confidence: 0.98,
                validationStatus: "valid",
                originalRawValue: nextText,
              };
            } else {
              const dnMatch = text.match(/(?:invoice\s*(?:no\.?|number)|quotation\s*(?:no\.?|number)|qtn\s*(?:no\.?|number)|dn\s*(?:no\.?|number)|po\s*(?:no\.?|number)|ref\s*(?:no\.?|number)|statement\s*(?:no\.?|number|#|ref)|soa\s*(?:no\.?|number|#))[:\s]+([A-Za-z0-9/_-]+)/i);
              if (dnMatch) {
                fields.document_number = {
                  fieldKey: "document_number",
                  label: "Document Number",
                  value: dnMatch[1].trim(),
                  source: loc,
                  confidence: 0.95,
                  validationStatus: "valid",
                  originalRawValue: text,
                };
              }
            }
          }

          // TRN (Filter out company's own TRN 105319816200003)
          if (!fields.trn) {
            if (/^(?:trn\s*no\.?|customer\s*trn)$/i.test(text) && nextText) {
              const trnCandidate = nextText.replace(/[^0-9]/g, "");
              if (trnCandidate.length >= 15 && trnCandidate !== "105319816200003") {
                fields.trn = {
                  fieldKey: "trn",
                  label: "Tax Registration Number (TRN)",
                  value: trnCandidate,
                  source: { ...loc, col: nextCell?.colIndex, rawText: `${text}: ${nextText}` },
                  confidence: 0.99,
                  validationStatus: "valid",
                  originalRawValue: nextText,
                };
              }
            } else {
              const trnMatch = text.match(PATTERNS.trn);
              if (trnMatch && trnMatch[1] !== "105319816200003" && !/our\s*trn/i.test(text)) {
                fields.trn = {
                  fieldKey: "trn",
                  label: "Tax Registration Number (TRN)",
                  value: trnMatch[1],
                  source: loc,
                  confidence: 0.95,
                  validationStatus: "valid",
                  originalRawValue: text,
                };
              }
            }
          }

          // Location / Site
          if (!fields.location && /^(?:location|site|place)$/i.test(text) && nextText) {
            fields.location = {
              fieldKey: "location",
              label: "Location / Site",
              value: nextText,
              source: { ...loc, col: nextCell?.colIndex, rawText: `${text}: ${nextText}` },
              confidence: 0.9,
              validationStatus: "valid",
              originalRawValue: nextText,
            };
          }

          // Mobile / Phone
          if (!fields.phone) {
            const phMatch = text.match(PATTERNS.phone) || nextText.match(PATTERNS.phone);
            if (phMatch) {
              fields.phone = {
                fieldKey: "phone",
                label: "Phone / Mobile",
                value: phMatch[1],
                source: loc,
                confidence: 0.9,
                validationStatus: "valid",
                originalRawValue: phMatch[0],
              };
            }
          }

          // Email
          if (!fields.email) {
            const emMatch = text.match(PATTERNS.email) || nextText.match(PATTERNS.email);
            if (emMatch && !/goldenelitetents\.ae/i.test(emMatch[1])) {
              fields.email = {
                fieldKey: "email",
                label: "Email",
                value: emMatch[1],
                source: loc,
                confidence: 0.9,
                validationStatus: "valid",
                originalRawValue: emMatch[1],
              };
            }
          }
        }
      }
    }
  }

  // 3. Scan paragraphs for project, document number, date, and terms
  for (const p of parsed.paragraphs) {
    const text = p.text.trim();
    const loc: SourceLocation = { file: fileName, paragraph: p.index, rawText: text };

    // Project Name / Scope of Work
    if (!fields.project_name) {
      const projMatch =
        text.match(/(?:sub|scope\s*of\s*work|subject)[:\s]+(?:quotation\s*for\s*|invoice\s*for\s*)?([^\n]+)/i) ||
        text.match(/(?:project|site)[:\s.]+([A-Za-z0-9\s&.,\-]+)/i);
      if (projMatch && projMatch[1].trim().length > 3 && !/^(terms|al safwah|golden elite)/i.test(projMatch[1].trim())) {
        fields.project_name = {
          fieldKey: "project_name",
          label: "Project Name",
          value: projMatch[1].trim(),
          source: loc,
          confidence: 0.95,
          validationStatus: "valid",
          originalRawValue: text,
        };
      }
    }

    // Document Number fallback
    if (!fields.document_number) {
      const match =
        text.match(/(?:quotation\s*(?:no\.?|number)|invoice\s*(?:no\.?|number)|qtn\s*(?:no\.?|number)|dn\s*(?:no\.?|number)|po\s*(?:no\.?|number)|reference|ref)[:\s#]+([A-Za-z0-9\-_#/]{3,})/i) ||
        text.match(/\b((?:QTN|INV|TAX|DN|PO|LPO)[-/_#0-9][\w\-_#/]*)\b/i);
      if (match && match[1].length >= 3 && !/^(no|number|date|dated|client|customer|messrs|tax\s+invoice|quotation|invoice|invoices|inventory)$/i.test(match[1])) {
        fields.document_number = {
          fieldKey: "document_number",
          label: "Document Number",
          value: match[1].trim(),
          source: loc,
          confidence: 0.95,
          validationStatus: "valid",
          originalRawValue: text,
        };
      }
    }

    // Document Date fallback
    if (!fields.document_date) {
      const match = text.match(/(?:date|dated)[:\s.]*([0-9]{1,2}[/-][0-9]{1,2}[/-][0-9]{2,4}|[0-9]{4}-[0-9]{2}-[0-9]{2})/i);
      if (match) {
        const parsedD = parseDate(match[1]);
        if (parsedD) {
          fields.document_date = {
            fieldKey: "document_date",
            label: "Document Date",
            value: parsedD,
            source: loc,
            confidence: 0.95,
            validationStatus: "valid",
            originalRawValue: text,
          };
        }
      }
    }

    // Customer Name fallback from paragraph
    if (!fields.customer_name && !fields.supplier_name) {
      const custMatch = text.match(/(?:customer\s*name|client\s*name|supplier\s*name|vendor\s*name|customer|client|supplier|vendor|messrs|m\/s|sold\s+to|bill\s+to)[:\s.]+([A-Za-z0-9\s&.,\-]+)/i);
      if (custMatch && custMatch[1].trim().length > 3) {
        const nameVal = custMatch[1].trim();
        if (!/advance|balance|order|released|terms|payment/i.test(nameVal)) {
          const targetKey = docType === "purchase_order" || docType === "supplier_bill" ? "supplier_name" : "customer_name";
          fields[targetKey] = {
            fieldKey: targetKey,
            label: targetKey === "supplier_name" ? "Supplier Name" : "Customer Name",
            value: nameVal,
            source: loc,
            confidence: 0.9,
            validationStatus: "valid",
            originalRawValue: text,
          };
        }
      }
    }

    // TRN fallback from paragraph
    if (!fields.trn) {
      const trnMatch = text.match(PATTERNS.trn);
      if (trnMatch && trnMatch[1] !== "105319816200003" && !/our\s*trn/i.test(text)) {
        fields.trn = {
          fieldKey: "trn",
          label: "Tax Registration Number (TRN)",
          value: trnMatch[1],
          source: loc,
          confidence: 0.99,
          validationStatus: "valid",
          originalRawValue: text,
        };
      }
    }
    // Address fallback from paragraph
    if (!fields.customer_address && !fields.address) {
      const addrMatch = text.match(/(?:address|location|site)[:\s.]+([A-Za-z0-9\s&.,\-#]+)/i);
      if (addrMatch && addrMatch[1].trim().length > 3) {
        fields.customer_address = {
          fieldKey: "customer_address",
          label: "Address",
          value: addrMatch[1].trim(),
          source: loc,
          confidence: 0.9,
          validationStatus: "valid",
          originalRawValue: text,
        };
      }
    }

    // Payment Terms
    if (!fields.payment_terms && /payment\s*terms/i.test(text)) {
      fields.payment_terms = {
        fieldKey: "payment_terms",
        label: "Payment Terms",
        value: text,
        source: loc,
        confidence: 0.9,
        validationStatus: "valid",
        originalRawValue: text,
      };
    }

    // Measurements (Diameter, Height)
    if (docType === "measurement_project" || /tank\s+liner|diameter|height/i.test(text)) {
      const dMatch = text.match(/diameter[:\s]*([0-9.]+)/i);
      const hMatch = text.match(/height[:\s]*([0-9.]+)/i);
      if (dMatch || hMatch) {
        if (!measurement) {
          measurement = {
            shape: "cylinder",
            source: loc,
            fabricWidth: 3.0,
            weldingAllowance: 3,
          };
        }
        if (dMatch) measurement.diameter = parseFloat(dMatch[1]);
        if (hMatch) measurement.height = parseFloat(hMatch[1]);
      }
    }
  }

  // 4. Fallbacks from Filename if still missing or generic
  if (!fields.document_number && fnDocNo && !/statement.*account/i.test(fnDocNo)) {
    fields.document_number = {
      fieldKey: "document_number",
      label: "Document Number",
      value: fnDocNo,
      source: { file: fileName, rawText: `Filename: ${fileName}` },
      confidence: 0.99,
      validationStatus: "valid",
      originalRawValue: fnDocNo,
    };
  }

  if (!fields.customer_name && !fields.supplier_name && fnCustOrSupp) {
    const targetKey = docType === "purchase_order" || docType === "supplier_bill" ? "supplier_name" : "customer_name";
    fields[targetKey] = {
      fieldKey: targetKey,
      label: targetKey === "supplier_name" ? "Supplier Name" : "Customer Name",
      value: fnCustOrSupp,
      source: { file: fileName, rawText: `Filename: ${fileName}` },
      confidence: 0.95,
      validationStatus: "valid",
      originalRawValue: fnCustOrSupp,
    };
  }

  if (!fields.project_name && fnProj) {
    fields.project_name = {
      fieldKey: "project_name",
      label: "Project Name",
      value: fnProj,
      source: { file: fileName, rawText: `Filename: ${fileName}` },
      confidence: 0.95,
      validationStatus: "valid",
      originalRawValue: fnProj,
    };
  }

  // 5. Scan tables for tabular line items and totals
  let primaryTableExtracted = false;
  let optionIndex = 1;
  for (const table of parsed.tables) {
    if (table.rows.length < 2) continue;

    // Detect header row (check first 3 rows to support titles/merged header banners)
    let headerRowIdx = -1;
    let descCol = -1;
    let qtyCol = -1;
    let unitCol = -1;
    let rateCol = -1;
    let netAmountCol = -1;
    let totalCol = -1;

    for (let r = 0; r < Math.min(3, table.rows.length); r++) {
      const texts = table.rows[r].cells.map(c => c.text.toLowerCase().trim());
      let dCol = texts.findIndex(h => /desc|particular|specification|service|scope|details/i.test(h));
      if (dCol === -1) {
        dCol = texts.findIndex(h => /item/i.test(h) && !/item\s*(?:no|number|#|code|seq|id|sr)/i.test(h));
      }
      const qCol = texts.findIndex(h => /qty|quantity|count/i.test(h));
      const rCol = texts.findIndex(h => /unit\s*price|rate|price/i.test(h));
      const nCol = texts.findIndex(h => /net\s*amount|amount|line\s*total/i.test(h));
      const tCol = texts.findIndex(h => /total\s*amount|gross\s*total|total/i.test(h));

      if (dCol !== -1 && (qCol !== -1 || rCol !== -1 || nCol !== -1 || tCol !== -1)) {
        headerRowIdx = r;
        descCol = dCol;
        qtyCol = qCol;
        unitCol = texts.findIndex(h => /unit|uom/i.test(h));
        rateCol = rCol;
        netAmountCol = nCol;
        totalCol = tCol;
        break;
      }
    }

    if (headerRowIdx !== -1 && descCol !== -1 && (qtyCol !== -1 || rateCol !== -1 || netAmountCol !== -1 || totalCol !== -1)) {
      const isSubsequentOption = primaryTableExtracted && fields.total_amount !== undefined;
      const currentOptPrefix = isSubsequentOption ? `[Option ${++optionIndex}] ` : "";
      let itemSeq = 1;
      let hasLineItemsInTable = false;
      for (let rIdx = headerRowIdx + 1; rIdx < table.rows.length; rIdx++) {
        const row = table.rows[rIdx];
        const rowTexts = row.cells.map(c => c.text.trim());
        const rowCombined = rowTexts.join(" ");

        // Summary row checks: Subtotal, VAT, Grand Total, Discount, In Words
        const getRowNumber = () => {
          for (let i = row.cells.length - 1; i >= 0; i--) {
            const txt = row.cells[i]?.text?.trim();
            if (txt) {
              const parsedN = parseNumber(txt);
              if (parsedN !== null) return parsedN;
            }
          }
          return null;
        };

        // Statement of Account (SOA) Totals in Docx
        if (docType === "customer_statement") {
          if (!fields.opening_balance && /previous\s*balance|opening\s*balance|balance\s*brought\s*forward/i.test(rowCombined)) {
            const num = getRowNumber();
            if (num !== null) {
              fields.opening_balance = {
                fieldKey: "opening_balance",
                label: "Opening Balance",
                value: num,
                source: { file: fileName, table: table.tableIndex, row: row.rowIndex, rawText: rowCombined },
                confidence: 0.98,
                validationStatus: "valid",
              };
            }
            continue;
          }
          if (!fields.subtotal && /new\s*charges|total\s*charges|charges/i.test(rowCombined)) {
            const num = getRowNumber();
            if (num !== null) {
              fields.subtotal = {
                fieldKey: "subtotal",
                label: "New Charges",
                value: num,
                source: { file: fileName, table: table.tableIndex, row: row.rowIndex, rawText: rowCombined },
                confidence: 0.98,
                validationStatus: "valid",
              };
            }
            continue;
          }
          if (!fields.total_credits && /total\s*credits|credits|payments\s*received/i.test(rowCombined)) {
            const num = getRowNumber();
            if (num !== null) {
              fields.total_credits = {
                fieldKey: "total_credits",
                label: "Total Credits",
                value: num,
                source: { file: fileName, table: table.tableIndex, row: row.rowIndex, rawText: rowCombined },
                confidence: 0.98,
                validationStatus: "valid",
              };
            }
            continue;
          }
          if (!fields.closing_balance && /total\s*balance\s*due|account\s*current\s*balance|closing\s*balance|balance\s*due/i.test(rowCombined)) {
            const num = getRowNumber();
            if (num !== null) {
              fields.closing_balance = {
                fieldKey: "closing_balance",
                label: "Closing Balance",
                value: num,
                source: { file: fileName, table: table.tableIndex, row: row.rowIndex, rawText: rowCombined },
                confidence: 0.98,
                validationStatus: "valid",
              };
              fields.total_amount = {
                fieldKey: "total_amount",
                label: "Total Balance Due",
                value: num,
                source: { file: fileName, table: table.tableIndex, row: row.rowIndex, rawText: rowCombined },
                confidence: 0.98,
                validationStatus: "valid",
              };
            }
            continue;
          }
        }

        if (/net\s*amount|subtotal|sub-total|total\s*exclusive|taxable\s*amount/i.test(rowCombined)) {
          const num = getRowNumber();
          if (num !== null && !fields.subtotal) {
            fields.subtotal = {
              fieldKey: "subtotal",
              label: "Subtotal",
              value: num,
              source: { file: fileName, table: table.tableIndex, row: row.rowIndex, rawText: rowCombined },
              confidence: 0.98,
              validationStatus: "valid",
            };
          }
          continue;
        }

        if (/vat\s*amount|vat\s*5%|5%\s*vat|tax\s*amount/i.test(rowCombined)) {
          const num = getRowNumber();
          if (num !== null && !fields.vat_amount) {
            fields.vat_amount = {
              fieldKey: "vat_amount",
              label: "VAT 5%",
              value: num,
              source: { file: fileName, table: table.tableIndex, row: row.rowIndex, rawText: rowCombined },
              confidence: 0.98,
              validationStatus: "valid",
            };
          }
          continue;
        }

        if (/grand\s*total|net\s*total|total\s*amount/i.test(rowCombined)) {
          const num = getRowNumber();
          if (num !== null && !fields.total_amount) {
            fields.total_amount = {
              fieldKey: "total_amount",
              label: "Grand Total",
              value: num,
              source: { file: fileName, table: table.tableIndex, row: row.rowIndex, rawText: rowCombined },
              confidence: 0.98,
              validationStatus: "valid",
            };
          }
          continue;
        }

        if (/in\s*words|amount\s*in\s*words|terms\s*and\s*conditions|payment\s*terms|discount/i.test(rowCombined)) {
          continue;
        }

        // Extract Line Item
        const desc = descCol !== -1 && row.cells[descCol] ? row.cells[descCol].text.trim() : "";
        // Skip empty rows or rows containing only serial numbers like '2.' or '4.'
        if (!desc || /^[0-9.]*$/.test(desc)) continue;

        const qty = qtyCol !== -1 && row.cells[qtyCol] ? parseNumber(row.cells[qtyCol].text) || 1 : 1;
        const unit = unitCol !== -1 && row.cells[unitCol] ? row.cells[unitCol].text.trim() : "Nos";
        let rate = rateCol !== -1 && row.cells[rateCol] ? parseNumber(row.cells[rateCol].text) || 0 : 0;
        
        let total = 0;
        if (netAmountCol !== -1 && row.cells[netAmountCol]) {
          total = parseNumber(row.cells[netAmountCol].text) || 0;
        } else if (totalCol !== -1 && row.cells[totalCol]) {
          total = parseNumber(row.cells[totalCol].text) || 0;
        }

        if (total === 0 && rate > 0) {
          total = Number((qty * rate).toFixed(2));
        } else if (rate === 0 && total > 0 && qty > 0) {
          rate = Number((total / qty).toFixed(2));
        }

        const vatRate = 5;
        const vatAmt = Number((total * 0.05).toFixed(2));

        items.push({
          id: `item_docx_${table.tableIndex}_${row.rowIndex}`,
          itemNumber: itemSeq++,
          description: `${currentOptPrefix}${desc}`,
          quantity: qty,
          unit: unit || "Nos",
          unitPrice: rate,
          discount: 0,
          vatRate,
          vatAmount: vatAmt,
          total,
          calculatedTotal: total,
          difference: 0,
          calculationStatus: "match",
          isOptional: isSubsequentOption,
          source: {
            file: fileName,
            table: table.tableIndex,
            row: row.rowIndex,
            rawText: rowCombined,
          },
        });
        hasLineItemsInTable = true;
      }
      if (hasLineItemsInTable) {
        primaryTableExtracted = true;
      }
    }
  }

  return {
    fields,
    items,
    measurements: measurement,
    rawSummary: {
      tablesCount: parsed.tables.length,
      rawSnippets: rawSnippets.slice(0, 150),
    },
  };
}

// -------------------------------------------------------------
// XLSX Extractor
// -------------------------------------------------------------
export function extractFromSpreadsheet(
  parsed: XlsxParseResult,
  fileName: string,
  docType: DocumentType
): ExtractionOutput {
  const fields: Record<string, ExtractedField> = {};
  const items: ExtractedLineItem[] = [];
  let measurement: ExtractedMeasurement | undefined = undefined;

  const rawSnippets: { location: string; text: string }[] = parsed.sourceSnippets.map(s => ({
    location: `${s.location.sheet}!${s.location.cell}`,
    text: s.text,
  }));

  for (const sheetName of parsed.sheetNames) {
    const sheet = parsed.sheets[sheetName];
    if (!sheet || sheet.rows.length === 0) continue;

    // 1. Scan rows for key-values (Customer, Date, Document No, TRN, Project)
    for (const row of sheet.rows) {
      for (let cIdx = 0; cIdx < row.cells.length; cIdx++) {
        const cell = row.cells[cIdx];
        const text = cell.formattedText;
        if (!text) continue;

        const nextCell = row.cells[cIdx + 1];
        const nextVal = nextCell?.formattedText || "";

        // Document Number
        if (!fields.document_number && /(?:quotation|quote|invoice|dn|po|ref|bill|exp|voucher|statement|soa)\s*(?:no|number|#)?[:]?$/i.test(text)) {
          if (nextVal) {
            fields.document_number = {
              fieldKey: "document_number",
              label: "Document Number",
              value: nextVal,
              source: { file: fileName, sheet: sheetName, cell: nextCell.address, rawText: `${text} ${nextVal}` },
              confidence: 0.95,
              validationStatus: "valid",
              originalRawValue: nextVal,
            };
          }
        }

        // Statement of Account Totals in Spreadsheet
        if (docType === "customer_statement") {
          if (!fields.opening_balance && /previous\s*balance|opening\s*balance|balance\s*brought\s*forward/i.test(text)) {
            const num = parseNumber(nextVal);
            if (num !== null) {
              fields.opening_balance = {
                fieldKey: "opening_balance",
                label: "Opening Balance",
                value: num,
                source: { file: fileName, sheet: sheetName, cell: nextCell.address, rawText: `${text} ${nextVal}` },
                confidence: 0.98,
                validationStatus: "valid",
                originalRawValue: nextVal,
              };
            }
          }
          if (!fields.subtotal && /new\s*charges|total\s*charges|charges/i.test(text)) {
            const num = parseNumber(nextVal);
            if (num !== null) {
              fields.subtotal = {
                fieldKey: "subtotal",
                label: "New Charges",
                value: num,
                source: { file: fileName, sheet: sheetName, cell: nextCell.address, rawText: `${text} ${nextVal}` },
                confidence: 0.98,
                validationStatus: "valid",
                originalRawValue: nextVal,
              };
            }
          }
          if (!fields.total_credits && /total\s*credits|credits|payments\s*received/i.test(text)) {
            const num = parseNumber(nextVal);
            if (num !== null) {
              fields.total_credits = {
                fieldKey: "total_credits",
                label: "Total Credits",
                value: num,
                source: { file: fileName, sheet: sheetName, cell: nextCell.address, rawText: `${text} ${nextVal}` },
                confidence: 0.98,
                validationStatus: "valid",
                originalRawValue: nextVal,
              };
            }
          }
          if (!fields.closing_balance && /total\s*balance\s*due|account\s*current\s*balance|closing\s*balance|balance\s*due/i.test(text)) {
            const num = parseNumber(nextVal);
            if (num !== null) {
              fields.closing_balance = {
                fieldKey: "closing_balance",
                label: "Closing Balance",
                value: num,
                source: { file: fileName, sheet: sheetName, cell: nextCell.address, rawText: `${text} ${nextVal}` },
                confidence: 0.98,
                validationStatus: "valid",
                originalRawValue: nextVal,
              };
              fields.total_amount = {
                fieldKey: "total_amount",
                label: "Total Balance Due",
                value: num,
                source: { file: fileName, sheet: sheetName, cell: nextCell.address, rawText: `${text} ${nextVal}` },
                confidence: 0.98,
                validationStatus: "valid",
                originalRawValue: nextVal,
              };
            }
          }
        }

        // Date
        if (!fields.document_date && /(?:date|dated)[:]?$/i.test(text)) {
          const parsedD = parseDate(nextVal);
          if (parsedD) {
            fields.document_date = {
              fieldKey: "document_date",
              label: "Document Date",
              value: parsedD,
              source: { file: fileName, sheet: sheetName, cell: nextCell.address, rawText: `${text} ${nextVal}` },
              confidence: 0.95,
              validationStatus: "valid",
              originalRawValue: nextVal,
            };
          }
        }

        // Customer / Supplier
        if (!fields.customer_name && !fields.supplier_name && /(?:customer|client|vendor|supplier|m\/s|to)[:]?$/i.test(text)) {
          if (nextVal && nextVal.length > 2) {
            const targetKey = docType === "purchase_order" || docType === "supplier_bill" ? "supplier_name" : "customer_name";
            fields[targetKey] = {
              fieldKey: targetKey,
              label: targetKey === "supplier_name" ? "Supplier Name" : "Customer Name",
              value: nextVal,
              source: { file: fileName, sheet: sheetName, cell: nextCell.address, rawText: `${text} ${nextVal}` },
              confidence: 0.9,
              validationStatus: "valid",
              originalRawValue: nextVal,
            };
          }
        }

        // Project
        if (!fields.project_name && /(?:project|site|project\s+name)[:]?$/i.test(text)) {
          if (nextVal) {
            fields.project_name = {
              fieldKey: "project_name",
              label: "Project Name",
              value: nextVal,
              source: { file: fileName, sheet: sheetName, cell: nextCell.address, rawText: `${text} ${nextVal}` },
              confidence: 0.9,
              validationStatus: "valid",
              originalRawValue: nextVal,
            };
          }
        }

        // TRN
        if (!fields.trn) {
          const trnMatch = text.match(PATTERNS.trn) || nextVal.match(PATTERNS.trn);
          if (trnMatch) {
            fields.trn = {
              fieldKey: "trn",
              label: "TRN",
              value: trnMatch[1],
              source: { file: fileName, sheet: sheetName, cell: cell.address, rawText: text },
              confidence: 0.99,
              validationStatus: "valid",
              originalRawValue: trnMatch[1],
            };
          }
        }

        // PVC Tank Liner parameters in cells
        if (/diameter/i.test(text)) {
          const dNum = parseNumber(nextVal);
          if (dNum !== null && dNum > 0) {
            if (!measurement) measurement = { shape: "cylinder", source: { file: fileName, sheet: sheetName, cell: cell.address }, fabricWidth: 3, weldingAllowance: 3 };
            measurement.diameter = dNum;
          }
        }
        if (/height/i.test(text)) {
          const hNum = parseNumber(nextVal);
          if (hNum !== null && hNum > 0) {
            if (!measurement) measurement = { shape: "cylinder", source: { file: fileName, sheet: sheetName, cell: cell.address }, fabricWidth: 3, weldingAllowance: 3 };
            measurement.height = hNum;
          }
        }
      }
    }

    // 2. Scan table header row and data rows
    let tableHeaderRowIndex = -1;
    let colMap: { desc?: number; qty?: number; unit?: number; rate?: number; total?: number; empCode?: number; empName?: number; date?: number; hours?: number } = {};

    for (let r = 0; r < Math.min(15, sheet.rows.length); r++) {
      const row = sheet.rows[r];
      const texts = row.cells.map(c => c.formattedText.toLowerCase());

      const dCol = texts.findIndex(t => /desc|item|particular|details|service|activity/i.test(t));
      const qCol = texts.findIndex(t => /qty|quantity|pcs|nos/i.test(t));
      const rCol = texts.findIndex(t => /rate|price|unit\s*rate/i.test(t));
      const empCCol = texts.findIndex(t => /emp.*(id|code|no|num)/i.test(t));
      const empNCol = texts.findIndex(t => /emp.*name|employee/i.test(t));

      if (dCol !== -1 && (qCol !== -1 || rCol !== -1)) {
        tableHeaderRowIndex = r;
        colMap = {
          desc: dCol,
          qty: qCol,
          unit: texts.findIndex(t => /unit|uom/i.test(t)),
          rate: rCol,
          total: texts.findIndex(t => /total|amount|line\s*total/i.test(t)),
        };
        break;
      }

      if (empCCol !== -1 || empNCol !== -1) {
        tableHeaderRowIndex = r;
        colMap = {
          empCode: empCCol,
          empName: empNCol,
          date: texts.findIndex(t => /date/i.test(t)),
          hours: texts.findIndex(t => /hours|total\s*hrs|ot\s*hrs/i.test(t)),
        };
        break;
      }
    }

    if (tableHeaderRowIndex !== -1 && colMap.desc !== undefined) {
      for (let r = tableHeaderRowIndex + 1; r < sheet.rows.length; r++) {
        const row = sheet.rows[r];
        const descCell = colMap.desc !== undefined ? row.cells[colMap.desc] : undefined;
        const desc = descCell?.formattedText || "";
        if (!desc.trim()) continue;

        // Skip summary rows
        if (/subtotal|total|vat|grand/i.test(desc)) continue;

        const qtyCell = colMap.qty !== undefined ? row.cells[colMap.qty] : undefined;
        const rateCell = colMap.rate !== undefined ? row.cells[colMap.rate] : undefined;
        const totalCell = colMap.total !== undefined ? row.cells[colMap.total] : undefined;
        const unitCell = colMap.unit !== undefined ? row.cells[colMap.unit] : undefined;

        const qty = parseNumber(qtyCell?.value) || 1;
        const rate = parseNumber(rateCell?.value) || 0;
        const total = parseNumber(totalCell?.value) || (qty * rate);
        const unit = unitCell?.formattedText.trim() || "Nos";

        items.push({
          id: `item_xlsx_${sheetName}_${row.rowNumber}`,
          description: desc,
          quantity: qty,
          unit,
          unitPrice: rate,
          discount: 0,
          vatRate: 5,
          vatAmount: Number((total * 0.05).toFixed(2)),
          total,
          calculatedTotal: total,
          difference: 0,
          calculationStatus: "match",
          source: {
            file: fileName,
            sheet: sheetName,
            cell: descCell?.address || `A${row.rowNumber}`,
            row: row.rowNumber,
            rawText: row.cells.map(c => c.formattedText).join(" | "),
          },
        });
      }
    } else if (tableHeaderRowIndex !== -1 && (colMap.empCode !== undefined || colMap.empName !== undefined)) {
      for (let r = tableHeaderRowIndex + 1; r < sheet.rows.length; r++) {
        const row = sheet.rows[r];
        const codeCell = colMap.empCode !== undefined ? row.cells[colMap.empCode] : undefined;
        const nameCell = colMap.empName !== undefined ? row.cells[colMap.empName] : undefined;
        const code = codeCell?.formattedText?.trim() || "";
        const name = nameCell?.formattedText?.trim() || "";
        if (!code && !name) continue;
        if (/total|summary|download/i.test(code) || /total|summary/i.test(name)) continue;

        const hoursCell = colMap.hours !== undefined ? row.cells[colMap.hours] : undefined;
        const hours = parseNumber(hoursCell?.value) || 0;

        items.push({
          id: `item_emp_${sheetName}_${row.rowNumber}`,
          description: `${code ? code + " - " : ""}${name || "Employee"}`,
          quantity: hours > 0 ? hours : 1,
          unit: hours > 0 ? "Hrs" : "Days",
          unitPrice: 0,
          discount: 0,
          vatRate: 0,
          vatAmount: 0,
          total: 0,
          calculatedTotal: 0,
          difference: 0,
          calculationStatus: "match",
          source: {
            file: fileName,
            sheet: sheetName,
            cell: nameCell?.address || codeCell?.address || `A${row.rowNumber}`,
            row: row.rowNumber,
            rawText: row.cells.map(c => c.formattedText).join(" | "),
          },
        });
      }
    }
  }

  return {
    fields,
    items,
    measurements: measurement,
    rawSummary: {
      sheetsCount: parsed.sheetNames.length,
      rawSnippets: rawSnippets.slice(0, 150),
    },
  };
}

// -------------------------------------------------------------
// PDF Extractor
// -------------------------------------------------------------
export function extractFromPdf(
  parsed: PdfParseResult,
  fileName: string,
  docType: DocumentType
): ExtractionOutput {
  const fields: Record<string, ExtractedField> = {};
  const items: ExtractedLineItem[] = [];
  let measurement: ExtractedMeasurement | undefined = undefined;

  const rawSnippets: { location: string; text: string }[] = parsed.sourceSnippets.map(s => ({
    location: `Page ${s.location.page}, Line ${s.location.row}`,
    text: s.text,
  }));

  // 1. Filename heuristic deconstruction (e.g. 'INV132-26 Al Fajar - Pvc Fabrication.pdf' or 'SOA101-26 Al Karwan Solution FZC.pdf')
  const baseName = fileName.split(/[/\\]/).pop() || fileName;
  const fnTripleMatch = baseName.match(/^([A-Za-z0-9/_-]+)\s+(.+?)\s+-\s+(.+?)\.(docx|pdf|xlsx|csv)$/i);
  const fnDoubleMatch = !fnTripleMatch ? baseName.match(/^([A-Za-z0-9/_-]+)\s+(.+?)\.(docx|pdf|xlsx|csv)$/i) : null;
  const fnSingleMatch = !fnTripleMatch && !fnDoubleMatch ? baseName.match(/^([A-Za-z0-9/_-]+)\.(docx|pdf|xlsx|csv)$/i) : null;

  const fnDocNo = fnTripleMatch ? fnTripleMatch[1].trim() : fnDoubleMatch ? fnDoubleMatch[1].trim() : fnSingleMatch ? fnSingleMatch[1].trim() : null;
  const fnCust = fnTripleMatch ? fnTripleMatch[2].trim() : fnDoubleMatch ? fnDoubleMatch[2].trim() : null;
  const fnScope = fnTripleMatch ? fnTripleMatch[3].trim() : null;

  // Primary customer name defaults from systematic file naming
  if (fnCust) {
    const targetKey = docType === "purchase_order" || docType === "supplier_bill" ? "supplier_name" : "customer_name";
    fields[targetKey] = {
      fieldKey: targetKey,
      label: targetKey === "supplier_name" ? "Supplier Name" : "Customer Name",
      value: fnCust,
      source: { file: fileName, rawText: `Filename: ${fileName}` },
      confidence: 0.99,
      validationStatus: "valid",
      originalRawValue: fnCust,
    };
  }
  if (fnScope) {
    const pd = parseDate(fnScope);
    if (pd && !fields.document_date) {
      fields.document_date = {
        fieldKey: "document_date",
        label: "Document Date",
        value: pd,
        source: { file: fileName, rawText: `Filename: ${fileName}` },
        confidence: 0.95,
        validationStatus: "valid",
        originalRawValue: fnScope,
      };
    } else {
      fields.project_name = {
        fieldKey: "project_name",
        label: "Project Name",
        value: fnScope,
        source: { file: fileName, rawText: `Filename: ${fileName}` },
        confidence: 0.95,
        validationStatus: "valid",
        originalRawValue: fnScope,
      };
    }
  }

  const lines = parsed.pages.flatMap(p => p.lines);

  // 2. Scan for Customer TRN (any 15-digit number that is not the seller TRN 105319816200003)
  for (let lIdx = 0; lIdx < lines.length; lIdx++) {
    const line = lines[lIdx];
    const trnMatches = line.matchAll(/\b(10[0-9]{13})\b/g);
    for (const m of trnMatches) {
      const trn = m[1];
      if (trn !== "105319816200003") {
        fields.trn = {
          fieldKey: "trn",
          label: "Tax Registration Number (TRN)",
          value: trn,
          source: { file: fileName, page: 1, row: lIdx + 1, rawText: line },
          confidence: 0.99,
          validationStatus: "valid",
          originalRawValue: trn,
        };
      }
    }

    // Bill To Customer Scan (if not already extracted from filename)
    if (!fields.customer_name && !fields.supplier_name && /(?:bill\s*to|sold\s*to|customer(?:\s*name)?|client(?:\s*name)?)\s*[:]?/i.test(line)) {
      let custCand = line.replace(/^(?:bill\s*to|sold\s*to|customer(?:\s*name)?|client(?:\s*name)?)\s*[:]?\s*/i, "").trim();
      if (!custCand && lines[lIdx + 1]) {
        custCand = lines[lIdx + 1].trim();
      }
      custCand = custCand.replace(/TRN\s*:.*$/i, "").trim();
      if (custCand && !/al\s*safwah|golden\s*elite|statement|account|ledger|date|type/i.test(custCand)) {
        fields.customer_name = {
          fieldKey: "customer_name",
          label: "Customer Name",
          value: custCand,
          source: { file: fileName, page: 1, row: lIdx + 1, rawText: line },
          confidence: 0.95,
          validationStatus: "valid",
          originalRawValue: custCand,
        };
      }
    }
  }

  // 3. Scan for Document Date (check line or line + next line)
  for (let lIdx = 0; lIdx < lines.length; lIdx++) {
    const line = lines[lIdx];
    const combined = line + " " + (lines[lIdx + 1] || "");
    if (!fields.document_date && /\b(?:date|supply|dated|statement\s*date)\b/i.test(combined)) {
      const dm = combined.match(/(?:date|supply|dated|statement\s*date)[:\s]+([0-9\s/.-]{8,15})/i);
      if (dm) {
        const dStr = dm[1].replace(/\s+/g, "");
        const pd = parseDate(dStr);
        if (pd) {
          fields.document_date = {
            fieldKey: "document_date",
            label: "Document Date",
            value: pd,
            source: { file: fileName, page: 1, row: lIdx + 1, rawText: combined },
            confidence: 0.98,
            validationStatus: "valid",
            originalRawValue: dStr,
          };
        }
      }
    }
  }

  // 4. Scan for Document / Invoice / Quotation / Statement Number
  for (let lIdx = 0; lIdx < lines.length; lIdx++) {
    const line = lines[lIdx];
    const combined = line + " " + (lines[lIdx + 1] || "");
    if (!fields.document_number && /(?:invoice\s*no\.?|quotation\s*no\.?|quote\s*no\.?|qtn\s*no\.?|statement\s*#|statement\s*no\.?|statement\s*ref|soa\s*#|soa\s*no\.?|ref\s*:|invoice\s*ref)/i.test(combined)) {
      const im = combined.match(/(?:invoice\s*no\.?|quotation\s*no\.?|quote\s*no\.?|qtn\s*no\.?|statement\s*#|statement\s*no\.?|statement\s*ref\s*:?|soa\s*#|soa\s*no\.?|ref\s*:|invoice\s*ref\s*:)\s*([A-Za-z0-9\s/_#-]+)/i);
      if (im) {
        let rawNum = im[1].trim();
        rawNum = rawNum.replace(/\s+(Location|Ref|Mobile|Date|Supply|Terms|Company|Buyer|To|From|Customer|Page).*$/i, "");
        const clean = rawNum.replace(/\s+/g, "");
        if (clean.length >= 3 && /^(?:INV|TAX|QTN|QUO|PI|DN|PO|LPO|BILL|SOA)/i.test(clean)) {
          fields.document_number = {
            fieldKey: "document_number",
            label: "Document Number",
            value: clean,
            source: { file: fileName, page: 1, row: lIdx + 1, rawText: combined },
            confidence: 0.99,
            validationStatus: "valid",
            originalRawValue: clean,
          };
        }
      }
    }
  }
  if (!fields.document_number && fnDocNo && !/statement.*account/i.test(fnDocNo)) {
    fields.document_number = {
      fieldKey: "document_number",
      label: "Document Number",
      value: fnDocNo,
      source: { file: fileName, rawText: `Filename: ${fileName}` },
      confidence: 0.95,
      validationStatus: "valid",
      originalRawValue: fnDocNo,
    };
  }

  // 5. Financial totals (Net Amount / Subtotal, VAT 5%, Total Amount)
  for (let lIdx = 0; lIdx < lines.length; lIdx++) {
    const line = lines[lIdx];
    const combined = line + " " + (lines[lIdx + 1] || "");
    const loc: SourceLocation = { file: fileName, page: 1, row: lIdx + 1, rawText: combined };

    // Advance / Progress billing check (e.g. "Advance 20% 76,000.00" or "...Installation 25% 95,000.00")
    if (!fields.advance_billed && !/vat|tax/i.test(combined) && /(?:advance|material|commencement|milestone|progress|retention).+?\b(\d{1,2})%\s*[:]?\s*(?:AED)?\s*([0-9,]+(?:\.[0-9]+)?)/i.test(combined)) {
      const mAdv = combined.match(/(?:advance|material|commencement|milestone|progress|retention).+?\b(\d{1,2})%\s*[:]?\s*(?:AED)?\s*([0-9,]+(?:\.[0-9]+)?)/i);
      if (mAdv) {
        const val = parseNumber(mAdv[2]);
        if (val !== null && val > 0) {
          fields.advance_billed = {
            fieldKey: "advance_billed",
            label: "Advance / Milestone Billed",
            value: val,
            source: loc,
            confidence: 0.98,
            validationStatus: "valid",
            originalRawValue: mAdv[0],
          };
          // For progress/milestone tax invoices, taxable subtotal is the billed milestone amount
          fields.subtotal = {
            fieldKey: "subtotal",
            label: "Subtotal",
            value: val,
            source: loc,
            confidence: 0.98,
            validationStatus: "valid",
            originalRawValue: mAdv[0],
          };
        }
      }
    }

    if (!fields.discount && /discount/i.test(combined)) {
      const mDisc = combined.match(/discount\s*[:]?\s*(?:\(-?([0-9,.]+)\)|-?\s*([0-9,.]+))/i);
      if (mDisc) {
        const val = parseNumber(mDisc[1] || mDisc[2]);
        if (val !== null && val > 0) {
          fields.discount = {
            fieldKey: "discount",
            label: "Discount",
            value: val,
            source: loc,
            confidence: 0.98,
            validationStatus: "valid",
            originalRawValue: mDisc[0],
          };
        }
      }
    }

    if (!fields.subtotal && /net\s*amount|subtotal|sub-total/i.test(combined)) {
      const m = combined.match(/(?:net\s*amount|subtotal|sub-total)\s*[:]?\s*(?:AED)?\s*([0-9,]+(?:\.[0-9]+)?)/i);
      if (m) {
        const val = parseNumber(m[1]);
        if (val !== null && val > 0) {
          fields.subtotal = {
            fieldKey: "subtotal",
            label: "Subtotal",
            value: val,
            source: loc,
            confidence: 0.98,
            validationStatus: "valid",
            originalRawValue: m[1],
          };
        }
      }
    }

    if (!fields.vat_amount && /vat\s*(?:amount|total)?\s*(?:\(5%\)|5%)/i.test(combined)) {
      const m = combined.match(/vat\s*(?:amount|total)?\s*(?:\(5%\)|5%)\s*[:]?\s*(?:AED)?\s*([0-9,]+(?:\.[0-9]+)?)/i);
      if (m) {
        const val = parseNumber(m[1]);
        if (val !== null && val >= 0) {
          fields.vat_amount = {
            fieldKey: "vat_amount",
            label: "VAT 5%",
            value: val,
            source: loc,
            confidence: 0.98,
            validationStatus: "valid",
            originalRawValue: m[1],
          };
        }
      }
    }

    // Statement of Account (SOA) Financial Totals
    if (docType === "customer_statement") {
      // Opening Balance / Previous Balance
      if (!fields.opening_balance && /(?:previous\s*balance|opening\s*balance|balance\s*brought\s*forward)/i.test(combined)) {
        const m = combined.match(/(?:previous\s*balance|opening\s*balance|balance\s*brought\s*forward)\s*[:]?\s*(?:AED)?\s*(-?[0-9,]+(?:\.[0-9]+)?)/i);
        if (m) {
          const val = parseNumber(m[1]) ?? 0;
          fields.opening_balance = {
            fieldKey: "opening_balance",
            label: "Opening Balance",
            value: val,
            source: loc,
            confidence: 0.98,
            validationStatus: "valid",
            originalRawValue: m[1],
          };
        }
      }

      // New Charges
      if (!fields.subtotal && /(?:new\s*charges|total\s*charges|charges)/i.test(combined)) {
        const m = combined.match(/(?:new\s*charges|total\s*charges|charges)\s*[:]?\s*(?:AED)?\s*([0-9,]+(?:\.[0-9]+)?)/i);
        if (m) {
          const val = parseNumber(m[1]) ?? 0;
          fields.subtotal = {
            fieldKey: "subtotal",
            label: "New Charges",
            value: val,
            source: loc,
            confidence: 0.98,
            validationStatus: "valid",
            originalRawValue: m[1],
          };
        }
      }

      // Total Credits
      if (!fields.total_credits && /(?:total\s*credits|credits|payments\s*received)/i.test(combined)) {
        const m = combined.match(/(?:total\s*credits|credits|payments\s*received)\s*[:]?\s*(?:AED)?\s*([0-9,]+(?:\.[0-9]+)?)/i);
        if (m) {
          const val = parseNumber(m[1]) ?? 0;
          fields.total_credits = {
            fieldKey: "total_credits",
            label: "Total Credits",
            value: val,
            source: loc,
            confidence: 0.98,
            validationStatus: "valid",
            originalRawValue: m[1],
          };
        }
      }

      // Closing Balance / Total Balance Due
      if (!fields.total_amount && /(?:total\s*balance\s*due|account\s*current\s*balance|closing\s*balance|balance\s*due)/i.test(combined)) {
        const m = combined.match(/(?:total\s*balance\s*due|account\s*current\s*balance|closing\s*balance|balance\s*due)\s*[:]?\s*(?:AED)?\s*(-?[0-9,]+(?:\.[0-9]+)?)/i);
        if (m) {
          const val = parseNumber(m[1]) ?? 0;
          fields.total_amount = {
            fieldKey: "total_amount",
            label: "Total Balance Due",
            value: val,
            source: loc,
            confidence: 0.98,
            validationStatus: "valid",
            originalRawValue: m[1],
          };
          fields.closing_balance = {
            fieldKey: "closing_balance",
            label: "Closing Balance",
            value: val,
            source: loc,
            confidence: 0.98,
            validationStatus: "valid",
            originalRawValue: m[1],
          };
        }
      }
    }

    if (!fields.total_amount && /total\s*amount|grand\s*total/i.test(combined)) {
      const m = combined.match(/(?:total\s*amount|grand\s*total)\s*[:]?\s*(?:AED)?\s*([0-9,]+(?:\.[0-9]+)?)/i);
      if (m) {
        const val = parseNumber(m[1]);
        if (val !== null && val > 0) {
          fields.total_amount = {
            fieldKey: "total_amount",
            label: "Grand Total",
            value: val,
            source: loc,
            confidence: 0.98,
            validationStatus: "valid",
            originalRawValue: m[1],
          };
        }
      }
    }
  }

  // 6. Line Items Extraction
  function cleanLineForTable(lineStr: string): string {
    let s = lineStr.replace(/\bN\s*o\s*s\b/gi, "Nos");
    s = s.replace(/\bS\s*q\s*m\b/gi, "Sqm");
    s = s.replace(/\bM\s*t\s*r\b/gi, "Mtr");
    s = s.replace(/\bP\s*c\s*s\b/gi, "Pcs");
    s = s.replace(/\bL\s*U\s*M\b/gi, "LUM");
    s = s.replace(/\bR\s*o\s*l\s*l\b/gi, "Roll");
    s = s.replace(/\bB\s*A\s*Y\b/gi, "BAY");
    s = s.replace(/\bm\s*²\b/gi, "m²");
    return s;
  }

  let tableHeaderStart = -1;
  let tableHeaderEnd = -1;
  let tableEndIndex = lines.length;

  for (let i = 0; i < lines.length; i++) {
    const l = lines[i];
    if (
      /offer\s*price|sl\s*\.?\s*no|description.*qty|description.*unit|^(?:SN|#)\s+(?:DESCRIPTION|Item\s+Description)/i.test(l) ||
      (docType === "customer_statement" && /date.*(?:type|ref|particular|transaction|charges|credits|balance)/i.test(l))
    ) {
      if (tableHeaderStart === -1) tableHeaderStart = i;
    }
    if (tableHeaderStart !== -1 && tableHeaderEnd === -1) {
      if (/amount.*amount|net.*vat.*total|no\.\s+price|qty\s+unit\s+rate|balance\s*\(?aed\)?|charges|credits/i.test(l)) {
        tableHeaderEnd = i;
      }
    }
    if (tableHeaderStart !== -1 && i > (tableHeaderEnd !== -1 ? tableHeaderEnd : tableHeaderStart)) {
      if (/net\s*amount|subtotal|sub-total|total\s*amount|grand\s*total|total\s*balance\s*due|account\s*current\s*balance|closing\s*balance/i.test(l)) {
        tableEndIndex = i;
        break;
      }
    }
  }

  if (tableHeaderEnd === -1 && tableHeaderStart !== -1) {
    tableHeaderEnd = docType === "customer_statement" ? tableHeaderStart : tableHeaderStart + 3;
  }

  if (tableHeaderStart !== -1) {
    let itemSeq = 1;
    let pendingDesc: string[] = [];

    for (let i = tableHeaderEnd + 1; i < tableEndIndex; i++) {
      const rawLine = lines[i].trim();
      if (!rawLine || /^[0-9]\s*\.?$/.test(rawLine)) continue;
      // Skip validity / terms
      if (/price\s*validity|payment\s*terms|all\s*options\s*given/i.test(rawLine)) break;
      // Skip running headers / footers across multi-page tables
      if (/goldenelitetents|P\.\s*O\.\s*Box|AL SAFWAH|\+971/i.test(rawLine)) continue;

      if (/^note\s*:/i.test(rawLine)) {
        if (items.length > 0) {
          items[items.length - 1].description += " (" + rawLine + ")";
        }
        continue;
      }

      const line = cleanLineForTable(rawLine);
      const combinedLine = pendingDesc.length > 0 ? pendingDesc.join(" ") + " " + line : line;

      // Statement of Account (SOA) Transaction Row Parser
      if (docType === "customer_statement") {
        const mDate = line.match(/^([0-9]{1,2}[/-][0-9]{1,2}[/-][0-9]{2,4})\s+(.+)$/);
        if (mDate) {
          const transDate = mDate[1];
          const rest = mDate[2].trim();
          const numMatches = Array.from(rest.matchAll(/(?:AED\s*)?(-?[0-9,]+\.[0-9]{2})/gi));
          if (numMatches.length > 0) {
            const firstNumIdx = rest.indexOf(numMatches[0][0]);
            const transDesc = rest.slice(0, firstNumIdx).trim();
            const nums = numMatches.map(m => parseNumber(m[1]) ?? 0);

            let charge = 0;
            let credit = 0;
            let balance = 0;

            if (nums.length >= 3) {
              charge = nums[0];
              credit = nums[1];
              balance = nums[2];
            } else if (nums.length === 2) {
              if (/rv|receipt|pay|cred/i.test(transDesc)) {
                credit = nums[0];
              } else {
                charge = nums[0];
              }
              balance = nums[1];
            } else if (nums.length === 1) {
              balance = nums[0];
              if (/opening|brought\s*forward/i.test(transDesc)) {
                charge = nums[0];
              }
            }

            items.push({
              id: `item_soa_${itemSeq}`,
              itemNumber: itemSeq++,
              description: `${transDate} - ${transDesc || "Statement Entry"}`,
              quantity: 1,
              unit: "Doc",
              unitPrice: charge > 0 ? charge : credit,
              discount: 0,
              vatRate: 0,
              vatAmount: 0,
              taxableAmount: charge > 0 ? charge : 0,
              total: charge > 0 ? charge : credit,
              calculatedTotal: balance,
              difference: 0,
              calculationStatus: "match",
              source: { file: fileName, page: 1, row: i + 1, rawText: rawLine },
            });
            pendingDesc = [];
            continue;
          }
        }
      }

      // 1. Check for 8/7-column layout (Quotation / Tax Invoice with separate Net, VAT, Total):
      // [itemNo] [desc] [unit] [qty] [rate] [net] [vat] [total]
      const m8 = combinedLine.match(/^(?:([0-9]+)\.?\s+)?(.*?)\s+([A-Za-z²m]+|\S+)\s+([0-9][0-9,.]*)\s+([0-9,]+(?:\.[0-9]+)?)\s+([0-9,]+(?:\.[0-9]+)?)\s+([0-9,]+(?:\.[0-9]+)?)\s+([0-9,]+(?:\.[0-9]+)?)$/i);

      // 2. Check for 6-column layout (Standard Invoice: Qty Unit Rate Amount):
      const m6 = !m8 ? combinedLine.match(/^(?:([0-9]+)\.?\s+)?(.*?)\s*(-|[0-9][0-9,.]*)\s+([A-Za-z]+)\s+([0-9,]+(?:\.[0-9]+)?)\s+([0-9,]+(?:\.[0-9]+)?)$/i) : null;

      if (m8) {
        const itemNo = m8[1] ? parseInt(m8[1]) : itemSeq;
        let lineDesc = m8[2]?.trim() || "";
        lineDesc = lineDesc.replace(/^Description\s+Unit\s+Qty\s+No\.\s+price\s+Amount\s+Amount\s+Amount\s*/i, "");
        const unit = m8[3].trim();
        const qty = parseNumber(m8[4]) || 1;
        const rate = parseNumber(m8[5]) || 0;
        const taxableAmount = parseNumber(m8[6]) || Number((qty * rate).toFixed(2));
        const vatAmt = parseNumber(m8[7]) || Number((taxableAmount * 0.05).toFixed(2));
        const grossTotal = parseNumber(m8[8]) || Number((taxableAmount + vatAmt).toFixed(2));

        items.push({
          id: `item_pdf_${itemSeq}`,
          itemNumber: itemSeq++,
          description: lineDesc || `Item ${itemNo}`,
          quantity: qty,
          unit,
          unitPrice: rate,
          discount: 0,
          vatRate: 5,
          vatAmount: vatAmt,
          taxableAmount,
          total: grossTotal,
          calculatedTotal: grossTotal,
          difference: 0,
          calculationStatus: "match",
          source: { file: fileName, page: 1, row: i + 1, rawText: rawLine },
        });
        pendingDesc = [];
      } else if (m6) {
        const itemNo = m6[1] ? parseInt(m6[1]) : itemSeq;
        const lineDesc = m6[2]?.trim() || "";
        const qty = m6[3] === "-" ? 1 : parseNumber(m6[3]) || 1;
        const unit = m6[4].trim();
        const rate = parseNumber(m6[5]) || 0;
        const amountCol = parseNumber(m6[6]) || 0;

        let taxableAmount = amountCol || Number((qty * rate).toFixed(2));
        let vatAmt = Number((taxableAmount * 0.05).toFixed(2));
        let grossTotal = Number((taxableAmount + vatAmt).toFixed(2));

        // Advance billing adjustment if invoice billed an advance amount
        const advVal = fields.advance_billed?.value;
        if (typeof advVal === "number" && advVal > 0 && taxableAmount > advVal) {
          taxableAmount = advVal;
          vatAmt = Number((taxableAmount * 0.05).toFixed(2));
          grossTotal = Number((taxableAmount + vatAmt).toFixed(2));
        }

        items.push({
          id: `item_pdf_${itemSeq}`,
          itemNumber: itemSeq++,
          description: lineDesc || `Item ${itemNo}`,
          quantity: qty,
          unit,
          unitPrice: rate,
          discount: 0,
          vatRate: 5,
          vatAmount: vatAmt,
          taxableAmount,
          total: grossTotal,
          calculatedTotal: grossTotal,
          difference: 0,
          calculationStatus: "match",
          source: { file: fileName, page: 1, row: i + 1, rawText: rawLine },
        });
        pendingDesc = [];
      } else {
        pendingDesc.push(rawLine);
      }
    }
  }

  // If invoice-level discount exists and items don't have discounts, apportion or assign discount to line items
  const invDiscount = typeof fields.discount?.value === "number" ? fields.discount.value : 0;
  if (invDiscount > 0 && items.length > 0) {
    const totalItemGross = items.reduce((sum, it) => sum + (it.quantity * it.unitPrice), 0);
    items.forEach(it => {
      const itemGross = it.quantity * it.unitPrice;
      const itemDisc = items.length === 1 ? invDiscount : Number(((itemGross / totalItemGross) * invDiscount).toFixed(2));
      it.discount = itemDisc;
      it.taxableAmount = Number((itemGross - itemDisc).toFixed(2));
      it.vatAmount = Number((it.taxableAmount * (it.vatRate / 100)).toFixed(2));
      it.total = Number((it.taxableAmount + it.vatAmount).toFixed(2));
      it.calculatedTotal = it.total;
    });
  }

  // Statement of Account (SOA) Totals derivation from items if summary boxes were absent
  if (docType === "customer_statement") {
    if (!fields.subtotal && items.length > 0) {
      const totalCharges = Number(items.reduce((sum, it) => sum + (it.taxableAmount || 0), 0).toFixed(2));
      fields.subtotal = {
        fieldKey: "subtotal",
        label: "New Charges",
        value: totalCharges,
        source: { file: fileName, rawText: "Sum of Statement Charges" },
        confidence: 0.95,
        validationStatus: "valid",
        originalRawValue: totalCharges.toFixed(2),
      };
    }
    if (!fields.total_credits && items.length > 0) {
      const totalCreds = Number(items.reduce((sum, it) => sum + (it.taxableAmount === 0 && it.total > 0 ? it.total : 0), 0).toFixed(2));
      fields.total_credits = {
        fieldKey: "total_credits",
        label: "Total Credits",
        value: totalCreds,
        source: { file: fileName, rawText: "Sum of Statement Credits" },
        confidence: 0.95,
        validationStatus: "valid",
        originalRawValue: totalCreds.toFixed(2),
      };
    }
    if (!fields.closing_balance && items.length > 0) {
      const lastItem = items[items.length - 1];
      const closingVal = lastItem.calculatedTotal || 0;
      fields.closing_balance = {
        fieldKey: "closing_balance",
        label: "Closing Balance",
        value: closingVal,
        source: { file: fileName, rawText: "Statement Running Balance" },
        confidence: 0.95,
        validationStatus: "valid",
        originalRawValue: closingVal.toFixed(2),
      };
      if (!fields.total_amount) {
        fields.total_amount = {
          fieldKey: "total_amount",
          label: "Total Balance Due",
          value: closingVal,
          source: { file: fileName, rawText: "Statement Running Balance" },
          confidence: 0.95,
          validationStatus: "valid",
          originalRawValue: closingVal.toFixed(2),
        };
      }
    }
  }

  // PVC Tank Liner parameters if technical sheet
  if (docType === "measurement_project") {
    for (let lIdx = 0; lIdx < lines.length; lIdx++) {
      const line = lines[lIdx];
      const dM = line.match(/diameter[:\s]*([0-9.]+)/i);
      const hM = line.match(/height[:\s]*([0-9.]+)/i);
      if (dM || hM) {
        if (!measurement) measurement = { shape: "cylinder", source: { file: fileName, page: 1, row: lIdx + 1, rawText: line }, fabricWidth: 3, weldingAllowance: 3 };
        if (dM) measurement.diameter = parseFloat(dM[1]);
        if (hM) measurement.height = parseFloat(hM[1]);
      }
    }
  }

  return {
    fields,
    items,
    measurements: measurement,
    rawSummary: {
      pagesCount: parsed.pagesCount,
      rawSnippets: rawSnippets.slice(0, 150),
    },
  };
}

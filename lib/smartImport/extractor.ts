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

function cleanStr(val: unknown): string {
  if (val === null || val === undefined) return "";
  return String(val).replace(/\s+/g, " ").trim();
}

function parseNumber(val: unknown): number | null {
  if (val === null || val === undefined) return null;
  if (typeof val === "number") return isNaN(val) ? null : val;
  const cleaned = String(val).replace(/[^0-9.-]/g, "");
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
            if (/^(?:invoice\s*(?:no\.?|number)|quotation\s*(?:no\.?|number)|qtn\s*(?:no\.?|number)|dn\s*(?:no\.?|number)|po\s*(?:no\.?|number)|lpo\s*(?:no\.?|number)|ref\s*(?:no\.?|number))$/i.test(text) && nextText) {
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
              const dnMatch = text.match(/(?:invoice\s*(?:no\.?|number)|quotation\s*(?:no\.?|number)|qtn\s*(?:no\.?|number)|dn\s*(?:no\.?|number)|po\s*(?:no\.?|number)|ref\s*(?:no\.?|number))[:\s]+([A-Za-z0-9/_-]+)/i);
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
  if (!fields.document_number && fnDocNo) {
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
  for (const table of parsed.tables) {
    if (table.rows.length < 2) continue;

    // Detect header row
    const headerRow = table.rows[0];
    const headerTexts = headerRow.cells.map(c => c.text.toLowerCase().trim());

    let descCol = headerTexts.findIndex(h => /desc|particular|specification|service|scope|details/i.test(h));
    if (descCol === -1) {
      descCol = headerTexts.findIndex(h => /item/i.test(h) && !/item\s*(?:no|number|#|code|seq|id|sr)/i.test(h));
    }
    const qtyCol = headerTexts.findIndex(h => /qty|quantity|count/i.test(h));
    const unitCol = headerTexts.findIndex(h => /unit|uom/i.test(h));
    const rateCol = headerTexts.findIndex(h => /unit\s*price|rate|price/i.test(h));
    const netAmountCol = headerTexts.findIndex(h => /net\s*amount|amount|line\s*total/i.test(h));
    const totalCol = headerTexts.findIndex(h => /total\s*amount|gross\s*total|total/i.test(h));

    if (descCol !== -1 && (qtyCol !== -1 || rateCol !== -1 || netAmountCol !== -1 || totalCol !== -1)) {
      let itemSeq = 1;
      for (let rIdx = 1; rIdx < table.rows.length; rIdx++) {
        const row = table.rows[rIdx];
        const rowTexts = row.cells.map(c => c.text.trim());
        const rowCombined = rowTexts.join(" ");

        // Summary row checks: Subtotal, VAT, Grand Total, Discount, In Words
        if (/net\s*amount|subtotal|sub-total|total\s*exclusive|taxable\s*amount/i.test(rowCombined)) {
          const num = parseNumber(rowTexts[rowTexts.length - 1]);
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
          const num = parseNumber(rowTexts[rowTexts.length - 1]);
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
          const num = parseNumber(rowTexts[rowTexts.length - 1]);
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
          description: desc,
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
          source: {
            file: fileName,
            table: table.tableIndex,
            row: row.rowIndex,
            rawText: rowCombined,
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
        if (!fields.document_number && /(?:quotation|quote|invoice|dn|po|ref|bill|exp|voucher)\s*(?:no|number|#)?[:]?$/i.test(text)) {
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

  // 1. Filename heuristic deconstruction (e.g. 'INV132-26 Al Fajar - Pvc Fabrication.pdf')
  const baseName = fileName.split(/[/\\]/).pop() || fileName;
  const fnTripleMatch = baseName.match(/^([A-Za-z0-9/_-]+)\s+(.+?)\s+-\s+(.+?)\.(docx|pdf|xlsx|csv)$/i);
  const fnDoubleMatch = !fnTripleMatch ? baseName.match(/^([A-Za-z0-9/_-]+)\s+(.+?)\.(docx|pdf|xlsx|csv)$/i) : null;

  const fnDocNo = fnTripleMatch ? fnTripleMatch[1].trim() : fnDoubleMatch ? fnDoubleMatch[1].trim() : null;
  const fnCustOrSupp = fnTripleMatch ? fnTripleMatch[2].trim() : fnDoubleMatch ? fnDoubleMatch[2].trim() : null;
  const fnProj = fnTripleMatch ? fnTripleMatch[3].trim() : null;

  let itemSeq = 1;

  for (const page of parsed.pages) {
    for (let lIdx = 0; lIdx < page.lines.length; lIdx++) {
      const line = page.lines[lIdx].trim();
      const loc: SourceLocation = { file: fileName, page: page.pageNumber, row: lIdx + 1, rawText: line };

      // Company / Customer
      if (!fields.customer_name && !fields.supplier_name) {
        const compMatch = line.match(/(?:company|customer|client|m\/s|to:?)\s+([A-Za-z0-9\s&.,\-]+?)(?:\s+date|\s*$)/i);
        if (compMatch && compMatch[1].trim().length > 3) {
          const val = compMatch[1].trim();
          if (!/al\s*safwah|golden\s*elite|advance|balance|order|released/i.test(val)) {
            const targetKey = docType === "purchase_order" || docType === "supplier_bill" ? "supplier_name" : "customer_name";
            fields[targetKey] = {
              fieldKey: targetKey,
              label: targetKey === "supplier_name" ? "Supplier Name" : "Customer Name",
              value: val,
              source: loc,
              confidence: 0.98,
              validationStatus: "valid",
              originalRawValue: line,
            };
          }
        }
      }

      // Date
      if (!fields.document_date) {
        const dtMatch = line.match(/(?:date|dated)[:\s]+([0-9]{1,2}\s*[/-]\s*[0-9]{1,2}\s*[/-]\s*[0-9]{2,4}|[0-9]{4}-[0-9]{2}-[0-9]{2})/i);
        if (dtMatch) {
          const cleanDateStr = dtMatch[1].replace(/\s+/g, "");
          const parsedD = parseDate(cleanDateStr);
          if (parsedD) {
            fields.document_date = {
              fieldKey: "document_date",
              label: "Document Date",
              value: parsedD,
              source: loc,
              confidence: 0.98,
              validationStatus: "valid",
              originalRawValue: line,
            };
          }
        }
      }

      // Document Number
      if (!fields.document_number) {
        const dnMatch = line.match(/(?:invoice\s*no\.?|quotation\s*no\.?|qtn\s*no\.?|dn\s*no\.?|po\s*no\.?|ref\s*no\.?)[:\s]+([A-Za-z0-9\s/_#-]{3,})/i);
        if (dnMatch) {
          const cleanDocNo = dnMatch[1].replace(/\s+/g, "").trim();
          if (cleanDocNo.length >= 3 && !/^(no|date|client|customer)$/i.test(cleanDocNo)) {
            fields.document_number = {
              fieldKey: "document_number",
              label: "Document Number",
              value: cleanDocNo,
              source: loc,
              confidence: 0.98,
              validationStatus: "valid",
              originalRawValue: line,
            };
          }
        }
      }

      // Scope of Work / Project Name
      if (!fields.project_name) {
        const pMatch = line.match(/(?:scope\s*of\s*work|sub|subject|project|site)[:\s]+(?:quotation\s*for\s*|invoice\s*for\s*)?([^\n]+)/i);
        if (pMatch && pMatch[1].trim().length > 3) {
          const projVal = pMatch[1].trim();
          if (!/^(terms|al safwah|golden elite|advance)/i.test(projVal)) {
            fields.project_name = {
              fieldKey: "project_name",
              label: "Project Name",
              value: projVal,
              source: loc,
              confidence: 0.95,
              validationStatus: "valid",
              originalRawValue: line,
            };
          }
        }
      }

      // Customer TRN
      if (!fields.trn) {
        const trnMatch = line.match(/(?:trn\s*no\.?|customer\s*trn)[:\s]*([0-9]{15})/i);
        if (trnMatch && trnMatch[1] !== "105319816200003") {
          fields.trn = {
            fieldKey: "trn",
            label: "Tax Registration Number (TRN)",
            value: trnMatch[1],
            source: loc,
            confidence: 0.99,
            validationStatus: "valid",
            originalRawValue: line,
          };
        }
      }

      // Subtotal (Net Amount)
      if (!fields.subtotal && /net\s*amount|subtotal|sub-total/i.test(line)) {
        const sMatch = line.match(/(?:net\s*amount|subtotal|sub-total)[:\s]*([0-9,.]+)/i);
        if (sMatch) {
          const num = parseNumber(sMatch[1]);
          if (num !== null) {
            fields.subtotal = {
              fieldKey: "subtotal",
              label: "Subtotal",
              value: num,
              source: loc,
              confidence: 0.98,
              validationStatus: "valid",
              originalRawValue: line,
            };
          }
        }
      }

      // VAT 5%
      if (!fields.vat_amount && /vat\s*(?:amount)?\s*5%?/i.test(line)) {
        const vMatch = line.match(/(?:vat\s*(?:amount)?\s*5%?)[:\s]*([0-9,.]+)/i);
        if (vMatch) {
          const num = parseNumber(vMatch[1]);
          if (num !== null) {
            fields.vat_amount = {
              fieldKey: "vat_amount",
              label: "VAT 5%",
              value: num,
              source: loc,
              confidence: 0.98,
              validationStatus: "valid",
              originalRawValue: line,
            };
          }
        }
      }

      // Grand Total
      if (!fields.total_amount && /total\s*amount|grand\s*total|net\s*total/i.test(line)) {
        const tMatch = line.match(/(?:total\s*amount|grand\s*total|net\s*total)[:\s]*([0-9,.]+)/i);
        if (tMatch) {
          const num = parseNumber(tMatch[1]);
          if (num !== null) {
            fields.total_amount = {
              fieldKey: "total_amount",
              label: "Grand Total",
              value: num,
              source: loc,
              confidence: 0.98,
              validationStatus: "valid",
              originalRawValue: line,
            };
          }
        }
      }

      // Line Items in PDF (e.g. '1. Fabrication of Pvc Fabric Canopy ( F2, F3 & F4 ) 3 LUM 4,500.00 13,500.00')
      const itemMatch = line.match(/^([0-9]+)\.?\s+(.+?)\s+([0-9,.]+)\s+([A-Za-z]+)\s+([0-9,.]+)\s+([0-9,.]+)$/);
      if (itemMatch) {
        const desc = itemMatch[2].trim();
        const qty = parseNumber(itemMatch[3]) || 1;
        const unit = itemMatch[4].trim();
        const rate = parseNumber(itemMatch[5]) || 0;
        const total = parseNumber(itemMatch[6]) || (qty * rate);

        items.push({
          id: `item_pdf_${page.pageNumber}_${lIdx + 1}`,
          itemNumber: itemSeq++,
          description: desc,
          quantity: qty,
          unit: unit || "Nos",
          unitPrice: rate,
          discount: 0,
          vatRate: 5,
          vatAmount: Number((total * 0.05).toFixed(2)),
          total,
          calculatedTotal: total,
          difference: 0,
          calculationStatus: "match",
          source: loc,
        });
      }

      // PVC Tank Liner
      if (docType === "measurement_project" || /tank\s+liner|diameter|height/i.test(line)) {
        const dM = line.match(/diameter[:\s]*([0-9.]+)/i);
        const hM = line.match(/height[:\s]*([0-9.]+)/i);
        if (dM || hM) {
          if (!measurement) measurement = { shape: "cylinder", source: loc, fabricWidth: 3, weldingAllowance: 3 };
          if (dM) measurement.diameter = parseFloat(dM[1]);
          if (hM) measurement.height = parseFloat(hM[1]);
        }
      }
    }
  }

  // Fallbacks from Filename
  if (!fields.document_number && fnDocNo) {
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

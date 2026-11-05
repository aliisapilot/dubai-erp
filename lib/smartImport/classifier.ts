/**
 * Dubai ERP: Smart Import - Automatic Document Classifier
 * High-precision deterministic document type classification based on file name,
 * headers, keywords, and structural patterns.
 */

import type { DocumentType } from "./types";

export interface ClassificationResult {
  documentType: DocumentType;
  confidence: number;
  reason: string;
  isAmbiguous: boolean;
}

interface PatternRule {
  type: DocumentType;
  primaryKeywords: RegExp[];
  secondaryKeywords: RegExp[];
  negativeKeywords?: RegExp[];
  fileNameKeywords: RegExp[];
  weight: number;
}

const RULES: PatternRule[] = [
  // 1. PVC Tank Liner & Technical Measurements (Engineering calculation sheets only)
  {
    type: "measurement_project",
    primaryKeywords: [
      /\b(liner\s+measurement|fabric\s+consumption|welding\s+allowance)\b/i,
      /\b(running\s+meter|square\s+meter|seam\s+overlap|bottom\s+base|cylinder\s+tank)\b/i,
    ],
    secondaryKeywords: [
      /\b(diameter|height|fabric\s+width|welding\s+size|centre\s+joint)\b/i,
      /\b(m2|sqm|rm|lin\.m)\b/i,
    ],
    negativeKeywords: [
      /\btax\s+invoice\b/i,
      /\bcommercial\s+invoice\b/i,
      /\binvoice\s+no\b/i,
      /\bvat\s*5%/i,
      /\bvat\s*amount\b/i,
      /\bnet\s+amount\b/i,
      /\btax\s+registration\b/i,
    ],
    fileNameKeywords: [/measurement/i, /fabric.*calc/i, /liner_calc/i],
    weight: 1.0,
  },

  // 2. Attendance
  {
    type: "attendance",
    primaryKeywords: [
      /\b(attendance\s+sheet|daily\s+attendance|employee\s+attendance|staff\s+attendance)\b/i,
      /\b(check\s*in|check\s*out|present\s*days|absent\s*days|emp-\d+)\b/i,
    ],
    secondaryKeywords: [
      /\b(regular\s+hours|working\s+days|shift|in\s*time|out\s*time)\b/i,
    ],
    fileNameKeywords: [/attendance/i, /timesheet/i, /muster/i],
    weight: 1.2,
  },

  // 3. Overtime
  {
    type: "overtime",
    primaryKeywords: [
      /\b(overtime\s+sheet|ot\s+hours|overtime\s+statement|ot\s+statement|approved\s+ot)\b/i,
      /\b(ot\s+rate|extra\s+hours|overtime\s+approval)\b/i,
    ],
    secondaryKeywords: [
      /\b(emp-\d+|employee\s+code|supervisor\s+approval)\b/i,
    ],
    fileNameKeywords: [/overtime/i, /\bot\b/i, /ot_sheet/i],
    weight: 1.2,
  },

  // 4. Proforma Invoice
  {
    type: "proforma_invoice",
    primaryKeywords: [
      /\bproforma\s+invoice\b/i,
      /\bpro-forma\s+invoice\b/i,
      /\bperforma\s+invoice\b/i,
    ],
    secondaryKeywords: [
      /\b(pi\s*no|pi\s*ref|proforma\s*no)\b/i,
    ],
    fileNameKeywords: [/proforma/i, /performa/i, /\bpi[-_]/i],
    weight: 1.3,
  },

  // 5. Tax Invoice
  {
    type: "tax_invoice",
    primaryKeywords: [
      /\btax\s+invoice\b/i,
      /\bcommercial\s+invoice\b/i,
      /\bvat\s+invoice\b/i,
      /\binvoice\s+ref\s*:\s*inv/i,
    ],
    secondaryKeywords: [
      /\b(trn\s*:?\s*\d+|trn\s+number|tax\s+registration|vat\s+5%|vat\s*amount|supply\s+date)\b/i,
      /\b(invoice\s+no|inv[-_#\s]\d+|net\s+amount|total\s+amount)\b/i,
    ],
    negativeKeywords: [/\bproforma\b/i, /\bpurchase\s+order\b/i, /\bdelivery\s+note\b/i, /\bstatement\s+of\s+account\b/i, /\baccount\s+statement\b/i],
    fileNameKeywords: [/tax.*invoice/i, /invoice/i, /^inv[-_0-9]/i, /\binv[-_]/i, /\binv\d+/i],
    weight: 1.4,
  },

  // 6. Delivery Note
  {
    type: "delivery_note",
    primaryKeywords: [
      /\bdelivery\s+note\b/i,
      /\bdelivery\s+order\b/i,
      /\bdispatch\s+note\b/i,
      /\bdelivery\s+challan\b/i,
    ],
    secondaryKeywords: [
      /\b(received\s+by|driver\s+name|vehicle\s+no|site\s+contact|delivered\s+to)\b/i,
      /\b(dn\s*no|dn[-_#\s]\d+)\b/i,
    ],
    fileNameKeywords: [/delivery.*note/i, /delivery/i, /\bdn[-_]/i, /\bdn\d+/i, /challan/i],
    weight: 1.2,
  },

  // 7. Purchase Order
  {
    type: "purchase_order",
    primaryKeywords: [
      /\bpurchase\s+order\b/i,
      /\blocal\s+purchase\s+order\b/i,
      /\blpo\b/i,
    ],
    secondaryKeywords: [
      /\b(po\s*no|lpo\s*no|po[-_#\s]\d+|expected\s+delivery|supplier\s+ref)\b/i,
    ],
    fileNameKeywords: [/purchase.*order/i, /\blpo\b/i, /\bpo[-_]/i, /\b(po|lpo)\d+/i],
    weight: 1.2,
  },

  // 8. Supplier Bill
  {
    type: "supplier_bill",
    primaryKeywords: [
      /\b(supplier\s+bill|vendor\s+bill|supplier\s+invoice|vendor\s+invoice)\b/i,
      /\b(bill\s+from\s+supplier|payable\s+voucher)\b/i,
    ],
    secondaryKeywords: [
      /\b(bill\s*no|vendor\s*trn|supplier\s*trn|purchase\s+ref)\b/i,
    ],
    fileNameKeywords: [/supplier.*bill/i, /vendor.*bill/i, /supplier.*inv/i],
    weight: 1.1,
  },

  // 9. Quotation
  {
    type: "quotation",
    primaryKeywords: [
      /\bquotation\b/i,
      /\bprice\s+quotation\b/i,
      /\bformal\s+quotation\b/i,
      /\bquote\b/i,
    ],
    secondaryKeywords: [
      /\b(qtn\s*no|quote\s*no|quotation\s*ref|validity|qtn[-_#/]\d+)\b/i,
      /\b(scope\s+of\s+work|terms\s+and\s+conditions|payment\s+terms)\b/i,
    ],
    negativeKeywords: [/\btax\s+invoice\b/i, /\bpurchase\s+order\b/i, /\bstatement\s+of\s+account\b/i, /\baccount\s+statement\b/i],
    fileNameKeywords: [/quotation/i, /\bqtn[-_]/i, /\bqtn\d+/i, /quote/i],
    weight: 1.1,
  },

  // 10. Expenses
  {
    type: "expense",
    primaryKeywords: [
      /\b(expense\s+voucher|petty\s+cash\s+voucher|payment\s+voucher|expense\s+claim)\b/i,
      /\b(petty\s+cash\s+summary|office\s+expenses|fuel\s+and\s+transport)\b/i,
    ],
    secondaryKeywords: [
      /\b(paid\s+to|expense\s+category|receipt\s+no|approved\s+by)\b/i,
    ],
    fileNameKeywords: [/expense/i, /petty.*cash/i, /voucher/i],
    weight: 1.1,
  },

  // 11. Cheques
  {
    type: "cheque",
    primaryKeywords: [
      /\b(cheque\s+register|cheque\s+book|cheque\s+deposit|cheque\s+issued)\b/i,
      /\b(cheque\s+no|bank\s+name|cheque\s+date|drawer|payee)\b/i,
    ],
    secondaryKeywords: [
      /\b(cleared|bounced|pdc|clearing\s+date)\b/i,
    ],
    fileNameKeywords: [/cheque/i, /check/i, /pdc/i],
    weight: 1.2,
  },

  // 12. Master Customer List
  {
    type: "customer_list",
    primaryKeywords: [
      /\b(customer\s+list|clients\s+directory|customer\s+master|customer\s+database)\b/i,
    ],
    secondaryKeywords: [
      /\b(customer\s+code|client\s+name|credit\s+limit|billing\s+address)\b/i,
    ],
    fileNameKeywords: [/customers?/i, /clients?/i],
    weight: 1.1,
  },

  // 13. Master Supplier List
  {
    type: "supplier_list",
    primaryKeywords: [
      /\b(supplier\s+list|vendor\s+list|suppliers\s+directory|vendor\s+master)\b/i,
    ],
    secondaryKeywords: [
      /\b(supplier\s+code|vendor\s+code|vendor\s+name|supplier\s+name)\b/i,
    ],
    fileNameKeywords: [/suppliers?/i, /vendors?/i],
    weight: 1.1,
  },

  // 14. Master Product List
  {
    type: "product_list",
    primaryKeywords: [
      /\b(product\s+list|item\s+master|inventory\s+list|price\s+list|materials\s+list)\b/i,
    ],
    secondaryKeywords: [
      /\b(sku|unit\s+price|cost\s+price|stock\s+quantity|item\s+code)\b/i,
    ],
    fileNameKeywords: [/products?/i, /items?/i, /inventory/i, /materials?/i],
    weight: 1.1,
  },

  // 15. Statement of Account (SOA)
  {
    type: "customer_statement",
    primaryKeywords: [
      /\bstatement\s+of\s+account\b/i,
      /\baccount\s+statement\b/i,
      /\bcustomer\s+statement\b/i,
      /\baccount\s+summary\b/i,
      /\baccount\s+current\s+balance\b/i,
      /\bbalance\s+brought\s+forward\b/i,
      /\bstatement\s*(?:#|no|number|ref)\b/i,
    ],
    secondaryKeywords: [
      /\b(opening\s+balance|previous\s+balance|new\s+charges|total\s+balance\s+due|closing\s+balance|current\s+balance)\b/i,
      /\b(soa\s*#|soa\s*no|soa[-_#\s]\d+)\b/i,
      /\b(charges\s*\(?aed\)?|credits\s*\(?aed\)?|balance\s*\(?aed\)?)\b/i,
      /\b(statement\s+date|from\s+date|to\s+date)\b/i,
    ],
    fileNameKeywords: [
      /statement.*account/i,
      /account.*statement/i,
      /\bsoa[-_0-9]/i,
      /\bsoa\d+/i,
      /^soa[-_0-9]/i,
      /\bsoa\b/i,
    ],
    weight: 1.4,
  },
];

export function classifyDocument(
  fileName: string,
  fullText: string,
  sheetsOrTablesCount: number = 1
): ClassificationResult {
  const scores: { type: DocumentType; score: number; reasons: string[] }[] = [];

  for (const rule of RULES) {
    let score = 0;
    const reasons: string[] = [];

    // Check fileName
    for (const fnRegex of rule.fileNameKeywords) {
      if (fnRegex.test(fileName)) {
        score += 35 * rule.weight;
        reasons.push(`Filename matches keyword ${fnRegex.source}`);
        break;
      }
    }

    // Check negative keywords (hard deduction)
    if (rule.negativeKeywords) {
      for (const neg of rule.negativeKeywords) {
        if (neg.test(fullText)) {
          score -= 40;
        }
      }
    }

    // Check primary keywords
    for (const kw of rule.primaryKeywords) {
      if (kw.test(fullText)) {
        score += 45 * rule.weight;
        reasons.push(`Text contains primary indicator: ${kw.source}`);
      }
    }

    // Check secondary keywords
    for (const kw of rule.secondaryKeywords) {
      if (kw.test(fullText)) {
        score += 15 * rule.weight;
        reasons.push(`Text contains secondary indicator: ${kw.source}`);
      }
    }

    if (score > 0) {
      scores.push({ type: rule.type, score, reasons });
    }
  }

  // Sort by highest score
  scores.sort((a, b) => b.score - a.score);

  if (scores.length === 0 || scores[0].score < 30) {
    return {
      documentType: "unknown",
      confidence: 0.1,
      reason: "Could not reliably classify document type from keywords or filename.",
      isAmbiguous: true,
    };
  }

  const top = scores[0];
  const second = scores[1];
  const confidence = Math.min(1.0, Number((top.score / 100).toFixed(2)));
  const isAmbiguous = second && (top.score - second.score < 15);

  return {
    documentType: top.type,
    confidence,
    reason: top.reasons.join("; "),
    isAmbiguous,
  };
}

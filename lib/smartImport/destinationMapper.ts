/**
 * Dubai ERP: Smart Import - Destination Mapping Generator
 * Generates the 12-column destination mapping table for every extracted field and line item.
 */

import type {
  DestinationMapping,
  DocumentType,
  ExtractedField,
  ExtractedLineItem,
  ExtractedMeasurement,
  EntityMatchResult,
  StatusResolution,
} from "./types";

export function generateDestinationMappings(
  fileName: string,
  docType: DocumentType,
  fields: Record<string, ExtractedField>,
  items: ExtractedLineItem[],
  customerRes?: EntityMatchResult,
  supplierRes?: EntityMatchResult,
  projectRes?: EntityMatchResult,
  measurement?: ExtractedMeasurement,
  statusRes?: StatusResolution
): DestinationMapping[] {
  const mappings: DestinationMapping[] = [];

  const getSourceLocStr = (source?: { sheet?: string; cell?: string; page?: number; table?: number; row?: number; col?: number; paragraph?: number }) => {
    if (!source) return "Source Header";
    if (source.sheet && source.cell) return `${source.sheet}!${source.cell}`;
    if (source.table && source.row) return `Table ${source.table}, Row ${source.row}${source.col ? `, Col ${source.col}` : ""}`;
    if (source.page && source.row) return `Page ${source.page}, Line ${source.row}`;
    if (source.paragraph) return `Paragraph ${source.paragraph}`;
    return "Extracted Document";
  };

  // 1. Customer Mapping
  if (fields.customer_name && customerRes) {
    mappings.push({
      sourceFilename: fileName,
      sourceLocation: getSourceLocStr(fields.customer_name.source),
      extractedValue: String(fields.customer_name.value || ""),
      documentType: docType,
      erpModule: "Customers",
      destinationTable: "customers",
      destinationField: "name",
      existingRecordMatch: customerRes.matchedName || undefined,
      proposedAction: customerRes.action,
      validationStatus: customerRes.action === "needs_review" ? "warning" : "valid",
      confidence: customerRes.matchConfidence,
      editableValue: String(fields.customer_name.value || ""),
    });
  }

  // 2. Supplier Mapping
  if (fields.supplier_name && supplierRes) {
    mappings.push({
      sourceFilename: fileName,
      sourceLocation: getSourceLocStr(fields.supplier_name.source),
      extractedValue: String(fields.supplier_name.value || ""),
      documentType: docType,
      erpModule: "Suppliers",
      destinationTable: "suppliers",
      destinationField: "name",
      existingRecordMatch: supplierRes.matchedName || undefined,
      proposedAction: supplierRes.action,
      validationStatus: supplierRes.action === "needs_review" ? "warning" : "valid",
      confidence: supplierRes.matchConfidence,
      editableValue: String(fields.supplier_name.value || ""),
    });
  }

  // 3. Project Mapping
  if (fields.project_name && projectRes && projectRes.action !== "skip") {
    mappings.push({
      sourceFilename: fileName,
      sourceLocation: getSourceLocStr(fields.project_name.source),
      extractedValue: String(fields.project_name.value || ""),
      documentType: docType,
      erpModule: "Projects",
      destinationTable: "projects",
      destinationField: "name",
      existingRecordMatch: projectRes.matchedName || undefined,
      proposedAction: projectRes.action,
      validationStatus: projectRes.action === "needs_review" ? "warning" : "valid",
      confidence: projectRes.matchConfidence,
      editableValue: String(fields.project_name.value || ""),
    });
  }

  // 4. TRN Mapping
  if (fields.trn) {
    const isSupplier = docType === "purchase_order" || docType === "supplier_bill";
    mappings.push({
      sourceFilename: fileName,
      sourceLocation: getSourceLocStr(fields.trn.source),
      extractedValue: String(fields.trn.value || ""),
      documentType: docType,
      erpModule: isSupplier ? "Suppliers" : "Customers",
      destinationTable: isSupplier ? "suppliers" : "customers",
      destinationField: "trn",
      proposedAction: "create_new",
      validationStatus: "valid",
      confidence: 0.99,
      editableValue: String(fields.trn.value || ""),
    });
  }

  // 5. Document Number Mapping
  if (fields.document_number) {
    let destTable = "quotations";
    let destField = "quotation_number";
    let erpMod = "Quotations";

    switch (docType) {
      case "tax_invoice":
        destTable = "tax_invoices";
        destField = "invoice_number";
        erpMod = "Tax Invoices";
        break;
      case "proforma_invoice":
        destTable = "proforma_invoices";
        destField = "proforma_number";
        erpMod = "Proforma Invoices";
        break;
      case "delivery_note":
        destTable = "delivery_notes";
        destField = "delivery_note_number";
        erpMod = "Delivery Notes";
        break;
      case "purchase_order":
        destTable = "purchase_orders";
        destField = "purchase_order_number";
        erpMod = "Purchase Orders";
        break;
      case "supplier_bill":
        destTable = "supplier_bills";
        destField = "bill_number";
        erpMod = "Supplier Bills";
        break;
      case "expense":
        destTable = "expenses";
        destField = "expense_number";
        erpMod = "Expenses";
        break;
    }

    mappings.push({
      sourceFilename: fileName,
      sourceLocation: getSourceLocStr(fields.document_number.source),
      extractedValue: String(fields.document_number.value || ""),
      documentType: docType,
      erpModule: erpMod,
      destinationTable: destTable,
      destinationField: destField,
      proposedAction: "create_new",
      validationStatus: "valid",
      confidence: 0.98,
      editableValue: String(fields.document_number.value || ""),
    });
  }

  // 6. Document Date Mapping
  if (fields.document_date) {
    let destTable = "quotations";
    let destField = "quotation_date";
    let erpMod = "Quotations";

    switch (docType) {
      case "tax_invoice":
        destTable = "tax_invoices";
        destField = "invoice_date";
        erpMod = "Tax Invoices";
        break;
      case "delivery_note":
        destTable = "delivery_notes";
        destField = "delivery_date";
        erpMod = "Delivery Notes";
        break;
      case "purchase_order":
        destTable = "purchase_orders";
        destField = "order_date";
        erpMod = "Purchase Orders";
        break;
      case "supplier_bill":
        destTable = "supplier_bills";
        destField = "bill_date";
        erpMod = "Supplier Bills";
        break;
      case "expense":
        destTable = "expenses";
        destField = "expense_date";
        erpMod = "Expenses";
        break;
    }

    mappings.push({
      sourceFilename: fileName,
      sourceLocation: getSourceLocStr(fields.document_date.source),
      extractedValue: String(fields.document_date.value || ""),
      documentType: docType,
      erpModule: erpMod,
      destinationTable: destTable,
      destinationField: destField,
      proposedAction: "create_new",
      validationStatus: "valid",
      confidence: 0.95,
      editableValue: String(fields.document_date.value || ""),
    });
  }

  // 7. Line Items Mappings
  let itemDestTable = "quotation_items";
  if (docType === "tax_invoice") itemDestTable = "tax_invoice_items";
  else if (docType === "proforma_invoice") itemDestTable = "proforma_invoice_items";
  else if (docType === "delivery_note") itemDestTable = "delivery_note_items";
  else if (docType === "purchase_order") itemDestTable = "purchase_order_items";
  else if (docType === "supplier_bill") itemDestTable = "supplier_bill_items";

  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    mappings.push({
      sourceFilename: fileName,
      sourceLocation: getSourceLocStr(item.source),
      extractedValue: `${item.description} / Qty: ${item.quantity} ${item.unit} / Rate: AED ${item.unitPrice}`,
      documentType: docType,
      erpModule: "Line Items",
      destinationTable: itemDestTable,
      destinationField: "description, quantity, unit_price, line_total",
      proposedAction: "create_new",
      validationStatus: item.calculationStatus === "mismatch" ? "warning" : "valid",
      confidence: 0.95,
      editableValue: item.description,
    });
  }

  // 8. PVC Tank Liner Measurements
  if (measurement) {
    if (measurement.diameter) {
      mappings.push({
        sourceFilename: fileName,
        sourceLocation: getSourceLocStr(measurement.source),
        extractedValue: `${measurement.diameter} m`,
        documentType: "measurement_project",
        erpModule: "Measurements",
        destinationTable: "measurement_items",
        destinationField: "tank_liner_data.tankDiameter",
        proposedAction: "create_new",
        validationStatus: "valid",
        confidence: 0.95,
        editableValue: measurement.diameter,
      });
    }
    if (measurement.height) {
      mappings.push({
        sourceFilename: fileName,
        sourceLocation: getSourceLocStr(measurement.source),
        extractedValue: `${measurement.height} m`,
        documentType: "measurement_project",
        erpModule: "Measurements",
        destinationTable: "measurement_items",
        destinationField: "tank_liner_data.tankHeight",
        proposedAction: "create_new",
        validationStatus: "valid",
        confidence: 0.95,
        editableValue: measurement.height,
      });
    }
    if (measurement.calculatedArea) {
      mappings.push({
        sourceFilename: fileName,
        sourceLocation: "Calculated Formula (PI*D*H + PI*r²)",
        extractedValue: `${measurement.calculatedArea} m²`,
        documentType: "measurement_project",
        erpModule: "Measurements",
        destinationTable: "measurement_items",
        destinationField: "calculated_total",
        proposedAction: "create_new",
        validationStatus: "valid",
        confidence: 1.0,
        editableValue: measurement.calculatedArea,
      });
    }
  }

  // 9. Document Status Mapping (Historical Accuracy & Review)
  if (statusRes || fields.status) {
    let destTable = "quotations";
    let erpMod = "Quotations";
    switch (docType) {
      case "tax_invoice":
        destTable = "tax_invoices";
        erpMod = "Tax Invoices";
        break;
      case "delivery_note":
        destTable = "delivery_notes";
        erpMod = "Delivery Notes";
        break;
      case "purchase_order":
        destTable = "purchase_orders";
        erpMod = "Purchase Orders";
        break;
      case "expense":
        destTable = "expenses";
        erpMod = "Expenses";
        break;
    }

    const proposedStatus = statusRes?.proposedStatus || String(fields.status?.value || "draft");
    const rawEv = statusRes?.rawEvidence || (statusRes?.isAssumed ? "None detected (Assumed)" : "Extracted evidence");

    mappings.push({
      sourceFilename: fileName,
      sourceLocation: statusRes?.rawEvidence ? "Source Document Evidence" : "Default Neutral Fallback",
      extractedValue: rawEv,
      documentType: docType,
      erpModule: erpMod,
      destinationTable: destTable,
      destinationField: "status",
      proposedAction: statusRes?.isAssumed ? "needs_review" : "create_new",
      validationStatus: statusRes?.isAssumed ? "warning" : "valid",
      confidence: statusRes?.isAssumed ? 0.7 : 0.95,
      editableValue: proposedStatus,
    });
  }

  // 10. Project Status Mapping (if projectRes and projectRes.action !== "skip")
  if (projectRes && projectRes.action !== "skip" && (statusRes?.projectStatusResolution || fields.project_status)) {
    const projStatus = statusRes?.projectStatusResolution?.proposedStatus || String(fields.project_status?.value || "Planning");
    const rawEv = statusRes?.projectStatusResolution?.rawEvidence || (statusRes?.projectStatusResolution?.isAssumed ? "None detected (Assumed)" : "Extracted evidence");

    mappings.push({
      sourceFilename: fileName,
      sourceLocation: statusRes?.projectStatusResolution?.rawEvidence ? "Source Project Evidence" : "Default Neutral Fallback",
      extractedValue: rawEv,
      documentType: docType,
      erpModule: "Projects",
      destinationTable: "projects",
      destinationField: "status",
      proposedAction: statusRes?.projectStatusResolution?.isAssumed ? "needs_review" : "create_new",
      validationStatus: statusRes?.projectStatusResolution?.isAssumed ? "warning" : "valid",
      confidence: statusRes?.projectStatusResolution?.isAssumed ? 0.7 : 0.95,
      editableValue: projStatus,
    });
  }

  return mappings;
}

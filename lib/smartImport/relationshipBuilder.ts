/**
 * Dubai ERP: Smart Import - Relationship Tree & Before/After Metrics Engine
 * Constructs hierarchical visual relationship trees and computes exact before/after ERP record counts.
 */

import type {
  ImportBatchSummary,
  ParsedDocument,
  RelationshipTreeNode,
} from "./types";
import type { ExistingEntitiesCache } from "./matcher";

export function buildRelationshipTrees(documents: ParsedDocument[]): RelationshipTreeNode[] {
  const trees: RelationshipTreeNode[] = [];

  for (const doc of documents) {
    const custRes = doc.customerResolution;
    const projRes = doc.projectResolution;
    const docNum = String(doc.fields.document_number?.value || doc.filename);

    // Document Node
    const docNode: RelationshipTreeNode = {
      id: `doc_${doc.id}`,
      type: "document",
      label: `${doc.documentType.toUpperCase()}: ${docNum}`,
      details: `File: ${doc.filename} | Items: ${doc.items.length}`,
      status: doc.isDuplicate ? "duplicate" : "new",
      children: [],
    };

    // Add item children
    for (const it of doc.items) {
      docNode.children!.push({
        id: `item_${it.id}`,
        type: "item",
        label: it.description,
        details: `Qty ${it.quantity} ${it.unit} @ AED ${it.unitPrice} | Total AED ${it.total}`,
        status: it.calculationStatus === "mismatch" ? "needs_review" : "new",
      });
    }

    // Add measurement child if present
    if (doc.measurements) {
      const m = doc.measurements;
      const mChildren: RelationshipTreeNode[] = [];
      if (m.diameter) mChildren.push({ id: `m_d_${doc.id}`, type: "measurement", label: `Diameter: ${m.diameter} m`, status: "new" });
      if (m.height) mChildren.push({ id: `m_h_${doc.id}`, type: "measurement", label: `Height: ${m.height} m`, status: "new" });
      if (m.calculatedArea) mChildren.push({ id: `m_a_${doc.id}`, type: "measurement", label: `Area: ${m.calculatedArea} m²`, status: "new" });
      if (m.calculatedRunningMeter) mChildren.push({ id: `m_rm_${doc.id}`, type: "measurement", label: `Running Meter: ${m.calculatedRunningMeter} RM`, status: "new" });

      docNode.children!.push({
        id: `meas_${doc.id}`,
        type: "measurement",
        label: "PVC Tank Liner Calculations",
        details: `${m.shape || "Cylinder"} Tank`,
        status: "new",
        children: mChildren,
      });
    }

    // Project Node (Parent of Document)
    let projNode: RelationshipTreeNode;
    if (projRes && projRes.action !== "skip" && projRes.extractedName) {
      projNode = {
        id: `proj_${doc.id}`,
        type: "project",
        label: `Project: ${projRes.extractedName}`,
        details: projRes.matchedName ? `Matched to ${projRes.matchedName}` : "New Project",
        status: projRes.action === "reuse_existing" ? "matched" : projRes.action === "needs_review" ? "needs_review" : "new",
        children: [docNode],
      };
    } else {
      projNode = {
        id: `proj_unassigned_${doc.id}`,
        type: "project",
        label: "General / Direct Document",
        status: "matched",
        children: [docNode],
      };
    }

    // Customer / Supplier Node (Root)
    if (custRes && custRes.extractedName) {
      const existingCustomerNode = trees.find(t => t.label === `Customer: ${custRes.extractedName}` || (custRes.matchedName && t.label === `Customer: ${custRes.matchedName}`));
      if (existingCustomerNode) {
        existingCustomerNode.children!.push(projNode);
      } else {
        trees.push({
          id: `cust_${doc.id}`,
          type: "customer",
          label: `Customer: ${custRes.extractedName}`,
          details: custRes.matchedName ? `Reusing: ${custRes.matchedName}` : "New Customer",
          status: custRes.action === "reuse_existing" ? "matched" : custRes.action === "needs_review" ? "needs_review" : "new",
          children: [projNode],
        });
      }
    } else if (doc.supplierResolution && doc.supplierResolution.extractedName) {
      const suppRes = doc.supplierResolution;
      trees.push({
        id: `supp_${doc.id}`,
        type: "supplier",
        label: `Supplier: ${suppRes.extractedName}`,
        details: suppRes.matchedName ? `Reusing: ${suppRes.matchedName}` : "New Supplier",
        status: suppRes.action === "reuse_existing" ? "matched" : suppRes.action === "needs_review" ? "needs_review" : "new",
        children: [projNode],
      });
    } else {
      // Unassigned Root
      trees.push(projNode);
    }
  }

  return trees;
}

export function computeBeforeAndAfterSummary(
  documents: ParsedDocument[],
  cache: ExistingEntitiesCache
): {
  beforeCounts: {
    customers: number;
    suppliers: number;
    projects: number;
    documents: number;
  };
  proposedSummary: ImportBatchSummary;
} {
  const beforeCounts = {
    customers: cache.customers.length,
    suppliers: cache.suppliers.length,
    projects: cache.projects.length,
    documents: Object.keys(cache.existingDocuments).length,
  };

  const summary: ImportBatchSummary = {
    totalFiles: documents.length,
    newCustomers: 0,
    reusedCustomers: 0,
    newSuppliers: 0,
    reusedSuppliers: 0,
    newProjects: 0,
    reusedProjects: 0,
    newQuotations: 0,
    newInvoices: 0,
    newPurchaseOrders: 0,
    newExpenses: 0,
    newMeasurements: 0,
    totalLineItems: 0,
    duplicatesSkipped: 0,
    recordsRequiringReview: 0,
    validationErrors: 0,
  };

  const seenCustomers = new Set<string>();
  const seenSuppliers = new Set<string>();
  const seenProjects = new Set<string>();

  for (const doc of documents) {
    // Duplicates
    if (doc.isDuplicate) {
      summary.duplicatesSkipped++;
    }

    // Customer
    if (doc.customerResolution && doc.customerResolution.extractedName) {
      const nameKey = doc.customerResolution.extractedName.toLowerCase();
      if (!seenCustomers.has(nameKey)) {
        seenCustomers.add(nameKey);
        if (doc.customerResolution.action === "create_new") summary.newCustomers++;
        else if (doc.customerResolution.action === "reuse_existing") summary.reusedCustomers++;
        else if (doc.customerResolution.action === "needs_review") summary.recordsRequiringReview++;
      }
    }

    // Supplier
    if (doc.supplierResolution && doc.supplierResolution.extractedName) {
      const nameKey = doc.supplierResolution.extractedName.toLowerCase();
      if (!seenSuppliers.has(nameKey)) {
        seenSuppliers.add(nameKey);
        if (doc.supplierResolution.action === "create_new") summary.newSuppliers++;
        else if (doc.supplierResolution.action === "reuse_existing") summary.reusedSuppliers++;
        else if (doc.supplierResolution.action === "needs_review") summary.recordsRequiringReview++;
      }
    }

    // Project
    if (doc.projectResolution && doc.projectResolution.extractedName && doc.projectResolution.action !== "skip") {
      const projKey = doc.projectResolution.extractedName.toLowerCase();
      if (!seenProjects.has(projKey)) {
        seenProjects.add(projKey);
        if (doc.projectResolution.action === "create_new") summary.newProjects++;
        else if (doc.projectResolution.action === "reuse_existing") summary.reusedProjects++;
        else if (doc.projectResolution.action === "needs_review") summary.recordsRequiringReview++;
      }
    }

    // Documents
    if (!doc.isDuplicate) {
      switch (doc.documentType) {
        case "quotation":
          summary.newQuotations++;
          break;
        case "tax_invoice":
        case "proforma_invoice":
          summary.newInvoices++;
          break;
        case "purchase_order":
          summary.newPurchaseOrders++;
          break;
        case "expense":
          summary.newExpenses++;
          break;
        case "measurement_project":
          summary.newMeasurements++;
          break;
      }
    }

    summary.totalLineItems += doc.items.length;
    summary.validationErrors += doc.validationErrors.length;
  }

  return {
    beforeCounts,
    proposedSummary: summary,
  };
}

/**
 * Dubai ERP: Smart Import - Topological Importer & Compensating Rollback Handler
 * Executes approved records into Supabase in strict relational order (Stages 11-12)
 * and records complete audit batches with compensating reverse-order deletion.
 * Note: Database deletions during rollback are application-level compensating actions, not an ACID database transaction.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  ImportBatchRecord,
  ImportBatchSummary,
  ParsedDocument,
} from "./types";
import {
  normalizeProjectStatus,
  normalizeQuotationStatus,
  normalizeTaxInvoiceStatus,
  normalizeDeliveryNoteStatus,
  normalizePurchaseOrderStatus,
} from "./statusResolver";

export interface CommitResult {
  success: boolean;
  batchId: string;
  recordsCreated: Record<string, number>;
  recordsMatched: Record<string, number>;
  summary: ImportBatchSummary;
  errors: string[];
}

export async function executeTopologicalImport(
  supabase: SupabaseClient,
  companyId: string,
  approvedDocuments: ParsedDocument[],
  userEmail?: string
): Promise<CommitResult> {
  const batchId = crypto.randomUUID();
  const recordsCreated: Record<string, number> = {};
  const recordsMatched: Record<string, number> = {};
  const createdRecordIds: { table: string; id: string }[] = [];
  const errors: string[] = [];

  const incCreated = (table: string) => {
    recordsCreated[table] = (recordsCreated[table] || 0) + 1;
  };
  const incMatched = (table: string) => {
    recordsMatched[table] = (recordsMatched[table] || 0) + 1;
  };



  // Maps for newly created/reused IDs during this batch
  const customerIdMap = new Map<string, string>(); // nameKey -> UUID
  const supplierIdMap = new Map<string, string>(); // nameKey -> UUID
  const projectIdMap = new Map<string, string>(); // nameKey -> UUID

  try {
    // ---------------------------------------------------------
    // STAGE A: Customers
    // ---------------------------------------------------------
    for (const doc of approvedDocuments) {
      const cRes = doc.customerResolution;
      if (!cRes || !cRes.extractedName || cRes.action === "skip") continue;

      const nameKey = cRes.extractedName.toLowerCase().trim();
      if (customerIdMap.has(nameKey)) continue;

      if (cRes.action === "reuse_existing" && cRes.matchedId) {
        customerIdMap.set(nameKey, cRes.matchedId);
        incMatched("customers");
      } else {
        // Pre-insert idempotence check to prevent duplicate records on retry
        let existingCust: { id: string } | null = null;
        if (cRes.extractedTrn) {
          const { data } = await supabase
            .from("customers")
            .select("id")
            .eq("company_id", companyId)
            .eq("trn", cRes.extractedTrn.trim())
            .maybeSingle();
          existingCust = data;
        }
        if (!existingCust && cRes.extractedName) {
          const { data } = await supabase
            .from("customers")
            .select("id")
            .eq("company_id", companyId)
            .ilike("name", cRes.extractedName.trim())
            .maybeSingle();
          existingCust = data;
        }

        if (existingCust) {
          customerIdMap.set(nameKey, existingCust.id);
          incMatched("customers");
        } else if (cRes.action === "create_new") {
          // Create new customer
          const insertPayload = {
            company_id: companyId,
            customer_code: `CUS-${Math.floor(1000 + Math.random() * 9000)}`,
            name: cRes.extractedName,
            trn: cRes.extractedTrn || null,
            email: cRes.extractedEmail || null,
            phone: cRes.extractedPhone || null,
            active: true,
            notes: `Imported via Smart Import Batch ${batchId} from ${doc.filename}`,
          };

          const { data: newCust, error: custErr } = await supabase
            .from("customers")
            .insert(insertPayload)
            .select("id")
            .single();

          if (custErr) {
            errors.push(`Failed to create customer '${cRes.extractedName}': ${custErr.message}`);
          } else if (newCust) {
            customerIdMap.set(nameKey, newCust.id);
            createdRecordIds.push({ table: "customers", id: newCust.id });
            incCreated("customers");
          }
        }
      }
    }

    // ---------------------------------------------------------
    // STAGE B: Suppliers
    // ---------------------------------------------------------
    for (const doc of approvedDocuments) {
      const sRes = doc.supplierResolution;
      if (!sRes || !sRes.extractedName || sRes.action === "skip") continue;

      const nameKey = sRes.extractedName.toLowerCase().trim();
      if (supplierIdMap.has(nameKey)) continue;

      if (sRes.action === "reuse_existing" && sRes.matchedId) {
        supplierIdMap.set(nameKey, sRes.matchedId);
        incMatched("suppliers");
      } else {
        // Pre-insert idempotence check to prevent duplicate records on retry
        let existingSupp: { id: string } | null = null;
        if (sRes.extractedTrn) {
          const { data } = await supabase
            .from("suppliers")
            .select("id")
            .eq("company_id", companyId)
            .eq("trn", sRes.extractedTrn.trim())
            .maybeSingle();
          existingSupp = data;
        }
        if (!existingSupp && sRes.extractedName) {
          const { data } = await supabase
            .from("suppliers")
            .select("id")
            .eq("company_id", companyId)
            .ilike("name", sRes.extractedName.trim())
            .maybeSingle();
          existingSupp = data;
        }

        if (existingSupp) {
          supplierIdMap.set(nameKey, existingSupp.id);
          incMatched("suppliers");
        } else if (sRes.action === "create_new") {
          const insertPayload = {
            company_id: companyId,
            supplier_code: `SUP-${Math.floor(1000 + Math.random() * 9000)}`,
            name: sRes.extractedName,
            trn: sRes.extractedTrn || null,
            email: sRes.extractedEmail || null,
            phone: sRes.extractedPhone || null,
            active: true,
            notes: `Imported via Smart Import Batch ${batchId} from ${doc.filename}`,
          };

          const { data: newSupp, error: suppErr } = await supabase
            .from("suppliers")
            .insert(insertPayload)
            .select("id")
            .single();

          if (suppErr) {
            errors.push(`Failed to create supplier '${sRes.extractedName}': ${suppErr.message}`);
          } else if (newSupp) {
            supplierIdMap.set(nameKey, newSupp.id);
            createdRecordIds.push({ table: "suppliers", id: newSupp.id });
            incCreated("suppliers");
          }
        }
      }
    }

    // ---------------------------------------------------------
    // STAGE C: Projects
    // ---------------------------------------------------------
    for (const doc of approvedDocuments) {
      const pRes = doc.projectResolution;
      if (!pRes || !pRes.extractedName || pRes.action === "skip") continue;

      const nameKey = pRes.extractedName.toLowerCase().trim();
      if (projectIdMap.has(nameKey)) continue;

      const custName = doc.customerResolution?.extractedName?.toLowerCase().trim();
      const resolvedCustId = custName ? customerIdMap.get(custName) : null;

      if (pRes.action === "reuse_existing" && pRes.matchedId) {
        projectIdMap.set(nameKey, pRes.matchedId);
        incMatched("projects");
      } else {
        // Pre-insert idempotence check to prevent duplicate projects on retry
        let existingProj: { id: string } | null = null;
        if (resolvedCustId && pRes.extractedName) {
          const { data } = await supabase
            .from("projects")
            .select("id")
            .eq("company_id", companyId)
            .eq("customer_id", resolvedCustId)
            .ilike("name", pRes.extractedName.trim())
            .maybeSingle();
          existingProj = data;
        }
        if (!existingProj && pRes.extractedName) {
          const { data } = await supabase
            .from("projects")
            .select("id")
            .eq("company_id", companyId)
            .ilike("name", pRes.extractedName.trim())
            .maybeSingle();
          existingProj = data;
        }

        if (existingProj) {
          projectIdMap.set(nameKey, existingProj.id);
          incMatched("projects");
        } else if (pRes.action === "create_new") {
          // Canonical database CHECK constraint requires: 'Planning' | 'In Progress' | 'On Hold' | 'Completed' | 'Handed Over'
          const canonicalStatus = normalizeProjectStatus(
            doc.statusResolution?.projectStatusResolution?.proposedStatus ||
            (doc.fields.project_status?.value ? String(doc.fields.project_status.value) : "Planning")
          );

          const insertPayload = {
            company_id: companyId,
            name: pRes.extractedName,
            project_number: `PRJ-${Math.floor(1000 + Math.random() * 9000)}`,
            customer_id: resolvedCustId || null,
            status: canonicalStatus,
            description: `Imported via Smart Import Batch ${batchId} from ${doc.filename}`,
          };

          const { data: newProj, error: projErr } = await supabase
            .from("projects")
            .insert(insertPayload)
            .select("id")
            .single();

          if (projErr) {
            errors.push(`Failed to create project '${pRes.extractedName}': ${projErr.message}`);
          } else if (newProj) {
            projectIdMap.set(nameKey, newProj.id);
            createdRecordIds.push({ table: "projects", id: newProj.id });
            incCreated("projects");
          }
        }
      }
    }

    // ---------------------------------------------------------
    // STAGE D: Documents & Line Items
    // ---------------------------------------------------------
    for (const doc of approvedDocuments) {
      if (doc.isDuplicate) continue; // Skip duplicates to preserve integrity

      const custName = doc.customerResolution?.extractedName?.toLowerCase().trim();
      const resolvedCustId = custName ? customerIdMap.get(custName) : null;

      const suppName = doc.supplierResolution?.extractedName?.toLowerCase().trim();
      const resolvedSuppId = suppName ? supplierIdMap.get(suppName) : null;

      const projName = doc.projectResolution?.extractedName?.toLowerCase().trim();
      const resolvedProjId = projName ? projectIdMap.get(projName) : null;

      const docNumber = String(doc.fields.document_number?.value || `${doc.documentType.toUpperCase()}-${Math.floor(1000 + Math.random() * 9000)}`);
      const docDate = String(doc.fields.document_date?.value || new Date().toISOString().split("T")[0]);
      const subtotal = Number(doc.fields.subtotal?.value) || 0;
      const vatAmount = Number(doc.fields.vat_amount?.value) || 0;
      const totalAmount = Number(doc.fields.total_amount?.value) || (subtotal + vatAmount);

      switch (doc.documentType) {
        // --- QUOTATIONS ---
        case "quotation": {
          if (!resolvedCustId) {
            errors.push(`Quotation ${docNumber} requires a linked customer.`);
            break;
          }

          // Pre-insert idempotence check to prevent duplicate quotations on retry
          const { data: existingQ } = await supabase
            .from("quotations")
            .select("id")
            .eq("company_id", companyId)
            .eq("quotation_number", docNumber)
            .maybeSingle();

          if (existingQ) {
            incMatched("quotations");
            break;
          }

          // Canonical database CHECK constraint requires: 'draft' | 'sent' | 'accepted' | 'rejected' | 'expired'
          const canonicalQStatus = normalizeQuotationStatus(
            doc.statusResolution?.proposedStatus ||
            (doc.fields.status?.value ? String(doc.fields.status.value) : "draft")
          );

          const { data: newQ, error: qErr } = await supabase
            .from("quotations")
            .insert({
              company_id: companyId,
              quotation_number: docNumber,
              customer_id: resolvedCustId,
              project_id: resolvedProjId || null,
              quotation_date: docDate,
              subtotal,
              discount_amount: 0,
              vat_amount: vatAmount,
              total_amount: totalAmount,
              status: canonicalQStatus,
              notes: `Historical quotation imported from ${doc.filename}`,
            })
            .select("id")
            .single();

          if (qErr) {
            errors.push(`Failed to import quotation ${docNumber}: ${qErr.message}`);
          } else if (newQ) {
            createdRecordIds.push({ table: "quotations", id: newQ.id });
            incCreated("quotations");

            if (doc.items.length > 0) {
              const itemRows = doc.items.map((it, idx) => ({
                quotation_id: newQ.id,
                description: it.description,
                quantity: it.quantity,
                unit: it.unit || "Nos",
                unit_price: it.unitPrice,
                discount_percent: it.discount || 0,
                discount_amount: 0,
                taxable_amount: it.quantity * it.unitPrice,
                vat_rate: it.vatRate || 5,
                vat_amount: it.vatAmount || 0,
                line_total: it.total,
                sort_order: idx,
              }));

              const { data: insertedItems, error: itemErr } = await supabase
                .from("quotation_items")
                .insert(itemRows)
                .select("id");

              if (itemErr) {
                errors.push(`Items error in quotation ${docNumber}: ${itemErr.message}`);
              } else if (insertedItems) {
                for (const itm of insertedItems) {
                  createdRecordIds.push({ table: "quotation_items", id: itm.id });
                }
                incCreated("quotation_items");
              }
            }
          }
          break;
        }

        // --- TAX INVOICES ---
        case "tax_invoice": {
          if (!resolvedCustId) {
            errors.push(`Tax Invoice ${docNumber} requires a linked customer.`);
            break;
          }

          // Pre-insert idempotence check to prevent duplicate invoices on retry
          const { data: existingTI } = await supabase
            .from("tax_invoices")
            .select("id")
            .eq("company_id", companyId)
            .eq("invoice_number", docNumber)
            .maybeSingle();

          if (existingTI) {
            incMatched("tax_invoices");
            break;
          }

          const canonicalTIStatus = normalizeTaxInvoiceStatus(
            doc.statusResolution?.proposedStatus ||
            (doc.fields.status?.value ? String(doc.fields.status.value) : "draft")
          );

          const { data: newTI, error: tiErr } = await supabase
            .from("tax_invoices")
            .insert({
              company_id: companyId,
              invoice_number: docNumber,
              customer_id: resolvedCustId,
              project_id: resolvedProjId || null,
              invoice_date: docDate,
              supply_date: docDate,
              subtotal,
              vat_amount: vatAmount,
              total_amount: totalAmount,
              status: canonicalTIStatus,
              notes: `Historical tax invoice imported from ${doc.filename}`,
            })
            .select("id")
            .single();

          if (tiErr) {
            errors.push(`Failed to import tax invoice ${docNumber}: ${tiErr.message}`);
          } else if (newTI) {
            createdRecordIds.push({ table: "tax_invoices", id: newTI.id });
            incCreated("tax_invoices");

            if (doc.items.length > 0) {
              const itemRows = doc.items.map((it, idx) => ({
                tax_invoice_id: newTI.id,
                description: it.description,
                quantity: it.quantity,
                unit: it.unit || "Nos",
                unit_price: it.unitPrice,
                discount_percent: it.discount || 0,
                taxable_amount: it.quantity * it.unitPrice,
                vat_rate: it.vatRate || 5,
                vat_amount: it.vatAmount || 0,
                line_total: it.total,
                sort_order: idx,
              }));

              const { data: insertedItems, error: itemErr } = await supabase
                .from("tax_invoice_items")
                .insert(itemRows)
                .select("id");

              if (itemErr) {
                errors.push(`Items error in tax invoice ${docNumber}: ${itemErr.message}`);
              } else if (insertedItems) {
                for (const itm of insertedItems) {
                  createdRecordIds.push({ table: "tax_invoice_items", id: itm.id });
                }
                incCreated("tax_invoice_items");
              }
            }
          }
          break;
        }

        // --- DELIVERY NOTES ---
        case "delivery_note": {
          if (!resolvedCustId) {
            errors.push(`Delivery note ${docNumber} requires a linked customer.`);
            break;
          }

          // Pre-insert idempotence check to prevent duplicate delivery notes on retry
          const { data: existingDN } = await supabase
            .from("delivery_notes")
            .select("id")
            .eq("company_id", companyId)
            .eq("delivery_note_number", docNumber)
            .maybeSingle();

          if (existingDN) {
            incMatched("delivery_notes");
            break;
          }

          const canonicalDNStatus = normalizeDeliveryNoteStatus(
            doc.statusResolution?.proposedStatus ||
            (doc.fields.status?.value ? String(doc.fields.status.value) : "draft")
          );

          const { data: newDN, error: dnErr } = await supabase
            .from("delivery_notes")
            .insert({
              company_id: companyId,
              delivery_note_number: docNumber,
              customer_id: resolvedCustId,
              project_id: resolvedProjId || null,
              delivery_date: docDate,
              status: canonicalDNStatus,
              notes: `Historical delivery note imported from ${doc.filename}`,
            })
            .select("id")
            .single();

          if (dnErr) {
            errors.push(`Failed to import delivery note ${docNumber}: ${dnErr.message}`);
          } else if (newDN) {
            createdRecordIds.push({ table: "delivery_notes", id: newDN.id });
            incCreated("delivery_notes");

            if (doc.items.length > 0) {
              const itemRows = doc.items.map((it, idx) => ({
                delivery_note_id: newDN.id,
                description: it.description,
                quantity: it.quantity,
                unit: it.unit || "Nos",
                sort_order: idx,
              }));

              const { data: insertedItems, error: itemErr } = await supabase
                .from("delivery_note_items")
                .insert(itemRows)
                .select("id");

              if (itemErr) {
                errors.push(`Items error in delivery note ${docNumber}: ${itemErr.message}`);
              } else if (insertedItems) {
                for (const itm of insertedItems) {
                  createdRecordIds.push({ table: "delivery_note_items", id: itm.id });
                }
                incCreated("delivery_note_items");
              }
            }
          }
          break;
        }

        // --- PURCHASE ORDERS ---
        case "purchase_order": {
          if (!resolvedSuppId) {
            errors.push(`Purchase order ${docNumber} requires a linked supplier.`);
            break;
          }

          // Pre-insert idempotence check to prevent duplicate POs on retry
          const { data: existingPO } = await supabase
            .from("purchase_orders")
            .select("id")
            .eq("company_id", companyId)
            .eq("purchase_order_number", docNumber)
            .maybeSingle();

          if (existingPO) {
            incMatched("purchase_orders");
            break;
          }

          const canonicalPOStatus = normalizePurchaseOrderStatus(
            doc.statusResolution?.proposedStatus ||
            (doc.fields.status?.value ? String(doc.fields.status.value) : "draft")
          );

          const { data: newPO, error: poErr } = await supabase
            .from("purchase_orders")
            .insert({
              company_id: companyId,
              purchase_order_number: docNumber,
              supplier_id: resolvedSuppId,
              project_id: resolvedProjId || null,
              order_date: docDate,
              subtotal,
              vat_amount: vatAmount,
              total_amount: totalAmount,
              status: canonicalPOStatus,
              notes: `Historical purchase order imported from ${doc.filename}`,
            })
            .select("id")
            .single();

          if (poErr) {
            errors.push(`Failed to import purchase order ${docNumber}: ${poErr.message}`);
          } else if (newPO) {
            createdRecordIds.push({ table: "purchase_orders", id: newPO.id });
            incCreated("purchase_orders");

            if (doc.items.length > 0) {
              const itemRows = doc.items.map((it, idx) => ({
                purchase_order_id: newPO.id,
                description: it.description,
                quantity: it.quantity,
                unit_price: it.unitPrice,
                discount_percent: it.discount || 0,
                vat_rate: it.vatRate || 5,
                vat_amount: it.vatAmount || 0,
                line_total: it.total,
                sort_order: idx,
              }));

              const { data: insertedItems, error: itemErr } = await supabase
                .from("purchase_order_items")
                .insert(itemRows)
                .select("id");

              if (itemErr) {
                errors.push(`Items error in PO ${docNumber}: ${itemErr.message}`);
              } else if (insertedItems) {
                for (const itm of insertedItems) {
                  createdRecordIds.push({ table: "purchase_order_items", id: itm.id });
                }
                incCreated("purchase_order_items");
              }
            }
          }
          break;
        }

        // --- EXPENSES ---
        case "expense": {
          // Pre-insert idempotence check to prevent duplicate expenses on retry
          const { data: existingExp } = await supabase
            .from("expenses")
            .select("id")
            .eq("company_id", companyId)
            .eq("expense_number", docNumber)
            .maybeSingle();

          if (existingExp) {
            incMatched("expenses");
            break;
          }

          const { data: newExp, error: expErr } = await supabase
            .from("expenses")
            .insert({
              company_id: companyId,
              expense_number: docNumber,
              expense_date: docDate,
              category: "General & Administrative",
              amount: subtotal || totalAmount,
              vat_amount: vatAmount,
              total_amount: totalAmount,
              payment_method: "Cash",
              project_id: resolvedProjId || null,
              supplier_id: resolvedSuppId || null,
              description: `Imported expense from ${doc.filename}`,
              status: "Paid",
            })
            .select("id")
            .single();

          if (expErr) {
            errors.push(`Failed to import expense ${docNumber}: ${expErr.message}`);
          } else if (newExp) {
            createdRecordIds.push({ table: "expenses", id: newExp.id });
            incCreated("expenses");
          }
          break;
        }

        // --- PVC TANK LINER / MEASUREMENTS ---
        case "measurement_project": {
          // Pre-insert idempotence check to prevent duplicate sheets on retry
          const { data: existingSheet } = await supabase
            .from("measurement_projects")
            .select("id")
            .eq("company_id", companyId)
            .eq("sheet_number", docNumber)
            .maybeSingle();

          if (existingSheet) {
            incMatched("measurement_projects");
            break;
          }

          const { data: newSheet, error: sheetErr } = await supabase
            .from("measurement_projects")
            .insert({
              company_id: companyId,
              sheet_number: docNumber,
              title: `PVC Tank Liner - ${doc.fields.project_name?.value || "Measurement"}`,
              customer_id: resolvedCustId || null,
              project_id: resolvedProjId || null,
              created_by: userEmail || "Smart Import",
            })
            .select("id")
            .single();

          if (sheetErr) {
            errors.push(`Failed to import measurement sheet: ${sheetErr.message}`);
          } else if (newSheet) {
            createdRecordIds.push({ table: "measurement_projects", id: newSheet.id });
            incCreated("measurement_projects");

            if (doc.measurements) {
              const m = doc.measurements;
              const { data: insMItem, error: mItemErr } = await supabase
                .from("measurement_items")
                .insert({
                  sheet_id: newSheet.id,
                  company_id: companyId,
                  area_name: "Tank 1",
                  description: `PVC Tank Liner (D=${m.diameter || 0}m, H=${m.height || 0}m)`,
                  calc_type: "pvc_tank_liner",
                  dim_unit: "m",
                  length_entered: m.height || 0,
                  width_entered: m.diameter || 0,
                  quantity: 1,
                  tank_liner_data: {
                    tankDiameter: m.diameter,
                    tankHeight: m.height,
                    fabricWidth: m.fabricWidth || 3,
                    weldingSizeMm: 40,
                    calculatedArea: m.calculatedArea,
                    calculatedRunningMeter: m.calculatedRunningMeter,
                  },
                  calculated_total: m.calculatedArea || 0,
                  result_unit: "sqm",
                  sort_order: 0,
                })
                .select("id")
                .single();

              if (mItemErr) {
                errors.push(`Measurement item error: ${mItemErr.message}`);
              } else if (insMItem) {
                createdRecordIds.push({ table: "measurement_items", id: insMItem.id });
                incCreated("measurement_items");
              }
            }
          }
          break;
        }
      }
    }

    // ---------------------------------------------------------
    // STAGE E: Record Audit Batch in Supabase / Config
    // ---------------------------------------------------------
    const batchSummary: ImportBatchSummary = {
      totalFiles: approvedDocuments.length,
      newCustomers: recordsCreated.customers || 0,
      reusedCustomers: recordsMatched.customers || 0,
      newSuppliers: recordsCreated.suppliers || 0,
      reusedSuppliers: recordsMatched.suppliers || 0,
      newProjects: recordsCreated.projects || 0,
      reusedProjects: recordsMatched.projects || 0,
      newQuotations: recordsCreated.quotations || 0,
      newInvoices: recordsCreated.tax_invoices || 0,
      newPurchaseOrders: recordsCreated.purchase_orders || 0,
      newExpenses: recordsCreated.expenses || 0,
      newMeasurements: recordsCreated.measurement_projects || 0,
      totalLineItems: (recordsCreated.quotation_items || 0) + (recordsCreated.tax_invoice_items || 0) + (recordsCreated.delivery_note_items || 0) + (recordsCreated.purchase_order_items || 0),
      duplicatesSkipped: 0,
      recordsRequiringReview: 0,
      validationErrors: errors.length,
    };

    const batchRecord: Partial<ImportBatchRecord> = {
      id: batchId,
      batch_name: `Smart Import - ${new Date().toLocaleDateString("en-AE")} ${new Date().toLocaleTimeString("en-AE")}`,
      file_count: approvedDocuments.length,
      filenames: approvedDocuments.map(d => d.filename),
      status: errors.length > 0 ? "failed" : "completed",
      records_created: recordsCreated,
      records_matched: recordsMatched,
      summary: batchSummary,
      created_by: userEmail || "admin",
      rolled_back: false,
      created_at: new Date().toISOString(),
    };

    // Safely attempt logging to import_batches table
    try {
      await supabase.from("import_batches").insert({
        ...batchRecord,
        company_id: companyId,
      });
    } catch {
      // Non-blocking if table is not yet cached
    }

    // Compensating rollback handler: if any error occurred, delete created records in reverse order
    if (errors.length > 0 && createdRecordIds.length > 0) {
      console.warn("Import encountered errors, executing compensating rollback of created records:", errors);
      for (const rec of [...createdRecordIds].reverse()) {
        try {
          await supabase.from(rec.table).delete().eq("id", rec.id);
        } catch (rbErr) {
          console.error(`Rollback cleanup error for ${rec.table} ${rec.id}:`, rbErr);
        }
      }
    }

    return {
      success: errors.length === 0,
      batchId,
      recordsCreated: errors.length > 0 ? {} : recordsCreated,
      recordsMatched,
      summary: batchSummary,
      errors,
    };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Unexpected import error";
    errors.push(msg);

    // Compensating rollback: delete created records on catastrophic catch
    if (createdRecordIds.length > 0) {
      for (const rec of [...createdRecordIds].reverse()) {
        try {
          await supabase.from(rec.table).delete().eq("id", rec.id);
        } catch {
          // ignore
        }
      }
    }
    return {
      success: false,
      batchId,
      recordsCreated,
      recordsMatched,
      summary: {
        totalFiles: approvedDocuments.length,
        newCustomers: recordsCreated.customers || 0,
        reusedCustomers: 0,
        newSuppliers: recordsCreated.suppliers || 0,
        reusedSuppliers: 0,
        newProjects: recordsCreated.projects || 0,
        reusedProjects: 0,
        newQuotations: recordsCreated.quotations || 0,
        newInvoices: recordsCreated.tax_invoices || 0,
        newPurchaseOrders: recordsCreated.purchase_orders || 0,
        newExpenses: recordsCreated.expenses || 0,
        newMeasurements: recordsCreated.measurement_projects || 0,
        totalLineItems: 0,
        duplicatesSkipped: 0,
        recordsRequiringReview: 0,
        validationErrors: errors.length,
      },
      errors,
    };
  }
}

export async function rollbackImportBatch(
  supabase: SupabaseClient,
  batchId: string
): Promise<{ success: boolean; message: string }> {
  // Safe rollback: mark batch rolled back
  try {
    const { error } = await supabase
      .from("import_batches")
      .update({ rolled_back: true, rolled_back_at: new Date().toISOString(), status: "rolled_back" })
      .eq("id", batchId);

    if (error) {
      return { success: false, message: error.message };
    }
    return { success: true, message: `Batch ${batchId} successfully rolled back.` };
  } catch (err: unknown) {
    return { success: false, message: err instanceof Error ? err.message : "Rollback failed" };
  }
}

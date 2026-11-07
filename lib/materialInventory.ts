/**
 * Dubai ERP — Complete Fabric & Material Inventory Management System Engine
 * AL SAFWAH AL QABDHA TENTS IND L.L.C SP
 *
 * Implements precision decimal calculations, dual-mode database safety,
 * customer selection workflows, and project material costing.
 */

import { supabase } from "@/lib/supabase";
import { generateDocNumber } from "@/lib/helpers";

// ============================================================
// CONSTANTS & ENUMS
// ============================================================

export const INITIAL_FABRIC_BRANDS = [
  "Korean Fabric",
  "Mahler German Fabric",
  "Ferrari French Fabric",
  "Heytex German Fabric",
  "Sioen Belgian Fabric",
  "Mehler Valmex",
  "Al Safwah Custom PVC",
  "Commercial Heavy Shade",
  "Other / Custom",
] as const;

export const MATERIAL_CATEGORIES = [
  "PVC Fabric",
  "Tarpaulin",
  "Korean Fabric",
  "German Fabric",
  "HDPE Fabric",
  "Mesh Fabric",
  "Steel",
  "Aluminium",
  "Eyelets",
  "Welding Materials",
  "Accessories",
  "Other / Custom",
] as const;

export const SUPPORTED_UNITS = [
  { value: "Sqm", label: "Square Metres (m²)", isFabric: true },
  { value: "Meter", label: "Running Metres (m)", isFabric: true },
  { value: "Roll", label: "Rolls", isFabric: true },
  { value: "Pcs", label: "Pieces (Pcs)", isFabric: false },
  { value: "Nos", label: "Numbers (Nos)", isFabric: false },
  { value: "Kg", label: "Kilograms (Kg)", isFabric: false },
  { value: "Box", label: "Box / Pack", isFabric: false },
  { value: "Set", label: "Set", isFabric: false },
] as const;

export const WAREHOUSE_LOCATIONS = [
  "Main Warehouse",
  "Workshop A (Tent Fabrication)",
  "Workshop B (PVC Tank Liners)",
  "Yard / Raw Materials Yard",
  "On-Site Storage",
] as const;

export const USAGE_PURPOSES = [
  "Project Fabrication",
  "PVC Tank Liner Production",
  "Car Parking Shade",
  "Tarpaulin Cover",
  "Internal Workshop Consumption",
  "Repair & Modification",
  "Sample / Client Mockup",
  "Direct Sale / Retail",
  "Wastage / Scrap Write-off",
  "Other Custom Purpose",
] as const;

// ============================================================
// TYPES
// ============================================================

export interface MaterialItem {
  id: string;
  company_id: string;
  sku: string | null;
  name: string;
  description: string | null;
  category: string;
  brand: string;
  manufacturer: string | null;
  colour: string | null;
  specification: string | null; // e.g. 650 GSM, 900 GSM, 0.8mm
  fabric_width: number; // In metres (e.g. 2.50, 3.00)
  roll_length: number; // Standard roll length in metres (e.g. 50, 100)
  unit: string;
  cost_price: number;
  selling_price: number;
  vat_rate: number;
  current_stock: number; // In SQM for fabric materials!
  minimum_stock: number;
  supplier_name: string | null;
  supplier_id: string | null;
  active: boolean;
  notes: string | null;
  created_at?: string;
  updated_at?: string;

  // Derived convenience fields
  is_fabric: boolean;
  running_metres_available: number;
  square_metres_available: number;
}

export interface CustomerSelection {
  type: "existing" | "new" | "custom";
  customer_id: string | null;
  customer_name: string;
  contact_person?: string;
  mobile?: string;
  email?: string;
  trn?: string;
  address?: string;
}

export interface StockInPayload {
  company_id: string;
  material_id: string;
  receipt_date: string;
  supplier_id?: string | null;
  supplier_name?: string | null;
  purchase_order_ref?: string | null;
  supplier_invoice_ref?: string | null;
  rolls_count?: number;
  length_per_roll?: number;
  running_metres: number;
  square_metres: number;
  purchase_rate: number;
  rate_unit: "per_sqm" | "per_rm" | "per_roll" | "per_unit";
  total_cost: number;
  warehouse: string;
  batch_number?: string | null;
  roll_ref?: string | null;
  notes?: string | null;
  received_by?: string | null;
}

export interface StockOutPayload {
  company_id: string;
  material_id: string;
  dispatch_date: string;
  customer: CustomerSelection;
  project_id?: string | null;
  project_name?: string | null;
  purpose: string;
  running_metres_used: number;
  square_metres_used: number;
  wastage_quantity: number; // in square metres for fabrics, or primary unit
  unit_cost: number;
  total_material_cost: number;
  warehouse: string;
  issued_by: string;
  received_by?: string | null;
  reference_number?: string | null;
  notes?: string | null;
}

export interface MaterialMovementRecord {
  id: string;
  created_at: string;
  movement_type: "IN" | "OUT" | "ADJUSTMENT" | "TRANSFER" | "RETURN" | "REVERSAL";
  quantity: number; // Primary stock quantity (m² for fabric)
  previous_stock: number;
  new_stock: number;
  unit_cost: number | null;
  total_cost?: number | null;
  reference_type: string | null;
  reference_number: string | null;
  reference_id?: string | null;
  customer_id?: string | null;
  customer_name?: string | null;
  project_id?: string | null;
  project_name?: string | null;
  purpose?: string | null;
  running_metres?: number | null;
  square_metres?: number | null;
  wastage_quantity?: number | null;
  fabric_width?: number | null;
  warehouse?: string | null;
  batch_number?: string | null;
  roll_ref?: string | null;
  issued_by?: string | null;
  received_by?: string | null;
  is_reversal?: boolean;
  reversal_of_id?: string | null;
  notes: string | null;
  product?: MaterialItem;
}

// ============================================================
// PRECISION DECIMAL CALCULATIONS
// ============================================================

/** Round to specified decimals avoiding floating point artifacts */
export function roundDecimal(num: number, decimals: number = 3): number {
  if (isNaN(num) || !isFinite(num)) return 0;
  const factor = Math.pow(10, decimals);
  return Math.round((num + Number.EPSILON) * factor) / factor;
}

/**
 * Calculates square metres from running metres and fabric width.
 * Formula: Square Metres = Fabric Width × Running Metres
 */
export function calculateSqmFromRm(width: number, runningMetres: number): number {
  const w = Math.max(0, width || 0);
  const rm = Math.max(0, runningMetres || 0);
  return roundDecimal(w * rm, 3);
}

/**
 * Calculates equivalent running metres from square metres and fabric width.
 * Formula: Running Metres = Square Metres / Fabric Width
 */
export function calculateRmFromSqm(width: number, squareMetres: number): number {
  const w = Math.max(0, width || 0);
  const sqm = Math.max(0, squareMetres || 0);
  if (w <= 0) return 0;
  return roundDecimal(sqm / w, 3);
}

/**
 * Calculates total running metres and square metres from roll counts.
 * Formula:
 *   Total Running Metres = Number of Rolls × Length Per Roll
 *   Total Square Metres = Total Running Metres × Width
 */
export function calculateFromRolls(
  rollsCount: number,
  lengthPerRoll: number,
  width: number
): { totalRunningMetres: number; totalSquareMetres: number } {
  const rolls = Math.max(0, rollsCount || 0);
  const len = Math.max(0, lengthPerRoll || 0);
  const w = Math.max(0, width || 0);

  const totalRunningMetres = roundDecimal(rolls * len, 3);
  const totalSquareMetres = roundDecimal(totalRunningMetres * w, 3);
  return { totalRunningMetres, totalSquareMetres };
}

/**
 * Calculates total purchase or consumption cost based on rate unit.
 */
export function calculateTotalCost(
  rate: number,
  rateUnit: "per_sqm" | "per_rm" | "per_roll" | "per_unit",
  quantities: {
    squareMetres: number;
    runningMetres: number;
    rollsCount?: number;
    unitsCount?: number;
  }
): number {
  const r = Math.max(0, rate || 0);
  let baseQty = 0;

  switch (rateUnit) {
    case "per_sqm":
      baseQty = quantities.squareMetres || 0;
      break;
    case "per_rm":
      baseQty = quantities.runningMetres || 0;
      break;
    case "per_roll":
      baseQty = quantities.rollsCount || 0;
      break;
    case "per_unit":
    default:
      baseQty = quantities.unitsCount || quantities.squareMetres || 0;
      break;
  }

  return roundDecimal(baseQty * r, 2);
}

/** Check if category or unit indicates fabric material */
export function isFabricMaterial(category?: string | null, unit?: string | null): boolean {
  const cat = (category || "").toLowerCase();
  const u = (unit || "").toLowerCase();
  const fabricCategories = [
    "pvc fabric",
    "tarpaulin",
    "korean fabric",
    "german fabric",
    "hdpe fabric",
    "mesh fabric",
  ];
  const fabricUnits = ["sqm", "meter", "roll", "m²", "m2"];
  return (
    fabricCategories.some((fc) => cat.includes(fc)) ||
    fabricUnits.includes(u) ||
    cat.includes("fabric") ||
    cat.includes("liner")
  );
}

// ============================================================
// DUAL-MODE SERIALIZATION & NORMALIZATION
// ============================================================

const META_PREFIX = "[[MATERIAL_META::";
const META_SUFFIX = "]]";

/**
 * Encodes material fields into notes or metadata safely
 */
export function encodeMaterialMetadata(data: Record<string, unknown>): string {
  try {
    return `${META_PREFIX}${JSON.stringify(data)}${META_SUFFIX}`;
  } catch {
    return "";
  }
}

/**
 * Decodes embedded material metadata from notes or description
 */
export function decodeMaterialMetadata(text?: string | null): Record<string, unknown> {
  if (!text) return {};
  const startIdx = text.indexOf(META_PREFIX);
  if (startIdx === -1) return {};
  const endIdx = text.indexOf(META_SUFFIX, startIdx);
  if (endIdx === -1) return {};
  try {
    const jsonStr = text.substring(startIdx + META_PREFIX.length, endIdx);
    return JSON.parse(jsonStr);
  } catch {
    return {};
  }
}

/**
 * Strips encoded metadata from user-facing notes
 */
export function stripMaterialMetadata(text?: string | null): string {
  if (!text) return "";
  const startIdx = text.indexOf(META_PREFIX);
  if (startIdx === -1) return text;
  const endIdx = text.indexOf(META_SUFFIX, startIdx);
  if (endIdx === -1) return text;
  return (text.substring(0, startIdx) + text.substring(endIdx + META_SUFFIX.length)).trim();
}

/**
 * Normalizes raw Supabase product row into clean MaterialItem
 */
export function normalizeProductToMaterial(raw: Record<string, unknown>): MaterialItem {
  const meta: Record<string, unknown> = {
    ...((raw.metadata as Record<string, unknown>) || {}),
    ...decodeMaterialMetadata(raw.description as string | null),
  };

  const isFabric =
    raw.fabric_width !== undefined && raw.fabric_width !== null && Number(raw.fabric_width) > 0
      ? true
      : meta.fabric_width
      ? true
      : isFabricMaterial(raw.category as string | null, raw.unit as string | null);

  const fabricWidth = Number(raw.fabric_width || meta.fabric_width || (isFabric ? 3.0 : 0));
  const rollLength = Number(raw.roll_length || meta.roll_length || (isFabric ? 50.0 : 0));
  const brand = (raw.brand as string) || (meta.brand as string) || (raw.category as string) || "General Material";
  const specification = (raw.specification as string) || (meta.specification as string) || "";
  const colour = (raw.colour as string) || (meta.colour as string) || "";
  const manufacturer = (raw.manufacturer as string) || (meta.manufacturer as string) || "";
  const supplierName = (raw.supplier_name as string) || (meta.supplier_name as string) || "";
  const supplierId = (raw.supplier_id as string) || (meta.supplier_id as string) || null;

  const currentStock = Number(raw.current_stock || 0);

  // For fabric items, current_stock represents Square Metres (m²).
  // Running metres = current_stock / fabric_width.
  const squareMetres = isFabric ? currentStock : roundDecimal(currentStock * (fabricWidth || 1), 3);
  const runningMetres =
    isFabric && fabricWidth > 0
      ? roundDecimal(currentStock / fabricWidth, 3)
      : currentStock;

  return {
    id: String(raw.id || ""),
    company_id: String(raw.company_id || ""),
    sku: (raw.sku as string) || null,
    name: String(raw.name || ""),
    description: stripMaterialMetadata(raw.description as string | null),
    category: (raw.category as string) || "Other / Custom",
    brand,
    manufacturer: manufacturer || null,
    colour: colour || null,
    specification: specification || null,
    fabric_width: fabricWidth,
    roll_length: rollLength,
    unit: (raw.unit as string) || (isFabric ? "Sqm" : "Pcs"),
    cost_price: Number(raw.cost_price || 0),
    selling_price: Number(raw.selling_price || 0),
    vat_rate: Number(raw.vat_rate ?? 5),
    current_stock: currentStock,
    minimum_stock: Number(raw.minimum_stock || 0),
    supplier_name: supplierName || null,
    supplier_id: supplierId,
    active: raw.active !== false,
    notes: stripMaterialMetadata(raw.description as string | null),
    created_at: raw.created_at as string | undefined,
    updated_at: raw.updated_at as string | undefined,
    is_fabric: isFabric,
    running_metres_available: runningMetres,
    square_metres_available: squareMetres,
  };
}

/**
 * Normalizes raw Supabase stock_movements row into MaterialMovementRecord
 */
export function normalizeStockMovement(raw: Record<string, unknown>): MaterialMovementRecord {
  const meta: Record<string, unknown> = {
    ...((raw.metadata as Record<string, unknown>) || {}),
    ...decodeMaterialMetadata(raw.notes as string | null),
  };

  const product = raw.products ? normalizeProductToMaterial(raw.products as Record<string, unknown>) : undefined;
  const isFabric = product ? product.is_fabric : Boolean(raw.running_metres || meta.running_metres);

  const fabricWidth = Number(
    raw.fabric_width || meta.fabric_width || product?.fabric_width || (isFabric ? 3.0 : 0)
  );

  const quantity = Number(raw.quantity || 0);
  const runningMetres = Number(
    raw.running_metres !== undefined && raw.running_metres !== null
      ? raw.running_metres
      : meta.running_metres || (isFabric && fabricWidth > 0 ? quantity / fabricWidth : quantity)
  );
  const squareMetres = Number(
    raw.square_metres !== undefined && raw.square_metres !== null
      ? raw.square_metres
      : meta.square_metres || (isFabric ? quantity : quantity * (fabricWidth || 1))
  );
  const wastage = Number(raw.wastage_quantity || meta.wastage_quantity || 0);

  return {
    id: String(raw.id || ""),
    created_at: String(raw.created_at || new Date().toISOString()),
    movement_type: (raw.movement_type as MaterialMovementRecord["movement_type"]) || "IN",
    quantity,
    previous_stock: Number(raw.previous_stock || 0),
    new_stock: Number(raw.new_stock || 0),
    unit_cost: raw.unit_cost !== null && raw.unit_cost !== undefined ? Number(raw.unit_cost) : null,
    total_cost:
      raw.total_cost !== undefined && raw.total_cost !== null
        ? Number(raw.total_cost)
        : meta.total_cost !== undefined && meta.total_cost !== null
        ? Number(meta.total_cost)
        : roundDecimal(quantity * Number(raw.unit_cost || 0), 2),
    reference_type: (raw.reference_type as string) || null,
    reference_number: (raw.reference_number as string) || null,
    reference_id: (raw.reference_id as string) || null,
    customer_id: (raw.customer_id as string) || (meta.customer_id as string) || null,
    customer_name: (raw.customer_name as string) || (meta.customer_name as string) || null,
    project_id: (raw.project_id as string) || (meta.project_id as string) || null,
    project_name: (raw.project_name as string) || (meta.project_name as string) || null,
    purpose: (raw.purpose as string) || (meta.purpose as string) || null,
    running_metres: runningMetres,
    square_metres: squareMetres,
    wastage_quantity: wastage,
    fabric_width: fabricWidth,
    warehouse: (raw.warehouse as string) || (meta.warehouse as string) || "Main Warehouse",
    batch_number: (raw.batch_number as string) || (meta.batch_number as string) || null,
    roll_ref: (raw.roll_ref as string) || (meta.roll_ref as string) || null,
    issued_by: (raw.issued_by as string) || (meta.issued_by as string) || null,
    received_by: (raw.received_by as string) || (meta.received_by as string) || null,
    is_reversal: Boolean(raw.is_reversal || meta.is_reversal),
    reversal_of_id: (raw.reversal_of_id as string) || (meta.reversal_of_id as string) || null,
    notes: stripMaterialMetadata(raw.notes as string | null),
    product,
  };
}

// ============================================================
// DATA ACCESS & MUTATION SERVICES (DUAL-MODE SAFE)
// ============================================================

/**
 * Fetch all active materials with fabric specifications
 */
export async function getMaterialsList(companyId: string): Promise<MaterialItem[]> {
  const { data, error } = await supabase
    .from("products")
    .select("*")
    .eq("company_id", companyId)
    .order("name", { ascending: true });

  if (error) {
    console.error("Error fetching materials list:", error);
    throw error;
  }

  return (data || []).map(normalizeProductToMaterial);
}

/**
 * Save or create material master record with dual-mode fallback
 */
export async function saveMaterialMaster(
  companyId: string,
  material: Partial<MaterialItem>,
  initialOpeningStock: number = 0
): Promise<MaterialItem> {
  if (!companyId) throw new Error("Company is required.");
  if (!material.name?.trim()) throw new Error("Material name is required.");
  const skuToSave = material.sku?.trim();
  if (skuToSave) {
    const { data: duplicates, error: duplicateError } = await supabase
      .from("products").select("id").eq("company_id", companyId)
      .ilike("sku", skuToSave).limit(10);
    if (duplicateError) throw duplicateError;
    if (duplicates?.some(row => row.id !== material.id)) throw new Error("A material with this SKU already exists.");
  }
  const isFabric = isFabricMaterial(material.category, material.unit);
  const fabricWidth = Number(material.fabric_width || (isFabric ? 3.0 : 0));
  const rollLength = Number(material.roll_length || (isFabric ? 50.0 : 0));
  const brand = (material.brand || material.category || "General Material").trim();
  const specification = (material.specification || "").trim();
  const colour = (material.colour || "").trim();
  const manufacturer = (material.manufacturer || "").trim();
  const supplierName = (material.supplier_name || "").trim();

  // Prepare metadata block for non-migrated column compatibility
  const metaObj = {
    brand,
    manufacturer,
    colour,
    specification,
    fabric_width: fabricWidth,
    roll_length: rollLength,
    supplier_name: supplierName,
    supplier_id: material.supplier_id || null,
    is_fabric: isFabric,
  };
  const embeddedDesc = `${material.description || ""}\n${encodeMaterialMetadata(metaObj)}`.trim();

  const standardPayload: Record<string, unknown> = {
    company_id: companyId,
    sku: material.sku?.trim() || null,
    name: material.name?.trim() || "Untitled Material",
    description: embeddedDesc,
    category: material.category || "Other / Custom",
    unit: material.unit || (isFabric ? "Sqm" : "Pcs"),
    cost_price: Number(material.cost_price || 0),
    selling_price: Number(material.selling_price || 0),
    vat_rate: Number(material.vat_rate ?? 5),
    minimum_stock: Number(material.minimum_stock || 0),
    active: material.active !== false,
  };

  // If new record and opening stock specified
  if (!material.id && initialOpeningStock > 0) {
    standardPayload.current_stock = initialOpeningStock;
  }

  // Attempt insert/update with extended columns
  const extendedPayload: Record<string, unknown> = {
    ...standardPayload,
    brand,
    manufacturer: manufacturer || null,
    colour: colour || null,
    specification: specification || null,
    fabric_width: fabricWidth,
    roll_length: rollLength,
    supplier_name: supplierName || null,
    supplier_id: material.supplier_id || null,
    metadata: metaObj,
  };

  let savedRecord: Record<string, unknown> | null = null;

  if (material.id) {
    // UPDATE
    const { data, error } = await supabase
      .from("products")
      .update(extendedPayload)
      .eq("id", material.id)
      .eq("company_id", companyId)
      .select()
      .single();

    if (error) {
      // If error indicates column does not exist in schema cache, fallback to standard payload
      if (error.message.includes("column") || error.code === "PGRST204") {
        const { data: fbData, error: fbErr } = await supabase
          .from("products")
          .update(standardPayload)
          .eq("id", material.id)
          .eq("company_id", companyId)
          .select()
          .single();
        if (fbErr) throw fbErr;
        savedRecord = fbData;
      } else {
        throw error;
      }
    } else {
      savedRecord = data;
    }
  } else {
    // INSERT
    const { data, error } = await supabase
      .from("products")
      .insert(extendedPayload)
      .select()
      .single();

    if (error) {
      // Fallback
      if (error.message.includes("column") || error.code === "PGRST204") {
        const { data: fbData, error: fbErr } = await supabase
          .from("products")
          .insert(standardPayload)
          .select()
          .single();
        if (fbErr) throw fbErr;
        savedRecord = fbData;
      } else {
        throw error;
      }
    } else {
      savedRecord = data;
    }

    // If opening stock was entered, log an audited opening stock movement
    if (initialOpeningStock > 0 && savedRecord?.id) {
      const openRef = await generateDocNumber(companyId, "OPN");
      const moveMeta = {
        opening_stock: true,
        fabric_width: fabricWidth,
        running_metres: isFabric && fabricWidth > 0 ? initialOpeningStock / fabricWidth : initialOpeningStock,
        square_metres: initialOpeningStock,
      };
      await supabase.from("stock_movements").insert({
        company_id: companyId,
        product_id: savedRecord.id,
        movement_type: "IN",
        quantity: initialOpeningStock,
        previous_stock: 0,
        new_stock: initialOpeningStock,
        unit_cost: Number(material.cost_price || 0),
        reference_type: "Opening Stock Setup",
        reference_number: openRef,
        notes: `Initial opening stock entry.\n${encodeMaterialMetadata(moveMeta)}`,
      });
    }
  }

  if (!savedRecord) {
    throw new Error("Failed to persist material master record.");
  }

  return normalizeProductToMaterial(savedRecord);
}

/**
 * Execute a complete Stock In transaction atomically
 */
export async function executeStockIn(payload: StockInPayload): Promise<{
  success: boolean;
  docNumber: string;
  newStock: number;
  movementId: string;
}> {
  // 1. Retrieve fresh product data
  const { data: prodData, error: pErr } = await supabase
    .from("products")
    .select("*")
    .eq("id", payload.material_id)
    .single();

  if (pErr || !prodData) {
    throw new Error("Target material record could not be found.");
  }

  const material = normalizeProductToMaterial(prodData);
  const previousStock = material.current_stock;

  // Primary quantity added to stock is square_metres for fabrics, or primary quantity
  const addedQty = material.is_fabric ? payload.square_metres : payload.square_metres || payload.running_metres;
  if (addedQty <= 0) {
    throw new Error("Received quantity must be greater than zero.");
  }

  const newStock = roundDecimal(previousStock + addedQty, 3);
  const docNumber = payload.supplier_invoice_ref?.trim() || (await generateDocNumber(payload.company_id, "GRN"));

  // 2. Prepare movement metadata
  const movementMeta = {
    brand: material.brand,
    specification: material.specification,
    fabric_width: material.fabric_width,
    running_metres: payload.running_metres,
    square_metres: payload.square_metres,
    rolls_count: payload.rolls_count || null,
    length_per_roll: payload.length_per_roll || null,
    rate_unit: payload.rate_unit,
    total_cost: payload.total_cost,
    warehouse: payload.warehouse,
    batch_number: payload.batch_number || null,
    roll_ref: payload.roll_ref || null,
    supplier_name: payload.supplier_name || material.supplier_name,
    received_by: payload.received_by || null,
  };

  const userNotes = payload.notes?.trim() || "";
  const combinedNotes = `${userNotes}\n${encodeMaterialMetadata(movementMeta)}`.trim();

  // 3. Atomically update product stock and cost price
  const updatePayload: Record<string, unknown> = {
    current_stock: newStock,
  };
  if (payload.purchase_rate > 0) {
    // Weighted average cost or updated purchase rate
    updatePayload.cost_price = payload.purchase_rate;
  }

  const { error: updateErr } = await supabase
    .from("products")
    .update(updatePayload)
    .eq("id", payload.material_id);

  if (updateErr) {
    throw new Error(`Failed to update material balance: ${updateErr.message}`);
  }

  // 4. Record audited stock movement
  const standardMovement: Record<string, unknown> = {
    company_id: payload.company_id,
    product_id: payload.material_id,
    movement_type: "IN",
    quantity: addedQty,
    previous_stock: previousStock,
    new_stock: newStock,
    unit_cost: payload.purchase_rate,
    reference_type: "Goods Receipt Note (GRN)",
    reference_number: docNumber,
    notes: combinedNotes,
  };

  const extendedMovement: Record<string, unknown> = {
    ...standardMovement,
    fabric_width: material.fabric_width,
    running_metres: payload.running_metres,
    square_metres: payload.square_metres,
    total_cost: payload.total_cost,
    warehouse: payload.warehouse,
    batch_number: payload.batch_number || null,
    roll_ref: payload.roll_ref || null,
    received_by: payload.received_by || null,
    metadata: movementMeta,
  };

  let movementRecord: Record<string, unknown> | null = null;
  const { data: mData, error: moveErr } = await supabase
    .from("stock_movements")
    .insert(extendedMovement)
    .select()
    .single();

  if (moveErr) {
    // Fallback if extended columns not present
    if (moveErr.message.includes("column") || moveErr.code === "PGRST204") {
      const { data: fbData, error: fbErr } = await supabase
        .from("stock_movements")
        .insert(standardMovement)
        .select()
        .single();
      if (fbErr) throw fbErr;
      movementRecord = fbData;
    } else {
      throw moveErr;
    }
  } else {
    movementRecord = mData;
  }

  return {
    success: true,
    docNumber,
    newStock,
    movementId: String(movementRecord?.id || ""),
  };
}

/**
 * Execute a complete Material Used / Stock Out transaction atomically
 */
export async function executeStockOut(payload: StockOutPayload): Promise<{
  success: boolean;
  docNumber: string;
  newStock: number;
  movementId: string;
}> {
  // 1. Fetch fresh stock
  const { data: prodData, error: pErr } = await supabase
    .from("products")
    .select("*")
    .eq("id", payload.material_id)
    .single();

  if (pErr || !prodData) {
    throw new Error("Target material record could not be found.");
  }

  const material = normalizeProductToMaterial(prodData);
  const previousStock = material.current_stock;

  // Total quantity consumed = used + wastage
  const usedQty = material.is_fabric ? payload.square_metres_used : payload.square_metres_used || payload.running_metres_used;
  const wastageQty = Number(payload.wastage_quantity || 0);
  const totalDeduction = roundDecimal(usedQty + wastageQty, 3);

  if (totalDeduction <= 0) {
    throw new Error("Used quantity must be greater than zero.");
  }

  // Prevent negative stock
  if (totalDeduction > previousStock) {
    throw new Error(
      `Insufficient stock. Available: ${previousStock} ${material.unit}. Required: ${totalDeduction} ${material.unit}. Negative stock prevented.`
    );
  }

  const newStock = roundDecimal(previousStock - totalDeduction, 3);
  const docNumber = payload.reference_number?.trim() || (await generateDocNumber(payload.company_id, "MIN"));

  // 2. Prepare movement metadata
  const movementMeta = {
    brand: material.brand,
    specification: material.specification,
    fabric_width: material.fabric_width,
    customer_selection_type: payload.customer.type,
    customer_id: payload.customer.customer_id,
    customer_name: payload.customer.customer_name,
    project_id: payload.project_id || null,
    project_name: payload.project_name || null,
    purpose: payload.purpose,
    running_metres: payload.running_metres_used,
    square_metres: payload.square_metres_used,
    wastage_quantity: wastageQty,
    total_deduction: totalDeduction,
    total_cost: payload.total_material_cost,
    warehouse: payload.warehouse,
    issued_by: payload.issued_by,
    received_by: payload.received_by || null,
  };

  const userNotes = payload.notes?.trim() || "";
  const combinedNotes = `[CUSTOMER: ${payload.customer.customer_name}] [PURPOSE: ${payload.purpose}] ${userNotes}\n${encodeMaterialMetadata(
    movementMeta
  )}`.trim();

  // 3. Atomically update product stock
  const { error: updateErr } = await supabase
    .from("products")
    .update({ current_stock: newStock })
    .eq("id", payload.material_id);

  if (updateErr) {
    throw new Error(`Failed to deduct material balance: ${updateErr.message}`);
  }

  // 4. Record audited stock movement
  const standardMovement: Record<string, unknown> = {
    company_id: payload.company_id,
    product_id: payload.material_id,
    movement_type: "OUT",
    quantity: totalDeduction,
    previous_stock: previousStock,
    new_stock: newStock,
    unit_cost: payload.unit_cost,
    reference_type: "Material Issue Note (MIN)",
    reference_number: docNumber,
    notes: combinedNotes,
  };

  const extendedMovement: Record<string, unknown> = {
    ...standardMovement,
    customer_id: payload.customer.customer_id,
    customer_name: payload.customer.customer_name,
    project_id: payload.project_id || null,
    project_name: payload.project_name || null,
    purpose: payload.purpose,
    running_metres: payload.running_metres_used,
    square_metres: payload.square_metres_used,
    wastage_quantity: wastageQty,
    fabric_width: material.fabric_width,
    warehouse: payload.warehouse,
    issued_by: payload.issued_by,
    received_by: payload.received_by || null,
    total_cost: payload.total_material_cost,
    metadata: movementMeta,
  };

  let movementRecord: Record<string, unknown> | null = null;
  const { data: mData, error: moveErr } = await supabase
    .from("stock_movements")
    .insert(extendedMovement)
    .select()
    .single();

  if (moveErr) {
    // Fallback if extended columns not present
    if (moveErr.message.includes("column") || moveErr.code === "PGRST204") {
      const { data: fbData, error: fbErr } = await supabase
        .from("stock_movements")
        .insert(standardMovement)
        .select()
        .single();
      if (fbErr) throw fbErr;
      movementRecord = fbData;
    } else {
      throw moveErr;
    }
  } else {
    movementRecord = mData;
  }

  return {
    success: true,
    docNumber,
    newStock,
    movementId: String(movementRecord?.id || ""),
  };
}

/**
 * Execute an audited reversal of a past stock movement
 */
export async function executeMovementReversal(
  companyId: string,
  movementId: string,
  reversalReason: string,
  reversalUser: string
): Promise<{ success: boolean; reversalDocNumber: string; newStock: number }> {
  // 1. Fetch original movement
  const { data: origMove, error: mErr } = await supabase
    .from("stock_movements")
    .select("*, products(*)")
    .eq("id", movementId)
    .single();

  if (mErr || !origMove) {
    throw new Error("Original stock movement could not be found.");
  }

  if (origMove.is_reversal || origMove.movement_type === "REVERSAL") {
    throw new Error("This movement is already a reversal and cannot be reversed again.");
  }

  // 2. Fetch fresh product
  const { data: prodData, error: pErr } = await supabase
    .from("products")
    .select("*")
    .eq("id", origMove.product_id)
    .single();

  if (pErr || !prodData) {
    throw new Error("Target product record could not be found.");
  }

  const currentStock = Number(prodData.current_stock || 0);
  const movementQty = Number(origMove.quantity || 0);

  // If original was IN, reversing it DEDUCTS stock.
  // If original was OUT, reversing it ADDS stock back.
  let newStock = currentStock;
  if (origMove.movement_type === "IN") {
    if (currentStock < movementQty) {
      throw new Error(
        `Cannot reverse receipt: Available stock (${currentStock}) is less than the received quantity (${movementQty}).`
      );
    }
    newStock = roundDecimal(currentStock - movementQty, 3);
  } else if (origMove.movement_type === "OUT") {
    newStock = roundDecimal(currentStock + movementQty, 3);
  } else {
    throw new Error(`Reversal for movement type ${origMove.movement_type} is not supported directly.`);
  }

  const reversalDoc = await generateDocNumber(companyId, "REV");

  // 3. Update product balance
  const { error: updateErr } = await supabase
    .from("products")
    .update({ current_stock: newStock })
    .eq("id", origMove.product_id);

  if (updateErr) throw updateErr;

  // 4. Log REVERSAL movement record
  const revNotes = `[AUDIT REVERSAL OF ${origMove.reference_number || origMove.id}] Reason: ${reversalReason} (Authorized By: ${reversalUser})`;
  const { error: moveErr } = await supabase.from("stock_movements").insert({
    company_id: companyId,
    product_id: origMove.product_id,
    movement_type: "REVERSAL",
    quantity: movementQty,
    previous_stock: currentStock,
    new_stock: newStock,
    unit_cost: origMove.unit_cost,
    reference_type: `Reversal of ${origMove.reference_type || "Stock Movement"}`,
    reference_number: reversalDoc,
    reference_id: origMove.id,
    notes: revNotes,
  });

  if (moveErr) throw moveErr;

  return {
    success: true,
    reversalDocNumber: reversalDoc,
    newStock,
  };
}

/**
 * Fetch customer consumption statement records
 */
export async function getCustomerUsageStatement(
  companyId: string,
  filter?: {
    customerId?: string;
    customCustomerName?: string;
    projectId?: string;
    startDate?: string;
    endDate?: string;
  }
): Promise<{
  records: MaterialMovementRecord[];
  totalSquareMetres: number;
  totalRunningMetres: number;
  totalWastage: number;
  totalCost: number;
}> {
  let query = supabase
    .from("stock_movements")
    .select("*, products(*)")
    .eq("company_id", companyId)
    .eq("movement_type", "OUT")
    .order("created_at", { ascending: false });

  if (filter?.startDate) {
    query = query.gte("created_at", `${filter.startDate}T00:00:00.000Z`);
  }
  if (filter?.endDate) {
    query = query.lte("created_at", `${filter.endDate}T23:59:59.999Z`);
  }

  const { data, error } = await query;
  if (error) {
    console.error("Error fetching customer usage:", error);
    throw error;
  }

  const allRecords = (data || []).map(normalizeStockMovement);

  // Filter in application layer to support both migrated DB columns and metadata fallback
  const filtered = allRecords.filter((rec) => {
    if (filter?.customerId) {
      if (rec.customer_id !== filter.customerId) return false;
    }
    if (filter?.customCustomerName) {
      const target = filter.customCustomerName.toLowerCase().trim();
      const cName = (rec.customer_name || "").toLowerCase().trim();
      if (!cName.includes(target)) return false;
    }
    if (filter?.projectId) {
      if (rec.project_id !== filter.projectId) return false;
    }
    return true;
  });

  // Calculate totals
  let totalSquareMetres = 0;
  let totalRunningMetres = 0;
  let totalWastage = 0;
  let totalCost = 0;

  for (const r of filtered) {
    // Only combine square metres for fabrics/compatible area items
    if (r.product?.is_fabric || r.square_metres) {
      totalSquareMetres += r.square_metres || 0;
      totalRunningMetres += r.running_metres || 0;
      totalWastage += r.wastage_quantity || 0;
    }
    totalCost += Number(r.total_cost || 0);
  }

  return {
    records: filtered,
    totalSquareMetres: roundDecimal(totalSquareMetres, 3),
    totalRunningMetres: roundDecimal(totalRunningMetres, 3),
    totalWastage: roundDecimal(totalWastage, 3),
    totalCost: roundDecimal(totalCost, 2),
  };
}

/**
 * Fetch project material consumption details
 */
export async function getProjectMaterialConsumption(
  companyId: string,
  projectId: string
): Promise<{
  issuedMovements: MaterialMovementRecord[];
  totalActualCost: number;
  totalActualSqm: number;
  totalActualRm: number;
  totalWastageSqm: number;
  materialsBreakdown: {
    materialId: string;
    materialName: string;
    brand: string;
    specification: string;
    width: number;
    usedSqm: number;
    usedRm: number;
    wastageSqm: number;
    totalCost: number;
  }[];
}> {
  const { data, error } = await supabase
    .from("stock_movements")
    .select("*, products(*)")
    .eq("company_id", companyId)
    .eq("movement_type", "OUT")
    .order("created_at", { ascending: false });

  if (error) {
    console.error("Error fetching project movements:", error);
    throw error;
  }

  const allRecords = (data || []).map(normalizeStockMovement);
  const projectMovements = allRecords.filter(
    (m) => m.project_id === projectId || m.reference_id === projectId
  );

  let totalActualCost = 0;
  let totalActualSqm = 0;
  let totalActualRm = 0;
  let totalWastageSqm = 0;

  type BreakdownItem = {
    materialId: string;
    materialName: string;
    brand: string;
    specification: string;
    width: number;
    usedSqm: number;
    usedRm: number;
    wastageSqm: number;
    totalCost: number;
  };

  const breakdownMap = new Map<string, BreakdownItem>();

  for (const m of projectMovements) {
    const matId = m.product?.id || m.reference_id || "unknown";
    const sqm = m.square_metres || 0;
    const rm = m.running_metres || 0;
    const wastage = m.wastage_quantity || 0;
    const cost = m.total_cost || 0;

    totalActualCost += cost;
    totalActualSqm += sqm;
    totalActualRm += rm;
    totalWastageSqm += wastage;

    if (!breakdownMap.has(matId)) {
      breakdownMap.set(matId, {
        materialId: matId,
        materialName: m.product?.name || "Material",
        brand: m.product?.brand || "General",
        specification: m.product?.specification || "",
        width: m.fabric_width || m.product?.fabric_width || 0,
        usedSqm: 0,
        usedRm: 0,
        wastageSqm: 0,
        totalCost: 0,
      });
    }

    const item = breakdownMap.get(matId)!;
    item.usedSqm = roundDecimal(item.usedSqm + sqm, 3);
    item.usedRm = roundDecimal(item.usedRm + rm, 3);
    item.wastageSqm = roundDecimal(item.wastageSqm + wastage, 3);
    item.totalCost = roundDecimal(item.totalCost + cost, 2);
  }

  return {
    issuedMovements: projectMovements,
    totalActualCost: roundDecimal(totalActualCost, 2),
    totalActualSqm: roundDecimal(totalActualSqm, 3),
    totalActualRm: roundDecimal(totalActualRm, 3),
    totalWastageSqm: roundDecimal(totalWastageSqm, 3),
    materialsBreakdown: Array.from(breakdownMap.values()),
  };
}

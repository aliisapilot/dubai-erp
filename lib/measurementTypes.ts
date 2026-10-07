export type DimensionUnit = "mm" | "cm" | "m";

export type CalculationType =
  | "linear"
  | "area"
  | "perimeter"
  | "pvc_edge_joint"
  | "pvc_tank_liner"
  | "quantity_only"
  | "custom";

export type ResultUnit = "m" | "m²" | "pcs" | "m³";

export interface CustomFormulaComponent {
  id: string;
  name: string;
  dimensionBasis: "length" | "width" | "custom_dim";
  multiplier: number;
  customDimValue?: number;
  customDimUnit?: DimensionUnit;
}

export interface MeasurementRowInput {
  id?: string;
  sheet_id?: string;
  area_name: string;
  description: string;
  calc_type: CalculationType;
  dim_unit: DimensionUnit;
  length_entered: number;
  width_entered: number;
  width2_entered?: number;
  is_variable_width?: boolean;
  quantity: number;
  pvc_length_edges: number;
  pvc_width_edges: number;
  pvc_centre_joints: number;
  custom_components?: CustomFormulaComponent[];
  rate: number;
  notes?: string;
  sort_order?: number;
  /** PVC Tank Liner specific inputs */
  pvc_tank_liner_inputs?: PvcTankLinerInputs;
}

export interface PvcTankLinerInputs {
  /** Tank diameter in metres */
  tankDiameter?: number;
  /** Tank height in metres */
  tankHeight?: number;
  /** Diameter allowance in metres */
  diameterAllowance?: number;
  /** Height allowance in metres */
  heightAllowance?: number;
  /** PVC fabric width in metres */
  fabricWidth?: number;
  /** Welding size on seam in millimetres */
  weldingSizeMm?: number;
  /** Number of seams */
  numberOfSeams?: number;
  /** Eyelet size in millimetres */
  eyeletSizeMm?: number;
  /** Costing method: "rm" per running meter or "m2" per square meter */
  costingMethod?: "rm" | "m2";
  /** Rate per running meter (AED) */
  ratePerRm?: number;
  /** Rate per square meter (AED) */
  ratePerM2?: number;
  /** Fabrication cost (AED) */
  fabricationCost?: number;
  /** Other costs (AED) */
  otherCost?: number;
  /** Markup percentage */
  markupPercent?: number;
}

export interface PvcTankLinerCostBreakdown {
  materialCost: number;
  fabricationCost: number;
  otherCost: number;
  markupAmount: number;
  total: number;
}

/** PVC Tank Liner calculated results stored in custom_components */
export interface PvcTankLinerResults {
  /** Calculated liner diameter in metres */
  linerDiameter?: number;
  /** Calculated liner height in metres */
  linerHeight?: number;
  /** Developed length / circumference in metres */
  developedLength?: number;
  /** Welding size in metres */
  weldingSizeM?: number;
  /** Total welding allowance in metres */
  totalWeldingAllowance?: number;
  /** Required fabric width in metres */
  requiredFabricWidth?: number;
  /** Number of full fabric widths (ceiling) */
  fullFabricWidths?: number;
  /** Gross fabric width in metres */
  grossFabricWidth?: number;
  /** Unused / wastage width in metres */
  unusedWastageWidth?: number;
  /** Running meter (primary material requirement) */
  runningMeter?: number;
  /** Square meter (actual purchased material) */
  squareMeter?: number;
  /** Material cost */
  materialCost?: number;
  /** Selling price */
  sellingPrice?: number;
  /** Cost breakdown */
  costBreakdown?: PvcTankLinerCostBreakdown;
  /** Effective diameter (same as linerDiameter) */
  effectiveDiameter?: number;
  /** Effective height (same as linerHeight) */
  effectiveHeight?: number;
  /** Base cylinder area (PI * D * H) */
  cylinderArea?: number;
  /** Seam area */
  seamArea?: number;
  /** Total area */
  totalArea?: number;
  /** Number of fabric layers */
  numberOfLayers?: number;
  /** Total wastage */
  wastage?: number;
}

export interface MeasurementRowCalculated extends MeasurementRowInput {
  length_m: number;
  width_m: number;
  width2_m?: number;
  average_width_m?: number;
  formula_expression: string;
  formula_display: string;
  per_piece_result: number;
  calculated_total: number;
  result_unit: ResultUnit;
  rate_unit_label: string;
  total_cost: number;
  explanation_steps: string[];
}

export interface MeasurementSheet {
  id: string;
  company_id: string;
  project_id?: string | null;
  customer_id?: string | null;
  sheet_number: string;
  title: string;
  description?: string | null;
  status: "draft" | "active" | "quoted" | "completed";
  created_at?: string;
  updated_at?: string;
}

export interface MeasurementSheetSummary {
  totalPieces: number;
  totalLinearM: number;
  totalAreaM2: number;
  totalQuantityOnlyPcs: number;
  totalVolumeM3: number;
  totalCostAED: number;
  vatRate?: number;
  vatAmountAED?: number;
  grandTotalWithVatAED?: number;
  hasMixedUnits: boolean;
  unitBreakdown: {
    unit: ResultUnit;
    label: string;
    total: number;
    rowCount: number;
  }[];
  areaSummary: {
    area_name: string;
    quantity: number;
    calculated_total: number;
    result_unit: ResultUnit;
    calc_type: CalculationType;
    total_cost: number;
  }[];
}

export const CALC_TYPE_DEFINITIONS: {
  value: CalculationType;
  label: string;
  resultUnit: ResultUnit;
  rateUnitLabel: string;
  shortDesc: string;
  helpText: string;
}[] = [
  {
    value: "linear",
    label: "Linear Length (m)",
    resultUnit: "m",
    rateUnitLabel: "AED / m",
    shortDesc: "Single straight length × quantity",
    helpText: "Use for straight lengths such as pipe, cable, welding or edge length.",
  },
  {
    value: "area",
    label: "Area (m²)",
    resultUnit: "m²",
    rateUnitLabel: "AED / m²",
    shortDesc: "Length × Width (or avg width) × quantity",
    helpText: "Use for surfaces such as PVC fabric, roofing, flooring or cladding.",
  },
  {
    value: "perimeter",
    label: "Perimeter (m)",
    resultUnit: "m",
    rateUnitLabel: "AED / m",
    shortDesc: "Outside boundary: 2 × (Length + Width) × quantity",
    helpText: "Use for the outside boundary of a rectangular item.",
  },
  {
    value: "pvc_edge_joint",
    label: "PVC Edge + Centre Joint (m)",
    resultUnit: "m",
    rateUnitLabel: "AED / m",
    shortDesc: "((Edges + Joints) × Length + Width Edges × Width) × quantity",
    helpText: "Use when calculating the edge lengths plus centre welding/joint length for our PVC shade pieces.",
  },
  {
    value: "quantity_only",
    label: "Quantity Only (pcs)",
    resultUnit: "pcs",
    rateUnitLabel: "AED / pc",
    shortDesc: "Item count only",
    helpText: "Use when only counting items.",
  },
  {
    value: "custom",
    label: "Custom Formula",
    resultUnit: "m",
    rateUnitLabel: "AED / m",
    shortDesc: "Configurable component terms (Length, Width, Joints, etc.)",
    helpText: "Use when the fabrication pattern does not match the standard formulas.",
  },
];

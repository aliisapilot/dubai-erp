export type DimensionUnit = "mm" | "cm" | "m";

export type CalculationType =
  | "linear"
  | "area"
  | "perimeter"
  | "pvc_edge_joint"
  | "pvc_tank_liner"
  | "quantity_only"
  | "custom";

export type ResultUnit = "m" | "RM" | "m²" | "pcs" | "m³";

export type PvcTankLinerCostingMethod = "rm" | "m2";

export interface PvcTankLinerInput {
  tankDiameter: number;
  tankHeight: number;
  fabricWidth: number;
  weldingSizeMm: number;
  numberOfSeams: number;
  diameterAllowance: number;
  heightAllowance: number;
  eyeletSizeMm: number;
  costingMethod: PvcTankLinerCostingMethod;
  ratePerRm: number;
  ratePerM2: number;
  fabricationCost: number;
  otherCost: number;
  markupPercent: number;
  showMaterialRequirementOnQuotation: boolean;

  // Tank Quantity (Multi-Tank support)
  tankQuantity?: number;

  // Full 3D Tank Liner (Wall + Base Disc) & Allowance Settings
  includeBottomBase?: boolean;
  baseFabricAllowanceRm?: number;
  weldingReinforcementRm?: number;

  // Manual Quantity Overrides (Per Tank)
  overrideFabricSqm?: number;
  overrideWeldingRm?: number;
  overrideEyeletsPcs?: number;

  // Enhanced Internal Costing fields (Purchase / Cost)
  fabricPurchaseRate?: number;
  fabricPurchaseUnit?: "rm" | "sqm";
  weldingCost?: number;
  eyeletPurchaseRate?: number;
  eyeletCount?: number;
  transportCost?: number;
  otherExpenses?: number;

  // Separate Customer Selling Price Section
  sellingRateFabric?: number;
  sellingRateFabricUnit?: "sqm" | "rm";
  sellingRateWelding?: number;
  sellingRateEyelet?: number;
}

export interface PvcTankLinerResult extends PvcTankLinerInput {
  linerDiameter: number;
  linerHeight: number;
  developedLength: number;
  totalWeldingAllowance: number;
  requiredFabricWidth: number;
  fullFabricWidths: number;
  grossFabricWidth: number;
  wastageWidth: number;
  runningMeter: number;
  squareMeter: number;
  materialCost: number;
  costBeforeMarkup: number;
  markupAmount: number;
  sellingPrice: number;

  // Multi-Tank Support
  tankQuantity: number;

  // Fabric Breakdown (Per Tank & All Tanks)
  wallFabricRm: number;
  wallFabricSqm: number;
  baseFabricRm: number;
  baseFabricSqm: number;
  allowanceFabricRm: number;
  totalCalculatedFabricSqm: number;
  approvedFabricSqmPerTank: number;
  approvedFabricSqmAllTanks: number;

  // Welding Seams Breakdown (Separating overlap mm from running metres RM)
  weldingOverlapMm: number;
  weldingBaseSeamsRm: number;
  weldingWallHorizontalRm: number;
  weldingWallVerticalRm: number;
  weldingCornerRimRm: number;
  weldingReinforcementRm: number;
  totalCalculatedWeldingRm: number;
  approvedWeldingRmPerTank: number;
  approvedWeldingRmAllTanks: number;

  // Eyelets Breakdown
  eyeletsTopRim: number;
  eyeletsBottom: number;
  totalCalculatedEyelets: number;
  approvedEyeletsPerTank: number;
  approvedEyeletsAllTanks: number;

  // Enhanced Costing Breakdown
  fabricPurchaseRate: number;
  fabricPurchaseUnit: "rm" | "sqm";
  fabricPurchaseCost: number;
  weldingCost: number;
  eyeletPurchaseRate: number;
  eyeletCount: number;
  eyeletPurchaseCost: number;
  transportCost: number;
  otherExpenses: number;
  totalInternalCost: number;

  // Customer Selling Breakdown (Based on Approved Quantities)
  sellingRateFabric: number;
  sellingRateFabricUnit: "sqm" | "rm";
  sellingRateWelding: number;
  sellingRateEyelet: number;
  fabricSellingTotal: number;
  weldingSellingTotal: number;
  eyeletSellingTotal: number;
  quotationSellingValue: number;

  // Financial Analysis
  estimatedProfit: number;
  profitMarginPercent: number;
}

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
  tank_liner_data?: PvcTankLinerInput | PvcTankLinerResult;
  rate: number;
  notes?: string;
  sort_order?: number;
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
  tank_liner_result?: PvcTankLinerResult;
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
  totalRunningM: number;
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
    value: "pvc_tank_liner",
    label: "PVC Tank Liner (RM)",
    resultUnit: "RM",
    rateUnitLabel: "AED / RM or AED / m²",
    shortDesc: "Tank diameter + height → fixed-width roll requirement",
    helpText: "Calculates liner size, seams, full fabric widths, running metres, square metres, wastage and optional costing.",
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

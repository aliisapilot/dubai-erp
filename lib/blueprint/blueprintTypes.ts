export type BlueprintAnnotationType =
  | "dimension"
  | "area"
  | "note"
  | "label";

export type DimensionUnit = "mm" | "cm" | "m";

export type AreaShape = "rectangle" | "polygon" | "irregular";

export type AnnotationSource =
  | "Manual"
  | "Blueprint"
  | "Scale Measured"
  | "AI Detected";

export interface BlueprintPoint {
  x: number; // canvas pixel coordinates
  y: number;
}

export interface BlueprintCalibration {
  pointA: BlueprintPoint;
  pointB: BlueprintPoint;
  realWorldDistance: number; // in mm
  unit: DimensionUnit;
  pixelsPerMm: number;
  calibratedAt: string;
}

export interface BlueprintDimensionAnnotation {
  id: string;
  type: "dimension";
  pointA: BlueprintPoint;
  pointB: BlueprintPoint;
  realValue: number; // in mm
  unit: DimensionUnit;
  label: string;
  source: AnnotationSource;
  confirmed: boolean;
  createdAt: string;
  updatedAt?: string;
}

export interface BlueprintAreaAnnotation {
  id: string;
  type: "area";
  shape: AreaShape;
  points: BlueprintPoint[]; // polygon vertices (min 3 for polygon, 2 for rect corners)
  areaLabel: string; // "Area 1", "Area 2", etc.
  realAreaM2: number;
  source: AnnotationSource;
  confirmed: boolean;
  createdAt: string;
  updatedAt?: string;
}

export interface BlueprintNoteAnnotation {
  id: string;
  type: "note";
  position: BlueprintPoint;
  text: string;
  source: AnnotationSource;
  createdAt: string;
  updatedAt?: string;
}

export interface BlueprintLabelAnnotation {
  id: string;
  type: "label";
  position: BlueprintPoint;
  text: string;
  source: AnnotationSource;
  createdAt: string;
  updatedAt?: string;
}

export type BlueprintAnnotation =
  | BlueprintDimensionAnnotation
  | BlueprintAreaAnnotation
  | BlueprintNoteAnnotation
  | BlueprintLabelAnnotation;

export interface BlueprintTakeoffArea {
  id: string;
  label: string; // "Area 1"
  dimensions: {
    lengthMm: number;
    widthMm: number;
    width2Mm?: number; // for tapered
    isTapered: boolean;
  };
  quantity: number;
  fabricAreaM2: number;
  pvcRunningMetres: number;
  centreJointCount: number;
  centreJointOrientation: "longitudinal" | "transverse" | "both";
  notes?: string;
  linkedRowIds?: string[]; // measurement_items ids
  source: AnnotationSource;
  createdAt: string;
  updatedAt?: string;
}

export interface BlueprintAITip {
  id: string;
  type: "dimension" | "text";
  suggestedValue?: number; // for dimension
  suggestedUnit?: DimensionUnit;
  suggestedText?: string; // for text/label
  position?: BlueprintPoint;
  boundingBox?: { x: number; y: number; w: number; h: number };
  confidence?: number;
  status: "pending" | "confirmed" | "edited" | "rejected";
  confirmedAnnotationId?: string;
  createdAt: string;
}

export interface BlueprintRecord {
  id: string;
  company_id: string;
  sheet_id?: string | null;
  project_id?: string | null;
  blueprint_name: string;
  blueprint_file_path?: string | null;
  file_type: "pdf" | "png" | "jpg";
  width_px: number;
  height_px: number;
  calibration?: BlueprintCalibration | null;
  annotations: BlueprintAnnotation[];
  takeoff_areas: BlueprintTakeoffArea[];
  ai_tips: BlueprintAITip[];
  ai_enabled: boolean;
  created_at: string;
  updated_at: string;
}

export interface TakeoffSummaryRow {
  area: string;
  length: number; // mm
  width: number; // mm
  width2?: number;
  quantity: number;
  areaM2: number;
  pvcRunningMetres: number;
  rate: number;
  cost: number;
}
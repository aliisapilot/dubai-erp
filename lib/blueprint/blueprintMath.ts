import {
  BlueprintPoint,
  DimensionUnit,
  BlueprintCalibration,
} from "./blueprintTypes";

/**
 * 1000 mm = 1 m
 * 100 cm = 1 m
 * 1,000,000 mm² = 1 m²
 */
export function convertUnitToMm(val: number, unit: DimensionUnit): number {
  const n = Number(val) || 0;
  switch (unit) {
    case "m":
      return n * 1000;
    case "cm":
      return n * 10;
    case "mm":
    default:
      return n;
  }
}

export function convertMmToUnit(valInMm: number, unit: DimensionUnit): number {
  const n = Number(valInMm) || 0;
  switch (unit) {
    case "m":
      return n / 1000;
    case "cm":
      return n / 10;
    case "mm":
    default:
      return n;
  }
}

export function distanceBetweenPoints(p1: BlueprintPoint, p2: BlueprintPoint): number {
  const dx = p2.x - p1.x;
  const dy = p2.y - p1.y;
  return Math.sqrt(dx * dx + dy * dy);
}

/**
 * Calculate calibration pixels-per-mm ratio.
 */
export function computeCalibration(
  p1: BlueprintPoint,
  p2: BlueprintPoint,
  realDistance: number,
  unit: DimensionUnit
): BlueprintCalibration {
  if (realDistance <= 0) {
    throw new Error("Real distance must be greater than zero");
  }
  const pixelDist = distanceBetweenPoints(p1, p2);
  if (pixelDist <= 0) {
    throw new Error("Points cannot be at the exact same location");
  }
  const distMm = convertUnitToMm(realDistance, unit);
  const pixelsPerMm = pixelDist / distMm;

  return {
    pointA: p1,
    pointB: p2,
    realWorldDistance: distMm,
    unit,
    pixelsPerMm,
    calibratedAt: new Date().toISOString(),
  };
}

/**
 * Calculate pixel distance to real world distance.
 */
export function pixelDistanceToReal(
  pixelDist: number,
  calibration: BlueprintCalibration,
  targetUnit: DimensionUnit = "mm"
): number {
  if (!calibration || calibration.pixelsPerMm <= 0) return 0;
  const mm = pixelDist / calibration.pixelsPerMm;
  return convertMmToUnit(mm, targetUnit);
}

/**
 * Shoelace algorithm for calculating area of 2D polygon in pixel coordinates.
 */
export function polygonAreaInPixels(points: BlueprintPoint[]): number {
  if (points.length < 3) return 0;
  let area = 0;
  for (let i = 0; i < points.length; i++) {
    const j = (i + 1) % points.length;
    area += points[i].x * points[j].y;
    area -= points[j].x * points[i].y;
  }
  return Math.abs(area) / 2.0;
}

/**
 * Calculate real-world area in m² from pixel polygon and calibration.
 * 1,000,000 mm² = 1 m²
 */
export function calculateRealAreaM2(
  points: BlueprintPoint[],
  calibration: BlueprintCalibration | null | undefined
): number {
  if (!calibration || calibration.pixelsPerMm <= 0) return 0;
  const pxArea = polygonAreaInPixels(points);
  // (pixelsPerMm)^2 is pixels² per mm²
  const areaMm2 = pxArea / (calibration.pixelsPerMm * calibration.pixelsPerMm);
  return areaMm2 / 1_000_000;
}

/**
 * Parking Shade Calculations:
 * Fabric m²: Length (m) × Width (m) × Quantity (or Average Width if tapered)
 * PVC Running Metres: (2 × Length + 2 × Width + Centre Joint Length) × Quantity
 */
export function calculateParkingShadeArea(params: {
  lengthMm: number;
  widthMm: number;
  width2Mm?: number;
  isTapered?: boolean;
  quantity: number;
  centreJointCount?: number;
  centreJointOrientation?: "longitudinal" | "transverse" | "both";
}): {
  fabricAreaM2: number;
  pvcRunningMetres: number;
  perPieceFabricM2: number;
  perPiecePvcM: number;
} {
  const lenM = (Number(params.lengthMm) || 0) / 1000;
  const w1M = (Number(params.widthMm) || 0) / 1000;
  const w2M = params.isTapered && params.width2Mm !== undefined ? (Number(params.width2Mm) || 0) / 1000 : w1M;
  const avgWidthM = (w1M + w2M) / 2;
  const qty = Number(params.quantity) > 0 ? Number(params.quantity) : 1;
  const cjCount = Number(params.centreJointCount) >= 0 ? Number(params.centreJointCount) : 1;
  const orientation = params.centreJointOrientation || "longitudinal";

  // Fabric calculation (m²)
  const perPieceFabric = lenM * avgWidthM;
  const totalFabric = perPieceFabric * qty;

  // PVC Running Metres calculation
  // 2 × Length + 2 × Width
  let jointRuns = 0;
  if (orientation === "longitudinal") {
    jointRuns = cjCount * lenM;
  } else if (orientation === "transverse") {
    jointRuns = cjCount * avgWidthM;
  } else if (orientation === "both") {
    jointRuns = cjCount * (lenM + avgWidthM);
  }

  const perPiecePvc = 2 * lenM + 2 * avgWidthM + jointRuns;
  const totalPvc = perPiecePvc * qty;

  return {
    fabricAreaM2: Math.round(totalFabric * 1000) / 1000,
    pvcRunningMetres: Math.round(totalPvc * 1000) / 1000,
    perPieceFabricM2: Math.round(perPieceFabric * 1000) / 1000,
    perPiecePvcM: Math.round(perPiecePvc * 1000) / 1000,
  };
}
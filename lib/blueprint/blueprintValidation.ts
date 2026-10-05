import { BlueprintRecord, BlueprintAnnotation, BlueprintDimensionAnnotation, BlueprintAreaAnnotation } from "./blueprintTypes";

const STORAGE_PREFIX = "dubai-erp-blueprint";

/**
 * Client-side persistence for blueprint state.
 * Use for unsaved projects; final saving goes to Supabase.
 */
export function getLocalBlueprint(key: string): BlueprintRecord | null {
  try {
    const raw = localStorage.getItem(`${STORAGE_PREFIX}:${key}`);
    if (!raw) return null;
    return JSON.parse(raw) as BlueprintRecord;
  } catch {
    return null;
  }
}

export function setLocalBlueprint(key: string, state: BlueprintRecord): void {
  try {
    localStorage.setItem(`${STORAGE_PREFIX}:${key}`, JSON.stringify(state));
  } catch {}
}

export function clearLocalBlueprint(key: string): void {
  localStorage.removeItem(`${STORAGE_PREFIX}:${key}`);
}

/**
 * Export a blueprint record as JSON blob for download.
 */
export function exportBlueprintAsJson(blueprint: BlueprintRecord): void {
  const data = JSON.stringify(blueprint, null, 2);
  const blob = new Blob([data], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `blueprint-${blueprint.blueprint_name.replace(/\s+/g, "-").toLowerCase()}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

/**
 * Validate annotation geometry and logic.
 */
export function validateDimensionAnnotation(annotation: BlueprintAnnotation): { valid: boolean; message?: string } {
  if (annotation.type !== "dimension") return { valid: false, message: "Not a dimension annotation" };
  const d = annotation as BlueprintDimensionAnnotation;
  if (!d.pointA || !d.pointB) return { valid: false, message: "Missing points" };
  const dx = d.pointB.x - d.pointA.x;
  const dy = d.pointB.y - d.pointA.y;
  if (dx === 0 && dy === 0) return { valid: false, message: "Points cannot be identical" };
  if (d.realValue <= 0) return { valid: false, message: "Real value must be positive" };
  return { valid: true };
}

export function validateAreaAnnotation(annotation: BlueprintAnnotation): { valid: boolean; message?: string } {
  if (annotation.type !== "area") return { valid: false, message: "Not an area annotation" };
  const a = annotation as BlueprintAreaAnnotation;
  if (!a.points || a.points.length < 3) return { valid: false, message: "Area must have at least 3 points" };
  if (a.realAreaM2 <= 0) return { valid: false, message: "Real area must be positive" };
  return { valid: true };
}

/**
 * Undo/Redo stack management.
 */
export interface UndoState {
  history: BlueprintRecord[];
  pointer: number;
}

export function initUndoState(initial: BlueprintRecord): UndoState {
  return { history: [JSON.parse(JSON.stringify(initial))], pointer: 0 };
}

export function pushUndoState(state: UndoState, newRecord: BlueprintRecord): UndoState {
  const trimmed = state.history.slice(0, state.pointer + 1);
  trimmed.push(JSON.parse(JSON.stringify(newRecord)));
  return { history: trimmed, pointer: trimmed.length - 1 };
}

export function undo(state: UndoState): { state: BlueprintRecord | null; newState: UndoState } {
  if (state.pointer <= 0) return { state: null, newState: state };
  const newPointer = state.pointer - 1;
  const newState: UndoState = { ...state, pointer: newPointer };
  return { state: JSON.parse(JSON.stringify(state.history[newPointer])), newState };
}

export function redo(state: UndoState): { state: BlueprintRecord | null; newState: UndoState } {
  if (state.pointer >= state.history.length - 1) return { state: null, newState: state };
  const newPointer = state.pointer + 1;
  const newState: UndoState = { ...state, pointer: newPointer };
  return { state: JSON.parse(JSON.stringify(state.history[newPointer])), newState };
}
export function getDocumentPreviewScale(
  availableWidth: number,
  documentWidth: number,
  maxScale = 1
): number {
  if (!Number.isFinite(availableWidth) || !Number.isFinite(documentWidth) || documentWidth <= 0) {
    return 1;
  }

  const safeMaxScale = Number.isFinite(maxScale) && maxScale > 0 ? maxScale : 1;
  return Math.min(safeMaxScale, Math.max(0, availableWidth) / documentWidth);
}
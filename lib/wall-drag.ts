export type SlotRect = { left: number; top: number; width: number; height: number };

export function findWallDropTarget(
  x: number,
  y: number,
  coverSize: number,
  slots: readonly SlotRect[],
  sourceIndex: number,
): number | null {
  if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(coverSize) || coverSize <= 0) return null;
  const half = coverSize / 2;
  const coverLeft = x - half;
  const coverTop = y - half;
  let bestArea = 0;
  let bestIndex: number | null = null;

  slots.forEach((slot, index) => {
    if (index === sourceIndex || slot.width <= 0 || slot.height <= 0) return;
    const overlapWidth = Math.max(0, Math.min(coverLeft + coverSize, slot.left + slot.width) - Math.max(coverLeft, slot.left));
    const overlapHeight = Math.max(0, Math.min(coverTop + coverSize, slot.top + slot.height) - Math.max(coverTop, slot.top));
    const area = overlapWidth * overlapHeight;
    if (area < Math.min(coverSize * coverSize, slot.width * slot.height) * 0.2 || area <= bestArea) return;
    bestArea = area;
    bestIndex = index;
  });

  return bestIndex;
}

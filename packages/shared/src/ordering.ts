/**
 * Fractional indexing with floats: an item's position sits between its
 * neighbours, so a move only rewrites one row instead of re-numbering the
 * whole list. When two neighbours get too close (float precision), the list
 * is rebalanced server-side.
 */
export const POSITION_STEP = 1024;
export const MIN_GAP = 1e-6;

export function positionBetween(prev: number | undefined, next: number | undefined): number {
  if (prev === undefined && next === undefined) return POSITION_STEP;
  if (prev === undefined) return next! - POSITION_STEP;
  if (next === undefined) return prev + POSITION_STEP;
  return (prev + next) / 2;
}

export function needsRebalance(prev: number | undefined, next: number | undefined): boolean {
  return prev !== undefined && next !== undefined && next - prev < MIN_GAP;
}

/**
 * Position for inserting an item at `toIndex` within `siblings` (sorted by
 * position, NOT containing the moved item itself).
 */
export function positionAtIndex(siblings: { position: number }[], toIndex: number): number {
  const i = Math.max(0, Math.min(toIndex, siblings.length));
  return positionBetween(siblings[i - 1]?.position, siblings[i]?.position);
}

export function rebalancedPositions<T extends { id: string }>(sorted: T[]): Record<string, number> {
  const out: Record<string, number> = {};
  sorted.forEach((item, i) => (out[item.id] = (i + 1) * POSITION_STEP));
  return out;
}

export function byPosition<T extends { position: number; id: string }>(a: T, b: T): number {
  return a.position - b.position || a.id.localeCompare(b.id);
}

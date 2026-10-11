/**
 * @file core/model/Range.ts
 * Bounding box mathematics, intersection, containment, and clamping.
 * ZERO browser/DOM imports.
 */

export interface CellRange {
  readonly xmin: number; // Inclusive minimum column index
  readonly xmax: number; // Inclusive maximum column index
  readonly ymin: number; // Inclusive minimum row index
  readonly ymax: number; // Inclusive maximum row index
}

/**
 * Creates a normalized CellRange where min <= max.
 */
export function createRange(x1: number, y1: number, x2: number, y2: number): CellRange {
  const minX = Math.trunc(Math.min(x1, x2));
  const maxX = Math.trunc(Math.max(x1, x2));
  const minY = Math.trunc(Math.min(y1, y2));
  const maxY = Math.trunc(Math.max(y1, y2));
  return {
    xmin: minX,
    xmax: maxX,
    ymin: minY,
    ymax: maxY
  };
}


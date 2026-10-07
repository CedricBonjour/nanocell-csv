/**
 * @file core/model/Range.ts
 * Bounding box mathematics, intersection, containment, and clamping.
 * ZERO browser/DOM imports.
 */

import { CellCoordinate } from './Cell.js';

export interface CellRange {
  readonly xmin: number; // Inclusive minimum column index
  readonly xmax: number; // Inclusive maximum column index
  readonly ymin: number; // Inclusive minimum row index
  readonly ymax: number; // Inclusive maximum row index
  readonly startX?: number;
  readonly startY?: number;
  readonly endX?: number;
  readonly endY?: number;
}

/**
 * Creates a normalized CellRange where min <= max.
 */
export function createRange(x1: number, y1: number, x2: number, y2: number): CellRange {
  const minX = Math.trunc(Math.min(x1, x2));
  const maxX = Math.trunc(Math.max(x1, x2));
  const minY = Math.trunc(Math.min(y1, y2));
  const maxY = Math.trunc(Math.max(y1, y2));
  return Object.freeze({
    xmin: minX,
    xmax: maxX,
    ymin: minY,
    ymax: maxY
  });
}

/**
 * Creates a CellRange spanning two CellCoordinates.
 */
export function rangeFromCoordinates(c1: CellCoordinate, c2: CellCoordinate): CellRange {
  return createRange(c1.x, c1.y, c2.x, c2.y);
}

/**
 * Creates a 1x1 CellRange covering a single coordinate.
 */
export function singleCellRange(coord: CellCoordinate): CellRange {
  return createRange(coord.x, coord.y, coord.x, coord.y);
}

/**
 * Returns column width of the range.
 */
export function rangeWidth(range: CellRange): number {
  return Math.max(0, range.xmax - range.xmin + 1);
}

/**
 * Returns row height of the range.
 */
export function rangeHeight(range: CellRange): number {
  return Math.max(0, range.ymax - range.ymin + 1);
}

/**
 * Returns total cell count contained in the range.
 */
export function rangeCellCount(range: CellRange): number {
  return rangeWidth(range) * rangeHeight(range);
}

/**
 * Checks if a coordinate falls inside the range.
 */
export function rangeContains(range: CellRange, coord: CellCoordinate): boolean {
  return (
    coord.x >= range.xmin &&
    coord.x <= range.xmax &&
    coord.y >= range.ymin &&
    coord.y <= range.ymax
  );
}

/**
 * Checks if range A completely encloses range B.
 */
export function rangeEncloses(outer: CellRange, inner: CellRange): boolean {
  return (
    inner.xmin >= outer.xmin &&
    inner.xmax <= outer.xmax &&
    inner.ymin >= outer.ymin &&
    inner.ymax <= outer.ymax
  );
}

/**
 * Checks if two ranges overlap.
 */
export function rangeIntersects(a: CellRange, b: CellRange): boolean {
  return (
    a.xmin <= b.xmax &&
    a.xmax >= b.xmin &&
    a.ymin <= b.ymax &&
    a.ymax >= b.ymin
  );
}

/**
 * Computes intersection of two ranges, or returns null if disjoint.
 */
export function rangeIntersection(a: CellRange, b: CellRange): CellRange | null {
  if (!rangeIntersects(a, b)) return null;
  return createRange(
    Math.max(a.xmin, b.xmin),
    Math.max(a.ymin, b.ymin),
    Math.min(a.xmax, b.xmax),
    Math.min(a.ymax, b.ymax)
  );
}

/**
 * Computes the minimum bounding box enclosing both ranges.
 */
export function rangeUnion(a: CellRange, b: CellRange): CellRange {
  return createRange(
    Math.min(a.xmin, b.xmin),
    Math.min(a.ymin, b.ymin),
    Math.max(a.xmax, b.xmax),
    Math.max(a.ymax, b.ymax)
  );
}

/**
 * Clamps range to maximum grid boundaries [0, maxWidth - 1] and [0, maxHeight - 1].
 * Returns null if range is completely outside bounds.
 */
export function clampRange(range: CellRange, maxWidth: number, maxHeight: number): CellRange | null {
  if (maxWidth <= 0 || maxHeight <= 0) return null;
  const xmin = Math.max(0, Math.min(range.xmin, maxWidth - 1));
  const xmax = Math.max(0, Math.min(range.xmax, maxWidth - 1));
  const ymin = Math.max(0, Math.min(range.ymin, maxHeight - 1));
  const ymax = Math.max(0, Math.min(range.ymax, maxHeight - 1));

  if (range.xmax < 0 || range.xmin >= maxWidth || range.ymax < 0 || range.ymin >= maxHeight) {
    return null;
  }
  return createRange(xmin, ymin, xmax, ymax);
}

/**
 * Checks equality between two ranges.
 */
export function rangeEquals(a: CellRange, b: CellRange): boolean {
  return (
    a.xmin === b.xmin &&
    a.xmax === b.xmax &&
    a.ymin === b.ymin &&
    a.ymax === b.ymax
  );
}

/**
 * Iterates through every coordinate in the range in row-major order.
 */
export function iterateRange(range: CellRange, cb: (x: number, y: number) => void): void {
  for (let y = range.ymin; y <= range.ymax; y++) {
    for (let x = range.xmin; x <= range.xmax; x++) {
      cb(x, y);
    }
  }
}

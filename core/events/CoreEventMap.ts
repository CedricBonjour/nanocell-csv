/**
 * @file core/events/CoreEventMap.ts
 * Compile-time checked registry of all events dispatched through the Core Event Bus.
 * Supports both domain topic schema and legacy/shorthand topics.
 * ZERO browser/DOM imports.
 */

import { CellCoordinate, CellRange } from '../model/index.js';

export interface CoreEventMap {
  // Domain Layer Events
  'domain:cell:changed': {
    readonly x: number;
    readonly y: number;
    readonly oldValue: string;
    readonly newValue: string;
  };

  'cell:changed': {
    readonly x: number;
    readonly y: number;
    readonly oldValue: string;
    readonly newValue: string;
  };

  'domain:matrix:resized': {
    readonly width: number;
    readonly height: number;
  };

  'matrix:resized': {
    readonly width: number;
    readonly height: number;
  };

  'domain:rows:reordered': {
    readonly newOrder: readonly number[];
  };

  'domain:document:saved': {
    readonly timestamp: number;
  };

  'domain:document:dirtyChanged': {
    readonly isDirty: boolean;
  };

  'domain:file:loadStart': {
    readonly filename: string;
    readonly totalBytes: number;
    readonly viewOnly: boolean;
  };

  'domain:file:chunkProgress': {
    readonly chunkIndex: number;
    readonly rowsAdded: number;
    readonly totalRows: number;
    readonly percent: number;
    readonly status: number;
  };

  'domain:file:loadComplete': {
    readonly filename: string;
    readonly totalRows: number;
    readonly totalCols: number;
    readonly viewOnly: boolean;
  };

  // UI Layer Events
  'ui:selection:changed': {
    readonly range: CellRange | null;
    readonly activeCell: CellCoordinate;
  };

  'ui:viewport:scrolled': {
    readonly startRow: number;
    readonly startCol: number;
  };

  'ui:column:resized': {
    readonly colIndex: number;
    readonly widthPx: number;
  };

  'ui:modal:opened': {
    readonly modalId: string;
  };

  'ui:modal:closed': {
    readonly modalId: string;
  };

  'ui:validationPane:stateChanged': {
    readonly isOpen: boolean;
    readonly pendingCount: number;
  };

  // Host Layer Events
  'host:theme:changed': {
    readonly themeKind: string;
    readonly isDark: boolean;
  };

  'host:file:loaded': {
    readonly filename: string;
    readonly rows: number;
    readonly cols: number;
  };

  'host:notification:show': {
    readonly type: 'info' | 'warning' | 'error' | 'success';
    readonly message: string;
  };

  // Dynamic / Custom Topics index signature
  [customTopic: string]: unknown;
}

/**
 * Application Context - Minimal, zero-overhead singleton state holders.
 * Replaces StateManager with plain JavaScript object & direct getters/setters.
 * Zero DOM dependencies, zero circular imports.
 */

let activeSheet = null;
let activeCsvHandle = null;

export function getSheet() {
  return activeSheet;
}

export function setSheet(sheet) {
  activeSheet = sheet;
}

export function getDataframe() {
  return activeSheet?.df || null;
}

export function getCsvHandle() {
  return activeCsvHandle;
}

export function setCsvHandle(handle) {
  activeCsvHandle = handle;
}

export function resetContext() {
  activeSheet = null;
  activeCsvHandle = null;
}

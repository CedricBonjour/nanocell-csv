/**
 * @file app/js/scenarios/ScenarioRunner.js
 * Independent, dynamically lazy-loaded Scenario & E2E Demo Engine.
 * Zero impact on base app bundle unless triggered via #scenario-<id|alias> or #demo=<id|alias>.
 * Supports both visual browser playback (animated cursor with active hover/click states,
 * keycap callouts, constant-dimension 2-row HUD pill) and fast headless execution for automated E2E tests.
 */

import { Dataframe } from '../../core/Dataframe.js';
import { CsvParser, SeparatorDetector } from '../../core/Csv.js';
import { DataValidator } from '../../core/DataValidator.js';
import { getSheet, setSheet, Setting, settings, formatShortcut } from '../state.js';
import { clamp, abortableSleep } from '../utils.js';
import { commands } from '../Commands.js';
import { Sheet } from '../Sheet.js';
import { ValidationPane } from '../ValidationPane.js';

import { scenario001 } from './scenario-001-clean-financial-data.js';
import { scenario002 } from './scenario-002-standardize-dates-headers.js';
import { scenario003 } from './scenario-003-e2e-full-pipeline.js';
import { scenario004 } from './scenario-004-e2e-grid-editing-filter.js';
import { scenario005 } from './scenario-005-promo-60s-hero.js';
import { scenario006 } from './scenario-006-promo-power-shortcuts.js';

export const SCENARIOS = [
  scenario001,
  scenario002,
  scenario003,
  scenario004,
  scenario005,
  scenario006,
];

const SCENARIO_MAP = new Map();
for (const sc of SCENARIOS) {
  SCENARIO_MAP.set(sc.id.toLowerCase(), sc);
  SCENARIO_MAP.set(sc.alias.toLowerCase(), sc);
  SCENARIO_MAP.set(`scenario-${sc.id.toLowerCase()}`, sc);
  SCENARIO_MAP.set(`scenario-${sc.alias.toLowerCase()}`, sc);
}

export function resolveScenario(idOrAlias) {
  if (!idOrAlias) return null;
  const key = String(idOrAlias).trim().toLowerCase().replace(/^#/, '');
  return SCENARIO_MAP.get(key) || null;
}

export function parseScenarioHash(rawHash = globalThis.location?.hash || '') {
  const cleaned = String(rawHash || '').replace(/^#/, '').trim();
  if (!cleaned) return null;

  const parts = cleaned.split('&');
  const first = parts[0];
  let target = '';

  if (/^scenario-/i.test(first)) {
    target = first.replace(/^scenario-/i, '');
  } else if (/^demo=/i.test(first)) {
    target = decodeURIComponent(first.slice(5));
  } else {
    return null;
  }

  const params = new URLSearchParams(parts.slice(1).join('&'));
  const scenario = resolveScenario(target);
  if (!scenario) return null;

  const modeParam = (params.get('mode') || '').toLowerCase();
  const hudParam = (params.get('hud') || '').toLowerCase();
  const autoplayParam = params.get('autoplay');
  const resetParam = params.get('reset');

  const mode = (modeParam === 'step' || modeParam === 'instant') ? modeParam : 'play';
  const hudImmediate = hudParam === '1' || hudParam === 'true' || hudParam === 'immediate' || autoplayParam === '0' || mode === 'step';
  const hudHidden = hudParam === '0' || hudParam === 'false' || hudParam === 'never';
  const hudMode = hudHidden ? 'hidden' : (hudImmediate ? 'immediate' : 'after');

  const autoplay = mode === 'play' && autoplayParam !== '0' && autoplayParam !== 'false' && hudParam !== '1' && hudParam !== 'immediate';
  const resetAfterAutoplay = resetParam !== '0' && resetParam !== 'false';
  const speed = clamp(parseFloat(params.get('speed') || '1') || 1, 0.25, 10);
  const delay = Math.max(0, parseInt(params.get('delay') || '400', 10) || 0);
  const loop = params.get('loop') === '1' || params.get('loop') === 'true';
  const theme = params.get('theme') || null;

  return {
    target,
    scenario,
    mode,
    hudMode,
    autoplay,
    resetAfterAutoplay,
    speed,
    delay,
    loop,
    theme,
  };
}

export function parseScenarioMatrix(scenario) {
  const rawCsv = typeof scenario.csv === 'function' ? scenario.csv() : scenario.csv;
  if (Array.isArray(scenario.data)) return scenario.data.map(r => [...r]);
  const delimiter = SeparatorDetector.detect(rawCsv);
  return new CsvParser({ delimiter, trimUnquotedWhitespace: false }).parse(rawCsv);
}

/**
 * Executes a single semantic step synchronously on the active Sheet & Dataframe.
 */
export function executeStepSync(step, sheet = getSheet()) {
  if (!sheet?.df) return { assertionsPassed: 0 };
  const df = sheet.df;
  let assertionsPassed = 0;

  switch (step.type) {
    case 'selectCell':
      sheet.focusCell?.(step.x, step.y);
      break;
    case 'selectRange':
      sheet.selectRange?.(step.xmin, step.ymin, step.xmax, step.ymax, true);
      break;
    case 'selectCol':
      sheet.selectCol?.(step.col);
      break;
    case 'selectRow':
      sheet.selectRow?.(step.row);
      break;
    case 'cmd': {
      const cmd = commands[step.cmdId];
      cmd?.run?.();
      break;
    }
    case 'openValidation': {
      const pane = ValidationPane.getInstance();
      if (pane) {
        pane.show?.();
        pane.showRules?.();
      }
      break;
    }
    case 'closeValidation': {
      ValidationPane.getInstance()?.close?.();
      break;
    }
    case 'selectValidationRule': {
      const pane = ValidationPane.getInstance();
      if (pane) {
        pane.show?.();
        pane.runRule?.(step.ruleId);
      }
      break;
    }
    case 'applyValidationCol': {
      const pane = ValidationPane.getInstance();
      if (pane && pane.currentRule) {
        pane.resolveItems?.(pane.getPendingItems(step.col), true);
      } else {
        DataValidator.validateCurrencyColumn(df, step.col);
        sheet.refresh?.();
        sheet.refreshSelection?.(true);
      }
      break;
    }
    case 'validateCurrency': {
      DataValidator.validateCurrencyColumn(df, step.col);
      sheet.refresh?.();
      sheet.refreshSelection?.(true);
      break;
    }
    case 'validateRule': {
      const pane = ValidationPane.getInstance();
      if (pane) {
        pane.show?.();
        pane.runRule?.(step.ruleId);
        if (step.acceptAll) {
          pane.resolveScope?.(true);
        } else if (typeof step.col === 'number') {
          pane.resolveItems?.(pane.getPendingItems(step.col), true);
        }
      } else {
        const { proposals } = DataValidator.runRule(df, step.ruleId);
        const filtered = typeof step.col === 'number' ? proposals.filter(p => p.x === step.col) : proposals;
        if (filtered.length > 0) {
          DataValidator.applyProposals(df, step.ruleId, filtered, proposals);
          sheet.refresh?.();
        }
      }
      break;
    }
    case 'editCell': {
      sheet.focusCell?.(step.x, step.y);
      df.editRange({ xmin: step.x, xmax: step.x, ymin: step.y, ymax: step.y }, step.value);
      sheet.refresh?.();
      break;
    }
    case 'findReplace': {
      if (sheet.finder) {
        sheet.finder.open(step.term, true);
        sheet.finder.replaceInput.value = step.replacement;
        sheet.finder.replaceAll();
        sheet.finder.close();
      } else {
        df.replaceAll({ term: step.term, caseSensitive: false }, step.replacement);
        sheet.refresh?.();
      }
      break;
    }
    case 'filter': {
      if (sheet.filter?.open) {
        sheet.filter.open(step.col);
        sheet.filter.filterInput.value = step.query;
        sheet.filter.applyFilter();
      } else {
        sheet.setFilter?.(step.col, step.query, false);
      }
      break;
    }
    case 'clearFilter': {
      if (sheet.filter?.isOpen) {
        sheet.filter.close();
      } else {
        sheet.clearFilter?.();
      }
      break;
    }
    case 'assert': {
      step.check(df, sheet);
      assertionsPassed = 1;
      break;
    }
  }

  // Keep demo data marked as saved so browser beforeunload never traps visitors
  df.isSaved = true;
  return { assertionsPassed };
}

/**
 * Runs a scenario synchronously in headless mode (used by automated test suite and instant mode).
 */
export function runScenarioHeadless(idOrAlias, targetSheet = null) {
  const scenario = typeof idOrAlias === 'object' ? idOrAlias : resolveScenario(idOrAlias);
  if (!scenario) throw new Error(`Unknown scenario: ${idOrAlias}`);

  const matrix = parseScenarioMatrix(scenario);
  const df = new Dataframe(matrix);
  const prevSheet = getSheet();
  const sheet = targetSheet || (typeof prevSheet?.toggleFixTop === 'function' ? prevSheet : new Sheet(df));
  setSheet(sheet);
  sheet.df = df;
  sheet.fixTop = false;
  sheet.filterRows = null;
  sheet._preFilterLock = undefined;
  sheet.x = 0;
  sheet.y = 0;
  sheet.rangeEnd = undefined;

  let assertionsPassed = 0;
  try {
    for (const step of scenario.steps) {
      const res = executeStepSync(step, sheet);
      assertionsPassed += res.assertionsPassed;
    }
    df.isSaved = true;
    return { scenario, df, sheet, assertionsPassed };
  } finally {
    if (prevSheet) setSheet(prevSheet);
  }
}

// ============================================================================
// Browser Visual Scenario Controller (Cursor, Hover States, Keycap, 2-Row HUD)
// ============================================================================

const SCENARIO_CSS = `
.nc-scenario-cursor {
  position: fixed;
  top: 0;
  left: 0;
  width: 24px;
  height: 24px;
  pointer-events: none;
  z-index: 10050;
  transition: transform 0.36s cubic-bezier(0.22, 1, 0.36, 1), opacity 0.2s ease;
  opacity: 0;
  filter: drop-shadow(0 3px 6px rgba(0, 0, 0, 0.4));
}
.nc-scenario-cursor.visible { opacity: 1; }
.nc-scenario-cursor svg {
  width: 100%;
  height: 100%;
  display: block;
  transition: transform 0.12s ease;
}
.nc-scenario-cursor.clicking svg {
  transform: scale(0.86);
}
.nc-scenario-cursor-ring {
  position: absolute;
  top: -6px;
  left: -6px;
  width: 30px;
  height: 30px;
  border-radius: 50%;
  border: 2.5px solid var(--active, #3b82f6);
  opacity: 0;
  transform: scale(0.35);
  pointer-events: none;
}
.nc-scenario-cursor.clicking .nc-scenario-cursor-ring {
  animation: nc-cursor-ripple 0.42s ease-out forwards;
}
@keyframes nc-cursor-ripple {
  0% { opacity: 1; transform: scale(0.35); }
  100% { opacity: 0; transform: scale(2.1); }
}

/* Simulated Active Hover & Press States on Target Elements */
ui-glyph.nc-scenario-hover,
button.nc-scenario-hover {
  background-color: var(--bg2, rgba(59, 130, 246, 0.16)) !important;
  box-shadow: 0 0 0 2px var(--active, #3b82f6) !important;
  transform: scale(1.12);
  transition: transform 0.14s ease, box-shadow 0.14s ease, background-color 0.14s ease;
  z-index: 5;
}
ui-glyph.nc-scenario-hover::before {
  background-color: var(--active, #3b82f6) !important;
}
ui-glyph[variant="accept"].nc-scenario-hover::before {
  background-color: var(--green, #10b981) !important;
}
ui-glyph[variant="reject"].nc-scenario-hover::before,
ui-glyph[variant="close"].nc-scenario-hover::before {
  background-color: var(--red, #ef4444) !important;
}
.validation-rule-card.nc-scenario-hover,
.validation-col-card.nc-scenario-hover {
  border-color: var(--active, #3b82f6) !important;
  background-color: color-mix(in srgb, var(--active, #3b82f6) 12%, var(--bg2, #1e293b)) !important;
  box-shadow: 0 0 0 1px var(--active, #3b82f6);
  transform: translateX(2px);
}
td.nc-scenario-hover,
th.nc-scenario-hover {
  box-shadow: inset 0 0 0 2px var(--active, #3b82f6) !important;
}
input.nc-scenario-hover {
  border-color: var(--active, #3b82f6) !important;
  box-shadow: 0 0 0 2px var(--active, #3b82f6) !important;
}
.nc-scenario-active {
  transform: scale(0.94) !important;
}

/* Keycap / Action Callout Banner */
.nc-scenario-keycap {
  position: fixed;
  bottom: 138px;
  left: 50%;
  transform: translateX(-50%) translateY(8px);
  background: rgba(15, 23, 42, 0.94);
  color: #f8fafc;
  padding: 6px 14px;
  border-radius: 8px;
  font-size: 13px;
  font-weight: 500;
  display: flex;
  align-items: center;
  gap: 8px;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.35);
  border: 1px solid rgba(148, 163, 184, 0.28);
  z-index: 10045;
  pointer-events: none;
  opacity: 0;
  transition: opacity 0.18s ease, transform 0.18s ease;
  white-space: nowrap;
  max-width: calc(100vw - 24px);
}
.nc-scenario-keycap.visible {
  opacity: 1;
  transform: translateX(-50%) translateY(0);
}
.nc-scenario-keycap kbd {
  background: rgba(255, 255, 255, 0.14);
  border: 1px solid rgba(255, 255, 255, 0.28);
  border-radius: 4px;
  padding: 2px 7px;
  font-family: var(--font-family-mono, monospace);
  font-size: 12px;
  font-weight: 700;
  color: #38bdf8;
}

/* Constant-Dimension 2-Row Interactive HUD Pill (Positioned Above Footer) */
.nc-scenario-hud {
  position: fixed;
  bottom: 54px;
  left: 50%;
  transform: translateX(-50%);
  width: 540px;
  max-width: calc(100vw - 24px);
  height: 74px;
  border-radius: 14px;
  padding: 8px 12px;
  display: none;
  flex-direction: column;
  justify-content: space-between;
  z-index: 10040;
  font-size: 12px;
}
.nc-scenario-hud.visible { display: flex; }

.nc-hud-controls-row {
  display: flex;
  align-items: center;
  gap: 6px;
  width: 100%;
  height: 28px;
  flex-shrink: 0;
}
.nc-hud-select {
  flex: 1 1 0%;
  min-width: 0;
  height: 28px;
  border-radius: 7px;
  padding: 0 8px;
  font-family: var(--font-family-ui, sans-serif);
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
}
.nc-scenario-hud button {
  height: 28px;
  padding: 0;
  border-radius: 7px;
  font-size: 12px;
  font-weight: 600;
  flex-shrink: 0;
}
.nc-scenario-hud .nc-hud-play { width: 80px; }
.nc-scenario-hud .nc-hud-prev { width: 58px; }
.nc-scenario-hud .nc-hud-next { width: 58px; }
.nc-scenario-hud .nc-hud-reset { width: 70px; }
.nc-scenario-hud .nc-hud-close { width: 28px; font-size: 15px; }

.nc-hud-status-row {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  height: 22px;
  padding-top: 4px;
  border-top: 1px solid var(--border, rgba(148, 163, 184, 0.2));
  flex-shrink: 0;
}
.nc-hud-step-counter {
  width: 72px;
  flex-shrink: 0;
  font-family: var(--font-family-mono, monospace);
  font-size: 11px;
  font-weight: 700;
  color: var(--active, #38bdf8);
  background: color-mix(in srgb, var(--active, #38bdf8) 12%, transparent);
  border-radius: 4px;
  padding: 1px 6px;
  text-align: center;
  white-space: nowrap;
}
.nc-scenario-hud-status {
  flex: 1 1 0%;
  min-width: 0;
  color: var(--txt-soft, #94a3b8);
  font-size: 12px;
  line-height: 20px;
}
.nc-scenario-badge {
  flex-shrink: 0;
  background: rgba(16, 185, 129, 0.16);
  color: #10b981;
  border: 1px solid rgba(16, 185, 129, 0.35);
  border-radius: 999px;
  padding: 1px 8px;
  font-family: var(--font-family-mono, monospace);
  font-size: 11px;
  font-weight: 600;
  white-space: nowrap;
}
`;

class BrowserScenarioController {
  constructor() {
    this.abortController = null;
    this.currentConfig = null;
    this.stepIndex = 0;
    this.assertionsPassed = 0;
    this.isPlaying = false;
    this.hudVisible = false;
    this._savedSettings = null;
    this._mounted = false;
    this._hoveredEls = new Set();
  }

  mountDom() {
    if (this._mounted || typeof document === 'undefined' || typeof document.createElement !== 'function') return;
    this._mounted = true;

    const style = document.createElement('style');
    style.id = 'nc-scenario-styles';
    style.textContent = SCENARIO_CSS;
    document.head?.appendChild?.(style);

    this.cursorEl = document.createElement('div');
    this.cursorEl.className = 'nc-scenario-cursor';
    this.cursorEl.innerHTML = `
      <div class="nc-scenario-cursor-ring"></div>
      <svg viewBox="0 0 24 24" fill="#3b82f6" stroke="#ffffff" stroke-width="1.8">
        <path d="M4 3l16 7.5-7 2-2.5 7.5L4 3z"/>
      </svg>
    `;

    this.keycapEl = document.createElement('div');
    this.keycapEl.className = 'nc-scenario-keycap';

    this.hudEl = document.createElement('div');
    this.hudEl.className = 'nc-scenario-hud floating-panel';
    this.hudEl.setAttribute?.('role', 'region');
    this.hudEl.setAttribute?.('aria-label', 'Scenario Demo Controls');

    const optionsHtml = SCENARIOS.map(sc =>
      `<option value="${sc.id}">${sc.id}: ${sc.title}</option>`
    ).join('');

    this.hudEl.innerHTML = `
      <div class="nc-hud-controls-row">
        <select class="nc-hud-select truncate" title="Switch scenario" aria-label="Switch scenario">${optionsHtml}</select>
        <div class="btn-group">
          <button type="button" class="nc-hud-play" title="Replay or pause scenario">▶ Replay</button>
          <button type="button" class="nc-hud-prev" title="Previous step">&lsaquo; Step</button>
          <button type="button" class="nc-hud-next" title="Next step">Step &rsaquo;</button>
          <button type="button" class="nc-hud-reset" title="Reset to initial sample data to try it yourself">↺ Reset</button>
          <button type="button" class="nc-hud-close" title="Close scenario bar">&times;</button>
        </div>
      </div>
      <div class="nc-hud-status-row">
        <span class="nc-hud-step-counter">Ready</span>
        <span class="nc-scenario-hud-status truncate">Select an action or press Replay</span>
        <span class="nc-scenario-badge hidden"></span>
      </div>
    `;

    // Prevent Sheet.js global document mousedown listener from intercepting <select> or HUD clicks
    this.hudEl.addEventListener?.('mousedown', (e) => e.stopPropagation());

    if (document.body?.append) {
      document.body.append(this.cursorEl, this.keycapEl, this.hudEl);
    } else if (document.body?.appendChild) {
      document.body.appendChild(this.cursorEl);
      document.body.appendChild(this.keycapEl);
      document.body.appendChild(this.hudEl);
    }

    this.selectEl = this.hudEl.querySelector?.('.nc-hud-select') || null;
    this.playBtn = this.hudEl.querySelector?.('.nc-hud-play') || null;
    this.prevBtn = this.hudEl.querySelector?.('.nc-hud-prev') || null;
    this.nextBtn = this.hudEl.querySelector?.('.nc-hud-next') || null;
    this.resetBtn = this.hudEl.querySelector?.('.nc-hud-reset') || null;
    this.stepCounterEl = this.hudEl.querySelector?.('.nc-hud-step-counter') || null;
    this.statusEl = this.hudEl.querySelector?.('.nc-scenario-hud-status') || null;
    this.badgeEl = this.hudEl.querySelector?.('.nc-scenario-badge') || null;
    this.closeBtn = this.hudEl.querySelector?.('.nc-hud-close') || null;

    this.selectEl?.addEventListener?.('change', () => {
      const id = this.selectEl.value;
      this.selectEl.blur?.();
      this.switchScenario(id);
    });

    this.playBtn?.addEventListener?.('click', () => {
      if (this.isPlaying) {
        this.stopPlayback();
        this.updateHud('Paused');
      } else {
        this.playInteractive();
      }
    });

    this.prevBtn?.addEventListener?.('click', () => this.stepTo(Math.max(0, this.stepIndex - 1)));
    this.nextBtn?.addEventListener?.('click', () => {
      const maxSteps = this.currentConfig?.scenario.steps.length || 0;
      this.stepTo(Math.min(maxSteps, this.stepIndex + 1));
    });
    this.resetBtn?.addEventListener?.('click', () => {
      this.stopPlayback();
      this.resetToInitialData();
      this.updateHud('Reset to raw sample data — try it yourself!');
    });
    this.closeBtn?.addEventListener?.('click', () => this.exit());
  }

  async switchScenario(idOrAlias) {
    const newHash = `#scenario-${idOrAlias}`;
    if (globalThis.history?.replaceState && globalThis.location) {
      globalThis.history.replaceState(null, '', `${globalThis.location.pathname}${globalThis.location.search}${newHash}`);
    } else if (globalThis.location) {
      globalThis.location.hash = newHash;
    }
    const parsed = parseScenarioHash(newHash);
    if (parsed) await this.startFromConfig(parsed);
  }

  sandboxSettings(themeOverride = null) {
    if (!this._savedSettings) {
      this._savedSettings = {
        actionBar: settings.actionBar,
        rows: settings.rows,
        cols: settings.cols,
        theme: settings.theme,
        sortIgnoreHeader: settings.sortIgnoreHeader,
      };
    }
    if (settings.actionBar === false) settings.actionBar = true;
    settings.sortIgnoreHeader = true;
    if (themeOverride) Setting.setTheme(themeOverride);
  }

  restoreSettings() {
    if (!this._savedSettings) return;
    settings.sortIgnoreHeader = this._savedSettings.sortIgnoreHeader;
    Setting.setTheme(this._savedSettings.theme);
    this._savedSettings = null;
  }

  clearHoverTargets() {
    for (const el of this._hoveredEls) {
      el?.classList?.remove?.('nc-scenario-hover', 'nc-scenario-active');
    }
    this._hoveredEls.clear();
  }

  addHoverTarget(el) {
    if (!el) return;
    el.classList?.add?.('nc-scenario-hover');
    this._hoveredEls.add(el);
    const parentCard = el.closest?.('.validation-rule-card, .validation-col-card');
    if (parentCard && parentCard !== el) {
      parentCard.classList?.add?.('nc-scenario-hover');
      this._hoveredEls.add(parentCard);
    }
  }

  resetToInitialData() {
    if (!this.currentConfig) return;
    const { scenario } = this.currentConfig;
    const sheet = getSheet();
    if (!sheet) return;

    this.clearHoverTargets();
    ValidationPane.getInstance()?.close?.();
    if (sheet.filter?.isOpen) sheet.filter.close();
    if (sheet.finder?.isOpen) sheet.finder.close();

    const matrix = parseScenarioMatrix(scenario);
    sheet.df = new Dataframe(matrix);
    sheet.df.isSaved = true;
    sheet.fixTop = false;
    sheet.filterRows = null;
    sheet.x = 0;
    sheet.y = 0;
    sheet.baseX = 0;
    sheet.baseY = 0;
    sheet.rangeEnd = undefined;
    sheet.reload?.();
    this.stepIndex = 0;
    this.assertionsPassed = 0;
  }

  stopPlayback() {
    if (this.abortController) {
      this.abortController.abort();
      this.abortController = null;
    }
    this.isPlaying = false;
    this.clearHoverTargets();
    this.cursorEl?.classList?.remove?.('visible', 'clicking');
    this.keycapEl?.classList?.remove?.('visible');
    if (this.playBtn) this.playBtn.textContent = '▶ Replay';
  }

  setHudVisible(visible) {
    this.hudVisible = Boolean(visible);
    this.hudEl?.classList?.toggle?.('visible', this.hudVisible);
  }

  updateHud(statusText) {
    if (this.statusEl && statusText) this.statusEl.textContent = statusText;
    if (this.playBtn) this.playBtn.textContent = this.isPlaying ? '⏸ Pause' : '▶ Replay';
    if (this.stepCounterEl) {
      const total = this.currentConfig?.scenario.steps.length || 0;
      this.stepCounterEl.textContent = this.stepIndex > 0 ? `Step ${this.stepIndex}/${total}` : 'Ready';
    }
    if (this.badgeEl) {
      this.badgeEl.classList?.toggle?.('hidden', this.assertionsPassed <= 0);
      if (this.assertionsPassed > 0) this.badgeEl.textContent = `✓ ${this.assertionsPassed} passed`;
    }
  }

  stepTo(targetIndex) {
    this.stopPlayback();
    this.resetToInitialData();
    const steps = this.currentConfig?.scenario.steps || [];
    const sheet = getSheet();
    for (let i = 0; i < targetIndex && i < steps.length; i++) {
      const res = executeStepSync(steps[i], sheet);
      this.assertionsPassed += res.assertionsPassed;
    }
    this.stepIndex = targetIndex;
    const currentStep = steps[targetIndex - 1];
    this.updateHud(currentStep?.caption || (targetIndex === 0 ? 'Reset to raw sample data — try it yourself!' : `Step ${targetIndex} / ${steps.length}`));
  }

  getCellElement(sheet, x, y) {
    return sheet?.rows?.[(y ?? 0) - (sheet.baseY || 0) + 1]?.cells?.[(x ?? 0) - (sheet.baseX || 0) + 1] || null;
  }

  getColHeaderElement(sheet, col) {
    return sheet?.rows?.[0]?.cells?.[(col ?? 0) - (sheet.baseX || 0) + 1] || null;
  }

  getRowHeaderElement(sheet, row) {
    return sheet?.rows?.[(row ?? 0) - (sheet.baseY || 0) + 1]?.cells?.[0] || null;
  }

  showKeycap(caption, shortcut = '') {
    if (!this.keycapEl) return;
    if (!caption && !shortcut) {
      this.keycapEl.classList?.remove?.('visible');
      return;
    }
    this.keycapEl.innerHTML = `${shortcut ? `<kbd>${shortcut}</kbd>` : ''}<span>${caption || ''}</span>`;
    this.keycapEl.classList?.add?.('visible');
  }

  async glideTo(targetEl, speed, signal, hoverHoldMs = 200) {
    if (!targetEl || !this.cursorEl) return false;
    try { targetEl.scrollIntoView?.({ block: 'nearest', inline: 'nearest' }); } catch {}
    const rect = targetEl.getBoundingClientRect?.();
    if (!rect || rect.width <= 0 || rect.height <= 0) return false;

    this.clearHoverTargets();
    const x = Math.round(rect.left + rect.width * 0.5);
    const y = Math.round(rect.top + rect.height * 0.5);
    this.cursorEl.classList?.add?.('visible');
    this.cursorEl.style.transform = `translate3d(${x}px, ${y}px, 0)`;

    await this.sleep(340 / speed, signal);
    this.addHoverTarget(targetEl);
    if (hoverHoldMs > 0) await this.sleep(hoverHoldMs / speed, signal);
    return true;
  }

  async glideAndClick(targetEl, speed, signal, hoverHoldMs = 220) {
    const reached = await this.glideTo(targetEl, speed, signal, hoverHoldMs);
    if (!reached) return false;

    this.cursorEl.classList?.remove?.('clicking');
    void this.cursorEl.offsetWidth;
    this.cursorEl.classList?.add?.('clicking');
    targetEl.classList?.add?.('nc-scenario-active');
    await this.sleep(150 / speed, signal);
    targetEl.classList?.remove?.('nc-scenario-active');
    this.clearHoverTargets();
    return true;
  }

  /**
   * Executes a step with full visual cursor choreography, active hover effects, and intermediate pauses.
   */
  async runVisualStep(step, sheet, speed, signal) {
    const cmd = step.type === 'cmd' ? commands[step.cmdId] : null;
    this.showKeycap(step.caption, cmd ? formatShortcut(cmd) : '');

    if (typeof document === 'undefined' || !sheet?.rows) {
      return executeStepSync(step, sheet);
    }

    const simpleClickTargets = {
      selectCell: () => [this.getCellElement(sheet, step.x, step.y), 220],
      selectCol: () => [this.getColHeaderElement(sheet, step.col), 220],
      selectRow: () => [this.getRowHeaderElement(sheet, step.row), 220],
      openValidation: () => [document.querySelector?.('#header [icon="validate_data"]'), 220],
      closeValidation: () => [document.getElementById?.('validation-close-btn'), 220],
      applyValidationCol: () => [
        document.querySelector?.(`.validation-col-card[data-col="${step.col}"] .col-accept-btn`) ||
          document.querySelector?.(`.validation-col-card[data-col="${step.col}"]`),
        260
      ],
    };

    if (simpleClickTargets[step.type]) {
      const [targetEl, holdMs] = simpleClickTargets[step.type]();
      await this.glideAndClick(targetEl, speed, signal, holdMs);
      return executeStepSync(step, sheet);
    }

    switch (step.type) {
      case 'selectRange': {
        const startEl = this.getCellElement(sheet, step.xmin, step.ymin);
        const endEl = this.getCellElement(sheet, step.xmax, step.ymax);
        await this.glideAndClick(startEl, speed, signal, 160);
        sheet.focusCell?.(step.xmin, step.ymin);
        if (endEl && endEl !== startEl) {
          await this.glideAndClick(endEl, speed, signal, 180);
        }
        return executeStepSync(step, sheet);
      }

      case 'selectValidationRule': {
        const pane = ValidationPane.getInstance();
        pane?.show?.();
        pane?.showRules?.();
        const card = document.querySelector?.(`.validation-rule-card[data-rule-id="${step.ruleId}"]`);
        await this.glideAndClick(card, speed, signal);
        return executeStepSync(step, sheet);
      }

      case 'validateRule': {
        const pane = ValidationPane.getInstance();
        if (pane) {
          pane.show?.();
          pane.showRules?.();
          const ruleCard = document.querySelector?.(`.validation-rule-card[data-rule-id="${step.ruleId}"]`);
          await this.glideAndClick(ruleCard, speed, signal, 240);
          pane.runRule?.(step.ruleId);
          await this.sleep(320 / speed, signal);

          if (step.acceptAll) {
            const acceptAllBtn = document.getElementById?.('validation-accept-all-btn');
            await this.glideAndClick(acceptAllBtn, speed, signal, 260);
            pane.resolveScope?.(true);
          } else if (typeof step.col === 'number') {
            const colAcceptBtn = document.querySelector?.(`.validation-col-card[data-col="${step.col}"] .col-accept-btn`);
            await this.glideAndClick(colAcceptBtn, speed, signal, 240);
            pane.resolveItems?.(pane.getPendingItems(step.col), true);
          }
          sheet.df.isSaved = true;
          return { assertionsPassed: 0 };
        }
        return executeStepSync(step, sheet);
      }

      case 'editCell': {
        const cellEl = this.getCellElement(sheet, step.x, step.y);
        await this.glideAndClick(cellEl, speed, signal, 200);
        sheet.focusCell?.(step.x, step.y);
        if (sheet.startEdit && sheet.inputField) {
          sheet.startEdit();
          sheet.inputField.value = step.value;
          this.addHoverTarget(sheet.inputField);
          await this.sleep(280 / speed, signal);
          this.clearHoverTargets();
          sheet.commitEdit?.();
          sheet.df.isSaved = true;
          return { assertionsPassed: 0 };
        }
        return executeStepSync(step, sheet);
      }

      case 'findReplace': {
        const findMenuBtn = document.querySelector?.('#header [icon="find"]');
        await this.glideAndClick(findMenuBtn, speed, signal, 180);
        if (sheet.finder) {
          sheet.finder.open('', true);
          await this.glideAndClick(sheet.finder.findInput, speed, signal, 160);
          sheet.finder.findInput.value = step.term;
          sheet.finder.find(true);
          await this.sleep(200 / speed, signal);

          await this.glideAndClick(sheet.finder.replaceInput, speed, signal, 160);
          sheet.finder.replaceInput.value = step.replacement;
          await this.sleep(200 / speed, signal);

          await this.glideAndClick(sheet.finder.replaceBtn, speed, signal, 220);
          sheet.finder.replaceAll();
          await this.sleep(220 / speed, signal);

          await this.glideAndClick(sheet.finder.closeBtn, speed, signal, 180);
          sheet.finder.close();
          sheet.df.isSaved = true;
          return { assertionsPassed: 0 };
        }
        return executeStepSync(step, sheet);
      }

      case 'filter': {
        const filterMenuBtn = document.querySelector?.('#header [icon="filter"]');
        await this.glideAndClick(filterMenuBtn, speed, signal, 180);
        if (sheet.filter?.open) {
          sheet.filter.open(step.col);
          await this.glideAndClick(sheet.filter.filterInput, speed, signal, 180);
          sheet.filter.filterInput.value = step.query;
          await this.sleep(200 / speed, signal);

          await this.glideAndClick(sheet.filter.applyBtn, speed, signal, 220);
          sheet.filter.applyFilter();
          sheet.df.isSaved = true;
          return { assertionsPassed: 0 };
        }
        return executeStepSync(step, sheet);
      }

      case 'clearFilter': {
        if (sheet.filter?.isOpen && sheet.filter.closeBtn) {
          await this.glideAndClick(sheet.filter.closeBtn, speed, signal, 200);
          sheet.filter.close();
          sheet.df.isSaved = true;
          return { assertionsPassed: 0 };
        }
        return executeStepSync(step, sheet);
      }

      case 'cmd': {
        const icon = cmd?.icon || step.cmdId;
        const headerBtn = document.querySelector?.(`#header [icon="${icon}"]`);
        if (headerBtn) {
          await this.glideAndClick(headerBtn, speed, signal, 220);
          return executeStepSync(step, sheet);
        }
        const getCmdTarget = () =>
          (step.cmdId === 'shiftRight' || step.cmdId === 'shiftLeft')
            ? this.getColHeaderElement(sheet, sheet.x)
            : this.getCellElement(sheet, sheet.x, sheet.y);
        const beforeTarget = getCmdTarget();
        await this.glideTo(beforeTarget, speed, signal, 160);
        const res = executeStepSync(step, sheet);
        const afterTarget = getCmdTarget();
        if (afterTarget && afterTarget !== beforeTarget) {
          await this.glideAndClick(afterTarget, speed, signal, 180);
        } else {
          this.clearHoverTargets();
        }
        return res;
      }

      default:
        return executeStepSync(step, sheet);
    }
  }

  sleep(ms, signal) {
    return abortableSleep(ms, signal);
  }

  async startFromConfig(config) {
    this.mountDom();
    this.stopPlayback();
    this.currentConfig = config;
    this.sandboxSettings(config.theme);

    if (this.selectEl) this.selectEl.value = config.scenario.id;
    this.resetToInitialData();

    if (config.mode === 'instant') {
      this.stepTo(config.scenario.steps.length);
      if (config.hudMode !== 'hidden') this.setHudVisible(true);
      return;
    }

    if (!config.autoplay || config.hudMode === 'immediate') {
      this.setHudVisible(config.hudMode !== 'hidden');
      this.updateHud(`${config.scenario.title} — Ready`);
      if (config.autoplay) await this.runTimeline({ resetOnFinish: false, revealHudOnFinish: false });
      return;
    }

    // Default behavior on initial load:
    // 1. Hide HUD pill during initial auto-play
    // 2. Auto-play the scenario with full cursor choreography & hover effects
    // 3. Reset the scenario to initial raw data
    // 4. Reveal the Interactive HUD Pill
    this.setHudVisible(false);
    await this.runTimeline({
      resetOnFinish: config.resetAfterAutoplay,
      revealHudOnFinish: config.hudMode === 'after',
    });
  }

  async playInteractive() {
    if (!this.currentConfig) return;
    this.setHudVisible(this.currentConfig.hudMode !== 'hidden');
    await this.runTimeline({ resetOnFinish: false, revealHudOnFinish: false });
  }

  async runTimeline({ resetOnFinish = false, revealHudOnFinish = false } = {}) {
    if (!this.currentConfig) return;
    const { scenario, speed, delay, loop } = this.currentConfig;

    this.stopPlayback();
    const ac = new AbortController();
    this.abortController = ac;
    this.isPlaying = true;
    this.resetToInitialData();
    this.updateHud(`Playing: ${scenario.title}`);

    try {
      do {
        if (delay > 0) await this.sleep(delay / speed, ac.signal);
        const sheet = getSheet();

        for (let i = 0; i < scenario.steps.length; i++) {
          const step = scenario.steps[i];
          this.stepIndex = i + 1;
          this.updateHud(step.caption || `Step ${i + 1} / ${scenario.steps.length}`);
          const res = await this.runVisualStep(step, sheet, speed, ac.signal);
          this.assertionsPassed += res.assertionsPassed;
          this.updateHud(step.caption || `Step ${i + 1} / ${scenario.steps.length}`);
          await this.sleep((step.wait || 650) / speed, ac.signal);
        }

        await this.sleep(900 / speed, ac.signal);
        if (loop) this.resetToInitialData();
      } while (loop && !ac.signal.aborted);

      const finalAssertions = this.assertionsPassed;
      this.stopPlayback();

      if (resetOnFinish) {
        this.resetToInitialData();
        this.assertionsPassed = finalAssertions;
      }

      if (revealHudOnFinish) {
        this.setHudVisible(true);
      }

      this.updateHud(
        resetOnFinish
          ? 'Demo complete & reset — try it yourself or replay!'
          : 'Scenario complete'
      );
    } catch (err) {
      if (err?.name !== 'AbortError') console.error('Scenario error:', err);
    }
  }

  exit() {
    this.stopPlayback();
    this.setHudVisible(false);
    this.restoreSettings();
    if (globalThis.history?.replaceState && globalThis.location) {
      globalThis.history.replaceState(null, '', globalThis.location.pathname + globalThis.location.search);
    }
  }
}

let controllerInstance = null;

export function getScenarioController() {
  return (controllerInstance ||= new BrowserScenarioController());
}

export async function bootScenarioFromHash(rawHash = globalThis.location?.hash || '') {
  const parsed = parseScenarioHash(rawHash);
  if (!parsed) return null;
  const ctrl = getScenarioController();
  await ctrl.startFromConfig(parsed);
  return ctrl;
}

import { dom } from '../AppLayout.js';
import { StateManager } from '../../StateManager.js';
import { ThemeManager } from './ThemeManager.js';
import { SettingDialog } from './SettingDialog.js';

const stg = {};
if (typeof globalThis !== 'undefined') {
  globalThis.stg = stg;
}

/**
 * Manages configuration keys, reactive state getters/setters, and localStorage persistence.
 */
class Setting {
  constructor(s) {
    let stored_val = localStorage.getItem(s.key);
    if (!(isNaN(stored_val) || stored_val == null)) stored_val = Number(stored_val);
    if (stored_val == "true") stored_val = true;
    if (stored_val == "false") stored_val = false;
    this.key = s.key;
    this.value = (stored_val === null) ? s.dflt : stored_val;
    this.cb = s.cb;
    Object.defineProperty(stg, this.key, {
      get: () => { return this.value; },
      set: (e) => {
        this.value = e;
        localStorage.setItem(this.key, e);
        if (this.cb) this.cb(this.value);
      },
      configurable: true
    });
    if (s.key == "theme" && stored_val === null && typeof window !== 'undefined' && window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
      this.value = "night";
    }
    if (s.key == "theme") {
      if (typeof document !== 'undefined') {
        if (document.body) document.body.setAttribute('data-theme', this.value);
        if (document.documentElement) document.documentElement.setAttribute('data-theme', this.value);
      }
    }
  }

  static set(key, val) {
    stg[key] = val;
  }

  static init(cb) {
    for (const s of Setting.list) if (!s.title) new Setting(s);
    Setting.setTheme();
  }

  static buildRow(setting) {
    return SettingDialog.buildRow(setting);
  }

  static build(setting) {
    return SettingDialog.build(setting);
  }

  static show() {
    return SettingDialog.show();
  }

  static setTheme(themeName) {
    return ThemeManager.setTheme(themeName);
  }

  static log() {
    for (let i = 0; i < localStorage.length; i++) {
      console.log(localStorage.key(i), " >> ", (localStorage.getItem(localStorage.key(i))));
    }
  }

  static runAll() {
    for (const s of Setting.list) if (s.key) stg[s.key] = stg[s.key];
  }

  static resetDefault() {
    for (const s of Setting.list) if (s.key) stg[s.key] = s.dflt;
    Setting.show();
  }
}

Object.defineProperty(Setting, 'list', {
  value: [
    { title: "Appearance" },
    { key: "theme", dflt: "nord", name: "Theme", list: ["light", "dark", "solarized", "night", "nord", "dracula"], hide: true, cb: Setting.setTheme },
    { key: "font", dflt: 13, name: "Font Size", min: 7, max: 24, cb: n => { if (dom?.body) dom.body.style.fontSize = n + "px"; } },
    { key: "rows", dflt: 25, name: "Rows", min: 10, max: 60, cb: n => { const s = StateManager.getState('sheet'); if (s) s.reload(); } },
    { key: "cols", dflt: 7, name: "Cols", min: 3, max: 30, cb: n => { const s = StateManager.getState('sheet'); if (s) s.reload(); } },
    { key: "actionBar", dflt: true, name: "Action Bar", cb: b => {
      const header = (dom && dom.header) || (typeof document !== 'undefined' && (document.getElementById('header') || document.querySelector('header')));
      if (header) header.style.display = b ? "flex" : "none";
      const s = StateManager.getState('sheet');
      if (s && typeof s.scrollbarRefresh === 'function') s.scrollbarRefresh();
    } },
    { key: "purple", dflt: true, name: "Warning color on line return, comma and double quote values", cb: b => { const s = StateManager.getState('sheet'); if (s) s.reload(); } },

    { title: "Csv Save" },
    { key: "encoding", dflt: "utf-8", name: "Encoding" },
    { key: "delimiter", dflt: ",", name: "Delimiter", list: [",", ";", "TAB", "|"], hide: true },
    { key: "save_fixed_width_size", dflt: 0, name: "Minimum column size", min: 0, max: 100 },
    { key: "save_strict", dflt: false, name: "Save-Strict (error on comma  or double quotes)" },
    { title: "Csv Open" },
    { key: "set_headers", dflt: true, name: "Set headers" },
    { key: "trim", dflt: false, name: "Remove empty rows and columns" },

    { title: "Data Validation" },
    { key: "dv_comma_num", dflt: true, name: "In numeric values : replace commas by a dot" },
    { key: "dv_comma_txt", dflt: true, name: "In text values : replace commas by a dash " },
    { key: "dv_quotes", dflt: true, name: "Replace double quotes by single quotes" },
    { key: "dv_lr", dflt: true, name: "Replace line returns by a pipe (|)" },
    { key: "dv_lower", dflt: false, name: "Force all text to lower case" },

    { title: "Csv View Only" },
    { key: "editMaxFileSize", dflt: 10, name: "Max editable file size (Mo)" },
    { key: "vo_n_chunks", dflt: 5, name: "Number of chunks loaded", min: 5, max: 50 },
    { key: "vo_n_rows", dflt: 10, name: "Number of rows per chunk loaded", min: 3, max: 50 },

    { title: "Sort" },
    { key: "sort_header", dflt: true, name: "Ignore 1st row (header row)" },
    { key: "sort_num_first", dflt: false, name: "Numbers are sorted before text" },
  ]
});

export { Setting, stg };

import { dom } from '../AppLayout.js';
import { getDataframe, getSheet } from '../../appContext.js';
import { Dataframe } from '../../../../core/model/Dataframe.js';

const stg = {};
let _autoRound = false;
Object.defineProperty(stg, 'autoRound', {
  get: () => _autoRound,
  set: (val) => {
    _autoRound = Boolean(val);
    Dataframe.defaultAutoRound = _autoRound;
    const activeDf = getDataframe();
    if (activeDf) activeDf.autoRound = _autoRound;
  },
  configurable: true
});

if (typeof globalThis !== 'undefined') {
  globalThis.stg = stg;
}

/**
 * Core configuration state store, reactive state getters/setters, and localStorage persistence.
 */
class Setting {
  constructor(s) {
    let stored_val = null;
    try {
      stored_val = (typeof localStorage !== 'undefined') ? localStorage.getItem(s.key) : null;
    } catch (e) {
      console.warn('localStorage access failed:', e);
    }
    if (stored_val !== null && stored_val !== '' && !isNaN(stored_val)) {
      stored_val = Number(stored_val);
    }
    if (stored_val === "true") stored_val = true;
    if (stored_val === "false") stored_val = false;
    // Migrate legacy default of 100 Mo down to modern 10 Mo default
    if (s.key === "editMaxFileSize" && (stored_val === 100 || stored_val === "100")) {
      stored_val = s.dflt;
      try { localStorage.setItem("editMaxFileSize", String(s.dflt)); } catch {}
    }
    this.key = s.key;
    if (stored_val !== null) {
      this.value = stored_val;
    } else if (s.key === "theme") {
      const prefersDark = typeof window !== 'undefined' && window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
      this.value = prefersDark ? 'nord' : 'light';
    } else {
      this.value = s.dflt;
    }
    this.cb = s.cb;
    Object.defineProperty(stg, this.key, {
      get: () => { return this.value; },
      set: (e) => {
        this.value = e;
        try {
          if (typeof localStorage !== 'undefined') localStorage.setItem(this.key, e);
        } catch (err) {
          console.warn('localStorage set failed:', err);
        }
        if (this.cb) this.cb(this.value);
      },
      configurable: true
    });
  }

  static set(key, val) {
    stg[key] = val;
  }

  static toggleActionBar() {
    stg.actionBar = (stg.actionBar === false);
  }

  static init(cb) {
    for (const s of Setting.list) if (!s.title) new Setting(s);
    Setting.setTheme();
  }

  static setTheme(themeName) {
    const activeTheme = themeName || (typeof globalThis !== 'undefined' && globalThis.stg?.theme) || 'light';
    if (typeof document !== 'undefined') {
      if (document.documentElement) document.documentElement.setAttribute('data-theme', activeTheme);
      if (document.body) document.body.setAttribute('data-theme', activeTheme);
    }
    if (dom?.theme) dom.theme.href = "css/themes/" + activeTheme + ".css";
    if (dom?.palette) dom.palette.href = "css/palettes/" + activeTheme + ".css";
  }

  static runAll() {
    for (const s of Setting.list) {
      if (s.key && typeof s.cb === 'function') {
        s.cb(stg[s.key]);
      }
    }
  }

  static resetDefault() {
    for (const s of Setting.list) if (s.key) stg[s.key] = s.dflt;
  }
}

Object.defineProperty(Setting, 'list', {
  value: [
    { title: "Appearance" },
    { key: "theme", dflt: "nord", name: "Theme", list: ["light", "slate", "dark", "solarized", "night", "nord", "dracula"], hide: true, cb: Setting.setTheme },
    { key: "font", dflt: 13, name: "Font Size", min: 7, max: 24, cb: n => {
      const b = dom?.body || (typeof document !== 'undefined' ? document.body : null);
      if (b) {
        b.style.setProperty('--app-font-size', n + "px");
        b.style.fontSize = n + "px";
      }
    } },
    { key: "rows", dflt: 25, name: "Rows", min: 10, max: 60, cb: n => { const s = getSheet(); if (s) s.reload(); } },
    { key: "cols", dflt: 7, name: "Cols", min: 3, max: 30, cb: n => { const s = getSheet(); if (s) s.reload(); } },
    { key: "actionBar", dflt: true, name: "Action Bar", cb: b => {
      const header = (dom && dom.header) || (typeof document !== 'undefined' && (document.getElementById('header') || document.querySelector('header')));
      if (header) {
        header.classList.toggle('hidden', !b);
        header.hidden = !b;
        header.style.display = b ? "flex" : "none";
      }
      const s = getSheet();
      if (s && typeof s.scrollbarRefresh === 'function') s.scrollbarRefresh();
    } },
    { key: "purple", dflt: true, name: "Warning color on line return, comma and double quote values", cb: b => { const s = getSheet(); if (s) s.reload(); } },

    { title: "Csv Save" },
    { key: "encoding", dflt: "utf-8", name: "Encoding" },
    { key: "delimiter", dflt: ",", name: "Delimiter", list: [",", ";", "TAB", "|"], hide: true },
    { key: "save_fixed_width_size", dflt: 0, name: "Minimum column size", min: 0, max: 100 },
    { key: "save_strict", dflt: false, name: "Save-Strict (error on comma  or double quotes)" },

    { title: "Csv Open" },
    { key: "set_headers", dflt: true, name: "Set headers" },
    { key: "trim", dflt: false, name: "Remove empty rows and columns" },
    { key: "trim_unquoted", dflt: true, name: "Trim unquoted whitespace" },


    { title: "Csv View Only" },
    { key: "editMaxFileSize", dflt: 10, name: "Max editable file size (Mo)", min: 1, max: Infinity, stepMode: 'pow2' },
    { key: "vo_n_chunks", dflt: 8, name: "Number of chunks loaded", min: 8,  stepMode: 'pow2' },
    { key: "vo_n_rows", dflt: 8, name: "Number of rows per chunk loaded", min: 8, stepMode: 'pow2' },

    { title: "Sort" },
    { key: "sort_header", dflt: true, name: "Ignore 1st row (header row)" },
    { key: "sort_num_first", dflt: false, name: "Numbers are sorted before text" },
  ]
});

Setting.map = new Map(Setting.list.filter(s => s.key).map(s => [s.key, s]));
Setting.getDef = (key) => Setting.map.get(key);

export { Setting, stg };

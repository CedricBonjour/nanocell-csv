import { dom } from './dom.js';
import { StateManager } from './StateManager.js';
import { BoolInput } from './ui/input/BoolInput.js';
import { ListInput } from './ui/input/ListInput.js';
import { NumInput } from './ui/input/NumInput.js';

const stg = {};

// Immediate FOUC prevention theme initialization on module load
if (typeof document !== 'undefined') {
  try {
    let initialTheme = localStorage.getItem('theme');
    if (!initialTheme && window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
      initialTheme = 'night';
    }
    initialTheme = initialTheme || 'light';
    if (document.body) {
      document.body.setAttribute('data-theme', initialTheme);
    }
    if (document.documentElement) {
      document.documentElement.setAttribute('data-theme', initialTheme);
    }
  } catch (e) {
    console.warn("Initial theme application deferred:", e);
  }
}

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
    if (s.key == "theme" && stored_val === null && window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) this.value = "night";
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
    const row = document.createElement("div");
    row.classList.add("setting-row");

    const labelContainer = document.createElement("div");
    labelContainer.classList.add("setting-label-container");
    const name = document.createElement("span");
    name.classList.add("setting-name");
    name.innerHTML = setting.name;
    labelContainer.appendChild(name);

    const inputCell = document.createElement("div");
    inputCell.classList.add("setting-control");

    let input = undefined;
    if (setting.list) input = new ListInput(setting.list, setting.hide);
    else if (setting.max) {
      input = new NumInput(setting.dflt, setting.min, setting.max);
    } else if (typeof setting.dflt === "boolean") {
      input = new BoolInput();
    }

    if (input === undefined) {
      input = document.createElement("span");
      input.innerText = stg[setting.key];
    } else {
      input.value = stg[setting.key];
      input.onchange = e => {
        const c = e.target.value;
        stg[setting.key] = isNaN(c) ? c : Number(c);
      };
    }

    inputCell.appendChild(input);
    row.appendChild(labelContainer);
    row.appendChild(inputCell);
    return row;
  }

  static build(setting) {
    const row = document.createElement("tr");
    const name = document.createElement("td");
    if (setting.title) {
      const title = document.createElement("h3");
      title.innerHTML = setting.title;
      name.appendChild(title);
      row.appendChild(name);
      return row;
    }

    const inputCell = document.createElement("td");
    name.innerHTML = setting.name;
    let input = undefined;
    if (setting.list) input = new ListInput(setting.list, setting.hide);
    else if (setting.max) {
      input = new NumInput(setting.dflt, setting.min, setting.max);
    } else if (typeof setting.dflt === "boolean") {
      input = new BoolInput();
    }

    if (input === undefined) {
      input = document.createElement("span");
      input.innerText = stg[setting.key];
    } else {
      input.value = stg[setting.key];
      input.onchange = e => { const c = e.target.value; stg[setting.key] = isNaN(c) ? c : Number(c); };
    }
    inputCell.appendChild(input);
    row.appendChild(name);
    row.appendChild(inputCell);
    return row;
  }

  static show() {
    const content = document.createElement("div");
    content.classList.add("stg-container", "stg");

    const header = document.createElement("div");
    header.classList.add("stg-header");
    const title = document.createElement("h1");
    title.innerText = "Settings";
    header.appendChild(title);
    content.appendChild(header);

    const body = document.createElement("div");
    body.classList.add("stg-body");

    let currentSection = null;
    let sectionBody = null;

    for (const s of Setting.list) {
      if (s.title) {
        currentSection = document.createElement("div");
        currentSection.classList.add("settings-section");
        const sectionHeader = document.createElement("div");
        sectionHeader.classList.add("settings-section-header");
        const titleEl = document.createElement("h3");
        titleEl.innerText = s.title;
        sectionHeader.appendChild(titleEl);
        currentSection.appendChild(sectionHeader);

        sectionBody = document.createElement("div");
        sectionBody.classList.add("settings-section-body");
        currentSection.appendChild(sectionBody);
        body.appendChild(currentSection);
      } else if (sectionBody) {
        sectionBody.appendChild(Setting.buildRow(s));
      }
    }

    const footer = document.createElement("div");
    footer.classList.add("stg-footer");
    const b = document.createElement("button");
    b.classList.add("btn-reset-settings");
    b.innerText = "Reset to default settings";
    b.onclick = Setting.resetDefault;
    footer.appendChild(b);

    content.appendChild(body);
    content.appendChild(footer);
    dom.dialog.push(content, true);
  }

  static setTheme() {
    const themeName = stg.theme || 'light';
    if (dom?.body) {
      dom.body.setAttribute('data-theme', themeName);
    } else if (typeof document !== 'undefined' && document.body) {
      document.body.setAttribute('data-theme', themeName);
    }
    if (typeof document !== 'undefined' && document.documentElement) {
      document.documentElement.setAttribute('data-theme', themeName);
    }

    if (dom?.theme) dom.theme.href = "css/themes/" + themeName + ".css";
    if (dom?.palette) dom.palette.href = "css/palettes/" + themeName + ".css";
    StateManager.setState('theme', themeName);
    StateManager.emit('theme:changed', { theme: themeName });
  }

  static log() {
    for (let i = 0; i < localStorage.length; i++)
      console.log(localStorage.key(i), " >> ", (localStorage.getItem(localStorage.key(i))));
  }

  static runAll() {
    for (const s of Setting.list) if (s.key) stg[s.key] = stg[s.key];
  }

  static resetDefault() {
    for (const s of Setting.list) if (s.key) stg[s.key] = s.dflt;
    localStorage.clear();
    Setting.show();
  }
}

Object.defineProperty(Setting, 'list', {
  value: [
    { title: "Appearance" },
    { key: "theme", dflt: "light", name: "Theme", list: ["light", "dark", "solarized", "night", "nord", "dracula"], hide: true, cb: Setting.setTheme },
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

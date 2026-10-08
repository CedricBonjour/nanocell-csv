import { dom } from '../AppLayout.js';
import { setIcon } from '../../utils/icons.js';
import { BoolInput } from '../controls/BoolInput.js';
import { ListInput } from '../controls/ListInput.js';
import { NumInput } from '../controls/NumInput.js';
import { Setting, stg } from './Setting.js';

/**
 * Renders the modal settings dialog and individual configuration rows.
 */
export class SettingDialog {
  /**
   * Builds an individual setting row element with label and control input.
   * @param {Object} setting - Setting definition object from Setting.list.
   * @returns {HTMLDivElement}
   */
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

    if (input && typeof input.connectedCallback === 'function' && !input._initialized) {
      input.connectedCallback();
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

    row.addEventListener("focusin", () => {
      row.classList.add("active");
    });
    row.addEventListener("focusout", (e) => {
      if (!row.contains(e.relatedTarget)) {
        row.classList.remove("active");
      }
    });
    row.addEventListener("click", (e) => {
      if (input && typeof input.focus === "function" && !input.contains(e.target)) {
        input.focus();
      }
    });

    return row;
  }

  /**
   * Builds a table-row format setting element (legacy format compatibility).
   * @param {Object} setting - Setting definition object.
   * @returns {HTMLTableRowElement}
   */
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
      input.onchange = e => {
        const c = e.target.value;
        stg[setting.key] = isNaN(c) ? c : Number(c);
      };
    }
    inputCell.appendChild(input);
    row.appendChild(name);
    row.appendChild(inputCell);
    return row;
  }

  /**
   * Opens the settings dialog modal in dom.dialog.
   */
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
        sectionBody.appendChild(SettingDialog.buildRow(s));
      }
    }

    const footer = document.createElement("div");
    footer.classList.add("stg-footer");
    const b = document.createElement("button");
    b.className = "icon btn-reset-settings";
    b.type = "button";
    b.setAttribute("title", "Reset to default settings");
    b.setAttribute("aria-label", "Reset to default settings");
    setIcon(b, 'reset_settings');
    b.onclick = Setting.resetDefault;
    footer.appendChild(b);

    content.appendChild(body);
    content.appendChild(footer);

    dom.dialog.push(content, true);

    const firstInput = content.querySelector('.ui-list, .ui-num, .ui-bool-toggle');
    if (firstInput && typeof firstInput.focus === 'function') {
      setTimeout(() => {
        try {
          firstInput.focus();
        } catch (e) {
          console.debug?.("Focus error on settings open:", e);
        }
      }, 0);
    }
  }
}

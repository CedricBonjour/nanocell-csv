import { dom } from '../utils/dom.js';
import { setIcon } from '../utils/icons.js';
import { cmd, getCommandTooltip } from '../interaction/CommandRegistry.js';

/**
 * Builds and mounts action buttons in the top header toolbar.
 */
export function buildMenu() {
  const menuItems = [
    "new", "open", "save", "reloadFile", "",
    "undo", "redo", "fixTop", "sort", "sort_reverse", "transpose", "trim", "date", "date_checker", "integer", "decimal", "validate_headers", "validate_data",
    "", "find", "about", "settings", "shortcuts"
  ];

  function buildMenuItem(item) {
    if (item === "") {
      const spacer = document.createElement("div");
      spacer.className = "header-spacer grow";
      return dom.header.appendChild(spacer);
    }
    const c = cmd[item];
    const tooltip = getCommandTooltip(c, item);
    const icon = document.createElement("span");
    icon.className = "icon";
    icon.setAttribute("data-icon", item);
    setIcon(icon, item);
    icon.setAttribute("title", tooltip);
    icon.setAttribute("aria-label", tooltip);
    icon.setAttribute("role", "button");
    icon.addEventListener("click", function () {
      if (cmd[item]?.run) cmd[item].run();
    });
    dom.header.appendChild(icon);
  }

  for (const m of menuItems) buildMenuItem(m);
}

import { dom } from './AppLayout.js';
import { setIcon } from '../utils/icons.js';
import { cmd, getCommandTooltip } from '../interaction/CommandRegistry.js';
import { pwa } from '../utils/misc.js';
import { triggerAppInstall } from './Notification.js';

/**
 * Builds and mounts action buttons in the top header toolbar.
 */
export function buildMenu() {
  const menuItems = [
    "new", "open", "save", "reloadFile","undo", "redo","",
    "fixTop", "sort", "sort_reverse", "transpose", "trim", "date", "integer", "decimal", "validate_data",
     "filter", "find","", "about", "settings", "shortcuts"
  ];

  function buildMenuItem(item) {
    if (item === "") {
      const spacer = document.createElement("div");
      spacer.className = "header-spacer grow";
      return dom.header.appendChild(spacer);
    }
    const c = cmd[item];
    const tooltip = getCommandTooltip(c, item);
    const icon = document.createElement("button");
    icon.type = "button";
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

  function buildInstallButton() {
    const installBtn = document.createElement("button");
    installBtn.type = "button";
    installBtn.id = "menuInstallBtn";
    installBtn.className = "menu-install-btn";
    installBtn.setAttribute("title", "Install Desktop App");
    installBtn.setAttribute("aria-label", "Install Desktop App");
    installBtn.setAttribute("role", "button");

    installBtn.innerHTML = `
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
        <polyline points="7 10 12 15 17 10"></polyline>
        <line x1="12" y1="15" x2="12" y2="3"></line>
      </svg>
      <span>Install</span>
    `;

    installBtn.addEventListener("click", () => {
      triggerAppInstall();
    });

    pwa.subscribe((state) => {
      installBtn.style.display = state.canInstall ? 'inline-flex' : 'none';
    });

    dom.header.appendChild(installBtn);
  }

  for (const m of menuItems) buildMenuItem(m);
  buildInstallButton();
}

import { dom } from './AppLayout.js';
import { setIcon } from '../utils/icons.js';
import { cmd, getCommandTooltip } from '../interaction/CommandRegistry.js';
import { triggerInstallPrompt, isAppInstalledSync, isAppInstalled, markAppAsInstalled } from '../utils/misc.js';

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
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink:0;">
        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
        <polyline points="7 10 12 15 17 10"></polyline>
        <line x1="12" y1="15" x2="12" y2="3"></line>
      </svg>
      <span>Install</span>
    `;

    installBtn.style.cssText = `
      display: inline-flex;
      align-items: center;
      gap: 5px;
      height: 24px;
      padding: 0 10px;
      margin-left: 4px;
      background-color: #48a741;
      color: #ffffff;
      border: none;
      border-radius: 4px;
      font-family: var(--font-family-ui);
      font-size: 12px;
      font-weight: 600;
      cursor: pointer;
      user-select: none;
      line-height: 1;
      white-space: nowrap;
      flex-shrink: 0;
      box-shadow: 0 1px 2px rgba(0, 0, 0, 0.15);
      transition: background-color 0.15s ease, transform 0.05s ease;
    `;

    installBtn.addEventListener('mouseenter', () => {
      installBtn.style.backgroundColor = '#3c8e36';
    });
    installBtn.addEventListener('mouseleave', () => {
      installBtn.style.backgroundColor = '#48a741';
    });
    installBtn.addEventListener('mousedown', () => {
      installBtn.style.backgroundColor = '#32772d';
      installBtn.style.transform = 'translateY(1px)';
    });
    installBtn.addEventListener('mouseup', () => {
      installBtn.style.backgroundColor = '#3c8e36';
      installBtn.style.transform = 'none';
    });
    installBtn.addEventListener('focus', () => {
      installBtn.style.outline = '2px solid #2e7d32';
      installBtn.style.outlineOffset = '1px';
    });
    installBtn.addEventListener('blur', () => {
      installBtn.style.outline = 'none';
    });

    installBtn.addEventListener("click", () => {
      triggerInstallPrompt();
    });

    // Check if app is installed immediately (avoids UI flicker)
    if (isAppInstalledSync()) {
      installBtn.style.display = 'none';
    } else {
      // Check asynchronously if installed on OS via getInstalledRelatedApps()
      isAppInstalled().then((installed) => {
        if (installed) {
          installBtn.style.display = 'none';
        }
      });
    }

    if (typeof window !== 'undefined') {
      window.addEventListener('appinstalled', () => {
        markAppAsInstalled();
        installBtn.style.display = 'none';
      });
    }

    dom.header.appendChild(installBtn);
  }

  for (const m of menuItems) buildMenuItem(m);
  buildInstallButton();
}

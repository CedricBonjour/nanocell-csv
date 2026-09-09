import { describe, test, expect, beforeEach, vi } from 'vitest';
import { Setting, stg } from '../app/js/Setting.js';
import { build_dom, dom } from '../app/js/dom.js';
import { StateManager } from '../app/js/StateManager.js';
import { cmd, buildMenu, getCommandTooltip } from '../app/js/cmd.js';
import '../app/js/ui/CommandPalette.js';

describe('Theming & UI Settings Operations', () => {
  beforeEach(() => {
    localStorage.clear();
    StateManager.clear();
    document.body.innerHTML = `
      <link rel="stylesheet" href="css/palettes/light.css" id="palette">
      <link rel="stylesheet" href="css/themes/light.css" id="theme">
      <header id="header"></header>
      <div id="content" class="flexMain"></div>
      <footer>
        <section id="footer">
          <section id="footerLeft">Left</section>
          <section id="footerCenter" class="flexMain">Center</section>
          <section id="footerRight">Right</section>
          <img id="lock" src="icn/edit.svg" alt="editing file">
        </section>
      </footer>
      <section id="dialog" class="scroll"></section>
    `;
    build_dom();
    Setting.init();
  });

  // Tier 1: Feature Coverage
  test('Setting.init initializes all settings into stg proxy object', () => {
    expect(stg.theme).toBeDefined();
    expect(stg.font).toBe(13);
    expect(stg.rows).toBe(25);
    expect(stg.cols).toBe(7);
  });

  test('Updating stg.theme modifies theme stylesheet href and persists in localStorage', () => {
    stg.theme = 'night';
    expect(localStorage.getItem('theme')).toBe('night');
    expect(dom.theme.href).toContain('css/themes/night.css');
    expect(dom.palette.href).toContain('css/palettes/night.css');
  });

  test('Updating stg.font changes document body font size', () => {
    stg.font = 16;
    expect(localStorage.getItem('font')).toBe('16');
    expect(dom.body.style.fontSize).toBe('16px');
  });

  test('Setting.resetDefault clears localStorage and restores default values', () => {
    stg.theme = 'dark';
    stg.font = 20;
    stg.delimiter = ';';

    Setting.resetDefault();
    expect(localStorage.getItem('theme')).toBeNull();
    expect(stg.theme).toBe('light');
    expect(stg.font).toBe(13);
    expect(stg.delimiter).toBe(',');
  });

  test('Setting.build creates table row DOM elements for settings UI', () => {
    const themeSetting = Setting.list.find((s) => s.key === 'theme');
    const row = Setting.build(themeSetting);

    expect(row.tagName.toLowerCase()).toBe('tr');
    expect(row.children.length).toBe(2);
    expect(row.children[0].innerHTML).toBe('Theme');
  });

  // Tier 2: Boundary & Corner Cases
  test('Theme switching updates document data-theme attribute cleanly', () => {
    document.body.setAttribute('data-theme', stg.theme);
    expect(document.body.getAttribute('data-theme')).toBe('light');

    stg.theme = 'dark';
    document.body.setAttribute('data-theme', stg.theme);
    expect(document.body.getAttribute('data-theme')).toBe('dark');
  });

  test('Setting loads stored numerical values correctly from localStorage', () => {
    localStorage.setItem('font', '18');
    Setting.init();
    expect(stg.font).toBe(18);
  });

  test('Setting loads stored boolean values correctly from localStorage', () => {
    localStorage.setItem('save_strict', 'true');
    Setting.init();
    expect(stg.save_strict).toBe(true);
  });

  test('Setting.runAll triggers callbacks for all active setting keys', () => {
    stg.theme = 'night';
    stg.font = 18;

    Setting.runAll();
    expect(dom.theme.href).toContain('night.css');
    expect(dom.body.style.fontSize).toBe('18px');
  });

  // Tier 3: Cross-Feature Combinations
  test('Setting.show pushes settings dialog into dom.dialog container', () => {
    Setting.show();
    expect(dom.dialog.children.length).toBeGreaterThan(0);
    expect(dom.dialog.querySelector('h1').innerText).toBe('Settings');
  });

  test('Settings pane close button (#closeDialog) has pointer-events: auto and closes dialog on click', () => {
    Setting.show();
    expect(dom.dialog.children.length).toBeGreaterThan(0);
    const closeBtn = dom.dialog.querySelector('#closeDialog');
    expect(closeBtn).not.toBeNull();
    expect(closeBtn.style.pointerEvents).toBe('auto');
    expect(closeBtn.style.cursor).toBe('pointer');

    closeBtn.click();
    expect(dom.dialog.children.length).toBe(0);
  });

  test('Setting.setTheme automatically updates data-theme attribute on document.body and documentElement', () => {
    stg.theme = 'night';
    expect(document.body.getAttribute('data-theme')).toBe('night');
    expect(document.documentElement.getAttribute('data-theme')).toBe('night');

    stg.theme = 'dark';
    expect(document.body.getAttribute('data-theme')).toBe('dark');
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
  });

  test('Setting.init applies stored theme from localStorage to data-theme attribute immediately', () => {
    localStorage.setItem('theme', 'night');
    Setting.init();
    expect(stg.theme).toBe('night');
    expect(document.body.getAttribute('data-theme')).toBe('night');
  });

  // Pub/Sub Event Emission (StateManager)
  test('Updating stg.theme emits theme:changed event via StateManager', () => {
    const callback = vi.fn();
    StateManager.on('theme:changed', callback);

    stg.theme = 'night';
    expect(callback).toHaveBeenCalledTimes(1);
    expect(callback).toHaveBeenCalledWith({ theme: 'night' });
  });

  test('Invoking Setting.setTheme emits theme:changed event via StateManager', () => {
    stg.theme = 'dark';
    const callback = vi.fn();
    StateManager.on('theme:changed', callback);

    Setting.setTheme();
    expect(callback).toHaveBeenCalledTimes(1);
    expect(callback).toHaveBeenCalledWith({ theme: 'dark' });
  });

  test('Subscribing to StateManager theme:changed listener receives new theme name payload on theme changes', () => {
    const receivedThemes = [];
    const unsubscribe = StateManager.on('theme:changed', (data) => {
      receivedThemes.push(data.theme);
    });

    stg.theme = 'night';
    stg.theme = 'dark';
    stg.theme = 'light';

    expect(receivedThemes).toEqual(['night', 'dark', 'light']);

    unsubscribe();
    stg.theme = 'night';
    expect(receivedThemes).toEqual(['night', 'dark', 'light']);
  });

  test('Footer icons do not have hover effect and style.css excludes footer img:hover', async () => {
    const fs = await import('fs');
    const path = await import('path');
    const cssContent = fs.readFileSync(path.resolve(__dirname, '../app/style.css'), 'utf-8');

    // Ensure footer img is not in the clickable header/menu hover group
    expect(cssContent).not.toMatch(/#menu\s+img:hover\s*,\s*footer\s+img:hover/);
    expect(cssContent).toMatch(/footer\s+img\s*\{[^}]*pointer-events:\s*none/);
    expect(cssContent).toMatch(/footer\s+img:hover[\s\S]*?transform:\s*none/);
  });

  test('Icons default color matches table header text color across all themes', async () => {
    const fs = await import('fs');
    const path = await import('path');
    const cssContent = fs.readFileSync(path.resolve(__dirname, '../app/style.css'), 'utf-8');

    // Verify each theme defines clean hex --icon-color and --icon-hover-color
    expect(cssContent).toMatch(/\[data-theme="light"\][\s\S]*?--icon-color:\s*#616161;/);
    expect(cssContent).toMatch(/\[data-theme="solarized"\][\s\S]*?--icon-color:\s*#93a1a1;/);
    expect(cssContent).toMatch(/body\[data-theme="dark"\][\s\S]*?--icon-color:\s*#858585;/);
    expect(cssContent).toMatch(/\[data-theme="night"\][\s\S]*?--icon-color:\s*#858585;/);
    expect(cssContent).toMatch(/\[data-theme="nord"\][\s\S]*?--icon-color:\s*#d8dee9;/);
    expect(cssContent).toMatch(/\[data-theme="dracula"\][\s\S]*?--icon-color:\s*#6272a4;/);
  });

  test('CSS mask-image system uses --icon-color defaulting to #000000', async () => {
    const fs = await import('fs');
    const path = await import('path');
    const cssContent = fs.readFileSync(path.resolve(__dirname, '../app/style.css'), 'utf-8');

    expect(cssContent).toMatch(/\.icon::before\s*\{[^}]*mask-image:\s*var\(--icon-url\);/);
    expect(cssContent).toMatch(/\.icon::before\s*\{[^}]*background-color:\s*var\(--icon-color,\s*#000000\);/);
  });

  test('Header and menu icons suppress text selection and caret cursor during navigation', async () => {
    const fs = await import('fs');
    const path = await import('path');
    const cssContent = fs.readFileSync(path.resolve(__dirname, '../app/style.css'), 'utf-8');

    // Verify header, menu and icon suppress caret and user selection
    expect(cssContent).toMatch(/header\s*\{[\s\S]*?caret-color:\s*transparent;/);
    expect(cssContent).toMatch(/#menu\s*\{[\s\S]*?caret-color:\s*transparent;/);
    expect(cssContent).toMatch(/\.icon\s*\{[\s\S]*?caret-color:\s*transparent;/);
    expect(cssContent).toMatch(/\.icon\s*\{[\s\S]*?user-select:\s*none;/);
  });

  test('#closeDialog has pointer-events: auto !important and cursor: pointer in style.css', async () => {
    const fs = await import('fs');
    const path = await import('path');
    const cssContent = fs.readFileSync(path.resolve(__dirname, '../app/style.css'), 'utf-8');

    expect(cssContent).toMatch(/#closeDialog\s*\{[^}]*pointer-events:\s*auto\s*!important;/);
    expect(cssContent).toMatch(/#closeDialog\s*\{[^}]*cursor:\s*pointer\s*!important;/);
  });

  test('Footer lock element updates --icon-url on src property changes', () => {
    const lock = dom.footerDiv.lock;
    expect(lock).toBeDefined();
    lock.src = 'lock';
    expect(lock.style.getPropertyValue('--icon-url')).toContain('data:image/svg+xml');
    const lockUrl = lock.style.getPropertyValue('--icon-url');
    lock.src = 'edit';
    expect(lock.style.getPropertyValue('--icon-url')).toContain('data:image/svg+xml');
    expect(lock.style.getPropertyValue('--icon-url')).not.toBe(lockUrl);
  });

  test('buildMenu populates header with user-friendly tooltips and keyboard shortcuts', () => {
    buildMenu();
    const icons = dom.header.querySelectorAll('.icon');
    expect(icons.length).toBeGreaterThan(15);

    // Verify first icon is 'New Sheet' with shortcut
    const newIcon = icons[0];
    expect(newIcon.getAttribute('title')).toContain('New Sheet');
    expect(newIcon.getAttribute('title')).toContain('N');

    // Verify 'Freeze Header Row' icon has readable title and shortcut
    const fixTopIcon = Array.from(icons).find(el => el.getAttribute('data-icon') === 'fixTop');
    expect(fixTopIcon).toBeDefined();
    expect(fixTopIcon.getAttribute('title')).toContain('Freeze Header Row');
    expect(fixTopIcon.getAttribute('title')).toContain('B');

    // Verify 'Reload File'
    const reloadIcon = Array.from(icons).find(el => el.getAttribute('data-icon') === 'reloadFile');
    expect(reloadIcon).toBeDefined();
    expect(reloadIcon.getAttribute('title')).toContain('Reload File');
    expect(reloadIcon.getAttribute('title')).toContain('R');
  });

  test('getCommandTooltip generates readable names and handles shortcut modifiers correctly', () => {
    expect(getCommandTooltip(cmd.undo)).toMatch(/Undo \((Ctrl\+|⌘)Z\)/);
    expect(getCommandTooltip(cmd.redo)).toMatch(/Redo \((Ctrl\+|⌘)Shift\+Z\)/);
    expect(getCommandTooltip(cmd.fixTop)).toMatch(/Freeze Header Row \((Ctrl\+|⌘)B\)/);
    expect(getCommandTooltip(cmd.sort_reverse)).toMatch(/Sort Descending \((Ctrl\+|⌘)Shift\+L\)/);
    expect(getCommandTooltip(null, 'fallback')).toBe('fallback');
  });

  test('Menu and lock icons resolve to inlined data URIs to prevent mask 404s', () => {
    buildMenu();
    const icons = dom.header.querySelectorAll('.icon');
    const undoIcon = Array.from(icons).find(el => el.getAttribute('data-icon') === 'undo');
    expect(undoIcon).toBeDefined();
    expect(undoIcon.style.getPropertyValue('--icon-url')).toMatch(/^url\("data:image\/svg\+xml/);
  });

  test('All icons throughout the app share standard --icon-size and footer lock has spacing', async () => {
    const fs = await import('fs');
    const path = await import('path');
    const cssContent = fs.readFileSync(path.resolve(__dirname, '../app/style.css'), 'utf-8');

    expect(cssContent).toMatch(/--icon-size:\s*1\.25em;/);
    expect(cssContent).toMatch(/\.icon\s*\{[^}]*height:\s*var\(--icon-size,\s*1\.25em\);/);
    expect(cssContent).toMatch(/#footer\s+\.icon[\s\S]*?margin:\s*0\s+0\.3em\s+0\s+0\.8em;/);
    expect(cssContent).toMatch(/#closeDialog\s*\{[^}]*height:\s*var\(--icon-size,\s*1\.25em\);/);
  });

  test('CommandPalette close button uses off.svg icon with proper accessibility', () => {
    const palette = document.createElement('ui-command-palette');
    document.body.appendChild(palette);
    palette.connectedCallback();

    const closeBtn = palette.querySelector('.cmd_palette_close');
    expect(closeBtn).not.toBeNull();
    expect(closeBtn.classList.contains('icon')).toBe(true);
    expect(closeBtn.style.getPropertyValue('--icon-url')).toContain('data:image/svg+xml');
    expect(closeBtn.getAttribute('role')).toBe('button');
    expect(closeBtn.getAttribute('aria-label')).toBe('Close');
  });

  test('CommandPalette list items update selection on mouseenter and keyboard navigation without blocking inline styles', () => {
    const palette = document.createElement('ui-command-palette');
    document.body.appendChild(palette);
    palette.connectedCallback();
    palette.open();

    const items = palette.querySelectorAll('.cmd_palette_item');
    expect(items.length).toBeGreaterThan(1);

    // Initial state: first item selected
    expect(items[0].classList.contains('selected')).toBe(true);
    expect(items[0].getAttribute('aria-selected')).toBe('true');
    // Ensure no hardcoded inline background color overrides CSS :hover
    expect(items[0].style.backgroundColor).toBe('');

    // Hover over second item
    items[1].dispatchEvent(new MouseEvent('mouseenter', { bubbles: true }));
    expect(items[0].classList.contains('selected')).toBe(false);
    expect(items[0].getAttribute('aria-selected')).toBe('false');
    expect(items[1].classList.contains('selected')).toBe(true);
    expect(items[1].getAttribute('aria-selected')).toBe('true');

    // Hover back over first item
    items[0].dispatchEvent(new MouseEvent('mouseenter', { bubbles: true }));
    expect(items[0].classList.contains('selected')).toBe(true);
    expect(items[0].getAttribute('aria-selected')).toBe('true');
    expect(items[1].classList.contains('selected')).toBe(false);

    // Keyboard navigation (ArrowDown)
    const input = palette.querySelector('input');
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
    expect(items[1].classList.contains('selected')).toBe(true);
    expect(items[0].classList.contains('selected')).toBe(false);
  });

  test('Modal dialogs (.dialog_large, #dialog) have higher z-index than ui-finder in style.css', async () => {
    const fs = await import('fs');
    const path = await import('path');
    const cssContent = fs.readFileSync(path.resolve(__dirname, '../app/style.css'), 'utf-8');

    const dialogLargeMatch = cssContent.match(/\.dialog_large\s*\{[^}]*z-index:\s*(\d+);/);
    const finderMatch = cssContent.match(/ui-finder\s*\{[^}]*z-index:\s*(\d+);/);
    const dialogIdMatch = cssContent.match(/#dialog\s*\{[^}]*z-index:\s*(\d+);/);

    expect(dialogLargeMatch).not.toBeNull();
    expect(finderMatch).not.toBeNull();
    expect(dialogIdMatch).not.toBeNull();

    const dialogLargeZ = parseInt(dialogLargeMatch[1], 10);
    const finderZ = parseInt(finderMatch[1], 10);
    const dialogIdZ = parseInt(dialogIdMatch[1], 10);

    expect(dialogLargeZ).toBeGreaterThan(finderZ);
    expect(dialogIdZ).toBeGreaterThan(finderZ);
  });

  test('Opening About or Settings dialog dismisses active finder widget so it does not stay above', async () => {
    const { Finder } = await import('../app/js/Finder.js');
    const { About } = await import('../app/js/About.js');

    const finder = new Finder();
    document.body.appendChild(finder);
    finder.show();
    expect(finder.classList.contains('visible')).toBe(true);
    expect(finder.style.display).toBe('block');

    // Opening About dialog pushes to dom.dialog
    About.show();
    expect(dom.dialog.children.length).toBeGreaterThan(0);
    expect(finder.classList.contains('visible')).toBe(false);
    expect(finder.style.display).toBe('none');

    // Showing finder again, then opening Settings dialog
    finder.show();
    expect(finder.classList.contains('visible')).toBe(true);
    Setting.show();
    expect(dom.dialog.children.length).toBeGreaterThan(0);
    expect(finder.classList.contains('visible')).toBe(false);
    expect(finder.style.display).toBe('none');
  });
});

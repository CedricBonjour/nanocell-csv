import { describe, test, expect, beforeEach, vi } from 'vitest';
import { Setting, stg } from '../app/js/Setting.js';
import { build_dom, dom } from '../app/js/dom.js';
import { StateManager } from '../app/js/StateManager.js';

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
    const cssContent = fs.readFileSync(path.resolve(__dirname, '../app/css/style.css'), 'utf-8');

    // Ensure footer img is not in the clickable header/menu hover group
    expect(cssContent).not.toMatch(/#menu\s+img:hover\s*,\s*footer\s+img:hover/);
    expect(cssContent).toMatch(/footer\s+img\s*\{[^}]*pointer-events:\s*none/);
    expect(cssContent).toMatch(/footer\s+img:hover[\s\S]*?transform:\s*none/);
  });

  test('Footer text and space dots use inherit/var(--fh-txt) to prevent color shifting on cell selection', async () => {
    const fs = await import('fs');
    const path = await import('path');
    const cssContent = fs.readFileSync(path.resolve(__dirname, '../app/css/style.css'), 'utf-8');

    // Ensure all themes define --dots as inherit rather than var(--active)
    const dotMatches = [...cssContent.matchAll(/--dots:\s*([^;]+);/g)];
    expect(dotMatches.length).toBeGreaterThanOrEqual(6);
    dotMatches.forEach((m) => {
      expect(m[1].trim()).toBe('inherit');
    });

    // Ensure footer elements are styled with var(--fh-txt)
    expect(cssContent).toMatch(/#footer,\s*#footerLeft,\s*#footerCenter,\s*#footerRight\s*\{[^}]*color:\s*var\(--fh-txt\)/);
  });

  test('Icons default color matches table header text color across all themes', async () => {
    const fs = await import('fs');
    const path = await import('path');
    const cssContent = fs.readFileSync(path.resolve(__dirname, '../app/css/style.css'), 'utf-8');

    // Verify each theme defines calibrated --icon-filter for table header color
    expect(cssContent).toMatch(/\[data-theme="light"\][\s\S]*?--icon-filter:\s*brightness\(0\)\s*saturate\(100%\)\s*invert\(38%\)/);
    expect(cssContent).toMatch(/\[data-theme="solarized"\][\s\S]*?--icon-filter:\s*brightness\(0\)\s*saturate\(100%\)\s*invert\(69%\)/);
    expect(cssContent).toMatch(/body\[data-theme="dark"\][\s\S]*?--icon-filter:\s*brightness\(0\)\s*saturate\(100%\)\s*invert\(53%\)/);
    expect(cssContent).toMatch(/\[data-theme="night"\][\s\S]*?--icon-filter:\s*brightness\(0\)\s*saturate\(100%\)\s*invert\(53%\)/);
    expect(cssContent).toMatch(/\[data-theme="nord"\][\s\S]*?--icon-filter:\s*brightness\(0\)\s*saturate\(100%\)\s*invert\(77%\)/);
    expect(cssContent).toMatch(/\[data-theme="dracula"\][\s\S]*?--icon-filter:\s*brightness\(0\)\s*saturate\(100%\)\s*invert\(49%\)/);
  });

  test('Header and menu icons suppress text selection and caret cursor during navigation', async () => {
    const fs = await import('fs');
    const path = await import('path');
    const cssContent = fs.readFileSync(path.resolve(__dirname, '../app/css/style.css'), 'utf-8');

    // Verify header, menu and img suppress caret and user selection
    expect(cssContent).toMatch(/header\s*\{[\s\S]*?caret-color:\s*transparent;/);
    expect(cssContent).toMatch(/#menu\s*\{[\s\S]*?caret-color:\s*transparent;/);
    expect(cssContent).toMatch(/img\s*\{[\s\S]*?caret-color:\s*transparent;/);
    expect(cssContent).toMatch(/img\s*\{[\s\S]*?user-select:\s*none;/);
  });

  test('#closeDialog has pointer-events: auto !important and cursor: pointer in style.css', async () => {
    const fs = await import('fs');
    const path = await import('path');
    const cssContent = fs.readFileSync(path.resolve(__dirname, '../app/css/style.css'), 'utf-8');

    expect(cssContent).toMatch(/#closeDialog\s*\{[^}]*pointer-events:\s*auto\s*!important;/);
    expect(cssContent).toMatch(/#closeDialog\s*\{[^}]*cursor:\s*pointer\s*!important;/);
  });
});

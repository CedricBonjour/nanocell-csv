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
        <section id="dialog" class="scroll"></section>
        <section id="footer">
          <section id="footerLeft">Left</section>
          <section id="footerCenter" class="flexMain">Center</section>
          <section id="footerRight">Right</section>
          <img id="lock" src="icn/edit.svg" alt="editing file">
        </section>
      </footer>
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
});

import { describe, test, expect, beforeEach } from 'vitest';
import { Setting, stg } from '../app/js/Setting.js';
import { StateManager } from '../app/js/StateManager.js';
import { build_dom, dom } from '../app/js/dom.js';

describe('Milestone 4 Empirical Theme Stress & State Consistency Suite', () => {
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

  test('1,000 rapid theme toggles between light, dark, night, and fallback themes', () => {
    const validThemes = ['light', 'dark', 'night'];
    const invalidThemes = ['invalid_theme', '', null, undefined, 123, false, 'custom_theme'];
    const allThemes = [...validThemes, ...invalidThemes];

    let themeChangedCount = 0;
    let stateThemeCount = 0;
    let lastThemeChangedPayload = null;
    let lastStateThemePayload = null;

    StateManager.on('theme:changed', (payload) => {
      themeChangedCount++;
      lastThemeChangedPayload = payload;
    });

    StateManager.on('state:theme', (payload) => {
      stateThemeCount++;
      lastStateThemePayload = payload;
    });

    const ITERATIONS = 1000;
    const startTime = Date.now();

    for (let i = 0; i < ITERATIONS; i++) {
      const targetInput = allThemes[i % allThemes.length];

      // Set the theme via stg proxy
      stg.theme = targetInput;

      // Determine expected themeName applied by Setting.setTheme
      // Setting.setTheme converts falsy stg.theme ('' / null / undefined / false) to 'light'
      const expectedTheme = targetInput || 'light';

      // 1. Assert DOM document.body attribute synchronization
      const bodyTheme = document.body.getAttribute('data-theme');
      expect(bodyTheme).toBe(String(expectedTheme));

      // 2. Assert DOM documentElement attribute synchronization
      const docTheme = document.documentElement.getAttribute('data-theme');
      expect(docTheme).toBe(String(expectedTheme));

      // 3. Assert StateManager internal state synchronization
      const smTheme = StateManager.getState('theme');
      expect(smTheme).toBe(expectedTheme);

      // 4. Assert DOM stylesheet href updates when dom objects are present
      if (dom && dom.theme) {
        expect(dom.theme.href).toContain(`css/themes/${expectedTheme}.css`);
      }
      if (dom && dom.palette) {
        expect(dom.palette.href).toContain(`css/palettes/${expectedTheme}.css`);
      }

      // 5. Assert Pub/Sub event payload consistency
      expect(lastThemeChangedPayload).toEqual({ theme: expectedTheme });
      expect(lastStateThemePayload).toEqual({
        key: 'theme',
        value: expectedTheme,
        oldValue: expect.anything()
      });
    }

    const duration = Date.now() - startTime;

    // 6. Verify total event dispatch counts
    expect(themeChangedCount).toBe(ITERATIONS);
    expect(stateThemeCount).toBe(ITERATIONS);

    // 7. Verify performance threshold (1,000 rapid theme switches under 5,000 ms threshold)
    expect(duration).toBeLessThan(5000);
  });

  test('Pub/Sub listener lifecycle and memory leak prevention during rapid theme toggling', () => {
    const unsubscribers = [];
    let activeCallCount = 0;

    // Register 500 dynamic subscribers
    for (let i = 0; i < 500; i++) {
      const unsub = StateManager.on('theme:changed', () => {
        activeCallCount++;
      });
      unsubscribers.push(unsub);
    }

    // Toggle theme 50 times with 500 subscribers active
    for (let i = 0; i < 50; i++) {
      stg.theme = i % 2 === 0 ? 'dark' : 'night';
    }

    expect(activeCallCount).toBe(500 * 50);

    // Clean up all 500 subscribers
    unsubscribers.forEach((unsub) => unsub());

    // Toggle theme again and verify no lingering listener executions
    activeCallCount = 0;
    stg.theme = 'light';
    expect(activeCallCount).toBe(0);

    // Verify instance listener cleanup using a custom StateManager instance
    const instanceSM = new StateManager();
    const instUnsubs = [];
    let instCalls = 0;
    for (let i = 0; i < 100; i++) {
      instUnsubs.push(instanceSM.on('test:evt', () => instCalls++));
    }
    expect(instanceSM.listeners.get('test:evt').size).toBe(100);

    instUnsubs.forEach((unsub) => unsub());
    expect(instanceSM.listeners.get('test:evt').size).toBe(0);
  });

  test('DOM state synchronization with invalid and fallback theme values', () => {
    // Test falsy fallbacks
    stg.theme = null;
    expect(document.body.getAttribute('data-theme')).toBe('light');
    expect(StateManager.getState('theme')).toBe('light');

    stg.theme = undefined;
    expect(document.body.getAttribute('data-theme')).toBe('light');
    expect(StateManager.getState('theme')).toBe('light');

    stg.theme = '';
    expect(document.body.getAttribute('data-theme')).toBe('light');
    expect(StateManager.getState('theme')).toBe('light');

    // Test valid theme switches after fallback
    stg.theme = 'dark';
    expect(document.body.getAttribute('data-theme')).toBe('dark');
    expect(StateManager.getState('theme')).toBe('dark');

    stg.theme = 'night';
    expect(document.body.getAttribute('data-theme')).toBe('night');
    expect(StateManager.getState('theme')).toBe('night');
  });

  test('LocalStorage persistence synchronization during rapid switching', () => {
    const themes = ['light', 'dark', 'night', 'light'];
    for (const t of themes) {
      stg.theme = t;
      expect(localStorage.getItem('theme')).toBe(t);
    }
  });
});

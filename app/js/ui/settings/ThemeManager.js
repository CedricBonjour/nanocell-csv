import { dom } from '../AppLayout.js';
import { StateManager } from '../../StateManager.js';

/**
 * Manages active application CSS theme stylesheets and prefers-color-scheme detection.
 */
export class ThemeManager {
  /**
   * Applies the initial theme immediately to prevent Flash of Unstyled Content (FOUC).
   */
  static initTheme() {
    if (typeof document === 'undefined') return;
    try {
      let initialTheme = localStorage.getItem('theme');
      if (!initialTheme && window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
        initialTheme = 'nord';
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

  /**
   * Sets and applies the active CSS theme.
   * Updates data-theme attributes, theme stylesheet hrefs, and emits theme:changed.
   * @param {string} [themeName] - Theme identifier ('nord', 'light', 'dark', etc.).
   */
  static setTheme(themeName) {
    const activeTheme = themeName || (typeof globalThis !== 'undefined' && globalThis.stg?.theme) || 'light';
    if (dom?.body) {
      dom.body.setAttribute('data-theme', activeTheme);
    } else if (typeof document !== 'undefined' && document.body) {
      document.body.setAttribute('data-theme', activeTheme);
    }
    if (typeof document !== 'undefined' && document.documentElement) {
      document.documentElement.setAttribute('data-theme', activeTheme);
    }

    if (dom?.theme) dom.theme.href = "css/themes/" + activeTheme + ".css";
    if (dom?.palette) dom.palette.href = "css/palettes/" + activeTheme + ".css";
    StateManager.setState('theme', activeTheme);
    StateManager.emit('theme:changed', { theme: activeTheme });
  }
}

// Immediate theme execution on module load
ThemeManager.initTheme();

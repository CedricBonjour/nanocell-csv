import { setIcon } from '../../utils/icons.js';

export function getNextPow2(v) {
  if (v < 1) return 1;
  const p = Math.floor(Math.log2(v));
  const candidate = Math.pow(2, p);
  return candidate > v ? candidate : Math.pow(2, p + 1);
}

export function getPrevPow2(v) {
  if (v <= 1) return 1;
  const p = Math.ceil(Math.log2(v));
  const candidate = Math.pow(2, p);
  if (candidate < v) return candidate;
  return Math.pow(2, p - 1);
}

/**
 * Formats a number to have a space every 1,000 (1k) factor for readability.
 * E.g., 1024 -> "1 024", 16384 -> "16 384", 1048576 -> "1 048 576".
 * Preserves decimals if present: 1024.5 -> "1 024.5".
 * Safely strips existing whitespace before parsing.
 *
 * @param {number|string} v - The value to format.
 * @returns {string} Formatted number string with space thousand separators.
 */
export function formatThousands(v) {
  if (v === null || v === undefined || v === '') return '';
  const str = typeof v === 'string' ? v.replace(/\s+/g, '') : String(v);
  const n = Number(str);
  if (!Number.isFinite(n)) return String(v);
  const parts = str.split('.');
  parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  return parts.join('.');
}

const BaseElement = typeof HTMLElement !== 'undefined' ? HTMLElement : class {};

class NumInput extends BaseElement {
  constructor(start = 0, min = 0, max = 999, stepMode = 'linear') {
    super();
    let initial = start;
    if (typeof initial === 'string') {
      initial = initial.replace(/\s+/g, '');
    }
    this.n = Number(initial);
    if (isNaN(this.n)) this.n = 0;
    this.min = min;
    this.max = max;
    this.stepMode = stepMode;
    if (typeof document !== 'undefined') {
      this.classList?.add("ui-num");
      this.left = document.createElement("button");
      this.left.className = "icon";
      this.left.type = "button";
      this.left.setAttribute("aria-label", "Decrease");
      this.left.setAttribute("title", "Decrease");
      this.left.setAttribute("tabindex", "-1");
      setIcon(this.left, 'remove');

      this.center = document.createElement("section");
      this.center.innerHTML = formatThousands(this.n);

      this.right = document.createElement("button");
      this.right.className = "icon";
      this.right.type = "button";
      this.right.setAttribute("aria-label", "Increase");
      this.right.setAttribute("title", "Increase");
      this.right.setAttribute("tabindex", "-1");
      setIcon(this.right, 'add');
    }
  }

  updateButtonStates() {
    if (this.left) this.left.disabled = (this.n <= this.min);
    if (this.right) this.right.disabled = (this.n >= this.max);
  }

  stepValue(direction = 1) {
    if (this.stepMode === 'pow2') {
      const nextVal = direction > 0 ? getNextPow2(this.n) : getPrevPow2(this.n);
      this.setValueInternal(nextVal, true);
    } else {
      this.setValueInternal(this.value + direction, true);
    }
  }

  connectedCallback() {
    if (this._initialized) return;
    this._initialized = true;

    this.appendChild(this.left);
    this.appendChild(this.center);
    this.appendChild(this.right);
    this.left.addEventListener("click", () => { this.stepValue(-1); });
    this.right.addEventListener("click", () => { this.stepValue(1); });
    this.setAttribute('tabindex', '0');
    this.addEventListener("click", () => { this.focus(); });
    this.addEventListener("keydown", e => {
      const k = e.key.toUpperCase();
      if (k === "ARROWRIGHT") {
        e.preventDefault();
        this.stepValue(1);
      } else if (k === "ARROWLEFT") {
        e.preventDefault();
        this.stepValue(-1);
      }
    });
    this.updateButtonStates();
  }

  get min() { return this._min !== undefined ? this._min : 0; }
  set min(v) {
    this._min = Number(v);
    this.updateButtonStates();
  }

  get max() { return this._max !== undefined ? this._max : 999; }
  set max(v) {
    this._max = Number(v);
    this.updateButtonStates();
  }

  get value() { return this.n; }

  set value(n) {
    this.setValueInternal(n, false);
  }

  setValueInternal(n, isUserAction = false) {
    if (typeof n === 'string') {
      n = n.replace(/\s+/g, '');
    }
    n = Number(n);
    if (n < this.min) n = this.min;
    if (n > this.max) n = this.max;
    this.n = n;
    if (this.center) this.center.innerHTML = formatThousands(this.n);
    this.updateButtonStates();

    if (isUserAction && typeof Event !== 'undefined' && typeof this.dispatchEvent === 'function') {
      const e = new Event("change", { bubbles: true });
      this.dispatchEvent(e);
    }
  }
}

if (typeof customElements !== 'undefined' && !customElements.get('ui-num')) {
  customElements.define('ui-num', NumInput);
}

export { NumInput };

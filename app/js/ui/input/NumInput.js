import { setIcon } from '../../icons.js';

class NumInput extends HTMLElement {
  constructor(start = 0, min = 0, max = 999) {
    super();
    this.n = start;
    this.min = min;
    this.max = max;
    this.classList.add("ui-num");
    this.left = document.createElement("button");
    this.left.className = "icon";
    this.left.type = "button";
    this.left.setAttribute("aria-label", "Decrease");
    this.left.setAttribute("title", "Decrease");
    this.left.setAttribute("tabindex", "-1");
    setIcon(this.left, 'remove');

    this.center = document.createElement("section");
    this.center.innerHTML = this.n;

    this.right = document.createElement("button");
    this.right.className = "icon";
    this.right.type = "button";
    this.right.setAttribute("aria-label", "Increase");
    this.right.setAttribute("title", "Increase");
    this.right.setAttribute("tabindex", "-1");
    setIcon(this.right, 'add');
  }

  updateButtonStates() {
    if (this.left) this.left.disabled = (this.n <= this.min);
    if (this.right) this.right.disabled = (this.n >= this.max);
  }

  connectedCallback() {
    if (this._initialized) return;
    this._initialized = true;

    this.appendChild(this.left);
    this.appendChild(this.center);
    this.appendChild(this.right);
    this.left.addEventListener("click", () => { this.setValueInternal(this.value - 1, true); });
    this.right.addEventListener("click", () => { this.setValueInternal(this.value + 1, true); });
    this.setAttribute('tabindex', '0');
    this.addEventListener("click", () => { this.focus(); });
    this.addEventListener("keydown", e => {
      const k = e.key.toUpperCase();
      if (k === "ARROWRIGHT") {
        e.preventDefault();
        this.setValueInternal(this.value + 1, true);
      } else if (k === "ARROWLEFT") {
        e.preventDefault();
        this.setValueInternal(this.value - 1, true);
      }
    });
    this.updateButtonStates();
  }

  get value() { return this.n; }

  set value(n) {
    this.setValueInternal(n, false);
  }

  setValueInternal(n, isUserAction = false) {
    n = Number(n);
    if (n < this.min) n = this.min;
    if (n > this.max) n = this.max;
    this.n = n;
    this.center.innerHTML = this.n;
    this.updateButtonStates();

    if (isUserAction) {
      const e = new Event("change", { bubbles: true });
      this.dispatchEvent(e);
    }
  }
}

if (!customElements.get('ui-num')) {
  customElements.define('ui-num', NumInput);
}

export { NumInput };

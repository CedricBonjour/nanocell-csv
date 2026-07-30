class BoolInput extends HTMLElement {
  constructor(start = false) {
    super();
    this.b = Boolean(start);
  }

  connectedCallback() {
    if (this._initialized) return;
    this._initialized = true;
    this.setAttribute('tabindex', '0');
    this.setAttribute('role', 'switch');
    this.classList.add('ui-bool-toggle');
    this.render();

    this.addEventListener("click", () => {
      this.focus();
      this.toggle();
    });
    this.addEventListener("keydown", e => {
      const k = e.key.toUpperCase();
      if (k === " " || k === "ENTER" || k.includes("ARROW")) {
        e.preventDefault();
        this.toggle();
      }
    });
  }

  render() {
    this.setAttribute('aria-checked', this.b ? 'true' : 'false');
    this.classList.toggle('checked', this.b);
    this.innerHTML = `<div class="toggle-track"><div class="toggle-thumb"></div></div>`;
  }

  toggle() {
    this.setValueInternal(!this.b, true);
  }

  get value() {
    return this.b;
  }

  set value(b) {
    this.setValueInternal(b, false);
  }

  setValueInternal(b, isUserAction = false) {
    const val = Boolean(b);
    this.b = val;
    this.render();

    if (isUserAction) {
      const e = new Event("change", { bubbles: true });
      this.dispatchEvent(e);
    }
  }
}

if (!customElements.get('ui-bool')) {
  customElements.define('ui-bool', BoolInput);
}

export { BoolInput };


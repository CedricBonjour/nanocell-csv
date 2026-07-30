class BoolInput extends HTMLElement {
  constructor(start = false) {
    super();
    this.b = true;
    this.startValue = start;
  }

  connectedCallback() {
    if (this._initialized) return;
    this._initialized = true;
    this.setAttribute('tabindex', '0');
    this.style.cursor = "pointer";
    this.style.display = "flex";
    this.style.justifyContent = "center";
    this.value = this.startValue;
    this.addEventListener("click", e => { this.focus(); this.toggle() });
    this.addEventListener("keydown", e => {
      const k = e.key.toUpperCase();
      if (k.includes("ARROW") || k === "ENTER") this.toggle()
    });
  }

  toggle() { this.value = !this.value }

  get value() { return this.b }
  set value(b) {
    this.b = b;
    this.innerHTML = b ? "&#128504;" : "&#128473;";
    const e = new Event("change");
    Object.defineProperty(e, 'target', { writable: false, value: this });
    if (this.onchange) this.onchange(e);
  }
}

if (!customElements.get('ui-bool')) {
  customElements.define('ui-bool', BoolInput);
}

export { BoolInput };

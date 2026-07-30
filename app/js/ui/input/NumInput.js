class NumInput extends HTMLElement {
  constructor(start = 0, min = 0, max = 999) {
    super();
    this.n = start;
    this.min = min;
    this.max = max;

    this.left = document.createElement("span");
    this.center = document.createElement("span");
    this.right = document.createElement("span");
    this.left.innerHTML = "-";
    this.center.innerHTML = this.n;
    this.right.innerHTML = "+";
    this.left.classList.add("slctLeft");
    this.right.classList.add("slctRight");
  }

  connectedCallback() {
    if (this._initialized) return;
    this._initialized = true;

    this.appendChild(this.left);
    this.appendChild(this.center);
    this.appendChild(this.right);
    this.style.display = "flex";
    this.center.style.flexGrow = "2";
    this.left.addEventListener("click", e => { this.value = this.value - 1 });
    this.right.addEventListener("click", e => { this.value = this.value + 1 });
    this.setAttribute('tabindex', '0');
    this.addEventListener("click", e => { this.focus() });
    this.addEventListener("keydown", e => {
      const k = e.key.toUpperCase();
      if (k === "ARROWRIGHT" || k === "ARROWUP") { this.value = this.value + 1 }
      else if (k === "ARROWLEFT" || k === "ARROWDOWN") { this.value = this.value - 1 }
    });
  }

  get value() { return this.n }
  set value(n) {
    n = Number(n);
    if (n < this.min) n = this.min;
    if (n > this.max) n = this.max;
    this.n = n;
    this.center.innerHTML = this.n;
    const e = new Event("change");
    Object.defineProperty(e, 'target', { writable: false, value: this });
    if (this.onchange) this.onchange(e);
  }
}

if (!customElements.get('ui-num')) {
  customElements.define('ui-num', NumInput);
}

export { NumInput };

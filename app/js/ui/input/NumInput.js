class NumInput extends HTMLElement {
  constructor(start = 0, min = 0, max = 999) {
    super();
    this.n = start;
    this.min = min;
    this.max = max;
    this.classList.add("ui-num");
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
    this.left.addEventListener("click", () => { this.setValueInternal(this.value - 1, true); });
    this.right.addEventListener("click", () => { this.setValueInternal(this.value + 1, true); });
    this.setAttribute('tabindex', '0');
    this.addEventListener("click", () => { this.focus(); });
    this.addEventListener("keydown", e => {
      const k = e.key.toUpperCase();
      if (k === "ARROWRIGHT" || k === "ARROWUP") { this.setValueInternal(this.value + 1, true); }
      else if (k === "ARROWLEFT" || k === "ARROWDOWN") { this.setValueInternal(this.value - 1, true); }
    });
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

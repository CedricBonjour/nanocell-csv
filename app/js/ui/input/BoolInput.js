class BoolInput extends HTMLElement {
  constructor(start = false) {
    super();
    this.b = true;
    this.setAttribute('tabindex', '0');
    this.value = start;
    this.style.cursor = "pointer";
    this.style.display = "flex";
    this.style.justifyContent = "center";
    this.addEventListener("click", e => { this.focus(); this.toggle() });
    this.addEventListener("keydown", e => {
      var k = e.key.toUpperCase();
      if (k.includes("ARROW") || k === "ENTER") this.toggle()
    });
  }

  toggle() { this.value = !this.value }

  get value() { return this.b }
  set value(b) {
    this.b = b;
    this.innerHTML = b ? "&#128504;" : "&#128473;";
    var e = new Event("change")
    Object.defineProperty(e, 'target', { writable: false, value: this });
    if (this.onchange) this.onchange(e);
  }

}

customElements.define('ui-bool', BoolInput);


export { BoolInput };

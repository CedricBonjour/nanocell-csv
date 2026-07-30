class ListInput extends HTMLElement {
  constructor(list = [], hide = false) {
    super();
    this.list = list;
    this.hideValue = hide;
    this.idx = 0;

    this.left = document.createElement("div");
    this.center = document.createElement("div");
    this.right = document.createElement("div");
    this.left.innerHTML = "<";
    this.right.innerHTML = ">";
    this.left.classList.add("slctLeft");
    this.right.classList.add("slctRight");
    this.center.style.flexGrow = "2";
  }

  connectedCallback() {
    if (this._initialized) return;
    this._initialized = true;

    this.setAttribute('tabindex', 0);
    this.style.display = "flex";

    this.appendChild(this.left);
    this.appendChild(this.center);
    this.appendChild(this.right);

    this.left.addEventListener("click", e => { this.prev() });
    this.right.addEventListener("click", e => { this.next() });
    this.setAttribute('hide', this.hideValue);
    this.addEventListener("click", e => { this.focus() });
    this.addEventListener("keydown", e => {
      const k = e.key.toUpperCase();
      if (k === "ARROWRIGHT" || k === "ARROWDOWN") { this.next() }
      else if (k === "ARROWLEFT" || k === "ARROWUP") { this.prev() }
    });

    for (const ele of this.list) {
      const td = document.createElement("span");
      td.innerHTML = ele;
      td.addEventListener("click", e => { this.value = e.target.innerHTML });
      this.center.appendChild(td);
    }
  }

  next() { this.idx = (this.idx + 1) % this.list.length; this.value = this.list[this.idx] }
  prev() { this.idx = (this.idx + this.list.length - 1) % this.list.length; this.value = this.list[this.idx] }

  get value() { return this.center.children[this.idx] ? this.center.children[this.idx].innerHTML : "" }
  set value(txt) {
    for (let i = 0; i < this.list.length; i++) {
      if (this.list[i] === txt) {
        this.idx = i;
        for (const child of this.center.children) child.setAttribute('selected', "false");
        if (this.center.children[i]) this.center.children[i].setAttribute('selected', "true");
        const e = new Event("change");
        Object.defineProperty(e, 'target', { writable: false, value: this });
        if (this.onchange) this.onchange(e);
        return;
      }
    }
  }
}

if (!customElements.get('ui-list')) {
  customElements.define('ui-list', ListInput);
}

export { ListInput };

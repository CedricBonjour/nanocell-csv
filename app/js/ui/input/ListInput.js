class ListInput extends HTMLElement {
  constructor(list = [], hide = false) {
    super();
    this.list = list;
    this.hideValue = hide;
    this.idx = 0;
    this.classList.add("ui-list");

    this.left = document.createElement("button");
    this.center = document.createElement("section");
    this.right = document.createElement("button");
    this.left.innerHTML = "<";
    this.right.innerHTML = ">";
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

    this.left.addEventListener("click", () => { this.prev(true); });
    this.right.addEventListener("click", () => { this.next(true); });
    this.setAttribute('hide', this.hideValue);
    this.addEventListener("click", () => { this.focus(); });
    this.addEventListener("keydown", e => {
      const k = e.key.toUpperCase();
      if (k === "ARROWRIGHT" || k === "ARROWDOWN") { this.next(true); }
      else if (k === "ARROWLEFT" || k === "ARROWUP") { this.prev(true); }
    });

    this.renderOptions();
  }

  renderOptions() {
    this.center.innerHTML = "";
    for (let i = 0; i < this.list.length; i++) {
      const ele = this.list[i];
      const td = document.createElement("span");
      td.innerHTML = ele;
      td.setAttribute('selected', i === this.idx ? "true" : "false");
      td.addEventListener("click", () => { this.setValueInternal(ele, true); });
      this.center.appendChild(td);
    }
  }

  next(isUserAction = false) {
    const nextIdx = (this.idx + 1) % this.list.length;
    this.setValueInternal(this.list[nextIdx], isUserAction);
  }

  prev(isUserAction = false) {
    const prevIdx = (this.idx + this.list.length - 1) % this.list.length;
    this.setValueInternal(this.list[prevIdx], isUserAction);
  }

  get value() {
    return this.list[this.idx] !== undefined ? this.list[this.idx] : "";
  }

  set value(txt) {
    this.setValueInternal(txt, false);
  }

  setValueInternal(txt, isUserAction = false) {
    for (let i = 0; i < this.list.length; i++) {
      if (this.list[i] === txt) {
        this.idx = i;
        if (this._initialized) {
          for (let j = 0; j < this.center.children.length; j++) {
            this.center.children[j].setAttribute('selected', j === i ? "true" : "false");
          }
        }
        if (isUserAction) {
          const e = new Event("change", { bubbles: true });
          this.dispatchEvent(e);
        }
        return;
      }
    }
  }
}

if (!customElements.get('ui-list')) {
  customElements.define('ui-list', ListInput);
}

export { ListInput };

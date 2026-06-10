class ListInput extends HTMLElement {
  constructor(list, hide = false) {
    super();
    this.list = list;
    this.idx = 0;
    this.setAttribute('tabindex', 0);
    this.style.display = "flex"

    this.left = document.createElement("div")
    this.center = document.createElement("div")
    this.right = document.createElement("div")
    this.left.innerHTML = "<";
    this.right.innerHTML = ">";
    this.appendChild(this.left)
    this.appendChild(this.center)
    this.appendChild(this.right)
    this.left.classList.add("slctLeft")
    this.right.classList.add("slctRight")
    this.center.style.flexGrow = "2";
    this.left.addEventListener("click", e => { this.prev() })
    this.right.addEventListener("click", e => { this.next() })
    this.setAttribute('hide', hide);
    this.addEventListener("click", e => { this.focus() })
    this.addEventListener("keydown", e => {
      var k = e.key.toUpperCase();
      if (k === "ARROWRIGHT" || k === "ARROWDOWN") { this.next() }
      else if (k === "ARROWLEFT" || k === "ARROWUP") { this.prev() }
    })
    for (var ele of list) {
      var td = document.createElement("span");
      td.innerHTML = ele;
      td.addEventListener("click", e => { this.value = e.target.innerHTML });
      this.center.appendChild(td);
    }

  }

  next() { this.idx = (this.idx + 1) % this.list.length; this.value = this.list[this.idx] }
  prev() { this.idx = (this.idx + this.list.length - 1) % this.list.length; this.value = this.list[this.idx] }

  get value() { return this.center.children[this.idx].innerHTML }
  set value(txt) {
    for (var i = 0; i < this.list.length; i++) {
      if (this.list[i] === txt) {
        this.idx = i;
        for (var child of this.center.children) child.setAttribute('selected', "false");
        this.center.children[i].setAttribute('selected', "true");
        var e = new Event("change")
        Object.defineProperty(e, 'target', { writable: false, value: this });
        if (this.onchange) this.onchange(e);
        return;
      }
    }
  }
}

customElements.define('ui-list', ListInput);








export { ListInput };

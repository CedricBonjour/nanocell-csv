class Scroller extends HTMLElement {
  constructor(vertical = true) {
    super();
    this.vertical = vertical;
    this.classList.add(vertical ? "vertical" : "horizontal");
  }

  connectedCallback() {
    this.classList.add(this.vertical ? "vertical" : "horizontal");
  }
}

if (!customElements.get('ui-scroller')) {
  customElements.define('ui-scroller', Scroller);
}

export { Scroller };

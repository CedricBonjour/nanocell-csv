class Scroller extends HTMLElement {
  constructor(vertical = true) {
    super();
    this.style.display = "block";
    this.style.backgroundColor = "var(--scrollBar)";
    this.style.borderRadius = ".4em";
    this.style.opacity = ".5";
    this.style.zIndex = "90";
    this.style.position = "absolute";
    if (vertical) {
      this.style.top = "0";
      this.style.right = "0";
      this.style.width = ".7em";
      this.style.height = "4em";
    } else {
      this.style.bottom = "0";
      this.style.left = "0";
      this.style.width = "4em";
      this.style.height = ".7em";

    }
  }
}
customElements.define('ui-scroller', Scroller);






export { Scroller };

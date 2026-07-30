import { dom } from './dom.js';

class About extends HTMLElement {
  constructor() {
    super();
    this.initElements();
  }

  initElements() {
    if (this._elementsInitialized) return;
    this._elementsInitialized = true;

    this.titleEl = document.createElement("h1");
    this.versionEl = document.createElement("h3");
    this.logoEl = document.createElement("img");
    this.homeLink = document.createElement("a");
    this.bugLink = document.createElement("a");
    this.buttonBugReport = document.createElement("button");
    this.aboutFooter = document.createElement("div");

    this.titleEl.innerHTML = "Nanocell CSV Editor";
    this.buttonBugReport.innerHTML = "Bug Report";
    this.logoEl.src = "./logo/nanocell.svg";
    this.homeLink.href = "https://nanocell-csv.com/";
    this.homeLink.innerHTML = "https://nanocell-csv.com/";
    this.homeLink.target = "_blank";
    this.bugLink.href = "https://github.com/CedricBonjour/nanocell-csv/issues/new";
    this.bugLink.target = "_blank";

    this.logoEl.style.filter = "none";
    this.logoEl.style.height = "auto";
    this.logoEl.style.width = "10em";
    this.logoEl.style.borderRadius = "0";

    this.aboutFooter.style.position = "absolute";
    this.aboutFooter.style.bottom = "3em";
    this.aboutFooter.style.left = "0";
    this.aboutFooter.style.width = "100%";
    this.aboutFooter.style.display = "flex";
    this.aboutFooter.style.flexDirection = "column";
    this.aboutFooter.style.height = "7vh";
    this.aboutFooter.style.justifyContent = "space-between";

    this.homeLink.style.textDecoration = "none";
    this.homeLink.style.color = "royalblue";
    this.buttonBugReport.style.color = "royalblue";
    this.buttonBugReport.style.opacity = "1";
    this.buttonBugReport.style.setProperty("box-shadow", "none", "important");
  }

  connectedCallback() {
    if (this._initialized) return;
    this._initialized = true;

    this.initElements();

    this.style.display = "flex";
    this.style.flexDirection = "column";
    this.style.height = "100vh";
    this.style.justifyContent = "center";
    this.style.alignItems = "center";

    this.getVersion(e => { if (this.versionEl) this.versionEl.innerHTML = e; });
    this.appendChild(this.logoEl);
    this.appendChild(this.titleEl);
    this.appendChild(this.versionEl);
    this.bugLink.appendChild(this.buttonBugReport);
    this.aboutFooter.appendChild(this.bugLink);
    this.aboutFooter.appendChild(this.homeLink);
    this.appendChild(this.aboutFooter);
  }

  static show() {
    const el = document.createElement('ui-about');
    if (dom?.dialog) {
      dom.dialog.push(el, true);
    }
    if (!el._initialized && typeof el.connectedCallback === 'function') {
      el.connectedCallback();
    }
    return el;
  }

  getVersion(cb) {
    if (typeof caches !== 'undefined' && caches.keys) {
      caches.keys().then(cache => { cb(cache.join('<br>')) }).catch(err => { console.warn("Failed to get cache version:", err); cb("version error"); });
    } else {
      cb("1.0.0");
    }
  }
}

if (!customElements.get('ui-about')) {
  customElements.define('ui-about', About);
}

export { About };



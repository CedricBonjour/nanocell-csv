import { dom } from './dom.js';
import { setIcon } from './icons.js';

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
    this.buttonBugReport.className = "icon";
    this.buttonBugReport.type = "button";
    this.buttonBugReport.setAttribute("title", "Bug Report");
    this.buttonBugReport.setAttribute("aria-label", "Bug Report");
    setIcon(this.buttonBugReport, 'bug');
    this.bugIcon = this.buttonBugReport;
    this.aboutFooter = document.createElement("div");

    this.titleEl.innerHTML = "Nanocell CSV Editor";
    this.logoEl.src = "/logo.svg";
    this.logoEl.className = "about-logo";
    this.homeLink.href = "https://nanocell-csv.com/";
    this.homeLink.innerHTML = "https://nanocell-csv.com/";
    this.homeLink.target = "_blank";
    this.homeLink.className = "about-home-link";
    this.bugLink.href = "https://github.com/CedricBonjour/nanocell-csv/issues/new";
    this.bugLink.target = "_blank";
    this.bugLink.className = "about-bug-link";
    this.aboutFooter.className = "about-footer";
  }

  connectedCallback() {
    if (this._initialized) return;
    this._initialized = true;

    this.initElements();

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

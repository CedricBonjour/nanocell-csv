import { dom } from './dom.js';
import { setIcon } from './icons.js';
import { Msg } from './Msg.js';

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
    this.versionContainer = document.createElement("div");
    this.versionContainer.className = "about-version-container";

    this.copyBtn = document.createElement("button");
    this.copyBtn.className = "icon about-copy-btn";
    this.copyBtn.type = "button";
    this.copyBtn.setAttribute("title", "Copy version");
    this.copyBtn.setAttribute("aria-label", "Copy version");
    setIcon(this.copyBtn, 'copy');
    this.buttonCopy = this.copyBtn;

    this.copyBtn.onclick = async () => {
      const appName = this.titleEl?.innerText?.trim() || "Nanocell CSV Editor";
      const version = this.versionEl?.innerText?.trim() || this.getVersion();
      const textToCopy = `${appName}-${version}`;
      let success = false;
      try {
        if (navigator?.clipboard?.writeText) {
          await navigator.clipboard.writeText(textToCopy);
          success = true;
        }
      } catch (e) {
        console.warn('Navigator clipboard write failed, trying fallback:', e);
      }
      if (!success && typeof document !== 'undefined') {
        try {
          const ta = document.createElement('textarea');
          ta.value = textToCopy;
          ta.style.position = 'fixed';
          ta.style.opacity = '0';
          document.body.appendChild(ta);
          ta.select();
          document.execCommand('copy');
          ta.remove();
          success = true;
        } catch (e) {
          console.warn('Fallback copy failed:', e);
        }
      }
      setIcon(this.copyBtn, 'on');
      setTimeout(() => setIcon(this.copyBtn, 'copy'), 1500);
      Msg.quick(`Copied: ${textToCopy}`);
    };

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
    this.versionContainer.appendChild(this.versionEl);
    this.versionContainer.appendChild(this.copyBtn);

    this.appendChild(this.logoEl);
    this.appendChild(this.titleEl);
    this.appendChild(this.versionContainer);
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
    const version = typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : 'v1.0.1-dev';
    if (typeof cb === 'function') {
      cb(version);
    }
    return version;
  }
}

if (!customElements.get('ui-about')) {
  customElements.define('ui-about', About);
}

export { About };

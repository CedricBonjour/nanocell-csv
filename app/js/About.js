import { dom } from './dom.js';

class About extends HTMLElement {
  constructor() {
    super();
    var title = document.createElement("h1")
    var version = document.createElement("h3")
    var logo = document.createElement("img")
    var homeLink = document.createElement("a")
    var bugLink = document.createElement("a")
    var buttonBugReport = document.createElement("button")
    var aboutFooter = document.createElement("div")
    title.innerHTML = "Nanocell CSV Editor";
    buttonBugReport.innerHTML = "Bug Report"
    logo.src = "./logo/nanocell.svg"
    homeLink.href = "https://nanocell-csv.com/"
    homeLink.innerHTML = "https://nanocell-csv.com/"
    homeLink.target = "_blank"
    bugLink.href = "https://github.com/CedricBonjour/nanocell-csv/issues/new"
    bugLink.target = "_blank"
    this.style.display = "flex"
    this.style.flexDirection = "column"
    this.style.height = "100vh"
    this.style.justifyContent = "center"
    this.style.alignItems = "center"
    logo.style.filter = "none";
    logo.style.height = "auto";
    logo.style.width = "10em";
    logo.style.borderRadius = "0";
    aboutFooter.style.position = "absolute"
    aboutFooter.style.bottom = "3em"
    aboutFooter.style.left = "0"
    aboutFooter.style.width = "100%"
    aboutFooter.style.display = "flex"
    aboutFooter.style.flexDirection = "column"
    aboutFooter.style.height = "7vh"
    aboutFooter.style.justifyContent = "space-between"

    homeLink.style.textDecoration = "none"
    homeLink.style.color = "royalblue"
    buttonBugReport.style.color =  "royalblue"
    buttonBugReport.style.opacity = 1
    buttonBugReport.style.setProperty("box-shadow", "none", "important");
    this.getVersion(e => { version.innerHTML = e });
    this.appendChild(logo)
    this.appendChild(title);
    this.appendChild(version)
    bugLink.appendChild(buttonBugReport)
    aboutFooter.appendChild(bugLink)
    aboutFooter.appendChild(homeLink)
    this.appendChild(aboutFooter)
    dom.dialog.push(this, true);
  }
  getVersion(cb) { caches.keys().then(cache => { cb(cache.join('<br>')) }).catch(() => { cb("version error") }) }
}
customElements.define('ui-about', About);

// position: absolute;
// bottom: 3em;
// left: 0px;
// width: 100%;
// flex-direction: column;
// display: flex
// ;
// height: 7vh;
// align-content: space-between;
// justify-content: space-between;

export { About };

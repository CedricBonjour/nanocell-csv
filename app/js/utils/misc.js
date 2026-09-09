function signOf(value) { if (value >= 0) return 1; return -1; }

function isAlphanumeric(char) {
  return /^[a-zA-Z0-9_]$/.test(char);
}

function Timer(name) {
  this.init = new Date().getTime();
  this.name = name;
}

Node.prototype.empty = function () { while (this.firstChild) { this.removeChild(this.firstChild); } };
Node.prototype.previous = function () { if (this.previousSibling) return this.previousSibling; else return this.parentNode.lastChild; };
Node.prototype.next = function () { if (this.nextSibling) return this.nextSibling; else return this.parentNode.firstChild; };
Node.prototype.position = function () { let e = this; let i = 0; while ((e = e.previousSibling) !== null) ++i; return i; };
Node.prototype.addSpan = function (data, c) {
  const s = document.createElement("span");
  s.innerHTML = data;
  if (c) s.classList.add(c);
  this.appendChild(s);
};

function rndStr(n = 2) {
  let r = '';
  const abc = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  const len = abc.length;
  for (let i = 0; i < n; i++) r += abc.charAt(Math.floor(Math.random() * len));
  return r;
}

function isValidUrl(txt) {
  if (typeof txt !== "string") return false;
  let url = txt.toLowerCase();
  return url.startsWith("https://")||url.startsWith("http://");
}

let round = function (n, integer = true) {
  if (isNaN(n) || n === '') return n;
  n = Number(n);
  if (!integer) n *= 100;
  n = Math.round(n + Number.EPSILON);
  if (!integer) {
    n /= 100;
    n += 0.001;
    n = Math.round(n * 1000) / 1000;
    n = String(n).slice(0, -1);
  }
  return n;
};

export { signOf, isAlphanumeric, Timer, rndStr, isValidUrl, round };


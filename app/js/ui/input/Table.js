class Table extends HTMLElement {
  constructor() {
    super();
    this.table = document.createElement("table");
    this.appendChild(this.table);
    this.row = undefined;
  }

  get rows() {
    return this.table.rows;
  }

  get children() {
    return this.table.children;
  }

  br() {
    this.row = document.createElement("tr");
    this.table.appendChild(this.row);
  }

  push(ele = "", eleClass = undefined) {
    const td = document.createElement("td");
    if (eleClass) td.classList.add(eleClass);
    const decodeEntities = (s) => s.replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'");

    const appendItem = (item) => {
      if (typeof Node !== 'undefined' && item instanceof Node) {
        td.appendChild(item);
      } else {
        const str = String(item);
        if (str.includes('<b>') && str.includes('</b>')) {
          const parts = str.split(/(<b>[\s\S]*?<\/b>)/g);
          for (const part of parts) {
            if (part.startsWith('<b>') && part.endsWith('</b>')) {
              const b = document.createElement('b');
              b.textContent = decodeEntities(part.slice(3, -4));
              td.appendChild(b);
            } else if (part.length > 0) {
              td.appendChild(document.createTextNode(decodeEntities(part)));
            }
          }
        } else {
          td.appendChild(document.createTextNode(decodeEntities(str)));
        }
      }
    };
    if (Array.isArray(ele)) {
      for (const e of ele) appendItem(e);
    } else {
      appendItem(ele);
    }
    if (this.row == undefined) this.br();
    this.row.appendChild(td);
  }

  activeRow() {
    return this.row;
  }

  pushRow(array) {
    this.br();
    for (const a of array) this.push(a);
  }

  clear() {
    while (this.table.children.length > 0) this.table.children[0].remove();
  }
}

if (!customElements.get('ui-table')) {
  customElements.define('ui-table', Table);
}

export { Table };

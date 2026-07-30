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
    if (Array.isArray(ele)) for (const e of ele) try { td.appendChild(e) } catch (err) { td.innerHTML = e }
    else try { td.appendChild(ele) } catch (err) { td.innerHTML = ele }
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

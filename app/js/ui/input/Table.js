class Table extends HTMLTableElement {
  constructor() {
    super(); this.row = undefined;
  }

  br() {
    this.row = document.createElement("tr");
    this.appendChild(this.row);
  }

  push(ele = "", eleClass = undefined) {

    var td = document.createElement("td")
    if (eleClass) td.classList.add(eleClass);
    if (Array.isArray(ele)) for (var e of ele) try { td.appendChild(e) } catch (err) { td.innerHTML = e }
    else try { td.appendChild(ele) } catch (err) { td.innerHTML = ele }
    if (this.row == undefined) this.br();
    this.row.appendChild(td);
  }

  activeRow() {
    return this.row
  }
  pushRow(array) {
    this.br();
    for (var a of array) this.push(a);
  }
  clear() { while (this.children.length > 0) this.children[0].remove(); }

}

customElements.define('ui-table', Table, { extends: 'table' });


export { Table };

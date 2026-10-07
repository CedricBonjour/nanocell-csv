/**
 * CellText - Inline Cell Text Editor Component.
 * Bridges grid inline editing to modern UI component contracts while maintaining
 * standard HTMLInputElement compatibility for sheet.inputField.
 * @module CellText
 */
class CellText {
  /**
   * Creates an HTML input element configured for cell editing.
   * @param {Object} [options]
   * @returns {HTMLInputElement}
   */
  static create(options = {}) {
    const input = document.createElement('input');
    input.type = 'text';
    input.className = options.className || 'cell-text-input';
    if (options.value !== undefined) input.value = options.value;
    return input;
  }

  constructor(sheet) {
    this.sheet = sheet;
    this.element = CellText.create();
  }

  get value() {
    return this.element.value;
  }

  set value(v) {
    this.element.value = v;
  }

  focus() {
    this.element.focus();
  }

  blur() {
    this.element.blur();
  }
}

export { CellText };

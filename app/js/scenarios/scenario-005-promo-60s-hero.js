/**
 * @file app/js/scenarios/scenario-005-promo-60s-hero.js
 * Promo Scenario 005: Messy CSV to SQL-Ready in Seconds
 */

export const scenario005 = {
  id: '005',
  alias: 'promo-60s-hero',
  category: 'promo',
  title: 'Promo: Messy CSV to SQL-Ready in Seconds',
  description: 'High-impact visual showcase transforming a messy international sales table into a clean, sorted, SQL-compliant dataset.',
  csv: [
    'Product Name!,Unit Price,Launch Date,Notes & Tags',
    '"Pro Laptop, 16""",CHF 1\'450.-,15/11/2026,"fast, lightweight"',
    '"4K Monitor ""Ultra""","$1,299.00",01/12/2026,"hdr, calibrated"',
    '"Wireless Dock, v2","899,50 €",2026.12.10,"usb-c, compact"',
    'Mechanical Keyb,£749.99,19/12/2026,"tactile, rgb"',
    '"Studio Mic ""Pro""",CA$ 1100,28/12/2026,"podcast, xlr"',
  ].join('\n'),
  steps: [
    { type: 'cmd', cmdId: 'fixTop', caption: 'Freeze Header Row (Ctrl+B)', wait: 650 },
    { type: 'openValidation', caption: 'Open Data Validation (Ctrl+Shift+P)', wait: 650 },
    { type: 'validateRule', ruleId: 'headers', acceptAll: true, caption: 'Sanitize SQL Headers', wait: 750 },
    { type: 'validateRule', ruleId: 'double_quotes', acceptAll: true, caption: 'Convert Double Quotes to Single Quotes', wait: 750 },
    { type: 'selectValidationRule', ruleId: 'currency', caption: 'Select Currency Column Validation', wait: 700 },
    { type: 'applyValidationCol', col: 1, caption: 'Extract ISO Currencies & Normalize Prices', wait: 850 },
    { type: 'validateRule', ruleId: 'text_commas', acceptAll: true, caption: 'Replace Embedded Text Commas with Hyphens', wait: 750 },
    { type: 'validateRule', ruleId: 'dates', acceptAll: true, caption: 'Standardize Dates to YYYY-MM-DD', wait: 750 },
    { type: 'closeValidation', caption: 'Close Validation Pane', wait: 500 },
    { type: 'selectCell', x: 1, y: 1, caption: 'Select normalized Unit Price column', wait: 500 },
    { type: 'cmd', cmdId: 'sortDescending', caption: 'Sort Highest to Lowest Price (Ctrl+Shift+L)', wait: 800 },
    {
      type: 'assert',
      caption: 'Verify clean SQL-ready table state',
      check: (df) => {
        if (df.width !== 5) throw new Error(`Expected 5 columns, got ${df.width}`);
        if (df.get(0, 0) !== 'product_name' || df.get(1, 0) !== 'unit_price' || df.get(2, 0) !== 'unit_price_currency') {
          throw new Error('Headers mismatch');
        }
        if (df.get(1, 1) !== '1450.00' || df.get(2, 1) !== 'CHF') throw new Error('Top sorted row mismatch');
      },
    },
  ],
};

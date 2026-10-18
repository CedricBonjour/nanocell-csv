/**
 * @file app/js/scenarios/scenario-001-clean-financial-data.js
 * Documentation Scenario 001: Clean Financial & Currency Data
 */

export const scenario001 = {
  id: '001',
  alias: 'clean-financial-data',
  category: 'docs',
  title: 'Clean Financial & Currency Data',
  description: 'Extract mixed currency symbols and ISO codes into a dedicated column and normalize locale numbers.',
  csv: [
    'invoice_id,client,amount,due_date,status',
    "INV-1001,Helvetia Corp,CHF 1'250.-,2026-11-15,paid",
    'INV-1002,Acme US,"$1,499.50",2026-12-01,pending',
    'INV-1003,Berlin GmbH,"2.340,80 €",2026-12-10,paid',
    'INV-1004,Maple Leaf Ltd,CA$ 850,2026-12-19,overdue',
    'INV-1005,Tokyo Tech,¥125000,2026-12-28,paid',
    'INV-1006,Refund Entry,($45.00),2026-12-30,refunded',
  ].join('\n'),
  steps: [
    { type: 'cmd', cmdId: 'fixTop', caption: 'Freeze header row', wait: 600 },
    { type: 'selectCol', col: 2, caption: 'Inspect Col 3 (amount) with mixed currencies & locale numbers', wait: 800 },
    { type: 'openValidation', caption: 'Open Data Validation Pane', wait: 700 },
    { type: 'selectValidationRule', ruleId: 'currency', caption: 'Select "Currency Column" validation rule', wait: 800 },
    { type: 'applyValidationCol', col: 2, caption: 'Apply to Col 3: extract ISO3 codes & format numbers to 2 decimals', wait: 1000 },
    {
      type: 'assert',
      caption: 'Verify extracted ISO3 column & normalized numbers',
      check: (df) => {
        if (df.width !== 6) throw new Error(`Expected width 6, got ${df.width}`);
        if (df.get(2, 0) !== 'amount' || df.get(3, 0) !== 'amount_currency') {
          throw new Error(`Unexpected headers: ${df.get(2, 0)}, ${df.get(3, 0)}`);
        }
        if (df.get(2, 1) !== '1250.00' || df.get(3, 1) !== 'CHF') throw new Error('Row 1 CHF mismatch');
        if (df.get(2, 2) !== '1499.50' || df.get(3, 2) !== 'USD') throw new Error('Row 2 USD mismatch');
        if (df.get(2, 3) !== '2340.80' || df.get(3, 3) !== 'EUR') throw new Error('Row 3 EUR mismatch');
        if (df.get(2, 4) !== '850.00' || df.get(3, 4) !== 'CAD') throw new Error('Row 4 CAD mismatch');
        if (df.get(2, 5) !== '125000.00' || df.get(3, 5) !== 'JPY') throw new Error('Row 5 JPY mismatch');
        if (df.get(2, 6) !== '-45.00' || df.get(3, 6) !== 'USD') throw new Error('Row 6 negative USD mismatch');
      },
    },
  ],
};

/**
 * @file app/js/scenarios/scenario-002-standardize-dates-headers.js
 * Documentation Scenario 002: SQL Headers & Date Standardization
 */

export const scenario002 = {
  id: '002',
  alias: 'standardize-dates-headers',
  category: 'docs',
  title: 'SQL Headers & Date Standardization',
  description: 'Sanitize duplicate/special-character column headers for SQL and standardize calendar dates to YYYY-MM-DD.',
  csv: [
    'Order ID!,Order ID!,Order Date,Ship Date,Customer Name',
    '101,A-1,25/12/2026,2026.12.28,Alice',
    '102,A-2,04/11/2026,15-11-2026,Bob',
    '103,A-3,19/08/2026,2026/08/22,Charlie',
    '104,A-4,31/01/2026,2026.02.01,Diana',
  ].join('\n'),
  steps: [
    { type: 'selectRow', row: 0, caption: 'Inspect Row 1: special characters and duplicate "Order ID!" headers', wait: 800 },
    { type: 'openValidation', caption: 'Open Data Validation Pane', wait: 600 },
    { type: 'validateRule', ruleId: 'headers', acceptAll: true, caption: 'Sanitize headers for SQL compliance & deduplicate', wait: 900 },
    { type: 'validateRule', ruleId: 'dates', acceptAll: true, caption: 'Standardize all date formats to ISO YYYY-MM-DD', wait: 900 },
    { type: 'closeValidation', caption: 'Close Validation Pane', wait: 500 },
    {
      type: 'assert',
      caption: 'Verify SQL headers and YYYY-MM-DD dates',
      check: (df) => {
        if (df.get(0, 0) !== 'order_id' || df.get(1, 0) !== 'order_id_c2') {
          throw new Error(`Header sanitization failed: ${df.get(0, 0)}, ${df.get(1, 0)}`);
        }
        if (df.get(2, 1) !== '2026-12-25' || df.get(3, 1) !== '2026-12-28') {
          throw new Error(`Date standardization failed: ${df.get(2, 1)}, ${df.get(3, 1)}`);
        }
      },
    },
  ],
};

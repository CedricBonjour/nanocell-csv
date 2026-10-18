/**
 * @file app/js/scenarios/scenario-003-e2e-full-pipeline.js
 * E2E Scenario 003: Full Data Cleaning & Undo Pipeline (60 Rows)
 */

function buildPipelineCsv() {
  const lines = ['Tx ID;Account Name;Gross Amount (USD);Settlement Date;Status'];
  const accounts = ['  Helvetia Bank ', 'Acme Global  ', 'Nordic Partners', '  Tokyo Holdings', 'Berlin Ventures  '];
  const amounts = ["CHF 1'250.-", '$2,400.50', '1.850,75 €', 'CA$ 950', '($120.00)', '3 500,00 CHF'];
  const statuses = ['  settled ', 'pending  ', '  settled', 'review  '];
  for (let i = 1; i <= 60; i++) {
    const id = `TX-${String(1000 + i)}`;
    const acc = accounts[i % accounts.length];
    const amt = amounts[i % amounts.length];
    const day = String(13 + (i % 15)).padStart(2, '0');
    const month = String(1 + (i % 12)).padStart(2, '0');
    const date = `${day}/${month}/2026`;
    const st = statuses[i % statuses.length];
    lines.push(`${id};${acc};${amt};${date};${st}`);
  }
  return lines.join('\n');
}

export const scenario003 = {
  id: '003',
  alias: 'e2e-full-pipeline',
  category: 'e2e',
  title: 'E2E Full Data Cleaning & Undo Pipeline (60 Rows)',
  description: 'End-to-end 60-row semicolon CSV pipeline: SQL headers, currency extraction, date normalization, whitespace trim, numeric sort, and undo/redo.',
  csv: buildPipelineCsv,
  steps: [
    { type: 'cmd', cmdId: 'fixTop', caption: 'Freeze header row (Ctrl+B)', wait: 500 },
    { type: 'openValidation', caption: 'Open Data Validation Pane', wait: 500 },
    { type: 'validateRule', ruleId: 'headers', acceptAll: true, caption: 'Step 1: Sanitize column headers', wait: 700 },
    { type: 'selectValidationRule', ruleId: 'currency', caption: 'Step 2: Select Currency Column rule', wait: 600 },
    { type: 'applyValidationCol', col: 2, caption: 'Extract currencies & format 60 rows in Col 3', wait: 800 },
    { type: 'validateRule', ruleId: 'dates', acceptAll: true, caption: 'Step 3: Standardize 60 settlement dates to YYYY-MM-DD', wait: 700 },
    { type: 'validateRule', ruleId: 'trim_whitespace', acceptAll: true, caption: 'Step 4: Trim whitespace across all cells', wait: 700 },
    { type: 'closeValidation', caption: 'Close Validation Pane', wait: 400 },
    { type: 'selectCell', x: 2, y: 1, caption: 'Select cleaned amount column', wait: 500 },
    { type: 'cmd', cmdId: 'sortDescending', caption: 'Sort rows descending by numeric amount (Ctrl+Shift+L)', wait: 700 },
    { type: 'cmd', cmdId: 'undo', caption: 'Test Undo (Ctrl+Z) — reverts sort', wait: 600 },
    { type: 'cmd', cmdId: 'redo', caption: 'Test Redo (Ctrl+Y) — reapplies sort', wait: 600 },
    {
      type: 'assert',
      caption: 'Verify 60-row pipeline state, headers, currency column, and sort order',
      check: (df) => {
        if (df.height !== 61 || df.width !== 6) throw new Error(`Expected 6x61 grid, got ${df.width}x${df.height}`);
        if (df.get(2, 0) !== 'gross_amount_usd' || df.get(3, 0) !== 'gross_amount_usd_currency') {
          throw new Error(`Unexpected currency headers: ${df.get(2, 0)}, ${df.get(3, 0)}`);
        }
        if (df.get(2, 1) !== '3500.00' || df.get(3, 1) !== 'CHF') {
          throw new Error(`Expected top sorted amount 3500.00 CHF, got ${df.get(2, 1)} ${df.get(3, 1)}`);
        }
        if (!/^\d{4}-\d{2}-\d{2}$/.test(df.get(4, 1))) {
          throw new Error(`Expected ISO date in col 5, got ${df.get(4, 1)}`);
        }
      },
    },
  ],
};

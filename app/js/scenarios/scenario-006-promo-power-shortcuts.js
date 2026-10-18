/**
 * @file app/js/scenarios/scenario-006-promo-power-shortcuts.js
 * Promo Scenario 006: Keyboard-First Power Workflow
 */

export const scenario006 = {
  id: '006',
  alias: 'promo-power-shortcuts',
  category: 'promo',
  title: 'Promo: Keyboard-First Power Workflow',
  description: 'Showcase rapid keyboard shortcuts: occurrence jumping (Ctrl+D), decimal/integer rounding (Ctrl+$ / Ctrl+I), and sheet transpose (Ctrl+Shift+T).',
  csv: [
    'metric,tier,margin_pct,unit_score',
    'Revenue,Gold,18.456,94.7',
    'Retention,Silver,12.104,88.2',
    'Expansion,Gold,24.891,91.6',
    'Efficiency,Gold,31.005,96.4',
  ].join('\n'),
  steps: [
    { type: 'cmd', cmdId: 'fixTop', caption: 'Freeze Header Row (Ctrl+B)', wait: 600 },
    { type: 'selectCell', x: 1, y: 1, caption: 'Focus cell "Gold" at (2, 2)', wait: 600 },
    { type: 'cmd', cmdId: 'nextOccurrence', caption: 'Jump to Next Occurrence of "Gold" (Ctrl+D)', wait: 700 },
    { type: 'cmd', cmdId: 'nextOccurrence', caption: 'Jump to Next Occurrence of "Gold" (Ctrl+D)', wait: 700 },
    { type: 'selectCol', col: 2, caption: 'Select Col 3 (margin_pct)', wait: 600 },
    { type: 'cmd', cmdId: 'decimal', caption: 'Round Selection to 2 Decimals (Ctrl+$)', wait: 750 },
    { type: 'selectCol', col: 3, caption: 'Select Col 4 (unit_score)', wait: 600 },
    { type: 'cmd', cmdId: 'integer', caption: 'Round Selection to Integer (Ctrl+I)', wait: 750 },
    { type: 'selectCell', x: 0, y: 0, caption: 'Focus top-left cell', wait: 500 },
    { type: 'cmd', cmdId: 'transpose', caption: 'Transpose Entire Sheet (Ctrl+Shift+T)', wait: 850 },
    { type: 'cmd', cmdId: 'transpose', caption: 'Transpose Back to Original Orientation (Ctrl+Shift+T)', wait: 850 },
    {
      type: 'assert',
      caption: 'Verify rounded decimals, integers, and restored dimensions',
      check: (df) => {
        if (df.width !== 4 || df.height !== 5) throw new Error(`Expected 4x5 grid, got ${df.width}x${df.height}`);
        if (df.get(2, 1) !== '18.46' || df.get(2, 4) !== '31.01') throw new Error('Decimal rounding mismatch');
        if (df.get(3, 1) !== '95' || df.get(3, 2) !== '88') throw new Error('Integer rounding mismatch');
      },
    },
  ],
};

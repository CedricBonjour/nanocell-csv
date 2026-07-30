# NanoCell CSV - Test Infrastructure Specification

## 1. Test Philosophy
NanoCell CSV adopts an **opaque-box, requirement-driven testing approach**. Tests interact exclusively through documented public APIs, custom element interfaces, state contracts, and DOM interactions. Internal implementation details are treated as opaque, ensuring that refactoring internal logic does not break the test suite as long as functional requirements are met.

- **Test Runner**: Vitest (v3.0.7+)
- **DOM Environment**: jsdom (v29.1.1+)
- **Execution Mode**: Fast, deterministic, isolated E2E and unit test execution (`npx vitest run`)

---

## 2. Core Feature Inventory
The test suite covers 8 core features across the application:

1. **CSV Parsing / Loading / Export** (`tests/csv_parser.test.js`)
   - RFC 4180 parsing, custom delimiters (comma, semicolon, tab, pipe), quote handling, line breaks, empty files, malformed lines, and 2D matrix export (`CsvHandle.from2D`).
2. **Cell & Range Editing** (`tests/dataframe.test.js`)
   - Cell mutation (`edit`), range edits (`rangeEdit`), series auto-expansion (`expand`), header validation (`validate_headers`), numeric auto-rounding, and data cleaning (`validate_data`).
3. **Selection & Navigation** (`tests/selection_range.test.js`)
   - Cursor movement (`x`, `y`), viewport panning (`baseX`, `baseY`), single cell vs range selection (`rangeEnd`), full column/row selection (`slctCol`, `slctRow`, `slctAll`), and bounds checking (0, negative, max dimensions).
4. **State Management** (`tests/statemanager.test.js`)
   - Centralized Pub/Sub Event Bus (`StateManager`), listener registration (`on`/`off`), event emission (`emit`), key-value state access (`setState`/`getState`), and circular dependency decoupling.
5. **Undo / Redo** (`tests/undo_redo.test.js`)
   - Command pattern undo/redo stack (`undoStack`/`redoStack`), single-cell edit revert, multi-cell range edit revert, row/column insert and delete undo integrity, and timestamp delta delta-batching (`MS_DELTA`).
6. **Search & Replace** (`tests/search.test.js`)
   - Search query matching (`Finder`), case sensitivity toggles, multi-match navigation (`idx`, `found`), result highlight formatting, and bulk text replacement (`replaceAll`) in the dataframe.
7. **Theming & UI Settings** (`tests/theme.test.js`)
   - Settings management (`Setting`, `stg`), local storage persistence, theme switching (`light`/`night`/`dark`) without flash of unstyled content (FOUC), and resetting settings to defaults.
8. **Custom Element `<ui-sheet>` & UI Integration** (`tests/sheet.test.js`)
   - Autonomous web component lifecycle (`<ui-sheet>`, `<ui-cell>`, `<ui-finder>`), table structure rendering, scrollbar calculations, footer updates, DOM event handling, and UI integration.

---

## 3. Four-Tier Test Architecture & Methodology

```
+-----------------------------------------------------------------------+
| Tier 4: Real-World Application Scenarios (Full E2E Workflows)        |
+-----------------------------------------------------------------------+
| Tier 3: Cross-Feature Combinations (Pairwise Feature Interactions)    |
+-----------------------------------------------------------------------+
| Tier 2: Boundary & Corner Cases (>=5 Edge Case Tests per Feature)     |
+-----------------------------------------------------------------------+
| Tier 1: Core Feature Coverage (>=5 Primary Usage Tests per Feature)  |
+-----------------------------------------------------------------------+
```

### Tier 1: Feature Coverage (>=5 tests per feature)
Verifies happy-path user capabilities for every core feature using standard inputs and valid operational parameters.

### Tier 2: Boundary & Corner Cases (>=5 tests per feature)
Tests boundary conditions, invalid inputs, edge cases (empty strings, negative coordinates, out-of-bounds access, single-cell tables, special character escaping, rapid undo/redo stack operations).

### Tier 3: Cross-Feature Combinations
Validates interaction between multiple core features simultaneously. Examples:
- Editing a cell range, performing search/replace, and pushing undo/redo commands.
- Changing themes while navigating cell selections and loading new CSV matrix data.
- Triggering `StateManager` pub/sub events during row insertion and CSV stringification.

### Tier 4: Real-World Application Scenarios
Executes end-to-end integration workflows using real CSV fixture files loaded directly from disk (`tests/csv_files/`):
- `demo_parser.csv`: Complex quoting, newlines, and escaping.
- `demo_color_types.csv`: Color codes, diverse data types, and formatting.
- `demo_pipeline_config.csv`: Configuration key-value pairs, nested text.
- `demo_r100.csv`: Large 100-row dataset performance and stress testing.

---

## 4. Coverage Thresholds & Target Counts

### Target Test Count Formula
$$\text{Total Tests} = 11 \times N + \max(5, \lfloor N/2 \rfloor)$$
Where $N = 8$ core features:
$$\text{Total Target} = 11 \times 8 + \max(5, 4) = 88 + 5 = 93 \text{ tests (Minimum 90+)}$$

### Distribution per Test File
| Test File | Core Feature Area | Min Target Tests |
|---|---|---|
| `tests/dataframe.test.js` | Core Dataframe Operations | >= 12 |
| `tests/statemanager.test.js` | Central StateManager Pub/Sub | >= 10 |
| `tests/csv_parser.test.js` | CSV Parsing & File Handling | >= 12 |
| `tests/sheet.test.js` | UI Sheet & Custom Element `<ui-sheet>` | >= 10 |
| `tests/selection_range.test.js` | Selection & Navigation | >= 10 |
| `tests/undo_redo.test.js` | Undo / Redo Command Stack | >= 10 |
| `tests/search.test.js` | Finder Search & Replace | >= 10 |
| `tests/theme.test.js` | Theming & Settings Persistence | >= 10 |
| `tests/real_world.test.js` | E2E Workflows & Fixture Integrations | >= 8 |
| **Total** | **All 8 Features (Tiers 1-4)** | **>= 92 Tests** |

---

## 5. Verification & Integrity Protocol
- **No Cheating / Hardcoding**: All assertions evaluate real code logic and live object states.
- **Clean Execution**: Tests run headlessly via `npx vitest run` without DOM leakage or async unhandled rejections.

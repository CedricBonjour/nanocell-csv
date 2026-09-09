# Project: NanoCell CSV Refactoring (Phase 2)

## Architecture
- **Entry Points**: `app/home.html` (Application UI container loading `app/js/main.js`), `index.html` (Landing page).
- **Core Architecture & Data Flow**:
  - `StateManager.js`: Central Pub/Sub & Application Event Bus. Decouples state, events, and singletons.
  - `Dataframe.js`: Core 2D array data model with Command Pattern Undo/Redo.
  - `<ui-sheet>` (`Sheet.js`): Autonomous custom element encapsulating View rendering & Controller event handlers.
  - `CsvHandle.js`: File I/O manager with Web Worker / ReadableStream progressive chunked loading.
  - `mouse.js`: Event handler resolving cell target type via `e.target.closest("td") || e.target.closest("th")`.
  - `<ui-command-palette>` (`CommandPalette.js`): Modal custom element for Ctrl+P / Cmd+P action search palette with fuzzy search & keyboard nav.
  - `style.css`: Viewport height flexbox layout and single stylesheet with `data-theme` support.
- **Testing Architecture**:
  - Vitest Unit Test Suite (`npm test`) & Vite Build (`npm run build`).
  - Dual Track E2E Test Suite (Tiers 1-4 opaque-box test runner + Tier 5 white-box adversarial coverage tests).

## Code Layout
```
app/
├── home.html
├── css/
│   └── style.css            # Flexbox container layout & data-theme styles
├── fonts/                   # Bundled monospace webfonts
├── icons/                   # Auto-inlined SVG icon assets
└── js/
    ├── main.js              # Application bootstrap & event bus registration
    ├── csv_worker.js        # Web Worker for streaming CSV chunk parsing
    ├── StateManager.js      # Central Pub/Sub State Manager
    ├── Dataframe.js         # Core data model & Command Pattern Undo/Redo
    ├── Sheet.js             # Autonomous custom element <ui-sheet>
    ├── sheet/               # Sheet modular decomposition (View vs Controller)
    ├── CsvHandle.js         # File I/O & Web Worker streaming chunk reader
    ├── Setting.js           # Settings & theme management
    ├── cmd.js, dom.js, key.js, mouse.js, Finder.js, CMenu.js
    └── ui/                  # Web Components (<ui-command-palette>, <ui-cmenu>, etc.)
```

## Milestones
| # | Name | Scope | Dependencies | Status |
|---|------|-------|-------------|--------|
| E2E | E2E Testing Track | Requirement-driven test suite (Tiers 1-4) & runner for R1-R4 | none | DONE |
| M1 | UI & Layout Fixes | Context menu target resolution (`mouse.js` `closest("td, th")`) & table container flexbox height (`style.css`) | none | DONE |
| M2 | Optimized Streaming File Loading Engine | Web Worker / ReadableStream chunked reading in `CsvHandle.js` for instant initial rendering | none | IN_PROGRESS |
| M3 | IDE-Style Command Palette | Component `<ui-command-palette>`, Ctrl+P shortcut, fuzzy search, keyboard nav | M1 | PLANNED |
| M4 | Code Hygiene & Comprehensive Comments | JSDoc comments across core modules (`StateManager`, `SheetController`, `SheetView`, `Dataframe`, `CsvHandle`, `cmd`), dead code removal | M1, M2, M3 | PLANNED |
| M5 | Final Milestone: E2E Verification & Forensic Audit | 100% test pass (`npm test`), build success (`npm run build`), Tier 5 adversarial tests, Forensic Audit | E2E, M1-M4 | PLANNED |

## Interface Contracts

### StateManager Pub/Sub Contract (`app/js/StateManager.js`)
- `StateManager.on(event, callback)`: Register listener for event.
- `StateManager.off(event, callback)`: Unregister listener.
- `StateManager.emit(event, data)`: Dispatch event payload to listeners.
- `StateManager.setState(key, value)` / `StateManager.getState(key)`: State accessors.

### Context Menu Mouse Target Resolution Contract (`app/js/mouse.js`)
- `getTargetType(e)`: Resolves target cell/header element using `e.target.closest("td") || e.target.closest("th")` to ensure nested `div` or `span` elements inside cells reliably trigger context menu `<ui-cmenu>`.

### Command Palette Web Component Contract (`app/js/ui/CommandPalette.js` / `<ui-command-palette>`)
- Autonomous custom element `<ui-command-palette>` registered with `customElements.define('ui-command-palette', CommandPalette)`.
- Global shortcut listener: `Ctrl+P` / `Cmd+P` toggles command palette visibility.
- Key navigation: `ArrowUp`, `ArrowDown`, `Enter` to select and execute, `Escape` to dismiss.
- Fuzzy filtering across registered commands in `cmd.js`.

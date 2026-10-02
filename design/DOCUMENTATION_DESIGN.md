# Documentation Design & Strategy Specification: `doc.html`

**Document Version**: 3.1.0  
**Target File**: `doc.html` (paired with `index.html` & `theme.css`)  
**Directory**: `design/DOCUMENTATION_DESIGN.md`  
**Target Audience**: Data Engineers, Data Analysts, Backend Developers, Database Administrators, Spreadsheet Users  
**Status**: Authoritative Documentation Design Standard  

---

## 1. Executive Summary & Philosophy

Traditional software documentation often reads like an uninspired reference manual: listing every obscure menu item, detailing dry technical edge cases (*"In Case A, condition X occurs; in Case B, condition Y occurs"*), and droning on about generic features that every spreadsheet user already expects (e.g. cut, copy, paste).

The documentation for **NanoCell CSV** (`doc.html`) takes a user-oriented, visual-first approach:
1. **Pain Point ➔ Solution Duality**: Every core capability is presented in a side-by-side split pane: the real-world frustration on the left (red-tinted card: `The Pain Point`) paired with NanoCell's clean resolution on the right (green-tinted card: `The NanoCell Solution`), with clean headers free of leading icons.
2. **The "Oh, I Can Do That?!" Subtitles**: Each section leads with a punchy, conversational eureka subtitle right beneath the title, instantly communicating the practical capability before diving into details.
3. **Consistent, Highly Legible Visual Examples**: Every example uses a uniform, static tabular card layout modeled directly after spreadsheet grids: clear columns, readable data cells, and `<span class="tag-diff-del">` (soft red badge without strikethrough for full readability) and `<span class="tag-diff-add">` (green highlighted) diff indicators. Zero distracting interactive gimmicks.
4. **Streamlined Large File Sampling Table**:
   - Uses genuine spreadsheet row headers (`.row-header`) with row index numbers (`1`, `2`, `3`, etc.).
   - Visualizes chunked streaming across regular intervals separated by multiple `! [...] !` dividers.
5. **Clean 3-Column Data Validation Table**:
   - Focuses strictly on `Issue Category`, `Original Value (Dirty)`, and `Sanitized Value (Proposed Fix)`.
   - Single issue per row (Header Syntax and Duplicate Header separated).
   - Clean badges without strikethrough lines cutting through values, numbers, and quotes.
   - Dedicated note boxes for shortcuts and the Date Ambiguity Safeguard.
6. **Consolidated Essentials & Keyboard Power Tools**:
   - Merged into a unified `.essentials-grid` where every matrix operation (Transpose, Shift, Series Expand, In-Place Rounding, Freeze Header, Command Palette) and standard essential (Undo/Redo, Date Stamp, Find, Sort, Themes, Trimmer) shares the exact same clean card style with clean, text-only card titles (no leading icons).
7. **Jargon-Free Privacy Explanations & Standard Typography**:
   - Removed technical acronyms; simple, accessible language emphasizing offline freedom, zero server uploads, and no-admin desktop PWA installation.
   - Architecture overview rendered in clean standard sans-serif typography (`.doc-text-table`) instead of console monospace fonts.
8. **Actionable, Non-Technical Settings Context in Discrete 'More tips' Drawers**:
   - Gathers tips, shortcuts, and settings into a subtle, discrete drawer labeled systematically as `More tips ▾` without leading icons.
   - Short, concise bullet points highlighting practical customizations in Settings (`Ctrl+G`).

---

## 2. Target User Personas & Pain Points

| Persona | Core Pain Points | What Makes Them Say *"Oh, I Can Do That?!"* |
| :--- | :--- | :--- |
| **Data Engineer / Pipeline Developer** | Needs to inspect multi-gigabyte logs/dumps to check headers before writing PySpark/BigQuery/Pandas pipelines. Excel crashes or locks system memory. | **Instant Large File View ($O(1)$ preview)**: Opens 2.5 GB files in <200ms by sampling top, intervals, and footer in a safe read-only worker. |
| **Database Administrator (DBA)** | Preparing CSV files for PostgreSQL `\COPY`, Snowflake `COPY INTO`, or MySQL `LOAD DATA INFILE`. Imports fail due to spaces/symbols in headers, duplicate column names, stray quotes, or newlines in cells. | **1-Click SQL & CSV Validation**: `Ctrl+Shift+H` auto-sanitizes headers to SQL format and resolves duplicates; `Ctrl+Shift+P` cleans data issues with 1-click batch accept. |
| **Data Analyst / Operations Specialist** | Editing customer records, zip codes (`02138`), phone numbers (`+44...`), or product SKUs (`9876E5`). Excel silently erases leading zeros, drops signs, or turns SKUs into exponential floats. | **Strict Verbatim Data Accuracy**: Zero unexpected type conversions. CSV is treated strictly as plain text, preserving exact strings upon save. |
| **International Team Member** | Merging datasets from US (`MM/DD/YYYY`) and European (`DD/MM/YYYY`) branches. Tools corrupt dates by swapping months and days. | **Certainty Date Detection**: Distinguishes date formats with certainty using the $>12$ day rule, or explicitly alerts rather than making dangerous guesses. |
| **Security & Privacy Conscious User** | Working with confidential company records, financial ledgers, or customer data. Online CSV conversion websites risk exposing private data to third-party servers. | **100% Client-Side Privacy**: Runs completely offline in the local browser sandbox; zero bytes ever leave the computer. |

---

## 3. Information Architecture & Section Hierarchy

```
┌────────────────────────────────────────────────────────────────────────┐
│                        1. HERO & QUICK JUMP BAR                        │
│   Headline + 2-min pitch + Quick Jump Pills + Direct "Launch App" CTA  │
├────────────────────────────────────────────────────────────────────────┤
│             2. SPOTLIGHT 1: INSTANT LARGE FILE VIEW (O(1))             │
│   Subtitle: ✨ "Oh, I can open a 2.5 GB CSV in 200ms without freezing?" │
│   Left: Pain Point (Excel crashes) | Right: Solution (Worker stream)   │
│   Visual Table: Spreadsheet row headers + Multiple regular intervals   │
│   In Settings: editMaxFileSize, vo_n_chunks, vo_n_rows                 │
├────────────────────────────────────────────────────────────────────────┤
│             3. SPOTLIGHT 2: STRICT DATA ACCURACY (NO CORRUPTION)       │
│   Subtitle: ✨ "Oh, zip codes keep zeros & phone numbers keep '+'?!"   │
│   Left: Pain Point (Type conversion) | Right: Solution (Pure text)     │
│   Visual Table: Postal codes, phones, SKUs (Excel bad vs NanoCell safe)│
│   In Settings: delimiter, encoding, save_strict, trim                  │
├────────────────────────────────────────────────────────────────────────┤
│             4. SPOTLIGHT 3: 1-CLICK DATA VALIDATION & SMART DATES      │
│   Subtitle: ✨ "Oh, I can auto-clean SQL headers & dates in 10s?!"     │
│   Left: Pain Point (Import crash) | Right: Solution (1-click fixes)    │
│   Shortcut Note Box (Ctrl+Shift+H, Ctrl+Shift+P, Date Format)          │
│   Visual Table: 3 columns, 1 issue/row (Header, Dups, Trim, Commas, LR)│
│   Date Ambiguity Safeguard Note Box                                    │
│   In Settings: Non-technical concise bullet points                     │
├────────────────────────────────────────────────────────────────────────┤
│             5. SPOTLIGHT 4: 100% PRIVATE & AIR-GAPPED                  │
│   Subtitle: ✨ "Oh, my confidential files never touch an external host?!"│
│   Left: Pain Point (Data leakage) | Right: Solution (Local sandbox)    │
│   Simple Accessible Architecture Table (Files, Memory, Network)        │
├────────────────────────────────────────────────────────────────────────┤
│             6. THE STANDARD ESSENTIALS & POWER TOOLS (MERGED)          │
│   Subtitle: ✨ "Oh, I can transpose & shift without touching mouse?!"  │
│   Consolidated Card Grid: Transpose, Shift, Series, Round, Freeze,     │
│   Command Palette, Date Stamp (Ctrl+;), Undo/Redo, Find, Sort, Themes  │
│   In Settings: Viewport rows/cols, sort header/number options          │
├────────────────────────────────────────────────────────────────────────┤
│             7. CALL TO ACTION & SYSTEM FOOTER                          │
│   Launch App CTA banner + Links to GitHub, Home, Terms & License       │
└────────────────────────────────────────────────────────────────────────┘
```

---

## 4. Visual Design System & UI Patterns

### 4.1 Token & Palette Reuse
- **Primary Accent**: `--green: #48a741;` (NanoCell's signature brand green used for buttons, active links, and positive outcomes).
- **Backgrounds**: Alternating clean white (`#ffffff`) and soft neutral grey (`--grey: #f7f7f7;`), mirroring `index.html:85-87`.
- **Typography**: System sans-serif for UI prose, paired with `"Inconsolata", monospace` for cell data, shortcuts, and code blocks.

### 4.2 Component Patterns
1. **Pain Point vs. Solution Panes (`.comparison-grid`, `.comparison-col`)**:
   - Left (`.col-bad`): `#fff8f8` background, `#fecaca` border, clean title `The Pain Point`.
   - Right (`.col-good`): `#f4fbf5` background, `#bbf7d0` border, clean title `The NanoCell Solution`.
2. **Spreadsheet Row Header Column & Scrollable Viewport (`.row-header`, `.scrollable-stream-container`)**:
   - Displays clean numerical row indicators (`1`, `2`, `3`...) with a right border, matching desktop spreadsheet software.
   - Bounded height (`max-height: 300px`) with vertical scrolling and sticky column headers for realistic data inspection.
3. **Stream Interval Dividers (`.stream-row-gap`)**:
   - Centered, padded dividers showing sample distribution across multi-million-row files without parsing the whole file.
4. **Clean 3-Column Validation Table**:
   - Stripped of redundant columns (no target cell or validation scope); displays single issue per row with clear before/after diff tags without text strikethrough.
5. **Discrete Sliding 'More Tips' Container (`.more-tips-container`, `.more-tips-toggle`, `.more-tips-content`)**:
   - Gathers all contextual note boxes (settings, shortcuts, safeguards) in each section into a single, cohesive drawer.
   - Hidden by default with a subtle, non-flashy toggle button (`More tips ▾`) with zero leading icons.
   - Uses CSS grid height transitions (`grid-template-rows: 0fr ➔ 1fr`) to slide smoothly into view when clicked without layout jumps.
   - Keeps primary section views uncluttered and focused on core capabilities and visual examples.
   - All settings boxes explain practical capabilities in simple, high-level terms with zero raw variable names.
6. **Unified Essentials Card Grid (`.essentials-grid`, `.essential-card`)**:
   - Equal-height, responsive card layout with clean, icon-free card titles, dedicated shortcut badges, and hover micro-interactions.
7. **Prose Architecture Tables (`.doc-text-table`)**:
   - Standard system typography (`font-family: sans-serif`) for conceptual/security tables, avoiding console monospace.

---

## 5. Verification & Sign-Off Checklist

- [x] Stream Section column removed from Large File example; row index formatted as spreadsheet row headers with `x`.
- [x] Stream sampling table made vertically scrollable with bounded height (`max-height: 300px`) and sticky header.
- [x] Multiple `! [...] !` dividers displayed at regular intervals in Large File example.
- [x] Validation table simplified to 3 columns (Scope and Target Cell columns removed).
- [x] Single issue per row in Validation table (Header Syntax & Duplicate split).
- [x] All note boxes (shortcuts, safeguards, settings) consolidated into a discrete sliding 'More tips' container in each section.
- [x] 'More tips' drawer hidden by default, sliding into view smoothly when toggled.
- [x] All settings boxes rewritten to provide high-level understanding without variable names.
- [x] Matrix Power Tools merged directly into The Standard Essentials using uniform card styling.
- [x] Privacy section rewritten with simple, accessible language without acronyms/jargon.
- [x] All 366 Vitest tests passing with 100% green status.
- [x] Production build (`npm run build`) bundles `dist/doc.html` in <500ms.

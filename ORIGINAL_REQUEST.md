# Original User Request

## 2026-09-15T10:05:53Z

<USER_REQUEST>
Produce a comprehensive, production-grade architectural and design blueprint (`DESIGN_BLUEPRINT.md` in the project root) for `nanocell-csv` (focusing on `app/`). The blueprint must review the existing codebase and establish solid design principles, software patterns, clean code practices, and naming conventions to stabilize the codebase, facilitate future feature iteration, and decouple the application core from the browser runtime so it can seamlessly operate both as a standalone PWA and as a VSCode Custom Editor extension.

Working directory: c:\Users\c.bonjour\Documents\nanocell-csv
Integrity mode: development

## Requirements

### R1. Forensic Codebase Audit & Current State Diagnostic
Conduct a thorough audit of the existing codebase in `app/` (including `app/js/StateManager.js`, `Dataframe.js`, `Sheet.js`, `CsvHandle.js`, `cmd.js`, `Finder.js`, `Setting.js`, `mouse.js`, `key.js`, Web Workers, and UI Web Components). Identify concrete architectural pain points, tight coupling, hidden state mutations, DOM/business logic entanglements, and scalability bottlenecks.

### R2. Decoupled Target-Agnostic Core Architecture
Formulate an architectural framework that cleanly separates the application into distinct tiers:
1. Pure Headless Core / Domain Model (data structures, CSV parsing/serialization, cell operations, formula evaluation, search, history/command execution) with zero DOM, `window`, or browser dependencies.
2. Presentation & Interaction Layer (Web Components, rendering canvas/DOM virtual table, input event routing, keyboard navigation).
3. Host / Platform Adapter Layer (abstracting runtime-specific capabilities).

### R3. Platform Abstraction Layer (PWA vs. VSCode Dual-Targeting)
Specify complete interface contracts and architectural boundaries enabling the application to run interchangeably as a standalone web PWA and as a VSCode Custom Editor (`CustomTextEditor` or `CustomReadonlyEditor` webview):
- Storage & File I/O (File System Access API / OPFS for PWA vs. VSCode Webview `postMessage` / document RPC).
- State Synchronization & Dirty Tracking (VSCode undo/redo document buffer integration vs. in-memory Command stack).
- Theme & Styling Adaptation (CSS custom properties bound to system/PWA themes vs. VSCode theme tokens `--vscode-*`).
- Notifications, Dialogs, and Clipboard integration abstraction.

### R4. Design Patterns, Nomenclature & Code Conventions
Define standard design patterns (e.g. Command Pattern, Event Bus / Pub-Sub with typed events, Repository / Adapter, Reactive View-Model / Custom Elements lifecycle) with explicit nomenclature guidelines (file naming, class/interface naming, event topic schemas, method verb conventions) and modular directory reorganization plan.

### R5. Incremental Migration Roadmap & Safety Guardrails
Provide a prioritized, step-by-step refactoring roadmap detailing how to transition the current codebase to the new architecture without breaking existing functionality, maintaining compatibility with the current Vitest suite (`npm test`) and E2E testing framework at each stage.

## Acceptance Criteria

### Deliverable Structure & Completeness
- [ ] A comprehensive markdown blueprint file `DESIGN_BLUEPRINT.md` is generated in the repository root (`c:\Users\c.bonjour\Documents\nanocell-csv\DESIGN_BLUEPRINT.md`).
- [ ] The document includes an Executive Summary, Current State Diagnostic, Target Layered Architecture, Platform Abstraction Layer (PWA vs VSCode), Design Patterns & Nomenclature Catalog, and Step-by-step Migration Roadmap.
- [ ] The document provides concrete structural code snippets/TypeScript interfaces demonstrating the core decoupled contracts and host adapter interfaces.

### Dual-Target Architecture & Feasibility
- [ ] The core data model (`Dataframe` & CSV processing) is designed and specified to operate with zero dependencies on DOM APIs (`window`, `document`, `HTMLElement`), enabling headless execution and testing in Node/worker environments.
- [ ] The host abstraction contract explicitly defines message schemas and lifecycle events required for VSCode `vscode.CustomTextEditorProvider` webview communication (document sync, dirty state, save, open).
- [ ] A side-by-side comparison table maps every host service (File I/O, persistence, theme, clipboard, alerts) between browser PWA implementation and VSCode webview bridge implementation.

### Nomenclature & Code Standards
- [ ] A codified nomenclature standard is provided covering file naming, class/element prefixes, method verbs, and event topic namespaces.
- [ ] A proposed directory layout for `app/` (or `src/`) is detailed showing exact separation of `core/`, `ui/`, `adapters/` (`pwa/`, `vscode/`), and `workers/`.

### Migration & Quality Verification
- [ ] The migration plan breaks refactoring into at least 4 incremental, non-breaking phases with clear verification gates at each phase.
- [ ] The migration strategy ensures existing Vitest tests (`npm test`) and E2E test suites remain executable and green throughout refactoring phases.

</USER_REQUEST>

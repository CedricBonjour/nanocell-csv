# Nanocell-CSV Core Design Principles & Architecture Guide

This document defines the foundational engineering principles and architectural design patterns governing the **Nanocell-CSV** codebase. Every modification, new feature, and refactoring effort must adhere to these guidelines.

---

## The 3 Core Priorities

1. **Performance & Functionality Are Critical**: Never compromise data accuracy, frame-rate budget (<16ms 60fps), sub-millisecond cell edits, or sub-50ms bulk operations for cosmetic abstractions.
2. **No Legacy Holdbacks**: Ruthlessly eliminate dead code, abandoned parallel subsystems, and obsolete browser shims. If a modern standard or cleaner method accomplishes the task, replace the legacy pattern directly.
3. **Minimize Code Footprint**: Conciseness is a virtue. Fewer lines of code mean fewer bugs, smaller bundle size, faster cold boot, and easier maintenance.
4. **No alias** Refactoring is always prefered. 
5. **Minimize crossfile imports and exports** 
---

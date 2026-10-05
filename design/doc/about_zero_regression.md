explain the implication of 6. **Zero-Regression Test Preservation**: The existing 26 test files (343 tests) must remain 100% green at every phase of the refactoring via backward-compatible facade re-exports located at the legacy paths in `app/js/*.js`.

would this add add unecessary complexcity to the code on the long term ?  what are the cons? 


---
The short answer is **yes: if kept in the codebase permanently, maintaining backward-compatible facades in `app/js/*.js` would introduce severe technical debt, cognitive overhead, and architectural friction.**

However, there is an important distinction between **temporary scaffolding during migration** and **permanent architecture**. 

Here is an in-depth breakdown of the implications, the concrete cons, and the recommended way to handle this.

---

### 1. The Short-Term Value: Why the Blueprint Proposed It
In large refactors, the greatest danger is the **"Big Bang" rewrite trap**: you change the directory structure and core APIs on Day 1, instantly breaking all 343 tests. For the next several weeks, tests remain red, leaving you with zero automated way to verify if your mathematical operations, CSV edge-case parsing, or sorting algorithms were silently corrupted.

The facade strategy (a variant of Martin Fowler's **Strangler Fig Pattern**) was designed as a temporary safety net:
- You build the new headless core in `src/core/`.
- The legacy `app/js/Dataframe.js` becomes a thin shim that delegates to `src/core/model/Dataframe.ts`.
- You can run `npm test` after **every single commit**, proving that no core logic was broken during extraction.

---

### 2. The Long-Term Cons & Risks

If these facades are **not deleted** after the migration is complete, they turn from a safety harness into technical debt:

#### Con 1: The "Split-Brain" Codebase & Dual Maintenance Tax
- **Developer Confusion**: When you or a future contributor want to add a feature or fix a bug, where do you look? `app/js/Dataframe.js` or `src/core/model/Dataframe.ts`? 
- **Drift**: Over time, someone will inevitably fix a bug in the facade without updating the core, or add a feature to the core that isn't exposed by the facade. The two implementations drift apart.

#### Con 2: Preserving Architectural Flaws and Quirks in Perpetuity
To keep the legacy tests passing without modifying the test files, the facades are forced to **re-implement the very anti-patterns the refactoring aimed to eliminate**:
- **Simulating the `MS_DELTA` timestamp undo hack**: The new architecture introduces clean, atomic `Transaction` objects. But because legacy tests assert on timestamp grouping (`action.timestamp - prev.timestamp < 100`), the facade has to artificially fabricate and manipulate timestamps to keep those tests happy.
- **Simulating global state coupling**: The new core is headless and pure, but `app/js/Dataframe.js` has to reach into the global `stg.autoRound` setting because legacy tests expect that side-effect.
- **Keeping DOM / Model entanglements**: Shims in `app/js/Sheet.js` must simulate DOM properties (`.slct` classes, cell styles) even if the new rendering engine moves to a virtual canvas or shadow DOM.

#### Con 3: False Confidence — "Testing the Shim, Not the Production App"
This is the most dangerous long-term risk.
- The standalone PWA and the VSCode extension will import directly from `src/core/` and `src/adapters/`.
- The tests in `tests/` will still be importing from `app/js/`.
- **Result**: You are heavily testing a compatibility layer that is **never used by actual end-users in production**. If the real PWA or VSCode bridge has an integration bug, your 343 tests could stay 100% green while the real app fails.

#### Con 4: Build, Bundling & Tree-Shaking Drag
- Maintaining legacy CommonJS/ESM bridge files alongside TypeScript sources complicates Vite/Rollup bundling configs, module resolution paths, and type definitions.
- Dead code elimination (tree-shaking) becomes less effective because the shims touch and re-export wide surface areas.

---

### 3. Does `nanocell-csv` Actually Need Long-Term Backward Compatibility?

In software architecture, backward compatibility is required when you are maintaining a **public library or SDK** (e.g., `lodash`, `react`, `d3`) where unknown third parties consume your internal file paths via npm.

**`nanocell-csv` is an application (PWA + VSCode Extension), not a public npm library.**
- There are no external third-party developers importing `app/js/Dataframe.js` in their own apps.
- The **only** consumers of `app/js/*.js` are:
  1. The app’s own entry point (`home.html` / `main.js`).
  2. The existing test suite in `tests/`.

Therefore, once `main.js` and the test suite are repointed to the new architecture, **the legacy `app/js/` directory has zero reason to exist.**

---

### 4. Recommended Best Practice: The 3-Step "Scaffold & Sunset" Strategy

Instead of treating the facades as permanent architecture, adopt an explicit **Sunset Policy**:

```
[Phase 1 & 2: Build & Verify]
  New Core (src/core/) ◄──── Facades (app/js/) ◄──── Existing Tests (tests/)
  (Tests stay 100% green during core extraction)

[Phase 3: Test Modernization]
  New Core (src/core/) ◄──────────────────────────── Updated Tests (tests/)
                                                     (Update import paths)

[Phase 4: Cleanup & Sunset]
  DELETE app/js/ facades completely!
  Codebase is 100% clean, unified, and free of legacy shims.
```

1. **Use Facades strictly as Phase 1–2 Scaffolding**: Keep `app/js/*.js` shims only while extracting `core/` so you have continuous verification that math, parsing, and data manipulation aren't broken.
2. **Modernize the Test Suite in Phase 3**:
   - Update the `import` statements in `tests/*.test.js` from `../app/js/Dataframe.js` to `../src/core/model/Dataframe.js`.
   - Update tests that assert on the old `MS_DELTA` timestamp grouping to assert on explicit `Transaction` boundaries instead.
3. **Delete the Facades (Hard Sunset)**:
   - Once all tests and UI components point directly to `src/`, delete the `app/js/` facades entirely.
   - This leaves the codebase lean, eliminates the dual maintenance tax, and prevents legacy quirks from lingering.

### Summary
The facade strategy is **an excellent transitional bridge, but a terrible permanent residence**. Use it to safely build the new core without breaking tests, then modernize the test imports and delete the facades.

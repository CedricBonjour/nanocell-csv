/**
 * Unit and End-to-End tests for the Scenario & Demo Engine (ScenarioRunner.js).
 */
import assert from 'node:assert/strict';
import {
  SCENARIOS,
  resolveScenario,
  parseScenarioHash,
  runScenarioHeadless,
  getScenarioController,
  bootScenarioFromHash,
} from '../app/js/scenarios/ScenarioRunner.js';
import { setSheet } from '../app/js/state.js';
import { Dataframe } from '../app/core/Dataframe.js';

export async function runScenarioRunnerTests(): Promise<{ passed: number; failed: number }> {
  let passed = 0;
  let failed = 0;

  async function test(name: string, fn: () => void | Promise<void>) {
    try {
      await fn();
      passed++;
    } catch (err) {
      failed++;
      console.error(`  ❌ FAIL: ${name}`);
      console.error(`     ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  console.log('\n🎬 Running ScenarioRunner Tests...');

  await test('Registry contains 6 scenarios (2 docs, 2 e2e, 2 promo) resolvable by ID and alias', () => {
    assert.equal(SCENARIOS.length, 6);
    const docs = SCENARIOS.filter((s: any) => s.category === 'docs');
    const e2e = SCENARIOS.filter((s: any) => s.category === 'e2e');
    const promo = SCENARIOS.filter((s: any) => s.category === 'promo');
    assert.equal(docs.length, 2);
    assert.equal(e2e.length, 2);
    assert.equal(promo.length, 2);

    assert.equal(resolveScenario('001')?.alias, 'clean-financial-data');
    assert.equal(resolveScenario('clean-financial-data')?.id, '001');
    assert.equal(resolveScenario('#scenario-002')?.alias, 'standardize-dates-headers');
    assert.equal(resolveScenario('e2e-full-pipeline')?.id, '003');
    assert.equal(resolveScenario('e2e-grid-editing-filter')?.id, '004');
    assert.equal(resolveScenario('promo-60s-hero')?.id, '005');
    assert.equal(resolveScenario('promo-power-shortcuts')?.id, '006');
    assert.equal(resolveScenario('non-existent'), null);
  });

  await test('parseScenarioHash: default behavior auto-plays, resets on finish, and shows HUD after', () => {
    const parsedId = parseScenarioHash('#scenario-001');
    assert.ok(parsedId);
    assert.equal(parsedId.scenario.id, '001');
    assert.equal(parsedId.mode, 'play');
    assert.equal(parsedId.autoplay, true);
    assert.equal(parsedId.resetAfterAutoplay, true);
    assert.equal(parsedId.hudMode, 'after');

    const parsedAlias = parseScenarioHash('#scenario-clean-financial-data');
    assert.ok(parsedAlias);
    assert.equal(parsedAlias.scenario.id, '001');
    assert.equal(parsedAlias.hudMode, 'after');
  });

  await test('parseScenarioHash: URL params for immediate HUD, hidden HUD, speed, and reset=0', () => {
    const immediateHud = parseScenarioHash('#scenario-001&hud=1');
    assert.ok(immediateHud);
    assert.equal(immediateHud.hudMode, 'immediate');
    assert.equal(immediateHud.autoplay, false);

    const stepMode = parseScenarioHash('#scenario-002&mode=step');
    assert.ok(stepMode);
    assert.equal(stepMode.mode, 'step');
    assert.equal(stepMode.hudMode, 'immediate');
    assert.equal(stepMode.autoplay, false);

    const promoClean = parseScenarioHash('#demo=promo-60s-hero&hud=0&speed=2&loop=1&reset=0&theme=light');
    assert.ok(promoClean);
    assert.equal(promoClean.scenario.id, '005');
    assert.equal(promoClean.hudMode, 'hidden');
    assert.equal(promoClean.speed, 2);
    assert.equal(promoClean.loop, true);
    assert.equal(promoClean.resetAfterAutoplay, false);
    assert.equal(promoClean.theme, 'light');

    // Unrelated hashes return null so the base app is never affected
    assert.equal(parseScenarioHash(''), null);
    assert.equal(parseScenarioHash('#'), null);
    assert.equal(parseScenarioHash('#settings'), null);
    assert.equal(parseScenarioHash('#scenario-999'), null);
  });

  await test('Headless E2E execution: Scenario 001 (clean-financial-data)', () => {
    const res = runScenarioHeadless('001');
    assert.ok(res.assertionsPassed >= 1);
    assert.equal(res.df.isSaved, true);
    assert.equal(res.df.width, 6);
    assert.equal(res.df.get(2, 1), '1250.00');
    assert.equal(res.df.get(3, 1), 'CHF');
  });

  await test('Headless E2E execution: Scenario 002 (standardize-dates-headers)', () => {
    const res = runScenarioHeadless('standardize-dates-headers');
    assert.ok(res.assertionsPassed >= 1);
    assert.equal(res.df.isSaved, true);
    assert.equal(res.df.get(0, 0), 'order_id');
    assert.equal(res.df.get(1, 0), 'order_id_c2');
    assert.equal(res.df.get(2, 1), '2026-12-25');
  });

  await test('Headless E2E execution: Scenario 003 (e2e-full-pipeline, 60 rows)', () => {
    const res = runScenarioHeadless('e2e-full-pipeline');
    assert.ok(res.assertionsPassed >= 1);
    assert.equal(res.df.height, 61);
    assert.equal(res.df.width, 6);
    assert.equal(res.df.get(2, 1), '3500.00');
    assert.equal(res.df.get(3, 1), 'CHF');
  });

  await test('Headless E2E execution: Scenario 004 (e2e-grid-editing-filter)', () => {
    const res = runScenarioHeadless('e2e-grid-editing-filter');
    assert.ok(res.assertionsPassed >= 2);
    assert.equal(res.df.width, 4);
    assert.equal(res.df.height, 6);
    assert.equal(res.df.get(0, 5), '50');
    assert.equal(res.df.get(1, 2), 'Euro Central');
    assert.equal(res.df.get(2, 1), 'NA-East');
  });

  await test('Headless E2E execution: Scenario 005 (promo-60s-hero)', () => {
    const res = runScenarioHeadless('promo-60s-hero');
    assert.ok(res.assertionsPassed >= 1);
    assert.equal(res.df.width, 5);
    assert.equal(res.df.get(1, 1), '1450.00');
    assert.equal(res.df.get(2, 1), 'CHF');
  });

  await test('Headless E2E execution: Scenario 006 (promo-power-shortcuts)', () => {
    const res = runScenarioHeadless('promo-power-shortcuts');
    assert.ok(res.assertionsPassed >= 1);
    assert.equal(res.df.width, 4);
    assert.equal(res.df.height, 5);
    assert.equal(res.df.get(2, 1), '18.46');
    assert.equal(res.df.get(3, 1), '95');
  });

  await test('Controller lifecycle: auto-play -> reset to raw data -> reveal HUD pill (and &hud=1 immediate mode)', async () => {
    // Prepare a lightweight headless sheet in state for controller playback
    const { sheet } = runScenarioHeadless('001');
    setSheet(sheet);

    // 1. Default load (#scenario-001): plays scenario, resets data to initial raw CSV, then reveals HUD
    const ctrl = await bootScenarioFromHash('#scenario-001&speed=10&delay=0');
    assert.ok(ctrl);
    assert.ok(ctrl.assertionsPassed >= 1, 'Expected scenario assertions to have executed during autoplay');
    assert.equal(ctrl.hudVisible, true, 'Expected HUD pill to be revealed after autoplay + reset');
    // After autoplay + reset, sheet is back to initial 5-column raw data so user can try it themselves
    assert.equal(sheet.df.width, 5);
    assert.equal(sheet.df.get(2, 1), "CHF 1'250.-");
    assert.equal(sheet.df.isSaved, true);

    // Step-by-step interactive controls via HUD
    ctrl.stepTo(5); // Run up to step 5 (applyValidationCol)
    assert.equal(sheet.df.width, 6);
    assert.equal(sheet.df.get(2, 1), '1250.00');
    assert.equal(sheet.df.get(3, 1), 'CHF');

    // Reset button restores initial raw data
    ctrl.resetToInitialData();
    assert.equal(sheet.df.width, 5);
    assert.equal(sheet.df.get(2, 1), "CHF 1'250.-");

    // 2. Direct-to-HUD mode (#scenario-001&hud=1): skips autoplay, stays on initial raw data, shows HUD immediately
    await bootScenarioFromHash('#scenario-001&hud=1');
    assert.equal(ctrl.isPlaying, false);
    assert.equal(ctrl.hudVisible, true);
    assert.equal(sheet.df.width, 5);

    // 3. Clean promo mode (#scenario-001&hud=0): hides HUD completely even after playback
    await bootScenarioFromHash('#scenario-001&hud=0&speed=10&delay=0');
    assert.equal(ctrl.hudVisible, false);

    // 4. Dropdown scenario switcher: switches active scenario directly
    await ctrl.switchScenario('002&hud=1');
    assert.equal(ctrl.currentConfig?.scenario.id, '002');
    assert.equal(ctrl.hudVisible, true);
    assert.equal(sheet.df.get(0, 0), 'Order ID!');

    // 5. Active hover target tracking & cleanup
    const classes = new Set<string>();
    const mockTarget = {
      classList: {
        add: (...tokens: string[]) => tokens.forEach(t => classes.add(t)),
        remove: (...tokens: string[]) => tokens.forEach(t => classes.delete(t)),
      },
      closest: () => null,
    };
    ctrl.addHoverTarget(mockTarget);
    assert.equal(classes.has('nc-scenario-hover'), true);
    ctrl.clearHoverTargets();
    assert.equal(classes.has('nc-scenario-hover'), false);

    setSheet(null);
  });

  return { passed, failed };
}

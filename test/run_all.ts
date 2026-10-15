/**
 * Master test runner for NanoCell CSV headless engine.
 * Executes all test suites and reports aggregate statistics.
 */
import { runCsvParserTests } from './CsvParser.test.js';
import { runSeparatorDetectorTests } from './SeparatorDetector.test.js';
import { runCsvSerializerTests } from './CsvSerializer.test.js';
import { runDataframeTests } from './Dataframe.test.js';
import { runEnvAndPwaTests } from './EnvAndPwa.test.js';
import { runHeaderValidatorTests } from './HeaderValidator.test.js';

console.log('=================================================================');
console.log('🚀 NanoCell CSV: Running Complete CSV Test Suite');
console.log('=================================================================');

const startTime = performance.now();

const parserResults = runCsvParserTests();
const separatorResults = runSeparatorDetectorTests();
const serializerResults = runCsvSerializerTests();
const dataframeResults = runDataframeTests();
const envPwaResults = await runEnvAndPwaTests();
const headerValidatorResults = runHeaderValidatorTests();

const durationMs = Math.round(performance.now() - startTime);

const totalPassed = parserResults.passed + separatorResults.passed + serializerResults.passed + dataframeResults.passed + envPwaResults.passed + headerValidatorResults.passed;
const totalFailed = parserResults.failed + separatorResults.failed + serializerResults.failed + dataframeResults.failed + envPwaResults.failed + headerValidatorResults.failed;
const totalTests = totalPassed + totalFailed;

console.log('\n=================================================================');
console.log('📊 Test Suite Execution Summary:');
console.log('=================================================================');
  console.log(`  CsvParser:         ${parserResults.passed} passed, ${parserResults.failed} failed`);
  console.log(`  SeparatorDetector: ${separatorResults.passed} passed, ${separatorResults.failed} failed`);
  console.log(`  CsvSerializer:     ${serializerResults.passed} passed, ${serializerResults.failed} failed`);
  console.log(`  Dataframe:         ${dataframeResults.passed} passed, ${dataframeResults.failed} failed`);
  console.log(`  EnvAndPwa:         ${envPwaResults.passed} passed, ${envPwaResults.failed} failed`);
  console.log(`  HeaderValidator:   ${headerValidatorResults.passed} passed, ${headerValidatorResults.failed} failed`);
console.log('-----------------------------------------------------------------');
console.log(`  TOTAL:             ${totalPassed} / ${totalTests} passed (${durationMs}ms)`);
console.log('=================================================================');

if (totalFailed > 0) {
  console.error(`\n❌ TEST SUITE FAILED with ${totalFailed} failure(s).\n`);
  process.exit(1);
} else {
  console.log('\n🎉 ALL CSV TESTS PASSED SUCCESSFULLY!\n');
  process.exit(0);
}

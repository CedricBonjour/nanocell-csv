/**
 * Master test runner for NanoCell CSV headless engine.
 * Executes all test suites and reports aggregate statistics.
 */
import { runCsvParserTests } from './CsvParser.test.js';
import { runSeparatorDetectorTests } from './SeparatorDetector.test.js';
import { runEncodingDetectorTests } from './EncodingDetector.test.js';
import { runCsvSerializerTests } from './CsvSerializer.test.js';
import { runDataframeTests } from './Dataframe.test.js';
import { runDataValidatorTests } from './DataValidator.test.js';
import { runEnvAndPwaTests } from './EnvAndPwa.test.js';
import { runFileOpenTests } from './FileOpen.test.js';

console.log('=================================================================');
console.log('🚀 NanoCell CSV: Running Complete CSV Test Suite');
console.log('=================================================================');

const startTime = performance.now();

const parserResults = runCsvParserTests();
const separatorResults = runSeparatorDetectorTests();
const encodingResults = runEncodingDetectorTests();
const serializerResults = runCsvSerializerTests();
const dataframeResults = runDataframeTests();
const validatorResults = runDataValidatorTests();
const envPwaResults = await runEnvAndPwaTests();
const fileOpenResults = await runFileOpenTests();

const durationMs = Math.round(performance.now() - startTime);

const totalPassed = parserResults.passed + separatorResults.passed + encodingResults.passed + serializerResults.passed + dataframeResults.passed + validatorResults.passed + envPwaResults.passed + fileOpenResults.passed;
const totalFailed = parserResults.failed + separatorResults.failed + encodingResults.failed + serializerResults.failed + dataframeResults.failed + validatorResults.failed + envPwaResults.failed + fileOpenResults.failed;
const totalTests = totalPassed + totalFailed;

console.log('\n=================================================================');
console.log('📊 Test Suite Execution Summary:');
console.log('=================================================================');
  console.log(`  CsvParser:         ${parserResults.passed} passed, ${parserResults.failed} failed`);
  console.log(`  SeparatorDetector: ${separatorResults.passed} passed, ${separatorResults.failed} failed`);
  console.log(`  EncodingDetector:  ${encodingResults.passed} passed, ${encodingResults.failed} failed`);
  console.log(`  CsvSerializer:     ${serializerResults.passed} passed, ${serializerResults.failed} failed`);
  console.log(`  Dataframe:         ${dataframeResults.passed} passed, ${dataframeResults.failed} failed`);
  console.log(`  DataValidator:     ${validatorResults.passed} passed, ${validatorResults.failed} failed`);
  console.log(`  EnvAndPwa:         ${envPwaResults.passed} passed, ${envPwaResults.failed} failed`);
  console.log(`  FileOpen:          ${fileOpenResults.passed} passed, ${fileOpenResults.failed} failed`);
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

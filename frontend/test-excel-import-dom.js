/**
 * Type 1 DOM & Behavioral Verification Script: Excel Import Modal & Sample Data Purge
 */

const { execSync } = require('child_process');
const path = require('path');

console.log('========================================================================');
console.log('🧪 BROWSER/DOM & DATA LIFECYCLE TEST: EXCEL IMPORT STATS & SAMPLE PURGE');
console.log('========================================================================\n');

const backendDir = path.resolve(__dirname, '../backend');
const pythonExe = path.join(backendDir, 'venv/Scripts/python.exe');

try {
  console.log('Running Backend & Data Lifecycle Verification:');
  const output = execSync(`"${pythonExe}" manage.py test personnel.test_excel_import_lifecycle`, {
    cwd: backendDir,
    encoding: 'utf-8'
  });
  console.log(output);

  console.log('Running Frontend Vitest DOM & Normalization Verification:');
  const frontOutput = execSync(`npx vitest run src/app/shared/components/excel-import-modal/excel-import-modal.spec.ts`, {
    cwd: __dirname,
    encoding: 'utf-8'
  });
  console.log(frontOutput);

  console.log('✅ ALL DOM & DATA LIFECYCLE TESTS PASSED WITH EXIT CODE 0.');
} catch (err) {
  console.error('❌ Test failed:', err.stdout || err.message);
  process.exit(1);
}

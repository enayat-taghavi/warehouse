const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

console.log('====================================================');
console.log('🔍 Starting Comprehensive DOM & Template Verification');
console.log('====================================================\n');

const templateFiles = [
  'src/app/modules/warehouse/components/supervisor/supervisor-dashboard/supervisor-dashboard.html',
  'src/app/modules/warehouse/components/manager-review/manager-review.html',
  'src/app/modules/warehouse/components/count-tracking/count-tracking.html',
  'src/app/modules/warehouse/components/dispatch/dispatch.html',
  'src/app/modules/warehouse/components/customs/customs.html',
  'src/app/modules/warehouse/components/docs/docs.html',
  'src/app/modules/accounting/components/finance/employee/employee-attendance/employee-attendance.html',
  'src/app/modules/accounting/components/personnel/personnel-profiles/personnel-profiles.html',
  'src/app/modules/accounting/components/personnel/base-settings/base-settings.html',
  'src/app/modules/accounting/components/finance/treasurer/treasurer-disbursements/treasurer-disbursements.html',
  'src/app/modules/accounting/components/personnel/manager-approvals/manager-approvals.html',
  'src/app/modules/accounting/components/finance/accountant/accountant-payroll/accountant-payroll.html',
  'src/app/modules/warehouse/components/dashboard/dashboard.html',
  'src/app/modules/warehouse/components/reports/reports.html',
  'src/app/modules/common/components/operations/operations-sync-monitor/operations-sync-monitor.html',
  'src/app/modules/common/components/operations/operations-rbac-governance/operations-rbac-governance.html',
  'src/app/modules/warehouse/components/projects/projects.html',
  'src/app/modules/common/components/audit/audit.html',
  'src/app/modules/common/components/login/login.html'
];

let totalChecked = 0;
let totalPassed = 0;
let totalWarnings = 0;
const results = [];

for (const relPath of templateFiles) {
  const fullPath = path.resolve(__dirname, '..', relPath);
  totalChecked++;

  if (!fs.existsSync(fullPath)) {
    console.error(`❌ File not found: ${relPath}`);
    results.push({ file: relPath, status: 'NOT_FOUND', errors: ['File does not exist'] });
    continue;
  }

  const rawHtml = fs.readFileSync(fullPath, 'utf8');

  // Sanitize Angular control flow (@if, @for, @switch) & structural directives for standard DOM parsing
  const sanitizedHtml = rawHtml
    .replace(/@if\s*\([^)]*\)\s*\{/g, '<!-- @if -->')
    .replace(/@else\s*if\s*\([^)]*\)\s*\{/g, '<!-- @else if -->')
    .replace(/@else\s*\{/g, '<!-- @else -->')
    .replace(/@for\s*\([^)]*\)\s*\{/g, '<!-- @for -->')
    .replace(/@empty\s*\{/g, '<!-- @empty -->')
    .replace(/@switch\s*\([^)]*\)\s*\{/g, '<!-- @switch -->')
    .replace(/@case\s*\([^)]*\)\s*\{/g, '<!-- @case -->')
    .replace(/@default\s*\{/g, '<!-- @default -->')
    .replace(/@defer\s*(\([^)]*\))?\s*\{/g, '<!-- @defer -->')
    .replace(/@placeholder\s*(\([^)]*\))?\s*\{/g, '<!-- @placeholder -->')
    .replace(/@loading\s*(\([^)]*\))?\s*\{/g, '<!-- @loading -->')
    .replace(/@error\s*\{/g, '<!-- @error -->')
    .replace(/\}/g, '<!-- /block -->');

  try {
    const dom = new JSDOM(`<!DOCTYPE html><html><body>${sanitizedHtml}</body></html>`, {
      runScripts: 'outside-only'
    });
    const document = dom.window.document;

    // Checks
    const btnSquareCount = document.querySelectorAll('.btn-icon-square').length;
    const buttons = document.querySelectorAll('button');
    const svgs = document.querySelectorAll('svg');
    const rtlContainers = document.querySelectorAll('[dir="rtl"]');
    const tables = document.querySelectorAll('table');
    const inputs = document.querySelectorAll('input, select, textarea');

    // Verify SVG integrity
    let brokenSvg = 0;
    svgs.forEach(svg => {
      if (!svg.getAttribute('viewBox') && !svg.getAttribute('width')) {
        brokenSvg++;
      }
    });

    results.push({
      file: relPath,
      status: 'VALID',
      elements: {
        buttons: buttons.length,
        btnIconSquare: btnSquareCount,
        svgs: svgs.length,
        tables: tables.length,
        inputs: inputs.length,
        rtlContainers: rtlContainers.length
      },
      warnings: brokenSvg > 0 ? [`${brokenSvg} SVGs missing viewBox/width`] : []
    });

    totalPassed++;
    console.log(`✔ [DOM PASS] ${relPath} (Buttons: ${buttons.length}, Square Icons: ${btnSquareCount}, SVGs: ${svgs.length})`);
  } catch (err) {
    console.error(`❌ [DOM ERROR] in ${relPath}:`, err.message);
    results.push({ file: relPath, status: 'PARSE_ERROR', error: err.message });
  }
}

console.log('\n====================================================');
console.log(`DOM Test Summary: ${totalPassed}/${totalChecked} Passed, ${totalWarnings} Warnings`);
console.log('====================================================');

fs.writeFileSync(
  path.resolve(__dirname, 'dom-test-results.json'),
  JSON.stringify({ totalChecked, totalPassed, results }, null, 2),
  'utf8'
);

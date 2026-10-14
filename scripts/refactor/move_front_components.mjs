#!/usr/bin/env node
/**
 * scripts/refactor/move_front_components.mjs
 * 
 * اسکریپت بازسازی و انتقال ماژولار کامپوننت‌های فرانت‌اند
 * با استفاده از API رسمی کامپایلر TypeScript (بدون دستکاری دستی regex).
 * 
 * کاربرد:
 *   node scripts/refactor/move_front_components.mjs --step 0-b1
 *   node scripts/refactor/move_front_components.mjs --step 0-b2
 *   node scripts/refactor/move_front_components.mjs <src_folder> <dest_folder>
 */

import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import { createRequire } from 'module';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, '../..');

const BASE_COMMIT = 'bde7841a4798fe24c3f6daf83fa15aaadef9bb20';

const require = createRequire(import.meta.url);
const tsPath = require.resolve('typescript', { paths: [path.join(REPO_ROOT, 'warehouse-front')] });
const ts = require(tsPath);

function toPosix(p) {
  return p.replace(/\\/g, '/');
}

function normalizeAbs(p) {
  return toPosix(path.resolve(REPO_ROOT, p));
}

// ─── جدول نگاشت گام‌ها ────────────────────────────────────────────────────────
const STEP_0_B1_COMMON_FOLDERS = [
  'login',
  'layout',
  'app-launcher',
  'change-password',
  'verify-card',
  'users',
  'operations',
  'audit',
  'health-dashboard',
  'settings'
];

const STEP_0_B2_REMAINING_FOLDERS = {
  // ماژول انبار
  warehouse: [
    'count-tracking',
    'counter',
    'customs',
    'dashboard',
    'dispatch',
    'docs',
    'dynamic-fields',
    'feeding',
    'field',
    'label-designer',
    'manager-review',
    'placeholders',
    'projects',
    'reports',
    'supervisor',
    'wh-settings'
  ],
  // ماژول مالی و پرسنلی
  accounting: [
    'finance',
    'organization',
    'personnel'
  ],
  // باقی‌مانده‌های مشترک
  common: [
    'communications',
    'id-cards'
  ]
};

// ─── کشف تمام فایل‌های TS ───────────────────────────────────────────────────
function findTsFiles(dir) {
  let results = [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.name === 'node_modules' || entry.name === 'dist' || entry.name === '.git' || entry.name === 'out-tsc') {
      continue;
    }
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results = results.concat(findTsFiles(full));
    } else if (entry.isFile() && (entry.name.endsWith('.ts') || entry.name.endsWith('.tsx'))) {
      results.push(full);
    }
  }
  return results;
}

// ─── استخراج Import/Exportها با TypeScript Compiler API ───────────────────────
function extractRelativeImports(sf) {
  const imports = [];

  function visit(node) {
    // 1. static import: import ... from '...'
    // 2. static export: export ... from '...'
    if ((ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) && node.moduleSpecifier) {
      if (ts.isStringLiteral(node.moduleSpecifier)) {
        const text = node.moduleSpecifier.text;
        if (text.startsWith('.')) {
          imports.push({
            node: node.moduleSpecifier,
            specifier: text,
            start: node.moduleSpecifier.getStart(sf),
            end: node.moduleSpecifier.getEnd()
          });
        }
      }
    }

    // 3. dynamic import: import('...')
    if (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword) {
      const arg = node.arguments[0];
      if (arg && ts.isStringLiteral(arg)) {
        const text = arg.text;
        if (text.startsWith('.')) {
          imports.push({
            node: arg,
            specifier: text,
            start: arg.getStart(sf),
            end: arg.getEnd()
          });
        }
      }
    }

    ts.forEachChild(node, visit);
  }

  visit(sf);
  return imports;
}

// ─── تابع اصلی انتقال ────────────────────────────────────────────────────────
export function runMigration(options = {}) {
  const step = options.step || '0-b1';
  let moves = []; // { oldDirAbs, newDirAbs }

  if (options.customMove) {
    moves.push({
      oldDirAbs: normalizeAbs(options.customMove.from),
      newDirAbs: normalizeAbs(options.customMove.to)
    });
  } else if (step === '0-b1') {
    // 1. ادغام platform-shell در modules/common
    const shellOld = normalizeAbs('warehouse-front/src/app/modules/platform-shell');
    const commonNew = normalizeAbs('warehouse-front/src/app/modules/common');

    if (fs.existsSync(shellOld)) {
      console.log(`📦 Merging platform-shell into modules/common via git mv...`);
      execSync(`git mv "${shellOld}" "${commonNew}"`, { cwd: REPO_ROOT, stdio: 'inherit' });
    }

    // 2. ده پوشهٔ common
    for (const comp of STEP_0_B1_COMMON_FOLDERS) {
      const oldDir = normalizeAbs(`warehouse-front/src/app/components/${comp}`);
      const newDir = normalizeAbs(`warehouse-front/src/app/modules/common/components/${comp}`);
      moves.push({ oldDirAbs: oldDir, newDirAbs: newDir });
    }
  } else if (step === '0-b2') {
    // پوشه‌های انبار
    for (const comp of STEP_0_B2_REMAINING_FOLDERS.warehouse) {
      const oldDir = normalizeAbs(`warehouse-front/src/app/components/${comp}`);
      const newDir = normalizeAbs(`warehouse-front/src/app/modules/warehouse/components/${comp}`);
      moves.push({ oldDirAbs: oldDir, newDirAbs: newDir });
    }
    // پوشه‌های مالی
    for (const comp of STEP_0_B2_REMAINING_FOLDERS.accounting) {
      const oldDir = normalizeAbs(`warehouse-front/src/app/components/${comp}`);
      const newDir = normalizeAbs(`warehouse-front/src/app/modules/accounting/components/${comp}`);
      moves.push({ oldDirAbs: oldDir, newDirAbs: newDir });
    }
    // باقی‌مانده مشترک
    for (const comp of STEP_0_B2_REMAINING_FOLDERS.common) {
      const oldDir = normalizeAbs(`warehouse-front/src/app/components/${comp}`);
      const newDir = normalizeAbs(`warehouse-front/src/app/modules/common/components/${comp}`);
      moves.push({ oldDirAbs: oldDir, newDirAbs: newDir });
    }
  }

  // اجرای git mv برای پوشه‌ها
  for (const m of moves) {
    if (fs.existsSync(m.oldDirAbs)) {
      const parentDir = path.dirname(m.newDirAbs);
      if (!fs.existsSync(parentDir)) {
        fs.mkdirSync(parentDir, { recursive: true });
      }
      console.log(`🚚 git mv: ${toPosix(path.relative(REPO_ROOT, m.oldDirAbs))} -> ${toPosix(path.relative(REPO_ROOT, m.newDirAbs))}`);
      execSync(`git mv "${m.oldDirAbs}" "${m.newDirAbs}"`, { cwd: REPO_ROOT, stdio: 'inherit' });
    } else {
      console.log(`ℹ️ Source dir does not exist (already moved?): ${m.oldDirAbs}`);
    }
  }

  // اصلاح فایل index.ts ماژول common اگر قبلاً platform-shell بود
  const commonIndex = path.join(REPO_ROOT, 'warehouse-front/src/app/modules/common/index.ts');
  if (fs.existsSync(commonIndex)) {
    console.log(`📝 Updating modules/common/index.ts exports...`);
    const indexContent = `export * from './components/layout/layout';
export * from './components/login/login';
export * from './components/app-launcher/app-launcher';
export * from './components/change-password/change-password';
export * from './components/verify-card/verify-card';
`;
    fs.writeFileSync(commonIndex, indexContent, 'utf8');
  }

  // اصلاح tsconfig.json مسیر alias پلتفرم شل
  const tsConfigPath = path.join(REPO_ROOT, 'warehouse-front/tsconfig.json');
  if (fs.existsSync(tsConfigPath)) {
    let tsConfigText = fs.readFileSync(tsConfigPath, 'utf8');
    if (tsConfigText.includes('"./src/app/modules/platform-shell/index.ts"')) {
      console.log(`📝 Updating tsconfig.json platform-shell path...`);
      tsConfigText = tsConfigText.replace(
        '"./src/app/modules/platform-shell/index.ts"',
        '"./src/app/modules/common/index.ts"'
      );
      fs.writeFileSync(tsConfigPath, tsConfigText, 'utf8');
    }
  }

  // نگاشت پوشه‌های قدیم به جدید برای فایل‌های در حال تغییر
  function mapTarget(oldTargetAbs) {
    const norm = toPosix(oldTargetAbs);
    for (const m of moves) {
      if (norm === m.oldDirAbs || norm.startsWith(m.oldDirAbs + '/')) {
        const sub = norm.slice(m.oldDirAbs.length);
        return m.newDirAbs + sub;
      }
    }
    return oldTargetAbs;
  }

  function getBaseRelativePath(fileAbs) {
    const norm = toPosix(fileAbs);
    for (const m of moves) {
      if (norm.startsWith(m.newDirAbs + '/')) {
        const sub = norm.slice(m.newDirAbs.length);
        const oldFile = m.oldDirAbs + sub;
        return toPosix(path.relative(REPO_ROOT, oldFile));
      }
    }
    return toPosix(path.relative(REPO_ROOT, fileAbs));
  }

  function getBaseFileContent(baseRel) {
    try {
      return execSync(`git show ${BASE_COMMIT}:${baseRel}`, { cwd: REPO_ROOT, encoding: 'utf8', stdio: ['pipe', 'pipe', 'ignore'] });
    } catch {
      return null;
    }
  }

  // پیمایش فایل‌های TypeScript فرانت‌اند
  console.log(`🔍 Scanning and updating TypeScript imports with TS Compiler API...`);
  const frontAppDir = path.join(REPO_ROOT, 'warehouse-front');
  const tsFiles = findTsFiles(frontAppDir);

  let updatedFileCount = 0;
  let totalImportsUpdated = 0;

  for (const filePath of tsFiles) {
    const fileAbs = normalizeAbs(filePath);
    const baseRel = getBaseRelativePath(fileAbs);

    // منبع حقیقت: محتوای فایل در هش پایهٔ این نشست تا بازنویسی کاملاً idempotent باشد
    let sourceContent = getBaseFileContent(baseRel);
    let isFromBase = true;
    if (sourceContent === null) {
      sourceContent = fs.readFileSync(fileAbs, 'utf8');
      isFromBase = false;
    }

    const sf = ts.createSourceFile(fileAbs, sourceContent, ts.ScriptTarget.Latest, true);
    const imports = extractRelativeImports(sf);
    if (imports.length === 0 && isFromBase) {
      // اگر هیچ ایمپورت نسبی نداشت ولی از بیس خوانده شده بود، همان را ذخیره کنیم
      fs.writeFileSync(fileAbs, sourceContent, 'utf8');
      continue;
    }
    if (imports.length === 0) continue;

    const oldFileDir = toPosix(path.dirname(path.resolve(REPO_ROOT, baseRel)));
    const newFileDir = toPosix(path.dirname(fileAbs));

    const replacements = [];

    for (const imp of imports) {
      const oldTargetAbs = normalizeAbs(path.resolve(oldFileDir, imp.specifier));
      const newTargetAbs = mapTarget(oldTargetAbs);

      let newSpec = toPosix(path.relative(newFileDir, newTargetAbs));
      if (!newSpec.startsWith('.')) {
        newSpec = './' + newSpec;
      }

      if (newSpec !== imp.specifier || isFromBase) {
        const originalQuote = sourceContent[imp.start];
        replacements.push({
          start: imp.start,
          end: imp.end,
          newText: `${originalQuote}${newSpec}${originalQuote}`
        });
      }
    }

    if (replacements.length > 0 || isFromBase) {
      // جایگزینی از انتها به ابتدا تا موقعیت کاراکترهای قبلی تغییر نکند
      replacements.sort((a, b) => b.start - a.start);
      let newContent = sourceContent;
      for (const r of replacements) {
        newContent = newContent.slice(0, r.start) + r.newText + newContent.slice(r.end);
      }
      fs.writeFileSync(fileAbs, newContent, 'utf8');
      updatedFileCount++;
      totalImportsUpdated += replacements.length;
    }
  }

  console.log(`✅ TypeScript imports rewritten: ${totalImportsUpdated} imports across ${updatedFileCount} files.`);

  // ─── اصلاح مسیرهای ثابت فهرست‌شده در طرح ─────────────────────────────────────
  if (step === '0-b1') {
    console.log(`🔧 Updating fixed paths for step 0-b1...`);

    // 1. clickable_ergonomics_baseline.json
    const baselineFile = path.join(REPO_ROOT, 'scripts/e2e/clickable_ergonomics_baseline.json');
    if (fs.existsSync(baselineFile)) {
      console.log(`   - Updating scripts/e2e/clickable_ergonomics_baseline.json`);
      let baseText = fs.readFileSync(baselineFile, 'utf8');
      baseText = baseText.replaceAll('"file": "components/audit/audit.html"', '"file": "modules/common/components/audit/audit.html"');
      fs.writeFileSync(baselineFile, baseText, 'utf8');
    }

    // 2. نگهبان‌های users (38 تا 51)
    const userGuardians = [
      'guardian_38_users_persona_texts.py',
      'guardian_39_users_chunked_list.py',
      'guardian_40_users_avatar_transactional.py',
      'guardian_42_users_role_scope_permissions.py',
      'guardian_44_users_query_params_clean.py',
      'guardian_45_users_mobile_actions.py',
      'guardian_46_users_avatar_contrast.py',
      'guardian_47_users_status_filters.py',
      'guardian_48_users_emergency_normalize.py',
      'guardian_50_users_sensitive_sync.py',
      'guardian_51_users_expiry_cleanup.py'
    ];
    for (const gName of userGuardians) {
      const gPath = path.join(REPO_ROOT, 'scripts/e2e', gName);
      if (fs.existsSync(gPath)) {
        console.log(`   - Updating scripts/e2e/${gName}`);
        let gText = fs.readFileSync(gPath, 'utf8');
        gText = gText.replaceAll(
          'FRONT_DIR / "src" / "app" / "components" / "users"',
          'FRONT_DIR / "src" / "app" / "modules" / "common" / "components" / "users"'
        );
        if (gName === 'guardian_50_users_sensitive_sync.py') {
          gText = gText.replaceAll(
            'FRONT_DIR / "src" / "app" / "components" / "operations"',
            'FRONT_DIR / "src" / "app" / "modules" / "common" / "components" / "operations"'
          );
        }
        fs.writeFileSync(gPath, gText, 'utf8');
      }
    }

    // 3. guardian_header_harmonization.py
    const ghPath = path.join(REPO_ROOT, 'scripts/e2e/guardian_header_harmonization.py');
    if (fs.existsSync(ghPath)) {
      console.log(`   - Updating scripts/e2e/guardian_header_harmonization.py`);
      let ghText = fs.readFileSync(ghPath, 'utf8');
      // جستجوی چندمسیره برای یافتن فایل‌های جابه‌جاشده
      if (!ghText.includes('modules/common/components')) {
        ghText = ghText.replace(
          'ts_path = os.path.join(SRC_DIR, "components", ts_rel)',
          'ts_path = os.path.join(SRC_DIR, "components", ts_rel)\n        if not os.path.exists(ts_path):\n            for sub in ["modules/common/components", "modules/warehouse/components", "modules/accounting/components"]:\n                p = os.path.join(SRC_DIR, sub.replace("/", os.sep), ts_rel)\n                if os.path.exists(p):\n                    ts_path = p\n                    break'
        );
        ghText = ghText.replace(
          'html_path = os.path.join(SRC_DIR, "components", html_rel)',
          'html_path = os.path.join(SRC_DIR, "components", html_rel)\n        if not os.path.exists(html_path):\n            for sub in ["modules/common/components", "modules/warehouse/components", "modules/accounting/components"]:\n                p = os.path.join(SRC_DIR, sub.replace("/", os.sep), html_rel)\n                if os.path.exists(p):\n                    html_path = p\n                    break'
        );
        fs.writeFileSync(ghPath, ghText, 'utf8');
      }
    }

    // 4. scripts/test_guard_hooks.py
    const tghPath = path.join(REPO_ROOT, 'scripts/test_guard_hooks.py');
    if (fs.existsSync(tghPath)) {
      console.log(`   - Updating scripts/test_guard_hooks.py`);
      let tghText = fs.readFileSync(tghPath, 'utf8');
      tghText = tghText.replaceAll(
        "LOGIN = FRONT + 'components' + S + 'login' + S + 'login.html'",
        "LOGIN = FRONT + 'modules' + S + 'common' + S + 'components' + S + 'login' + S + 'login.html'"
      );
      tghText = tghText.replaceAll(
        "TS = FRONT + 'components' + S + 'login' + S + 'login.ts'",
        "TS = FRONT + 'modules' + S + 'common' + S + 'components' + S + 'login' + S + 'login.ts'"
      );
      fs.writeFileSync(tghPath, tghText, 'utf8');
    }

    // 5. warehouse-front/tools/dom-verify.js
    const domVerifyPath = path.join(REPO_ROOT, 'warehouse-front/tools/dom-verify.js');
    if (fs.existsSync(domVerifyPath)) {
      console.log(`   - Updating warehouse-front/tools/dom-verify.js`);
      let domText = fs.readFileSync(domVerifyPath, 'utf8');
      domText = domText.replaceAll(
        "'src/app/components/operations/operations-sync-monitor/operations-sync-monitor.html'",
        "'src/app/modules/common/components/operations/operations-sync-monitor/operations-sync-monitor.html'"
      );
      domText = domText.replaceAll(
        "'src/app/components/operations/operations-rbac-governance/operations-rbac-governance.html'",
        "'src/app/modules/common/components/operations/operations-rbac-governance/operations-rbac-governance.html'"
      );
      domText = domText.replaceAll(
        "'src/app/components/audit/audit.html'",
        "'src/app/modules/common/components/audit/audit.html'"
      );
      domText = domText.replaceAll(
        "'src/app/components/login/login.html'",
        "'src/app/modules/common/components/login/login.html'"
      );
      fs.writeFileSync(domVerifyPath, domText, 'utf8');
    }

    // 6. warehouse-front/tsconfig.test21.spec.json
    const tsTest21Path = path.join(REPO_ROOT, 'warehouse-front/tsconfig.test21.spec.json');
    if (fs.existsSync(tsTest21Path)) {
      console.log(`   - Updating warehouse-front/tsconfig.test21.spec.json`);
      let tsTest21Text = fs.readFileSync(tsTest21Path, 'utf8');
      tsTest21Text = tsTest21Text.replaceAll(
        '"src/app/components/users/users.spec.ts"',
        '"src/app/modules/common/components/users/users.spec.ts"'
      );
      tsTest21Text = tsTest21Text.replaceAll(
        '"src/app/components/operations/companies/companies.dom.spec.ts"',
        '"src/app/modules/common/components/operations/companies/companies.dom.spec.ts"'
      );
      tsTest21Text = tsTest21Text.replaceAll(
        '"src/app/components/operations/companies/company-gdrive-tab/company-gdrive-tab.spec.ts"',
        '"src/app/modules/common/components/operations/companies/company-gdrive-tab/company-gdrive-tab.spec.ts"'
      );
      tsTest21Text = tsTest21Text.replaceAll(
        '"src/app/components/operations/operations-cockpit/operations-cockpit.dom.spec.ts"',
        '"src/app/modules/common/components/operations/operations-cockpit/operations-cockpit.dom.spec.ts"'
      );
      tsTest21Text = tsTest21Text.replaceAll(
        '"src/app/components/operations/operations-sync-monitor/operations-sync-monitor.dom.spec.ts"',
        '"src/app/modules/common/components/operations/operations-sync-monitor/operations-sync-monitor.dom.spec.ts"'
      );
      tsTest21Text = tsTest21Text.replaceAll(
        '"src/app/components/health-dashboard/health-dashboard.dom.spec.ts"',
        '"src/app/modules/common/components/health-dashboard/health-dashboard.dom.spec.ts"'
      );
      tsTest21Text = tsTest21Text.replaceAll(
        '"src/app/components/settings/settings.spec.ts"',
        '"src/app/modules/common/components/settings/settings.spec.ts"'
      );
      tsTest21Text = tsTest21Text.replaceAll(
        '"src/app/components/layout/layout.spec.ts"',
        '"src/app/modules/common/components/layout/layout.spec.ts"'
      );
      fs.writeFileSync(tsTest21Path, tsTest21Text, 'utf8');
    }
  }

  console.log(`🎉 Step ${step} migration complete!`);
}

// ─── CLI Entrypoint ─────────────────────────────────────────────────────────
const args = process.argv.slice(2);
if (args.length >= 2 && !args[0].startsWith('-')) {
  runMigration({ customMove: { from: args[0], to: args[1] } });
} else if (args.includes('--step') && args[args.indexOf('--step') + 1] === '0-b2') {
  runMigration({ step: '0-b2' });
} else {
  runMigration({ step: '0-b1' });
}

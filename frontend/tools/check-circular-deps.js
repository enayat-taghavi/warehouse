/**
 * یافتن وابستگی‌های چرخه‌ای (circular import) میان فایل‌های TypeScript زیر src/.
 *
 * چرا کامپایلر TypeScript و نه regex: تجزیهٔ import/export و resolve مسیرها با خود
 * کامپایلر (که از قبل devDependency پروژه است) و با tsconfig.json انجام می‌شود؛ پس
 * `export * from` در barrelها، import پیش‌فرض+نام‌دار، aliasهای `paths` (مثل
 * platform-shell و warehouse-ui)، کامنت‌ها و رشته‌هایی مثل 'image/*' درست همان‌طور
 * فهمیده می‌شوند که build می‌فهمد. بستهٔ تازه‌ای لازم نیست.
 *
 * دامنه: فقط یال‌های زمان بارگذاری. `import type`، `export type` و import/exportی که
 * همهٔ نام‌هایش `type` باشد در خروجی پاک می‌شوند و حساب نمی‌شوند؛ `import()` پویا
 * (مسیرهای lazy) هم حساب نمی‌شود چون هنگام بارگذاری ماژول اجرا نمی‌شود. import
 * معمولی همیشه یال است، حتی اگر فقط برای تایپ استفاده شود.
 *
 * گزارش: هر مؤلفهٔ قویاً همبند (Tarjan) یک «گروه چرخه» است؛ پس گزارش کامل است و
 * به ترتیب پیمایش فایل‌ها بستگی ندارد. برای هر گروه کوتاه‌ترین چرخهٔ نمونه هم چاپ
 * می‌شود. مسیرها با `/` چاپ می‌شوند تا خروجی ویندوز و لینوکس یکی باشد.
 * کد خروج: ۰ بدون چرخه، ۱ چرخه یافت شد، ۲ خطای اجرا.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const ts = require('typescript');

const TAG = '[check-circular-deps]';
const ROOT = path.resolve(__dirname, '..');

// مسیر واقعی روی دیسک؛ روی ویندوز حروف کوچک/بزرگ و symlink را یکسان می‌کند تا
// './Foo' و './foo' دو گرهٔ جدا نشوند.
const realPaths = new Map();
function realPath(file) {
  let real = realPaths.get(file);
  if (real === undefined) {
    real = fs.realpathSync.native(file);
    realPaths.set(file, real);
  }
  return real;
}

const SRC_DIR = realPath(path.join(ROOT, 'src'));

function isInside(dir, file) {
  const rel = path.relative(dir, file);
  return rel !== '' && !rel.startsWith('..') && !path.isAbsolute(rel);
}

function toDisplay(file) {
  return path.relative(SRC_DIR, file).split(path.sep).join('/');
}

function listSourceFiles(dir) {
  const files = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...listSourceFiles(full));
    } else if (entry.isFile() && entry.name.endsWith('.ts')
      && !entry.name.endsWith('.spec.ts') && !entry.name.endsWith('.d.ts')) {
      files.push(realPath(full));
    }
  }
  return files;
}

function loadCompilerOptions() {
  const configPath = path.join(ROOT, 'tsconfig.json');
  const { config, error } = ts.readConfigFile(configPath, ts.sys.readFile);
  if (error) {
    throw new Error(ts.flattenDiagnosticMessageText(error.messageText, '\n'));
  }
  // فقط compilerOptions لازم است؛ خطای «files خالی» tsconfig ریشه اهمیتی ندارد.
  return ts.parseJsonConfigFileContent(config, ts.sys, ROOT).options;
}

// import/exportی که کامپایلر در خروجی JS پاک می‌کند (isolatedModules بدون
// verbatimModuleSyntax).
function isTypeOnly(statement) {
  if (ts.isImportDeclaration(statement)) {
    const clause = statement.importClause;
    if (!clause) return false; // import './x' برای اثر جانبی
    if (clause.phaseModifier === ts.SyntaxKind.TypeKeyword) return true;
    const named = clause.namedBindings;
    return !clause.name && named !== undefined && ts.isNamedImports(named)
      && named.elements.length > 0 && named.elements.every((el) => el.isTypeOnly);
  }
  if (statement.isTypeOnly) return true;
  const clause = statement.exportClause;
  return clause !== undefined && ts.isNamedExports(clause)
    && clause.elements.length > 0 && clause.elements.every((el) => el.isTypeOnly);
}

function buildGraph(files, warnings) {
  const options = loadCompilerOptions();
  const host = ts.createCompilerHost(options);
  const cache = ts.createModuleResolutionCache(ROOT, host.getCanonicalFileName, options);
  const graph = new Map();
  for (const file of files) {
    const source = ts.createSourceFile(
      file, fs.readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, false, ts.ScriptKind.TS);
    const targets = new Set();
    for (const statement of source.statements) {
      const isModuleStatement = ts.isImportDeclaration(statement)
        || (ts.isExportDeclaration(statement) && statement.moduleSpecifier !== undefined);
      if (!isModuleStatement || !ts.isStringLiteral(statement.moduleSpecifier)
        || isTypeOnly(statement)) continue;
      const specifier = statement.moduleSpecifier.text;
      const resolved = ts.resolveModuleName(specifier, file, options, host, cache).resolvedModule;
      if (!resolved) {
        // import نسبیِ resolveنشده یعنی یالی که دیده نمی‌شود؛ بی‌صدا رد نشود.
        if (specifier.startsWith('.')) warnings.push(`${toDisplay(file)}: '${specifier}'`);
        continue;
      }
      if (resolved.isExternalLibraryImport) continue;
      const target = realPath(path.resolve(resolved.resolvedFileName));
      if (target !== file && isInside(SRC_DIR, target)) targets.add(target);
    }
    graph.set(file, targets);
  }
  // فقط یال‌هایی که به فایلی از همین گراف می‌رسند (نه .d.ts یا json).
  for (const [file, targets] of graph) {
    graph.set(file, [...targets].filter((target) => graph.has(target)).sort());
  }
  return graph;
}

// Tarjan: هر مؤلفهٔ قویاً همبند با بیش از یک فایل یک گروه چرخه است.
function cycleGroups(graph) {
  let counter = 0;
  const index = new Map();
  const low = new Map();
  const stack = [];
  const onStack = new Set();
  const groups = [];

  function visit(node) {
    index.set(node, counter);
    low.set(node, counter);
    counter += 1;
    stack.push(node);
    onStack.add(node);
    for (const next of graph.get(node)) {
      if (!index.has(next)) {
        visit(next);
        low.set(node, Math.min(low.get(node), low.get(next)));
      } else if (onStack.has(next)) {
        low.set(node, Math.min(low.get(node), index.get(next)));
      }
    }
    if (low.get(node) === index.get(node)) {
      const group = [];
      let member;
      do {
        member = stack.pop();
        onStack.delete(member);
        group.push(member);
      } while (member !== node);
      if (group.length > 1) groups.push(group.sort());
    }
  }

  for (const node of graph.keys()) {
    if (!index.has(node)) visit(node);
  }
  return groups.sort((a, b) => (a[0] < b[0] ? -1 : 1));
}

// کوتاه‌ترین چرخه از اولین عضو گروه به خودش (BFS درون گروه).
function shortestCycle(graph, group) {
  const members = new Set(group);
  const start = group[0];
  const previous = new Map([[start, null]]);
  const queue = [start];
  for (let i = 0; i < queue.length; i += 1) {
    const node = queue[i];
    for (const next of graph.get(node)) {
      if (next === start) {
        const back = [];
        for (let at = node; at !== start; at = previous.get(at)) back.push(at);
        return [start, ...back.reverse(), start];
      }
      if (members.has(next) && !previous.has(next)) {
        previous.set(next, node);
        queue.push(next);
      }
    }
  }
  return group;
}

function main() {
  const files = listSourceFiles(SRC_DIR).sort();
  const warnings = [];
  const graph = buildGraph(files, warnings);
  const groups = cycleGroups(graph);

  if (warnings.length > 0) {
    console.warn(`${TAG} ⚠ ${warnings.length} relative import(s) could not be resolved:`);
    warnings.forEach((warning) => console.warn(`  ${warning}`));
  }
  if (groups.length === 0) {
    console.log(`${TAG} ✔ ${files.length} files scanned, no circular imports.`);
    return 0;
  }
  console.error(`${TAG} ✖ ${files.length} files scanned, ${groups.length} circular import group(s):`);
  groups.forEach((group, i) => {
    console.error(`\nGroup ${i + 1} (${group.length} files):`);
    group.forEach((file) => console.error(`  ${toDisplay(file)}`));
    console.error(`  shortest cycle: ${shortestCycle(graph, group).map(toDisplay).join(' -> ')}`);
  });
  return 1;
}

try {
  // exitCode به‌جای process.exit تا خروجیِ لوله‌شده (CI) نیمه‌کاره بریده نشود.
  process.exitCode = main();
} catch (error) {
  console.error(`${TAG} ✖ ${error.message}`);
  process.exitCode = 2;
}

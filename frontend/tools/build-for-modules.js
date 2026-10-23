const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const {
  generateInstalledModules,
  resolveSelectedModules,
  generateInstalledModulesContent,
  getDiscoveredModules,
  TARGET_FILE
} = require('./gen-installed-modules');

let outputPath = null;
const extraArgs = [];

for (let i = 2; i < process.argv.length; i++) {
  const arg = process.argv[i];
  if (arg === '--output-path') {
    if (i + 1 < process.argv.length) {
      outputPath = process.argv[++i];
    }
  } else if (arg.startsWith('--output-path=')) {
    outputPath = arg.slice('--output-path='.length);
  } else if (arg.startsWith('--modules=')) {
    process.env.WH_MODULES = arg.slice('--modules='.length);
  } else {
    extraArgs.push(arg);
  }
}

const rawModules = process.env.WH_MODULES ? process.env.WH_MODULES.trim() : '';
const selectedModules = resolveSelectedModules(rawModules);
const buildModulesText = selectedModules.slice().sort().join(',');

console.log(`[build-for-modules] Modules: [${buildModulesText}]`);

// نسخهٔ commitشده همیشه همهٔ ماژول‌های کشف‌شده است (نگهبان ۵۷) و مولد قطعی است؛ پس بازگردانی از روی
// همان تولید می‌شود، نه از روی فایل درخت کاری که شاید از بیلد نیمه‌کارهٔ قبلی زیرمجموعه مانده باشد.
const committedContent = generateInstalledModulesContent(getDiscoveredModules());

function restoreCommitted() {
  try {
    fs.writeFileSync(TARGET_FILE, committedContent, 'utf8');
    console.log('[build-for-modules] ✔ Restored committed installed-modules.ts (clean tree guaranteed)');
  } catch (restoreErr) {
    console.error('[build-for-modules] ✖ Failed to restore installed-modules.ts:', restoreErr);
  }
}

// با Ctrl-C یا kill هم فهرست کامل برگردد (بدون شنونده، Node بی‌اجرای finally بسته می‌شود)
for (const sig of ['SIGINT', 'SIGTERM', 'SIGHUP']) {
  process.on(sig, () => {
    restoreCommitted();
    process.exit(130);
  });
}

let exitCode = 0;

try {
  // ۱. ساخت installed-modules.ts متناسب با ماژول‌های انتخاب‌شده
  generateInstalledModules(rawModules);

  // ۲. اجرای بیلد استاندارد انگولار (بدون نیاز به پروفایل‌های angular.json)
  const ngArgs = ['build'];
  if (outputPath) {
    ngArgs.push('--output-path', outputPath);
  }
  ngArgs.push(...extraArgs);

  const isWindows = process.platform === 'win32';
  const ngCmd = isWindows ? 'npx.cmd' : 'npx';

  console.log(`[build-for-modules] Running ${ngCmd} ng ${ngArgs.join(' ')}...`);
  const buildResult = spawnSync(ngCmd, ['ng', ...ngArgs], {
    stdio: 'inherit',
    shell: true,
    cwd: path.resolve(__dirname, '..')
  });

  if (buildResult.status !== 0) {
    console.error(`[build-for-modules] ✖ ng build failed with exit code ${buildResult.status}`);
    exitCode = buildResult.status || 1;
  } else {
    // ۳. اجرای پچ Service Worker
    const patchScript = path.join(__dirname, 'patch-ngsw-530.js');
    const patchArgs = [patchScript];
    if (outputPath) {
      patchArgs.push(outputPath);
    }

    const patchResult = spawnSync(process.execPath, patchArgs, {
      stdio: 'inherit',
      cwd: path.resolve(__dirname, '..')
    });

    if (patchResult.status !== 0) {
      console.error(`[build-for-modules] ✖ patch-ngsw-530 failed with exit code ${patchResult.status}`);
      exitCode = patchResult.status || 1;
    } else {
      // ۴. نوشتن برچسب build-modules.txt برای بررسی ناظر و استقرار
      const resolvedOut = outputPath
        ? path.resolve(process.cwd(), outputPath)
        : path.resolve(__dirname, '..', 'dist', 'warehouse-app');
      const browserDir = path.join(resolvedOut, 'browser');

      if (!fs.existsSync(browserDir)) {
        fs.mkdirSync(browserDir, { recursive: true });
      }

      const txtPath = path.join(browserDir, 'build-modules.txt');
      fs.writeFileSync(txtPath, buildModulesText + '\n', 'utf8');
      console.log(`[build-for-modules] ✔ Wrote ${buildModulesText} to ${txtPath}`);
    }
  }
} catch (err) {
  console.error('[build-for-modules] ✖ Unexpected error during build:', err);
  exitCode = 1;
} finally {
  // ۵. بازگرداندن حتمی نسخهٔ متعهدشده به درخت کاری حتی در صورت بروز خطا یا قطع بیلد
  restoreCommitted();
}

if (exitCode !== 0) {
  process.exit(exitCode);
}

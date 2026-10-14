const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

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
  } else {
    extraArgs.push(arg);
  }
}

const rawModules = process.env.WH_MODULES ? process.env.WH_MODULES.trim() : '';
const defaultModules = ['accounting', 'warehouse'];

let selectedModules;
if (!rawModules) {
  selectedModules = [...defaultModules];
} else {
  const parts = rawModules
    .split(',')
    .map(s => s.trim().toLowerCase())
    .filter(Boolean);
  selectedModules = Array.from(new Set(parts.length ? parts : defaultModules)).sort();
}

let profile = null;
let buildModulesText;

if (selectedModules.length === 1 && selectedModules[0] === 'accounting') {
  profile = 'accounting-only';
  buildModulesText = 'accounting';
} else if (selectedModules.length === 1 && selectedModules[0] === 'warehouse') {
  profile = 'warehouse-only';
  buildModulesText = 'warehouse';
} else {
  profile = null;
  buildModulesText = selectedModules.sort().join(',');
}

console.log(`[build-for-modules] Profile: ${profile || 'full (default)'}, Modules: ${buildModulesText}`);

const ngArgs = ['build'];
if (profile) {
  ngArgs.push('--configuration', profile);
}
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
  process.exit(buildResult.status || 1);
}

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
  process.exit(patchResult.status || 1);
}

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

#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const AdmZip = require('adm-zip');

const frontDir = path.resolve(__dirname, '..');
const repoRoot = path.resolve(frontDir, '..');

const pkgPath = path.join(frontDir, 'package.json');
if (!fs.existsSync(pkgPath)) {
  console.error(`package.json not found at: ${pkgPath}`);
  process.exit(1);
}

const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
const version = (pkg.version || '').trim();
if (!version || !/^\d+\.\d+\.\d+$/.test(version)) {
  console.error(`Invalid version in package.json: '${version}'. Expected semver format X.Y.Z.`);
  process.exit(1);
}

const sourceDir = path.join(frontDir, 'dist-mobile', 'warehouse-app', 'browser');
if (!fs.existsSync(sourceDir)) {
  console.error(`Source build directory does not exist: ${sourceDir}`);
  console.error('Run the mobile build first: npm run build:mobile');
  process.exit(1);
}

const indexHtml = path.join(sourceDir, 'index.html');
if (!fs.existsSync(indexHtml)) {
  console.error(`Critical bundle file missing: ${indexHtml}`);
  process.exit(1);
}

const bundlesDir = path.join(frontDir, 'dist-mobile', 'bundles');
fs.mkdirSync(bundlesDir, { recursive: true });

const targetZip = path.join(bundlesDir, `${version}.zip`);

console.log(`Zipping mobile assets from ${sourceDir}...`);
const zip = new AdmZip();
zip.addLocalFolder(sourceDir);
zip.writeZip(targetZip);

const fileBuffer = fs.readFileSync(targetZip);
const sha256 = crypto.createHash('sha256').update(fileBuffer).digest('hex');

const relativeZipPath = path.relative(repoRoot, targetZip).replace(/\\/g, '/');

console.log(`\n======================================================`);
console.log(`Mobile Bundle Created Successfully`);
console.log(`Target Zip: ${targetZip}`);
console.log(`Version:    ${version}`);
console.log(`SHA-256:    ${sha256}`);
console.log(`======================================================\n`);
console.log(`To publish this update bundle to the backend server, run:`);
console.log(`python manage.py publish_mobile_bundle --zip "${relativeZipPath}" --version ${version} --min-native ${version}\n`);

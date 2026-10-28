const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const child_process = require('child_process');
const { parseStrictVersion, versionCodeOf, syncAppVersion } = require('./sync-app-version');

const script = path.resolve(__dirname, 'sync-app-version.js');
const tempDirs = [];

test.after(() => {
  for (const dir of tempDirs) {
    try {
      fs.rmSync(dir, { recursive: true, force: true });
    } catch {}
  }
});

test('a) versionCode calculation', () => {
  assert.strictEqual(versionCodeOf('1.2.3'), 10203);
  assert.strictEqual(versionCodeOf('1.0.0'), 10000);
});

test('b) parseStrictVersion rejects invalid versions', () => {
  assert.strictEqual(parseStrictVersion('1.0'), null);
  assert.strictEqual(parseStrictVersion('1.0.0-beta'), null);
  assert.strictEqual(parseStrictVersion('v1.0.0'), null);
  assert.strictEqual(parseStrictVersion('1.100.0'), null);
});

test('c) syncAppVersion creates files and handles CRLF idempotent sync', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'appver-'));
  tempDirs.push(dir);

  fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify({ version: '1.2.3' }), 'utf8');

  const res1 = syncAppVersion(dir);
  assert.strictEqual(res1.changed.length, 2);

  const tsPath = path.join(dir, 'src', 'app', 'core', 'platform', 'app-version.ts');
  const tsContent = fs.readFileSync(tsPath, 'utf8');
  assert.ok(tsContent.includes("APP_VERSION = '1.2.3'"));
  assert.ok(tsContent.includes('AppChannel'));

  const propsPath = path.join(dir, 'android', 'app', 'version.properties');
  const propsContent = fs.readFileSync(propsPath, 'utf8');
  assert.ok(propsContent.includes('versionCode=10203'));
  assert.ok(propsContent.includes('versionName=1.2.3'));

  const res2 = syncAppVersion(dir);
  assert.strictEqual(res2.changed.length, 0);

  const crlfContent = tsContent.replace(/\r?\n/g, '\r\n');
  fs.writeFileSync(tsPath, crlfContent, 'utf8');

  const res3 = syncAppVersion(dir);
  assert.strictEqual(res3.changed.length, 0);
});

test('d) bad version throws and CLI exits with status 1', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'appver-'));
  tempDirs.push(dir);

  fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify({ version: '1.0' }), 'utf8');

  assert.throws(() => syncAppVersion(dir));

  const child = child_process.spawnSync(process.execPath, [script, '--root', dir]);
  assert.strictEqual(child.status, 1);
});

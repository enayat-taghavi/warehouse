/**
 * تولید همه‌ی آیکن‌ها و splashها (وب/PWA، اندروید و iOS) از یک SVG مرجع:
 * public/icons/icon-512x512.svg. تکرارپذیر: node tools/generate-pwa-assets.js
 * آیکن‌های تمام‌رنگ روی پس‌زمینه‌ی سفید؛ splashها روی background_color در
 * manifest.webmanifest (و در حالت شب روی NIGHT_BG).
 */
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

const root = path.join(__dirname, '..');
const iconsDir = path.join(root, 'public', 'icons');
const svgPath = path.join(iconsDir, 'icon-512x512.svg');
const svg = fs.readFileSync(svgPath);
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'public', 'manifest.webmanifest'), 'utf8'));
const ICON_BG = '#ffffff';
const SPLASH_BG = manifest.background_color || '#f1f5f9';
const NIGHT_BG = '#0f172a';
const PNG = { compressionLevel: 9 };
const androidRes = path.join(root, 'android', 'app', 'src', 'main', 'res');
const iosAssets = path.join(root, 'ios', 'App', 'App', 'Assets.xcassets');

const icon = (size) => sharp(svg, { density: 384 }).resize(size, size).png().toBuffer();

async function save(file, pipeline) {
  await pipeline.png(PNG).toFile(file);
  console.log('wrote', path.relative(root, file));
}

// آیکن در وسط یک بوم رنگی (یا شفاف) با نسبت اندازه‌ی ratio
async function onCanvas(w, h, ratio, background) {
  const inner = Math.round(Math.min(w, h) * ratio);
  return sharp({ create: { width: w, height: h, channels: 4, background } })
    .composite([{ input: await icon(inner), gravity: 'centre' }]);
}

// بوم سفید با شکل گرد (دایره یا مربع گوشه‌گرد) و آیکن در وسط؛ بیرون شکل شفاف
async function shaped(size, ratio, round) {
  const r = round ? size / 2 : Math.round(size * 0.18);
  const mask = Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}">` +
    `<rect width="${size}" height="${size}" rx="${r}" ry="${r}" fill="#fff"/></svg>`);
  const base = await (await onCanvas(size, size, ratio, ICON_BG)).png().toBuffer();
  return sharp(base).composite([{ input: mask, blend: 'dest-in' }]);
}

// favicon.ico چنداندازه با ورودی‌های PNG
async function writeIco(file, sizes) {
  const pngs = await Promise.all(sizes.map(async (s) => (await shaped(s, 0.92, false)).png().toBuffer()));
  const header = Buffer.alloc(6 + 16 * sizes.length);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(sizes.length, 4);
  let offset = header.length;
  sizes.forEach((s, i) => {
    const e = 6 + 16 * i;
    header.writeUInt8(s >= 256 ? 0 : s, e);
    header.writeUInt8(s >= 256 ? 0 : s, e + 1);
    header.writeUInt16LE(1, e + 4);
    header.writeUInt16LE(32, e + 6);
    header.writeUInt32LE(pngs[i].length, e + 8);
    header.writeUInt32LE(offset, e + 12);
    offset += pngs[i].length;
  });
  fs.writeFileSync(file, Buffer.concat([header, ...pngs]));
  console.log('wrote', path.relative(root, file));
}

async function splashLike(file, ratio) {
  const { width, height } = await sharp(file).metadata();
  const bg = /night/.test(file) ? NIGHT_BG : SPLASH_BG;
  await save(file, await onCanvas(width, height, ratio, bg));
}

async function web() {
  // SVGهای اندازه‌دار manifest همه همان SVG مرجع با width/height خودشان
  const src = fs.readFileSync(svgPath, 'utf8');
  for (const s of [72, 96, 128, 144, 152, 192, 384]) {
    const out = src.replace(/width="\d+" height="\d+"/, `width="${s}" height="${s}"`);
    fs.writeFileSync(path.join(iconsDir, `icon-${s}x${s}.svg`), out);
  }
  for (const s of [96, 192, 512]) await save(path.join(iconsDir, `icon-${s}x${s}.png`), sharp(await icon(s)));
  // maskable: ناحیه‌ی امن دایره‌ی ۸۰٪؛ آیکن مربعی ۶۸٪ تا گوشه‌ها بریده نشوند
  for (const s of [192, 512]) {
    await save(path.join(iconsDir, `icon-maskable-${s}x${s}.png`), await onCanvas(s, s, 0.68, ICON_BG));
  }
  for (const s of [152, 167, 180]) {
    await save(path.join(iconsDir, `apple-touch-icon-${s}.png`), await onCanvas(s, s, 0.84, ICON_BG));
  }
  const splashes = [[1170, 2532], [1179, 2556], [1290, 2796], [1284, 2778], [750, 1334], [1125, 2436], [828, 1792]];
  for (const [w, h] of splashes) {
    await save(path.join(iconsDir, `apple-splash-${w}x${h}.png`), await onCanvas(w, h, 0.25, SPLASH_BG));
  }
  await writeIco(path.join(root, 'public', 'favicon.ico'), [16, 32, 48]);
}

async function android() {
  const legacy = { ldpi: 36, mdpi: 48, hdpi: 72, xhdpi: 96, xxhdpi: 144, xxxhdpi: 192 };
  for (const [d, s] of Object.entries(legacy)) {
    const dir = path.join(androidRes, `mipmap-${d}`);
    await save(path.join(dir, 'ic_launcher.png'), await shaped(s, 0.8, false));
    await save(path.join(dir, 'ic_launcher_round.png'), await shaped(s, 0.72, true));
    // لایه‌های adaptive (۱۰۸dp)؛ ic_launcher.xml هر دو را ۱۶.۷٪ inset می‌کند
    const a = Math.round(s * 2.25);
    await save(path.join(dir, 'ic_launcher_foreground.png'),
      await onCanvas(a, a, 0.78, { r: 0, g: 0, b: 0, alpha: 0 }));
    await save(path.join(dir, 'ic_launcher_background.png'),
      sharp({ create: { width: a, height: a, channels: 4, background: ICON_BG } }));
  }
  const splashDirs = fs.readdirSync(androidRes).filter((d) => d.startsWith('drawable'));
  for (const d of splashDirs) {
    const file = path.join(androidRes, d, 'splash.png');
    if (fs.existsSync(file)) await splashLike(file, 0.3);
  }
}

async function ios() {
  await save(path.join(iosAssets, 'AppIcon.appiconset', 'AppIcon-512@2x.png'),
    (await onCanvas(1024, 1024, 0.84, ICON_BG)).flatten({ background: ICON_BG }));
  const splashDir = path.join(iosAssets, 'Splash.imageset');
  for (const f of fs.readdirSync(splashDir).filter((n) => n.endsWith('.png'))) {
    const file = path.join(splashDir, f);
    const { width, height } = await sharp(file).metadata();
    const bg = /dark/.test(f) ? NIGHT_BG : SPLASH_BG;
    await save(file, await onCanvas(width, height, 0.3, bg));
  }
  // منبع capacitor-assets برای تولیدهای بعدی
  await save(path.join(root, 'resources', 'icon.png'), sharp(await icon(1024)));
  await save(path.join(root, 'resources', 'splash.png'), await onCanvas(2732, 2732, 0.3, SPLASH_BG));
}

async function main() {
  await web();
  await android();
  await ios();
}
main().catch((e) => { console.error(e); process.exit(1); });

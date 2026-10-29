/**
 * تولید آیکن‌های PNG استاندارد PWA (اندروید و iOS) و تصاویر splash آیفون
 * از public/icons/icon-512x512.svg. تکرارپذیر: node tools/generate-pwa-assets.js
 * رنگ پس‌زمینه از theme_color در manifest.webmanifest خوانده می‌شود.
 */
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

const root = path.join(__dirname, '..');
const iconsDir = path.join(root, 'public', 'icons');
const svg = fs.readFileSync(path.join(iconsDir, 'icon-512x512.svg'));
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'public', 'manifest.webmanifest'), 'utf8'));
const bg = manifest.theme_color || manifest.background_color;
const PNG = { compressionLevel: 9 };

const icon = (size) => sharp(svg, { density: 384 }).resize(size, size).png().toBuffer();

async function save(name, pipeline) {
  await pipeline.png(PNG).toFile(path.join(iconsDir, name));
  console.log('wrote', name);
}

// آیکن‌ها روی پس‌زمینه‌ی تمام‌رنگ با ناحیه‌ی امن ~۸۰٪ (maskable) و بدون آن (any)
async function padded(size, ratio) {
  const inner = Math.round(size * ratio);
  return sharp({ create: { width: size, height: size, channels: 4, background: bg } })
    .composite([{ input: await icon(inner), gravity: 'centre' }]);
}

async function main() {
  for (const s of [96, 192, 512]) await save(`icon-${s}x${s}.png`, sharp(await icon(s)));
  for (const s of [192, 512]) await save(`icon-maskable-${s}x${s}.png`, await padded(s, 0.8));
  for (const s of [152, 167, 180]) await save(`apple-touch-icon-${s === 180 ? 180 : s}.png`, await padded(s, 1));

  const splashes = [[1170, 2532], [1179, 2556], [1290, 2796], [1284, 2778], [750, 1334], [1125, 2436], [828, 1792]];
  for (const [w, h] of splashes) {
    const logo = await icon(Math.round(w * 0.25));
    await save(`apple-splash-${w}x${h}.png`,
      sharp({ create: { width: w, height: h, channels: 4, background: bg } })
        .composite([{ input: logo, gravity: 'centre' }]));
  }
}
main().catch((e) => { console.error(e); process.exit(1); });

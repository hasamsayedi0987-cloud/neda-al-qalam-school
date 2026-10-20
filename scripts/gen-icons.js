const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

const src = '/home/z/my-project/public/logo.png';
const outDir = '/home/z/my-project/public/icons';
fs.mkdirSync(outDir, { recursive: true });

async function makeIcon(size, name, round = false) {
  let img = sharp(src).resize(size, size, { fit: 'cover', background: { r: 255, g: 255, b: 255, alpha: 1 } });
  if (round) {
    const mask = Buffer.from(`<svg width="${size}" height="${size}"><circle cx="${size / 2}" cy="${size / 2}" r="${size / 2}" fill="#fff"/></svg>`);
    img = img.composite([{ input: mask, blend: 'dest-in' }]).png();
  } else {
    img = img.png();
  }
  await img.toFile(path.join(outDir, name));
  console.log('made', name);
}

(async () => {
  // PWA icons
  await makeIcon(192, 'icon-192.png');
  await makeIcon(512, 'icon-512.png');
  await makeIcon(180, 'apple-touch-icon.png');
  await makeIcon(512, 'icon-512-round.png', true);
  await makeIcon(192, 'icon-192-round.png', true);
  // favicon
  await sharp(src).resize(64, 64).png().toFile('/home/z/my-project/src/app/favicon.ico').catch(async () => {
    await sharp(src).resize(64, 64).png().toFile('/home/z/my-project/public/favicon.png');
    console.log('favicon fallback png');
  });
  console.log('favicon done');
  // APK launcher icons
  const densities = { 'mdpi': 48, 'hdpi': 72, 'xhdpi': 96, 'xxhdpi': 144, 'xxxhdpi': 192 };
  const apkDir = '/home/z/my-project/apk-build/res';
  for (const [d, s] of Object.entries(densities)) {
    fs.mkdirSync(`${apkDir}/mipmap-${d}`, { recursive: true });
    await sharp(src).resize(s, s).png().toFile(`${apkDir}/mipmap-${d}/ic_launcher.png`);
    await sharp(src).resize(s, s).png().toFile(`${apkDir}/mipmap-${d}/ic_launcher_round.png`);
  }
  console.log('APK icons done');
})();

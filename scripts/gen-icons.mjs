import sharp from 'sharp';
import fs from 'fs';

const svg = fs.readFileSync('/home/z/my-project/public/logo.svg');

async function gen(size, name, opts = {}) {
  await sharp(svg, { density: 300 })
    .resize(size, size)
    .png(opts)
    .toFile(`/home/z/my-project/public/${name}`);
  console.log(`${name}: ${size}x${size} done`);
}

await gen(512, 'icon-512.png');
await gen(192, 'icon-192.png');
await gen(180, 'apple-touch-icon.png');
await gen(32, 'favicon-32.png');
await gen(144, 'dev-thumb.png');
console.log('ALL ICONS DONE');

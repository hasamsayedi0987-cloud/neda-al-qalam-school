const sharp = require('sharp');

const src = '/home/z/my-project/public/logo.png';

(async () => {
  await sharp(src).resize(32, 32).png().toFile('/home/z/my-project/public/favicon-32.png');
  await sharp(src).resize(192, 192).png().toFile('/home/z/my-project/public/icon-192.png');
  await sharp(src).resize(512, 512).png().toFile('/home/z/my-project/public/icon-512.png');
  await sharp(src).resize(180, 180).png().toFile('/home/z/my-project/public/apple-touch-icon.png');
  console.log('root icons regenerated from real logo');
})();

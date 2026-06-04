const fs = require('fs');
const path = require('path');
const sharp = require('sharp');
const pngToIco = require('png-to-ico');

async function main() {
  const logoPath = path.join(__dirname, '..', 'public', 'logo.png');
  const buildDir = path.join(__dirname, '..', 'build');
  const icoPath = path.join(buildDir, 'icon.ico');

  if (!fs.existsSync(logoPath)) {
    console.error('No se encontró public/logo.png');
    process.exit(1);
  }

  fs.mkdirSync(buildDir, { recursive: true });

  const metadata = await sharp(logoPath).metadata();
  const size = Math.max(metadata.width || 256, metadata.height || 256, 256);

  const squarePng = await sharp(logoPath)
    .resize(size, size, {
      fit: 'contain',
      background: { r: 10, g: 22, b: 40, alpha: 1 },
    })
    .png()
    .toBuffer();

  const buf = await pngToIco(squarePng);
  fs.writeFileSync(icoPath, buf);
  console.log('Icono generado:', icoPath);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

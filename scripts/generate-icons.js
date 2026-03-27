'use strict';

const path = require('path');
const fs = require('fs');
const { execSync } = require('child_process');

const ASSETS_DIR = path.join(__dirname, '..', 'assets');

// Ensure assets directory exists
if (!fs.existsSync(ASSETS_DIR)) {
  fs.mkdirSync(ASSETS_DIR, { recursive: true });
  console.log('Created assets/ directory');
}

let sharp;
try {
  sharp = require('sharp');
} catch {
  console.error('sharp not installed. Run: npm install sharp');
  process.exit(1);
}

// SVG placeholder icon (JARVIS-themed: dark bg, cyan J)
const PLACEHOLDER_SVG = `
<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024">
  <rect width="1024" height="1024" rx="180" fill="#0a0a0a"/>
  <rect x="40" y="40" width="944" height="944" rx="160" fill="none" stroke="#00e5ff" stroke-width="8" opacity="0.3"/>
  <!-- Outer ring -->
  <circle cx="512" cy="512" r="440" fill="none" stroke="#00e5ff" stroke-width="3" opacity="0.2"/>
  <circle cx="512" cy="512" r="380" fill="none" stroke="#00e5ff" stroke-width="1" opacity="0.15"/>
  <!-- J letter -->
  <text x="512" y="620" font-family="'Arial Black', Arial, sans-serif" font-size="480" font-weight="900"
        text-anchor="middle" fill="#00e5ff" opacity="0.95">J</text>
  <!-- Scanline effect (subtle) -->
  <line x1="100" y1="200" x2="924" y2="200" stroke="#00e5ff" stroke-width="0.5" opacity="0.05"/>
  <line x1="100" y1="400" x2="924" y2="400" stroke="#00e5ff" stroke-width="0.5" opacity="0.05"/>
  <line x1="100" y1="600" x2="924" y2="600" stroke="#00e5ff" stroke-width="0.5" opacity="0.05"/>
  <line x1="100" y1="800" x2="924" y2="800" stroke="#00e5ff" stroke-width="0.5" opacity="0.05"/>
</svg>
`;

async function generateIcons() {
  console.log('Generating JARVIS icons...\n');

  // Determine source image
  const sourceIconPath = path.join(ASSETS_DIR, 'icon-source.png');
  let sourcePath;

  if (fs.existsSync(sourceIconPath)) {
    console.log('Using existing icon-source.png');
    sourcePath = sourceIconPath;
  } else {
    console.log('No icon-source.png found. Creating placeholder from SVG...');
    const svgBuffer = Buffer.from(PLACEHOLDER_SVG.trim());
    const placeholderPath = path.join(ASSETS_DIR, '_placeholder.png');
    await sharp(svgBuffer)
      .resize(1024, 1024)
      .png()
      .toFile(placeholderPath);
    sourcePath = placeholderPath;
  }

  // 1. Main icon: assets/icon.png (1024x1024)
  const iconPng = path.join(ASSETS_DIR, 'icon.png');
  await sharp(sourcePath)
    .resize(1024, 1024)
    .png()
    .toFile(iconPng);
  console.log('✓ assets/icon.png (1024x1024)');

  // 2. Various sizes for Electron
  const sizes = [16, 32, 48, 64, 128, 256, 512];
  for (const size of sizes) {
    const outPath = path.join(ASSETS_DIR, `icon-${size}.png`);
    await sharp(sourcePath).resize(size, size).png().toFile(outPath);
    console.log(`✓ assets/icon-${size}.png`);
  }

  // 3. Windows .ico using png-to-ico
  try {
    const pngToIco = require('png-to-ico');
    const icoSizes = [16, 32, 48, 64, 128, 256];
    const pngBuffers = await Promise.all(
      icoSizes.map(size =>
        sharp(sourcePath).resize(size, size).png().toBuffer()
      )
    );
    const icoBuffer = await pngToIco(pngBuffers);
    fs.writeFileSync(path.join(ASSETS_DIR, 'icon.ico'), icoBuffer);
    console.log('✓ assets/icon.ico (Windows)');
  } catch (err) {
    console.warn('⚠ Could not generate icon.ico:', err.message);
  }

  // 4. Mac .icns using iconutil (macOS only)
  if (process.platform === 'darwin') {
    try {
      const iconsetDir = path.join(ASSETS_DIR, 'icon.iconset');
      fs.mkdirSync(iconsetDir, { recursive: true });

      const iconsetSizes = [
        { name: 'icon_16x16.png', size: 16 },
        { name: 'icon_16x16@2x.png', size: 32 },
        { name: 'icon_32x32.png', size: 32 },
        { name: 'icon_32x32@2x.png', size: 64 },
        { name: 'icon_64x64.png', size: 64 },
        { name: 'icon_64x64@2x.png', size: 128 },
        { name: 'icon_128x128.png', size: 128 },
        { name: 'icon_128x128@2x.png', size: 256 },
        { name: 'icon_256x256.png', size: 256 },
        { name: 'icon_256x256@2x.png', size: 512 },
        { name: 'icon_512x512.png', size: 512 },
        { name: 'icon_512x512@2x.png', size: 1024 }
      ];

      for (const { name, size } of iconsetSizes) {
        await sharp(sourcePath).resize(size, size).png().toFile(path.join(iconsetDir, name));
      }

      execSync(`iconutil -c icns "${iconsetDir}" -o "${path.join(ASSETS_DIR, 'icon.icns')}"`);
      fs.rmSync(iconsetDir, { recursive: true });
      console.log('✓ assets/icon.icns (macOS)');
    } catch (err) {
      console.warn('⚠ Could not generate icon.icns:', err.message);
    }
  } else {
    console.log('ℹ Skipping icon.icns (macOS only)');
  }

  // Clean up placeholder
  const placeholderPath = path.join(ASSETS_DIR, '_placeholder.png');
  if (fs.existsSync(placeholderPath)) {
    fs.unlinkSync(placeholderPath);
  }

  console.log('\n✓ Icon generation complete!');
}

generateIcons().catch(err => {
  console.error('Icon generation failed:', err.message);
  process.exit(1);
});

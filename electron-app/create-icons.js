const sharp = require('sharp');
const path = require('path');
const fs = require('fs');

async function createIcons() {
  const buildDir = path.join(__dirname, 'build');

  // Create build directory if it doesn't exist
  if (!fs.existsSync(buildDir)) {
    fs.mkdirSync(buildDir, { recursive: true });
  }

  // Simple blue clock icon as SVG
  const svgIcon = `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256">
      <rect width="256" height="256" rx="32" fill="#1890ff"/>
      <circle cx="128" cy="108" r="52" fill="none" stroke="white" stroke-width="10"/>
      <path d="M128 68 L128 108 L154 128" stroke="white" stroke-width="10" stroke-linecap="round" stroke-linejoin="round" fill="none"/>
      <rect x="72" y="176" width="112" height="16" rx="8" fill="white"/>
      <rect x="88" y="200" width="80" height="12" rx="6" fill="white" opacity="0.7"/>
    </svg>
  `;

  try {
    // Create 256x256 PNG
    await sharp(Buffer.from(svgIcon))
      .resize(256, 256)
      .png()
      .toFile(path.join(buildDir, 'icon.png'));
    console.log('✓ Created icon.png (256x256)');

    // Create multiple sizes for ICO
    const sizes = [16, 32, 48, 64, 128, 256];
    const icoImages = [];

    for (const size of sizes) {
      const buffer = await sharp(Buffer.from(svgIcon))
        .resize(size, size)
        .png()
        .toBuffer();
      icoImages.push({ size, buffer });
      console.log(`✓ Created ${size}x${size} for ICO`);
    }

    // Create a simple ICO file (Windows icon format)
    // ICO header: 6 bytes
    // ICO directory entry: 16 bytes per image
    // Image data follows

    const headerSize = 6;
    const dirEntrySize = 16;
    const numImages = icoImages.length;

    let dataOffset = headerSize + (dirEntrySize * numImages);
    const entries = [];
    const imageBuffers = [];

    for (const img of icoImages) {
      entries.push({
        width: img.size === 256 ? 0 : img.size,  // 0 means 256
        height: img.size === 256 ? 0 : img.size,
        colors: 0,  // True color
        reserved: 0,
        planes: 1,
        bitCount: 32,
        size: img.buffer.length,
        offset: dataOffset
      });
      imageBuffers.push(img.buffer);
      dataOffset += img.buffer.length;
    }

    // Build ICO buffer
    const totalSize = dataOffset;
    const icoBuffer = Buffer.alloc(totalSize);
    let pos = 0;

    // ICO header
    icoBuffer.writeUInt16LE(0, pos); pos += 2;     // Reserved
    icoBuffer.writeUInt16LE(1, pos); pos += 2;     // Type: 1 = ICO
    icoBuffer.writeUInt16LE(numImages, pos); pos += 2;

    // Directory entries
    for (const entry of entries) {
      icoBuffer.writeUInt8(entry.width, pos); pos += 1;
      icoBuffer.writeUInt8(entry.height, pos); pos += 1;
      icoBuffer.writeUInt8(entry.colors, pos); pos += 1;
      icoBuffer.writeUInt8(entry.reserved, pos); pos += 1;
      icoBuffer.writeUInt16LE(entry.planes, pos); pos += 2;
      icoBuffer.writeUInt16LE(entry.bitCount, pos); pos += 2;
      icoBuffer.writeUInt32LE(entry.size, pos); pos += 4;
      icoBuffer.writeUInt32LE(entry.offset, pos); pos += 4;
    }

    // Image data
    for (const buf of imageBuffers) {
      buf.copy(icoBuffer, pos);
      pos += buf.length;
    }

    fs.writeFileSync(path.join(buildDir, 'icon.ico'), icoBuffer);
    console.log('✓ Created icon.ico');

    console.log('\nAll icons created successfully!');

  } catch (error) {
    console.error('Error creating icons:', error);
    process.exit(1);
  }
}

createIcons();

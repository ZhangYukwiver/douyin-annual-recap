import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import sharp from "sharp";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const projectDirectory = path.resolve(scriptDirectory, "..");
const buildDirectory = path.join(projectDirectory, "build");
const sourcePath = path.join(buildDirectory, "icon.svg");
const icoSizes = [16, 24, 32, 48, 64, 128, 256];

function createIco(images) {
  const headerSize = 6 + images.length * 16;
  const header = Buffer.alloc(headerSize);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(images.length, 4);

  let imageOffset = headerSize;
  images.forEach(({ size, buffer }, index) => {
    const entryOffset = 6 + index * 16;
    header.writeUInt8(size === 256 ? 0 : size, entryOffset);
    header.writeUInt8(size === 256 ? 0 : size, entryOffset + 1);
    header.writeUInt8(0, entryOffset + 2);
    header.writeUInt8(0, entryOffset + 3);
    header.writeUInt16LE(1, entryOffset + 4);
    header.writeUInt16LE(32, entryOffset + 6);
    header.writeUInt32LE(buffer.length, entryOffset + 8);
    header.writeUInt32LE(imageOffset, entryOffset + 12);
    imageOffset += buffer.length;
  });

  return Buffer.concat([header, ...images.map(({ buffer }) => buffer)]);
}

await mkdir(buildDirectory, { recursive: true });
const svg = await readFile(sourcePath);
const icoImages = [];

for (const size of icoSizes) {
  const buffer = await sharp(svg)
    .resize(size, size, { fit: "cover" })
    .png({ compressionLevel: 9 })
    .toBuffer();
  await writeFile(path.join(buildDirectory, `icon-${size}.png`), buffer);
  icoImages.push({ size, buffer });
}

const appIcon = await sharp(svg)
  .resize(512, 512, { fit: "cover" })
  .png({ compressionLevel: 9 })
  .toBuffer();

await Promise.all([
  writeFile(path.join(buildDirectory, "icon.png"), appIcon),
  writeFile(path.join(buildDirectory, "icon.ico"), createIco(icoImages)),
]);

console.log(`Generated Windows icon assets in ${buildDirectory}`);

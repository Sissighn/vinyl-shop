import { execFile } from "node:child_process";
import { mkdir, readFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const run = promisify(execFile);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const source = path.join(root, "desktop", "assets", "icon.svg");
const iconset = path.join(root, ".desktop", "icon.iconset");
const output = path.join(root, "desktop", "assets", "icon.icns");
const svg = await readFile(source);

await mkdir(iconset, { recursive: true });
for (const size of [16, 32, 128, 256, 512]) {
  await sharp(svg).resize(size, size).png().toFile(path.join(iconset, `icon_${size}x${size}.png`));
  await sharp(svg).resize(size * 2, size * 2).png().toFile(path.join(iconset, `icon_${size}x${size}@2x.png`));
}
await run("iconutil", ["-c", "icns", iconset, "-o", output]);
console.log(`macOS icon ready: ${output}`);

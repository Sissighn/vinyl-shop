import { cp, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const appDir = path.join(root, ".desktop", "app");
const source = path.join(root, "desktop");
const packageInfo = JSON.parse(await readFile(path.join(root, "package.json"), "utf8"));

await mkdir(appDir, { recursive: true });
for (const file of ["main.cjs", "preload.cjs", "setup.html"]) {
  await cp(path.join(source, file), path.join(appDir, file));
}
await writeFile(path.join(appDir, "package.json"), JSON.stringify({
  name: packageInfo.name,
  version: packageInfo.version,
  description: packageInfo.description,
  author: packageInfo.author,
  main: "main.cjs",
  private: true,
}, null, 2));
console.log(`Desktop app shell ready: ${appDir}`);

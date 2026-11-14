import { execFileSync, spawnSync } from "node:child_process";
import { access, copyFile, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { pathToFileURL, fileURLToPath } from "node:url";

if (process.platform !== "darwin") throw new Error("The local Mac launcher requires macOS.");

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const staging = path.join(root, ".desktop", "dev-launcher");
const builtApp = path.join(root, ".desktop", "dev-release", "mac-arm64", "Vinyl Room.app");
const appPath = path.join(os.homedir(), "Applications", "Vinyl Room.app");
const oldAppPath = path.join(os.homedir(), "Applications", "Vinyl Room Dev.app");
const rootPackage = JSON.parse(await readFile(path.join(root, "package.json"), "utf8"));
if (spawnSync("pgrep", ["-f", `${appPath}/Contents/MacOS/Vinyl Room`]).status === 0) {
  throw new Error("Quit Vinyl Room before reinstalling the local launcher.");
}

await mkdir(staging, { recursive: true });
await copyFile(path.join(root, "desktop", "dev-bootstrap.cjs"), path.join(staging, "main.cjs"));
await writeFile(path.join(staging, "package.json"), JSON.stringify({
  name: "vinyl-room-localdev",
  version: rootPackage.version,
  description: rootPackage.description,
  author: rootPackage.author,
  main: "main.cjs",
  private: true,
}, null, 2));
await writeFile(path.join(staging, "project-root.txt"), `${root}\n`);

execFileSync(process.execPath, [path.join(root, "scripts", "build-desktop-icon.mjs")], { cwd: root, stdio: "inherit" });
execFileSync(path.join(root, "node_modules", ".bin", "electron-builder"), [
  "--config", "desktop/electron-builder.dev.cjs", "--mac", "dir", "--arm64",
], { cwd: root, stdio: "inherit" });

async function bundleId(appBundle) {
  const plist = path.join(appBundle, "Contents", "Info.plist");
  try { await access(plist); } catch { return null; }
  try {
    return execFileSync("/usr/libexec/PlistBuddy", [
      "-c", "Print :CFBundleIdentifier", plist,
    ], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
  } catch {
    return null;
  }
}

const existingId = await bundleId(appPath);
if (existingId && existingId !== "com.vinylroom.localdev") {
  throw new Error(`${appPath} is a different app; it was not replaced.`);
}
await rm(appPath, { recursive: true, force: true });
await mkdir(path.dirname(appPath), { recursive: true });
execFileSync("ditto", [builtApp, appPath]);
if (await bundleId(appPath) !== "com.vinylroom.localdev") {
  throw new Error("The installed local launcher did not pass its bundle ID check.");
}

const tempDir = await mkdtemp(path.join(os.tmpdir(), "vinyl-room-dock-"));
const dockFile = path.join(tempDir, "dock.plist");
try {
  execFileSync("defaults", ["export", "com.apple.dock", dockFile]);
  const dockUpdate = `import plistlib,sys
p=sys.argv[1]
url=sys.argv[2]
with open(p,"rb") as f: data=plistlib.load(f)
apps=data.get("persistent-apps",[])
apps=[item for item in apps if item.get("tile-data",{}).get("bundle-identifier") not in ("com.vinylroom.dev","com.vinylroom.localdev")]
apps.append({"tile-data":{"file-data":{"_CFURLString":url,"_CFURLStringType":15},"file-label":"Vinyl Room","bundle-identifier":"com.vinylroom.localdev"},"tile-type":"file-tile"})
data["persistent-apps"]=apps
with open(p,"wb") as f: plistlib.dump(data,f)
`;
  execFileSync("python3", ["-c", dockUpdate, dockFile, pathToFileURL(`${appPath}${path.sep}`).href]);
  execFileSync("defaults", ["import", "com.apple.dock", dockFile]);
  execFileSync("killall", ["Dock"]);
} finally {
  await rm(tempDir, { recursive: true, force: true });
}

if (await bundleId(oldAppPath) === "com.vinylroom.dev") {
  await rm(oldAppPath, { recursive: true, force: true });
}

console.log(`One Vinyl Room icon is installed in the Dock: ${appPath}`);
console.log("Click it to open the current local project. You do not need to build a DMG for code changes.");

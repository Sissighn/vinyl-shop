import { execFileSync } from "node:child_process";
import { chmod, copyFile, mkdir, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { pathToFileURL, fileURLToPath } from "node:url";

if (process.platform !== "darwin") {
  throw new Error("The development launcher is only available on macOS.");
}

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const appPath = path.join(os.homedir(), "Applications", "Vinyl Room Dev.app");
const contents = path.join(appPath, "Contents");
const resources = path.join(contents, "Resources");
const executable = path.join(contents, "MacOS", "VinylRoomDev");
const icon = path.join(root, "desktop", "assets", "icon.icns");

execFileSync(process.execPath, [path.join(root, "scripts", "build-desktop-icon.mjs")], { cwd: root, stdio: "inherit" });

await mkdir(path.dirname(executable), { recursive: true });
await mkdir(resources, { recursive: true });
await writeFile(path.join(resources, "project-path.txt"), `${root}\n`);
await copyFile(icon, path.join(resources, "icon.icns"));
await writeFile(path.join(contents, "Info.plist"), `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>CFBundleDevelopmentRegion</key><string>en</string>
  <key>CFBundleDisplayName</key><string>Vinyl Room Dev</string>
  <key>CFBundleExecutable</key><string>VinylRoomDev</string>
  <key>CFBundleIconFile</key><string>icon.icns</string>
  <key>CFBundleIdentifier</key><string>com.vinylroom.dev</string>
  <key>CFBundleInfoDictionaryVersion</key><string>6.0</string>
  <key>CFBundleName</key><string>Vinyl Room Dev</string>
  <key>CFBundlePackageType</key><string>APPL</string>
  <key>CFBundleShortVersionString</key><string>1.0</string>
  <key>CFBundleVersion</key><string>1</string>
  <key>LSMinimumSystemVersion</key><string>12.0</string>
  <key>NSHighResolutionCapable</key><true/>
</dict></plist>
`);
await writeFile(executable, `#!/bin/zsh
set -euo pipefail
bundle_mac_os="$(cd "$(dirname "$0")" && pwd)"
project_root="$(cat "$bundle_mac_os/../Resources/project-path.txt")"
electron_binary="$project_root/node_modules/electron/dist/Electron.app/Contents/MacOS/Electron"
if [[ ! -x "$electron_binary" ]]; then
  /usr/bin/osascript -e 'display dialog "Vinyl Room development dependencies are missing. Run npm ci in the project folder, then open Vinyl Room Dev again." buttons {"OK"} default button "OK" with title "Vinyl Room Dev"'
  exit 1
fi
if /usr/bin/pgrep -f '/Vinyl Room.app/Contents/MacOS/Vinyl Room' >/dev/null 2>&1; then
  /usr/bin/osascript -e 'tell application id "com.vinylroom.app" to quit' >/dev/null 2>&1 || true
  for attempt in {1..30}; do
    if ! /usr/bin/nc -z 127.0.0.1 17873 >/dev/null 2>&1; then break; fi
    sleep 0.2
  done
fi
cd "$project_root"
unset ELECTRON_RUN_AS_NODE
export VINYL_DESKTOP_DEV=1
exec "$electron_binary" "$project_root/desktop/main.cjs"
`);
await chmod(executable, 0o755);

const dockItems = execFileSync("defaults", ["read", "com.apple.dock", "persistent-apps"], { encoding: "utf8" });
if (!dockItems.includes("com.vinylroom.dev")) {
  const url = pathToFileURL(`${appPath}${path.sep}`).href;
  const tile = `{ "tile-data" = { "file-data" = { "_CFURLString" = "${url}"; "_CFURLStringType" = 15; }; "file-label" = "Vinyl Room Dev"; "bundle-identifier" = "com.vinylroom.dev"; }; "tile-type" = "file-tile"; }`;
  execFileSync("defaults", ["write", "com.apple.dock", "persistent-apps", "-array-add", tile]);
  execFileSync("killall", ["Dock"]);
}

console.log(`Vinyl Room Dev is installed and pinned in the Dock: ${appPath}`);
console.log("Open that icon for the latest project code. Keep the source folder at its current path.");

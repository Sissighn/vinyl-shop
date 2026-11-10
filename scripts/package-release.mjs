import { spawnSync } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const { version } = JSON.parse(await readFile(path.join(root, "package.json"), "utf8"));
const credentialNames = [
  "CSC_LINK", "CSC_KEY_PASSWORD", "APPLE_API_KEY", "APPLE_API_KEY_ID", "APPLE_API_ISSUER", "APPLE_TEAM_ID",
];
const configured = credentialNames.filter((name) => Boolean(process.env[name]));
if (configured.length > 0 && configured.length !== credentialNames.length) {
  throw new Error(`Signing credentials are incomplete: missing ${credentialNames.filter((name) => !process.env[name]).join(", ")}.`);
}
const signed = configured.length === credentialNames.length;

function run(command, args) {
  const result = spawnSync(command, args, { cwd: root, stdio: "inherit", env: process.env });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${command} failed with exit code ${result.status}.`);
}

run(process.execPath, [path.join(root, "scripts", "check-release.mjs")]);
run("npm", ["run", "desktop:build:web"]);
run("npm", ["run", "desktop:icon"]);
run(process.execPath, [path.join(root, "scripts", "prepare-desktop-package.mjs")]);
run(path.join(root, "node_modules", ".bin", "electron-builder"), [
  ...(signed ? ["--config", "desktop/electron-builder.signed.cjs"] : []),
  "--mac", "dmg", "--arm64",
]);

const notes = `# Vinyl Room v${version}\n\n` +
  "An interactive 3D listening room for Spotify albums on your Mac. Arrange eight records on the wall, explore album tracks, and control playback through the Spotify desktop app.\n\n" +
  "This version includes keyboard controls, wall import/export, clearer setup, improved search, and a lighter 3D scene.\n\n" +
  `**Build:** Apple Silicon (arm64), ${signed ? "Developer ID signed and Apple notarized" : "unsigned and not notarized"}.\n\n` +
  "**Requirements:** macOS on Apple Silicon; Spotify Premium and the Spotify desktop app for playback; a Spotify Developer app Client ID for catalog search and playback control.\n";
await writeFile(path.join(root, "release", "RELEASE_NOTES.md"), notes);
console.log(`Release package ready: Vinyl-Room-${version}-arm64.dmg (${signed ? "signed" : "unsigned"}).`);

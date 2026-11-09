import { spawn } from "node:child_process";
import { cp, mkdir, rm } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const standalone = path.join(root, ".next-desktop", "standalone");
const output = path.join(root, ".desktop", "standalone");

await new Promise((resolve, reject) => {
  const child = spawn(path.join(root, "node_modules", ".bin", "next"), ["build"], {
    cwd: root,
    stdio: "inherit",
    env: { ...process.env, VINYL_DESKTOP_BUILD: "1" },
  });
  child.once("error", reject);
  child.once("exit", (code) => code === 0 ? resolve() : reject(new Error(`Next.js build exited with ${code}`)));
});

await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });
await cp(standalone, output, { recursive: true });
await cp(path.join(root, "public"), path.join(output, "public"), { recursive: true });
await cp(path.join(root, ".next-desktop", "static"), path.join(output, ".next-desktop", "static"), { recursive: true });
console.log(`Desktop web bundle ready: ${output}`);

const { app, dialog } = require("electron");
const fs = require("node:fs");
const path = require("node:path");

try {
  const root = fs.readFileSync(path.join(process.resourcesPath, "project-root.txt"), "utf8").trim();
  const entry = path.join(root, "desktop", "main.cjs");
  if (!fs.existsSync(entry)) throw new Error("The Vinyl Room project folder was moved or removed.");
  process.env.VINYL_DESKTOP_DEV = "1";
  process.env.VINYL_DESKTOP_LOCAL_APP = "1";
  require(entry);
} catch (error) {
  app.whenReady().then(() => {
    dialog.showErrorBox("Vinyl Room", `${error.message}\n\nRun npm run desktop:install-dev-launcher from the project folder to repair this app.`);
    app.quit();
  });
}

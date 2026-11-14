const { app, BrowserWindow, dialog, ipcMain, Menu, session, shell, utilityProcess } = require("electron");
const fs = require("node:fs");
const net = require("node:net");
const path = require("node:path");

const desktopDev = !app.isPackaged && process.env.VINYL_DESKTOP_DEV === "1";
if (desktopDev) {
  app.setName("Vinyl Room Dev");
  app.setPath("userData", path.join(app.getPath("appData"), "vinyl-room"));
}
let roomWindow;
let setupWindow;
let serverProcess;
let roomOrigin;
let quitting = false;
const DESKTOP_PORT = 17873;

function settingsPath() {
  return path.join(app.getPath("userData"), "settings.json");
}

function readClientId() {
  try {
    const settings = JSON.parse(fs.readFileSync(settingsPath(), "utf8"));
    return typeof settings.spotifyClientId === "string" ? settings.spotifyClientId : "";
  } catch {
    return "";
  }
}

function openSetup() {
  if (setupWindow && !setupWindow.isDestroyed()) {
    setupWindow.focus();
    return;
  }
  setupWindow = new BrowserWindow({
    width: 560,
    height: 660,
    minWidth: 480,
    minHeight: 590,
    resizable: true,
    title: "Set up Vinyl Room",
    backgroundColor: "#261b1b",
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
    },
  });
  setupWindow.loadFile(path.join(__dirname, "setup.html"));
  setupWindow.webContents.on("will-navigate", (event) => event.preventDefault());
  setupWindow.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  setupWindow.on("closed", () => { setupWindow = null; });
}

function checkDesktopPort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once("error", () => reject(new Error(`Another Vinyl Room app is already running on port ${DESKTOP_PORT}. Quit it completely, then reopen Vinyl Room.`)));
    server.listen(DESKTOP_PORT, "127.0.0.1", () => server.close(resolve));
  });
}

async function waitForServer(origin) {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    if (!serverProcess) throw new Error("The local server exited before it was ready.");
    try {
      const response = await fetch(origin, { signal: AbortSignal.timeout(500) });
      if (response.ok) return;
    } catch {
      // The local server is still starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error("The local server did not start.");
}

function handleNavigation(event, target) {
  let url;
  try { url = new URL(target); } catch { event.preventDefault(); return; }
  if (roomOrigin && url.origin === roomOrigin && url.pathname === "/api/spotify/login" && !/^[a-zA-Z0-9]{32}$/.test(readClientId())) {
    event.preventDefault();
    openSetup();
    return;
  }
  if (roomOrigin && url.origin === roomOrigin) return;
  event.preventDefault();
  if (url.protocol === "https:" && (url.hostname === "accounts.spotify.com" || url.hostname === "open.spotify.com")) {
    void shell.openExternal(url.toString());
  }
}

function hardenSession() {
  session.defaultSession.setPermissionRequestHandler((_contents, _permission, callback) => callback(false));
  session.defaultSession.setPermissionCheckHandler(() => false);
  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    if (!roomOrigin || !details.url.startsWith(`${roomOrigin}/`)) {
      callback({ responseHeaders: details.responseHeaders });
      return;
    }
    callback({ responseHeaders: {
      ...details.responseHeaders,
      "Content-Security-Policy": [
        `default-src 'self'; script-src 'self' 'unsafe-inline'${desktopDev ? " 'unsafe-eval'" : ""}; style-src 'self' 'unsafe-inline'; img-src 'self' data: https://i.scdn.co https://*.scdn.co https://*.spotifycdn.com; connect-src 'self'${desktopDev ? ` ws://127.0.0.1:${DESKTOP_PORT}` : ""}; font-src 'self' data:; object-src 'none'; frame-src 'none'; base-uri 'none'; form-action 'self'`,
      ],
      "X-Content-Type-Options": ["nosniff"],
      "Referrer-Policy": ["no-referrer"],
    } });
  });
}

async function startRoom() {
  if (roomWindow && !roomWindow.isDestroyed()) {
    roomWindow.focus();
    return;
  }
  const clientId = readClientId();
  await checkDesktopPort();
  roomOrigin = `http://127.0.0.1:${DESKTOP_PORT}`;
  const webRoot = desktopDev
    ? path.join(__dirname, "..")
    : app.isPackaged
      ? path.join(process.resourcesPath, "web")
      : path.join(__dirname, "..", ".desktop", "standalone");
  const serverEntry = desktopDev
    ? path.join(webRoot, "node_modules", "next", "dist", "bin", "next")
    : path.join(webRoot, "server.js");
  if (!fs.existsSync(serverEntry)) {
    throw new Error(desktopDev ? "Dependencies are missing. Run npm ci." : "The desktop web bundle is missing. Run npm run desktop:build:web.");
  }

  serverProcess = utilityProcess.fork(serverEntry, desktopDev ? ["dev", "--hostname", "127.0.0.1", "--port", String(DESKTOP_PORT)] : [], {
    cwd: webRoot,
    env: {
      ...process.env,
      NODE_ENV: desktopDev ? "development" : "production",
      VINYL_DESKTOP: "1",
      SPOTIFY_CLIENT_ID: clientId,
      SPOTIFY_REDIRECT_URI: `${roomOrigin}/api/spotify/callback`,
      PORT: String(DESKTOP_PORT),
      HOSTNAME: "127.0.0.1",
    },
  });
  serverProcess.once("exit", () => {
    serverProcess = null;
    if (!quitting && roomWindow && !roomWindow.isDestroyed()) {
      dialog.showErrorBox("Vinyl Room", "The local app server stopped unexpectedly. Please reopen Vinyl Room.");
      roomWindow.close();
    }
  });
  await waitForServer(roomOrigin);
  roomWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 820,
    minHeight: 560,
    title: "Vinyl Room",
    backgroundColor: "#261b1b",
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
    },
  });
  roomWindow.webContents.on("will-navigate", handleNavigation);
  roomWindow.webContents.on("will-redirect", handleNavigation);
  roomWindow.webContents.setWindowOpenHandler(({ url }) => {
    handleNavigation({ preventDefault() {} }, url);
    return { action: "deny" };
  });
  roomWindow.on("closed", () => { roomWindow = null; });
  await roomWindow.loadURL(roomOrigin);
  if (!clientId) openSetup();
  else if (setupWindow && !setupWindow.isDestroyed()) setupWindow.close();
}

function installMenu() {
  Menu.setApplicationMenu(Menu.buildFromTemplate([
    {
      label: "Vinyl Room",
      submenu: [
        { role: "about" },
        { label: "Spotify Settings…", click: openSetup },
        { type: "separator" },
        { role: "hide" },
        { role: "hideOthers" },
        { role: "unhide" },
        { type: "separator" },
        { role: "quit" },
      ],
    },
    { label: "Edit", submenu: [{ role: "undo" }, { role: "redo" }, { type: "separator" }, { role: "cut" }, { role: "copy" }, { role: "paste" }, { role: "selectAll" }] },
    { label: "View", submenu: [{ role: "reload" }, { role: "togglefullscreen" }] },
    { label: "Window", submenu: [{ role: "minimize" }, { role: "close" }] },
  ]));
}

app.whenReady().then(async () => {
  if (desktopDev && process.platform === "darwin") {
    app.dock.setIcon(path.join(__dirname, "assets", "icon.icns"));
  }
  hardenSession();
  installMenu();
  ipcMain.handle("vinyl:initial-client-id", (event) =>
    event.sender === setupWindow?.webContents ? readClientId() : "");
  ipcMain.handle("vinyl:open-dashboard", (event) => {
    if (event.sender === setupWindow?.webContents) {
      void shell.openExternal("https://developer.spotify.com/dashboard");
    }
  });
  ipcMain.handle("vinyl:skip-setup", (event) => {
    if (event.sender === setupWindow?.webContents) {
      setupWindow.close();
      roomWindow?.focus();
    }
  });
  ipcMain.handle("vinyl:save-client-id", async (event, rawValue) => {
    if (event.sender !== setupWindow?.webContents) return { error: "Invalid window." };
    const clientId = String(rawValue).trim();
    if (!/^[a-zA-Z0-9]{32}$/.test(clientId)) {
      return { error: "Enter the 32-character Client ID from your Spotify app." };
    }
    fs.mkdirSync(app.getPath("userData"), { recursive: true });
    fs.writeFileSync(settingsPath(), JSON.stringify({ spotifyClientId: clientId }), { mode: 0o600 });
    if (serverProcess) {
      app.relaunch();
      app.quit();
      return { ok: true };
    }
    try {
      await startRoom();
      return { ok: true };
    } catch (error) {
      return { error: error instanceof Error ? error.message : "Could not start Vinyl Room." };
    }
  });
  try {
    await startRoom();
  } catch (error) {
    dialog.showErrorBox("Vinyl Room", error instanceof Error ? error.message : "Could not start Vinyl Room.");
    openSetup();
  }
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) void startRoom();
  });
});

app.on("before-quit", () => {
  quitting = true;
  serverProcess?.kill();
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

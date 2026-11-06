/* eslint-disable @typescript-eslint/no-require-imports */
const http = require("node:http");
const { app, BrowserWindow, components } = require("electron");

async function main() {
  await app.whenReady();
  if (components) {
    await components.whenReady();
    console.log("DRM components:", JSON.stringify(components.status()));
  } else {
    console.log("DRM components: not available in this Electron build");
  }

  const server = http.createServer((_request, response) => {
    response.setHeader("content-type", "text/html");
    response.end("<!doctype html><title>DRM probe</title>");
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));

  const window = new BrowserWindow({ show: false, webPreferences: { sandbox: true, contextIsolation: true } });
  await window.loadURL(`http://127.0.0.1:${server.address().port}`);
  const result = await window.webContents.executeJavaScript(`(async () => {
    const details = { secureContext: isSecureContext, eme: typeof navigator.requestMediaKeySystemAccess === "function" };
    try {
      await navigator.requestMediaKeySystemAccess("com.widevine.alpha", [{
        initDataTypes: ["cenc"],
        audioCapabilities: [{ contentType: 'audio/mp4; codecs="mp4a.40.2"' }],
      }]);
      details.widevine = true;
    } catch (error) {
      details.widevine = false;
      details.error = String(error);
    }
    return details;
  })()`);
  console.log("DRM probe:", JSON.stringify(result));
  window.destroy();
  server.close();
  app.quit();
}

main().catch((error) => {
  console.error(error);
  app.quit();
  process.exitCode = 1;
});

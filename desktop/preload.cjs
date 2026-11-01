const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("vinylDesktop", {
  initialClientId: () => ipcRenderer.invoke("vinyl:initial-client-id"),
  saveClientId: (value) => ipcRenderer.invoke("vinyl:save-client-id", value),
  openDashboard: () => ipcRenderer.invoke("vinyl:open-dashboard"),
  skipSetup: () => ipcRenderer.invoke("vinyl:skip-setup"),
});

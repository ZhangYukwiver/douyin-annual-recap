const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("desktopRuntime", Object.freeze({
  getCollectorConfig: () => ipcRenderer.invoke("desktop:get-collector-config"),
}));

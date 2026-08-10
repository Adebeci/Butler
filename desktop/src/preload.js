// Minimal, deliberately narrow bridge -- server-select.html can only ever
// call butler:connect with a URL it already validated itself. No general
// IPC surface exposed to the loaded page (and once the real Butler web app
// loads, this preload script isn't even relevant to it -- it doesn't use
// window.butler for anything).
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('butler', {
  connect: (url) => ipcRenderer.invoke('butler:connect', url),
});

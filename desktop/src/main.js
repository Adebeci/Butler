// Butler desktop shell.
//
// Deliberately NOT a ground-up native reimplementation of the Butler UI --
// the real web app (static/index.html) already has every feature this
// session built and tested: SSO, API keys, playback, playlists, discovery,
// admin panel, all of it. Reinventing that in Electron/React would just be
// a slower, less-tested copy of something that already works. Instead this
// is a thin native shell: pick a server once (same idea as the Android
// app's ServerSelectScreen), remember it, then load the real web app
// directly in the window. SSO/OIDC works unmodified -- it's just normal
// browser navigation inside Electron's Chromium, ending on the same-origin
// #oidc_token fragment exactly like it does in a real browser tab.
const { app, BrowserWindow, Menu, shell, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');

const CONFIG_PATH = path.join(app.getPath('userData'), 'server.json');

function loadServerUrl() {
  try {
    return JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8')).serverUrl || null;
  } catch {
    return null;
  }
}

function saveServerUrl(url) {
  fs.writeFileSync(CONFIG_PATH, JSON.stringify({ serverUrl: url }));
}

function clearServerUrl() {
  try { fs.unlinkSync(CONFIG_PATH); } catch {}
}

let mainWindow;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 900,
    minHeight: 600,
    backgroundColor: '#17140F', // matches the web app's --ink background, avoids a white flash on load
    title: 'Butler',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  // Any link the loaded page tries to open in a new window/tab (target=_blank,
  // window.open) goes to the OS's real default browser instead of spawning a
  // second Electron window -- matters for anything in the web UI that links
  // out (GitHub, docs, etc.), not for SSO itself (that stays same-window/
  // same-origin the whole way through).
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  goToServerSelectOrLoad();
  buildMenu();
}

function goToServerSelectOrLoad() {
  const saved = loadServerUrl();
  if (saved) {
    mainWindow.loadURL(saved);
  } else {
    mainWindow.loadFile(path.join(__dirname, 'server-select.html'));
  }
}

function buildMenu() {
  const template = [
    {
      label: 'Butler',
      submenu: [
        {
          label: 'Change Server…',
          click: () => { clearServerUrl(); goToServerSelectOrLoad(); },
        },
        { type: 'separator' },
        { role: 'quit' },
      ],
    },
    {
      label: 'View',
      submenu: [
        { role: 'reload' },
        { role: 'forceReload' },
        { role: 'toggleDevTools' },
        { type: 'separator' },
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { type: 'separator' },
        { role: 'togglefullscreen' },
      ],
    },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

// The server-select page (plain HTML/JS, see server-select.html) calls this
// via the preload bridge once it's confirmed a real Butler server is
// reachable -- same reachability check the Android app uses
// (/auth/oidc/status needs no auth and any Butler server answers it).
ipcMain.handle('butler:connect', (_event, url) => {
  saveServerUrl(url);
  mainWindow.loadURL(url);
});

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});

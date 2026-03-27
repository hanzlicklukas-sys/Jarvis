const { app, BrowserWindow, Tray, Menu, nativeImage, globalShortcut } = require('electron');
const { spawn } = require('child_process');
const path = require('path');

let tray = null;
let win = null;

app.whenReady().then(() => {
  const icon = nativeImage.createFromPath(path.join(__dirname, '../assets/icon.png'));
  tray = new Tray(icon);

  const contextMenu = Menu.buildFromTemplate([
    { label: 'Open JARVIS', click: () => win?.show() },
    { label: 'Quit', click: () => app.quit() }
  ]);
  tray.setContextMenu(contextMenu);
  tray.setToolTip('JARVIS');

  win = new BrowserWindow({
    width: 900,
    height: 600,
    backgroundColor: '#0a0a0a',
    titleBarStyle: 'hiddenInset',
    webPreferences: { nodeIntegration: true, contextIsolation: false }
  });

  win.loadFile(path.join(__dirname, '../ui/index.html'));

  globalShortcut.register('CommandOrControl+Shift+J', () => {
    win?.isVisible() ? win.hide() : win?.show();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

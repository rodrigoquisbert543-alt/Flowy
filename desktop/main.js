const { app, BrowserWindow, shell } = require('electron');

// URL de la implementación de Apps Script (termina en /exec)
const APP_URL = process.env.FLOWY_URL || 'https://script.google.com/macros/s/AKfycbwQBi2FUrxh84dZrOceWeSlkCEdE1ukQPYg6WBXAKmiL-yuJss3bJpmmXxoS_8NYmNCKw/exec';

function createWindow() {
  const win = new BrowserWindow({ width: 1280, height: 800, icon: __dirname + '/icon.png', autoHideMenuBar: true });
  win.loadURL(APP_URL);
  win.webContents.setWindowOpenHandler(({ url }) => { shell.openExternal(url); return { action: 'deny' }; });
}

app.whenReady().then(createWindow);
app.on('window-all-closed', () => app.quit());

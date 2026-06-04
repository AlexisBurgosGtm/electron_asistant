const path = require('path');
const { app, BrowserWindow } = require('electron');
const appPaths = require('./server/appPaths');
const { startServer, stopServer, PORT } = require('./server');

const ICON_PATH = path.join(__dirname, 'public', 'logo.png');

let mainWindow = null;

async function createWindow() {
  await startServer();

  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    backgroundColor: '#0a1628',
    icon: ICON_PATH,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
    },
    autoHideMenuBar: true,
    title: 'Electron Asistant',
  });

  mainWindow.loadURL(`http://localhost:${PORT}`);

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

app.whenReady().then(async () => {
  appPaths.initPaths(app);
  await appPaths.ensureDataFiles();
  await createWindow();
});

app.on('window-all-closed', async () => {
  await stopServer();
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

app.on('before-quit', async () => {
  await stopServer();
});

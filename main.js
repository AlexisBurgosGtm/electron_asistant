const path = require('path');
const { app, BrowserWindow, Tray, Menu, nativeImage } = require('electron');
const appPaths = require('./server/appPaths');
const bridge = require('./electronBridge');
const { startServer, stopServer, PORT } = require('./server');

let mainWindow = null;
let tray = null;
let isQuitting = false;

function getIconPath() {
  const ico = path.join(__dirname, 'build', 'icon.ico');
  const png = path.join(__dirname, 'public', 'logo.png');
  try {
    require('fs').accessSync(ico);
    return ico;
  } catch {
    return png;
  }
}

function getWindowIcon() {
  return nativeImage.createFromPath(getIconPath());
}

function showMainWindow() {
  if (!mainWindow) {
    createWindow();
    return;
  }
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.show();
  mainWindow.focus();
}

function hideToTray() {
  if (!mainWindow) return;
  mainWindow.hide();
  ensureTray();
}

function ensureTray() {
  if (tray) return;

  tray = new Tray(getWindowIcon());
  tray.setToolTip('Electron Asistant');

  tray.on('double-click', showMainWindow);

  tray.setContextMenu(Menu.buildFromTemplate([
    { label: 'Mostrar ventana', click: showMainWindow },
    { type: 'separator' },
    {
      label: 'Salir',
      click: () => {
        isQuitting = true;
        app.quit();
      },
    },
  ]));
}

async function createWindow() {
  await startServer();

  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    backgroundColor: '#0a1628',
    icon: getWindowIcon(),
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
    },
    autoHideMenuBar: true,
    title: 'Electron Asistant',
  });

  mainWindow.loadURL(`http://localhost:${PORT}`);

  mainWindow.on('close', (event) => {
    if (!isQuitting) {
      event.preventDefault();
      hideToTray();
    }
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

if (process.platform === 'win32') {
  app.setAppUserModelId('com.electron.asistant');
}

bridge.on('hide-to-tray', hideToTray);
bridge.on('show-window', showMainWindow);

app.whenReady().then(async () => {
  appPaths.initPaths(app);
  await appPaths.ensureDataFiles();
  await createWindow();
});

app.on('window-all-closed', () => {
  /* mantener en bandeja */
});

app.on('activate', () => {
  showMainWindow();
});

app.on('before-quit', async () => {
  isQuitting = true;
  await stopServer();
});

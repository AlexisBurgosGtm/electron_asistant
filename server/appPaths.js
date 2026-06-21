const fs = require('fs').promises;
const fsSync = require('fs');
const path = require('path');

let dataDir = null;
let bundleDir = null;
let isPackaged = false;
let initialized = false;

function initPaths(electronApp) {
  if (initialized) return;

  bundleDir = path.join(__dirname, '..');
  isPackaged = Boolean(electronApp?.isPackaged);

  if (isPackaged) {
    dataDir = electronApp.getPath('userData');
  } else {
    dataDir = bundleDir;
  }

  initialized = true;
}

function getDataDir() {
  if (!dataDir) {
    dataDir = path.join(__dirname, '..');
  }
  return dataDir;
}

function getBundleDir() {
  return bundleDir || path.join(__dirname, '..');
}

function getIsPackaged() {
  return isPackaged;
}

function conexionesPath() {
  return path.join(getDataDir(), 'conexiones.json');
}

function mantenimientoPath() {
  return path.join(getDataDir(), 'mantenimiento.json');
}

function configPath() {
  return path.join(getDataDir(), 'config.json');
}

function serviciosOnlinePath() {
  return path.join(getDataDir(), 'servicios-online.json');
}

function alarmasPath() {
  return path.join(getDataDir(), 'alarmas.json');
}

function cursorApiPath() {
  return path.join(getDataDir(), 'cursor-api.json');
}

function googleCredentialsPath() {
  return path.join(getDataDir(), 'google-credentials.json');
}

function googleTokensPath() {
  return path.join(getDataDir(), 'google-tokens.json');
}

function whatsappAuthPath() {
  return path.join(getDataDir(), '.wwebjs_auth');
}

function puppeteerCachePath() {
  return path.join(getDataDir(), 'puppeteer-cache');
}

function whatsappWebCachePath() {
  return path.join(getDataDir(), '.wwebjs_cache');
}

function resolveModule(moduleName) {
  if (!isPackaged) {
    return require(moduleName);
  }

  const candidates = [
    path.join(process.resourcesPath, 'app.asar.unpacked', 'node_modules', moduleName),
    path.join(getBundleDir(), 'node_modules', moduleName),
  ];

  for (const candidate of candidates) {
    try {
      return require(candidate);
    } catch {
      /* siguiente */
    }
  }

  return require(moduleName);
}

function resolveModulePath(moduleName) {
  if (!isPackaged) {
    return path.join(getBundleDir(), 'node_modules', moduleName);
  }

  const candidates = [
    path.join(process.resourcesPath, 'app.asar.unpacked', 'node_modules', moduleName),
    path.join(getBundleDir(), 'node_modules', moduleName),
  ];

  for (const candidate of candidates) {
    if (fsSync.existsSync(candidate)) return candidate;
  }

  return path.join(getBundleDir(), 'node_modules', moduleName);
}

function publicPath() {
  return path.join(getBundleDir(), 'public');
}

async function copyIfMissing(source, target, fallbackContent) {
  try {
    await fs.access(target);
    return;
  } catch {
    /* no existe destino */
  }

  try {
    await fs.access(source);
    await fs.copyFile(source, target);
    return;
  } catch {
    /* no existe origen */
  }

  if (fallbackContent !== undefined) {
    await fs.writeFile(target, fallbackContent, 'utf-8');
  }
}

async function migrateGoogleCredentials() {
  const target = googleCredentialsPath();

  try {
    await fs.access(target);
    return;
  } catch {
    /* continuar */
  }

  const candidates = [
    path.join(getBundleDir(), 'google-credentials.json'),
    path.join(path.dirname(process.execPath), 'google-credentials.json'),
  ];

  if (process.resourcesPath) {
    candidates.push(path.join(process.resourcesPath, 'google-credentials.json'));
  }

  for (const source of candidates) {
    try {
      await fs.access(source);
      await fs.copyFile(source, target);
      console.log(`Google credentials copiadas a ${target}`);
      return;
    } catch {
      /* probar siguiente */
    }
  }
}

async function ensureDataFiles() {
  await fs.mkdir(getDataDir(), { recursive: true });

  await copyIfMissing(
    path.join(getBundleDir(), 'conexiones.json'),
    conexionesPath(),
    '[]'
  );

  await copyIfMissing(
    path.join(getBundleDir(), 'mantenimiento.json'),
    mantenimientoPath(),
    '[]'
  );

  await copyIfMissing(
    path.join(getBundleDir(), 'config.json'),
    configPath(),
    JSON.stringify({ whatsapp: { ttsAnnounceSenderOnly: false }, conexiones: { autoPing: true }, hosting: { principalConexionId: null } }, null, 2)
  );

  await copyIfMissing(
    path.join(getBundleDir(), 'servicios-online.json'),
    serviciosOnlinePath(),
    '[]'
  );

  await copyIfMissing(
    path.join(getBundleDir(), 'alarmas.json'),
    alarmasPath(),
    '[]'
  );

  await copyIfMissing(
    path.join(getBundleDir(), 'cursor-api.json'),
    cursorApiPath(),
    '{}'
  );

  await copyIfMissing(
    path.join(getBundleDir(), 'google-credentials.json.example'),
    path.join(getDataDir(), 'google-credentials.json.example')
  );

  await migrateGoogleCredentials();
  await fs.mkdir(puppeteerCachePath(), { recursive: true });
  await fs.mkdir(whatsappAuthPath(), { recursive: true });
  await fs.mkdir(whatsappWebCachePath(), { recursive: true });
}

function getAppInfo() {
  return {
    dataDir: getDataDir(),
    isPackaged: getIsPackaged(),
    googleCredentialsPath: googleCredentialsPath(),
    whatsappAuthPath: whatsappAuthPath(),
  };
}

module.exports = {
  initPaths,
  ensureDataFiles,
  getDataDir,
  getBundleDir,
  getIsPackaged,
  conexionesPath,
  mantenimientoPath,
  configPath,
  serviciosOnlinePath,
  alarmasPath,
  cursorApiPath,
  googleCredentialsPath,
  googleTokensPath,
  whatsappAuthPath,
  whatsappWebCachePath,
  puppeteerCachePath,
  resolveModule,
  resolveModulePath,
  publicPath,
  getAppInfo,
};

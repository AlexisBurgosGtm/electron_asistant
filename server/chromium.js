const fsSync = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const appPaths = require('./appPaths');

const CHROME_FILENAMES = new Set(
  process.platform === 'win32'
    ? ['chrome.exe']
    : process.platform === 'darwin'
      ? ['chrome']
      : ['chrome', 'chrome-wrapper']
);

function findChromeExecutable(rootDir, depth = 0) {
  if (!rootDir || depth > 8 || !fsSync.existsSync(rootDir)) return null;

  let entries;
  try {
    entries = fsSync.readdirSync(rootDir, { withFileTypes: true });
  } catch {
    return null;
  }

  for (const entry of entries) {
    const fullPath = path.join(rootDir, entry.name);
    if (entry.isFile() && CHROME_FILENAMES.has(entry.name)) {
      return fullPath;
    }
  }

  for (const entry of entries) {
    if (!entry.isDirectory() || entry.name.startsWith('.')) continue;
    const found = findChromeExecutable(path.join(rootDir, entry.name), depth + 1);
    if (found) return found;
  }

  return null;
}

function getBundledCacheDir() {
  if (appPaths.getIsPackaged() && process.resourcesPath) {
    const bundled = path.join(process.resourcesPath, 'puppeteer-cache');
    if (fsSync.existsSync(bundled)) return bundled;
  }

  const devBundle = path.join(appPaths.getBundleDir(), 'build', 'puppeteer-cache');
  if (fsSync.existsSync(devBundle)) return devBundle;

  return null;
}

function setupPuppeteerEnv() {
  const userCache = appPaths.puppeteerCachePath();
  const bundledCache = getBundledCacheDir();

  if (bundledCache) {
    process.env.PUPPETEER_CACHE_DIR = bundledCache;
  } else {
    process.env.PUPPETEER_CACHE_DIR = userCache;
  }

  process.env.PUPPETEER_DOWNLOAD_PATH = userCache;

  return { userCache, bundledCache };
}

async function resolveChromiumExecutable() {
  const { userCache, bundledCache } = setupPuppeteerEnv();

  const searchDirs = [...new Set([bundledCache, userCache, process.env.PUPPETEER_CACHE_DIR].filter(Boolean))];
  for (const dir of searchDirs) {
    const execPath = findChromeExecutable(dir);
    if (execPath) return execPath;
  }

  let puppeteer;
  try {
    puppeteer = appPaths.resolveModule('puppeteer');
    const execPath = puppeteer.executablePath();
    if (execPath && fsSync.existsSync(execPath)) return execPath;
  } catch {
    /* continuar */
  }

  try {
    process.env.PUPPETEER_CACHE_DIR = userCache;
    const puppeteerCli = path.join(
      appPaths.resolveModulePath('puppeteer'),
      'lib',
      'cjs',
      'puppeteer',
      'node',
      'cli.js'
    );

    if (fsSync.existsSync(puppeteerCli)) {
      const result = spawnSync(
        process.execPath,
        [puppeteerCli, 'browsers', 'install', 'chrome'],
        {
          env: {
            ...process.env,
            PUPPETEER_CACHE_DIR: userCache,
            PUPPETEER_DOWNLOAD_PATH: userCache,
          },
          stdio: 'ignore',
        }
      );

      if (result.status === 0) {
        const execPath = findChromeExecutable(userCache);
        if (execPath) return execPath;
      }
    }
  } catch (err) {
    console.warn('WhatsApp: descarga de Chrome falló:', err.message);
  }

  throw new Error(
    'Chromium no está disponible. Reinstala la aplicación o conéctate a internet para la descarga inicial.'
  );
}

module.exports = {
  resolveChromiumExecutable,
  setupPuppeteerEnv,
  findChromeExecutable,
};

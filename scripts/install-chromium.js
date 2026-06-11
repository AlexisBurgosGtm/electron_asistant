/**
 * Descarga Chrome for Testing y lo guarda en build/puppeteer-cache
 * para incluirlo en el instalador (extraResources) y no depender de internet en otras PCs.
 */
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const cacheDir = path.join(__dirname, '..', 'build', 'puppeteer-cache');
const puppeteerCli = path.join(__dirname, '..', 'node_modules', 'puppeteer', 'lib', 'cjs', 'puppeteer', 'node', 'cli.js');

function findChromeExecutable(rootDir, depth = 0) {
  if (!rootDir || depth > 8 || !fs.existsSync(rootDir)) return null;

  let entries;
  try {
    entries = fs.readdirSync(rootDir, { withFileTypes: true });
  } catch {
    return null;
  }

  for (const entry of entries) {
    const fullPath = path.join(rootDir, entry.name);
    if (entry.isFile() && entry.name === 'chrome.exe') return fullPath;
    if (entry.isDirectory() && !entry.name.startsWith('.')) {
      const found = findChromeExecutable(fullPath, depth + 1);
      if (found) return found;
    }
  }

  return null;
}

function main() {
  fs.mkdirSync(cacheDir, { recursive: true });

  const result = spawnSync(
    process.execPath,
    [puppeteerCli, 'browsers', 'install', 'chrome'],
    {
      env: {
        ...process.env,
        PUPPETEER_CACHE_DIR: cacheDir,
        PUPPETEER_DOWNLOAD_PATH: cacheDir,
      },
      stdio: 'inherit',
    }
  );

  if (result.status !== 0) {
    throw new Error(`puppeteer browsers install chrome falló (código ${result.status})`);
  }

  const execPath = findChromeExecutable(cacheDir);
  if (!execPath) {
    throw new Error('Chrome instalado pero no se encontró chrome.exe en la caché');
  }

  console.log('Chrome listo:', execPath);
}

try {
  main();
} catch (err) {
  console.error('Error instalando Chromium:', err.message);
  process.exit(1);
}

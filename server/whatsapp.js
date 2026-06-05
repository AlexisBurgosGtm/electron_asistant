const fs = require('fs');
const fsSync = require('fs');
const path = require('path');
const qrcode = require('qrcode');
const appPaths = require('./appPaths');

const MAX_MESSAGES = 100;
const UNREAD_POLL_MS = 2500;

const state = {
  status: 'idle',
  qr: null,
  error: null,
  info: null,
};

let client = null;
let initializing = false;
let unreadPollTimer = null;
let wwebLib = null;
const sseClients = new Set();
const messages = [];
const processedMessageIds = new Set();

function getWhatsAppWeb() {
  if (!wwebLib) {
    wwebLib = appPaths.resolveModule('whatsapp-web.js');
  }
  return wwebLib;
}

function getAuthPath() {
  return appPaths.whatsappAuthPath();
}

function setupPuppeteerEnv() {
  const cacheDir = appPaths.puppeteerCachePath();
  process.env.PUPPETEER_CACHE_DIR = cacheDir;
  process.env.PUPPETEER_DOWNLOAD_PATH = cacheDir;
}

async function resolveChromiumExecutable() {
  setupPuppeteerEnv();

  let puppeteer;
  try {
    puppeteer = appPaths.resolveModule('puppeteer');
  } catch (err) {
    throw new Error(`No se pudo cargar Puppeteer: ${err.message}`);
  }

  let execPath = '';
  try {
    execPath = puppeteer.executablePath();
  } catch {
    execPath = '';
  }

  if (execPath && fsSync.existsSync(execPath)) {
    return execPath;
  }

  try {
    const browsers = appPaths.resolveModule('@puppeteer/browsers');
    const cacheDir = appPaths.puppeteerCachePath();
    const platform = browsers.detectBrowserPlatform();
    const buildId = await browsers.resolveBuildId(
      browsers.Browser.CHROME,
      browsers.ChromeReleaseChannel.STABLE
    );
    const installed = await browsers.install({
      browser: browsers.Browser.CHROME,
      cacheDir,
      buildId,
      platform,
    });
    if (installed?.executablePath && fsSync.existsSync(installed.executablePath)) {
      return installed.executablePath;
    }
  } catch (err) {
    console.warn('WhatsApp: instalación de Chrome:', err.message);
  }

  try {
    execPath = puppeteer.executablePath();
    if (execPath && fsSync.existsSync(execPath)) return execPath;
  } catch {
    /* ignore */
  }

  throw new Error(
    'Chromium no encontrado. Conéctate a internet, reinicia la app y vuelve a intentar (la primera vez descarga el navegador).'
  );
}

async function getPuppeteerOptions() {
  const executablePath = await resolveChromiumExecutable();

  return {
    headless: true,
    executablePath,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-gpu',
      '--disable-software-rasterizer',
      '--disable-extensions',
    ],
  };
}

function getClientOptions(puppeteerOptions) {
  const { LocalAuth } = getWhatsAppWeb();

  return {
    authStrategy: new LocalAuth({ dataPath: getAuthPath() }),
    puppeteer: puppeteerOptions,
    webVersionCache: {
      type: 'local',
      path: appPaths.whatsappWebCachePath(),
      strict: false,
    },
  };
}

function broadcast(event) {
  const payload = `data: ${JSON.stringify(event)}\n\n`;
  sseClients.forEach((res) => {
    try {
      res.write(payload);
    } catch {
      sseClients.delete(res);
    }
  });
}

function getPublicState() {
  return {
    status: state.status,
    qr: state.qr,
    error: state.error,
    info: state.info,
    messageCount: messages.length,
  };
}

function stripJid(value) {
  return (value || '').replace(/@.+$/, '').trim();
}

function looksLikePhone(value) {
  if (!value) return true;
  const s = stripJid(value);
  const digits = s.replace(/\D/g, '');
  return digits.length >= 8 && /^[\d+\s\-()]+$/.test(s);
}

function resolveDisplayNames(msg, contact, chat) {
  const notifyName = msg.notifyName || msg._data?.notifyName || null;
  const contactName = contact?.name || contact?.pushname || contact?.shortName || null;
  const chatName = chat?.name || null;

  let displayName = chatName || contactName || notifyName || null;
  if (displayName && looksLikePhone(displayName)) {
    displayName = contactName && !looksLikePhone(contactName) ? contactName : notifyName;
  }

  const fromLabel = contactName || notifyName || stripJid(msg.from) || 'desconocido';

  return {
    from: fromLabel,
    chatName: displayName && !looksLikePhone(displayName) ? displayName : (chatName || fromLabel),
    contactName: contactName || notifyName || null,
  };
}

function addMessage(entry) {
  const existing = messages.find((m) => m.id === entry.id);
  if (existing) {
    Object.assign(existing, entry);
    broadcast({ type: 'message_update', message: existing });
    return existing;
  }

  messages.unshift(entry);
  if (messages.length > MAX_MESSAGES) messages.pop();
  broadcast({ type: 'message', message: entry });
  return entry;
}

function trimProcessedIds() {
  if (processedMessageIds.size <= 500) return;
  const keep = messages.slice(0, 200).map((m) => m.id);
  processedMessageIds.clear();
  keep.forEach((id) => processedMessageIds.add(id));
}

function isStatusMessage(msg) {
  const from = (msg.from || '').toLowerCase();
  const to = (msg.to || '').toLowerCase();

  if (from.includes('status@broadcast') || to.includes('status@broadcast')) return true;
  if (msg.type === 'status' || msg.type === 'story') return true;

  return false;
}

function hasTextBody(msg) {
  return Boolean((msg.body || '').trim());
}

function shouldProcessMessage(msg) {
  if (msg.fromMe) return false;
  if (isStatusMessage(msg)) return false;
  if (!hasTextBody(msg)) return false;
  return true;
}

function buildMessageEntry(msg, meta = {}) {
  const names = resolveDisplayNames(msg, meta.contact, meta.chat);

  return {
    id: msg.id?._serialized || `${Date.now()}-${Math.random()}`,
    from: names.from,
    chatName: names.chatName,
    contactName: names.contactName,
    body: (msg.body || '').trim(),
    type: msg.type,
    timestamp: msg.timestamp ? msg.timestamp * 1000 : Date.now(),
    fromMe: false,
  };
}

async function enrichAndStore(msg, entry) {
  let contact = null;
  let chat = null;

  try {
    chat = await Promise.race([
      msg.getChat(),
      new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 4000)),
    ]);
  } catch {
    /* ignore */
  }

  try {
    contact = await Promise.race([
      msg.getContact(),
      new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 4000)),
    ]);
  } catch {
    /* ignore */
  }

  const enriched = buildMessageEntry(msg, { contact, chat });
  enriched.id = entry.id;
  enriched.timestamp = entry.timestamp;
  addMessage(enriched);
}

async function handleIncomingMessage(msg) {
  if (!shouldProcessMessage(msg)) return;

  const entry = buildMessageEntry(msg);
  if (processedMessageIds.has(entry.id)) return;

  processedMessageIds.add(entry.id);
  trimProcessedIds();

  addMessage(entry);
  enrichAndStore(msg, entry).catch(() => {
    /* ya guardado con datos básicos */
  });
}

function bindMessageEvents(waClient) {
  waClient.removeAllListeners('message');
  waClient.removeAllListeners('message_create');
  waClient.on('message_create', handleIncomingMessage);
}

async function pollUnreadMessages() {
  if (!client || state.status !== 'ready') return;

  try {
    const chats = await client.getChats();
    const unreadChats = chats.filter((c) => c.unreadCount > 0);

    for (const chat of unreadChats) {
      const limit = Math.min(chat.unreadCount + 2, 20);
      const fetched = await chat.fetchMessages({ limit });

      for (const msg of fetched) {
        await handleIncomingMessage(msg);
      }
    }
  } catch (err) {
    console.warn('WhatsApp poll:', err.message);
  }
}

function startUnreadPoller() {
  stopUnreadPoller();
  unreadPollTimer = setInterval(pollUnreadMessages, UNREAD_POLL_MS);
  pollUnreadMessages();
}

function stopUnreadPoller() {
  if (unreadPollTimer) {
    clearInterval(unreadPollTimer);
    unreadPollTimer = null;
  }
}

function resetClientOnError(err) {
  state.status = 'error';
  state.error = err?.message || String(err);
  client = null;
  initializing = false;
  stopUnreadPoller();
  console.error('WhatsApp error:', err);
  broadcast({ type: 'status', ...getPublicState() });
}

async function createClient() {
  if (client || initializing) return;

  initializing = true;
  state.status = 'initializing';
  state.error = null;
  state.qr = null;
  broadcast({ type: 'status', ...getPublicState() });

  try {
    const { Client } = getWhatsAppWeb();
    const puppeteerOptions = await getPuppeteerOptions();
    client = new Client(getClientOptions(puppeteerOptions));

    client.on('qr', async (qr) => {
      state.status = 'qr';
      state.qr = await qrcode.toDataURL(qr);
      state.error = null;
      broadcast({ type: 'status', ...getPublicState() });
    });

    client.on('authenticated', () => {
      state.status = 'authenticated';
      state.qr = null;
      broadcast({ type: 'status', ...getPublicState() });
    });

    client.on('ready', () => {
      state.status = 'ready';
      state.qr = null;
      state.error = null;
      state.info = client.info
        ? {
            pushname: client.info.pushname,
            wid: client.info.wid?.user,
          }
        : null;
      bindMessageEvents(client);
      startUnreadPoller();
      broadcast({ type: 'status', ...getPublicState() });
    });

    client.on('auth_failure', (msg) => {
      state.status = 'error';
      state.error = typeof msg === 'string' ? msg : 'Error de autenticación';
      stopUnreadPoller();
      broadcast({ type: 'status', ...getPublicState() });
    });

    client.on('disconnected', (reason) => {
      state.status = 'disconnected';
      state.error = reason || 'Desconectado';
      state.info = null;
      stopUnreadPoller();
      client = null;
      initializing = false;
      broadcast({ type: 'status', ...getPublicState() });
    });

    bindMessageEvents(client);
    await client.initialize();
  } catch (err) {
    resetClientOnError(err);
  } finally {
    if (state.status !== 'error') {
      initializing = false;
    }
  }
}

function attachSse(req, res) {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();

  sseClients.add(res);
  res.write(`data: ${JSON.stringify({ type: 'init', ...getPublicState(), messages })}\n\n`);

  const heartbeat = setInterval(() => {
    try {
      res.write(': ping\n\n');
    } catch {
      clearInterval(heartbeat);
    }
  }, 15000);

  req.on('close', () => {
    clearInterval(heartbeat);
    sseClients.delete(res);
  });
}

async function startSession() {
  if (client || initializing) {
    return getPublicState();
  }
  await createClient();
  return getPublicState();
}

async function logoutSession() {
  stopUnreadPoller();

  if (client) {
    try {
      await client.logout();
    } catch {
      try {
        await client.destroy();
      } catch {
        /* ignore */
      }
    }
    client = null;
  }

  initializing = false;
  state.status = 'idle';
  state.qr = null;
  state.error = null;
  state.info = null;
  messages.length = 0;
  processedMessageIds.clear();
  broadcast({ type: 'status', ...getPublicState() });
  return getPublicState();
}

async function destroyWhatsApp() {
  stopUnreadPoller();
  sseClients.forEach((res) => {
    try {
      res.end();
    } catch {
      /* ignore */
    }
  });
  sseClients.clear();

  if (client) {
    try {
      await client.destroy();
    } catch {
      /* ignore */
    }
    client = null;
  }
  initializing = false;
}

function getMessages() {
  return [...messages];
}

module.exports = {
  attachSse,
  startSession,
  logoutSession,
  destroyWhatsApp,
  getPublicState,
  getMessages,
};

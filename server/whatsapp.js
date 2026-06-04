const path = require('path');
const qrcode = require('qrcode');
const { Client, LocalAuth } = require('whatsapp-web.js');
const appPaths = require('./appPaths');

const MAX_MESSAGES = 100;

const state = {
  status: 'idle',
  qr: null,
  error: null,
  info: null,
};

let client = null;
let initializing = false;
const sseClients = new Set();
const messages = [];

function getAuthPath() {
  return appPaths.whatsappAuthPath();
}

function setupPuppeteerEnv() {
  process.env.PUPPETEER_CACHE_DIR = appPaths.puppeteerCachePath();
}

function getPuppeteerOptions() {
  setupPuppeteerEnv();

  const options = {
    headless: true,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-gpu',
    ],
  };

  try {
    const puppeteer = require('puppeteer');
    options.executablePath = puppeteer.executablePath();
  } catch (err) {
    console.warn('WhatsApp: no se pudo resolver Chromium:', err.message);
  }

  return options;
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

function addMessage(entry) {
  messages.unshift(entry);
  if (messages.length > MAX_MESSAGES) messages.pop();
  broadcast({ type: 'message', message: entry });
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

async function createClient() {
  if (client || initializing) return;

  initializing = true;
  state.status = 'initializing';
  state.error = null;
  state.qr = null;
  broadcast({ type: 'status', ...getPublicState() });

  client = new Client({
    authStrategy: new LocalAuth({ dataPath: getAuthPath() }),
    puppeteer: getPuppeteerOptions(),
  });

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
    broadcast({ type: 'status', ...getPublicState() });
  });

  client.on('auth_failure', (msg) => {
    state.status = 'error';
    state.error = msg || 'Error de autenticación';
    broadcast({ type: 'status', ...getPublicState() });
  });

  client.on('disconnected', (reason) => {
    state.status = 'disconnected';
    state.error = reason || 'Desconectado';
    state.info = null;
    client = null;
    initializing = false;
    broadcast({ type: 'status', ...getPublicState() });
  });

  client.on('message', async (msg) => {
    if (!shouldProcessMessage(msg)) return;

    let fromName = msg.from;
    try {
      const contact = await msg.getContact();
      fromName = contact.pushname || contact.name || contact.number || msg.from;
    } catch {
      /* usar msg.from */
    }

    let chatName = fromName;
    try {
      const chat = await msg.getChat();
      chatName = chat.name || fromName;
    } catch {
      /* ignore */
    }

    addMessage({
      id: msg.id?._serialized || `${Date.now()}-${Math.random()}`,
      from: fromName,
      chatName,
      body: msg.body.trim(),
      type: msg.type,
      timestamp: msg.timestamp ? msg.timestamp * 1000 : Date.now(),
      fromMe: false,
    });
  });

  try {
    await client.initialize();
  } catch (err) {
    state.status = 'error';
    state.error = err.message;
    client = null;
    broadcast({ type: 'status', ...getPublicState() });
  } finally {
    initializing = false;
  }
}

function attachSse(req, res) {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  sseClients.add(res);
  res.write(`data: ${JSON.stringify({ type: 'init', ...getPublicState(), messages })}\n\n`);

  req.on('close', () => sseClients.delete(res));
}

async function startSession() {
  if (client || initializing) {
    return getPublicState();
  }
  await createClient();
  return getPublicState();
}

async function logoutSession() {
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
  broadcast({ type: 'status', ...getPublicState() });
  return getPublicState();
}

async function destroyWhatsApp() {
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

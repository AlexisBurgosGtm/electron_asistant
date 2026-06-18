import { speakQueued } from '../tts.js';
import { api } from '../api.js';

const TTS_KEY = 'whatsapp-tts-enabled';
let eventSource = null;
let pollTimer = null;
let ttsEnabled = localStorage.getItem(TTS_KEY) !== 'false';
let ttsAnnounceSenderOnly = false;
let omittedWords = [];
let omittedWordsRaw = '';
const listeners = new Set();
const senderOnlyListeners = new Set();
const knownMessageIds = new Set();
const spokenMessageIds = new Set();
const pendingTts = new Map();
let pollInitialized = false;

export function isWhatsAppTtsEnabled() {
  return ttsEnabled;
}

export function setWhatsAppTtsEnabled(value) {
  ttsEnabled = Boolean(value);
  localStorage.setItem(TTS_KEY, ttsEnabled ? 'true' : 'false');
  listeners.forEach((fn) => fn(ttsEnabled));
}

export function onWhatsAppTtsChange(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function isWhatsAppTtsSenderOnly() {
  return ttsAnnounceSenderOnly;
}

export async function setWhatsAppTtsSenderOnly(value) {
  ttsAnnounceSenderOnly = Boolean(value);
  try {
    await api.updateConfig({ whatsapp: { ttsAnnounceSenderOnly } });
  } catch {
    /* mantener valor local */
  }
  senderOnlyListeners.forEach((fn) => fn(ttsAnnounceSenderOnly));
}

export function onWhatsAppTtsSenderOnlyChange(fn) {
  senderOnlyListeners.add(fn);
  return () => senderOnlyListeners.delete(fn);
}

function parseCsvList(value) {
  return String(value || '').split(',').map((s) => s.trim()).filter(Boolean);
}

function applyOmitConfig(config) {
  omittedWordsRaw = String(config?.whatsapp?.omittedWords || '');
  omittedWords = parseCsvList(omittedWordsRaw);
}

export function getWhatsAppOmitConfig() {
  return {
    omittedWords: omittedWordsRaw,
  };
}

export async function setWhatsAppOmittedWords(value) {
  const text = String(value ?? '');
  omittedWordsRaw = text;
  omittedWords = parseCsvList(text);
  try {
    await api.updateConfig({ whatsapp: { omittedWords: text } });
  } catch {
    /* mantener valor local */
  }
}

export function filterOmittedWords(text) {
  if (!text || !omittedWords.length) return text || '';

  let result = String(text);
  omittedWords.forEach((word) => {
    const escaped = word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    result = result.replace(new RegExp(escaped, 'gi'), '');
  });

  return result.replace(/\s{2,}/g, ' ').trim();
}

export async function loadWhatsAppConfig() {
  try {
    const config = await api.getConfig();
    ttsAnnounceSenderOnly = Boolean(config?.whatsapp?.ttsAnnounceSenderOnly);
    applyOmitConfig(config);
    senderOnlyListeners.forEach((fn) => fn(ttsAnnounceSenderOnly));
  } catch {
    /* usar valor por defecto */
  }
}

export function getContactDisplayName(message) {
  const candidates = [
    message.chatName,
    message.contactName,
    message.from,
  ].filter(Boolean);

  for (const name of candidates) {
    if (!looksLikePhone(name)) return name;
  }

  return candidates[0] || 'contacto desconocido';
}

function looksLikePhone(value) {
  if (!value) return true;
  const s = String(value).trim();
  if (/@(c\.us|s\.whatsapp\.net|g\.us)/i.test(s)) return true;
  const digits = s.replace(/\D/g, '');
  return digits.length >= 8 && digits.length / s.replace(/\s/g, '').length > 0.7;
}

export function formatMessageForSpeech(message) {
  const from = getContactDisplayName(message);
  if (ttsAnnounceSenderOnly) return `Nuevo mensaje de ${from}`;

  const body = filterOmittedWords(message.body || '') || 'mensaje sin texto';
  return `Mensaje de ${from}. ${body}`;
}

function dispatchEvent(data) {
  window.__onWhatsAppEvent?.(data);
}

function enqueueTts(message) {
  if (!ttsEnabled || spokenMessageIds.has(message.id)) return;

  const speech = formatMessageForSpeech(message);
  if (!speech) return;

  spokenMessageIds.add(message.id);
  speakQueued(speech);
}

function scheduleTts(message) {
  if (!message?.id || spokenMessageIds.has(message.id)) return;

  pendingTts.set(message.id, message);

  const name = getContactDisplayName(message);
  if (!looksLikePhone(name)) {
    enqueueTts(message);
    pendingTts.delete(message.id);
    return;
  }

  const existing = pendingTts.get(message.id);
  if (existing?.waitTimer) return;

  existing.waitTimer = setTimeout(() => {
    const latest = pendingTts.get(message.id);
    if (latest) enqueueTts(latest);
    pendingTts.delete(message.id);
  }, 3000);
}

function markPollReady(messages = []) {
  messages.forEach((msg) => {
    if (!msg?.id) return;
    knownMessageIds.add(msg.id);
    if (msg.unread && !spokenMessageIds.has(msg.id)) {
      scheduleTts(msg);
    }
  });
  pollInitialized = true;
}

function handleNewMessage(message, options = {}) {
  if (!message?.id) return;

  const isNew = !knownMessageIds.has(message.id);
  knownMessageIds.add(message.id);

  if (isNew || options.forceNotify) {
    dispatchEvent({ type: 'message', message });
  }

  if (!pollInitialized && !options.force) return;

  if (isNew && message.unread) {
    scheduleTts(message);
  }
}

function handleMessageUpdate(message) {
  if (!message?.id) return;

  knownMessageIds.add(message.id);
  dispatchEvent({ type: 'message_update', message });

  if (!pollInitialized) return;

  if (spokenMessageIds.has(message.id) || !message.unread) return;

  const pending = pendingTts.get(message.id);
  if (pending?.waitTimer) {
    clearTimeout(pending.waitTimer);
  }
  pendingTts.set(message.id, message);
  scheduleTts(message);
}

function handleEvent(data) {
  if (data.type === 'init') {
    markPollReady(data.messages || []);
    dispatchEvent(data);
    return;
  }

  if (data.type === 'messages_sync') {
    (data.messages || []).forEach((msg) => {
      if (!msg?.id) return;
      const isNew = !knownMessageIds.has(msg.id);
      knownMessageIds.add(msg.id);
      if (isNew && msg.unread) {
        scheduleTts(msg);
      }
    });
    dispatchEvent(data);
    return;
  }

  if (data.type === 'message') {
    handleNewMessage(data.message);
    return;
  }

  if (data.type === 'message_update') {
    handleMessageUpdate(data.message);
    return;
  }

  if (data.type === 'status') {
    dispatchEvent(data);
  }
}

export function connectWhatsAppEvents() {
  if (eventSource) return eventSource;

  eventSource = new EventSource('/api/whatsapp/events');

  eventSource.onmessage = (event) => {
    try {
      const data = JSON.parse(event.data);
      handleEvent(data);
    } catch {
      /* ignore */
    }
  };

  eventSource.onerror = () => {
    eventSource?.close();
    eventSource = null;
    setTimeout(connectWhatsAppEvents, 3000);
  };

  return eventSource;
}

async function pollMessages() {
  try {
    const [messages, status] = await Promise.all([
      api.getWhatsAppMessages(),
      api.getWhatsAppStatus(),
    ]);

    const list = Array.isArray(messages) ? messages : [];

    if (!pollInitialized) {
      markPollReady(list);
      dispatchEvent({ type: 'messages_sync', messages: list, ...status });
      return;
    }

    const sorted = [...list].sort((a, b) => a.timestamp - b.timestamp);
    let changed = false;
    sorted.forEach((msg) => {
      const wasKnown = knownMessageIds.has(msg.id);
      handleNewMessage(msg);
      if (!wasKnown && knownMessageIds.has(msg.id)) changed = true;
    });
    if (changed) {
      dispatchEvent({ type: 'messages_sync', messages: list, ...status });
    }
  } catch {
    /* ignore */
  }
}

export async function syncWhatsAppMessagesToPage() {
  try {
    const [messages, status] = await Promise.all([
      api.getWhatsAppMessages(),
      api.getWhatsAppStatus(),
    ]);
    const list = Array.isArray(messages) ? messages : [];
    list.forEach((msg) => {
      if (msg?.id) knownMessageIds.add(msg.id);
    });
    pollInitialized = true;
    dispatchEvent({ type: 'messages_sync', messages: list, ...status });
    return list;
  } catch {
    return [];
  }
}

export function disconnectWhatsAppEvents() {
  if (eventSource) {
    eventSource.close();
    eventSource = null;
  }
  if (pollTimer) {
    clearInterval(pollTimer);
    pollTimer = null;
  }
  pendingTts.forEach((p) => clearTimeout(p.waitTimer));
  pendingTts.clear();
}

export async function refreshWhatsAppListener() {
  if (eventSource) {
    eventSource.close();
    eventSource = null;
  }
  connectWhatsAppEvents();
  try {
    await api.refreshWhatsApp();
  } catch {
    /* ignore */
  }
  await pollMessages();
}

export function initWhatsAppListener() {
  loadWhatsAppConfig();
  connectWhatsAppEvents();
  pollMessages();
  pollTimer = setInterval(pollMessages, 2000);
}

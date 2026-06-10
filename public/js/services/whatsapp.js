import { speakQueued } from '../tts.js';
import { api } from '../api.js';

const TTS_KEY = 'whatsapp-tts-enabled';
let eventSource = null;
let pollTimer = null;
let ttsEnabled = localStorage.getItem(TTS_KEY) !== 'false';
let ttsAnnounceSenderOnly = false;
let omittedWords = [];
let omittedPhones = [];
let omittedWordsRaw = '';
let omittedPhonesRaw = '';
const listeners = new Set();
const senderOnlyListeners = new Set();
const omitListeners = new Set();
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

function normalizePhone(value) {
  return String(value || '').replace(/\D/g, '');
}

function applyOmitConfig(config) {
  omittedWordsRaw = String(config?.whatsapp?.omittedWords || '');
  omittedPhonesRaw = String(config?.whatsapp?.omittedPhones || '');
  omittedWords = parseCsvList(omittedWordsRaw);
  omittedPhones = parseCsvList(omittedPhonesRaw).map(normalizePhone).filter(Boolean);
  omitListeners.forEach((fn) => fn({ omittedWords, omittedPhones }));
}

export function getWhatsAppOmitConfig() {
  return {
    omittedWords: omittedWordsRaw,
    omittedPhones: omittedPhonesRaw,
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
  omitListeners.forEach((fn) => fn({ omittedWords, omittedPhones }));
}

export async function setWhatsAppOmittedPhones(value) {
  const text = String(value ?? '');
  omittedPhonesRaw = text;
  omittedPhones = parseCsvList(text).map(normalizePhone).filter(Boolean);
  try {
    await api.updateConfig({ whatsapp: { omittedPhones: text } });
  } catch {
    /* mantener valor local */
  }
  omitListeners.forEach((fn) => fn({ omittedWords, omittedPhones }));
}

export function onWhatsAppOmitChange(fn) {
  omitListeners.add(fn);
  return () => omitListeners.delete(fn);
}

export function isMessagePhoneOmitted(message) {
  if (!omittedPhones.length || !message) return false;

  const candidates = [
    message.from,
    message.chatId,
    message.author,
    getContactDisplayName(message),
  ].map(normalizePhone).filter(Boolean);

  return omittedPhones.some((omitted) => candidates.some((phone) => {
    if (!phone || !omitted) return false;
    return phone === omitted || phone.endsWith(omitted) || omitted.endsWith(phone) || phone.includes(omitted);
  }));
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
  if (isMessagePhoneOmitted(message)) return null;

  const from = getContactDisplayName(message);
  if (ttsAnnounceSenderOnly) return `Nuevo mensaje de ${from}`;

  const body = filterOmittedWords(message.body || '') || 'mensaje sin texto';
  return `Mensaje de ${from}. ${body}`;
}

function dispatchEvent(data) {
  window.__onWhatsAppEvent?.(data);
}

function enqueueTts(message) {
  if (!ttsEnabled) return;
  if (isMessagePhoneOmitted(message)) return;
  if (!ttsAnnounceSenderOnly && !filterOmittedWords(message.body || '').trim()) return;
  if (spokenMessageIds.has(message.id)) return;

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

function handleNewMessage(message, options = {}) {
  if (!message?.id) return;

  const isNew = !knownMessageIds.has(message.id);
  knownMessageIds.add(message.id);

  if (!pollInitialized && !options.force) return;

  if (isNew || options.forceNotify) {
    dispatchEvent({ type: 'message', message });
  }

  if (isNew) {
    scheduleTts(message);
  }
}

function handleMessageUpdate(message) {
  if (!message?.id) return;

  knownMessageIds.add(message.id);
  dispatchEvent({ type: 'message_update', message });

  if (spokenMessageIds.has(message.id)) return;

  const pending = pendingTts.get(message.id);
  if (pending?.waitTimer) {
    clearTimeout(pending.waitTimer);
  }
  pendingTts.set(message.id, message);
  scheduleTts(message);
}

function handleEvent(data) {
  if (data.type === 'init') {
    if (!pollInitialized) {
      (data.messages || []).forEach((msg) => knownMessageIds.add(msg.id));
      pollInitialized = true;
    }
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

    if (!pollInitialized) {
      messages.forEach((msg) => knownMessageIds.add(msg.id));
      pollInitialized = true;
      if (status.status === 'ready') {
        dispatchEvent({ type: 'status', ...status });
      }
      return;
    }

    const sorted = [...messages].sort((a, b) => a.timestamp - b.timestamp);
    sorted.forEach((msg) => handleNewMessage(msg));
  } catch {
    /* ignore */
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

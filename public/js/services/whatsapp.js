import { speak } from '../tts.js';
import { api } from '../api.js';

const TTS_KEY = 'whatsapp-tts-enabled';
let eventSource = null;
let pollTimer = null;
let ttsEnabled = localStorage.getItem(TTS_KEY) !== 'false';
const listeners = new Set();
const knownMessageIds = new Set();
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

function formatMessageForSpeech(message) {
  const from = message.chatName || message.from || 'contacto desconocido';
  const body = message.body || 'mensaje sin texto';
  return `Mensaje de ${from}. ${body}`;
}

function dispatchEvent(data) {
  window.__onWhatsAppEvent?.(data);
}

function handleNewMessage(message) {
  if (!message?.id) return;

  const isNew = !knownMessageIds.has(message.id);
  knownMessageIds.add(message.id);

  if (!pollInitialized || !isNew) return;

  dispatchEvent({ type: 'message', message });
  if (ttsEnabled && (message.body || '').trim()) {
    speak(formatMessageForSpeech(message));
  }
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

  if (data.type === 'message' || data.type === 'message_update') {
    handleNewMessage(data.message);
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
    setTimeout(connectWhatsAppEvents, 5000);
  };

  return eventSource;
}

async function pollMessages() {
  try {
    const messages = await api.getWhatsAppMessages();
    if (!pollInitialized) {
      messages.forEach((msg) => knownMessageIds.add(msg.id));
      pollInitialized = true;
      return;
    }
    messages.forEach((msg) => handleNewMessage(msg));
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
}

export function initWhatsAppListener() {
  connectWhatsAppEvents();
  pollTimer = setInterval(pollMessages, 5000);
  pollMessages();
}

import { speak } from '../tts.js';

const TTS_KEY = 'whatsapp-tts-enabled';
let eventSource = null;
let ttsEnabled = localStorage.getItem(TTS_KEY) !== 'false';
const listeners = new Set();

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

function handleEvent(data) {
  if (data.type !== 'message' || !data.message || !ttsEnabled) return;
  if (!(data.message.body || '').trim()) return;
  speak(formatMessageForSpeech(data.message));
}

export function connectWhatsAppEvents() {
  if (eventSource) return eventSource;

  eventSource = new EventSource('/api/whatsapp/events');

  eventSource.onmessage = (event) => {
    try {
      const data = JSON.parse(event.data);
      handleEvent(data);
      window.__onWhatsAppEvent?.(data);
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

export function disconnectWhatsAppEvents() {
  if (eventSource) {
    eventSource.close();
    eventSource = null;
  }
}

export function initWhatsAppListener() {
  connectWhatsAppEvents();
}

import { showToast } from './utils.js';

let voicesLoaded = false;

function loadVoices() {
  return new Promise((resolve) => {
    const voices = speechSynthesis.getVoices();
    if (voices.length) {
      voicesLoaded = true;
      resolve(voices);
      return;
    }
    speechSynthesis.onvoiceschanged = () => {
      voicesLoaded = true;
      resolve(speechSynthesis.getVoices());
    };
  });
}

function pickSpanishVoice() {
  const voices = speechSynthesis.getVoices();
  return voices.find((v) => v.lang.startsWith('es')) || voices[0];
}

export async function speak(text) {
  if (!('speechSynthesis' in window) || !text) return;

  if (!voicesLoaded) await loadVoices();

  speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = 'es-ES';
  utterance.rate = 1;
  utterance.pitch = 1;
  const voice = pickSpanishVoice();
  if (voice) utterance.voice = voice;
  speechSynthesis.speak(utterance);
}

export function normalizeText(text) {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export function notifyWithVoice(message, type = 'info') {
  showToast(message, type);
  speak(message);
}

const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;

let recognition = null;
let listening = false;
let commandHandler = null;

function updateVoiceUI(active, statusText) {
  const btn = document.getElementById('voice-toggle');
  const status = document.getElementById('voice-status');
  if (btn) {
    btn.classList.toggle('voice-btn--active', active);
    btn.title = active ? 'Desactivar reconocimiento de voz' : 'Activar reconocimiento de voz';
  }
  if (status) {
    status.textContent = statusText;
    status.classList.toggle('voice-status--active', active);
  }
}

function createRecognition() {
  if (!SpeechRecognition) return null;

  const rec = new SpeechRecognition();
  rec.lang = 'es-ES';
  rec.continuous = true;
  rec.interimResults = false;
  rec.maxAlternatives = 1;

  rec.onresult = (event) => {
    const last = event.results[event.results.length - 1];
    if (!last.isFinal) return;
    const transcript = last[0].transcript.trim();
    if (transcript && commandHandler) {
      commandHandler(transcript);
    }
  };

  rec.onend = () => {
    if (listening) {
      try {
        rec.start();
      } catch {
        listening = false;
        updateVoiceUI(false, 'Voz inactiva');
      }
    }
  };

  rec.onerror = (event) => {
    if (event.error === 'not-allowed') {
      listening = false;
      updateVoiceUI(false, 'Micrófono no permitido');
      notifyWithVoice('Permiso de micrófono denegado', 'error');
    } else if (event.error !== 'aborted' && event.error !== 'no-speech') {
      updateVoiceUI(listening, listening ? 'Escuchando...' : 'Voz inactiva');
    }
  };

  return rec;
}

export function startListening() {
  if (!SpeechRecognition) {
    notifyWithVoice('Reconocimiento de voz no soportado en este navegador', 'error');
    return false;
  }

  if (!recognition) recognition = createRecognition();
  if (!recognition) return false;

  try {
    recognition.start();
    listening = true;
    updateVoiceUI(true, 'Escuchando...');
    speak('Reconocimiento de voz activado');
    return true;
  } catch {
    return false;
  }
}

export function stopListening() {
  listening = false;
  if (recognition) {
    try {
      recognition.stop();
    } catch {
      /* ignore */
    }
  }
  updateVoiceUI(false, 'Voz inactiva');
  speak('Reconocimiento de voz desactivado');
}

export function toggleListening() {
  if (listening) {
    stopListening();
    return false;
  }
  return startListening();
}

export function isListening() {
  return listening;
}

export function onVoiceCommand(handler) {
  commandHandler = handler;
}

export function parseTestConnectionCommand(text) {
  const normalized = normalizeText(text);
  const patterns = [
    /prueba\s+la\s+conexion\s+a\s+(.+)/,
    /probar\s+la\s+conexion\s+a\s+(.+)/,
    /prueba\s+conexion\s+a\s+(.+)/,
  ];

  for (const pattern of patterns) {
    const match = normalized.match(pattern);
    if (match) return match[1].trim();
  }
  return null;
}

export function findConexionByName(conexiones, name) {
  const target = normalizeText(name);
  if (!target) return null;

  const exact = conexiones.find((c) => normalizeText(c.nombre) === target);
  if (exact) return exact;

  const partial = conexiones.find(
    (c) => normalizeText(c.nombre).includes(target) || target.includes(normalizeText(c.nombre))
  );
  return partial || null;
}

export function findComandoByVoz(comandos, text) {
  const spoken = normalizeText(text);
  if (!spoken) return null;

  const exact = comandos.find((c) => normalizeText(c.comandoVoz) === spoken);
  if (exact) return exact;

  return comandos.find((c) => {
    const cmd = normalizeText(c.comandoVoz);
    return cmd && (spoken.includes(cmd) || cmd.includes(spoken));
  }) || null;
}

export async function initVoice() {
  await loadVoices();

  const btn = document.getElementById('voice-toggle');
  if (btn) {
    btn.addEventListener('click', () => toggleListening());
  }

  if (!SpeechRecognition) {
    updateVoiceUI(false, 'Voz no disponible');
  }
}

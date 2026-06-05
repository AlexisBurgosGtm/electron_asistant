let voicesLoaded = false;
const speakQueue = [];
let isSpeaking = false;

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

function runNextInQueue() {
  if (isSpeaking || !speakQueue.length) return;

  const text = speakQueue.shift();
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = 'es-ES';
  utterance.rate = 1;
  utterance.pitch = 1;
  const voice = pickSpanishVoice();
  if (voice) utterance.voice = voice;

  isSpeaking = true;
  utterance.onend = () => {
    isSpeaking = false;
    runNextInQueue();
  };
  utterance.onerror = () => {
    isSpeaking = false;
    runNextInQueue();
  };
  speechSynthesis.speak(utterance);
}

export async function speak(text, options = {}) {
  if (!('speechSynthesis' in window) || !text) return;

  if (!voicesLoaded) await loadVoices();

  if (options.queue) {
    speakQueue.push(text);
    if (!isSpeaking) runNextInQueue();
    return;
  }

  speechSynthesis.cancel();
  isSpeaking = false;
  speakQueue.length = 0;

  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = 'es-ES';
  utterance.rate = 1;
  utterance.pitch = 1;
  const voice = pickSpanishVoice();
  if (voice) utterance.voice = voice;
  isSpeaking = true;
  utterance.onend = () => { isSpeaking = false; };
  utterance.onerror = () => { isSpeaking = false; };
  speechSynthesis.speak(utterance);
}

export function speakQueued(text) {
  return speak(text, { queue: true });
}

export function clearSpeakQueue() {
  speakQueue.length = 0;
}

export async function initTts() {
  await loadVoices();
}

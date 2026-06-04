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

export async function initTts() {
  await loadVoices();
}

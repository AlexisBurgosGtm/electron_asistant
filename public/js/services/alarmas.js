import { api } from '../api.js';
import { showToast } from '../utils.js';
import { speak } from '../tts.js';

const timers = new Map();
const firing = new Set();
let checkInterval = null;

function pad2(n) {
  return String(n).padStart(2, '0');
}

function getAlarmTimestamp(alarma) {
  return new Date(`${alarma.fecha}T${pad2(alarma.hora)}:${pad2(alarma.minuto)}:00`).getTime();
}

function clearTimers() {
  timers.forEach((timerId) => clearTimeout(timerId));
  timers.clear();
}

async function triggerAlarma(alarma) {
  if (firing.has(alarma.id)) return;
  firing.add(alarma.id);

  const text = `ALARMA: ${alarma.descripcion}`;
  showToast(text, 'warning');
  speak(text);

  try {
    await api.dispararAlarma(alarma.id);
    await refreshAlarmas();
    window.__reloadAlarmas?.();
  } catch {
    /* ya disparada o eliminada */
  } finally {
    firing.delete(alarma.id);
  }
}

function scheduleAlarma(alarma) {
  if (alarma.disparada || timers.has(alarma.id)) return;

  const delay = getAlarmTimestamp(alarma) - Date.now();
  if (delay <= 0) {
    triggerAlarma(alarma);
    return;
  }

  const maxDelay = 2147483647;
  if (delay > maxDelay) return;

  const timerId = setTimeout(() => {
    timers.delete(alarma.id);
    triggerAlarma(alarma);
  }, delay);
  timers.set(alarma.id, timerId);
}

function scheduleAlarmas(alarmas) {
  clearTimers();
  alarmas
    .filter((a) => !a.disparada)
    .forEach(scheduleAlarma);
}

export async function refreshAlarmas() {
  try {
    const alarmas = await api.getAlarmas();
    scheduleAlarmas(alarmas);
    return alarmas;
  } catch {
    return [];
  }
}

export function initAlarmas() {
  refreshAlarmas();
  if (!checkInterval) {
    checkInterval = setInterval(refreshAlarmas, 30000);
  }
}

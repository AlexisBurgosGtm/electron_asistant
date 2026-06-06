import { api } from '../api.js';
import { showToast, confirmDialog } from '../utils.js';
import { speakQueued } from '../tts.js';
import {
  isWhatsAppTtsEnabled,
  setWhatsAppTtsEnabled,
  onWhatsAppTtsChange,
  isWhatsAppTtsSenderOnly,
  setWhatsAppTtsSenderOnly,
  onWhatsAppTtsSenderOnlyChange,
  loadWhatsAppConfig,
  refreshWhatsAppListener,
  getContactDisplayName,
  formatMessageForSpeech,
} from '../services/whatsapp.js';

let pollTimer = null;
let unsubscribeTts = null;
let unsubscribeSenderOnly = null;
let cachedMessages = [];

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text ?? '';
  return div.innerHTML;
}

function formatTime(ts) {
  return new Date(ts).toLocaleString('es-ES', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function statusLabel(status) {
  const labels = {
    idle: 'Sin iniciar',
    initializing: 'Iniciando...',
    qr: 'Escanea el código QR',
    authenticated: 'Autenticando...',
    ready: 'Conectado',
    disconnected: 'Desconectado',
    error: 'Error',
  };
  return labels[status] || status;
}

function renderMessages(messages) {
  if (!messages.length) {
    return `
      <div class="wa-empty">
        <i class="fa-brands fa-whatsapp"></i>
        <p>Los mensajes entrantes aparecerán aquí</p>
      </div>
    `;
  }

  return messages.map((m) => `
    <article class="wa-message glass" data-id="${escapeHtml(m.id)}">
      <div class="wa-message__header">
        <span class="wa-message__from"><i class="fa-solid fa-user"></i> ${escapeHtml(getContactDisplayName(m))}</span>
        <time>${formatTime(m.timestamp)}</time>
      </div>
      <p class="wa-message__body">${escapeHtml(m.body || `[${m.type || 'mensaje'}]`)}</p>
      <button class="btn btn--ghost btn--sm btn-speak-msg" type="button" data-id="${escapeHtml(m.id)}">
        <i class="fa-solid fa-volume-high"></i> Escuchar
      </button>
    </article>
  `).join('');
}

function bindMessageEvents(container) {
  container.querySelectorAll('.btn-speak-msg').forEach((btn) => {
    btn.addEventListener('click', () => {
      const msg = cachedMessages.find((m) => m.id === btn.dataset.id);
      if (msg) speakQueued(formatMessageForSpeech(msg));
    });
  });
}

function updateView(container, state, messages) {
  const qrPanel = container.querySelector('#wa-qr-panel');
  const statusEl = container.querySelector('#wa-connection-status');
  const userEl = container.querySelector('#wa-user-info');
  const messagesEl = container.querySelector('#wa-messages');
  const startBtn = container.querySelector('#wa-start-btn');
  const logoutBtn = container.querySelector('#wa-logout-btn');

  if (statusEl) {
    statusEl.textContent = statusLabel(state.status);
    statusEl.className = `wa-status wa-status--${state.status}`;
  }

  if (userEl) {
    if (state.status === 'error' && state.error) {
      userEl.textContent = `Error: ${state.error}`;
      userEl.className = 'wa-user-info wa-user-info--error';
    } else {
      userEl.className = 'wa-user-info';
      userEl.textContent = state.info?.pushname
        ? `Sesión: ${state.info.pushname} (${state.info.wid || ''})`
        : '';
    }
  }

  if (qrPanel) {
    if (state.status === 'qr' && state.qr) {
      qrPanel.innerHTML = `
        <div class="wa-qr glass">
          <h3><i class="fa-solid fa-qrcode"></i> Escanea con WhatsApp</h3>
          <p>Abre WhatsApp en tu teléfono → Dispositivos vinculados → Vincular dispositivo</p>
          <img src="${state.qr}" alt="Código QR WhatsApp" class="wa-qr__image">
        </div>
      `;
      qrPanel.hidden = false;
    } else {
      qrPanel.hidden = true;
      qrPanel.innerHTML = '';
    }
  }

  if (messagesEl) {
    messagesEl.innerHTML = renderMessages(messages);
    bindMessageEvents(messagesEl);
  }

  if (startBtn) {
    startBtn.disabled = ['initializing', 'authenticated', 'ready'].includes(state.status);
    startBtn.innerHTML = state.status === 'ready'
      ? '<i class="fa-solid fa-circle-check"></i> Conectado'
      : '<i class="fa-brands fa-whatsapp"></i> Iniciar sesión';
  }

  if (logoutBtn) {
    logoutBtn.hidden = !['ready', 'authenticated', 'qr', 'disconnected', 'error'].includes(state.status)
      || state.status === 'idle';
  }
}

async function refreshState(container) {
  try {
    const [state, messages] = await Promise.all([
      api.getWhatsAppStatus(),
      api.getWhatsAppMessages(),
    ]);
    cachedMessages = messages;
    updateView(container, state, messages);
  } catch (err) {
    showToast(err.message, 'error');
  }
}

function handleWhatsAppEvent(container, data) {
  if (data.type === 'init' || data.type === 'status') {
    refreshState(container);
  }
  if (data.type === 'message' || data.type === 'message_update') {
    refreshState(container);
  }
}

export async function renderWhatsapp(container) {
  await loadWhatsAppConfig();
  const ttsOn = isWhatsAppTtsEnabled();
  const senderOnly = isWhatsAppTtsSenderOnly();

  container.innerHTML = `
    <div class="wa-layout">
      <div class="wa-sidebar-panel glass">
        <div class="wa-panel-header">
          <h2><i class="fa-brands fa-whatsapp"></i> WhatsApp</h2>
          <span class="wa-status wa-status--idle" id="wa-connection-status">Sin iniciar</span>
        </div>
        <p class="wa-user-info" id="wa-user-info"></p>

        <div class="wa-actions">
          <button class="btn btn--primary" id="wa-start-btn" type="button">
            <i class="fa-brands fa-whatsapp"></i> Iniciar sesión
          </button>
          <button class="btn btn--danger" id="wa-logout-btn" type="button" hidden>
            <i class="fa-solid fa-right-from-bracket"></i> Cerrar sesión
          </button>
        </div>

        <label class="wa-tts-toggle checkbox-group">
          <input type="checkbox" id="wa-tts-toggle" ${ttsOn ? 'checked' : ''}>
          Leer mensajes entrantes en voz alta
        </label>

        <label class="wa-tts-toggle checkbox-group">
          <input type="checkbox" id="wa-tts-sender-only" ${senderOnly ? 'checked' : ''}>
          Solo anunciar remitente (sin leer el mensaje)
        </label>

        <div id="wa-qr-panel" hidden></div>
      </div>

      <div class="wa-messages-panel glass">
        <div class="wa-messages-header">
          <h3><i class="fa-solid fa-inbox"></i> Mensajes entrantes</h3>
          <button class="btn btn--ghost btn--sm" id="wa-refresh-btn" type="button" title="Reconectar y buscar mensajes nuevos">
            <i class="fa-solid fa-rotate"></i> Refrescar
          </button>
        </div>
        <div class="wa-messages-list" id="wa-messages"></div>
      </div>
    </div>
  `;

  const ttsToggle = container.querySelector('#wa-tts-toggle');
  ttsToggle.addEventListener('change', () => {
    setWhatsAppTtsEnabled(ttsToggle.checked);
    showToast(ttsToggle.checked ? 'Lectura en voz alta activada' : 'Lectura en voz alta desactivada', 'info');
  });

  const senderOnlyToggle = container.querySelector('#wa-tts-sender-only');
  senderOnlyToggle.addEventListener('change', async () => {
    await setWhatsAppTtsSenderOnly(senderOnlyToggle.checked);
    showToast(
      senderOnlyToggle.checked
        ? 'Solo se anunciará el remitente'
        : 'Se leerá el mensaje completo',
      'info'
    );
  });

  unsubscribeTts = onWhatsAppTtsChange((enabled) => {
    ttsToggle.checked = enabled;
  });

  unsubscribeSenderOnly = onWhatsAppTtsSenderOnlyChange((enabled) => {
    senderOnlyToggle.checked = enabled;
  });

  container.querySelector('#wa-refresh-btn').addEventListener('click', async () => {
    const btn = container.querySelector('#wa-refresh-btn');
    btn.disabled = true;
    try {
      await refreshWhatsAppListener();
      await refreshState(container);
      showToast('WhatsApp refrescado', 'success');
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      btn.disabled = false;
    }
  });

  container.querySelector('#wa-start-btn').addEventListener('click', async () => {
    try {
      const result = await api.startWhatsApp();
      if (result.status === 'error' && result.error) {
        showToast(result.error, 'error');
      } else {
        showToast('Iniciando WhatsApp, espera el código QR', 'info');
      }
      await refreshState(container);
    } catch (err) {
      showToast(err.message, 'error');
    }
  });

  container.querySelector('#wa-logout-btn').addEventListener('click', async () => {
    const confirmed = await confirmDialog({
      title: 'Cerrar sesión',
      text: '¿Deseas cerrar la sesión de WhatsApp en este dispositivo?',
      confirmText: 'Sí, cerrar',
    });
    if (!confirmed) return;

    try {
      await api.logoutWhatsApp();
      showToast('Sesión cerrada', 'success');
      await refreshState(container);
    } catch (err) {
      showToast(err.message, 'error');
    }
  });

  window.__onWhatsAppEvent = (data) => handleWhatsAppEvent(container, data);

  await refreshState(container);

  pollTimer = setInterval(() => refreshState(container), 3000);
}

export function cleanupWhatsappPage() {
  if (pollTimer) {
    clearInterval(pollTimer);
    pollTimer = null;
  }
  if (unsubscribeTts) {
    unsubscribeTts();
    unsubscribeTts = null;
  }
  if (unsubscribeSenderOnly) {
    unsubscribeSenderOnly();
    unsubscribeSenderOnly = null;
  }
  window.__onWhatsAppEvent = null;
}

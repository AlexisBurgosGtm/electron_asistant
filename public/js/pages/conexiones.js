import { api } from '../api.js';
import { showToast, confirmDialog, openModal, getTipoBadge, getFormHtml, bindFormEvents } from '../utils.js';
import { runConnectionTest } from '../services/connections.js';

const PING_INTERVAL_MS = 5 * 60 * 1000;

let pingTimer = null;
let autoPingEnabled = true;

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text ?? '';
  return div.innerHTML;
}

function getCardEl(id) {
  return document.querySelector(`.card[data-id="${id}"]`);
}

function applyCardStatus(id, status) {
  const card = getCardEl(id);
  if (!card) return;

  card.classList.remove('card--online', 'card--offline', 'card--checking');

  const statusEl = card.querySelector('.card__status');
  if (!statusEl) return;

  if (status === 'online') {
    card.classList.add('card--online');
    statusEl.textContent = 'Activa';
    statusEl.className = 'card__status card__status--online';
  } else if (status === 'offline') {
    card.classList.add('card--offline');
    statusEl.textContent = 'Inactiva';
    statusEl.className = 'card__status card__status--offline';
  } else if (status === 'checking') {
    card.classList.add('card--checking');
    statusEl.textContent = 'Verificando...';
    statusEl.className = 'card__status card__status--checking';
  } else {
    statusEl.textContent = 'Sin verificar';
    statusEl.className = 'card__status';
  }
}

async function pingConnection(id) {
  applyCardStatus(id, 'checking');
  try {
    await api.testConexion(id);
    applyCardStatus(id, 'online');
    return { ok: true };
  } catch {
    applyCardStatus(id, 'offline');
    return { ok: false };
  }
}

async function pingAllConnections(ids) {
  await Promise.all(ids.map((id) => pingConnection(id)));
}

function startPingTimer(ids) {
  stopPingTimer();
  if (!autoPingEnabled || !ids.length) return;

  pingTimer = setInterval(() => {
    pingAllConnections(ids);
  }, PING_INTERVAL_MS);
}

function stopPingTimer() {
  if (pingTimer) {
    clearInterval(pingTimer);
    pingTimer = null;
  }
}

function renderCard(conexion) {
  const puerto = conexion.puerto || (conexion.tipo === 'mssql' ? 1433 : 3306);
  return `
    <div class="card glass" data-id="${conexion.id}">
      <div class="card__header">
        <div>
          <div class="card__title">${escapeHtml(conexion.nombre)}</div>
          <div class="card__meta">${escapeHtml(conexion.host)}:${puerto}</div>
        </div>
        <div class="card__header-right">
          <span class="card__status">Sin verificar</span>
          ${getTipoBadge(conexion.tipo)}
        </div>
      </div>
      <div class="card__details">
        <div class="card__detail"><i class="fa-solid fa-database"></i> ${escapeHtml(conexion.baseDatos)}</div>
        <div class="card__detail"><i class="fa-solid fa-user"></i> ${escapeHtml(conexion.usuario || '—')}</div>
        <div class="card__detail"><i class="fa-solid fa-fingerprint"></i> ID: ${escapeHtml(conexion.id)}</div>
      </div>
      <div class="card__actions">
        <button class="btn btn--ghost btn--sm btn-query" data-id="${conexion.id}" data-nombre="${escapeHtml(conexion.nombre)}" title="Ejecutar consulta SQL">
          <i class="fa-solid fa-terminal"></i> Query
        </button>
        <button class="btn btn--ghost btn--sm btn-test" data-id="${conexion.id}" data-nombre="${escapeHtml(conexion.nombre)}">
          <i class="fa-solid fa-plug"></i> Probar
        </button>
        <button class="btn btn--ghost btn--sm btn-edit" data-id="${conexion.id}">
          <i class="fa-solid fa-pen"></i> Editar
        </button>
        <button class="btn btn--danger btn--sm btn-delete" data-id="${conexion.id}">
          <i class="fa-solid fa-trash"></i>
        </button>
      </div>
    </div>
  `;
}

function openQueryModal(conexion) {
  openModal(`Query SQL — ${escapeHtml(conexion.nombre)}`, `
    <div class="form-group form-group--full">
      <label for="sql-query-input">Consulta SQL</label>
      <textarea id="sql-query-input" rows="8" placeholder="SELECT * FROM tabla LIMIT 10;"></textarea>
    </div>
    <div class="form-actions">
      <button type="button" class="btn btn--primary" id="btn-exec-query">
        <i class="fa-solid fa-play"></i> Ejecutar
      </button>
    </div>
    <pre id="sql-query-result" class="sql-result" hidden></pre>
  `, () => {
    const execBtn = document.getElementById('btn-exec-query');
    const input = document.getElementById('sql-query-input');
    const resultEl = document.getElementById('sql-query-result');

    execBtn.addEventListener('click', async () => {
      const query = input.value.trim();
      if (!query) {
        showToast('Escribe una consulta SQL', 'error');
        return;
      }

      execBtn.disabled = true;
      resultEl.hidden = true;

      try {
        const result = await api.executeConexionQuery(conexion.id, query);
        showToast(result.mensaje || 'Query ejecutada', 'success');
        resultEl.textContent = JSON.stringify({
          mensaje: result.mensaje,
          filas: result.rowCount ?? result.rowsAffected,
          datos: result.rows || [],
        }, null, 2);
        resultEl.hidden = false;
      } catch (err) {
        showToast(err.message, 'error');
        resultEl.textContent = err.message;
        resultEl.hidden = false;
      } finally {
        execBtn.disabled = false;
      }
    });
  });
}

function bindCardEvents(container, conexiones, reload) {
  container.querySelectorAll('.btn-query').forEach((btn) => {
    btn.addEventListener('click', () => {
      const conexion = conexiones.find((c) => c.id === btn.dataset.id);
      if (conexion) openQueryModal(conexion);
    });
  });

  container.querySelectorAll('.btn-test').forEach((btn) => {
    btn.addEventListener('click', async () => {
      btn.disabled = true;
      try {
        await runConnectionTest(btn.dataset.id, btn.dataset.nombre, {
          onStatus: (status) => applyCardStatus(btn.dataset.id, status),
        });
      } finally {
        btn.disabled = false;
      }
    });
  });

  container.querySelectorAll('.btn-edit').forEach((btn) => {
    btn.addEventListener('click', async () => {
      try {
        const conexion = await api.getConexion(btn.dataset.id);
        openEditModal(conexion, reload);
      } catch (err) {
        showToast(err.message, 'error');
      }
    });
  });

  container.querySelectorAll('.btn-delete').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const confirmed = await confirmDialog({
        title: 'Eliminar conexión',
        text: '¿Estás seguro de que deseas eliminar esta conexión? Esta acción no se puede deshacer.',
        icon: 'warning',
        confirmText: 'Sí, eliminar',
        cancelText: 'Cancelar',
      });
      if (!confirmed) return;

      try {
        await api.deleteConexion(btn.dataset.id);
        showToast('Conexión eliminada', 'success');
        await reload();
      } catch (err) {
        showToast(err.message, 'error');
      }
    });
  });
}

function bindAutoPingToggle(conexiones) {
  const toggle = document.getElementById('auto-ping-toggle');
  if (!toggle) return;

  toggle.addEventListener('change', async () => {
    autoPingEnabled = toggle.checked;
    try {
      await api.updateConfig({ conexiones: { autoPing: autoPingEnabled } });
    } catch (err) {
      showToast(err.message, 'error');
      toggle.checked = !autoPingEnabled;
      autoPingEnabled = toggle.checked;
      return;
    }

    if (autoPingEnabled) {
      showToast('Monitoreo automático activado', 'info');
      await pingAllConnections(conexiones.map((c) => c.id));
      startPingTimer(conexiones.map((c) => c.id));
    } else {
      showToast('Monitoreo automático desactivado', 'info');
      stopPingTimer();
    }
  });
}

function openCreateModal(reload) {
  openModal('Nueva conexión', getFormHtml(), (_root, close) => {
    const form = document.getElementById('conexion-form');
    form.btnTestForm = document.getElementById('btn-test-form');
    bindFormEvents(form, close, async (data) => {
      await api.createConexion(data);
      showToast('Conexión creada', 'success');
    }, reload);
  });
}

function openEditModal(conexion, reload) {
  openModal('Editar conexión', getFormHtml(conexion), (_root, close) => {
    const form = document.getElementById('conexion-form');
    form.btnTestForm = document.getElementById('btn-test-form');
    bindFormEvents(form, close, async (data) => {
      await api.updateConexion(conexion.id, data);
      showToast('Conexión actualizada', 'success');
    }, reload);
  });
}

export function setupConexionesActions(onNew) {
  onNew(() => openCreateModal(window.__reloadConexiones));
}

export async function renderConexiones(container) {
  let conexiones = [];
  try {
    conexiones = await api.getConexiones();
  } catch (err) {
    showToast(err.message, 'error');
  }

  try {
    const config = await api.getConfig();
    autoPingEnabled = config?.conexiones?.autoPing !== false;
  } catch {
    autoPingEnabled = true;
  }

  if (!conexiones.length) {
    stopPingTimer();
    container.innerHTML = `
      <div class="empty-state glass">
        <i class="fa-solid fa-database"></i>
        <h3>Sin conexiones configuradas</h3>
        <p>Agrega tu primera conexión a SQL Server o MySQL para comenzar.</p>
        <button class="btn btn--primary" id="btn-first-add">
          <i class="fa-solid fa-plus"></i> Agregar conexión
        </button>
      </div>
    `;
    document.getElementById('btn-first-add').addEventListener('click', () => {
      openCreateModal(() => window.__reloadConexiones?.());
    });
    return;
  }

  const ids = conexiones.map((c) => c.id);

  container.innerHTML = `
    <div class="conexiones-toolbar glass">
      <label class="checkbox-group conexiones-toolbar__toggle">
        <input type="checkbox" id="auto-ping-toggle" ${autoPingEnabled ? 'checked' : ''}>
        Monitoreo automático de conexiones (cada 5 min)
      </label>
    </div>
    <div class="card-grid" id="conexiones-grid">
      ${conexiones.map((c) => renderCard(c)).join('')}
    </div>
  `;

  const reload = () => window.__reloadConexiones?.();
  const grid = document.getElementById('conexiones-grid');

  bindCardEvents(grid, conexiones, reload);
  bindAutoPingToggle(conexiones);

  if (autoPingEnabled) {
    await pingAllConnections(ids);
    startPingTimer(ids);
  }
}

export function cleanupConexionesPage() {
  stopPingTimer();
}

export function openNewConexionModal() {
  openCreateModal(() => window.__reloadConexiones?.());
}

import { api } from '../api.js';
import { showToast, confirmDialog, openModal } from '../utils.js';

const pingTimers = new Map();

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text ?? '';
  return div.innerHTML;
}

function getIntervalOptions(selected = 5) {
  let html = '';
  for (let minutes = 5; minutes <= 120; minutes += 5) {
    html += `<option value="${minutes}" ${minutes === selected ? 'selected' : ''}>Cada ${minutes} min</option>`;
  }
  return html;
}

function getRowEl(id) {
  return document.querySelector(`tr.servicio-row[data-id="${id}"]`);
}

function applyRowStatus(id, status) {
  const row = getRowEl(id);
  if (!row) return;

  row.classList.remove('servicio-row--online', 'servicio-row--offline', 'servicio-row--checking');

  const statusEl = row.querySelector('.servicio-row__status');
  if (!statusEl) return;

  if (status === 'online') {
    row.classList.add('servicio-row--online');
    statusEl.textContent = 'En línea';
    statusEl.className = 'servicio-row__status servicio-row__status--online';
  } else if (status === 'offline') {
    row.classList.add('servicio-row--offline');
    statusEl.textContent = 'Fuera de línea';
    statusEl.className = 'servicio-row__status servicio-row__status--offline';
  } else if (status === 'checking') {
    row.classList.add('servicio-row--checking');
    statusEl.textContent = 'Verificando...';
    statusEl.className = 'servicio-row__status servicio-row__status--checking';
  } else {
    statusEl.textContent = 'Sin verificar';
    statusEl.className = 'servicio-row__status';
  }
}

async function pingServicio(id, { silent = false } = {}) {
  applyRowStatus(id, 'checking');
  try {
    const result = await api.pingServicioOnline(id);
    applyRowStatus(id, 'online');
    if (!silent) showToast(result.mensaje || 'Servicio en línea', 'success');
    return { ok: true, result };
  } catch (err) {
    applyRowStatus(id, 'offline');
    if (!silent) showToast(err.message, 'error');
    return { ok: false, error: err };
  }
}

function clearServicePing(id) {
  const timer = pingTimers.get(id);
  if (timer) {
    clearInterval(timer);
    pingTimers.delete(id);
  }
}

function scheduleServicePing(servicio) {
  clearServicePing(servicio.id);
  const minutes = servicio.pingIntervalMinutes || 5;
  const ms = minutes * 60 * 1000;

  pingServicio(servicio.id, { silent: true });
  const timer = setInterval(() => {
    pingServicio(servicio.id, { silent: true });
  }, ms);
  pingTimers.set(servicio.id, timer);
}

function scheduleAllPings(servicios) {
  stopAllPings();
  servicios.forEach((servicio) => scheduleServicePing(servicio));
}

function stopAllPings() {
  pingTimers.forEach((timer) => clearInterval(timer));
  pingTimers.clear();
}

function getServicioFormHtml(servicio = {}) {
  return `
    <form id="servicio-form" novalidate>
      <div class="form-grid">
        <div class="form-group form-group--full">
          <label for="servicio-nombre">Nombre del servicio</label>
          <input type="text" id="servicio-nombre" name="nombre" value="${escapeHtml(servicio.nombre || '')}" required placeholder="Mi API">
        </div>
        <div class="form-group form-group--full">
          <label for="servicio-url">URL</label>
          <input type="text" id="servicio-url" name="url" value="${escapeHtml(servicio.url || '')}" required placeholder="ejemplo.com/health o https://...">
        </div>
        <div class="form-group form-group--full">
          <label for="servicio-interval">Ping automático</label>
          <select id="servicio-interval" name="pingIntervalMinutes">
            ${getIntervalOptions(servicio.pingIntervalMinutes || 5)}
          </select>
        </div>
      </div>
      <div class="form-actions">
        <button type="submit" class="btn btn--primary"><i class="fa-solid fa-floppy-disk"></i> Guardar</button>
      </div>
    </form>
  `;
}

function getServicioFormData(form) {
  return {
    nombre: form.querySelector('#servicio-nombre').value.trim(),
    url: form.querySelector('#servicio-url').value.trim(),
    pingIntervalMinutes: parseInt(form.querySelector('#servicio-interval').value, 10),
  };
}

function bindServicioForm(form, close, onSave, afterSave) {
  if (!form) return;

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const data = getServicioFormData(form);

    if (!data.nombre || !data.url) {
      showToast('Completa nombre y URL', 'error');
      return;
    }

    const submitBtn = form.querySelector('[type="submit"]');
    if (submitBtn) submitBtn.disabled = true;

    try {
      await onSave(data);
      close();
      if (afterSave) await afterSave();
    } catch (err) {
      showToast(err.message || 'No se pudo guardar el servicio', 'error');
    } finally {
      if (submitBtn) submitBtn.disabled = false;
    }
  });
}

function openServicioModal(servicio, reload) {
  const isEdit = Boolean(servicio?.id);
  openModal(isEdit ? 'Editar servicio' : 'Nuevo servicio', getServicioFormHtml(servicio), (_root, close) => {
    const form = document.getElementById('servicio-form');
    bindServicioForm(form, close, async (data) => {
      if (isEdit) {
        await api.updateServicioOnline(servicio.id, data);
        showToast('Servicio actualizado', 'success');
      } else {
        await api.createServicioOnline(data);
        showToast('Servicio creado', 'success');
      }
    }, reload);
    form?.querySelector('#servicio-nombre')?.focus();
  });
}

function bindTableEvents(container, servicios, reload) {
  container.querySelectorAll('.btn-ping').forEach((btn) => {
    btn.addEventListener('click', async () => {
      btn.disabled = true;
      try {
        await pingServicio(btn.dataset.id);
      } finally {
        btn.disabled = false;
      }
    });
  });

  container.querySelectorAll('.servicio-interval-select').forEach((select) => {
    select.addEventListener('change', async () => {
      const id = select.dataset.id;
      const minutes = parseInt(select.value, 10);

      try {
        await api.updateServicioOnline(id, { pingIntervalMinutes: minutes });
        const servicio = servicios.find((s) => s.id === id);
        if (servicio) {
          servicio.pingIntervalMinutes = minutes;
          scheduleServicePing(servicio);
        }
        showToast(`Ping automático cada ${minutes} min`, 'info');
      } catch (err) {
        showToast(err.message, 'error');
        await reload();
      }
    });
  });

  container.querySelectorAll('.btn-edit').forEach((btn) => {
    btn.addEventListener('click', () => {
      const servicio = servicios.find((s) => s.id === btn.dataset.id);
      if (servicio) openServicioModal(servicio, reload);
    });
  });

  container.querySelectorAll('.btn-delete').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const confirmed = await confirmDialog({
        title: 'Eliminar servicio',
        text: '¿Eliminar este servicio online?',
        icon: 'warning',
        confirmText: 'Sí, eliminar',
      });
      if (!confirmed) return;

      try {
        clearServicePing(btn.dataset.id);
        await api.deleteServicioOnline(btn.dataset.id);
        showToast('Servicio eliminado', 'success');
        await reload();
      } catch (err) {
        showToast(err.message, 'error');
      }
    });
  });
}

export function openNewServicioModal() {
  openServicioModal(null, () => window.__reloadServiciosOnline?.());
}

export async function renderServiciosOnline(container) {
  let servicios = [];

  try {
    servicios = await api.getServiciosOnline();
  } catch (err) {
    showToast(err.message, 'error');
  }

  if (!servicios.length) {
    stopAllPings();
    container.innerHTML = `
      <div class="empty-state glass">
        <i class="fa-solid fa-globe"></i>
        <h3>Sin servicios online</h3>
        <p>Agrega URLs para monitorear su disponibilidad con ping manual o automático.</p>
        <button class="btn btn--primary" id="btn-first-servicio" type="button">
          <i class="fa-solid fa-plus"></i> Agregar servicio
        </button>
      </div>
    `;
    document.getElementById('btn-first-servicio').addEventListener('click', openNewServicioModal);
    return;
  }

  container.innerHTML = `
    <div class="table-panel glass">
      <table class="data-table servicios-table">
        <thead>
          <tr>
            <th>Servicio</th>
            <th>URL</th>
            <th>Estado</th>
            <th>Ping automático</th>
            <th>Acciones</th>
          </tr>
        </thead>
        <tbody>
          ${servicios.map((s) => `
            <tr class="servicio-row" data-id="${escapeHtml(s.id)}">
              <td class="servicio-row__nombre">${escapeHtml(s.nombre)}</td>
              <td><a class="servicio-row__url" href="${escapeHtml(s.url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(s.url)}</a></td>
              <td><span class="servicio-row__status">Sin verificar</span></td>
              <td>
                <select class="servicio-interval-select" data-id="${escapeHtml(s.id)}" title="Intervalo de ping automático">
                  ${getIntervalOptions(s.pingIntervalMinutes || 5)}
                </select>
              </td>
              <td class="table-actions">
                <button class="btn btn--ghost btn--sm btn-ping" data-id="${escapeHtml(s.id)}" title="Hacer ping">
                  <i class="fa-solid fa-signal"></i> Ping
                </button>
                <button class="btn btn--ghost btn--sm btn-edit" data-id="${escapeHtml(s.id)}" title="Editar">
                  <i class="fa-solid fa-pen"></i>
                </button>
                <button class="btn btn--danger btn--sm btn-delete" data-id="${escapeHtml(s.id)}" title="Eliminar">
                  <i class="fa-solid fa-trash"></i>
                </button>
              </td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
  `;

  const reload = () => window.__reloadServiciosOnline?.();
  bindTableEvents(container, servicios, reload);
  scheduleAllPings(servicios);
}

export function cleanupServiciosOnlinePage() {
  stopAllPings();
}

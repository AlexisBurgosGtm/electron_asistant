import { api } from '../api.js';
import { showToast, confirmDialog, openModal, showLoader } from '../utils.js';
import { refreshAlarmas } from '../services/alarmas.js';

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text ?? '';
  return div.innerHTML;
}

function pad2(n) {
  return String(n).padStart(2, '0');
}

function formatAlarmDateTime(alarma) {
  if (!alarma?.fecha) return '—';
  return `${alarma.fecha} ${pad2(alarma.hora)}:${pad2(alarma.minuto)}`;
}

function getHourOptions(selected = 0) {
  return Array.from({ length: 24 }, (_, h) => `
    <option value="${h}" ${Number(selected) === h ? 'selected' : ''}>${pad2(h)}</option>
  `).join('');
}

function getMinuteOptions(selected = 0) {
  return Array.from({ length: 60 }, (_, m) => `
    <option value="${m}" ${Number(selected) === m ? 'selected' : ''}>${pad2(m)}</option>
  `).join('');
}

function getAlarmaFormHtml(alarma) {
  const a = alarma || {};
  const today = new Date().toISOString().slice(0, 10);

  return `
    <form id="alarma-form" novalidate>
      <div class="form-grid">
        <div class="form-group">
          <label for="alarma-fecha">Fecha</label>
          <input type="date" id="alarma-fecha" required value="${escapeHtml(a.fecha || today)}">
        </div>
        <div class="form-group">
          <label for="alarma-hora">Hora</label>
          <select id="alarma-hora" required>${getHourOptions(a.hora ?? new Date().getHours())}</select>
        </div>
        <div class="form-group">
          <label for="alarma-minuto">Minuto</label>
          <select id="alarma-minuto" required>${getMinuteOptions(a.minuto ?? new Date().getMinutes())}</select>
        </div>
        <div class="form-group form-group--full">
          <label for="alarma-descripcion">Descripción</label>
          <textarea id="alarma-descripcion" rows="3" required placeholder="Motivo de la alarma">${escapeHtml(a.descripcion || '')}</textarea>
        </div>
      </div>
      <div class="form-actions">
        <button type="submit" class="btn btn--primary"><i class="fa-solid fa-floppy-disk"></i> Guardar</button>
      </div>
    </form>
  `;
}

function getFormData(form) {
  return {
    fecha: form.querySelector('#alarma-fecha').value,
    hora: Number(form.querySelector('#alarma-hora').value),
    minuto: Number(form.querySelector('#alarma-minuto').value),
    descripcion: form.querySelector('#alarma-descripcion').value.trim(),
  };
}

function bindAlarmaForm(form, close, onSave, afterSave) {
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const data = getFormData(form);

    if (!data.fecha || !data.descripcion) {
      showToast('Completa fecha y descripción', 'error');
      return;
    }

    const submitBtn = form.querySelector('[type="submit"]');
    if (submitBtn) submitBtn.disabled = true;

    try {
      await onSave(data);
      close();
      if (afterSave) await afterSave();
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      if (submitBtn) submitBtn.disabled = false;
    }
  });
}

function openAlarmaModal(alarma, reload) {
  const isEdit = Boolean(alarma?.id);
  openModal(isEdit ? 'Editar alarma' : 'Nueva alarma', getAlarmaFormHtml(alarma), (_root, close) => {
    const form = document.getElementById('alarma-form');
    bindAlarmaForm(form, close, async (data) => {
      if (isEdit) {
        await api.updateAlarma(alarma.id, data);
        showToast('Alarma actualizada', 'success');
      } else {
        await api.createAlarma(data);
        showToast('Alarma creada', 'success');
      }
      await refreshAlarmas();
    }, reload);
  });
}

function bindTableEvents(container, reload) {
  container.querySelectorAll('.btn-edit').forEach((btn) => {
    btn.addEventListener('click', async () => {
      try {
        const alarmas = await api.getAlarmas();
        const alarma = alarmas.find((a) => a.id === btn.dataset.id);
        if (alarma) openAlarmaModal(alarma, reload);
      } catch (err) {
        showToast(err.message, 'error');
      }
    });
  });

  container.querySelectorAll('.btn-delete').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const confirmed = await confirmDialog({
        title: 'Eliminar alarma',
        text: '¿Eliminar esta alarma?',
        icon: 'warning',
        confirmText: 'Sí, eliminar',
      });
      if (!confirmed) return;

      try {
        await api.deleteAlarma(btn.dataset.id);
        showToast('Alarma eliminada', 'success');
        await refreshAlarmas();
        await reload();
      } catch (err) {
        showToast(err.message, 'error');
      }
    });
  });
}

export async function openNewAlarmaModal() {
  openAlarmaModal(null, () => window.__reloadAlarmas?.());
}

function renderAlarmasTable(alarmas) {
  const pending = alarmas.filter((a) => !a.disparada);
  const fired = alarmas.filter((a) => a.disparada);

  const renderRow = (alarma) => `
    <tr class="${alarma.disparada ? 'alarma-row--fired' : ''}">
      <td>${escapeHtml(formatAlarmDateTime(alarma))}</td>
      <td>${escapeHtml(alarma.descripcion)}</td>
      <td>
        <span class="table-tag ${alarma.disparada ? 'table-tag--muted' : 'table-tag--ok'}">
          <i class="fa-solid ${alarma.disparada ? 'fa-bell-slash' : 'fa-bell'}"></i>
          ${alarma.disparada ? 'Disparada' : 'Pendiente'}
        </span>
      </td>
      <td class="table-actions">
        ${!alarma.disparada ? `
          <button class="btn btn--ghost btn--sm btn-edit" data-id="${alarma.id}" title="Editar">
            <i class="fa-solid fa-pen"></i>
          </button>
        ` : ''}
        <button class="btn btn--danger btn--sm btn-delete" data-id="${alarma.id}" title="Eliminar">
          <i class="fa-solid fa-trash"></i>
        </button>
      </td>
    </tr>
  `;

  if (!alarmas.length) {
    return `
      <div class="empty-state glass">
        <i class="fa-solid fa-bell"></i>
        <h3>Sin alarmas</h3>
        <p>Agrega una alarma con fecha, hora y descripción. Al llegar el momento escucharás un aviso.</p>
        <button class="btn btn--primary" id="btn-first-alarma" type="button">
          <i class="fa-solid fa-plus"></i> Agregar alarma
        </button>
      </div>
    `;
  }

  return `
    <div class="table-panel glass">
      <table class="data-table">
        <thead>
          <tr>
            <th>Fecha y hora</th>
            <th>Descripción</th>
            <th>Estado</th>
            <th>Acciones</th>
          </tr>
        </thead>
        <tbody>
          ${pending.map(renderRow).join('')}
          ${fired.map(renderRow).join('')}
        </tbody>
      </table>
    </div>
  `;
}

export async function renderAlarmas(container) {
  showLoader(container, 'Cargando alarmas...');

  let alarmas = [];
  try {
    alarmas = await api.getAlarmas();
  } catch (err) {
    container.innerHTML = `<div class="empty-state glass"><p>${escapeHtml(err.message)}</p></div>`;
    return;
  }

  container.innerHTML = renderAlarmasTable(alarmas);

  document.getElementById('btn-first-alarma')?.addEventListener('click', openNewAlarmaModal);
  bindTableEvents(container, () => window.__reloadAlarmas?.());
}

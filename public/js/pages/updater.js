import { api } from '../api.js';
import { showToast, confirmDialog, openModal, showLoader } from '../utils.js';

const VERSION_YEARS = [];
for (let year = 2024; year <= 2030; year += 1) VERSION_YEARS.push(year);

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text ?? '';
  return div.innerHTML;
}

function todayIsoDate() {
  return new Date().toISOString().slice(0, 10);
}

function getVersionOptions(selected) {
  return VERSION_YEARS.map((year) => `
    <option value="${year}" ${String(year) === String(selected) ? 'selected' : ''}>${year}</option>
  `).join('');
}

function getUpdaterFormHtml(record) {
  const data = record || {};
  const isEdit = Boolean(data.ID);
  const fecha = data.FECHA || todayIsoDate();

  return `
    <form id="updater-form" novalidate>
      <div class="form-grid">
        <div class="form-group">
          <label for="updater-db">DB</label>
          <select id="updater-db" required>
            <option value="P" ${data.DB === 'P' ? 'selected' : ''}>P</option>
            <option value="T" ${data.DB === 'T' ? 'selected' : ''}>T</option>
          </select>
        </div>
        <div class="form-group">
          <label for="updater-version">Versión</label>
          <select id="updater-version" required>
            ${getVersionOptions(data.VERSION || new Date().getFullYear())}
          </select>
        </div>
        <div class="form-group">
          <label for="updater-fecha">Fecha</label>
          <input type="date" id="updater-fecha" value="${escapeHtml(fecha)}" ${isEdit ? '' : 'readonly'}>
        </div>
        <div class="form-group form-group--full">
          <label for="updater-qry">Query (QRY)</label>
          <textarea id="updater-qry" rows="8" required placeholder="ALTER TABLE ...">${escapeHtml(data.QRY || '')}</textarea>
        </div>
      </div>
      <div class="form-actions">
        <button type="submit" class="btn btn--primary"><i class="fa-solid fa-floppy-disk"></i> Guardar</button>
      </div>
    </form>
  `;
}

function getUpdaterFormData(form, isEdit) {
  return {
    DB: form.querySelector('#updater-db').value,
    VERSION: parseInt(form.querySelector('#updater-version').value, 10),
    FECHA: isEdit ? form.querySelector('#updater-fecha').value : todayIsoDate(),
    QRY: form.querySelector('#updater-qry').value.trim(),
  };
}

function bindUpdaterForm(form, close, onSave, afterSave, isEdit) {
  if (!form) return;

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const data = getUpdaterFormData(form, isEdit);

    if (!data.QRY) {
      showToast('La query no puede estar vacía', 'error');
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

function openUpdaterModal(record, reload) {
  const isEdit = Boolean(record?.ID);
  openModal(isEdit ? 'Editar query de actualización' : 'Nueva query de actualización', getUpdaterFormHtml(record), (_root, close) => {
    const form = document.getElementById('updater-form');
    bindUpdaterForm(form, close, async (data) => {
      if (isEdit) {
        await api.updateUpdaterQuery(record.ID, data);
        showToast('Query actualizada', 'success');
      } else {
        await api.createUpdaterQuery(data);
        showToast('Query creada', 'success');
      }
    }, reload, isEdit);
  });
}

let updaterState = { records: [], search: '' };

function filterUpdaterRecords(records, search) {
  const q = search.trim().toLowerCase();
  if (!q) return records;
  return records.filter((r) => {
    const qry = String(r.QRY || '').toLowerCase();
    const id = String(r.ID || '');
    const db = String(r.DB || '').toLowerCase();
    const version = String(r.VERSION || '');
    const fecha = String(r.FECHA || '');
    return qry.includes(q) || id.includes(q) || db.includes(q) || version.includes(q) || fecha.includes(q);
  });
}

function renderUpdaterRows(records) {
  if (!records.length) {
    const msg = updaterState.records.length ? 'No hay queries que coincidan' : 'No hay queries en UPDATE_QUERIES';
    return `<tr><td colspan="6" class="table-empty">${msg}</td></tr>`;
  }

  return records.map((r) => `
    <tr>
      <td>${escapeHtml(r.ID)}</td>
      <td><span class="table-tag">${escapeHtml(r.DB || '')}</span></td>
      <td>${escapeHtml(r.VERSION)}</td>
      <td>${escapeHtml(r.FECHA || '')}</td>
      <td><code class="query-preview">${escapeHtml(r.QRY || '')}</code></td>
      <td class="table-actions">
        <button class="btn btn--ghost btn--sm btn-edit-updater" data-id="${escapeHtml(r.ID)}" title="Editar">
          <i class="fa-solid fa-pen"></i>
        </button>
        <button class="btn btn--danger btn--sm btn-delete-updater" data-id="${escapeHtml(r.ID)}" title="Eliminar">
          <i class="fa-solid fa-trash"></i>
        </button>
      </td>
    </tr>
  `).join('');
}

function refreshUpdaterTable(container, reload) {
  const tbody = container.querySelector('#updater-tbody');
  if (!tbody) return;
  const filtered = filterUpdaterRecords(updaterState.records, updaterState.search);
  tbody.innerHTML = renderUpdaterRows(filtered);
  bindUpdaterEvents(container, updaterState.records, reload);
}

function bindUpdaterEvents(container, records, reload) {
  container.querySelectorAll('.btn-edit-updater').forEach((btn) => {
    btn.addEventListener('click', () => {
      const record = records.find((r) => String(r.ID) === String(btn.dataset.id));
      if (record) openUpdaterModal(record, reload);
    });
  });

  container.querySelectorAll('.btn-delete-updater').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const confirmed = await confirmDialog({
        title: 'Eliminar query',
        text: '¿Eliminar esta query de UPDATE_QUERIES?',
        confirmText: 'Sí, eliminar',
      });
      if (!confirmed) return;

      try {
        await api.deleteUpdaterQuery(btn.dataset.id);
        showToast('Query eliminada', 'success');
        await reload();
      } catch (err) {
        showToast(err.message, 'error');
      }
    });
  });
}

function renderHostingBanner(hosting) {
  if (!hosting?.conexion) {
    return `
      <div class="hosting-banner hosting-banner--warn glass">
        <i class="fa-solid fa-triangle-exclamation"></i>
        <span>Configura el <strong>Hosting principal</strong> en Configuraciones.</span>
      </div>
    `;
  }

  return `
    <div class="hosting-banner glass">
      <i class="fa-solid fa-server"></i>
      <span>Hosting: <strong>${escapeHtml(hosting.conexion.nombre)}</strong></span>
    </div>
  `;
}

export async function openNewUpdaterModal() {
  try {
    const hosting = await api.getHostingStatus();
    if (!hosting.principalConexionId) {
      showToast('Configura el Hosting principal en Configuraciones', 'error');
      return;
    }
    openUpdaterModal(null, () => window.__reloadUpdater?.());
  } catch (err) {
    showToast(err.message, 'error');
  }
}

export async function renderUpdater(container) {
  showLoader(container, 'Cargando queries...');

  let hosting;
  let records = [];

  try {
    hosting = await api.getHostingStatus();
  } catch (err) {
    container.innerHTML = `<div class="empty-state glass"><p>${escapeHtml(err.message)}</p></div>`;
    return;
  }

  if (!hosting.principalConexionId) {
    container.innerHTML = `
      ${renderHostingBanner(hosting)}
      <div class="empty-state glass">
        <i class="fa-solid fa-database"></i>
        <h3>Hosting principal no configurado</h3>
        <p>Ve a Configuraciones y selecciona la conexión del hosting.</p>
      </div>
    `;
    return;
  }

  try {
    records = await api.getUpdaterQueries();
  } catch (err) {
    container.innerHTML = `
      ${renderHostingBanner(hosting)}
      <div class="empty-state glass"><p>${escapeHtml(err.message)}</p></div>
    `;
    return;
  }

  updaterState.records = records;
  const reload = () => window.__reloadUpdater?.();

  container.innerHTML = `
    ${renderHostingBanner(hosting)}
    <div class="table-panel glass">
      <div class="table-panel__toolbar">
        <input type="search" id="updater-search" class="table-search" placeholder="Buscar en query..." value="${escapeHtml(updaterState.search)}">
      </div>
      <table class="data-table">
        <thead>
          <tr>
            <th>ID</th>
            <th>DB</th>
            <th>Versión</th>
            <th>Fecha</th>
            <th>Query</th>
            <th>Acciones</th>
          </tr>
        </thead>
        <tbody id="updater-tbody">
          ${renderUpdaterRows(filterUpdaterRecords(records, updaterState.search))}
        </tbody>
      </table>
    </div>
  `;

  container.querySelector('#updater-search')?.addEventListener('input', (e) => {
    updaterState.search = e.target.value;
    refreshUpdaterTable(container, reload);
  });

  bindUpdaterEvents(container, records, reload);
}

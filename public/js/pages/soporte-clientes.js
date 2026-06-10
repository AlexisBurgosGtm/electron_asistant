import { api } from '../api.js';
import { showToast, confirmDialog, openModal, showLoader } from '../utils.js';

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text ?? '';
  return div.innerHTML;
}

function getSoporteFormHtml(record, tokens) {
  const data = record || {};
  const tokenOptions = tokens.map((t) => `
    <option value="${escapeHtml(t.TOKEN)}" ${data.TOKEN === t.TOKEN ? 'selected' : ''}>
      ${escapeHtml(t.EMPRESA || t.TOKEN)}
    </option>
  `).join('');

  return `
    <form id="soporte-form" novalidate>
      <div class="form-grid">
        <div class="form-group form-group--full">
          <label for="soporte-token">Empresa (TOKEN)</label>
          <select id="soporte-token" required>
            <option value="">— Seleccionar empresa —</option>
            ${tokenOptions}
          </select>
        </div>
        <div class="form-group">
          <label for="soporte-sucursal">Sucursal</label>
          <input type="text" id="soporte-sucursal" value="${escapeHtml(data.SUCURSAL || '')}">
        </div>
        <div class="form-group">
          <label for="soporte-tipo">Tipo</label>
          <input type="text" id="soporte-tipo" value="${escapeHtml(data.TIPO || '')}">
        </div>
        <div class="form-group">
          <label for="soporte-anydesk">AnyDesk</label>
          <input type="text" id="soporte-anydesk" value="${escapeHtml(data.ANYDESK || '')}">
        </div>
        <div class="form-group">
          <label for="soporte-pass">Contraseña</label>
          <input type="text" id="soporte-pass" value="${escapeHtml(data.PASS || '')}">
        </div>
      </div>
      <div class="form-actions">
        <button type="submit" class="btn btn--primary"><i class="fa-solid fa-floppy-disk"></i> Guardar</button>
      </div>
    </form>
  `;
}

function getSoporteFormData(form) {
  return {
    TOKEN: form.querySelector('#soporte-token').value,
    SUCURSAL: form.querySelector('#soporte-sucursal').value.trim(),
    TIPO: form.querySelector('#soporte-tipo').value.trim(),
    ANYDESK: form.querySelector('#soporte-anydesk').value.trim(),
    PASS: form.querySelector('#soporte-pass').value.trim(),
  };
}

function bindSoporteForm(form, close, onSave, afterSave) {
  if (!form) return;

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const data = getSoporteFormData(form);

    if (!data.TOKEN) {
      showToast('Selecciona una empresa', 'error');
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

function openSoporteModal(record, tokens, reload) {
  const isEdit = Boolean(record?.ID);
  openModal(isEdit ? 'Editar soporte AnyDesk' : 'Nuevo soporte AnyDesk', getSoporteFormHtml(record, tokens), (_root, close) => {
    const form = document.getElementById('soporte-form');
    bindSoporteForm(form, close, async (data) => {
      if (isEdit) {
        await api.updateSoporteAnydesk(record.ID, data);
        showToast('Registro actualizado', 'success');
      } else {
        await api.createSoporteAnydesk(data);
        showToast('Registro creado', 'success');
      }
    }, reload);
  });
}

let soporteState = { records: [], search: '' };

function filterSoporteRecords(records, search, tokenMap) {
  const q = search.trim().toLowerCase();
  if (!q) return records;
  return records.filter((r) => {
    const fields = [
      tokenMap[r.TOKEN] || '',
      r.TOKEN,
      r.SUCURSAL,
      r.TIPO,
      r.ANYDESK,
      r.PASS,
    ].map((v) => String(v || '').toLowerCase());
    return fields.some((f) => f.includes(q));
  });
}

function renderSoporteRows(records, tokenMap) {
  if (!records.length) {
    const msg = soporteState.records.length ? 'No hay registros que coincidan' : 'No hay registros en SOPORTE_ANYDESK';
    return `<tr><td colspan="7" class="table-empty">${msg}</td></tr>`;
  }

  return records.map((r) => `
    <tr>
      <td>${escapeHtml(tokenMap[r.TOKEN] || '—')}</td>
      <td><code>${escapeHtml(r.TOKEN || '')}</code></td>
      <td>${escapeHtml(r.SUCURSAL || '')}</td>
      <td>${escapeHtml(r.TIPO || '')}</td>
      <td>${escapeHtml(r.ANYDESK || '')}</td>
      <td>${escapeHtml(r.PASS || '')}</td>
      <td class="table-actions">
        <button class="btn btn--ghost btn--sm btn-edit-soporte" data-id="${escapeHtml(r.ID)}" title="Editar">
          <i class="fa-solid fa-pen"></i>
        </button>
        <button class="btn btn--danger btn--sm btn-delete-soporte" data-id="${escapeHtml(r.ID)}" title="Eliminar">
          <i class="fa-solid fa-trash"></i>
        </button>
      </td>
    </tr>
  `).join('');
}

function refreshSoporteTable(container, tokenMap, reload) {
  const tbody = container.querySelector('#soporte-tbody');
  if (!tbody) return;
  const filtered = filterSoporteRecords(soporteState.records, soporteState.search, tokenMap);
  tbody.innerHTML = renderSoporteRows(filtered, tokenMap);
  bindSoporteEvents(container, soporteState.records, window.__soporteTokens || [], reload);
}

function bindSoporteEvents(container, records, tokens, reload) {
  container.querySelectorAll('.btn-edit-soporte').forEach((btn) => {
    btn.addEventListener('click', () => {
      const record = records.find((r) => String(r.ID) === String(btn.dataset.id));
      if (record) openSoporteModal(record, tokens, reload);
    });
  });

  container.querySelectorAll('.btn-delete-soporte').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const confirmed = await confirmDialog({
        title: 'Eliminar registro',
        text: '¿Eliminar este registro de soporte AnyDesk?',
        confirmText: 'Sí, eliminar',
      });
      if (!confirmed) return;

      try {
        await api.deleteSoporteAnydesk(btn.dataset.id);
        showToast('Registro eliminado', 'success');
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
        <span>Configura el <strong>Hosting principal</strong> en Configuraciones para usar esta sección.</span>
      </div>
    `;
  }

  return `
    <div class="hosting-banner glass">
      <i class="fa-solid fa-server"></i>
      <span>Hosting: <strong>${escapeHtml(hosting.conexion.nombre)}</strong> (${escapeHtml(hosting.conexion.host)})</span>
    </div>
  `;
}

export async function openNewSoporteModal() {
  try {
    const hosting = await api.getHostingStatus();
    if (!hosting.principalConexionId) {
      showToast('Configura el Hosting principal en Configuraciones', 'error');
      return;
    }

    let tokens = window.__soporteTokens || [];
    if (!tokens.length) {
      tokens = await api.getSoporteTokens();
      window.__soporteTokens = tokens;
    }

    if (!tokens.length) {
      showToast('No hay empresas en la tabla TOKENS', 'error');
      return;
    }

    openSoporteModal(null, tokens, () => window.__reloadSoporte?.());
  } catch (err) {
    showToast(err.message, 'error');
  }
}

export async function renderSoporteClientes(container) {
  showLoader(container, 'Cargando soporte...');

  let hosting;
  let records = [];
  let tokens = [];

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
        <i class="fa-solid fa-headset"></i>
        <h3>Hosting principal no configurado</h3>
        <p>Ve a Configuraciones y selecciona la conexión del hosting.</p>
      </div>
    `;
    return;
  }

  try {
    [records, tokens] = await Promise.all([
      api.getSoporteAnydesk(),
      api.getSoporteTokens(),
    ]);
  } catch (err) {
    container.innerHTML = `
      ${renderHostingBanner(hosting)}
      <div class="empty-state glass"><p>${escapeHtml(err.message)}</p></div>
    `;
    return;
  }

  window.__soporteTokens = tokens;
  soporteState.records = records;
  const tokenMap = Object.fromEntries(tokens.map((t) => [t.TOKEN, t.EMPRESA || t.TOKEN]));
  const reload = () => window.__reloadSoporte?.();

  container.innerHTML = `
    ${renderHostingBanner(hosting)}
    <div class="table-panel glass">
      <div class="table-panel__toolbar">
        <input type="search" id="soporte-search" class="table-search" placeholder="Buscar en soporte..." value="${escapeHtml(soporteState.search)}">
      </div>
      <table class="data-table">
        <thead>
          <tr>
            <th>Empresa</th>
            <th>Token</th>
            <th>Sucursal</th>
            <th>Tipo</th>
            <th>AnyDesk</th>
            <th>Pass</th>
            <th>Acciones</th>
          </tr>
        </thead>
        <tbody id="soporte-tbody">
          ${renderSoporteRows(filterSoporteRecords(records, soporteState.search, tokenMap), tokenMap)}
        </tbody>
      </table>
    </div>
  `;

  container.querySelector('#soporte-search')?.addEventListener('input', (e) => {
    soporteState.search = e.target.value;
    refreshSoporteTable(container, tokenMap, reload);
  });

  bindSoporteEvents(container, records, tokens, reload);
}

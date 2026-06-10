import { api } from '../api.js';
import { showToast, showLoader } from '../utils.js';

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text ?? '';
  return div.innerHTML;
}

export async function renderConfiguraciones(container) {
  showLoader(container, 'Cargando configuración...');

  let config;
  let conexiones = [];

  try {
    [config, conexiones] = await Promise.all([
      api.getConfig(),
      api.getConexiones(),
    ]);
  } catch (err) {
    container.innerHTML = `<div class="empty-state glass"><p>${escapeHtml(err.message)}</p></div>`;
    return;
  }

  const selectedId = config?.hosting?.principalConexionId || '';

  container.innerHTML = `
    <div class="settings-panel glass">
      <div class="settings-section">
        <h3><i class="fa-solid fa-server"></i> Hosting principal</h3>
        <p class="settings-section__desc">
          Selecciona la conexión que usarán las secciones <strong>Soporte Clientes</strong> y <strong>Updater</strong>.
        </p>

        ${!conexiones.length ? `
          <div class="empty-state glass" style="margin-top:1rem;padding:1.5rem;">
            <p>No hay conexiones configuradas. Agrega una en la sección Conexiones.</p>
          </div>
        ` : `
          <div class="form-group form-group--full">
            <label for="hosting-principal">Conexión de hosting</label>
            <select id="hosting-principal">
              <option value="">— Seleccionar conexión —</option>
              ${conexiones.map((c) => `
                <option value="${escapeHtml(c.id)}" ${String(c.id) === String(selectedId) ? 'selected' : ''}>
                  ${escapeHtml(c.nombre)} (${escapeHtml(c.tipo)} — ${escapeHtml(c.host)})
                </option>
              `).join('')}
            </select>
          </div>
          <div class="form-actions">
            <button type="button" class="btn btn--primary" id="btn-save-hosting">
              <i class="fa-solid fa-floppy-disk"></i> Guardar configuración
            </button>
          </div>
        `}
      </div>
    </div>
  `;

  const saveBtn = container.querySelector('#btn-save-hosting');
  if (!saveBtn) return;

  saveBtn.addEventListener('click', async () => {
    const select = container.querySelector('#hosting-principal');
    const principalConexionId = select.value || null;

    if (!principalConexionId) {
      showToast('Selecciona una conexión de hosting', 'error');
      return;
    }

    saveBtn.disabled = true;
    try {
      await api.updateConfig({ hosting: { principalConexionId } });
      showToast('Hosting principal guardado', 'success');
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      saveBtn.disabled = false;
    }
  });
}

import { api } from '../api.js';
import { showToast, confirmDialog, openModal } from '../utils.js';
import { runMantenimientoComando } from '../services/connections.js';

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text ?? '';
  return div.innerHTML;
}

function getComandoFormHtml(comando, conexiones = []) {
  const c = comando || {};
  const options = conexiones.map((conn) => `
    <option value="${conn.id}" ${c.conexionId === conn.id ? 'selected' : ''}>${escapeHtml(conn.nombre)}</option>
  `).join('');

  return `
    <form id="comando-form" novalidate>
      <div class="form-grid">
        <div class="form-group form-group--full">
          <label for="cmd-nombre">Nombre (opcional)</label>
          <input type="text" id="cmd-nombre" name="nombre" value="${escapeHtml(c.nombre || '')}" placeholder="Descripción del comando">
        </div>
        <div class="form-group form-group--full">
          <label for="cmd-conexionId">Conexión</label>
          <select id="cmd-conexionId" name="conexionId" required>
            <option value="">Seleccionar conexión...</option>
            ${options}
          </select>
        </div>
        <div class="form-group form-group--full">
          <label for="cmd-comandoVoz">Comando de voz</label>
          <input type="text" id="cmd-comandoVoz" name="comandoVoz" value="${escapeHtml(c.comandoVoz || '')}" required placeholder="ej: muestra inventario">
        </div>
        <div class="form-group form-group--full">
          <label for="cmd-query">Query SQL</label>
          <textarea id="cmd-query" name="sqlQuery" rows="6" required placeholder="SELECT * FROM ...">${escapeHtml(c.query || '')}</textarea>
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
    nombre: form.querySelector('#cmd-nombre').value.trim(),
    conexionId: form.querySelector('#cmd-conexionId').value,
    comandoVoz: form.querySelector('#cmd-comandoVoz').value.trim(),
    query: form.querySelector('#cmd-query').value.trim(),
  };
}

function bindComandoForm(form, close, onSave, afterSave) {
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const data = getFormData(form);

    if (!data.conexionId || !data.query || !data.comandoVoz) {
      showToast('Completa todos los campos obligatorios', 'error');
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

function openComandoModal(comando, conexiones, reload) {
  const isEdit = Boolean(comando?.id);
  openModal(isEdit ? 'Editar comando' : 'Nuevo comando', getComandoFormHtml(comando, conexiones), (_root, close) => {
    const form = document.getElementById('comando-form');
    bindComandoForm(form, close, async (data) => {
      if (isEdit) {
        await api.updateMantenimiento(comando.id, data);
        showToast('Comando actualizado', 'success');
      } else {
        await api.createMantenimiento(data);
        showToast('Comando creado', 'success');
      }
    }, reload);
  });
}

function bindTableEvents(container, conexiones, reload) {
  container.querySelectorAll('.btn-run').forEach((btn) => {
    btn.addEventListener('click', async () => {
      btn.disabled = true;
      try {
        await runMantenimientoComando({ id: btn.dataset.id });
      } finally {
        btn.disabled = false;
      }
    });
  });

  container.querySelectorAll('.btn-edit').forEach((btn) => {
    btn.addEventListener('click', async () => {
      try {
        const comandos = await api.getMantenimiento();
        const comando = comandos.find((c) => c.id === btn.dataset.id);
        if (comando) openComandoModal(comando, conexiones, reload);
      } catch (err) {
        showToast(err.message, 'error');
      }
    });
  });

  container.querySelectorAll('.btn-delete').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const confirmed = await confirmDialog({
        title: 'Eliminar comando',
        text: '¿Eliminar este comando de mantenimiento?',
        icon: 'warning',
        confirmText: 'Sí, eliminar',
      });
      if (!confirmed) return;

      try {
        await api.deleteMantenimiento(btn.dataset.id);
        showToast('Comando eliminado', 'success');
        await reload();
      } catch (err) {
        showToast(err.message, 'error');
      }
    });
  });
}

export async function openNewComandoModal() {
  let conexiones = window.__mantenimientoConexiones;

  if (!conexiones?.length) {
    try {
      conexiones = await api.getConexiones();
      window.__mantenimientoConexiones = conexiones;
    } catch (err) {
      showToast(err.message, 'error');
      return;
    }
  }

  if (!conexiones.length) {
    showToast('Registra al menos una conexión antes de agregar comandos', 'error');
    return;
  }

  openComandoModal(null, conexiones, () => window.__reloadMantenimiento?.());
}

export async function renderMantenimiento(container) {
  let comandos = [];
  let conexiones = [];

  try {
    [comandos, conexiones] = await Promise.all([
      api.getMantenimiento(),
      api.getConexiones(),
    ]);
  } catch (err) {
    showToast(err.message, 'error');
  }

  window.__mantenimientoConexiones = conexiones;

  const conexionMap = Object.fromEntries(conexiones.map((c) => [c.id, c.nombre]));

  if (!comandos.length) {
    container.innerHTML = `
      <div class="empty-state glass">
        <i class="fa-solid fa-screwdriver-wrench"></i>
        <h3>Sin comandos de mantenimiento</h3>
        <p>Agrega queries SQL asociadas a una conexión y un comando de voz para ejecutarlas.</p>
        <button class="btn btn--primary" id="btn-first-comando" type="button">
          <i class="fa-solid fa-plus"></i> Agregar comando
        </button>
      </div>
    `;
    document.getElementById('btn-first-comando').addEventListener('click', openNewComandoModal);
    return;
  }

  container.innerHTML = `
    <div class="table-panel glass">
      <table class="data-table">
        <thead>
          <tr>
            <th>Nombre</th>
            <th>Conexión</th>
            <th>Query</th>
            <th>Comando de voz</th>
            <th>Acciones</th>
          </tr>
        </thead>
        <tbody>
          ${comandos.map((c) => `
            <tr>
              <td>${escapeHtml(c.nombre || '—')}</td>
              <td><span class="table-tag"><i class="fa-solid fa-plug"></i> ${escapeHtml(conexionMap[c.conexionId] || 'Desconocida')}</span></td>
              <td><code class="query-preview">${escapeHtml(c.query)}</code></td>
              <td><span class="table-tag table-tag--voice"><i class="fa-solid fa-microphone"></i> ${escapeHtml(c.comandoVoz)}</span></td>
              <td class="table-actions">
                <button class="btn btn--ghost btn--sm btn-run" data-id="${c.id}" title="Ejecutar">
                  <i class="fa-solid fa-play"></i>
                </button>
                <button class="btn btn--ghost btn--sm btn-edit" data-id="${c.id}" title="Editar">
                  <i class="fa-solid fa-pen"></i>
                </button>
                <button class="btn btn--danger btn--sm btn-delete" data-id="${c.id}" title="Eliminar">
                  <i class="fa-solid fa-trash"></i>
                </button>
              </td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
  `;

  bindTableEvents(container, conexiones, () => window.__reloadMantenimiento?.());
}

import { api } from '../api.js';
import { showToast, confirmDialog, openModal, getTipoBadge, getFormHtml, bindFormEvents } from '../utils.js';
import { runConnectionTest } from '../services/connections.js';

function renderCard(conexion, handlers) {
  const puerto = conexion.puerto || (conexion.tipo === 'mssql' ? 1433 : 3306);
  return `
    <div class="card glass" data-id="${conexion.id}">
      <div class="card__header">
        <div>
          <div class="card__title">${conexion.nombre}</div>
          <div class="card__meta">${conexion.host}:${puerto}</div>
        </div>
        ${getTipoBadge(conexion.tipo)}
      </div>
      <div class="card__details">
        <div class="card__detail"><i class="fa-solid fa-database"></i> ${conexion.baseDatos}</div>
        <div class="card__detail"><i class="fa-solid fa-user"></i> ${conexion.usuario || '—'}</div>
        <div class="card__detail"><i class="fa-solid fa-fingerprint"></i> ID: ${conexion.id}</div>
      </div>
      <div class="card__actions">
        <button class="btn btn--ghost btn--sm btn-test" data-id="${conexion.id}" data-nombre="${conexion.nombre.replace(/"/g, '&quot;')}">
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

function bindCardEvents(container, reload) {
  container.querySelectorAll('.btn-test').forEach((btn) => {
    btn.addEventListener('click', async () => {
      btn.disabled = true;
      try {
        await runConnectionTest(btn.dataset.id, btn.dataset.nombre);
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

  if (!conexiones.length) {
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

  container.innerHTML = `<div class="card-grid" id="conexiones-grid">
    ${conexiones.map((c) => renderCard(c)).join('')}
  </div>`;

  bindCardEvents(document.getElementById('conexiones-grid'), () => window.__reloadConexiones?.());
}

export function openNewConexionModal() {
  openCreateModal(() => window.__reloadConexiones?.());
}

const SWAL_BASE = {
  background: 'rgba(15, 31, 58, 0.92)',
  color: '#e8f0fe',
  backdrop: 'rgba(0, 0, 0, 0.55)',
  customClass: {
    popup: 'swal-glass',
    container: 'swal-glass-backdrop',
  },
  buttonsStyling: true,
  confirmButtonColor: '#3b82f6',
  cancelButtonColor: '#64748b',
};

export async function confirmDialog({
  title = '¿Confirmar?',
  text = '',
  icon = 'warning',
  confirmText = 'Sí, continuar',
  cancelText = 'Cancelar',
} = {}) {
  const result = await Swal.fire({
    ...SWAL_BASE,
    title,
    text,
    icon,
    showCancelButton: true,
    confirmButtonText: confirmText,
    cancelButtonText: cancelText,
    reverseButtons: true,
    focusCancel: true,
  });

  return result.isConfirmed;
}

export function showToast(message, type = 'info') {
  const container = document.getElementById('toast-container');
  const icons = {
    success: 'fa-circle-check',
    error: 'fa-circle-xmark',
    info: 'fa-circle-info',
  };

  const toast = document.createElement('div');
  toast.className = `toast glass toast--${type}`;
  toast.innerHTML = `
    <i class="fa-solid ${icons[type] || icons.info}"></i>
    <span>${message}</span>
  `;

  container.appendChild(toast);
  setTimeout(() => toast.remove(), 4000);
}

export function openModal(title, contentHtml, onMount) {
  const root = document.getElementById('modal-root');
  root.innerHTML = `
    <div class="modal-overlay" id="modal-overlay">
      <div class="modal glass">
        <div class="modal__header">
          <h2>${title}</h2>
          <button class="modal__close" id="modal-close"><i class="fa-solid fa-xmark"></i></button>
        </div>
        <div class="modal__body">${contentHtml}</div>
      </div>
    </div>
  `;

  const overlay = document.getElementById('modal-overlay');
  const modal = overlay.querySelector('.modal');

  const close = () => { root.innerHTML = ''; };

  document.getElementById('modal-close').addEventListener('click', close);

  modal.addEventListener('mousedown', (e) => e.stopPropagation());
  modal.addEventListener('click', (e) => e.stopPropagation());

  if (onMount) onMount(root, close);
  return close;
}

export function getTipoLabel(tipo) {
  return tipo === 'mssql' ? 'SQL Server' : 'MySQL';
}

export function getTipoBadge(tipo) {
  const label = getTipoLabel(tipo);
  const icon = tipo === 'mssql' ? 'fa-server' : 'fa-dolphin';
  return `<span class="badge badge--${tipo}"><i class="fa-solid ${icon}"></i> ${label}</span>`;
}

export function getFormHtml(conexion = {}) {
  const isMssql = (conexion.tipo || 'mysql') === 'mssql';
  return `
    <form id="conexion-form" novalidate>
      <div class="form-grid">
        <div class="form-group form-group--full">
          <label for="nombre">Nombre</label>
          <input type="text" id="nombre" name="nombre" value="${conexion.nombre || ''}" required placeholder="Mi conexión">
        </div>
        <div class="form-group">
          <label for="tipo">Tipo de base de datos</label>
          <select id="tipo" name="tipo" required>
            <option value="mysql" ${conexion.tipo === 'mysql' ? 'selected' : ''}>MySQL</option>
            <option value="mssql" ${conexion.tipo === 'mssql' ? 'selected' : ''}>SQL Server</option>
          </select>
        </div>
        <div class="form-group">
          <label for="host">Host</label>
          <input type="text" id="host" name="host" value="${conexion.host || 'localhost'}" required>
        </div>
        <div class="form-group">
          <label for="puerto">Puerto</label>
          <input type="number" id="puerto" name="puerto" value="${conexion.puerto || ''}" placeholder="3306 / 1433">
        </div>
        <div class="form-group">
          <label for="usuario">Usuario</label>
          <input type="text" id="usuario" name="usuario" value="${conexion.usuario || ''}">
        </div>
        <div class="form-group">
          <label for="password">Contraseña</label>
          <input type="password" id="password" name="password" value="${conexion.password || ''}">
        </div>
        <div class="form-group form-group--full">
          <label for="baseDatos">Base de datos</label>
          <input type="text" id="baseDatos" name="baseDatos" value="${conexion.baseDatos || ''}" required>
        </div>
        <div class="form-group form-group--full mssql-options" style="display: ${isMssql ? 'flex' : 'none'}">
          <label class="checkbox-group">
            <input type="checkbox" id="encrypt" ${conexion.opciones?.encrypt ? 'checked' : ''}>
            Encriptar conexión
          </label>
          <label class="checkbox-group">
            <input type="checkbox" id="trustCert" ${conexion.opciones?.trustServerCertificate !== false ? 'checked' : ''}>
            Confiar en certificado del servidor
          </label>
        </div>
      </div>
      <div class="form-actions">
        <button type="button" class="btn btn--ghost" id="btn-test-form"><i class="fa-solid fa-plug"></i> Probar</button>
        <button type="submit" class="btn btn--primary"><i class="fa-solid fa-floppy-disk"></i> Guardar</button>
      </div>
    </form>
  `;
}

export function getFormData(form) {
  const tipo = form.tipo.value;
  const data = {
    nombre: form.nombre.value.trim(),
    tipo,
    host: form.host.value.trim(),
    puerto: form.puerto.value ? parseInt(form.puerto.value, 10) : undefined,
    usuario: form.usuario.value,
    password: form.password.value,
    baseDatos: form.baseDatos.value.trim(),
  };

  if (tipo === 'mssql') {
    data.opciones = {
      encrypt: form.querySelector('#encrypt')?.checked ?? false,
      trustServerCertificate: form.querySelector('#trustCert')?.checked ?? true,
    };
  }

  return data;
}

export function bindFormEvents(form, close, onSave, afterSave) {
  const tipoSelect = form.tipo;
  const mssqlOptions = form.closest('.modal__body')?.querySelector('.mssql-options');

  tipoSelect.addEventListener('change', () => {
    if (mssqlOptions) {
      mssqlOptions.style.display = tipoSelect.value === 'mssql' ? 'flex' : 'none';
    }
    if (!form.puerto.value) {
      form.puerto.placeholder = tipoSelect.value === 'mssql' ? '1433' : '3306';
    }
  });

  form.btnTestForm?.addEventListener('click', async () => {
    try {
      form.btnTestForm.disabled = true;
      const { api } = await import('./api.js');
      const { speak } = await import('./tts.js');
      const data = getFormData(form);
      const result = await api.testConexionData(data);
      showToast(result.mensaje, 'success');
      speak(result.mensaje);
    } catch (err) {
      const { speak } = await import('./tts.js');
      showToast(err.message, 'error');
      speak(err.message);
    } finally {
      form.btnTestForm.disabled = false;
    }
  });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();

    const data = getFormData(form);
    if (!data.nombre || !data.host || !data.baseDatos) {
      showToast('Completa los campos obligatorios', 'error');
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

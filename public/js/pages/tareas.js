import { api } from '../api.js';
import { showToast, showLoader, showTableLoader } from '../utils.js';
import { speak } from '../tts.js';

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text ?? '';
  return div.innerHTML;
}

function formatDueDate(due) {
  if (!due) return '';
  return new Date(due).toLocaleString('es-ES', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function renderTaskLists(grouped, activeListId) {
  return grouped.map((list) => {
    const pendingCount = (list.tasks || []).filter((t) => t.status !== 'completed').length;
    return `
    <button type="button" class="tasks-list-tab ${list.id === activeListId ? 'active' : ''}" data-list-id="${list.id}">
      <i class="fa-solid fa-list-check"></i>
      ${escapeHtml(list.title)}
      <span class="tasks-count">${pendingCount}</span>
    </button>
  `;
  }).join('');
}

function renderTaskCard(task, listId) {
  return `
    <article class="task-card glass ${task.status === 'completed' ? 'task-card--done' : ''}">
      <div class="task-card__header">
        <h4>${escapeHtml(task.title)}</h4>
        <span class="task-status">${task.status === 'completed' ? 'Completada' : 'Pendiente'}</span>
      </div>
      ${task.notes ? `<p class="task-card__notes">${escapeHtml(task.notes)}</p>` : ''}
      ${task.due ? `<p class="task-card__due"><i class="fa-regular fa-calendar"></i> ${formatDueDate(task.due)}</p>` : ''}
      <div class="task-card__actions">
        <button type="button" class="btn btn--ghost btn--sm btn-speak-task" data-title="${escapeHtml(task.title)}" data-notes="${escapeHtml(task.notes)}">
          <i class="fa-solid fa-volume-high"></i> Escuchar
        </button>
        ${task.status !== 'completed' ? `
          <button type="button" class="btn btn--primary btn--sm btn-complete-task" data-list-id="${escapeHtml(listId)}" data-task-id="${escapeHtml(task.id)}" data-title="${escapeHtml(task.title)}">
            <i class="fa-solid fa-check"></i> Finalizar
          </button>
        ` : ''}
      </div>
    </article>
  `;
}

function renderTasks(list, listId) {
  if (!list?.tasks?.length) {
    return `
      <div class="empty-state glass">
        <i class="fa-solid fa-check-double"></i>
        <p>No hay tareas en esta lista</p>
      </div>
    `;
  }

  const pending = list.tasks.filter((t) => t.status !== 'completed');
  const completed = list.tasks.filter((t) => t.status === 'completed');

  const pendingSection = `
    <section class="tasks-section tasks-section--pending">
      <h4 class="tasks-section__title">
        <i class="fa-regular fa-circle"></i> Pendientes
        <span class="tasks-section__count">${pending.length}</span>
      </h4>
      <div class="tasks-grid">
        ${pending.length
          ? pending.map((task) => renderTaskCard(task, listId)).join('')
          : '<p class="tasks-section__empty">No hay tareas pendientes</p>'}
      </div>
    </section>
  `;

  const completedSection = completed.length ? `
    <details class="tasks-section tasks-section--completed">
      <summary class="tasks-section__summary">
        <i class="fa-solid fa-circle-check"></i> Completadas
        <span class="tasks-section__count">${completed.length}</span>
      </summary>
      <div class="tasks-grid">
        ${completed.map((task) => renderTaskCard(task, listId)).join('')}
      </div>
    </details>
  ` : '';

  return `${pendingSection}${completedSection}`;
}

function bindTaskActions(container, onComplete) {
  container.querySelectorAll('.btn-speak-task').forEach((btn) => {
    btn.addEventListener('click', () => {
      const title = btn.dataset.title;
      const notes = btn.dataset.notes;
      const text = notes ? `${title}. ${notes}` : title;
      speak(text);
    });
  });

  container.querySelectorAll('.btn-complete-task').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const { listId, taskId, title } = btn.dataset;
      btn.disabled = true;
      try {
        await api.completeGoogleTask(listId, taskId);
        showToast(`Tarea finalizada: ${title}`, 'success');
        speak(`Tarea finalizada: ${title}`);
        if (onComplete) await onComplete();
      } catch (err) {
        showToast(err.message, 'error');
        btn.disabled = false;
      }
    });
  });
}

function isGoogleAuthError(message) {
  const text = String(message || '').toLowerCase();
  return text.includes('invalid_grant')
    || text.includes('expiró')
    || text.includes('conectar tu cuenta');
}

function renderGoogleCredentialsForm(status) {
  const redirectUri = status.redirectUri || 'http://localhost:9006/api/google/callback';
  return `
    <div class="tasks-credentials glass">
      <div class="tasks-credentials__header">
        <i class="fa-brands fa-google"></i>
        <div>
          <h3>Configurar Google Tasks</h3>
          <p>Ingresa las credenciales OAuth de Google Cloud Console para conectar el servicio.</p>
        </div>
      </div>
      <form id="google-credentials-form" class="form-grid" novalidate>
        <div class="form-group form-group--full">
          <label for="google-client-id">Client ID</label>
          <input type="text" id="google-client-id" required placeholder="xxxxx.apps.googleusercontent.com">
        </div>
        <div class="form-group form-group--full">
          <label for="google-client-secret">Client Secret</label>
          <input type="password" id="google-client-secret" required placeholder="GOCSPX-...">
        </div>
        <div class="form-group">
          <label for="google-project-id">Project ID (opcional)</label>
          <input type="text" id="google-project-id" placeholder="mi-proyecto">
        </div>
        <div class="form-group">
          <label for="google-redirect-uri">URI de redirección</label>
          <input type="url" id="google-redirect-uri" value="${escapeHtml(redirectUri)}">
        </div>
        <p class="voice-hints__note form-group--full">
          En Google Cloud, crea credenciales tipo <strong>Aplicación web</strong> y autoriza la URI de redirección indicada.
        </p>
        <div class="form-actions form-group--full">
          <button type="submit" class="btn btn--primary">
            <i class="fa-solid fa-floppy-disk"></i> Guardar y continuar
          </button>
        </div>
      </form>
    </div>
  `;
}

function bindGoogleCredentialsForm(container) {
  const form = container.querySelector('#google-credentials-form');
  if (!form) return;

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const submitBtn = form.querySelector('[type="submit"]');
    if (submitBtn) submitBtn.disabled = true;

    try {
      await api.saveGoogleCredentials({
        clientId: form.querySelector('#google-client-id').value,
        clientSecret: form.querySelector('#google-client-secret').value,
        projectId: form.querySelector('#google-project-id').value,
        redirectUri: form.querySelector('#google-redirect-uri').value,
      });
      showToast('Credenciales guardadas. Ahora conecta tu cuenta.', 'success');
      await renderTareas(container);
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      if (submitBtn) submitBtn.disabled = false;
    }
  });
}

export async function renderTareas(container) {
  showLoader(container, 'Cargando tareas...');

  let status;
  try {
    status = await api.getGoogleStatus();
  } catch (err) {
    container.innerHTML = `<div class="empty-state glass"><p>${escapeHtml(err.message)}</p></div>`;
    return;
  }

  if (!status.hasCredentials) {
    container.innerHTML = renderGoogleCredentialsForm(status);
    bindGoogleCredentialsForm(container);
    return;
  }

  if (!status.authenticated) {
    container.innerHTML = `
      <div class="tasks-auth glass">
        <div class="tasks-auth__content">
          <i class="fa-brands fa-google"></i>
          <h3>Conectar Google Tasks</h3>
          <p>Inicia sesión con tu cuenta de Google para leer y completar tus tareas.</p>
          ${status.projectId ? `<p class="voice-hints__note">Proyecto: <code>${escapeHtml(status.projectId)}</code></p>` : ''}
          <div class="tasks-auth__actions">
            <button type="button" class="btn btn--primary" id="btn-google-connect">
              <i class="fa-brands fa-google"></i> Conectar cuenta
            </button>
            <button type="button" class="btn btn--ghost" id="btn-google-refresh">
              <i class="fa-solid fa-rotate"></i> Ya autoricé
            </button>
          </div>
        </div>
      </div>
    `;

    document.getElementById('btn-google-connect').addEventListener('click', async () => {
      try {
        const { url } = await api.getGoogleAuthUrl();
        window.open(url, '_blank');
        showToast('Autoriza en el navegador y luego pulsa "Ya autoricé"', 'info');
      } catch (err) {
        showToast(err.message, 'error');
      }
    });

    document.getElementById('btn-google-refresh').addEventListener('click', () => renderTareas(container));
    return;
  }

  showLoader(container, 'Cargando listas de tareas...');

  try {
    const grouped = await api.getGoogleTasks();
    let currentListId = grouped[0]?.id || null;
    const listMap = Object.fromEntries(grouped.map((l) => [l.id, l]));

    function getCurrentList() {
      return listMap[currentListId];
    }

    function renderLayout() {
      const activeList = getCurrentList();
      container.innerHTML = `
        <div class="tasks-layout">
          <aside class="tasks-sidebar glass">
            <div class="tasks-sidebar__header">
              <h3><i class="fa-solid fa-list-check"></i> Listas</h3>
              <button type="button" class="btn btn--ghost btn--sm" id="btn-google-logout" title="Cerrar sesión">
                <i class="fa-solid fa-right-from-bracket"></i>
              </button>
            </div>
            <div class="tasks-list-tabs" id="tasks-list-tabs">
              ${renderTaskLists(grouped, currentListId)}
            </div>
          </aside>
          <section class="tasks-content glass">
            <div class="tasks-content__header">
              <h3 id="tasks-list-title">${escapeHtml(activeList?.title || 'Tareas')}</h3>
              <div class="tasks-content__actions">
                <button type="button" class="btn btn--ghost btn--sm" id="btn-read-all">
                  <i class="fa-solid fa-volume-high"></i> Leer pendientes
                </button>
                <button type="button" class="btn btn--primary btn--sm" id="btn-refresh-tasks">
                  <i class="fa-solid fa-rotate"></i> Actualizar
                </button>
              </div>
            </div>
            <div class="tasks-sections" id="tasks-grid">
              ${renderTasks(activeList, currentListId)}
            </div>
          </section>
        </div>
      `;

      document.getElementById('tasks-list-tabs').addEventListener('click', (e) => {
        const tab = e.target.closest('.tasks-list-tab');
        if (!tab) return;

        currentListId = tab.dataset.listId;
        const list = listMap[currentListId];

        document.querySelectorAll('.tasks-list-tab').forEach((el) => el.classList.remove('active'));
        tab.classList.add('active');
        document.getElementById('tasks-list-title').textContent = list?.title || 'Tareas';
        document.getElementById('tasks-grid').innerHTML = renderTasks(list, currentListId);
        bindTaskActions(document.getElementById('tasks-grid'), refreshTasks);
      });

      document.getElementById('btn-refresh-tasks').addEventListener('click', () => renderTareas(container));
      document.getElementById('btn-google-logout').addEventListener('click', async () => {
        try {
          await api.logoutGoogle();
          showToast('Sesión de Google cerrada', 'success');
          renderTareas(container);
        } catch (err) {
          showToast(err.message, 'error');
        }
      });

      document.getElementById('btn-read-all').addEventListener('click', () => {
        const pending = (getCurrentList()?.tasks || []).filter((t) => t.status !== 'completed');
        if (!pending.length) {
          showToast('No hay tareas pendientes en esta lista', 'info');
          return;
        }
        const text = pending.map((t) => t.title).join('. ');
        speak(`Tareas pendientes: ${text}`);
      });

      bindTaskActions(document.getElementById('tasks-grid'), refreshTasks);
    }

    async function refreshTasks() {
      const tasksGrid = document.getElementById('tasks-grid');
      const listTabs = document.getElementById('tasks-list-tabs');
      if (tasksGrid) showTableLoader(tasksGrid, 'Actualizando tareas...');
      if (listTabs) showTableLoader(listTabs, 'Actualizando listas...');

      try {
        const updated = await api.getGoogleTasks();
        updated.forEach((list) => {
          listMap[list.id] = list;
        });
        grouped.splice(0, grouped.length, ...updated);
        listTabs.innerHTML = renderTaskLists(grouped, currentListId);
        tasksGrid.innerHTML = renderTasks(getCurrentList(), currentListId);
        bindTaskActions(tasksGrid, refreshTasks);
      } catch (err) {
        if (isGoogleAuthError(err.message)) {
          showToast('Sesión de Google expirada. Vuelve a conectar tu cuenta.', 'info');
          try {
            await api.logoutGoogle();
          } catch {
            /* ignore */
          }
          return renderTareas(container);
        }
        showToast(err.message, 'error');
        tasksGrid.innerHTML = renderTasks(getCurrentList(), currentListId);
        listTabs.innerHTML = renderTaskLists(grouped, currentListId);
        bindTaskActions(tasksGrid, refreshTasks);
      }
    }

    renderLayout();
  } catch (err) {
    if (isGoogleAuthError(err.message)) {
      showToast('Sesión de Google expirada. Vuelve a conectar tu cuenta.', 'info');
      try {
        await api.logoutGoogle();
      } catch {
        /* ignore */
      }
      return renderTareas(container);
    }

    container.innerHTML = `
      <div class="empty-state glass">
        <p>${escapeHtml(err.message)}</p>
        <button type="button" class="btn btn--primary" id="btn-retry-tasks">Reintentar</button>
      </div>
    `;
    document.getElementById('btn-retry-tasks').addEventListener('click', () => renderTareas(container));
  }
}

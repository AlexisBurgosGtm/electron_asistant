import { api } from '../api.js';
import { showToast, confirmDialog, openModal, showLoader, showTableLoader, renderLoader } from '../utils.js';

let pageState = {
  selectedToken: null,
  tokenSearch: '',
  communitySearch: '',
  tokens: [],
  community: [],
};

function filterTokens(tokens, search) {
  const q = search.trim().toLowerCase();
  if (!q) return tokens;
  return tokens.filter((t) => {
    const token = String(t.TOKEN || '').toLowerCase();
    const empresa = String(t.EMPRESA || '').toLowerCase();
    return token.includes(q) || empresa.includes(q);
  });
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text ?? '';
  return div.innerHTML;
}

function encodeToken(token) {
  return encodeURIComponent(token);
}

function getTokenFormHtml(record) {
  const data = record || {};
  const isEdit = Boolean(data.TOKEN);

  return `
    <form id="token-form" novalidate>
      <div class="form-grid">
        <div class="form-group form-group--full">
          <label for="token-key">TOKEN</label>
          <input type="text" id="token-key" value="${escapeHtml(data.TOKEN || '')}" ${isEdit ? 'readonly' : ''} required>
        </div>
        <div class="form-group form-group--full">
          <label for="token-empresa">Empresa</label>
          <input type="text" id="token-empresa" value="${escapeHtml(data.EMPRESA || '')}" required>
        </div>
        <div class="form-group">
          <label for="token-activo">Activo</label>
          <select id="token-activo">
            <option value="SI" ${data.ACTIVO === 'SI' ? 'selected' : ''}>SI</option>
            <option value="NO" ${data.ACTIVO !== 'SI' ? 'selected' : ''}>NO</option>
          </select>
        </div>
      </div>
      <div class="form-actions">
        <button type="submit" class="btn btn--primary"><i class="fa-solid fa-floppy-disk"></i> Guardar</button>
      </div>
    </form>
  `;
}

function getCommunityFormHtml(record, token) {
  const data = record || { TOKEN: token };
  const isEdit = Boolean(data.ID);

  return `
    ${!isEdit ? `
      <div class="modal-token-banner">
        <i class="fa-solid fa-key"></i>
        TOKEN seleccionado: <strong>${escapeHtml(token)}</strong>
      </div>
    ` : ''}
    <form id="community-form" novalidate>
      <div class="form-grid">
        <div class="form-group"><label for="comm-empnit">EMPNIT</label><input type="text" id="comm-empnit" value="${escapeHtml(data.EMPNIT || '')}"></div>
        <div class="form-group form-group--full"><label for="comm-empnombre">Empresa (EMPNOMBRE)</label><input type="text" id="comm-empnombre" value="${escapeHtml(data.EMPNOMBRE || '')}"></div>
        <div class="form-group"><label for="comm-vpn">VPN_CODE</label><input type="text" id="comm-vpn" value="${escapeHtml(data.VPN_CODE || '')}"></div>
        <div class="form-group"><label for="comm-ip">SERVER_IP</label><input type="text" id="comm-ip" value="${escapeHtml(data.SERVER_IP || '')}"></div>
        <div class="form-group"><label for="comm-db">SERVER_DB</label><input type="text" id="comm-db" value="${escapeHtml(data.SERVER_DB || '')}"></div>
        <div class="form-group"><label for="comm-user">SERVER_USER</label><input type="text" id="comm-user" value="${escapeHtml(data.SERVER_USER || '')}"></div>
        <div class="form-group form-group--full"><label for="comm-pass">SERVER_PASS</label><input type="text" id="comm-pass" value="${escapeHtml(data.SERVER_PASS || '')}"></div>
      </div>
      <div class="form-actions">
        <button type="submit" class="btn btn--primary"><i class="fa-solid fa-floppy-disk"></i> Guardar</button>
      </div>
    </form>
  `;
}

function bindForm(form, close, onSave, afterSave) {
  if (!form) return;
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const submitBtn = form.querySelector('[type="submit"]');
    if (submitBtn) submitBtn.disabled = true;
    try {
      await onSave();
      close();
      if (afterSave) await afterSave();
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      if (submitBtn) submitBtn.disabled = false;
    }
  });
}

function openTokenModal(record, reload) {
  const isEdit = Boolean(record?.TOKEN);
  openModal(isEdit ? 'Editar token' : 'Nuevo token', getTokenFormHtml(record), (_root, close) => {
    const form = document.getElementById('token-form');
    bindForm(form, close, async () => {
      const payload = {
        TOKEN: form.querySelector('#token-key').value.trim(),
        EMPRESA: form.querySelector('#token-empresa').value.trim(),
        ACTIVO: form.querySelector('#token-activo').value,
      };
      if (!payload.TOKEN || !payload.EMPRESA) throw new Error('TOKEN y Empresa son obligatorios');
      if (isEdit) {
        await api.updateTokenAdmin(record.TOKEN, payload);
        showToast('Token actualizado', 'success');
      } else {
        await api.createTokenAdmin(payload);
        showToast('Token creado', 'success');
      }
    }, reload);
  });
}

function openCommunityModal(record, token, reload) {
  const isEdit = Boolean(record?.ID);
  openModal(isEdit ? 'Editar empresa sync' : 'Nueva empresa sync', getCommunityFormHtml(record, token), (_root, close) => {
    const form = document.getElementById('community-form');
    bindForm(form, close, async () => {
      const payload = {
        TOKEN: token,
        EMPNIT: form.querySelector('#comm-empnit').value.trim(),
        EMPNOMBRE: form.querySelector('#comm-empnombre').value.trim(),
        VPN_CODE: form.querySelector('#comm-vpn').value.trim(),
        SERVER_IP: form.querySelector('#comm-ip').value.trim(),
        SERVER_DB: form.querySelector('#comm-db').value.trim(),
        SERVER_USER: form.querySelector('#comm-user').value.trim(),
        SERVER_PASS: form.querySelector('#comm-pass').value.trim(),
      };
      if (isEdit) {
        await api.updateCommunityEmpresa(record.ID, payload);
        showToast('Registro actualizado', 'success');
      } else {
        await api.createCommunityEmpresa(payload);
        showToast('Registro creado', 'success');
      }
    }, reload);
  });
}

function renderActivoBadge(activo) {
  const isSi = activo === 'SI';
  return `<button type="button" class="activo-badge activo-badge--${isSi ? 'si' : 'no'}" title="Clic para cambiar">${isSi ? 'SI' : 'NO'}</button>`;
}

function renderTokensTable(tokens, selectedToken) {
  if (!tokens.length) {
    return '<p class="table-empty">No hay tokens</p>';
  }

  return `
    <table class="data-table data-table--compact">
      <thead>
        <tr><th>TOKEN</th><th>EMPRESA</th><th>ACTIVO</th><th></th></tr>
      </thead>
      <tbody>
        ${tokens.map((t) => `
          <tr class="token-row ${selectedToken === t.TOKEN ? 'token-row--selected' : ''}" data-token="${escapeHtml(t.TOKEN)}">
            <td><code>${escapeHtml(t.TOKEN)}</code></td>
            <td>${escapeHtml(t.EMPRESA || '')}</td>
            <td class="activo-cell" data-token="${escapeHtml(t.TOKEN)}">${renderActivoBadge(t.ACTIVO)}</td>
            <td class="table-actions">
              <button type="button" class="btn btn--ghost btn--sm btn-edit-token" data-token="${escapeHtml(t.TOKEN)}" title="Editar"><i class="fa-solid fa-pen"></i></button>
              <button type="button" class="btn btn--danger btn--sm btn-delete-token" data-token="${escapeHtml(t.TOKEN)}" title="Eliminar"><i class="fa-solid fa-trash"></i></button>
            </td>
          </tr>
        `).join('')}
      </tbody>
    </table>
  `;
}

function renderCommunityTable(rows) {
  if (!pageState.selectedToken) {
    return '<p class="table-empty">Selecciona un TOKEN para ver empresas</p>';
  }

  if (!rows.length) {
    return '<p class="table-empty">Sin registros para este TOKEN</p>';
  }

  return `
    <table class="data-table data-table--compact">
      <thead>
        <tr>
          <th>EMPNIT</th><th>Empresa</th><th>VPN</th><th>IP</th><th>DB</th><th>User</th><th>Pass</th><th></th>
        </tr>
      </thead>
      <tbody>
        ${rows.map((r) => `
          <tr>
            <td>${escapeHtml(r.EMPNIT || '')}</td>
            <td>${escapeHtml(r.EMPNOMBRE || '')}</td>
            <td>${escapeHtml(r.VPN_CODE || '')}</td>
            <td>${escapeHtml(r.SERVER_IP || '')}</td>
            <td>${escapeHtml(r.SERVER_DB || '')}</td>
            <td>${escapeHtml(r.SERVER_USER || '')}</td>
            <td>${escapeHtml(r.SERVER_PASS || '')}</td>
            <td class="table-actions">
              <button type="button" class="btn btn--ghost btn--sm btn-edit-community" data-id="${escapeHtml(r.ID)}" title="Editar"><i class="fa-solid fa-pen"></i></button>
              <button type="button" class="btn btn--danger btn--sm btn-delete-community" data-id="${escapeHtml(r.ID)}" title="Eliminar"><i class="fa-solid fa-trash"></i></button>
            </td>
          </tr>
        `).join('')}
      </tbody>
    </table>
  `;
}

function updateCommunityPanelHeader(container) {
  const title = container.querySelector('#community-panel-title');
  if (title) {
    title.textContent = pageState.selectedToken
      ? `COMMUNITY_EMPRESAS_SYNC — ${pageState.selectedToken}`
      : 'COMMUNITY_EMPRESAS_SYNC';
  }

  const addCommunityBtn = container.querySelector('#btn-add-community');
  if (addCommunityBtn) addCommunityBtn.disabled = !pageState.selectedToken;
}

async function loadCommunity(container) {
  const panel = container.querySelector('#community-table-wrap');
  if (!panel) return;

  if (!pageState.selectedToken) {
    pageState.community = [];
    panel.innerHTML = renderCommunityTable([]);
    return;
  }

  showTableLoader(panel, 'Cargando empresas...');

  try {
    pageState.community = await api.getCommunityEmpresas(pageState.selectedToken, pageState.communitySearch);
    panel.innerHTML = renderCommunityTable(pageState.community);
    bindCommunityEvents(container);
  } catch (err) {
    panel.innerHTML = `<p class="table-empty">${escapeHtml(err.message)}</p>`;
  }
}

function bindCommunityEvents(container) {
  container.querySelectorAll('.btn-edit-community').forEach((btn) => {
    btn.addEventListener('click', () => {
      const record = pageState.community.find((r) => String(r.ID) === String(btn.dataset.id));
      if (record) openCommunityModal(record, pageState.selectedToken, () => refreshPage(container));
    });
  });

  container.querySelectorAll('.btn-delete-community').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const confirmed = await confirmDialog({
        title: 'Eliminar registro',
        text: '¿Eliminar este registro de COMMUNITY_EMPRESAS_SYNC?',
        confirmText: 'Sí, eliminar',
      });
      if (!confirmed) return;
      try {
        await api.deleteCommunityEmpresa(btn.dataset.id);
        showToast('Registro eliminado', 'success');
        await refreshPage(container);
      } catch (err) {
        showToast(err.message, 'error');
      }
    });
  });
}

function bindTokenEvents(container) {
  container.querySelectorAll('.token-row').forEach((row) => {
    row.addEventListener('click', async (e) => {
      if (e.target.closest('.activo-cell, .table-actions, .activo-badge')) return;
      pageState.selectedToken = row.dataset.token;
      container.querySelectorAll('.token-row').forEach((r) => {
        r.classList.toggle('token-row--selected', r.dataset.token === pageState.selectedToken);
      });
      updateCommunityPanelHeader(container);
      await loadCommunity(container);
    });
  });

  container.querySelectorAll('.activo-cell').forEach((cell) => {
    cell.addEventListener('click', async (e) => {
      e.stopPropagation();
      const token = cell.dataset.token;
      const current = pageState.tokens.find((t) => t.TOKEN === token);
      const next = current?.ACTIVO === 'SI' ? 'NO' : 'SI';
      const confirmed = await confirmDialog({
        title: 'Cambiar estado',
        text: `¿Cambiar ACTIVO de "${token}" a ${next}?`,
        confirmText: 'Sí, cambiar',
      });
      if (!confirmed) return;
      try {
        await api.toggleTokenActivo(token);
        showToast(`ACTIVO cambiado a ${next}`, 'success');
        await refreshPage(container);
      } catch (err) {
        showToast(err.message, 'error');
      }
    });
  });

  container.querySelectorAll('.btn-edit-token').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const record = pageState.tokens.find((t) => t.TOKEN === btn.dataset.token);
      if (record) openTokenModal(record, () => refreshPage(container));
    });
  });

  container.querySelectorAll('.btn-delete-token').forEach((btn) => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const confirmed = await confirmDialog({
        title: 'Eliminar token',
        text: `¿Eliminar el token "${btn.dataset.token}"?`,
        confirmText: 'Sí, eliminar',
      });
      if (!confirmed) return;
      try {
        await api.deleteTokenAdmin(btn.dataset.token);
        if (pageState.selectedToken === btn.dataset.token) pageState.selectedToken = null;
        showToast('Token eliminado', 'success');
        await refreshPage(container);
      } catch (err) {
        showToast(err.message, 'error');
      }
    });
  });
}

async function refreshPage(container) {
  const tokensPanel = container.querySelector('#tokens-table-wrap');
  if (tokensPanel) showTableLoader(tokensPanel, 'Cargando tokens...');

  pageState.tokens = await api.getTokensAdmin();

  if (tokensPanel) {
    tokensPanel.innerHTML = renderTokensTable(
      filterTokens(pageState.tokens, pageState.tokenSearch),
      pageState.selectedToken
    );
    bindTokenEvents(container);
  }
  updateCommunityPanelHeader(container);
  await loadCommunity(container);
}

function renderHostingBanner(hosting) {
  if (!hosting?.conexion) {
    return `<div class="hosting-banner hosting-banner--warn glass"><i class="fa-solid fa-triangle-exclamation"></i><span>Configura el <strong>Hosting principal</strong> en Configuraciones.</span></div>`;
  }
  return `<div class="hosting-banner glass"><i class="fa-solid fa-server"></i><span>Hosting: <strong>${escapeHtml(hosting.conexion.nombre)}</strong></span></div>`;
}

export async function openNewTokenModal() {
  try {
    const hosting = await api.getHostingStatus();
    if (!hosting.principalConexionId) {
      showToast('Configura el Hosting principal en Configuraciones', 'error');
      return;
    }
    openTokenModal(null, () => window.__reloadTokens?.());
  } catch (err) {
    showToast(err.message, 'error');
  }
}

export function openNewCommunityModal() {
  if (!pageState.selectedToken) {
    showToast('Selecciona un TOKEN primero', 'error');
    return;
  }
  openCommunityModal(null, pageState.selectedToken, () => window.__reloadTokens?.());
}

export async function renderTokens(container) {
  showLoader(container, 'Cargando tokens...');

  let hosting;
  try {
    hosting = await api.getHostingStatus();
  } catch (err) {
    container.innerHTML = `<div class="empty-state glass"><p>${escapeHtml(err.message)}</p></div>`;
    return;
  }

  if (!hosting.principalConexionId) {
    container.innerHTML = `${renderHostingBanner(hosting)}<div class="empty-state glass"><h3>Hosting principal no configurado</h3></div>`;
    return;
  }

  try {
    pageState.tokens = await api.getTokensAdmin();
    if (pageState.selectedToken && !pageState.tokens.find((t) => t.TOKEN === pageState.selectedToken)) {
      pageState.selectedToken = null;
      pageState.community = [];
    }
    if (!pageState.selectedToken) {
      pageState.community = [];
    }
  } catch (err) {
    container.innerHTML = `${renderHostingBanner(hosting)}<div class="empty-state glass"><p>${escapeHtml(err.message)}</p></div>`;
    return;
  }

  container.innerHTML = `
    ${renderHostingBanner(hosting)}
    <div class="tokens-split">
      <section class="tokens-panel glass">
        <div class="tokens-panel__header">
          <h3><i class="fa-solid fa-key"></i> TOKENS</h3>
          <input type="search" id="token-search" class="tokens-search" placeholder="Buscar token..." value="${escapeHtml(pageState.tokenSearch)}">
        </div>
        <div id="tokens-table-wrap">${renderTokensTable(filterTokens(pageState.tokens, pageState.tokenSearch), pageState.selectedToken)}</div>
      </section>
      <section class="tokens-panel glass">
        <div class="tokens-panel__header">
          <h3 id="community-panel-title">COMMUNITY_EMPRESAS_SYNC${pageState.selectedToken ? ` — ${escapeHtml(pageState.selectedToken)}` : ''}</h3>
          <div class="tokens-panel__tools">
            <input type="search" id="community-search" class="tokens-search" placeholder="Buscar..." value="${escapeHtml(pageState.communitySearch)}">
            <button type="button" class="btn btn--primary btn--sm" id="btn-add-community" ${pageState.selectedToken ? '' : 'disabled'}>
              <i class="fa-solid fa-plus"></i> Nuevo
            </button>
          </div>
        </div>
        <div id="community-table-wrap" class="tokens-panel__scroll">${pageState.selectedToken ? renderLoader('Cargando empresas...', { compact: true }) : renderCommunityTable([])}</div>
      </section>
    </div>
  `;

  bindTokenEvents(container);
  bindCommunityEvents(container);

  container.querySelector('#token-search')?.addEventListener('input', (e) => {
    pageState.tokenSearch = e.target.value;
    const tokensPanel = container.querySelector('#tokens-table-wrap');
    if (tokensPanel) {
      tokensPanel.innerHTML = renderTokensTable(
        filterTokens(pageState.tokens, pageState.tokenSearch),
        pageState.selectedToken
      );
      bindTokenEvents(container);
    }
  });

  container.querySelector('#community-search')?.addEventListener('input', async (e) => {
    pageState.communitySearch = e.target.value;
    await loadCommunity(container);
  });

  container.querySelector('#btn-add-community')?.addEventListener('click', () => {
    openCommunityModal(null, pageState.selectedToken, () => refreshPage(container));
  });

  if (pageState.selectedToken) {
    await loadCommunity(container);
  }

  window.__tokensContainer = container;
}

window.__reloadTokensPage = async () => {
  if (window.__tokensContainer) await refreshPage(window.__tokensContainer);
};

import { api } from '../api.js';
import { showToast, showLoader } from '../utils.js';

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text ?? '';
  return div.innerHTML;
}

function formatMoney(cents) {
  if (cents == null || Number.isNaN(Number(cents))) return '—';
  return `$${(Number(cents) / 100).toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function formatDate(ms) {
  if (!ms) return '—';
  return new Date(ms).toLocaleDateString('es-ES', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
}

function renderCredentialsForm(status) {
  return `
    <div class="cursor-credentials glass">
      <div class="cursor-credentials__header">
        <i class="fa-solid fa-code"></i>
        <div>
          <h3>Conectar Cursor API</h3>
          <p>Ingresa tu API key de Cursor para consultar el uso de tu cuenta.</p>
        </div>
      </div>
      <form id="cursor-api-form" class="form-grid" novalidate>
        <div class="form-group form-group--full">
          <label for="cursor-api-key">API Key</label>
          <input type="password" id="cursor-api-key" required placeholder="crsr_... o key de usuario">
          <small>Crea la key en cursor.com/dashboard → Settings → Admin API Keys o API Keys.</small>
        </div>
        <div class="form-actions form-group--full">
          <button type="submit" class="btn btn--primary">
            <i class="fa-solid fa-key"></i> Validar y guardar
          </button>
        </div>
      </form>
    </div>
  `;
}

function renderUsageSummary(usage) {
  const { validation, spend, totals, period, hasAdminUsage } = usage;
  const profile = validation?.profile;
  const accountLabel = validation?.type === 'admin'
    ? `Equipo (${validation.members?.length || 0} miembros)`
    : (profile?.email || profile?.name || 'Cuenta personal');

  const cards = [
    {
      label: 'Gasto total ciclo',
      value: spend ? formatMoney(spend.totalSpendCents) : '—',
      icon: 'fa-dollar-sign',
    },
    {
      label: 'Gasto bajo demanda',
      value: spend ? formatMoney(spend.onDemandSpendCents) : '—',
      icon: 'fa-receipt',
    },
    {
      label: 'Chat requests (mes)',
      value: totals?.chatRequests ?? 0,
      icon: 'fa-comments',
    },
    {
      label: 'Composer requests (mes)',
      value: totals?.composerRequests ?? 0,
      icon: 'fa-wand-magic-sparkles',
    },
    {
      label: 'Agent requests (mes)',
      value: totals?.agentRequests ?? 0,
      icon: 'fa-robot',
    },
    {
      label: 'Reqs incluidas plan',
      value: totals?.subscriptionIncludedReqs ?? 0,
      icon: 'fa-check-circle',
    },
    {
      label: 'Reqs uso adicional',
      value: totals?.usageBasedReqs ?? 0,
      icon: 'fa-chart-line',
    },
    {
      label: 'Reqs vía API key',
      value: totals?.apiKeyReqs ?? 0,
      icon: 'fa-key',
    },
  ];

  return `
    <div class="cursor-usage">
      <div class="cursor-usage__header glass">
        <div>
          <h3><i class="fa-solid fa-gauge-high"></i> Uso de Cursor</h3>
          <p>${escapeHtml(accountLabel)} · ${formatDate(period?.startDate)} → ${formatDate(period?.endDate)}</p>
        </div>
        <div class="cursor-usage__actions">
          <button type="button" class="btn btn--ghost btn--sm" id="cursor-refresh-btn">
            <i class="fa-solid fa-rotate"></i> Actualizar
          </button>
          <button type="button" class="btn btn--danger btn--sm" id="cursor-logout-btn">
            <i class="fa-solid fa-right-from-bracket"></i> Quitar key
          </button>
        </div>
      </div>

      ${!hasAdminUsage ? `
        <div class="cursor-usage__note glass">
          <i class="fa-solid fa-circle-info"></i>
          Esta API key no tiene acceso Admin. Se validó la cuenta, pero el detalle de uso requiere una Admin API Key de equipo.
        </div>
      ` : ''}

      <div class="stats-grid cursor-usage__stats">
        ${cards.map((card) => `
          <div class="stat-card glass">
            <i class="fa-solid ${card.icon}"></i>
            <div class="stat-card__value">${escapeHtml(String(card.value))}</div>
            <div class="stat-card__label">${escapeHtml(card.label)}</div>
          </div>
        `).join('')}
      </div>

      ${spend?.members?.length ? `
        <div class="table-panel glass">
          <table class="data-table">
            <thead>
              <tr>
                <th>Usuario</th>
                <th>Email</th>
                <th>Gasto total</th>
                <th>Bajo demanda</th>
                <th>Premium requests</th>
              </tr>
            </thead>
            <tbody>
              ${spend.members.map((m) => `
                <tr>
                  <td>${escapeHtml(m.name || '—')}</td>
                  <td>${escapeHtml(m.email || '—')}</td>
                  <td>${formatMoney(m.overallSpendCents)}</td>
                  <td>${formatMoney(m.spendCents)}</td>
                  <td>${m.fastPremiumRequests ?? 0}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      ` : ''}

      ${usage.dailyUsage?.length ? `
        <div class="table-panel glass">
          <h4 class="cursor-usage__table-title">Uso diario (mes actual)</h4>
          <table class="data-table data-table--compact">
            <thead>
              <tr>
                <th>Día</th>
                <th>Email</th>
                <th>Chat</th>
                <th>Composer</th>
                <th>Agent</th>
                <th>Incluidas</th>
                <th>Adicional</th>
                <th>Modelo</th>
              </tr>
            </thead>
            <tbody>
              ${usage.dailyUsage.slice(0, 100).map((row) => `
                <tr>
                  <td>${escapeHtml(row.day || '—')}</td>
                  <td>${escapeHtml(row.email || '—')}</td>
                  <td>${row.chatRequests ?? 0}</td>
                  <td>${row.composerRequests ?? 0}</td>
                  <td>${row.agentRequests ?? 0}</td>
                  <td>${row.subscriptionIncludedReqs ?? 0}</td>
                  <td>${row.usageBasedReqs ?? 0}</td>
                  <td>${escapeHtml(row.mostUsedModel || '—')}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      ` : ''}
    </div>
  `;
}

function bindCredentialsForm(container, reload) {
  const form = container.querySelector('#cursor-api-form');
  if (!form) return;

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const submitBtn = form.querySelector('[type="submit"]');
    if (submitBtn) submitBtn.disabled = true;

    try {
      await api.saveCursorCredentials({
        apiKey: form.querySelector('#cursor-api-key').value,
      });
      showToast('API key validada y guardada', 'success');
      await reload();
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      if (submitBtn) submitBtn.disabled = false;
    }
  });
}

function bindUsageActions(container, reload) {
  container.querySelector('#cursor-refresh-btn')?.addEventListener('click', reload);
  container.querySelector('#cursor-logout-btn')?.addEventListener('click', async () => {
    try {
      await api.deleteCursorCredentials();
      showToast('API key eliminada', 'success');
      await reload();
    } catch (err) {
      showToast(err.message, 'error');
    }
  });
}

export async function renderCursor(container) {
  showLoader(container, 'Cargando Cursor...');

  let status;
  try {
    status = await api.getCursorStatus();
  } catch (err) {
    container.innerHTML = `<div class="empty-state glass"><p>${escapeHtml(err.message)}</p></div>`;
    return;
  }

  const reload = () => renderCursor(container);

  if (!status.hasApiKey) {
    container.innerHTML = renderCredentialsForm(status);
    bindCredentialsForm(container, reload);
    return;
  }

  try {
    const usage = await api.getCursorUsage();
    container.innerHTML = renderUsageSummary(usage);
    bindUsageActions(container, reload);
  } catch (err) {
    container.innerHTML = `
      <div class="empty-state glass">
        <p>${escapeHtml(err.message)}</p>
        <button type="button" class="btn btn--primary" id="cursor-retry-btn">
          <i class="fa-solid fa-rotate"></i> Reintentar
        </button>
        <button type="button" class="btn btn--ghost" id="cursor-reset-btn">
          Cambiar API key
        </button>
      </div>
    `;
    container.querySelector('#cursor-retry-btn')?.addEventListener('click', reload);
    container.querySelector('#cursor-reset-btn')?.addEventListener('click', async () => {
      await api.deleteCursorCredentials();
      await reload();
    });
  }
}

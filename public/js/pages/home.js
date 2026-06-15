import { showLoader } from '../utils.js';
import { getStoredTheme, renderThemeSelector, bindThemeSelector } from '../themes.js';

export async function renderHome(container) {
  showLoader(container, 'Cargando resumen...');

  let conexiones = [];
  try {
    const { api } = await import('../api.js');
    conexiones = await api.getConexiones();
  } catch {
    conexiones = [];
  }

  const mssqlCount = conexiones.filter((c) => c.tipo === 'mssql').length;
  const mysqlCount = conexiones.filter((c) => c.tipo === 'mysql').length;

  container.innerHTML = `
    <div class="stats-grid">
      <div class="stat-card glass">
        <i class="fa-solid fa-plug"></i>
        <div class="stat-card__value">${conexiones.length}</div>
        <div class="stat-card__label">Conexiones totales</div>
      </div>
      <div class="stat-card glass">
        <i class="fa-solid fa-server"></i>
        <div class="stat-card__value">${mssqlCount}</div>
        <div class="stat-card__label">SQL Server</div>
      </div>
      <div class="stat-card glass">
        <i class="fa-solid fa-dolphin"></i>
        <div class="stat-card__value">${mysqlCount}</div>
        <div class="stat-card__label">MySQL</div>
      </div>
    </div>

    ${renderThemeSelector(getStoredTheme())}
  `;

  bindThemeSelector(container);
}

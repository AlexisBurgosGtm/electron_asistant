export async function renderHome(container) {
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

    <div class="voice-hints glass">
      <h3><i class="fa-solid fa-comment-dots"></i> Comandos de voz disponibles</h3>
      <ul>
        <li><code>prueba la conexion a NOMBRE</code> — Prueba una conexión registrada</li>
        <li><code>COMANDO DE VOZ</code> — Ejecuta una query de Mantenimiento DB</li>
      </ul>
      <p class="voice-hints__note">Activa el micrófono desde la barra lateral para usar reconocimiento de voz.</p>
    </div>
  `;
}

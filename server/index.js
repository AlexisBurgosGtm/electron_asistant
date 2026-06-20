const fs = require('fs').promises;
const path = require('path');
const express = require('express');
const sql = require('mssql');
const mysql = require('mysql2/promise');
const whatsapp = require('./whatsapp');
const googleTasks = require('./googleTasks');
const hostingDb = require('./hostingDb');
const appPaths = require('./appPaths');

const PORT = 9006;

let server = null;

async function readConexiones() {
  try {
    const data = await fs.readFile(appPaths.conexionesPath(), 'utf-8');
    return JSON.parse(data);
  } catch (err) {
    if (err.code === 'ENOENT') {
      await fs.writeFile(appPaths.conexionesPath(), '[]', 'utf-8');
      return [];
    }
    throw err;
  }
}

async function writeConexiones(conexiones) {
  await fs.writeFile(appPaths.conexionesPath(), JSON.stringify(conexiones, null, 2), 'utf-8');
}

async function readMantenimiento() {
  try {
    const data = await fs.readFile(appPaths.mantenimientoPath(), 'utf-8');
    return JSON.parse(data);
  } catch (err) {
    if (err.code === 'ENOENT') {
      await fs.writeFile(appPaths.mantenimientoPath(), '[]', 'utf-8');
      return [];
    }
    throw err;
  }
}

async function writeMantenimiento(comandos) {
  await fs.writeFile(appPaths.mantenimientoPath(), JSON.stringify(comandos, null, 2), 'utf-8');
}

async function readAlarmas() {
  try {
    const data = await fs.readFile(appPaths.alarmasPath(), 'utf-8');
    return JSON.parse(data);
  } catch (err) {
    if (err.code === 'ENOENT') {
      await fs.writeFile(appPaths.alarmasPath(), '[]', 'utf-8');
      return [];
    }
    throw err;
  }
}

async function writeAlarmas(alarmas) {
  await fs.writeFile(appPaths.alarmasPath(), JSON.stringify(alarmas, null, 2), 'utf-8');
}

function parseAlarmaTime(body) {
  const hora = Number(body.hora);
  const minuto = Number(body.minuto);
  if (!body.fecha?.trim()) {
    throw new Error('La fecha es obligatoria');
  }
  if (!Number.isInteger(hora) || hora < 0 || hora > 23) {
    throw new Error('La hora debe estar entre 0 y 23');
  }
  if (!Number.isInteger(minuto) || minuto < 0 || minuto > 59) {
    throw new Error('El minuto debe estar entre 0 y 59');
  }
  if (!body.descripcion?.trim()) {
    throw new Error('La descripción es obligatoria');
  }
  return {
    fecha: body.fecha.trim(),
    hora,
    minuto,
    descripcion: body.descripcion.trim(),
  };
}

async function readServiciosOnline() {
  try {
    const data = await fs.readFile(appPaths.serviciosOnlinePath(), 'utf-8');
    return JSON.parse(data);
  } catch (err) {
    if (err.code === 'ENOENT') {
      await fs.writeFile(appPaths.serviciosOnlinePath(), '[]', 'utf-8');
      return [];
    }
    throw err;
  }
}

async function writeServiciosOnline(servicios) {
  await fs.writeFile(appPaths.serviciosOnlinePath(), JSON.stringify(servicios, null, 2), 'utf-8');
}

async function getServiciosOnlineFromHosting() {
  const { conexion } = await resolveHostingConexion();
  let servicios = await hostingDb.listServiciosOnline(conexion);

  if (!servicios.length) {
    const legacy = await readServiciosOnline();
    if (legacy.length) {
      for (const item of legacy) {
        await hostingDb.createServicioOnline(conexion, {
          nombre: item.nombre,
          url: normalizeServicioUrl(item.url),
          pingIntervalMinutes: normalizePingInterval(item.pingIntervalMinutes),
        });
      }
      servicios = await hostingDb.listServiciosOnline(conexion);
      await writeServiciosOnline([]);
    }
  }

  return servicios;
}

function normalizeServicioUrl(url) {
  const trimmed = (url || '').trim();
  if (!trimmed) throw new Error('La URL no puede estar vacía');
  if (!/^https?:\/\//i.test(trimmed)) {
    return `https://${trimmed}`;
  }
  return trimmed;
}

function normalizePingInterval(minutes) {
  const value = parseInt(minutes, 10);
  if (Number.isNaN(value) || value < 5 || value > 120 || value % 5 !== 0) {
    return 5;
  }
  return value;
}

async function pingServicioUrl(url) {
  const targetUrl = normalizeServicioUrl(url);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);

  try {
    const response = await fetch(targetUrl, {
      method: 'GET',
      signal: controller.signal,
      redirect: 'follow',
      headers: { 'User-Agent': 'MariAndre/1.0' },
    });

    if (response.ok) {
      return {
        ok: true,
        status: response.status,
        mensaje: `Servicio disponible (${response.status})`,
      };
    }

    return {
      ok: false,
      status: response.status,
      mensaje: `Error HTTP ${response.status}`,
    };
  } catch (err) {
    const message = err.name === 'AbortError'
      ? 'Tiempo de espera agotado'
      : (err.message || 'No se pudo contactar el servicio');
    return { ok: false, mensaje: message };
  } finally {
    clearTimeout(timeout);
  }
}

const DEFAULT_CONFIG = {
  whatsapp: {
    ttsAnnounceSenderOnly: false,
    omittedWords: '',
  },
  conexiones: {
    autoPing: true,
  },
  hosting: {
    principalConexionId: null,
  },
};

function mergeConfig(data) {
  return {
    ...DEFAULT_CONFIG,
    ...data,
    whatsapp: { ...DEFAULT_CONFIG.whatsapp, ...(data?.whatsapp || {}) },
    conexiones: { ...DEFAULT_CONFIG.conexiones, ...(data?.conexiones || {}) },
    hosting: { ...DEFAULT_CONFIG.hosting, ...(data?.hosting || {}) },
  };
}

async function resolveHostingConexion() {
  const config = await readConfig();
  const conexionId = config.hosting?.principalConexionId;
  if (!conexionId) {
    throw new Error('Configura el Hosting principal en Configuraciones');
  }

  const conexiones = await readConexiones();
  const conexion = conexiones.find((c) => String(c.id) === String(conexionId));
  if (!conexion) {
    throw new Error('La conexión de Hosting principal no existe');
  }

  return { conexion, config };
}

async function readConfig() {
  try {
    const data = await fs.readFile(appPaths.configPath(), 'utf-8');
    return mergeConfig(JSON.parse(data));
  } catch (err) {
    if (err.code === 'ENOENT') {
      await writeConfig(DEFAULT_CONFIG);
      return { ...DEFAULT_CONFIG };
    }
    throw err;
  }
}

async function writeConfig(config) {
  await fs.writeFile(appPaths.configPath(), JSON.stringify(mergeConfig(config), null, 2), 'utf-8');
}

function generateId(items) {
  const ids = items.map((c) => parseInt(c.id, 10)).filter((n) => !Number.isNaN(n));
  return String(ids.length ? Math.max(...ids) + 1 : 1);
}

function getMssqlConfig(conexion) {
  return {
    server: conexion.host,
    port: conexion.puerto || 1433,
    user: conexion.usuario,
    password: conexion.password,
    database: conexion.baseDatos,
    options: {
      encrypt: conexion.opciones?.encrypt ?? false,
      trustServerCertificate: conexion.opciones?.trustServerCertificate ?? true,
    },
    connectionTimeout: 10000,
    requestTimeout: 30000,
  };
}

function getMysqlConfig(conexion) {
  return {
    host: conexion.host,
    port: conexion.puerto || 3306,
    user: conexion.usuario,
    password: conexion.password,
    database: conexion.baseDatos,
    connectTimeout: 10000,
  };
}

async function getMssqlDatabaseSizeMb(pool, databaseName) {
  try {
    const result = await pool.request().query(`
      SELECT CAST(SUM(CAST(size AS BIGINT)) * 8.0 / 1024 AS DECIMAL(18, 2)) AS sizeMB
      FROM sys.database_files
    `);
    const sizeMB = result.recordset?.[0]?.sizeMB;
    if (sizeMB != null && !Number.isNaN(Number(sizeMB))) {
      return Number(sizeMB);
    }
  } catch {
    /* probar alternativa */
  }

  if (databaseName) {
    try {
      const result = await pool.request()
        .input('dbName', sql.NVarChar, databaseName)
        .query(`
          SELECT CAST(SUM(CAST(size AS BIGINT)) * 8.0 / 1024 AS DECIMAL(18, 2)) AS sizeMB
          FROM sys.master_files
          WHERE database_id = DB_ID(@dbName)
        `);
      const sizeMB = result.recordset?.[0]?.sizeMB;
      if (sizeMB != null && !Number.isNaN(Number(sizeMB))) {
        return Number(sizeMB);
      }
    } catch {
      /* sin tamaño */
    }
  }

  return null;
}

async function getMysqlDatabaseSizeMb(connection, database) {
  const [rows] = await connection.query(
    `SELECT ROUND(SUM(data_length + index_length) / 1024 / 1024, 2) AS sizeMB
     FROM information_schema.tables
     WHERE table_schema = ?`,
    [database]
  );
  const row = rows?.[0];
  return row?.sizeMB != null ? Number(row.sizeMB) : null;
}

async function testMssql(conexion) {
  const pool = await sql.connect(getMssqlConfig(conexion));
  await pool.request().query('SELECT 1 AS ok');
  let databaseSizeMb = null;
  try {
    databaseSizeMb = await getMssqlDatabaseSizeMb(pool, conexion.baseDatos);
  } catch {
    /* ignorar error de tamaño */
  }
  await pool.close();
  return { ok: true, mensaje: 'Conexión SQL Server exitosa', databaseSizeMb };
}

async function testMysql(conexion) {
  const connection = await mysql.createConnection(getMysqlConfig(conexion));
  await connection.query('SELECT 1 AS ok');
  let databaseSizeMb = null;
  try {
    databaseSizeMb = await getMysqlDatabaseSizeMb(connection, conexion.baseDatos);
  } catch {
    /* ignorar error de tamaño */
  }
  await connection.end();
  return { ok: true, mensaje: 'Conexión MySQL exitosa', databaseSizeMb };
}

async function testConexion(conexion) {
  if (conexion.tipo === 'mssql') {
    return testMssql(conexion);
  }
  if (conexion.tipo === 'mysql') {
    return testMysql(conexion);
  }
  throw new Error(`Tipo de base de datos no soportado: ${conexion.tipo}`);
}

async function executeQuery(conexion, query) {
  if (conexion.tipo === 'mssql') {
    const pool = await sql.connect(getMssqlConfig(conexion));
    const result = await pool.request().query(query);
    await pool.close();
    const rows = result.recordset || [];
    return {
      ok: true,
      rowCount: rows.length,
      rowsAffected: result.rowsAffected?.[0] ?? rows.length,
      rows: rows.slice(0, 100),
      mensaje: `Query ejecutada en SQL Server. ${result.rowsAffected?.[0] ?? rows.length} filas afectadas.`,
    };
  }

  if (conexion.tipo === 'mysql') {
    const connection = await mysql.createConnection(getMysqlConfig(conexion));
    const [rows, fields] = await connection.query(query);
    await connection.end();
    const rowCount = Array.isArray(rows) ? rows.length : 0;
    const affected = rows.affectedRows ?? rowCount;
    return {
      ok: true,
      rowCount,
      rowsAffected: affected,
      rows: Array.isArray(rows) ? rows.slice(0, 100) : [],
      mensaje: `Query ejecutada en MySQL. ${affected} filas afectadas.`,
    };
  }

  throw new Error(`Tipo de base de datos no soportado: ${conexion.tipo}`);
}

function createApp() {
  const app = express();
  app.use(express.json());
  app.use(express.static(appPaths.publicPath()));

  app.get('/api/conexiones', async (_req, res) => {
    try {
      const conexiones = await readConexiones();
      res.json(conexiones);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get('/api/conexiones/:id', async (req, res) => {
    try {
      const conexiones = await readConexiones();
      const conexion = conexiones.find((c) => c.id === req.params.id);
      if (!conexion) {
        return res.status(404).json({ error: 'Conexión no encontrada' });
      }
      res.json(conexion);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post('/api/conexiones', async (req, res) => {
    try {
      const conexiones = await readConexiones();
      const nueva = {
        id: generateId(conexiones),
        nombre: req.body.nombre || 'Sin nombre',
        tipo: req.body.tipo,
        host: req.body.host || 'localhost',
        puerto: req.body.puerto,
        usuario: req.body.usuario || '',
        password: req.body.password || '',
        baseDatos: req.body.baseDatos || '',
        ...(req.body.opciones ? { opciones: req.body.opciones } : {}),
      };

      if (!['mssql', 'mysql'].includes(nueva.tipo)) {
        return res.status(400).json({ error: 'El tipo debe ser "mssql" o "mysql"' });
      }

      conexiones.push(nueva);
      await writeConexiones(conexiones);
      res.status(201).json(nueva);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.put('/api/conexiones/:id', async (req, res) => {
    try {
      const conexiones = await readConexiones();
      const index = conexiones.findIndex((c) => c.id === req.params.id);
      if (index === -1) {
        return res.status(404).json({ error: 'Conexión no encontrada' });
      }

      conexiones[index] = {
        ...conexiones[index],
        ...req.body,
        id: req.params.id,
      };

      await writeConexiones(conexiones);
      res.json(conexiones[index]);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.delete('/api/conexiones/:id', async (req, res) => {
    try {
      const conexiones = await readConexiones();
      const filtered = conexiones.filter((c) => c.id !== req.params.id);
      if (filtered.length === conexiones.length) {
        return res.status(404).json({ error: 'Conexión no encontrada' });
      }
      await writeConexiones(filtered);
      res.json({ ok: true });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post('/api/conexiones/:id/test', async (req, res) => {
    try {
      const conexiones = await readConexiones();
      const conexion = conexiones.find((c) => c.id === req.params.id);
      if (!conexion) {
        return res.status(404).json({ error: 'Conexión no encontrada' });
      }
      const result = await testConexion(conexion);
      res.json(result);
    } catch (err) {
      res.status(500).json({ ok: false, mensaje: err.message });
    }
  });

  app.post('/api/conexiones/test', async (req, res) => {
    try {
      const result = await testConexion(req.body);
      res.json(result);
    } catch (err) {
      res.status(500).json({ ok: false, mensaje: err.message });
    }
  });

  app.post('/api/conexiones/:id/query', async (req, res) => {
    try {
      const query = (req.body?.query || '').trim();
      if (!query) {
        return res.status(400).json({ error: 'La consulta SQL no puede estar vacía' });
      }

      const conexiones = await readConexiones();
      const conexion = conexiones.find((c) => c.id === req.params.id);
      if (!conexion) {
        return res.status(404).json({ error: 'Conexión no encontrada' });
      }

      const result = await executeQuery(conexion, query);
      res.json(result);
    } catch (err) {
      res.status(500).json({ ok: false, error: err.message, mensaje: err.message });
    }
  });

  app.get('/api/mantenimiento', async (_req, res) => {
    try {
      const comandos = await readMantenimiento();
      res.json(comandos);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post('/api/mantenimiento', async (req, res) => {
    try {
      const comandos = await readMantenimiento();
      const conexiones = await readConexiones();
      const conexion = conexiones.find((c) => c.id === req.body.conexionId);

      if (!conexion) {
        return res.status(400).json({ error: 'Conexión no válida' });
      }
      if (!req.body.query?.trim()) {
        return res.status(400).json({ error: 'La query es obligatoria' });
      }

      const nuevo = {
        id: generateId(comandos),
        conexionId: req.body.conexionId,
        nombre: req.body.nombre?.trim() || 'Comando SQL',
        query: req.body.query.trim(),
      };

      comandos.push(nuevo);
      await writeMantenimiento(comandos);
      res.status(201).json(nuevo);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.put('/api/mantenimiento/:id', async (req, res) => {
    try {
      const comandos = await readMantenimiento();
      const index = comandos.findIndex((c) => c.id === req.params.id);
      if (index === -1) {
        return res.status(404).json({ error: 'Comando no encontrado' });
      }

      if (req.body.conexionId) {
        const conexiones = await readConexiones();
        if (!conexiones.find((c) => c.id === req.body.conexionId)) {
          return res.status(400).json({ error: 'Conexión no válida' });
        }
      }

      comandos[index] = {
        ...comandos[index],
        ...req.body,
        id: req.params.id,
        query: req.body.query?.trim() ?? comandos[index].query,
      };

      await writeMantenimiento(comandos);
      res.json(comandos[index]);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.delete('/api/mantenimiento/:id', async (req, res) => {
    try {
      const comandos = await readMantenimiento();
      const filtered = comandos.filter((c) => c.id !== req.params.id);
      if (filtered.length === comandos.length) {
        return res.status(404).json({ error: 'Comando no encontrado' });
      }
      await writeMantenimiento(filtered);
      res.json({ ok: true });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post('/api/mantenimiento/:id/ejecutar', async (req, res) => {
    try {
      const comandos = await readMantenimiento();
      const comando = comandos.find((c) => c.id === req.params.id);
      if (!comando) {
        return res.status(404).json({ error: 'Comando no encontrado' });
      }

      const conexiones = await readConexiones();
      const conexion = conexiones.find((c) => c.id === comando.conexionId);
      if (!conexion) {
        return res.status(404).json({ error: 'Conexión asociada no encontrada' });
      }

      const result = await executeQuery(conexion, comando.query);
      res.json({ ...result, comando: comando.nombre });
    } catch (err) {
      res.status(500).json({ ok: false, mensaje: err.message });
    }
  });

  app.get('/api/servicios-online', async (_req, res) => {
    try {
      res.json(await getServiciosOnlineFromHosting());
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get('/api/servicios-online/:id', async (req, res) => {
    try {
      const { conexion } = await resolveHostingConexion();
      const servicio = await hostingDb.getServicioOnline(conexion, parseInt(req.params.id, 10));
      if (!servicio) {
        return res.status(404).json({ error: 'Servicio no encontrado' });
      }
      res.json(servicio);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post('/api/servicios-online', async (req, res) => {
    try {
      const { conexion } = await resolveHostingConexion();
      const nuevo = await hostingDb.createServicioOnline(conexion, {
        nombre: (req.body.nombre || 'Sin nombre').trim(),
        url: normalizeServicioUrl(req.body.url),
        pingIntervalMinutes: normalizePingInterval(req.body.pingIntervalMinutes),
      });
      res.status(201).json(nuevo);
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  });

  app.put('/api/servicios-online/:id', async (req, res) => {
    try {
      const { conexion } = await resolveHostingConexion();
      const updated = await hostingDb.updateServicioOnline(conexion, parseInt(req.params.id, 10), {
        nombre: req.body.nombre,
        url: req.body.url !== undefined ? normalizeServicioUrl(req.body.url) : undefined,
        pingIntervalMinutes: req.body.pingIntervalMinutes,
      });
      res.json(updated);
    } catch (err) {
      const status = err.message === 'Servicio no encontrado' ? 404 : 400;
      res.status(status).json({ error: err.message });
    }
  });

  app.delete('/api/servicios-online/:id', async (req, res) => {
    try {
      const { conexion } = await resolveHostingConexion();
      await hostingDb.deleteServicioOnline(conexion, parseInt(req.params.id, 10));
      res.json({ ok: true });
    } catch (err) {
      const status = err.message === 'Servicio no encontrado' ? 404 : 500;
      res.status(status).json({ error: err.message });
    }
  });

  app.post('/api/servicios-online/:id/ping', async (req, res) => {
    try {
      const { conexion } = await resolveHostingConexion();
      const servicio = await hostingDb.getServicioOnline(conexion, parseInt(req.params.id, 10));
      if (!servicio) {
        return res.status(404).json({ error: 'Servicio no encontrado' });
      }

      const result = await pingServicioUrl(servicio.url);
      if (result.ok) {
        res.json(result);
      } else {
        res.status(502).json(result);
      }
    } catch (err) {
      res.status(500).json({ ok: false, mensaje: err.message });
    }
  });

  app.get('/api/config', async (_req, res) => {
    try {
      res.json(await readConfig());
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.put('/api/config', async (req, res) => {
    try {
      const current = await readConfig();
      const updated = mergeConfig({
        ...current,
        ...req.body,
        whatsapp: { ...current.whatsapp, ...(req.body?.whatsapp || {}) },
        conexiones: { ...current.conexiones, ...(req.body?.conexiones || {}) },
        hosting: { ...current.hosting, ...(req.body?.hosting || {}) },
      });
      await writeConfig(updated);
      res.json(updated);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get('/api/hosting/status', async (_req, res) => {
    try {
      const config = await readConfig();
      const conexiones = await readConexiones();
      const principalId = config.hosting?.principalConexionId;
      const conexion = conexiones.find((c) => String(c.id) === String(principalId));
      res.json({
        principalConexionId: principalId || null,
        conexion: conexion ? { id: conexion.id, nombre: conexion.nombre, tipo: conexion.tipo, host: conexion.host } : null,
      });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get('/api/soporte/anydesk', async (_req, res) => {
    try {
      const { conexion } = await resolveHostingConexion();
      const rows = await hostingDb.listSoporteAnydesk(conexion);
      res.json(rows);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get('/api/soporte/tokens', async (_req, res) => {
    try {
      const { conexion } = await resolveHostingConexion();
      const rows = await hostingDb.listTokens(conexion);
      res.json(rows);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post('/api/soporte/anydesk', async (req, res) => {
    try {
      const { conexion } = await resolveHostingConexion();
      const row = await hostingDb.createSoporteAnydesk(conexion, req.body);
      res.status(201).json(row);
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  });

  app.put('/api/soporte/anydesk/:id', async (req, res) => {
    try {
      const { conexion } = await resolveHostingConexion();
      const row = await hostingDb.updateSoporteAnydesk(conexion, parseInt(req.params.id, 10), req.body);
      res.json(row);
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  });

  app.delete('/api/soporte/anydesk/:id', async (req, res) => {
    try {
      const { conexion } = await resolveHostingConexion();
      await hostingDb.deleteSoporteAnydesk(conexion, parseInt(req.params.id, 10));
      res.json({ ok: true });
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  });

  app.get('/api/updater/queries', async (_req, res) => {
    try {
      const { conexion } = await resolveHostingConexion();
      const rows = await hostingDb.listUpdateQueries(conexion);
      res.json(rows);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post('/api/updater/queries', async (req, res) => {
    try {
      const { conexion } = await resolveHostingConexion();
      const row = await hostingDb.createUpdateQuery(conexion, req.body);
      res.status(201).json(row);
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  });

  app.put('/api/updater/queries/:id', async (req, res) => {
    try {
      const { conexion } = await resolveHostingConexion();
      const row = await hostingDb.updateUpdateQuery(conexion, parseInt(req.params.id, 10), req.body);
      res.json(row);
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  });

  app.delete('/api/updater/queries/:id', async (req, res) => {
    try {
      const { conexion } = await resolveHostingConexion();
      await hostingDb.deleteUpdateQuery(conexion, parseInt(req.params.id, 10));
      res.json({ ok: true });
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  });

  app.get('/api/tokens/admin', async (_req, res) => {
    try {
      const { conexion } = await resolveHostingConexion();
      const rows = await hostingDb.listTokensAdmin(conexion);
      res.json(rows);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post('/api/tokens/admin', async (req, res) => {
    try {
      const { conexion } = await resolveHostingConexion();
      const row = await hostingDb.createTokenAdmin(conexion, req.body);
      res.status(201).json(row);
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  });

  app.put('/api/tokens/admin/:token', async (req, res) => {
    try {
      const { conexion } = await resolveHostingConexion();
      const row = await hostingDb.updateTokenAdmin(conexion, decodeURIComponent(req.params.token), req.body);
      res.json(row);
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  });

  app.patch('/api/tokens/admin/:token/activo', async (req, res) => {
    try {
      const { conexion } = await resolveHostingConexion();
      const row = await hostingDb.toggleTokenActivo(conexion, decodeURIComponent(req.params.token));
      res.json(row);
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  });

  app.delete('/api/tokens/admin/:token', async (req, res) => {
    try {
      const { conexion } = await resolveHostingConexion();
      await hostingDb.deleteTokenAdmin(conexion, decodeURIComponent(req.params.token));
      res.json({ ok: true });
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  });

  app.get('/api/tokens/community', async (req, res) => {
    try {
      const { conexion } = await resolveHostingConexion();
      const token = (req.query.token || '').trim();
      if (!token) return res.status(400).json({ error: 'TOKEN requerido' });
      const rows = await hostingDb.listCommunityEmpresas(conexion, token, req.query.search || '');
      res.json(rows);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post('/api/tokens/community', async (req, res) => {
    try {
      const { conexion } = await resolveHostingConexion();
      const row = await hostingDb.createCommunityEmpresa(conexion, req.body);
      res.status(201).json(row);
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  });

  app.put('/api/tokens/community/:id', async (req, res) => {
    try {
      const { conexion } = await resolveHostingConexion();
      const row = await hostingDb.updateCommunityEmpresa(conexion, parseInt(req.params.id, 10), req.body);
      res.json(row);
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  });

  app.delete('/api/tokens/community/:id', async (req, res) => {
    try {
      const { conexion } = await resolveHostingConexion();
      await hostingDb.deleteCommunityEmpresa(conexion, parseInt(req.params.id, 10));
      res.json({ ok: true });
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  });

  app.get('/api/status', (_req, res) => {
    res.json({ ok: true, puerto: PORT, servicio: 'mariandre' });
  });

  app.get('/api/app/info', (_req, res) => {
    res.json(appPaths.getAppInfo());
  });

  app.post('/api/window/hide-to-tray', (_req, res) => {
    try {
      require('../electronBridge').emit('hide-to-tray');
      res.json({ ok: true });
    } catch {
      res.status(503).json({ error: 'Solo disponible en la app de escritorio' });
    }
  });

  app.get('/api/whatsapp/status', (_req, res) => {
    res.json(whatsapp.getPublicState());
  });

  app.get('/api/whatsapp/messages', (_req, res) => {
    res.json(whatsapp.getMessages());
  });

  app.get('/api/whatsapp/events', (req, res) => {
    whatsapp.attachSse(req, res);
  });

  app.post('/api/whatsapp/start', async (_req, res) => {
    try {
      const result = await whatsapp.startSession();
      res.json(result);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post('/api/whatsapp/refresh', async (_req, res) => {
    try {
      const result = await whatsapp.refreshSession();
      res.json(result);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post('/api/whatsapp/logout', async (_req, res) => {
    try {
      const result = await whatsapp.logoutSession();
      res.json(result);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get('/api/google/status', async (_req, res) => {
    try {
      await googleTasks.ensureClient();
      res.json(await googleTasks.getStatus());
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post('/api/google/credentials', async (req, res) => {
    try {
      const status = await googleTasks.saveCredentials(req.body || {});
      res.json(status);
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  });

  app.get('/api/google/auth-url', async (_req, res) => {
    try {
      const url = await googleTasks.getAuthUrl();
      res.json({ url });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get('/api/google/callback', async (req, res) => {
    try {
      if (!req.query.code) {
        return res.status(400).send('Autorización cancelada o código no recibido.');
      }
      await googleTasks.handleCallback(req.query.code);
      res.send(`
        <!DOCTYPE html>
        <html lang="es"><head><meta charset="UTF-8"><title>Google Tasks</title>
        <style>body{font-family:sans-serif;background:#0a1628;color:#e8f0fe;display:flex;align-items:center;justify-content:center;height:100vh;margin:0}
        .box{text-align:center;padding:2rem;border:1px solid rgba(100,160,255,.2);border-radius:12px;background:rgba(15,31,58,.9)}</style></head>
        <body><div class="box"><h2>Cuenta conectada</h2><p>Ya puedes volver a la aplicación y pulsar Actualizar en Tareas.</p></div></body></html>
      `);
    } catch (err) {
      res.status(500).send(`Error: ${err.message}`);
    }
  });

  app.get('/api/google/tasks', async (_req, res) => {
    try {
      const data = await googleTasks.getAllTasksGrouped();
      res.json(data);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post('/api/google/tasks/:listId/:taskId/complete', async (req, res) => {
    try {
      const result = await googleTasks.completeTask(req.params.listId, req.params.taskId);
      res.json(result);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post('/api/google/logout', async (_req, res) => {
    try {
      await googleTasks.logout();
      res.json({ ok: true });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get('/api/alarmas', async (_req, res) => {
    try {
      const alarmas = await readAlarmas();
      res.json(alarmas);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post('/api/alarmas', async (req, res) => {
    try {
      const alarmas = await readAlarmas();
      const parsed = parseAlarmaTime(req.body);
      const nueva = {
        id: generateId(alarmas),
        ...parsed,
        disparada: false,
        creadaEn: new Date().toISOString(),
      };
      alarmas.push(nueva);
      await writeAlarmas(alarmas);
      res.status(201).json(nueva);
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  });

  app.put('/api/alarmas/:id', async (req, res) => {
    try {
      const alarmas = await readAlarmas();
      const index = alarmas.findIndex((a) => a.id === req.params.id);
      if (index === -1) {
        return res.status(404).json({ error: 'Alarma no encontrada' });
      }
      const parsed = parseAlarmaTime(req.body);
      alarmas[index] = {
        ...alarmas[index],
        ...parsed,
        id: req.params.id,
        disparada: false,
        disparadaEn: null,
      };
      await writeAlarmas(alarmas);
      res.json(alarmas[index]);
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  });

  app.post('/api/alarmas/:id/disparar', async (req, res) => {
    try {
      const alarmas = await readAlarmas();
      const index = alarmas.findIndex((a) => a.id === req.params.id);
      if (index === -1) {
        return res.status(404).json({ error: 'Alarma no encontrada' });
      }
      if (alarmas[index].disparada) {
        return res.json(alarmas[index]);
      }
      alarmas[index] = {
        ...alarmas[index],
        disparada: true,
        disparadaEn: new Date().toISOString(),
      };
      await writeAlarmas(alarmas);
      res.json(alarmas[index]);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.delete('/api/alarmas/:id', async (req, res) => {
    try {
      const alarmas = await readAlarmas();
      const filtered = alarmas.filter((a) => a.id !== req.params.id);
      if (filtered.length === alarmas.length) {
        return res.status(404).json({ error: 'Alarma no encontrada' });
      }
      await writeAlarmas(filtered);
      res.json({ ok: true });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get('*', (_req, res) => {
    res.sendFile(path.join(appPaths.publicPath(), 'index.html'));
  });

  return app;
}

function startServer() {
  return new Promise((resolve, reject) => {
    if (server) {
      return resolve(server);
    }

    const app = createApp();
    server = app.listen(PORT, '0.0.0.0', () => {
      console.log(`Servidor activo en http://localhost:${PORT}`);
      googleTasks.loadClient(PORT).catch((err) => {
        console.warn('Google Tasks:', err.message);
      });
      whatsapp.startSession().catch((err) => {
        console.warn('WhatsApp auto-start:', err.message);
      });
      resolve(server);
    });

    server.on('error', reject);
  });
}

function stopServer() {
  return new Promise((resolve) => {
    whatsapp.destroyWhatsApp().finally(() => {
      if (!server) {
        return resolve();
      }
      server.close(() => {
        server = null;
        resolve();
      });
    });
  });
}

module.exports = { startServer, stopServer, PORT };

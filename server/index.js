const fs = require('fs').promises;
const path = require('path');
const express = require('express');
const sql = require('mssql');
const mysql = require('mysql2/promise');

const PORT = 9005;
const CONEXIONES_PATH = path.join(__dirname, '..', 'conexiones.json');
const MANTENIMIENTO_PATH = path.join(__dirname, '..', 'mantenimiento.json');
const PUBLIC_PATH = path.join(__dirname, '..', 'public');

let server = null;

async function readConexiones() {
  try {
    const data = await fs.readFile(CONEXIONES_PATH, 'utf-8');
    return JSON.parse(data);
  } catch (err) {
    if (err.code === 'ENOENT') {
      await fs.writeFile(CONEXIONES_PATH, '[]', 'utf-8');
      return [];
    }
    throw err;
  }
}

async function writeConexiones(conexiones) {
  await fs.writeFile(CONEXIONES_PATH, JSON.stringify(conexiones, null, 2), 'utf-8');
}

async function readMantenimiento() {
  try {
    const data = await fs.readFile(MANTENIMIENTO_PATH, 'utf-8');
    return JSON.parse(data);
  } catch (err) {
    if (err.code === 'ENOENT') {
      await fs.writeFile(MANTENIMIENTO_PATH, '[]', 'utf-8');
      return [];
    }
    throw err;
  }
}

async function writeMantenimiento(comandos) {
  await fs.writeFile(MANTENIMIENTO_PATH, JSON.stringify(comandos, null, 2), 'utf-8');
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

async function testMssql(conexion) {
  const pool = await sql.connect(getMssqlConfig(conexion));
  await pool.request().query('SELECT 1 AS ok');
  await pool.close();
  return { ok: true, mensaje: 'Conexión SQL Server exitosa' };
}

async function testMysql(conexion) {
  const connection = await mysql.createConnection(getMysqlConfig(conexion));
  await connection.query('SELECT 1 AS ok');
  await connection.end();
  return { ok: true, mensaje: 'Conexión MySQL exitosa' };
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
  app.use(express.static(PUBLIC_PATH));

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
      if (!req.body.comandoVoz?.trim()) {
        return res.status(400).json({ error: 'El comando de voz es obligatorio' });
      }

      const nuevo = {
        id: generateId(comandos),
        conexionId: req.body.conexionId,
        nombre: req.body.nombre?.trim() || req.body.comandoVoz.trim(),
        query: req.body.query.trim(),
        comandoVoz: req.body.comandoVoz.trim(),
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
        comandoVoz: req.body.comandoVoz?.trim() ?? comandos[index].comandoVoz,
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
      res.json({ ...result, comando: comando.nombre || comando.comandoVoz });
    } catch (err) {
      res.status(500).json({ ok: false, mensaje: err.message });
    }
  });

  app.get('/api/status', (_req, res) => {
    res.json({ ok: true, puerto: PORT, servicio: 'electron-asistant' });
  });

  app.get('*', (_req, res) => {
    res.sendFile(path.join(PUBLIC_PATH, 'index.html'));
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
      resolve(server);
    });

    server.on('error', reject);
  });
}

function stopServer() {
  return new Promise((resolve) => {
    if (!server) {
      return resolve();
    }
    server.close(() => {
      server = null;
      resolve();
    });
  });
}

module.exports = { startServer, stopServer, PORT };

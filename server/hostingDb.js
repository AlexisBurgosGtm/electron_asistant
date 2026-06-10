const sql = require('mssql');
const mysql = require('mysql2/promise');

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

async function withHostingConnection(conexion, fn) {
  if (conexion.tipo === 'mssql') {
    const pool = await sql.connect(getMssqlConfig(conexion));
    try {
      return await fn(pool, 'mssql');
    } finally {
      await pool.close();
    }
  }

  if (conexion.tipo === 'mysql') {
    const connection = await mysql.createConnection(getMysqlConfig(conexion));
    try {
      return await fn(connection, 'mysql');
    } finally {
      await connection.end();
    }
  }

  throw new Error(`Tipo de base de datos no soportado: ${conexion.tipo}`);
}

async function ensureSoporteTable(conexion) {
  return withHostingConnection(conexion, async (db, tipo) => {
    if (tipo === 'mssql') {
      await db.request().query(`
        IF NOT EXISTS (
          SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = 'SOPORTE_ANYDESK'
        )
        BEGIN
          CREATE TABLE SOPORTE_ANYDESK (
            ID INT IDENTITY(1,1) PRIMARY KEY,
            TOKEN VARCHAR(100) NULL,
            SUCURSAL VARCHAR(200) NULL,
            TIPO VARCHAR(100) NULL,
            ANYDESK VARCHAR(200) NULL,
            PASS VARCHAR(200) NULL
          )
        END
      `);
      return;
    }

    await db.query(`
      CREATE TABLE IF NOT EXISTS SOPORTE_ANYDESK (
        ID INT AUTO_INCREMENT PRIMARY KEY,
        TOKEN VARCHAR(100) NULL,
        SUCURSAL VARCHAR(200) NULL,
        TIPO VARCHAR(100) NULL,
        ANYDESK VARCHAR(200) NULL,
        PASS VARCHAR(200) NULL
      )
    `);
  });
}

function normalizeRow(row) {
  const out = {};
  for (const [key, value] of Object.entries(row || {})) {
    if (value instanceof Date) {
      out[key] = value.toISOString().slice(0, 10);
    } else {
      out[key] = value;
    }
  }
  return out;
}

async function listSoporteAnydesk(conexion) {
  await ensureSoporteTable(conexion);
  return withHostingConnection(conexion, async (db, tipo) => {
    const query = 'SELECT ID, TOKEN, SUCURSAL, TIPO, ANYDESK, PASS FROM SOPORTE_ANYDESK ORDER BY ID DESC';
    if (tipo === 'mssql') {
      const result = await db.request().query(query);
      return (result.recordset || []).map(normalizeRow);
    }
    const [rows] = await db.query(query);
    return rows.map(normalizeRow);
  });
}

async function listTokens(conexion) {
  return withHostingConnection(conexion, async (db, tipo) => {
    const query = 'SELECT TOKEN, EMPRESA FROM TOKENS ORDER BY EMPRESA';
    if (tipo === 'mssql') {
      const result = await db.request().query(query);
      return result.recordset || [];
    }
    const [rows] = await db.query(query);
    return rows;
  });
}

async function createSoporteAnydesk(conexion, data) {
  await ensureSoporteTable(conexion);
  return withHostingConnection(conexion, async (db, tipo) => {
    if (tipo === 'mssql') {
      const result = await db.request()
        .input('token', sql.VarChar(100), data.TOKEN || '')
        .input('sucursal', sql.VarChar(200), data.SUCURSAL || '')
        .input('tipo', sql.VarChar(100), data.TIPO || '')
        .input('anydesk', sql.VarChar(200), data.ANYDESK || '')
        .input('pass', sql.VarChar(200), data.PASS || '')
        .query(`
          INSERT INTO SOPORTE_ANYDESK (TOKEN, SUCURSAL, TIPO, ANYDESK, PASS)
          OUTPUT INSERTED.ID, INSERTED.TOKEN, INSERTED.SUCURSAL, INSERTED.TIPO, INSERTED.ANYDESK, INSERTED.PASS
          VALUES (@token, @sucursal, @tipo, @anydesk, @pass)
        `);
      return normalizeRow(result.recordset[0]);
    }

    const [result] = await db.query(
      'INSERT INTO SOPORTE_ANYDESK (TOKEN, SUCURSAL, TIPO, ANYDESK, PASS) VALUES (?, ?, ?, ?, ?)',
      [data.TOKEN || '', data.SUCURSAL || '', data.TIPO || '', data.ANYDESK || '', data.PASS || '']
    );
    const [rows] = await db.query(
      'SELECT ID, TOKEN, SUCURSAL, TIPO, ANYDESK, PASS FROM SOPORTE_ANYDESK WHERE ID = ?',
      [result.insertId]
    );
    return normalizeRow(rows[0]);
  });
}

async function updateSoporteAnydesk(conexion, id, data) {
  return withHostingConnection(conexion, async (db, tipo) => {
    if (tipo === 'mssql') {
      const result = await db.request()
        .input('id', sql.Int, id)
        .input('token', sql.VarChar(100), data.TOKEN || '')
        .input('sucursal', sql.VarChar(200), data.SUCURSAL || '')
        .input('tipo', sql.VarChar(100), data.TIPO || '')
        .input('anydesk', sql.VarChar(200), data.ANYDESK || '')
        .input('pass', sql.VarChar(200), data.PASS || '')
        .query(`
          UPDATE SOPORTE_ANYDESK
          SET TOKEN = @token, SUCURSAL = @sucursal, TIPO = @tipo, ANYDESK = @anydesk, PASS = @pass
          OUTPUT INSERTED.ID, INSERTED.TOKEN, INSERTED.SUCURSAL, INSERTED.TIPO, INSERTED.ANYDESK, INSERTED.PASS
          WHERE ID = @id
        `);
      if (!result.recordset.length) throw new Error('Registro no encontrado');
      return normalizeRow(result.recordset[0]);
    }

    const [result] = await db.query(
      'UPDATE SOPORTE_ANYDESK SET TOKEN=?, SUCURSAL=?, TIPO=?, ANYDESK=?, PASS=? WHERE ID=?',
      [data.TOKEN || '', data.SUCURSAL || '', data.TIPO || '', data.ANYDESK || '', data.PASS || '', id]
    );
    if (!result.affectedRows) throw new Error('Registro no encontrado');
    const [rows] = await db.query(
      'SELECT ID, TOKEN, SUCURSAL, TIPO, ANYDESK, PASS FROM SOPORTE_ANYDESK WHERE ID = ?',
      [id]
    );
    return normalizeRow(rows[0]);
  });
}

async function deleteSoporteAnydesk(conexion, id) {
  return withHostingConnection(conexion, async (db, tipo) => {
    if (tipo === 'mssql') {
      const result = await db.request()
        .input('id', sql.Int, id)
        .query('DELETE FROM SOPORTE_ANYDESK WHERE ID = @id');
      if (!result.rowsAffected[0]) throw new Error('Registro no encontrado');
      return { ok: true };
    }

    const [result] = await db.query('DELETE FROM SOPORTE_ANYDESK WHERE ID = ?', [id]);
    if (!result.affectedRows) throw new Error('Registro no encontrado');
    return { ok: true };
  });
}

async function listUpdateQueries(conexion) {
  return withHostingConnection(conexion, async (db, tipo) => {
    const query = 'SELECT ID, QRY, FECHA, VERSION, DB FROM UPDATE_QUERIES ORDER BY ID DESC';
    if (tipo === 'mssql') {
      const result = await db.request().query(query);
      return (result.recordset || []).map(normalizeRow);
    }
    const [rows] = await db.query(query);
    return rows.map(normalizeRow);
  });
}

function todayIsoDate() {
  return new Date().toISOString().slice(0, 10);
}

function validateUpdaterPayload(data, { isCreate = false } = {}) {
  const db = (data.DB || '').toUpperCase();
  if (!['P', 'T'].includes(db)) {
    throw new Error('DB debe ser P o T');
  }

  const version = parseInt(data.VERSION, 10);
  if (Number.isNaN(version) || version < 2024 || version > 2030) {
    throw new Error('VERSION debe estar entre 2024 y 2030');
  }

  const qry = (data.QRY || '').trim();
  if (!qry) throw new Error('QRY no puede estar vacía');

  const fecha = isCreate ? todayIsoDate() : (data.FECHA || todayIsoDate());

  return { DB: db, VERSION: version, QRY: qry, FECHA: fecha };
}

async function createUpdateQuery(conexion, data) {
  const payload = validateUpdaterPayload(data, { isCreate: true });
  return withHostingConnection(conexion, async (db, tipo) => {
    if (tipo === 'mssql') {
      const result = await db.request()
        .input('qry', sql.VarChar(sql.MAX), payload.QRY)
        .input('fecha', sql.Date, payload.FECHA)
        .input('version', sql.Int, payload.VERSION)
        .input('db', sql.VarChar(1), payload.DB)
        .query(`
          INSERT INTO UPDATE_QUERIES (QRY, FECHA, VERSION, DB)
          OUTPUT INSERTED.ID, INSERTED.QRY, INSERTED.FECHA, INSERTED.VERSION, INSERTED.DB
          VALUES (@qry, @fecha, @version, @db)
        `);
      return normalizeRow(result.recordset[0]);
    }

    const [result] = await db.query(
      'INSERT INTO UPDATE_QUERIES (QRY, FECHA, VERSION, DB) VALUES (?, ?, ?, ?)',
      [payload.QRY, payload.FECHA, payload.VERSION, payload.DB]
    );
    const [rows] = await db.query(
      'SELECT ID, QRY, FECHA, VERSION, DB FROM UPDATE_QUERIES WHERE ID = ?',
      [result.insertId]
    );
    return normalizeRow(rows[0]);
  });
}

async function updateUpdateQuery(conexion, id, data) {
  const payload = validateUpdaterPayload(data);
  return withHostingConnection(conexion, async (db, tipo) => {
    if (tipo === 'mssql') {
      const result = await db.request()
        .input('id', sql.Int, id)
        .input('qry', sql.VarChar(sql.MAX), payload.QRY)
        .input('fecha', sql.Date, payload.FECHA)
        .input('version', sql.Int, payload.VERSION)
        .input('db', sql.VarChar(1), payload.DB)
        .query(`
          UPDATE UPDATE_QUERIES
          SET QRY = @qry, FECHA = @fecha, VERSION = @version, DB = @db
          OUTPUT INSERTED.ID, INSERTED.QRY, INSERTED.FECHA, INSERTED.VERSION, INSERTED.DB
          WHERE ID = @id
        `);
      if (!result.recordset.length) throw new Error('Registro no encontrado');
      return normalizeRow(result.recordset[0]);
    }

    const [result] = await db.query(
      'UPDATE UPDATE_QUERIES SET QRY=?, FECHA=?, VERSION=?, DB=? WHERE ID=?',
      [payload.QRY, payload.FECHA, payload.VERSION, payload.DB, id]
    );
    if (!result.affectedRows) throw new Error('Registro no encontrado');
    const [rows] = await db.query(
      'SELECT ID, QRY, FECHA, VERSION, DB FROM UPDATE_QUERIES WHERE ID = ?',
      [id]
    );
    return normalizeRow(rows[0]);
  });
}

async function deleteUpdateQuery(conexion, id) {
  return withHostingConnection(conexion, async (db, tipo) => {
    if (tipo === 'mssql') {
      const result = await db.request()
        .input('id', sql.Int, id)
        .query('DELETE FROM UPDATE_QUERIES WHERE ID = @id');
      if (!result.rowsAffected[0]) throw new Error('Registro no encontrado');
      return { ok: true };
    }

    const [result] = await db.query('DELETE FROM UPDATE_QUERIES WHERE ID = ?', [id]);
    if (!result.affectedRows) throw new Error('Registro no encontrado');
    return { ok: true };
  });
}

function normalizeActivo(value) {
  return String(value || 'NO').trim().toUpperCase() === 'SI' ? 'SI' : 'NO';
}

async function listTokensAdmin(conexion) {
  return withHostingConnection(conexion, async (db, tipo) => {
    const query = 'SELECT TOKEN, EMPRESA, ACTIVO FROM TOKENS ORDER BY EMPRESA';
    if (tipo === 'mssql') {
      const result = await db.request().query(query);
      return (result.recordset || []).map((row) => ({
        ...normalizeRow(row),
        ACTIVO: normalizeActivo(row.ACTIVO),
      }));
    }
    const [rows] = await db.query(query);
    return rows.map((row) => ({
      ...normalizeRow(row),
      ACTIVO: normalizeActivo(row.ACTIVO),
    }));
  });
}

async function createTokenAdmin(conexion, data) {
  const token = (data.TOKEN || '').trim();
  if (!token) throw new Error('TOKEN no puede estar vacío');

  return withHostingConnection(conexion, async (db, tipo) => {
    const payload = {
      token,
      empresa: (data.EMPRESA || '').trim(),
      activo: normalizeActivo(data.ACTIVO),
    };

    if (tipo === 'mssql') {
      const result = await db.request()
        .input('token', sql.VarChar(100), payload.token)
        .input('empresa', sql.VarChar(200), payload.empresa)
        .input('activo', sql.VarChar(2), payload.activo)
        .query(`
          INSERT INTO TOKENS (TOKEN, EMPRESA, ACTIVO)
          OUTPUT INSERTED.TOKEN, INSERTED.EMPRESA, INSERTED.ACTIVO
          VALUES (@token, @empresa, @activo)
        `);
      const row = result.recordset[0];
      return { ...normalizeRow(row), ACTIVO: normalizeActivo(row.ACTIVO) };
    }

    await db.query(
      'INSERT INTO TOKENS (TOKEN, EMPRESA, ACTIVO) VALUES (?, ?, ?)',
      [payload.token, payload.empresa, payload.activo]
    );
    const [rows] = await db.query(
      'SELECT TOKEN, EMPRESA, ACTIVO FROM TOKENS WHERE TOKEN = ?',
      [payload.token]
    );
    return { ...normalizeRow(rows[0]), ACTIVO: normalizeActivo(rows[0].ACTIVO) };
  });
}

async function updateTokenAdmin(conexion, tokenKey, data) {
  return withHostingConnection(conexion, async (db, tipo) => {
    const payload = {
      empresa: (data.EMPRESA || '').trim(),
      activo: normalizeActivo(data.ACTIVO),
    };

    if (tipo === 'mssql') {
      const result = await db.request()
        .input('token', sql.VarChar(100), tokenKey)
        .input('empresa', sql.VarChar(200), payload.empresa)
        .input('activo', sql.VarChar(2), payload.activo)
        .query(`
          UPDATE TOKENS SET EMPRESA = @empresa, ACTIVO = @activo
          OUTPUT INSERTED.TOKEN, INSERTED.EMPRESA, INSERTED.ACTIVO
          WHERE TOKEN = @token
        `);
      if (!result.recordset.length) throw new Error('Token no encontrado');
      const row = result.recordset[0];
      return { ...normalizeRow(row), ACTIVO: normalizeActivo(row.ACTIVO) };
    }

    const [result] = await db.query(
      'UPDATE TOKENS SET EMPRESA=?, ACTIVO=? WHERE TOKEN=?',
      [payload.empresa, payload.activo, tokenKey]
    );
    if (!result.affectedRows) throw new Error('Token no encontrado');
    const [rows] = await db.query(
      'SELECT TOKEN, EMPRESA, ACTIVO FROM TOKENS WHERE TOKEN = ?',
      [tokenKey]
    );
    return { ...normalizeRow(rows[0]), ACTIVO: normalizeActivo(rows[0].ACTIVO) };
  });
}

async function toggleTokenActivo(conexion, tokenKey) {
  return withHostingConnection(conexion, async (db, tipo) => {
    let current;
    if (tipo === 'mssql') {
      const found = await db.request()
        .input('token', sql.VarChar(100), tokenKey)
        .query('SELECT TOKEN, EMPRESA, ACTIVO FROM TOKENS WHERE TOKEN = @token');
      if (!found.recordset.length) throw new Error('Token no encontrado');
      current = found.recordset[0];
    } else {
      const [rows] = await db.query('SELECT TOKEN, EMPRESA, ACTIVO FROM TOKENS WHERE TOKEN = ?', [tokenKey]);
      if (!rows.length) throw new Error('Token no encontrado');
      current = rows[0];
    }

    const nextActivo = normalizeActivo(current.ACTIVO) === 'SI' ? 'NO' : 'SI';
    return updateTokenAdmin(conexion, tokenKey, { EMPRESA: current.EMPRESA, ACTIVO: nextActivo });
  });
}

async function deleteTokenAdmin(conexion, tokenKey) {
  return withHostingConnection(conexion, async (db, tipo) => {
    if (tipo === 'mssql') {
      const result = await db.request()
        .input('token', sql.VarChar(100), tokenKey)
        .query('DELETE FROM TOKENS WHERE TOKEN = @token');
      if (!result.rowsAffected[0]) throw new Error('Token no encontrado');
      return { ok: true };
    }

    const [result] = await db.query('DELETE FROM TOKENS WHERE TOKEN = ?', [tokenKey]);
    if (!result.affectedRows) throw new Error('Token no encontrado');
    return { ok: true };
  });
}

async function ensureCommunityEmpresasSyncTable(conexion) {
  return withHostingConnection(conexion, async (db, tipo) => {
    if (tipo === 'mssql') {
      await db.request().query(`
        IF NOT EXISTS (
          SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = 'COMMUNITY_EMPRESAS_SYNC'
        )
        BEGIN
          CREATE TABLE COMMUNITY_EMPRESAS_SYNC (
            ID INT IDENTITY(1,1) PRIMARY KEY,
            TOKEN VARCHAR(100) NOT NULL,
            EMPNIT VARCHAR(50) NULL,
            EMPNOMBRE VARCHAR(200) NULL,
            VPN_CODE VARCHAR(100) NULL,
            SERVER_IP VARCHAR(200) NULL,
            SERVER_DB VARCHAR(200) NULL,
            SERVER_USER VARCHAR(200) NULL,
            SERVER_PASS VARCHAR(200) NULL
          )
        END
      `);
      return;
    }

    await db.query(`
      CREATE TABLE IF NOT EXISTS COMMUNITY_EMPRESAS_SYNC (
        ID INT AUTO_INCREMENT PRIMARY KEY,
        TOKEN VARCHAR(100) NOT NULL,
        EMPNIT VARCHAR(50) NULL,
        EMPNOMBRE VARCHAR(200) NULL,
        VPN_CODE VARCHAR(100) NULL,
        SERVER_IP VARCHAR(200) NULL,
        SERVER_DB VARCHAR(200) NULL,
        SERVER_USER VARCHAR(200) NULL,
        SERVER_PASS VARCHAR(200) NULL
      )
    `);
  });
}

async function listCommunityEmpresas(conexion, token, search = '') {
  await ensureCommunityEmpresasSyncTable(conexion);
  const term = `%${(search || '').trim()}%`;

  return withHostingConnection(conexion, async (db, tipo) => {
    const fields = 'ID, TOKEN, EMPNIT, EMPNOMBRE, VPN_CODE, SERVER_IP, SERVER_DB, SERVER_USER, SERVER_PASS';

    if (tipo === 'mssql') {
      const result = await db.request()
        .input('token', sql.VarChar(100), token)
        .input('search', sql.VarChar(200), term)
        .query(`
          SELECT ${fields} FROM COMMUNITY_EMPRESAS_SYNC
          WHERE TOKEN = @token
          AND (
            @search = '%%' OR EMPNIT LIKE @search OR EMPNOMBRE LIKE @search
            OR VPN_CODE LIKE @search OR SERVER_IP LIKE @search OR SERVER_DB LIKE @search
          )
          ORDER BY EMPNOMBRE, EMPNIT
        `);
      return (result.recordset || []).map(normalizeRow);
    }

    const [rows] = await db.query(
      `SELECT ${fields} FROM COMMUNITY_EMPRESAS_SYNC
       WHERE TOKEN = ?
       AND (? = '%%' OR EMPNIT LIKE ? OR EMPNOMBRE LIKE ?
            OR VPN_CODE LIKE ? OR SERVER_IP LIKE ? OR SERVER_DB LIKE ?)
       ORDER BY EMPNOMBRE, EMPNIT`,
      [token, term, term, term, term, term, term, term]
    );
    return rows.map(normalizeRow);
  });
}

async function createCommunityEmpresa(conexion, data) {
  await ensureCommunityEmpresasSyncTable(conexion);
  const token = (data.TOKEN || '').trim();
  if (!token) throw new Error('TOKEN es obligatorio');

  return withHostingConnection(conexion, async (db, tipo) => {
    if (tipo === 'mssql') {
      const result = await db.request()
        .input('token', sql.VarChar(100), token)
        .input('empnit', sql.VarChar(50), data.EMPNIT || '')
        .input('empnombre', sql.VarChar(200), data.EMPNOMBRE || '')
        .input('vpn', sql.VarChar(100), data.VPN_CODE || '')
        .input('ip', sql.VarChar(200), data.SERVER_IP || '')
        .input('db', sql.VarChar(200), data.SERVER_DB || '')
        .input('user', sql.VarChar(200), data.SERVER_USER || '')
        .input('pass', sql.VarChar(200), data.SERVER_PASS || '')
        .query(`
          INSERT INTO COMMUNITY_EMPRESAS_SYNC
            (TOKEN, EMPNIT, EMPNOMBRE, VPN_CODE, SERVER_IP, SERVER_DB, SERVER_USER, SERVER_PASS)
          OUTPUT INSERTED.ID, INSERTED.TOKEN, INSERTED.EMPNIT, INSERTED.EMPNOMBRE,
                 INSERTED.VPN_CODE, INSERTED.SERVER_IP, INSERTED.SERVER_DB, INSERTED.SERVER_USER, INSERTED.SERVER_PASS
          VALUES (@token, @empnit, @empnombre, @vpn, @ip, @db, @user, @pass)
        `);
      return normalizeRow(result.recordset[0]);
    }

    const [result] = await db.query(
      `INSERT INTO COMMUNITY_EMPRESAS_SYNC
        (TOKEN, EMPNIT, EMPNOMBRE, VPN_CODE, SERVER_IP, SERVER_DB, SERVER_USER, SERVER_PASS)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [token, data.EMPNIT || '', data.EMPNOMBRE || '', data.VPN_CODE || '',
        data.SERVER_IP || '', data.SERVER_DB || '', data.SERVER_USER || '', data.SERVER_PASS || '']
    );
    const [rows] = await db.query(
      'SELECT ID, TOKEN, EMPNIT, EMPNOMBRE, VPN_CODE, SERVER_IP, SERVER_DB, SERVER_USER, SERVER_PASS FROM COMMUNITY_EMPRESAS_SYNC WHERE ID = ?',
      [result.insertId]
    );
    return normalizeRow(rows[0]);
  });
}

async function updateCommunityEmpresa(conexion, id, data) {
  return withHostingConnection(conexion, async (db, tipo) => {
    if (tipo === 'mssql') {
      const result = await db.request()
        .input('id', sql.Int, id)
        .input('token', sql.VarChar(100), data.TOKEN || '')
        .input('empnit', sql.VarChar(50), data.EMPNIT || '')
        .input('empnombre', sql.VarChar(200), data.EMPNOMBRE || '')
        .input('vpn', sql.VarChar(100), data.VPN_CODE || '')
        .input('ip', sql.VarChar(200), data.SERVER_IP || '')
        .input('db', sql.VarChar(200), data.SERVER_DB || '')
        .input('user', sql.VarChar(200), data.SERVER_USER || '')
        .input('pass', sql.VarChar(200), data.SERVER_PASS || '')
        .query(`
          UPDATE COMMUNITY_EMPRESAS_SYNC
          SET TOKEN=@token, EMPNIT=@empnit, EMPNOMBRE=@empnombre, VPN_CODE=@vpn,
              SERVER_IP=@ip, SERVER_DB=@db, SERVER_USER=@user, SERVER_PASS=@pass
          OUTPUT INSERTED.ID, INSERTED.TOKEN, INSERTED.EMPNIT, INSERTED.EMPNOMBRE,
                 INSERTED.VPN_CODE, INSERTED.SERVER_IP, INSERTED.SERVER_DB, INSERTED.SERVER_USER, INSERTED.SERVER_PASS
          WHERE ID = @id
        `);
      if (!result.recordset.length) throw new Error('Registro no encontrado');
      return normalizeRow(result.recordset[0]);
    }

    const [result] = await db.query(
      `UPDATE COMMUNITY_EMPRESAS_SYNC
       SET TOKEN=?, EMPNIT=?, EMPNOMBRE=?, VPN_CODE=?, SERVER_IP=?, SERVER_DB=?, SERVER_USER=?, SERVER_PASS=?
       WHERE ID=?`,
      [data.TOKEN || '', data.EMPNIT || '', data.EMPNOMBRE || '', data.VPN_CODE || '',
        data.SERVER_IP || '', data.SERVER_DB || '', data.SERVER_USER || '', data.SERVER_PASS || '', id]
    );
    if (!result.affectedRows) throw new Error('Registro no encontrado');
    const [rows] = await db.query(
      'SELECT ID, TOKEN, EMPNIT, EMPNOMBRE, VPN_CODE, SERVER_IP, SERVER_DB, SERVER_USER, SERVER_PASS FROM COMMUNITY_EMPRESAS_SYNC WHERE ID = ?',
      [id]
    );
    return normalizeRow(rows[0]);
  });
}

async function deleteCommunityEmpresa(conexion, id) {
  return withHostingConnection(conexion, async (db, tipo) => {
    if (tipo === 'mssql') {
      const result = await db.request()
        .input('id', sql.Int, id)
        .query('DELETE FROM COMMUNITY_EMPRESAS_SYNC WHERE ID = @id');
      if (!result.rowsAffected[0]) throw new Error('Registro no encontrado');
      return { ok: true };
    }

    const [result] = await db.query('DELETE FROM COMMUNITY_EMPRESAS_SYNC WHERE ID = ?', [id]);
    if (!result.affectedRows) throw new Error('Registro no encontrado');
    return { ok: true };
  });
}

module.exports = {
  withHostingConnection,
  ensureSoporteTable,
  listSoporteAnydesk,
  listTokens,
  createSoporteAnydesk,
  updateSoporteAnydesk,
  deleteSoporteAnydesk,
  listUpdateQueries,
  createUpdateQuery,
  updateUpdateQuery,
  deleteUpdateQuery,
  todayIsoDate,
  listTokensAdmin,
  createTokenAdmin,
  updateTokenAdmin,
  toggleTokenActivo,
  deleteTokenAdmin,
  listCommunityEmpresas,
  createCommunityEmpresa,
  updateCommunityEmpresa,
  deleteCommunityEmpresa,
};

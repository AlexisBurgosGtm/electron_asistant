const fs = require('fs').promises;
const fsSync = require('fs');
const { google } = require('googleapis');
const appPaths = require('./appPaths');

const CREDENTIALS_PATH = () => appPaths.googleCredentialsPath();
const TOKENS_PATH = () => appPaths.googleTokensPath();
const SCOPES = ['https://www.googleapis.com/auth/tasks'];

let oauth2Client = null;
let redirectUri = '';
let savedPort = 9006;
let credentialsMeta = { projectId: null, source: null };

function credentialsExist() {
  try {
    fsSync.accessSync(CREDENTIALS_PATH());
    return true;
  } catch {
    return false;
  }
}

function parseCredentials(raw, port) {
  const section = raw.web || raw.installed || raw;
  const clientId = raw.clientId || section.client_id;
  const clientSecret = raw.clientSecret || section.client_secret;
  const configuredUris = section.redirect_uris || [];
  const defaultUri = `http://localhost:${port}/api/google/callback`;
  const redirect = configuredUris.find((uri) => uri.includes(`:${port}/`))
    || configuredUris[0]
    || defaultUri;

  return {
    clientId,
    clientSecret,
    redirectUri: redirect,
    projectId: section.project_id || raw.project_id || null,
    source: raw.web ? 'web' : raw.installed ? 'installed' : 'custom',
  };
}

async function saveTokens(tokens) {
  let existing = {};
  try {
    existing = JSON.parse(await fs.readFile(TOKENS_PATH(), 'utf-8'));
  } catch {
    /* sin tokens previos */
  }

  const merged = { ...existing, ...tokens };
  await fs.writeFile(TOKENS_PATH(), JSON.stringify(merged, null, 2), 'utf-8');
  oauth2Client.setCredentials(merged);
}

function bindTokenRefresh(client) {
  client.on('tokens', (tokens) => {
    if (!tokens.access_token && !tokens.refresh_token) return;
    saveTokens(tokens).catch((err) => {
      console.warn('Google Tasks: no se pudieron guardar tokens:', err.message);
    });
  });
}

async function loadClient(port) {
  savedPort = port;
  redirectUri = `http://localhost:${port}/api/google/callback`;

  if (!credentialsExist()) {
    oauth2Client = null;
    credentialsMeta = { projectId: null, source: null };
    return null;
  }

  const raw = JSON.parse(await fs.readFile(CREDENTIALS_PATH(), 'utf-8'));
  const parsed = parseCredentials(raw, port);

  if (!parsed.clientId || !parsed.clientSecret) {
    throw new Error(
      'google-credentials.json no válido. Usa el JSON descargado de Google Cloud (sección web o installed).'
    );
  }

  redirectUri = parsed.redirectUri;
  credentialsMeta = { projectId: parsed.projectId, source: parsed.source };

  oauth2Client = new google.auth.OAuth2(parsed.clientId, parsed.clientSecret, redirectUri);
  bindTokenRefresh(oauth2Client);

  try {
    const tokens = JSON.parse(await fs.readFile(TOKENS_PATH(), 'utf-8'));
    oauth2Client.setCredentials(tokens);
  } catch {
    /* sin tokens guardados */
  }

  return oauth2Client;
}

async function ensureClient() {
  if (oauth2Client) return oauth2Client;
  if (!credentialsExist()) return null;
  return loadClient(savedPort);
}

function isInvalidGrantError(err) {
  const data = err?.response?.data;
  if (data?.error === 'invalid_grant') return true;
  const message = String(err?.message || err || '');
  return message.includes('invalid_grant');
}

async function clearStoredTokens() {
  try {
    await fs.unlink(TOKENS_PATH());
  } catch {
    /* ignore */
  }

  if (oauth2Client) {
    oauth2Client.setCredentials({});
  }
}

async function verifyAuthentication() {
  if (!oauth2Client || !isAuthenticated()) return false;

  try {
    const access = await oauth2Client.getAccessToken();
    return Boolean(access?.token);
  } catch (err) {
    if (isInvalidGrantError(err)) {
      await clearStoredTokens();
      return false;
    }
    throw err;
  }
}

async function withGoogleApi(fn) {
  await ensureClient();
  const valid = await verifyAuthentication();
  if (!valid) {
    throw new Error('La sesión de Google expiró. Vuelve a conectar tu cuenta.');
  }

  try {
    return await fn();
  } catch (err) {
    if (isInvalidGrantError(err)) {
      await clearStoredTokens();
      throw new Error('La sesión de Google expiró. Vuelve a conectar tu cuenta.');
    }
    throw err;
  }
}

function isAuthenticated() {
  const creds = oauth2Client?.credentials;
  return Boolean(creds?.access_token || creds?.refresh_token);
}

async function getStatus() {
  await ensureClient();
  const hasCredentials = credentialsExist();
  let authenticated = false;

  if (hasCredentials && oauth2Client) {
    authenticated = await verifyAuthentication();
  }

  return {
    hasCredentials,
    authenticated,
    redirectUri,
    projectId: credentialsMeta.projectId,
    credentialsSource: credentialsMeta.source,
    credentialsPath: appPaths.googleCredentialsPath(),
    dataDir: appPaths.getDataDir(),
    isPackaged: appPaths.getIsPackaged(),
  };
}

async function getAuthUrl() {
  await ensureClient();

  if (!oauth2Client) {
    throw new Error(
      `Coloca google-credentials.json en: ${appPaths.googleCredentialsPath()}`
    );
  }

  return oauth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: SCOPES,
    prompt: 'consent',
    redirect_uri: redirectUri,
  });
}

async function handleCallback(code) {
  await ensureClient();

  if (!oauth2Client) {
    throw new Error('Cliente OAuth no inicializado');
  }

  const { tokens } = await oauth2Client.getToken({ code, redirect_uri: redirectUri });
  await saveTokens(tokens);
  return tokens;
}

async function logout() {
  if (oauth2Client?.credentials?.access_token) {
    try {
      await oauth2Client.revokeCredentials();
    } catch {
      /* ignore */
    }
  }

  try {
    await fs.unlink(TOKENS_PATH());
  } catch {
    /* ignore */
  }

  oauth2Client = null;
  await loadClient(savedPort);

  return { ok: true };
}

function ensureAuth() {
  if (!isAuthenticated()) {
    throw new Error('Conecta tu cuenta de Google Tasks primero');
  }
}

async function getTaskLists() {
  return withGoogleApi(async () => {
    const service = google.tasks({ version: 'v1', auth: oauth2Client });
    const response = await service.tasklists.list({ maxResults: 100 });
    return response.data.items || [];
  });
}

async function getTasks(taskListId) {
  return withGoogleApi(async () => {
    const service = google.tasks({ version: 'v1', auth: oauth2Client });
    const response = await service.tasks.list({
      tasklist: taskListId,
      showCompleted: true,
      showHidden: true,
      maxResults: 100,
    });
    return response.data.items || [];
  });
}

async function getAllTasksGrouped() {
  const lists = await getTaskLists();
  const grouped = [];

  for (const list of lists) {
    const tasks = await getTasks(list.id);
    grouped.push({
      id: list.id,
      title: list.title,
      tasks: tasks.map((task) => ({
        id: task.id,
        title: task.title || 'Sin título',
        notes: task.notes || '',
        status: task.status,
        due: task.due || null,
        updated: task.updated || null,
      })),
    });
  }

  return grouped;
}

async function completeTask(taskListId, taskId) {
  return withGoogleApi(async () => {
    const service = google.tasks({ version: 'v1', auth: oauth2Client });
    const response = await service.tasks.patch({
      tasklist: taskListId,
      task: taskId,
      requestBody: { status: 'completed' },
    });
    return {
      id: response.data.id,
      title: response.data.title || 'Sin título',
      status: response.data.status,
    };
  });
}

async function saveCredentials({ clientId, clientSecret, projectId, redirectUri }) {
  const id = String(clientId || '').trim();
  const secret = String(clientSecret || '').trim();

  if (!id || !secret) {
    throw new Error('Client ID y Client Secret son obligatorios');
  }

  const uri = String(redirectUri || '').trim() || `http://localhost:${savedPort}/api/google/callback`;
  const payload = {
    web: {
      client_id: id,
      client_secret: secret,
      project_id: String(projectId || '').trim() || 'mariandre-tasks',
      auth_uri: 'https://accounts.google.com/o/oauth2/auth',
      token_uri: 'https://oauth2.googleapis.com/token',
      auth_provider_x509_cert_url: 'https://www.googleapis.com/oauth2/v1/certs',
      redirect_uris: [uri],
    },
  };

  await fs.writeFile(CREDENTIALS_PATH(), JSON.stringify(payload, null, 2), 'utf-8');
  oauth2Client = null;
  await loadClient(savedPort);
  return getStatus();
}

module.exports = {
  loadClient,
  ensureClient,
  getStatus,
  getAuthUrl,
  handleCallback,
  logout,
  saveCredentials,
  getTaskLists,
  getTasks,
  getAllTasksGrouped,
  completeTask,
};

const API_BASE = '/api';

async function request(path, options = {}) {
  const response = await fetch(`${API_BASE}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    const message = data.error || data.mensaje || `Error ${response.status}`;
    throw new Error(typeof message === 'string' ? message : `Error ${response.status}`);
  }

  return data;
}

export const api = {
  getStatus: () => request('/status'),
  getConfig: () => request('/config'),
  updateConfig: (data) => request('/config', { method: 'PUT', body: JSON.stringify(data) }),
  getHostingStatus: () => request('/hosting/status'),
  getSoporteAnydesk: () => request('/soporte/anydesk'),
  getSoporteTokens: () => request('/soporte/tokens'),
  createSoporteAnydesk: (data) => request('/soporte/anydesk', { method: 'POST', body: JSON.stringify(data) }),
  updateSoporteAnydesk: (id, data) => request(`/soporte/anydesk/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteSoporteAnydesk: (id) => request(`/soporte/anydesk/${id}`, { method: 'DELETE' }),
  getUpdaterQueries: () => request('/updater/queries'),
  createUpdaterQuery: (data) => request('/updater/queries', { method: 'POST', body: JSON.stringify(data) }),
  updateUpdaterQuery: (id, data) => request(`/updater/queries/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteUpdaterQuery: (id) => request(`/updater/queries/${id}`, { method: 'DELETE' }),
  getTokensAdmin: () => request('/tokens/admin'),
  createTokenAdmin: (data) => request('/tokens/admin', { method: 'POST', body: JSON.stringify(data) }),
  updateTokenAdmin: (token, data) => request(`/tokens/admin/${encodeURIComponent(token)}`, { method: 'PUT', body: JSON.stringify(data) }),
  toggleTokenActivo: (token) => request(`/tokens/admin/${encodeURIComponent(token)}/activo`, { method: 'PATCH' }),
  deleteTokenAdmin: (token) => request(`/tokens/admin/${encodeURIComponent(token)}`, { method: 'DELETE' }),
  getCommunityEmpresas: (token, search = '') => {
    const params = new URLSearchParams({ token, search });
    return request(`/tokens/community?${params}`);
  },
  createCommunityEmpresa: (data) => request('/tokens/community', { method: 'POST', body: JSON.stringify(data) }),
  updateCommunityEmpresa: (id, data) => request(`/tokens/community/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteCommunityEmpresa: (id) => request(`/tokens/community/${id}`, { method: 'DELETE' }),
  hideToTray: () => request('/window/hide-to-tray', { method: 'POST' }),
  getConexiones: () => request('/conexiones'),
  getConexion: (id) => request(`/conexiones/${id}`),
  createConexion: (data) => request('/conexiones', { method: 'POST', body: JSON.stringify(data) }),
  updateConexion: (id, data) => request(`/conexiones/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteConexion: (id) => request(`/conexiones/${id}`, { method: 'DELETE' }),
  testConexion: (id) => request(`/conexiones/${id}/test`, { method: 'POST' }),
  testConexionData: (data) => request('/conexiones/test', { method: 'POST', body: JSON.stringify(data) }),
  executeConexionQuery: (id, query) => request(`/conexiones/${id}/query`, { method: 'POST', body: JSON.stringify({ query }) }),
  getServiciosOnline: () => request('/servicios-online'),
  getServicioOnline: (id) => request(`/servicios-online/${id}`),
  createServicioOnline: (data) => request('/servicios-online', { method: 'POST', body: JSON.stringify(data) }),
  updateServicioOnline: (id, data) => request(`/servicios-online/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteServicioOnline: (id) => request(`/servicios-online/${id}`, { method: 'DELETE' }),
  pingServicioOnline: (id) => request(`/servicios-online/${id}/ping`, { method: 'POST' }),
  getMantenimiento: () => request('/mantenimiento'),
  createMantenimiento: (data) => request('/mantenimiento', { method: 'POST', body: JSON.stringify(data) }),
  updateMantenimiento: (id, data) => request(`/mantenimiento/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteMantenimiento: (id) => request(`/mantenimiento/${id}`, { method: 'DELETE' }),
  ejecutarMantenimiento: (id) => request(`/mantenimiento/${id}/ejecutar`, { method: 'POST' }),
  getWhatsAppStatus: () => request('/whatsapp/status'),
  getWhatsAppMessages: () => request('/whatsapp/messages'),
  startWhatsApp: () => request('/whatsapp/start', { method: 'POST' }),
  refreshWhatsApp: () => request('/whatsapp/refresh', { method: 'POST' }),
  logoutWhatsApp: () => request('/whatsapp/logout', { method: 'POST' }),
  getGoogleStatus: () => request('/google/status'),
  saveGoogleCredentials: (data) => request('/google/credentials', { method: 'POST', body: JSON.stringify(data) }),
  getGoogleAuthUrl: () => request('/google/auth-url'),
  getGoogleTasks: () => request('/google/tasks'),
  completeGoogleTask: (listId, taskId) => request(`/google/tasks/${listId}/${taskId}/complete`, { method: 'POST' }),
  logoutGoogle: () => request('/google/logout', { method: 'POST' }),
};

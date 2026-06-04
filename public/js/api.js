const API_BASE = '/api';

async function request(path, options = {}) {
  const response = await fetch(`${API_BASE}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(data.error || data.mensaje || `Error ${response.status}`);
  }

  return data;
}

export const api = {
  getStatus: () => request('/status'),
  hideToTray: () => request('/window/hide-to-tray', { method: 'POST' }),
  getConexiones: () => request('/conexiones'),
  getConexion: (id) => request(`/conexiones/${id}`),
  createConexion: (data) => request('/conexiones', { method: 'POST', body: JSON.stringify(data) }),
  updateConexion: (id, data) => request(`/conexiones/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteConexion: (id) => request(`/conexiones/${id}`, { method: 'DELETE' }),
  testConexion: (id) => request(`/conexiones/${id}/test`, { method: 'POST' }),
  testConexionData: (data) => request('/conexiones/test', { method: 'POST', body: JSON.stringify(data) }),
  getMantenimiento: () => request('/mantenimiento'),
  createMantenimiento: (data) => request('/mantenimiento', { method: 'POST', body: JSON.stringify(data) }),
  updateMantenimiento: (id, data) => request(`/mantenimiento/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteMantenimiento: (id) => request(`/mantenimiento/${id}`, { method: 'DELETE' }),
  ejecutarMantenimiento: (id) => request(`/mantenimiento/${id}/ejecutar`, { method: 'POST' }),
  getWhatsAppStatus: () => request('/whatsapp/status'),
  getWhatsAppMessages: () => request('/whatsapp/messages'),
  startWhatsApp: () => request('/whatsapp/start', { method: 'POST' }),
  logoutWhatsApp: () => request('/whatsapp/logout', { method: 'POST' }),
  getGoogleStatus: () => request('/google/status'),
  getGoogleAuthUrl: () => request('/google/auth-url'),
  getGoogleTasks: () => request('/google/tasks'),
  completeGoogleTask: (listId, taskId) => request(`/google/tasks/${listId}/${taskId}/complete`, { method: 'POST' }),
  logoutGoogle: () => request('/google/logout', { method: 'POST' }),
};

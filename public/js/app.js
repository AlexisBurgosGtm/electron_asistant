import { api } from './api.js';
import { renderHome } from './pages/home.js';
import { renderConexiones, openNewConexionModal, cleanupConexionesPage } from './pages/conexiones.js';
import { renderMantenimiento, openNewComandoModal } from './pages/mantenimiento.js';
import { renderWhatsapp, cleanupWhatsappPage } from './pages/whatsapp.js';
import { renderTareas } from './pages/tareas.js';
import { renderServiciosOnline, openNewServicioModal, cleanupServiciosOnlinePage } from './pages/servicios-online.js';
import { initWhatsAppListener } from './services/whatsapp.js';
import { initTts } from './tts.js';
import { showToast } from './utils.js';

const routes = {
  '/': { title: 'Inicio', icon: 'fa-house', render: renderHome },
  '/conexiones': { title: 'Conexiones', icon: 'fa-plug', render: renderConexiones },
  '/servicios-online': { title: 'Servicios Online', icon: 'fa-globe', render: renderServiciosOnline },
  '/mantenimiento': { title: 'Mantenimiento DB', icon: 'fa-screwdriver-wrench', render: renderMantenimiento },
  '/tareas': { title: 'Tareas', icon: 'fa-list-check', render: renderTareas },
  '/whatsapp': { title: 'Whatsapp', icon: 'fa-brands fa-whatsapp', render: renderWhatsapp },
};

let currentRoute = '/';
let renderGeneration = 0;

function getRoute() {
  const hash = window.location.hash.slice(1) || '/';
  const path = hash.startsWith('/') ? hash : `/${hash}`;
  return routes[path] ? path : '/';
}

function hashForRoute(path) {
  return path === '/' ? '#/' : `#${path}`;
}

function renderNav() {
  const nav = document.getElementById('nav');
  nav.innerHTML = Object.entries(routes).map(([path, route]) => `
    <a class="nav-link ${currentRoute === path ? 'active' : ''}" data-route="${path}" href="${hashForRoute(path)}">
      <i class="fa-solid ${route.icon}"></i>
      <span>${route.title}</span>
    </a>
  `).join('');

  nav.querySelectorAll('.nav-link').forEach((link) => {
    link.addEventListener('click', (e) => {
      e.preventDefault();
      navigate(link.dataset.route);
    });
  });
}

function renderTopbarActions(routePath = currentRoute) {
  const actions = document.getElementById('topbar-actions');
  let extra = '';

  if (routePath === '/conexiones') {
    extra = `
      <button class="btn btn--primary" id="btn-add-conexion">
        <i class="fa-solid fa-plus"></i> Nueva conexión
      </button>
    `;
  } else if (routePath === '/servicios-online') {
    extra = `
      <button class="btn btn--primary" id="btn-add-servicio" type="button">
        <i class="fa-solid fa-plus"></i> Nuevo servicio
      </button>
    `;
  } else if (routePath === '/mantenimiento') {
    extra = `
      <button class="btn btn--primary" id="btn-add-comando" type="button">
        <i class="fa-solid fa-plus"></i> Nuevo comando
      </button>
    `;
  }

  actions.innerHTML = `
    <button class="btn btn--ghost" id="btn-hide-tray" type="button" title="Minimizar a bandeja del sistema">
      <i class="fa-solid fa-down-left-and-up-right-to-center"></i> A bandeja
    </button>
    ${extra}
  `;

  document.getElementById('btn-hide-tray').addEventListener('click', async () => {
    try {
      await api.hideToTray();
    } catch (err) {
      showToast(err.message, 'error');
    }
  });

  if (routePath === '/conexiones') {
    document.getElementById('btn-add-conexion')?.addEventListener('click', openNewConexionModal);
  } else if (routePath === '/servicios-online') {
    document.getElementById('btn-add-servicio')?.addEventListener('click', openNewServicioModal);
  } else if (routePath === '/mantenimiento') {
    document.getElementById('btn-add-comando')?.addEventListener('click', openNewComandoModal);
  }
}

function cleanupOtherPages(routePath) {
  if (routePath !== '/whatsapp') cleanupWhatsappPage();
  if (routePath !== '/conexiones') cleanupConexionesPage();
  if (routePath !== '/servicios-online') cleanupServiciosOnlinePage();
}

async function renderPage() {
  const generation = ++renderGeneration;
  const routePath = currentRoute;
  const route = routes[routePath];
  if (!route) return;

  cleanupOtherPages(routePath);

  document.getElementById('page-title').textContent = route.title;
  renderTopbarActions(routePath);

  const content = document.getElementById('content');
  content.innerHTML = '<div style="text-align:center;padding:3rem;color:var(--text-muted)"><i class="fa-solid fa-spinner fa-spin fa-2x"></i></div>';

  try {
    await route.render(content);
  } catch (err) {
    if (generation !== renderGeneration) return;
    content.innerHTML = `<div class="empty-state glass"><p>${err.message}</p></div>`;
    renderTopbarActions(routePath);
    return;
  }

  if (generation !== renderGeneration) return;
}

async function reloadCurrentPage() {
  if (!routes[currentRoute]) return;
  await renderPage();
}

function navigate(path) {
  const target = routes[path] ? path : '/';
  currentRoute = target;
  const nextHash = hashForRoute(target);

  if (window.location.hash === nextHash) {
    renderNav();
    renderPage();
    return;
  }

  window.location.hash = target === '/' ? '/' : target;
}

async function checkServerStatus() {
  const statusEl = document.getElementById('server-status');
  const dot = document.querySelector('.status-dot');
  try {
    const status = await api.getStatus();
    statusEl.textContent = `Servidor :${status.puerto}`;
    dot.classList.add('online');
  } catch {
    statusEl.textContent = 'Servidor offline';
    dot.classList.remove('online');
  }
}

window.__reloadConexiones = async () => {
  if (currentRoute === '/conexiones') await reloadCurrentPage();
};

window.__reloadServiciosOnline = async () => {
  if (currentRoute === '/servicios-online') await reloadCurrentPage();
};

window.__reloadMantenimiento = async () => {
  if (currentRoute === '/mantenimiento') await reloadCurrentPage();
};

window.addEventListener('hashchange', () => {
  currentRoute = getRoute();
  renderNav();
  renderPage();
});

currentRoute = getRoute();
renderNav();
renderPage();
checkServerStatus();
setInterval(checkServerStatus, 30000);

initTts();
initWhatsAppListener();

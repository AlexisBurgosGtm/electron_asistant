import { api } from './api.js';
import { renderHome } from './pages/home.js';
import { renderConexiones, openNewConexionModal } from './pages/conexiones.js';
import { renderMantenimiento, openNewComandoModal } from './pages/mantenimiento.js';
import {
  initVoice,
  onVoiceCommand,
  parseTestConnectionCommand,
  findComandoByVoz,
  speak,
  notifyWithVoice,
} from './voice.js';
import { runConnectionTestByName, runMantenimientoComando } from './services/connections.js';

const routes = {
  '/': { title: 'Inicio', icon: 'fa-house', render: renderHome },
  '/conexiones': { title: 'Conexiones', icon: 'fa-plug', render: renderConexiones },
  '/mantenimiento': { title: 'Mantenimiento DB', icon: 'fa-screwdriver-wrench', render: renderMantenimiento },
};

let currentRoute = '/';

function getRoute() {
  const hash = window.location.hash.slice(1) || '/';
  return routes[hash] ? hash : '/';
}

function renderNav() {
  const nav = document.getElementById('nav');
  nav.innerHTML = Object.entries(routes).map(([path, route]) => `
    <a class="nav-link ${currentRoute === path ? 'active' : ''}" data-route="${path}">
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

function renderTopbarActions() {
  const actions = document.getElementById('topbar-actions');

  if (currentRoute === '/conexiones') {
    actions.innerHTML = `
      <button class="btn btn--primary" id="btn-add-conexion">
        <i class="fa-solid fa-plus"></i> Nueva conexión
      </button>
    `;
    document.getElementById('btn-add-conexion').addEventListener('click', openNewConexionModal);
  } else if (currentRoute === '/mantenimiento') {
    actions.innerHTML = `
      <button class="btn btn--primary" id="btn-add-comando" type="button">
        <i class="fa-solid fa-plus"></i> Nuevo comando
      </button>
    `;
    document.getElementById('btn-add-comando').addEventListener('click', openNewComandoModal);
  } else {
    actions.innerHTML = '';
  }
}

async function renderPage() {
  const route = routes[currentRoute];
  document.getElementById('page-title').textContent = route.title;
  renderTopbarActions();

  const content = document.getElementById('content');
  content.innerHTML = '<div style="text-align:center;padding:3rem;color:var(--text-muted)"><i class="fa-solid fa-spinner fa-spin fa-2x"></i></div>';

  await route.render(content);
}

function navigate(path) {
  currentRoute = routes[path] ? path : '/';
  window.location.hash = currentRoute;
  renderNav();
  renderPage();
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

async function handleVoiceCommand(transcript) {
  const testName = parseTestConnectionCommand(transcript);
  if (testName) {
    speak(`Probando conexión ${testName}`);
    await runConnectionTestByName(testName);
    return;
  }

  try {
    const comandos = await api.getMantenimiento();
    const comando = findComandoByVoz(comandos, transcript);
    if (comando) {
      speak(`Ejecutando ${comando.comandoVoz}`);
      await runMantenimientoComando(comando);
      return;
    }
  } catch (err) {
    notifyWithVoice(err.message, 'error');
    return;
  }

  notifyWithVoice('Comando de voz no reconocido', 'error');
}

window.__reloadConexiones = async () => {
  if (currentRoute === '/conexiones') {
    await renderPage();
  }
};

window.__reloadMantenimiento = async () => {
  if (currentRoute === '/mantenimiento') {
    await renderPage();
  }
};

window.addEventListener('hashchange', () => {
  currentRoute = getRoute();
  renderNav();
  renderPage();
});

renderNav();
navigate(getRoute());
checkServerStatus();
setInterval(checkServerStatus, 30000);

initVoice();
onVoiceCommand(handleVoiceCommand);

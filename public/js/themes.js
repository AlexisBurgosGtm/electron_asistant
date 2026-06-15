const THEME_KEY = 'mariandre-theme';

export const THEMES = [
  { id: 'default', label: 'Actual', icon: 'fa-moon', desc: 'Azul oscuro (predeterminado)' },
  { id: 'black', label: 'Negro', icon: 'fa-circle', desc: 'Negro puro' },
  { id: 'white', label: 'Blanco', icon: 'fa-sun', desc: 'Claro neutro' },
  { id: 'purple', label: 'Morado', icon: 'fa-wand-magic-sparkles', desc: 'Oscuro morado' },
  { id: 'white-purple', label: 'Blanco · Morado', icon: 'fa-palette', desc: 'Claro con acentos morados' },
  { id: 'white-sky', label: 'Blanco · Celeste', icon: 'fa-cloud', desc: 'Claro con acentos celestes' },
  { id: 'carbon', label: 'Carbon', icon: 'fa-layer-group', desc: 'Estilo IBM Carbon' },
  { id: 'construccion', label: 'Construcción', icon: 'fa-helmet-safety', desc: 'Mostaza, blanco y negro' },
];

export function getStoredTheme() {
  const stored = localStorage.getItem(THEME_KEY);
  return THEMES.some((t) => t.id === stored) ? stored : 'default';
}

export function applyTheme(themeId) {
  const id = THEMES.some((t) => t.id === themeId) ? themeId : 'default';
  document.documentElement.dataset.theme = id === 'default' ? '' : id;
  if (id === 'default') {
    document.documentElement.removeAttribute('data-theme');
  }
  localStorage.setItem(THEME_KEY, id);
  return id;
}

export function initTheme() {
  applyTheme(getStoredTheme());
}

export function renderThemeSelector(activeId = getStoredTheme()) {
  return `
    <div class="theme-panel glass">
      <h3><i class="fa-solid fa-palette"></i> Tema de la aplicación</h3>
      <p class="theme-panel__desc">Elige un estilo visual. La preferencia se guarda automáticamente.</p>
      <div class="theme-grid">
        ${THEMES.map((theme) => `
          <button type="button" class="theme-card ${activeId === theme.id ? 'theme-card--active' : ''}" data-theme="${theme.id}">
            <span class="theme-card__preview theme-card__preview--${theme.id}"></span>
            <span class="theme-card__label"><i class="fa-solid ${theme.icon}"></i> ${theme.label}</span>
            <span class="theme-card__desc">${theme.desc}</span>
          </button>
        `).join('')}
      </div>
    </div>
  `;
}

export function bindThemeSelector(container, onChange) {
  container.querySelectorAll('.theme-card').forEach((btn) => {
    btn.addEventListener('click', () => {
      const id = applyTheme(btn.dataset.theme);
      container.querySelectorAll('.theme-card').forEach((el) => {
        el.classList.toggle('theme-card--active', el.dataset.theme === id);
      });
      if (onChange) onChange(id);
    });
  });
}

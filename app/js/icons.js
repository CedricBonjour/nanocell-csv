// Vite auto-inlines or bundles all SVGs in app/icons/
// Files smaller than 4KB are automatically converted into data:image/svg+xml;base64,...
const iconModules = import.meta.glob('../icons/*.svg', {
  eager: true,
  import: 'default'
});

const iconMap = new Map();

for (const [path, url] of Object.entries(iconModules)) {
  // path is e.g. '../icons/edit.svg' or '../icons/menu/save.svg'
  const rel = path.replace(/^\.\.\/icons\//, ''); // 'edit.svg' or 'menu/save.svg'
  const name = rel.replace(/\.svg$/, ''); // 'edit' or 'menu/save'

  iconMap.set(rel, url);
  iconMap.set(name, url);
  iconMap.set(`icn/${rel}`, url);
  iconMap.set(`icn/${name}`, url);
  iconMap.set(`/app/icn/${rel}`, url);
}

/**
 * Returns the resolved URL or data URI for an icon.
 * Supports names like 'edit', 'save', 'lock', as well as legacy paths like 'menu/save' or 'icn/edit.svg'.
 * @param {string} name
 * @returns {string}
 */
export function getIconUrl(name) {
  if (!name) return '';
  let clean = name.trim().replace(/^url\(["']?|["']?\)$/g, '');
  if (iconMap.has(clean)) return iconMap.get(clean);
  clean = clean.replace(/^\/?(app\/)?/, '');
  if (iconMap.has(clean)) return iconMap.get(clean);
  const withoutExt = clean.replace(/\.svg$/, '');
  if (iconMap.has(withoutExt)) return iconMap.get(withoutExt);
  return iconMap.get(name) || name;
}

/**
 * Directly sets the --icon-url CSS property on an element.
 * @param {HTMLElement} element
 * @param {string} iconName
 */
export function setIcon(element, iconName) {
  if (!element || !element.style) return;
  const url = getIconUrl(iconName);
  if (url) {
    element.style.setProperty('--icon-url', `url("${url}")`);
  }
}

export { iconMap };

/** Create and display a dismissible live-region toast banner. */
export function showToast(text, { id, cls = '', ms = 0 } = {}) {
  const n = document.createElement('div');
  n.className = cls ? `toast-banner ${cls}` : 'toast-banner';
  if (id) n.id = id;
  n.setAttribute('role', 'status');
  n.setAttribute('aria-live', 'polite');
  const b = document.createElement('button');
  b.type = 'button';
  b.className = 'toast-btn';
  b.textContent = text;
  const dismiss = () => n.remove();
  b.onclick = dismiss;
  b.onkeydown = ev => { if (ev.key === 'Escape') { ev.stopPropagation(); dismiss(); } };
  n.onclick = dismiss;
  n.appendChild(b);
  document.body.appendChild(n);
  if (ms > 0) setTimeout(dismiss, ms);
  return n;
}

/** Toggle a persistent device-local status badge, creating it on first use. */
export function toggleBadge(badge, id, text, on, cls = '') {
  if (!badge) {
    badge = document.createElement('div');
    badge.id = id;
    badge.className = cls ? `local-badge ${cls}` : 'local-badge';
    badge.setAttribute('role', 'status');
    badge.setAttribute('aria-live', 'polite');
    badge.textContent = text;
    document.body.appendChild(badge);
  }
  badge.hidden = !on;
  return badge;
}

/**
 * @file app/js/utils.js
 * Centralized generic DOM, string, formatting, math, and browser I/O utility functions.
 * Pure leaf module with zero internal dependencies.
 */

// --- Custom Element & DOM Utilities ---

export const BaseElement = typeof HTMLElement !== 'undefined' ? HTMLElement : class {};

export function defineEl(tag, cls) {
  if (typeof customElements !== 'undefined' && !customElements.get(tag)) {
    customElements.define(tag, cls);
  }
}

export function setOpen(el, open) {
  if (!el) return;
  const isOpenState = Boolean(open);
  el._isOpen = isOpenState;
  el.classList?.toggle('open', isOpenState);
  if (isOpenState) el.setAttribute?.('open', '');
  else el.removeAttribute?.('open');
}

export function isOpen(el) {
  if (!el) return false;
  if (el.classList || el.hasAttribute) {
    return Boolean(el.classList?.contains('open') || el.hasAttribute?.('open'));
  }
  return Boolean(el._isOpen);
}

export function isInputElement(el) {
  return Boolean(el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable));
}

export function emitChange(el, isUserAction = true) {
  if (isUserAction && typeof Event !== 'undefined') {
    el?.dispatchEvent?.(new Event('change', { bubbles: true }));
  }
}

export function cycleFocus(event, focusableElements, fallbackElement = null) {
  if (!focusableElements?.length) return;
  event.preventDefault();
  const active = globalThis.document?.activeElement;
  let index = focusableElements.findIndex(el => el === active || (active && el?.contains?.(active)));
  if (index === -1 && fallbackElement) {
    index = focusableElements.findIndex(el => el === fallbackElement || el?.contains?.(fallbackElement));
  }
  const nextIndex = event.shiftKey
    ? (index <= 0 ? focusableElements.length - 1 : index - 1)
    : (index === -1 || index >= focusableElements.length - 1 ? 0 : index + 1);
  const nextEl = focusableElements[nextIndex];
  nextEl?.focus?.();
  const scrollTarget = nextEl?.closest?.('.setting-row') || nextEl;
  try { scrollTarget?.scrollIntoView?.({ block: 'nearest', inline: 'nearest' }); } catch {}
}

// --- String, Formatting & Escaping Utilities ---

export function escapeHtml(text) {
  if (typeof text !== 'string') text = String(text ?? '');
  if (!/[&<>"']/.test(text)) return text;
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

export function formatCellHtml(value, showSpaceDots = false) {
  const html = String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('\n', '<br>');
  return showSpaceDots ? html.replaceAll(' ', '<span class="cell-space-dot">&bull;</span>') : html;
}

export function formatThousands(value) {
  if (value == null || value === '') return '';
  const str = typeof value === 'string' ? value.replace(/\s+/g, '') : String(value);
  if (!Number.isFinite(Number(str))) return String(value);
  const parts = str.split('.');
  parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  return parts.join('.');
}

export function getTodayIsoDate(now = new Date()) {
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

export function fuzzyScore(query, text) {
  if (!query) return 1;
  if (!text) return 0;
  const q = query.trim().toLowerCase(), t = text.toLowerCase();
  if (!q) return 1;
  if (t === q) return 1000;
  if (t.startsWith(q)) return 800 - (t.length - q.length);
  for (const word of t.split(/[\s_\-/]+/)) {
    if (word.startsWith(q)) return 600 - (t.length - q.length);
  }
  const subIdx = t.indexOf(q);
  if (subIdx !== -1) return 400 - subIdx;

  let qIdx = 0, score = 0, consecutive = 0, prevMatchIdx = -10;
  for (let i = 0; i < t.length && qIdx < q.length; i++) {
    if (t[i] === q[qIdx]) {
      score += 10 + ((i === prevMatchIdx + 1) ? (consecutive = consecutive + 1) * 5 : (consecutive = 0));
      prevMatchIdx = i;
      qIdx++;
    }
  }
  return qIdx === q.length ? score : 0;
}

export function getShortcutKey(key, ctrl, shift, alt) {
  return `${ctrl ? 1 : 0}:${shift ? 1 : 0}:${alt ? 1 : 0}:${String(key).toUpperCase()}`;
}

// --- Math & Numeric Utilities ---

export function clamp(val, min, max) {
  return Math.max(min, Math.min(max, val));
}

export function getNextPow2(value) {
  if (value < 1) return 1;
  const candidate = 2 ** Math.floor(Math.log2(value));
  return candidate > value ? candidate : candidate * 2;
}

export function getPrevPow2(value) {
  if (value <= 1) return 1;
  const candidate = 2 ** Math.ceil(Math.log2(value));
  return candidate < value ? candidate : candidate / 2;
}

// --- Browser I/O & Async Utilities ---

export async function copyToClipboard(text) {
  if (!globalThis.navigator?.clipboard?.writeText) return false;
  try {
    await globalThis.navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

export function downloadBlob(blob, filename, doc = globalThis.document) {
  if (!doc) return;
  const url = URL.createObjectURL(blob);
  const anchor = doc.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.hidden = true;
  doc.body.appendChild(anchor);
  anchor.click();
  setTimeout(() => {
    URL.revokeObjectURL(url);
    anchor.remove();
  }, 100);
}

export function abortableSleep(ms, signal) {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(new DOMException('Aborted', 'AbortError'));
    const timer = setTimeout(resolve, Math.max(10, ms));
    signal?.addEventListener('abort', () => {
      clearTimeout(timer);
      reject(new DOMException('Aborted', 'AbortError'));
    }, { once: true });
  });
}

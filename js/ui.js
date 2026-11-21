// Tiny DOM helpers shared by every page.
import { parseKey } from './logic.js';

export function h(tag, attrs, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'style') el.style.cssText = v;
    else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else if (k === 'value') el.value = v;
    else if (k === 'checked' || k === 'selected' || k === 'disabled') el[k] = !!v;
    else el.setAttribute(k, v === true ? '' : v);
  }
  append(el, kids);
  return el;
}
function append(el, kids) {
  for (const k of kids.flat(Infinity)) {
    if (k == null || k === false) continue;
    el.append(k instanceof Node ? k : document.createTextNode(String(k)));
  }
}

export function fmtDate(k, opts = { weekday: 'short', month: 'short', day: 'numeric' }) {
  if (!k) return '';
  return parseKey(k).toLocaleDateString('en-US', opts);
}
export const fmtLong = k => fmtDate(k, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
export function fmtTime(d) { return d ? d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }) : ''; }
export function fmtDateTime(d) {
  if (!d) return '';
  return d.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

// Unsaved edits in a [data-form] block live updates until saved (any success toast) or the page changes.
export const formState = { dirty: false, onClean: null };
document.addEventListener('input', e => { if (e.target.closest && e.target.closest('[data-form]')) formState.dirty = true; });
export function markClean() { if (formState.dirty) { formState.dirty = false; formState.onClean && formState.onClean(); } }

let toastTimer;
export function toast(msg, kind = 'ok') {
  if (kind === 'ok') markClean();
  let t = document.getElementById('toast');
  if (!t) { t = h('div', { id: 'toast', role: 'status' }); document.body.append(t); }
  t.textContent = msg; t.className = `show ${kind}`;
  clearTimeout(toastTimer); toastTimer = setTimeout(() => (t.className = ''), 3200);
}

export const modalState = { open: 0, onClose: [] };
/** actions: [{label, kind:'primary'|'danger'|'', onClick: async () => false to keep open}] */
export function modal(title, body, actions = [{ label: 'Close' }], opts = {}) {
  const back = h('div', { class: 'modal-back' });
  let closed = false;
  const close = () => {
    if (closed) return; closed = true;
    if (box.querySelector('[data-form]')) markClean();
    back.remove(); modalState.open--;
    if (opts.onClose) opts.onClose();
    if (!modalState.open) modalState.onClose.forEach(f => f());
  };
  const btns = actions.map(a => {
    const b = h('button', { class: `btn ${a.kind || ''}`, type: 'button' }, a.label);
    b.onclick = async () => {
      if (!a.onClick) return close();
      b.disabled = true;
      try { if ((await a.onClick()) !== false) close(); }
      catch (e) { console.error(e); toast(e.message || 'Something went wrong', 'err'); }
      finally { b.disabled = false; }
    };
    return b;
  });
  const box = h('div', { class: 'modal', role: 'dialog', 'aria-modal': 'true', 'aria-label': title },
    h('div', { class: 'modal-head' }, h('h2', null, title),
      h('button', { class: 'icon-btn', 'aria-label': 'Close', onclick: close }, '×')),
    h('div', { class: 'modal-body' }, body),
    h('div', { class: 'modal-actions' }, btns));
  back.append(box);
  back.addEventListener('click', e => { if (e.target === back) close(); });
  document.body.append(back); modalState.open++;
  const first = box.querySelector('input, select, textarea');
  if (first) setTimeout(() => first.focus(), 50);
  return close;
}

export function confirmBox(title, message, okLabel = 'OK', danger = false) {
  return new Promise(res => {
    let answered = false;
    modal(title, h('p', null, message), [
      { label: 'Cancel', onClick: () => { answered = true; res(false); } },
      { label: okLabel, kind: danger ? 'danger' : 'primary', onClick: () => { answered = true; res(true); } },
    ], { onClose: () => { if (!answered) res(false); } });
  });
}

export function field(label, input, hint) {
  return h('label', { class: 'field' }, h('span', { class: 'field-label' }, label), input,
    hint ? h('span', { class: 'hint' }, hint) : null);
}
export function select(options, value, attrs = {}) {
  return h('select', attrs, options.map(o => {
    const [v, l] = Array.isArray(o) ? o : [o, o];
    return h('option', { value: v, selected: v === value }, l);
  }));
}
export const card = (title, ...kids) => h('section', { class: 'card' }, title ? h('h2', null, title) : null, kids);
export const empty = msg => h('p', { class: 'empty' }, msg);

export function downloadFile(name, content, type = 'text/plain') {
  const blob = content instanceof Blob ? content : new Blob([content], { type });
  const a = h('a', { href: URL.createObjectURL(blob), download: name });
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

export const go = path => { location.hash = '#/' + path; };

/** Draw a QR code onto a canvas. Uses the qrcode-generator library loaded in index.html. */
export function drawQR(canvas, text, size = 600) {
  const qr = globalThis.qrcode(0, 'M');
  qr.addData(text); qr.make();
  const n = qr.getModuleCount(), quiet = 4, cell = Math.floor(size / (n + quiet * 2));
  const px = cell * (n + quiet * 2);
  canvas.width = canvas.height = px;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, px, px); ctx.fillStyle = '#000';
  for (let r = 0; r < n; r++) for (let c = 0; c < n; c++)
    if (qr.isDark(r, c)) ctx.fillRect((c + quiet) * cell, (r + quiet) * cell, cell, cell);
  return canvas;
}

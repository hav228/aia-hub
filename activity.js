import { h, card, empty, fmtDateTime } from '../ui.js';
import { getActivity } from '../store.js';

let cache = null, loading = false, filter = '';

export function renderActivity() {
  const listEl = h('div');
  const search = h('input', { type: 'search', placeholder: 'Filter (name, person, action)…', value: filter, 'aria-label': 'Filter activity' });
  const draw = () => {
    if (!cache) { listEl.replaceChildren(h('p', { class: 'muted' }, 'Loading…')); return; }
    const f = filter.toLowerCase();
    const rows = cache.filter(a => !f || `${a.summary} ${a.byName} ${a.by} ${a.action}`.toLowerCase().includes(f));
    listEl.replaceChildren(rows.length ? h('ul', { class: 'activity' }, rows.map(a => h('li', null,
      h('div', null, a.summary),
      h('div', { class: 'muted small' }, `${a.byName || a.by || 'Someone'} · ${fmtDateTime(a.at)}`),
      a.changes && Object.keys(a.changes).length ? h('details', null, h('summary', { class: 'small' }, 'What changed'),
        h('ul', { class: 'small' }, Object.entries(a.changes).map(([k, v]) => h('li', null, `${k}: “${fmt(v.from)}” → “${fmt(v.to)}”`)))) : null))) : empty('Nothing found.'));
  };
  search.addEventListener('input', () => { filter = search.value; draw(); });
  const load = async () => {
    loading = true;
    try { cache = await getActivity(300); } catch (e) { cache = []; console.error(e); }
    loading = false; draw();
  };
  if (!cache && !loading) load(); else draw();
  return [h('div', { class: 'page-head' }, h('a', { class: 'btn icon', href: '#/more', 'aria-label': 'Back' }, '‹'), h('h1', null, 'Activity log'),
    h('button', { class: 'btn small', onclick: load }, 'Refresh')),
    h('p', { class: 'muted small' }, 'The latest 300 changes made by leaders and staff.'), h('div', { class: 'filters' }, search), card(null, listEl)];
}
const fmt = v => typeof v === 'object' ? JSON.stringify(v) : String(v ?? '');

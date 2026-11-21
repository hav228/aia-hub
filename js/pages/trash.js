import { h, card, empty, toast, confirmBox } from '../ui.js';
import { S, restorePerson, purgePerson, personTeam, restoreOutreach, purgeOutreach, userName } from '../store.js';
import { fullName } from '../logic.js';

const DAYS90 = 90 * 24 * 3600 * 1000;
let purging = false;

export function renderTrash() {
  const trashed = S.people.filter(p => p.deleted && !p.mergedInto).sort((a, b) => (b.deletedAt || 0) - (a.deletedAt || 0));
  // Auto-clean anything older than 90 days
  const old = trashed.filter(p => p.deletedAt instanceof Date && Date.now() - p.deletedAt > DAYS90);
  const notes = S.outreach.filter(o => o.deleted).sort((a, b) => (b.deletedAt || 0) - (a.deletedAt || 0));
  const oldNotes = notes.filter(o => o.deletedAt instanceof Date && Date.now() - o.deletedAt > DAYS90);
  if ((old.length || oldNotes.length) && !purging) { purging = true; Promise.all([...old.map(p => purgePerson(p, true)), ...oldNotes.map(o => purgeOutreach(o))]).finally(() => (purging = false)); }
  const byId = new Map(S.people.map(p => [p.id, p]));
  return [h('div', { class: 'page-head' }, h('a', { class: 'btn icon', href: '#/more', 'aria-label': 'Back' }, '‹'), h('h1', null, 'Trash')),
    h('p', { class: 'muted small' }, 'Deleted people stay here for 90 days. Restoring brings back everything, including their attendance.'),
    card('People', trashed.length ? h('ul', { class: 'set-list' }, trashed.map(p => {
      const left = p.deletedAt instanceof Date ? Math.max(0, Math.ceil((DAYS90 - (Date.now() - p.deletedAt)) / 86400000)) : 90;
      return h('li', null,
        h('div', null, h('strong', null, fullName(p)), h('div', { class: 'muted small' }, `${personTeam(p)} · deleted by ${p.deletedBy || '—'} · ${left} days left`)),
        h('div', { class: 'btn-row tight' },
          h('button', { class: 'btn small primary', onclick: async () => { await restorePerson(p); toast('Restored'); } }, 'Restore'),
          h('button', { class: 'btn small danger-outline', onclick: async () => {
            if (await confirmBox('Delete forever?', `This permanently removes ${fullName(p)} and their attendance. It can’t be undone.`, 'Delete forever', true)) { await purgePerson(p); toast('Deleted'); }
          } }, 'Delete forever')));
    })) : empty('No deleted people.')),
    card('Outreach notes', notes.length ? h('ul', { class: 'set-list' }, notes.map(o => {
      const p = byId.get(o.personId);
      return h('li', null,
        h('div', null, h('strong', null, `${o.method} with ${p ? fullName(p) : 'someone'}`), h('div', { class: 'muted small' }, `${o.date} by ${userName(o.by)}${o.notes ? ` — ${o.notes.slice(0, 80)}` : ''}`)),
        h('div', { class: 'btn-row tight' },
          h('button', { class: 'btn small primary', onclick: async () => { await restoreOutreach(o); toast('Restored'); } }, 'Restore'),
          h('button', { class: 'btn small danger-outline', onclick: async () => {
            if (await confirmBox('Delete forever?', 'This note will be permanently removed.', 'Delete forever', true)) { await purgeOutreach(o); toast('Deleted'); }
          } }, 'Delete forever')));
    })) : empty('No deleted notes.'))];
}

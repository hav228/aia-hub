import { h, card, empty, toast, confirmBox } from '../ui.js';
import { S, restorePerson, purgePerson, personTeam } from '../store.js';
import { fullName } from '../logic.js';

const DAYS90 = 90 * 24 * 3600 * 1000;
let purging = false;

export function renderTrash() {
  const trashed = S.people.filter(p => p.deleted && !p.mergedInto).sort((a, b) => (b.deletedAt || 0) - (a.deletedAt || 0));
  // Auto-clean anything older than 90 days
  const old = trashed.filter(p => p.deletedAt instanceof Date && Date.now() - p.deletedAt > DAYS90);
  if (old.length && !purging) { purging = true; Promise.all(old.map(p => purgePerson(p, true))).finally(() => (purging = false)); }
  return [h('div', { class: 'page-head' }, h('a', { class: 'btn icon', href: '#/more', 'aria-label': 'Back' }, '‹'), h('h1', null, 'Trash')),
    h('p', { class: 'muted small' }, 'Deleted people stay here for 90 days. Restoring brings back everything, including their attendance.'),
    card(null, trashed.length ? h('ul', { class: 'set-list' }, trashed.map(p => {
      const left = p.deletedAt instanceof Date ? Math.max(0, Math.ceil((DAYS90 - (Date.now() - p.deletedAt)) / 86400000)) : 90;
      return h('li', null,
        h('div', null, h('strong', null, fullName(p)), h('div', { class: 'muted small' }, `${personTeam(p)} · deleted by ${p.deletedBy || '—'} · ${left} days left`)),
        h('div', { class: 'btn-row tight' },
          h('button', { class: 'btn small primary', onclick: async () => { await restorePerson(p); toast('Restored'); } }, 'Restore'),
          h('button', { class: 'btn small danger-outline', onclick: async () => {
            if (await confirmBox('Delete forever?', `This permanently removes ${fullName(p)} and their attendance. It can’t be undone.`, 'Delete forever', true)) { await purgePerson(p); toast('Deleted'); }
          } }, 'Delete forever')));
    })) : empty('Trash is empty.'))];
}

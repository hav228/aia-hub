import { ORG } from '../org.js';
import { h, card, empty, fmtDate, toast, confirmBox, modal, select, field, go } from '../ui.js';
import { S, visiblePeople, personTeam, meta, updatePerson, setArchived, trashPerson, mergePeople, removeAttendance, groups, setGroupOverride, userName, setFollowUpDone, trashOutreach, todayKey } from '../store.js';
import { CLASS_YEARS, fullName, normalizeName, findPossibleDuplicates, GROUPS, groupLabel } from '../logic.js';
import { personForm, addPersonModal, pickPerson, teamOptions, outreachModal } from './common.js';

const view = { q: '', team: '', year: '', show: 'active' };

export function renderPeople() {
  const all = visiblePeople();
  const G = groups();
  const search = h('input', { type: 'search', placeholder: 'Search names…', value: view.q, 'aria-label': 'Search people' });
  const list = h('div', { class: 'people-list' });
  const countEl = h('span', { class: 'muted' });
  const draw = () => {
    const qn = normalizeName(view.q);
    const rows = all.filter(p => view.show === 'all' || (view.show === 'archived' ? p.archived : !p.archived))
      .filter(p => !view.team || p.teamId === view.team)
      .filter(p => !view.year || p.classYear === view.year)
      .filter(p => !qn || normalizeName(fullName(p)).includes(qn) || (p.aliases || []).some(a => a.includes(qn)))
      .sort((a, b) => (a.lastName || '').localeCompare(b.lastName || '') || (a.firstName || '').localeCompare(b.firstName || ''));
    countEl.textContent = `${rows.length} ${rows.length === 1 ? 'person' : 'people'}`;
    list.replaceChildren(...(rows.length ? rows.map(p => {
      const dates = S.index.get(p.id) || [];
      return h('a', { class: 'person-row', href: `#/person/${p.id}` },
        h('div', null, h('strong', null, fullName(p)), p.sample ? h('span', { class: 'tag' }, 'Sample') : null, G.get(p.id) ? h('span', { class: `tag g-${G.get(p.id).group}` }, groupLabel(G.get(p.id).group)) : null),
        h('div', { class: 'muted small' }, `${meta(p)} · ${dates.length} week${dates.length === 1 ? '' : 's'}${dates.length ? ` · last ${fmtDate(dates[dates.length - 1], { month: 'short', day: 'numeric' })}` : ''}`));
    }) : [empty('No one matches.')]));
  };
  search.addEventListener('input', () => { view.q = search.value; draw(); });
  const teamSel = select([['', 'All teams'], ...teamOptions().slice(1)], view.team, { 'aria-label': 'Team' });
  teamSel.onchange = () => { view.team = teamSel.value; draw(); };
  const yearSel = select([['', 'All years'], ...CLASS_YEARS], view.year, { 'aria-label': 'Class year' });
  yearSel.onchange = () => { view.year = yearSel.value; draw(); };
  const showSel = select([['active', 'Active'], ['archived', 'Archived'], ['all', 'Everyone']], view.show, { 'aria-label': 'Show' });
  showSel.onchange = () => { view.show = showSel.value; draw(); };
  draw();

  const dupes = findPossibleDuplicates(all);
  return [
    h('div', { class: 'page-head' }, h('h1', null, 'People'), h('button', { class: 'btn primary', onclick: () => addPersonModal(id => go(`person/${id}`)) }, '+ Add person')),
    dupes.length ? h('button', { class: 'notice', onclick: () => dupesModal(dupes) }, `${dupes.length} possible duplicate${dupes.length > 1 ? 's' : ''} to check →`) : null,
    h('div', { class: 'filters' }, search, ORG.hasTeams ? teamSel : null, yearSel, showSel),
    h('div', { class: 'list-head' }, countEl),
    list,
  ];
}

function dupesModal(pairs) {
  const body = h('div', null, h('p', { class: 'muted small' }, 'These names look alike. If two are the same person, merge them. Their attendance is combined and nothing is lost.'),
    pairs.slice(0, 30).map(([a, b]) => h('div', { class: 'dupe-pair' },
      h('div', null, h('strong', null, fullName(a)), h('div', { class: 'muted small' }, `${meta(a)} · ${(S.index.get(a.id) || []).length} wks`)),
      h('div', null, h('strong', null, fullName(b)), h('div', { class: 'muted small' }, `${meta(b)} · ${(S.index.get(b.id) || []).length} wks`)),
      h('button', { class: 'btn small', onclick: () => mergeFlow(a, b) }, 'Merge…'))));
  modal('Possible duplicates', body);
}

export function mergeFlow(a, b) {
  // keep the one with more attendance by default
  const [keep, dupe] = (S.index.get(b.id) || []).length > (S.index.get(a.id) || []).length ? [b, a] : [a, b];
  const choice = select([[keep.id, `Keep “${fullName(keep)}”`], [dupe.id, `Keep “${fullName(dupe)}”`]], keep.id);
  modal('Merge these two?', h('div', null,
    h('p', null, `All attendance from both records will be combined into one person. The other name is remembered, so future check-ins with that spelling match automatically.`),
    field('Which name and details to keep', choice)), [
    { label: 'Cancel' },
    { label: 'Merge', kind: 'primary', onClick: async () => {
      const k = choice.value === keep.id ? keep : dupe, d = k === keep ? dupe : keep;
      await mergePeople(k, d);
      toast('Merged'); go(`person/${k.id}`);
    } },
  ]);
}

export function renderPerson(id) {
  const p = S.people.find(x => x.id === id);
  if (!p) return card(null, empty('That person wasn’t found.'), h('a', { class: 'btn', href: '#/people' }, 'Back to People'));
  if (p.mergedInto) { setTimeout(() => go(`person/${p.mergedInto}`)); return h('div', { class: 'loading' }, 'This record was merged — opening the combined one…'); }
  const form = personForm(p);
  const dates = [...(S.index.get(p.id) || [])].reverse();
  const save = h('button', { class: 'btn primary', onclick: async () => {
    if (!form.valid()) return;
    await updatePerson(p, form.read()); toast('Saved');
  } }, 'Save changes');

  return [
    h('div', { class: 'page-head' }, h('a', { class: 'btn icon', href: '#/people', 'aria-label': 'Back' }, '‹'),
      h('h1', null, fullName(p)), p.deleted ? h('span', { class: 'tag' }, 'In Trash') : p.archived ? h('span', { class: 'tag' }, p.archivedReason || 'Archived') : null),
    h('div', { class: 'grid2 person-grid' },
      card('Details', form.el, h('div', { class: 'btn-row' }, save),
        (p.aliases || []).length ? h('p', { class: 'muted small' }, `Also matches: ${p.aliases.join(', ')}`) : null),
      h('div', null,
        outreachCard(p),
        card(`Attendance (${dates.length} week${dates.length === 1 ? '' : 's'})`,
          dates.length ? dateList(p, dates) : empty('Hasn’t attended yet.')),
        card('Actions', h('div', { class: 'btn-col' },
          h('button', { class: 'btn', onclick: () => pickPerson({ title: `Merge ${fullName(p)} with…`, exclude: new Set([p.id]), allowNew: false, onPick: other => mergeFlow(p, other) }) }, 'Merge with a duplicate…'),
          p.archived
            ? h('button', { class: 'btn', onclick: async () => { await setArchived(p, false); toast('Moved back to active'); } }, 'Move back to active')
            : h('button', { class: 'btn', onclick: () => archiveModal(p) }, 'Archive (inactive or graduated)…'),
          h('button', { class: 'btn danger-outline', onclick: async () => {
            if (await confirmBox('Move to Trash?', `${fullName(p)} will be hidden everywhere. You can restore them from More → Trash for 90 days.`, 'Move to Trash', true)) {
              await trashPerson(p); toast('Moved to Trash'); go('people');
            }
          } }, 'Delete…'))),
        p.createdBy ? h('p', { class: 'muted small' }, `Added by ${p.createdBy}${p.createdAt instanceof Date ? ` on ${p.createdAt.toLocaleDateString()}` : ''}`) : null)),
  ];
}

function archiveModal(p) {
  const reason = select(['Graduated', 'Inactive'], p.classYear === 'Senior' || p.classYear === 'Grad' ? 'Graduated' : 'Inactive');
  modal(`Archive ${fullName(p)}?`, h('div', null, h('p', null, 'They’ll be hidden from active lists but all history is kept. If they check in again, they’re moved back automatically.'), field('Reason', reason)), [
    { label: 'Cancel' },
    { label: 'Archive', kind: 'primary', onClick: async () => { await setArchived(p, true, reason.value); toast('Archived'); } },
  ]);
}

function outreachCard(p) {
  const g = groups().get(p.id);
  const logs = S.outreach.filter(o => o.personId === p.id && !o.deleted).sort((a, b) => a.date < b.date ? 1 : a.date > b.date ? -1 : (b.createdAt || 0) - (a.createdAt || 0));
  const today = todayKey();
  const groupSel = select([['', `Automatic (${groupLabel(g?.auto || 'potential')})`], ...GROUPS.filter(([k]) => k !== 'inactive').map(([k, l]) => [k, `${l} (manual)`])], g?.manual ? p.groupOverride : '', { 'aria-label': 'Group' });
  groupSel.onchange = async () => { await setGroupOverride(p, groupSel.value); toast('Group updated'); };
  return card('Outreach',
    g ? h('div', { class: 'group-line' }, h('span', { class: `tag big g-${g.group}` }, groupLabel(g.group)), h('span', { class: 'muted small' }, g.manual ? ' Set manually' : ` ${g.reason}`)) : null,
    p.archived ? h('p', { class: 'muted small' }, 'Archived people stay in Inactive / graduated. Move them back to active to change the group.')
      : field('Group', groupSel, 'Leave on Automatic unless you have a reason. Manual stays until you change it back.'),
    h('div', { class: 'btn-row' }, h('button', { class: 'btn primary', onclick: () => outreachModal(p) }, '+ Log outreach')),
    logs.length ? h('ul', { class: 'log-list' }, logs.map(o => h('li', null,
      h('div', { class: 'log-head' }, h('strong', null, `${o.method}`), h('span', { class: 'muted small' }, ` · ${userName(o.by)} · ${fmtDate(o.date, { month: 'short', day: 'numeric', year: 'numeric' })}`)),
      o.notes ? h('div', { class: 'log-notes' }, o.notes) : null,
      o.nextFollowUp ? h('div', { class: 'small' }, o.followUpDone ? h('span', { class: 'muted' }, `Follow-up ${fmtDate(o.nextFollowUp)} ✓ done`)
        : h('span', { class: o.nextFollowUp < today ? 'due overdue' : 'due' }, `Follow up by ${fmtDate(o.nextFollowUp)}`),
        o.followUpDone ? null : h('button', { class: 'linkish', onclick: () => setFollowUpDone(o, true, p) }, 'mark done')) : null,
      h('div', { class: 'log-actions' },
        h('button', { class: 'linkish', onclick: () => outreachModal(p, o) }, 'Edit'),
        h('button', { class: 'linkish danger', onclick: async () => {
          if (await confirmBox('Delete this note?', 'It goes to Trash and can be restored for 90 days.', 'Delete', true)) { await trashOutreach(o, p); toast('Moved to Trash'); }
        } }, 'Delete'))))) : empty('No outreach logged yet.'));
}

function dateList(p, dates) {
  const item = k => h('li', null, h('a', { href: `#/week/${k}` }, fmtDate(k, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })),
    h('button', { class: 'icon-btn', 'aria-label': `Remove attendance on ${k}`, onclick: async () => {
      if (await confirmBox('Remove attendance?', `Remove ${fullName(p)} from ${fmtDate(k)}?`, 'Remove', true)) await removeAttendance(k, p);
    } }, '×'));
  return [h('ul', { class: 'date-list' }, dates.slice(0, 6).map(item)),
    dates.length > 6 ? h('details', null, h('summary', { class: 'small' }, `Show all ${dates.length}`), h('ul', { class: 'date-list' }, dates.slice(6).map(item))) : null];
}

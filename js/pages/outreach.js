import { ORG } from '../org.js';
import { h, card, empty, fmtDate, toast, select, go } from '../ui.js';
import { S, groups, liveOutreach, personTeam, meta, userName, todayKey, setFollowUpDone } from '../store.js';
import { GROUPS, groupLabel, followUpsDue, latestOutreach, fullName, normalizeName, addDays } from '../logic.js';
import { outreachModal, addPersonModal, teamOptions } from './common.js';

const view = { group: 'new', team: '', q: '' };
const short = k => fmtDate(k, { month: 'short', day: 'numeric' });

export function renderOutreach(groupArg) {
  if (groupArg && GROUPS.some(g => g[0] === groupArg)) view.group = groupArg;
  const today = todayKey();
  const G = groups();
  const byId = new Map(S.people.map(p => [p.id, p]));
  const out = liveOutreach();
  const latest = latestOutreach(out);

  // ---- follow-ups due this week ----
  const due = followUpsDue(out, today).filter(o => { const p = byId.get(o.personId); return p && !p.deleted && !p.mergedInto; });
  const dueCard = card(`Needs follow-up this week (${due.length})`,
    due.length ? h('ul', { class: 'fu-list' }, due.map(o => {
      const p = byId.get(o.personId), overdue = o.nextFollowUp < today;
      return h('li', { class: overdue ? 'overdue' : '' },
        h('div', { class: 'fu-main' },
          h('a', { href: `#/person/${p.id}` }, h('strong', null, fullName(p))),
          h('span', { class: 'muted small' }, ` ${meta(p)}`),
          h('div', { class: 'small' }, h('span', { class: overdue ? 'due overdue' : 'due' }, overdue ? `Overdue · was due ${short(o.nextFollowUp)}` : o.nextFollowUp === today ? 'Due today' : `Due ${short(o.nextFollowUp)}`),
            h('span', { class: 'muted' }, ` · last: ${o.method} by ${userName(o.by)} on ${short(o.date)}`)),
          o.notes ? h('div', { class: 'muted small clamp' }, o.notes) : null),
        h('div', { class: 'btn-row tight' },
          h('button', { class: 'btn small primary', onclick: () => outreachModal(p) }, 'Log'),
          h('button', { class: 'btn small', onclick: async () => { await setFollowUpDone(o, true, p); toast('Marked done'); } }, 'Done')));
    })) : empty('Nothing due. Set a “next follow-up” date when you log outreach and it shows up here.'));

  // ---- cold & nobody has reached out in 2 weeks ----
  const twoWeeksAgo = addDays(today, -14);
  const coldUntouched = [...G.entries()].filter(([pid, g]) => g.group === 'cold' && !(latest.get(pid)?.date >= twoWeeksAgo) && !due.some(o => o.personId === pid))
    .map(([pid]) => byId.get(pid)).filter(Boolean);

  // ---- groups ----
  const counts = Object.fromEntries(GROUPS.map(([k]) => [k, 0]));
  for (const g of G.values()) counts[g.group]++;
  const chips = h('div', { class: 'chips', role: 'tablist', 'aria-label': 'Groups' }, GROUPS.map(([k, label]) =>
    h('a', { role: 'tab', href: `#/outreach/${k}`, class: `chip g-${k}${k === view.group ? ' active' : ''}`, 'aria-selected': k === view.group ? 'true' : 'false' },
      label, h('span', { class: 'chip-n' }, counts[k]))));
  const desc = GROUPS.find(g => g[0] === view.group)[2];

  const listEl = h('div');
  const drawList = () => {
    const qn = normalizeName(view.q);
    const rows = [...G.entries()].filter(([, g]) => g.group === view.group).map(([pid, g]) => ({ p: byId.get(pid), g }))
      .filter(r => r.p && (!view.team || r.p.teamId === view.team) && (!qn || normalizeName(fullName(r.p)).includes(qn)));
    const teams = new Map();
    for (const r of rows) { const t = ORG.hasTeams ? personTeam(r.p) : (r.p.classYear || 'Class year unknown'); if (!teams.has(t)) teams.set(t, []); teams.get(t).push(r); }
    const yearOrder = ['Freshman', 'Sophomore', 'Junior', 'Senior', 'Grad', 'Class year unknown'];
    const sorted = [...teams.entries()].sort((a, b) => ORG.hasTeams ? (b[1].length - a[1].length || a[0].localeCompare(b[0])) : yearOrder.indexOf(a[0]) - yearOrder.indexOf(b[0]));
    listEl.replaceChildren(...(rows.length ? sorted.map(([team, rs]) => h('div', { class: 'team-group' },
      h('h3', null, `${team} `, h('span', { class: 'muted' }, `(${rs.length})`)),
      h('div', { class: 'people-list' }, rs.sort((a, b) => fullName(a.p).localeCompare(fullName(b.p))).map(({ p, g }) => {
        const l = latest.get(p.id);
        return h('div', { class: 'person-row with-action' },
          h('a', { href: `#/person/${p.id}`, class: 'row-link' },
            h('div', null, h('strong', null, fullName(p)), g.manual ? h('span', { class: 'tag', title: `Automatic group would be ${groupLabel(g.auto)}` }, 'set manually') : null),
            h('div', { class: 'muted small' }, [ORG.hasTeams ? (p.classYear || '—') : null,
              g.lastAttended ? `last came ${short(g.lastAttended)}` : 'never attended',
              g.window && g.lastAttended ? `${g.recent}/${g.window} recent` : null].filter(Boolean).join(' · ')),
            h('div', { class: 'small' + (l ? '' : ' muted') }, l ? `Last contact: ${l.method} · ${userName(l.by)} · ${short(l.date)}` : 'No outreach logged yet')),
          h('button', { class: 'btn small', onclick: () => outreachModal(p), 'aria-label': `Log outreach for ${fullName(p)}` }, 'Log'));
      })))) : [empty(view.q || view.team ? 'No one matches.' : 'No one in this group right now.')]));
  };
  const search = h('input', { type: 'search', placeholder: 'Search names…', value: view.q, 'aria-label': 'Search' });
  search.addEventListener('input', () => { view.q = search.value; drawList(); });
  const teamSel = select([['', 'All teams'], ...teamOptions().slice(1)], view.team, { 'aria-label': 'Team' });
  teamSel.onchange = () => { view.team = teamSel.value; drawList(); };
  drawList();
  setTimeout(() => { const a = chips.querySelector('.active'); if (a) chips.scrollLeft = a.offsetLeft - 16; });

  return [
    h('div', { class: 'page-head' }, h('h1', null, 'Outreach'),
      h('button', { class: 'btn primary', onclick: () => addPersonModal(id => go(`person/${id}`), 'Add a potential member') }, '+ Potential member')),
    dueCard,
    coldUntouched.length ? card(`Cold, and no one has reached out in 2 weeks (${coldUntouched.length})`,
      h('div', { class: 'chip-list' }, coldUntouched.sort((a, b) => fullName(a).localeCompare(fullName(b))).map(p =>
        h('button', { class: 'btn small', onclick: () => outreachModal(p) }, `${fullName(p)} · ${meta(p)}`)))) : null,
    chips,
    h('p', { class: 'muted small' }, desc + '.', view.group === 'inactive' ? '' : ' Groups update automatically from attendance; open a person to move them manually.'),
    h('div', { class: 'filters' }, search, ORG.hasTeams ? teamSel : null),
    listEl,
  ];
}

import { ORG } from '../org.js';
import { h, card, empty, fmtDate, fmtDateTime, toast } from '../ui.js';
import { S, personTeam, teamName, fileCheckin, discardCheckin, meta } from '../store.js';
import { fullName } from '../logic.js';
import { pickPerson } from './common.js';

export function renderReview() {
  const items = S.review;
  return [
    h('div', { class: 'page-head' }, h('h1', null, 'Review check-ins')),
    h('p', { class: 'muted' }, 'Most check-ins are filed automatically. These ones looked like they might be someone already in the list, so a leader should decide.'),
    items.length ? items.map(c => {
      const cands = (c.candidates || []).map(id => S.people.find(p => p.id === id)).filter(p => p && !p.deleted && !p.mergedInto);
      const team = !ORG.hasTeams ? '' : c.teamId === 'other' ? `Other: ${c.teamOther || ''}` : teamName(c.teamId);
      const act = (fn, msg) => async e => {
        e.target.closest('.review-item').classList.add('busy');
        try { await fn(); toast(msg); } catch (err) { console.error(err); toast(err.message, 'err'); e.target.closest('.review-item')?.classList.remove('busy'); }
      };
      return card(null, h('div', { class: 'review-item' },
        h('div', { class: 'review-who' },
          h('strong', { class: 'big' }, `${c.firstName} ${c.lastName}`),
          h('div', { class: 'muted small' }, `${[team, c.classYear].filter(Boolean).join(' · ')} · checked in ${fmtDate(c.sundayDate)}${c.submittedAt ? ` at ${fmtDateTime(c.submittedAt)}` : ''}`),
          c.phone || c.email ? h('div', { class: 'muted small' }, [c.phone, c.email].filter(Boolean).join(' · ')) : null,
          h('div', { class: 'pill muted' }, c.reason || 'Needs review')),
        h('div', { class: 'btn-col' },
          cands.map(p => h('button', { class: 'btn', onclick: act(() => fileCheckin(c.id, p.id), `Filed under ${fullName(p)}`) },
            `It’s ${fullName(p)} (${meta(p).replace(' · ', ', ')})`)),
          h('button', { class: 'btn', onclick: () => pickPerson({ title: 'Who is it?', allowNew: false, onPick: p => fileCheckin(c.id, p.id).then(() => toast(`Filed under ${fullName(p)}`)) }) }, 'Someone else…'),
          h('button', { class: 'btn primary', onclick: act(() => fileCheckin(c.id, 'new'), 'Added as a new person') }, 'It’s a new person'),
          h('button', { class: 'btn danger-outline', onclick: act(() => discardCheckin(c), 'Discarded') }, 'Discard (junk / test)'))));
    }) : card(null, empty('All caught up — nothing to review. 🙌')),
  ];
}

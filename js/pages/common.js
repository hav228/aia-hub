import { OUTREACH_METHODS, addDays as _addDays, dateKey as _dateKey } from '../logic.js';
import { logOutreach, updateOutreach, todayKey as _todayKey } from '../store.js';
import { h, field, select, modal, toast } from '../ui.js';
import { S, visiblePeople, personTeam, addPerson } from '../store.js';
import { CLASS_YEARS, fullName, normalizeName } from '../logic.js';

export function teamOptions(includeInactiveId) {
  const opts = S.teams.filter(t => t.active !== false || t.id === includeInactiveId).map(t => [t.id, t.name]);
  return [['', 'Choose a team…'], ...opts, ['other', 'Other']];
}

/** Returns {el, read(), valid()} */
export function personForm(p = {}) {
  const f = {
    firstName: h('input', { value: p.firstName || '', autocomplete: 'off', required: true }),
    lastName: h('input', { value: p.lastName || '', autocomplete: 'off', required: true }),
    classYear: select([['', 'Choose…'], ...CLASS_YEARS], p.classYear || ''),
    teamId: select(teamOptions(p.teamId), p.teamId || ''),
    teamOther: h('input', { value: p.teamOther || '', placeholder: 'Which team or sport?' }),
    phone: h('input', { value: p.phone || '', type: 'tel', autocomplete: 'off' }),
    email: h('input', { value: p.email || '', type: 'email', autocomplete: 'off' }),
    notes: h('textarea', { rows: 3 }, p.notes || ''),
  };
  const otherWrap = field('Other team', f.teamOther);
  const syncOther = () => (otherWrap.style.display = f.teamId.value === 'other' ? '' : 'none');
  f.teamId.addEventListener('change', syncOther); syncOther();
  const el = h('div', { class: 'form', 'data-form': '' },
    h('div', { class: 'row2' }, field('First name', f.firstName), field('Last name', f.lastName)),
    h('div', { class: 'row2' }, field('Class year', f.classYear), field('Team', f.teamId)),
    otherWrap,
    h('div', { class: 'row2' }, field('Phone (private)', f.phone), field('Email (private)', f.email)),
    field('Notes (private — leaders & staff only)', f.notes));
  const read = () => Object.fromEntries(Object.entries(f).map(([k, i]) => [k, i.value]));
  const valid = () => {
    const d = read();
    if (!d.firstName.trim() || !d.lastName.trim()) { toast('First and last name are required', 'err'); return false; }
    return true;
  };
  return { el, read, valid };
}

export function addPersonModal(onDone, title = 'Add a person') {
  const form = personForm();
  modal(title, h('div', null,
    h('p', { class: 'muted small' }, 'Use this for potential members (teammates, people from events) or anyone who couldn’t scan.'),
    form.el), [
    { label: 'Cancel' },
    { label: 'Save', kind: 'primary', onClick: async () => {
      if (!form.valid()) return false;
      const id = await addPerson(form.read());
      toast('Saved');
      onDone && onDone(id, form.read());
    } },
  ]);
}

/** Search-and-pick a person. onPick(person) */
export function pickPerson({ title = 'Find a person', exclude = new Set(), onPick, allowNew = true }) {
  const input = h('input', { type: 'search', placeholder: 'Type a name…', autocomplete: 'off' });
  const list = h('div', { class: 'pick-list' });
  let close;
  const draw = () => {
    const qn = normalizeName(input.value);
    const rows = visiblePeople().filter(p => !exclude.has(p.id))
      .filter(p => !qn || normalizeName(fullName(p)).includes(qn) || (p.aliases || []).some(a => a.includes(qn)))
      .sort((a, b) => fullName(a).localeCompare(fullName(b))).slice(0, 40);
    list.replaceChildren(...rows.map(p => h('button', { class: 'pick-row', type: 'button', onclick: async () => { close(); await onPick(p); } },
      h('strong', null, fullName(p)), h('span', { class: 'muted' }, ` ${personTeam(p)} · ${p.classYear || '—'}${p.archived ? ' · archived' : ''}`))),
    rows.length ? null : h('p', { class: 'empty' }, 'No one matches.'));
  };
  input.addEventListener('input', draw); draw();
  const actions = [{ label: 'Cancel' }];
  if (allowNew) actions.push({ label: '+ New person', onClick: () => { addPersonModal((id, d) => { onPick(S.people.find(x => x.id === id) || { id, ...d }); }); } });
  close = modal(title, h('div', null, input, list), actions);
}

export const statTile = (label, value, sub) => h('div', { class: 'stat' },
  h('div', { class: 'stat-value' }, value), h('div', { class: 'stat-label' }, label), sub ? h('div', { class: 'stat-sub' }, sub) : null);

export function teamBars(rows, max) {
  // Simple inline bars for small lists
  const m = max || Math.max(1, ...rows.map(r => r.checkins));
  return h('div', { class: 'mini-bars' }, rows.map(r => h('div', { class: 'mini-bar' },
    h('span', { class: 'mini-label' }, r.name),
    h('span', { class: 'mini-track' }, h('span', { class: 'mini-fill', style: `width:${Math.max(4, r.checkins / m * 100)}%` })),
    h('span', { class: 'mini-num' }, r.checkins))));
}

// ---------- outreach ----------

/** Log (or edit) an outreach note for person p. */
export function outreachModal(p, existing) {
  const today = _todayKey();
  const users = [...S.users].filter(u => u.active !== false || u.email === existing?.by).sort((a, b) => (a.name || '').localeCompare(b.name || ''));
  const me = S.user.email;
  const byOpts = users.map(u => [u.email, u.name || u.email]);
  if (!byOpts.some(o => o[0] === (existing?.by || me))) byOpts.unshift([existing?.by || me, existing?.by || S.user.name || me]);
  const by = select(byOpts, existing?.by || me);
  const date = h('input', { type: 'date', value: existing?.date || today, max: _addDays(today, 1) });
  const method = select(OUTREACH_METHODS, existing?.method || 'Text');
  const notes = h('textarea', { rows: 4, placeholder: 'How are they doing? Prayer requests, what you talked about, next step…' }, existing?.notes || '');
  const fu = h('input', { type: 'date', value: existing?.nextFollowUp || '' });
  const quick = (label, days) => h('button', { class: 'btn small', type: 'button', onclick: () => (fu.value = days == null ? '' : _addDays(today, days)) }, label);
  modal(existing ? 'Edit outreach' : `Reach out to ${fullName(p)}`, h('div', { class: 'form' },
    h('div', { class: 'row2' }, field('Who reached out', by), field('Date', date)),
    field('How', method),
    field('Notes (private)', notes),
    field('Next follow-up', fu),
    h('div', { class: 'btn-row tight wrap' }, quick('In 3 days', 3), quick('In 1 week', 7), quick('In 2 weeks', 14), quick('None', null)),
    existing ? null : h('p', { class: 'muted small' }, 'Saving this marks any earlier open follow-ups for this person as done.')), [
    { label: 'Cancel' },
    { label: 'Save', kind: 'primary', onClick: async () => {
      if (!date.value) { toast('Pick a date', 'err'); return false; }
      const d = { by: by.value, date: date.value, method: method.value, notes: notes.value, nextFollowUp: fu.value };
      if (existing) await updateOutreach(existing, d, p); else await logOutreach(p, d);
      toast('Saved');
    } },
  ]);
}

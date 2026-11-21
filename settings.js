import { h, card, empty, fmtDate, toast, confirmBox, modal, select, field, downloadFile } from '../ui.js';
import * as fb from '../fb.js';
import {
  S, liveSemesters, saveSettings, saveSemester, deleteSemester, restoreSemester, saveTeam, saveUser, removeUser, fullBackup,
} from '../store.js';
import { DEFAULT_SETTINGS, schoolYearOf, schoolYearLabel, sundaysBetween } from '../logic.js';
import { OWNER_EMAIL } from '../firebase-config.js';

export function renderMore() {
  const link = (href, title, sub) => h('a', { class: 'more-link', href }, h('strong', null, title), h('span', { class: 'muted small' }, sub));
  return [h('h1', null, 'More'),
    card(null,
      link('#/settings', 'Settings', 'Semesters, teams, leader logins, check-in times, thresholds'),
      link('#/activity', 'Activity log', 'Who changed what, and when'),
      link('#/trash', 'Trash', 'Restore anything deleted in the last 90 days')),
    card('Coming in later phases', h('p', { class: 'muted' }, 'Outreach · Schedules · Study plans')),
    card(null, h('p', { class: 'muted small' }, `Signed in as ${S.user.email}`),
      h('button', { class: 'btn', onclick: () => fb.signOut() }, 'Sign out'))];
}

export function renderSettings() {
  return [h('div', { class: 'page-head' }, h('a', { class: 'btn icon', href: '#/more', 'aria-label': 'Back' }, '‹'), h('h1', null, 'Settings')),
    semestersCard(), usersCard(), checkinCard(), thresholdsCard(), teamsCard(), backupCard()];
}

// ---------- semesters ----------
function semestersCard() {
  const sems = liveSemesters().reverse();
  const removed = S.semesters.filter(s => s.deleted);
  return card('Semesters',
    h('p', { class: 'muted small' }, 'A check-in QR code is created for every Sunday between the start and end dates. Mark break weeks as “No study” on the This Week page.'),
    sems.length ? h('ul', { class: 'set-list' }, sems.map(s => h('li', null,
      h('div', null, h('strong', null, s.name), h('div', { class: 'muted small' }, `${fmtDate(s.startDate)} – ${fmtDate(s.endDate, { month: 'short', day: 'numeric', year: 'numeric' })} · ${sundaysBetween(s.startDate, s.endDate).length} Sundays`)),
      h('button', { class: 'btn small', onclick: () => semesterModal(s) }, 'Edit')))) : empty('No semesters yet — add your current one.'),
    h('button', { class: 'btn primary', onclick: () => semesterModal() }, '+ Add semester'),
    removed.length ? h('details', null, h('summary', { class: 'muted small' }, `Removed semesters (${removed.length})`),
      removed.map(s => h('div', { class: 'row-between' }, s.name, h('button', { class: 'btn small', onclick: () => restoreSemester(s) }, 'Restore')))) : null);
}

function semesterModal(sem) {
  const now = new Date();
  const term = select(['Fall', 'Spring'], sem?.term || (now.getMonth() >= 6 ? 'Fall' : 'Spring'));
  const year = h('input', { type: 'number', value: sem?.year || now.getFullYear(), min: 2020, max: 2100 });
  const start = h('input', { type: 'date', value: sem?.startDate || '' });
  const end = h('input', { type: 'date', value: sem?.endDate || '' });
  const actions = [{ label: 'Cancel' }];
  if (sem) actions.push({ label: 'Remove', kind: 'danger-outline', onClick: async () => {
    if (!(await confirmBox('Remove this semester?', 'Its Sundays and attendance are kept, and you can restore it below the semester list.', 'Remove', true))) return false;
    await deleteSemester(sem); toast('Removed');
  } });
  actions.push({ label: 'Save', kind: 'primary', onClick: async () => {
    if (!start.value || !end.value || start.value >= end.value) { toast('Pick a start date before the end date', 'err'); return false; }
    const y = Number(year.value);
    const overlap = liveSemesters().find(s => s.id !== sem?.id && s.startDate <= end.value && s.endDate >= start.value);
    if (overlap) { toast(`Those dates overlap ${overlap.name}`, 'err'); return false; }
    await saveSemester(sem, { name: `${term.value} ${y}`, term: term.value, year: y, startDate: start.value, endDate: end.value, schoolYear: schoolYearLabel(schoolYearOf(start.value)) });
    toast('Saved — Sundays created');
  } });
  modal(sem ? `Edit ${sem.name}` : 'Add a semester', h('div', { class: 'form' },
    h('div', { class: 'row2' }, field('Term', term), field('Year', year)),
    h('div', { class: 'row2' }, field('First day', start), field('Last day', end)),
    h('p', { class: 'muted small' }, 'Tip: use the first and last day of classes or finals — only Sundays in between matter.')), actions);
}

// ---------- leader / staff logins ----------
function usersCard() {
  const users = [...S.users].sort((a, b) => (a.role || '').localeCompare(b.role || '') || (a.name || '').localeCompare(b.name || ''));
  return card('Leaders & staff (who can sign in)',
    h('p', { class: 'muted small' }, 'Only these Google accounts can sign in. Everyone on the list can view and edit everything.'),
    h('ul', { class: 'set-list' }, users.map(u => h('li', null,
      h('div', null, h('strong', null, u.name || u.email), u.active === false ? h('span', { class: 'tag' }, 'Paused') : null,
        h('div', { class: 'muted small' }, `${u.role || 'Leader'} · ${u.email}${u.email === OWNER_EMAIL ? ' · owner' : ''}`)),
      u.email === OWNER_EMAIL ? null : h('button', { class: 'btn small', onclick: () => userModal(u) }, 'Edit')))),
    h('button', { class: 'btn primary', onclick: () => userModal() }, '+ Add leader or staff'));
}

function userModal(u) {
  const name = h('input', { value: u?.name || '' });
  const email = h('input', { type: 'email', value: u?.email || '', disabled: !!u, placeholder: 'abc123@lehigh.edu' });
  const role = select(['Leader', 'Staff'], u?.role || 'Leader');
  const active = h('input', { type: 'checkbox', checked: u ? u.active !== false : true });
  const actions = [{ label: 'Cancel' }];
  if (u) actions.push({ label: 'Remove access', kind: 'danger-outline', onClick: async () => {
    if (!(await confirmBox('Remove access?', `${u.name || u.email} won’t be able to sign in. Nothing they entered is deleted.`, 'Remove', true))) return false;
    await removeUser(u); toast('Access removed');
  } });
  actions.push({ label: 'Save', kind: 'primary', onClick: async () => {
    if (!name.value.trim() || !/^\S+@\S+\.\S+$/.test(email.value.trim())) { toast('Name and a valid email are required', 'err'); return false; }
    if (!u && S.users.some(x => x.email === email.value.trim().toLowerCase())) { toast('That email is already on the list', 'err'); return false; }
    await saveUser({ name: name.value, email: email.value, role: role.value, active: active.checked }, u); toast('Saved');
  } });
  modal(u ? 'Edit access' : 'Add leader or staff', h('div', { class: 'form' },
    field('Name', name), field('Google email they sign in with', email, 'Use the exact Google account (Lehigh email or Gmail).'),
    field('Role', role), h('label', { class: 'check' }, active, ' Can sign in')), actions);
}

// ---------- check-in window ----------
function checkinCard() {
  const s = S.settings;
  const open = h('input', { type: 'time', value: s.checkinOpen });
  const close = h('input', { type: 'time', value: s.checkinClose });
  return card('Check-in times',
    h('p', { class: 'muted small' }, 'Each week’s QR code only accepts check-ins during this window. If the close time is earlier than the open time, it means Monday morning.'),
    h('div', { class: 'row2' }, field('Opens Sunday at', open), field('Closes at', close)),
    h('button', { class: 'btn primary', onclick: async () => { await saveSettings({ checkinOpen: open.value, checkinClose: close.value }); toast('Saved — upcoming Sundays updated'); } }, 'Save times'));
}

// ---------- thresholds ----------
function thresholdsCard() {
  const s = S.settings;
  const num = (k, min, max) => h('input', { type: 'number', min, max, value: s[k], 'data-k': k, class: 'small-num' });
  const inputs = {
    inconsistentPct: num('inconsistentPct', 5, 100), dropRecentWeeks: num('dropRecentWeeks', 2, 12),
    regularPct: num('regularPct', 10, 100), regularWindowWeeks: num('regularWindowWeeks', 2, 20),
    newWindowWeeks: num('newWindowWeeks', 1, 12), coldMissedWeeks: num('coldMissedWeeks', 1, 12),
    staffCount: h('input', { type: 'number', min: 0, value: s.staffCount, class: 'small-num' }),
    typicalAttendance: h('input', { type: 'number', min: 0, value: s.typicalAttendance, class: 'small-num' }),
  };
  const line = (...parts) => h('p', { class: 'inline-field' }, parts);
  return card('Report & outreach rules',
    h('h3', null, 'Reports'),
    line('Flag weeks more than ', inputs.inconsistentPct, '% above or below the average as “inconsistent”.'),
    line('“Attendance dropping” looks at the last ', inputs.dropRecentWeeks, ' studies.'),
    h('h3', null, 'Outreach groups (used in Phase 2)'),
    line('Regular: came to at least ', inputs.regularPct, '% of studies in the last ', inputs.regularWindowWeeks, ' weeks.'),
    line('New: first came within the last ', inputs.newWindowWeeks, ' weeks.'),
    line('Cold: missed the last ', inputs.coldMissedWeeks, ' or more studies in a row.'),
    h('h3', null, 'About the group'),
    line('AIA staff: ', inputs.staffCount, ' · Typical attendance: ', inputs.typicalAttendance),
    h('div', { class: 'btn-row' },
      h('button', { class: 'btn primary', onclick: async () => {
        const patch = {};
        for (const [k, i] of Object.entries(inputs)) patch[k] = i.value === '' ? '' : Number(i.value);
        await saveSettings(patch); toast('Saved');
      } }, 'Save rules'),
      h('button', { class: 'btn', onclick: async () => {
        const { checkinOpen, checkinClose, staffCount, typicalAttendance, ...rules } = DEFAULT_SETTINGS;
        await saveSettings(rules); toast('Back to defaults');
      } }, 'Reset to defaults')));
}

// ---------- teams ----------
function teamsCard() {
  return card('Teams',
    h('p', { class: 'muted small' }, 'This is the dropdown on the check-in form (“Other” is always included). Hidden teams stay in old reports.'),
    h('ul', { class: 'set-list' }, S.teams.map(t => h('li', null,
      h('div', null, h('strong', null, t.name), t.active === false ? h('span', { class: 'tag' }, 'Hidden') : null),
      h('div', { class: 'btn-row tight' },
        h('button', { class: 'btn small', onclick: () => teamModal(t) }, 'Rename'),
        h('button', { class: 'btn small', onclick: () => saveTeam(t, { active: t.active === false }) }, t.active === false ? 'Show' : 'Hide'))))),
    h('button', { class: 'btn primary', onclick: () => teamModal() }, '+ Add team'));
}
function teamModal(t) {
  const name = h('input', { value: t?.name || '' });
  modal(t ? 'Rename team' : 'Add team', field('Team name', name), [{ label: 'Cancel' }, { label: 'Save', kind: 'primary', onClick: async () => {
    if (!name.value.trim()) return false;
    await saveTeam(t, { name: name.value.trim() }); toast('Saved');
  } }]);
}

// ---------- backup ----------
function backupCard() {
  return card('Backups',
    h('p', { class: 'muted small' }, 'Deleted people go to Trash for 90 days, and every change is in the Activity log. For extra safety, download a full backup once a month or so and keep it in Google Drive.'),
    h('button', { class: 'btn', onclick: async e => {
      e.target.disabled = true; e.target.textContent = 'Preparing…';
      try {
        const data = await fullBackup();
        downloadFile(`AIA-backup-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify(data, null, 1), 'application/json');
      } finally { e.target.disabled = false; e.target.textContent = 'Download full backup'; }
    } }, 'Download full backup'));
}

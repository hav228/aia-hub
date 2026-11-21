// Live copy of the database + every action that changes it (each one is logged).
import * as fb from './fb.js';
import { NOW, DELETE } from './fb.js';
import {
  DEFAULT_SETTINGS, LEHIGH_TEAMS, sundaysBetween, checkinWindow, matchCheckin, normalizeName, tidyName,
  fullName, personKey, randomToken, attendanceIndex, dateKey, activePeople, computeGroups, groupLabel,
} from './logic.js';
import { OWNER_EMAIL } from './firebase-config.js';
import { ORG, ORGS, useOrg } from './org.js';

export const S = {
  user: null, me: null,
  settings: { ...DEFAULT_SETTINGS }, semesters: [], teams: [], users: [], people: [], sundays: [],
  pending: [], review: [], outreach: [], schedules: [], exceptions: [],
  loaded: new Set(), ready: false, index: new Map(),
};
const listeners = new Set();
export const onChange = f => (listeners.add(f), () => listeners.delete(f));
const emit = () => listeners.forEach(f => f());
let unsubs = [];

export const todayKey = () => dateKey(new Date());
export const peopleById = () => new Map(S.people.map(p => [p.id, p]));
export const teamName = id => id === 'other' ? 'Other' : (S.teams.find(t => t.id === id)?.name || 'Unknown');
export const personTeam = p => !ORG.hasTeams ? '' : p.teamId === 'other' ? (p.teamOther ? `Other: ${p.teamOther}` : 'Other') : teamName(p.teamId);
/** "Team · Class year" (just class year for ministries without teams) */
export const meta = p => [personTeam(p), p.classYear || '—'].filter(Boolean).join(' · ');
export const visiblePeople = () => activePeople(S.people);
export const sundayByDate = k => S.sundays.find(s => s.date === k);
export const semesterFor = k => S.semesters.find(s => !s.deleted && s.startDate <= k && s.endDate >= k);
let groupsMemo = { key: null, value: null };
/** Outreach group for every active person (cached until data changes). */
export function groups() {
  const key = [S.people, S.sundays, S.settings, todayKey()];
  if (!groupsMemo.key || groupsMemo.key.some((v, i) => v !== key[i]))
    groupsMemo = { key, value: computeGroups({ people: S.people, sundays: S.sundays, settings: S.settings, todayKey: todayKey(), index: S.index }) };
  return groupsMemo.value;
}
export const liveOutreach = () => S.outreach.filter(o => !o.deleted);
export const userName = email => S.users.find(u => u.email === email)?.name || email || '';
export const liveSemesters = () => S.semesters.filter(s => !s.deleted).sort((a, b) => a.startDate < b.startDate ? -1 : 1);

// ---------- access ----------
/** Works out which ministries this person can use (AIA, Cru, or both). */
export async function checkAccess(user) {
  S.user = user; S.access = {};
  const owner = user.email === OWNER_EMAIL;
  for (const o of Object.values(ORGS)) {
    const path = `/${o.prefix}users/${user.email}`;
    try {
      let me = await fb.getOne(path);
      if (!me && owner) {
        me = { email: user.email, name: user.name, role: 'Leader', active: true, addedBy: 'setup', addedAt: NOW };
        await fb.setOne(path, me);
      }
      if (me && (me.active || owner)) S.access[o.key] = { ...me, owner };
    } catch (e) { /* permission denied = not on that ministry's list */ }
  }
  return Object.keys(S.access).length > 0;
}
export const orgChoices = () => Object.values(ORGS).filter(o => S.access?.[o.key]);

/** Switch the whole app to one ministry's data. */
export function switchOrg(key) {
  if (!S.access[key]) key = Object.keys(S.access)[0];
  useOrg(key); fb.setPrefix(ORG.prefix); S.me = S.access[key];
  try { localStorage.setItem('hub-org', key); } catch { /* ignore */ }
  stop();
  Object.assign(S, { settings: { ...DEFAULT_SETTINGS }, semesters: [], teams: [], users: [], people: [], sundays: [], pending: [], review: [],
    outreach: [], schedules: [], exceptions: [], index: new Map() });
  commentWatch.unsub?.(); commentWatch = { k: null, unsub: null }; comments.k = null; comments.list = [];
  start();
}
export function preferredOrg() { try { return localStorage.getItem('hub-org') || 'aia'; } catch { return 'aia'; } }

// ---------- live data ----------
export function start() {
  stop();
  const mark = name => { S.loaded.add(name); if (!S.ready && ['settings', 'semesters', 'teams', 'people', 'sundays'].every(n => S.loaded.has(n))) { S.ready = true; firstLoad(); } emit(); };
  unsubs.push(fb.watchDoc('settings/app', d => { S.settings = { ...DEFAULT_SETTINGS, ...(d || {}) }; mark('settings'); }));
  unsubs.push(fb.watch('semesters', {}, d => { S.semesters = d; mark('semesters'); if (S.ready) ensureSundays(); }));
  unsubs.push(fb.watch('teams', {}, d => { S.teams = d.sort((a, b) => (a.sortOrder ?? 999) - (b.sortOrder ?? 999) || a.name.localeCompare(b.name)); mark('teams'); }));
  unsubs.push(fb.watch('users', {}, d => { S.users = d; mark('users'); }));
  unsubs.push(fb.watch('people', {}, d => { S.people = d; mark('people'); }));
  unsubs.push(fb.watch('sundays', {}, d => {
    S.sundays = d.map(s => ({ ...s, date: s.id, attendees: s.attendees || {} }));
    S.index = attendanceIndex(S.sundays); mark('sundays');
  }));
  unsubs.push(fb.watch('schedules', {}, d => { S.schedules = d; mark('schedules'); }));
  unsubs.push(fb.watch('scheduleExceptions', {}, d => { S.exceptions = d; mark('exceptions'); }));
  unsubs.push(fb.watch('outreach', {}, d => { S.outreach = d; mark('outreach'); }));
  unsubs.push(fb.watch('checkins', { where: [['status', 'in', ['pending', 'review']]] }, d => {
    S.pending = d.filter(c => c.status === 'pending');
    S.review = d.filter(c => c.status === 'review').sort((a, b) => (a.submittedAt || 0) - (b.submittedAt || 0));
    mark('checkins'); processPending();
  }));
}
export function stop() { unsubs.forEach(u => u()); unsubs = []; S.loaded.clear(); S.ready = false; }

async function firstLoad() {
  if (ORG.hasTeams && !S.teams.length) await seedTeams();
  await ensureSundays();
  processPending();
}

export async function seedTeams() {
  await fb.batchWrite(LEHIGH_TEAMS.map((name, i) => ({ type: 'set', path: `teams/${fb.newId('teams')}`, data: { name, active: true, sortOrder: i } })));
}

let ensuring = false;
export async function ensureSundays() {
  if (ensuring) return; ensuring = true;
  const org = ORG.key;
  try {
    for (const sem of liveSemesters()) {
      for (const k of sundaysBetween(sem.startDate, sem.endDate, ORG.day)) {
        if (ORG.key !== org) return;
        const existing = sundayByDate(k);
        if (existing) {
          if (existing.semesterId !== sem.id) await fb.updateOne(`sundays/${k}`, { semesterId: sem.id });
          continue;
        }
        await fb.transact(async t => {
          if (await t.get(`sundays/${k}`)) return;
          const w = checkinWindow(k, S.settings);
          t.set(`sundays/${k}`, { semesterId: sem.id, status: 'scheduled', checkinToken: randomToken(), checkinOpensAt: w.opensAt, checkinClosesAt: w.closesAt, attendees: {}, createdAt: NOW });
        });
      }
    }
  } catch (e) { console.error('ensureSundays', e); }
  finally { ensuring = false; if (ORG.key !== org && S.ready) ensureSundays(); }
}

// ---------- activity log ----------
export function log(action, summary, details = {}) {
  return fb.addOne('activity', { action, summary, ...details, by: S.user?.email || '', byName: S.user?.name || '', at: NOW })
    .catch(e => console.error('log failed', e));
}
function diff(before, after) {
  const ch = {};
  for (const k of Object.keys(after)) {
    const a = before?.[k] ?? '', b = after[k] ?? '';
    if (JSON.stringify(a) !== JSON.stringify(b)) ch[k] = { from: a, to: b };
  }
  return ch;
}

// ---------- check-in processing ----------
let processing = false;
export async function processPending() {
  if (processing || !S.ready) return; processing = true;
  const org = ORG.key;
  try {
    for (const c of [...S.pending]) { if (ORG.key !== org) break; await fileCheckin(c.id).catch(e => console.error('file checkin', e)); }
  } finally { processing = false; if (ORG.key !== org) processPending(); }
}

function personFromCheckin(c) {
  const firstName = tidyName(c.firstName), lastName = tidyName(c.lastName);
  return {
    firstName, lastName, nameKey: normalizeName(`${firstName} ${lastName}`), aliases: [],
    classYear: c.classYear, teamId: c.teamId || '', teamOther: c.teamOther || '',
    phone: c.phone || '', email: c.email || '', notes: '', source: 'checkin',
    archived: false, deleted: false, createdAt: NOW, createdBy: 'check-in form',
  };
}

/** forcePid: a person id, 'new', or undefined (= auto-match) */
export async function fileCheckin(checkinId, forcePid) {
  let createdPerson = null;
  await fb.transact(async t => {
    const c = await t.get(`checkins/${checkinId}`);
    if (!c || (forcePid === undefined ? c.status !== 'pending' : !['pending', 'review'].includes(c.status))) return;
    const sun = await t.get(`sundays/${c.sundayDate}`);
    let pid, person;
    if (forcePid === undefined) {
      const m = matchCheckin(c, S.people);
      if (m.type === 'review') {
        t.update(`checkins/${checkinId}`, { status: 'review', reason: m.reason, candidates: m.candidates.map(p => p.id), processedAt: NOW });
        return;
      }
      if (m.type === 'exact') { pid = m.person.id; person = m.person; }
    } else if (forcePid !== 'new') { pid = forcePid; person = S.people.find(p => p.id === pid); }

    if (!pid) {
      pid = fb.newId('people');
      createdPerson = { id: pid, ...personFromCheckin(c), createdAt: new Date() };
      t.set(`people/${pid}`, personFromCheckin(c));
    } else if (person) {
      const upd = {};
      if (c.phone && !person.phone) upd.phone = c.phone;
      if (c.email && !person.email) upd.email = c.email;
      if (c.classYear && c.classYear !== person.classYear) upd.classYear = c.classYear;
      if (person.archived) upd.archived = false;
      if (forcePid !== undefined) { // a leader confirmed this match: remember the spelling
        const key = normalizeName(`${c.firstName} ${c.lastName}`);
        if (key !== (person.nameKey || personKey(person)) && !(person.aliases || []).includes(key)) upd.aliases = [...(person.aliases || []), key];
      }
      if (Object.keys(upd).length) t.update(`people/${pid}`, upd);
    }
    if (!sun) { t.update(`checkins/${checkinId}`, { status: 'review', reason: 'That Sunday no longer exists', processedAt: NOW }); return; }
    if (sun.attendees?.[pid]) {
      t.update(`checkins/${checkinId}`, { status: 'duplicate', personId: pid, processedAt: NOW });
    } else {
      t.update(`sundays/${c.sundayDate}`, { [`attendees.${pid}`]: { teamId: c.teamId || '', teamOther: c.teamOther || '', classYear: c.classYear, source: 'qr', checkinId, at: NOW } });
      t.update(`checkins/${checkinId}`, { status: 'matched', personId: pid, processedAt: NOW });
    }
  });
  if (createdPerson && !S.people.some(p => p.id === createdPerson.id)) S.people = [...S.people, createdPerson];
  if (forcePid !== undefined) log('review', `Resolved check-in (${forcePid === 'new' ? 'new person' : 'matched'})`, { refId: checkinId });
}

export async function discardCheckin(c) {
  await fb.updateOne(`checkins/${c.id}`, { status: 'discarded', processedAt: NOW, discardedBy: S.user.email });
  log('review', `Discarded check-in from "${c.firstName} ${c.lastName}" (${c.sundayDate})`, { refId: c.id });
}

// ---------- people ----------
export function cleanPersonInput(d) {
  const firstName = tidyName(d.firstName), lastName = tidyName(d.lastName);
  return {
    firstName, lastName, nameKey: normalizeName(`${firstName} ${lastName}`),
    classYear: d.classYear || '', teamId: d.teamId || '', teamOther: d.teamId === 'other' ? (d.teamOther || '').trim() : '',
    phone: (d.phone || '').trim(), email: (d.email || '').trim(), notes: d.notes || '',
  };
}
export async function addPerson(d, source = 'manual') {
  const data = { ...cleanPersonInput(d), aliases: [], source, archived: false, deleted: false, createdAt: NOW, createdBy: S.user.email };
  const id = await fb.addOne('people', data);
  log('create', `Added ${fullName(data)}`, { kind: 'person', refId: id });
  return id;
}
export async function updatePerson(p, d) {
  const data = cleanPersonInput(d);
  const changes = diff(p, data);
  if (!Object.keys(changes).length) return;
  await fb.updateOne(`people/${p.id}`, { ...data, updatedAt: NOW, updatedBy: S.user.email });
  log('edit', `Edited ${fullName(data)}`, { kind: 'person', refId: p.id, changes });
}
export async function setArchived(p, archived, reason = '') {
  await fb.updateOne(`people/${p.id}`, { archived, archivedReason: archived ? reason : '', archivedAt: archived ? NOW : DELETE });
  log(archived ? 'archive' : 'unarchive', `${archived ? 'Archived' : 'Restored from archive'}: ${fullName(p)}${reason ? ` (${reason})` : ''}`, { kind: 'person', refId: p.id });
}
export async function trashPerson(p) {
  await fb.updateOne(`people/${p.id}`, { deleted: true, deletedAt: NOW, deletedBy: S.user.email });
  log('delete', `Moved ${fullName(p)} to Trash`, { kind: 'person', refId: p.id });
}
export async function restorePerson(p) {
  await fb.updateOne(`people/${p.id}`, { deleted: false, deletedAt: DELETE, deletedBy: DELETE });
  log('restore', `Restored ${fullName(p)} from Trash`, { kind: 'person', refId: p.id });
}
export async function purgePerson(p, auto = false) {
  const ops = S.sundays.filter(s => s.attendees[p.id]).map(s => ({ type: 'update', path: `sundays/${s.date}`, data: { [`attendees.${p.id}`]: DELETE } }));
  ops.push({ type: 'delete', path: `people/${p.id}` });
  for (const o of S.outreach.filter(o => o.personId === p.id)) ops.push({ type: 'delete', path: `outreach/${o.id}` });
  await fb.batchWrite(ops);
  log('purge', `${auto ? 'Auto-removed (90 days in Trash)' : 'Permanently deleted'}: ${fullName(p)}`, { kind: 'person', refId: p.id, snapshot: JSON.parse(JSON.stringify(p)) });
}

/** Merge `dupe` into `keep`. Attendance, check-ins and outreach move over; dupe is kept as a hidden record. */
export async function mergePeople(keep, dupe) {
  const ops = [];
  for (const s of S.sundays) {
    const e = s.attendees[dupe.id];
    if (!e) continue;
    const data = { [`attendees.${dupe.id}`]: DELETE };
    if (!s.attendees[keep.id]) data[`attendees.${keep.id}`] = e;
    ops.push({ type: 'update', path: `sundays/${s.date}`, data });
  }
  const aliases = new Set([...(keep.aliases || []), ...(dupe.aliases || []), dupe.nameKey || personKey(dupe)]);
  aliases.delete(keep.nameKey || personKey(keep));
  const fill = {};
  for (const f of ['phone', 'email', 'classYear', 'teamId', 'teamOther']) if (!keep[f] && dupe[f]) fill[f] = dupe[f];
  if (dupe.notes) fill.notes = [keep.notes, dupe.notes].filter(Boolean).join('\n');
  ops.push({ type: 'update', path: `people/${keep.id}`, data: { aliases: [...aliases], ...fill, updatedAt: NOW } });
  ops.push({ type: 'update', path: `people/${dupe.id}`, data: { mergedInto: keep.id, mergedAt: NOW, mergedBy: S.user.email } });
  for (const coll of ['checkins', 'outreach']) {
    const rows = await fb.getMany(coll, { where: [['personId', '==', dupe.id]] }).catch(() => []);
    for (const r of rows) ops.push({ type: 'update', path: `${coll}/${r.id}`, data: { personId: keep.id } });
  }
  await fb.batchWrite(ops);
  log('merge', `Merged "${fullName(dupe)}" into ${fullName(keep)}`, { kind: 'person', refId: keep.id, mergedId: dupe.id });
}

// ---------- outreach ----------
export async function setGroupOverride(p, group) {
  await fb.updateOne(`people/${p.id}`, { groupOverride: group || DELETE, groupOverrideBy: group ? S.user.email : DELETE, groupOverrideAt: group ? NOW : DELETE });
  log('group', group ? `Moved ${fullName(p)} to ${groupLabel(group)} (manual)` : `Set ${fullName(p)} back to automatic group`, { kind: 'person', refId: p.id });
}
const cleanOutreach = d => ({
  by: d.by || S.user.email, date: d.date, method: d.method, notes: (d.notes || '').trim(),
  nextFollowUp: d.nextFollowUp || '',
});
/** Logging new outreach also closes that person's earlier open follow-ups. */
export async function logOutreach(p, d) {
  const id = fb.newId('outreach');
  const ops = [{ type: 'set', path: `outreach/${id}`, data: { personId: p.id, ...cleanOutreach(d), followUpDone: false, deleted: false, createdAt: NOW, createdBy: S.user.email } }];
  for (const o of S.outreach) if (o.personId === p.id && !o.deleted && o.nextFollowUp && !o.followUpDone)
    ops.push({ type: 'update', path: `outreach/${o.id}`, data: { followUpDone: true, followUpDoneAt: NOW, followUpDoneBy: S.user.email } });
  await fb.batchWrite(ops);
  log('outreach', `${userName(d.by)} — ${d.method} with ${fullName(p)}`, { kind: 'outreach', refId: id, personId: p.id });
}
export async function updateOutreach(o, d, p) {
  const data = cleanOutreach(d);
  await fb.updateOne(`outreach/${o.id}`, { ...data, updatedAt: NOW, updatedBy: S.user.email });
  log('edit', `Edited outreach note for ${p ? fullName(p) : 'someone'}`, { kind: 'outreach', refId: o.id, changes: diff(o, data) });
}
export async function setFollowUpDone(o, done, p) {
  await fb.updateOne(`outreach/${o.id}`, { followUpDone: done, followUpDoneAt: done ? NOW : DELETE, followUpDoneBy: done ? S.user.email : DELETE });
  log('outreach', `${done ? 'Finished' : 'Reopened'} follow-up with ${p ? fullName(p) : 'someone'}`, { kind: 'outreach', refId: o.id });
}
export async function trashOutreach(o, p) {
  await fb.updateOne(`outreach/${o.id}`, { deleted: true, deletedAt: NOW, deletedBy: S.user.email });
  log('delete', `Deleted an outreach note for ${p ? fullName(p) : 'someone'}`, { kind: 'outreach', refId: o.id });
}
export async function restoreOutreach(o) {
  await fb.updateOne(`outreach/${o.id}`, { deleted: false, deletedAt: DELETE, deletedBy: DELETE });
  log('restore', 'Restored an outreach note', { kind: 'outreach', refId: o.id });
}
export async function purgeOutreach(o) {
  await fb.removeOne(`outreach/${o.id}`);
  log('purge', 'Permanently deleted an outreach note', { kind: 'outreach', refId: o.id, snapshot: JSON.parse(JSON.stringify(o)) });
}

// ---------- schedules ----------
export const scheduleId = (semId, email) => `${semId}__${email}`;
export const scheduleFor = (semId, email) => S.schedules.find(x => x.id === scheduleId(semId, email));
export const exceptionsFor = email => S.exceptions.filter(x => x.userEmail === email && !x.deleted);
export const activeUsers = () => S.users.filter(u => u.active !== false).sort((a, b) => (a.name || a.email).localeCompare(b.name || b.email));
const blockText = b => `${b.label || b.category} (${b.days.map(d => ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][d]).join('/')} ${b.start}–${b.end})`;

export async function saveBlock(semId, email, block, isNew) {
  const cur = scheduleFor(semId, email)?.blocks || [];
  const blocks = isNew ? [...cur, block] : cur.map(b => b.id === block.id ? block : b);
  await fb.setOne(`schedules/${scheduleId(semId, email)}`, { semesterId: semId, userEmail: email, blocks, updatedAt: NOW, updatedBy: S.user.email }, true);
  log(isNew ? 'schedule' : 'edit', `${isNew ? 'Added' : 'Edited'} ${blockText(block)} on ${userName(email)}'s schedule`, { kind: 'schedule', refId: scheduleId(semId, email) });
}
export async function deleteBlock(semId, email, block) {
  const blocks = (scheduleFor(semId, email)?.blocks || []).filter(b => b.id !== block.id);
  await fb.setOne(`schedules/${scheduleId(semId, email)}`, { blocks, updatedAt: NOW, updatedBy: S.user.email }, true);
  log('delete', `Removed ${blockText(block)} from ${userName(email)}'s schedule`, { kind: 'schedule', refId: scheduleId(semId, email), snapshot: block });
}
export async function copySchedule(fromSemId, toSemId, email) {
  const src = scheduleFor(fromSemId, email)?.blocks || [];
  const cur = scheduleFor(toSemId, email)?.blocks || [];
  const blocks = [...cur, ...src.map(b => ({ ...b, id: fb.newId('x') }))];
  await fb.setOne(`schedules/${scheduleId(toSemId, email)}`, { semesterId: toSemId, userEmail: email, blocks, updatedAt: NOW, updatedBy: S.user.email }, true);
  log('schedule', `Copied ${src.length} items into ${userName(email)}'s schedule from another semester`, { kind: 'schedule', refId: scheduleId(toSemId, email) });
}
export async function saveException(x, d) {
  if (x) { await fb.updateOne(`scheduleExceptions/${x.id}`, { ...d, updatedAt: NOW, updatedBy: S.user.email }); log('edit', `Edited one-time change "${d.label}" for ${userName(x.userEmail)}`, { kind: 'exception', refId: x.id, changes: diff(x, d) }); }
  else { const id = await fb.addOne('scheduleExceptions', { ...d, deleted: false, createdAt: NOW, createdBy: S.user.email }); log('schedule', `Added one-time change "${d.label}" for ${userName(d.userEmail)}`, { kind: 'exception', refId: id }); }
}
export async function trashException(x) {
  await fb.updateOne(`scheduleExceptions/${x.id}`, { deleted: true, deletedAt: NOW, deletedBy: S.user.email });
  log('delete', `Deleted one-time change "${x.label}" for ${userName(x.userEmail)}`, { kind: 'exception', refId: x.id });
}
export async function restoreException(x) {
  await fb.updateOne(`scheduleExceptions/${x.id}`, { deleted: false, deletedAt: DELETE, deletedBy: DELETE });
  log('restore', `Restored one-time change "${x.label}"`, { kind: 'exception', refId: x.id });
}
export async function purgeException(x) {
  await fb.removeOne(`scheduleExceptions/${x.id}`);
  log('purge', `Permanently deleted one-time change "${x.label}"`, { kind: 'exception', refId: x.id, snapshot: JSON.parse(JSON.stringify(x)) });
}

// ---------- study plans ----------
const planOf = s => ({ leaderEmail: s?.leaderEmail || '', plan: s?.plan || {} });
/** Save a plan. The previous version is kept in sundays/{date}/history first. */
export async function savePlan(k, plan, leaderEmail) {
  const s = sundayByDate(k);
  const ops = [];
  const before = planOf(s);
  if (before.leaderEmail || Object.keys(before.plan).length)
    ops.push({ type: 'set', path: `sundays/${k}/history/${fb.newId('h')}`, data: { ...before, savedAt: NOW, replacedBy: S.user.email, prevUpdatedBy: s?.planUpdatedBy || '', prevUpdatedAt: s?.planUpdatedAt || null } });
  ops.push({ type: 'update', path: `sundays/${k}`, data: { plan, leaderEmail: leaderEmail || '', planUpdatedAt: NOW, planUpdatedBy: S.user.email, planSample: DELETE } });
  await fb.batchWrite(ops);
  log('plan', `Updated the study plan for ${k}${plan.title ? ` (“${plan.title}”)` : ''}`, { kind: 'plan', refId: k, changes: diff(before.plan, plan) });
}
export async function setLeader(k, email) {
  const s = sundayByDate(k);
  await fb.updateOne(`sundays/${k}`, { leaderEmail: email || '' });
  log('plan', `${email ? `Assigned ${userName(email)} to lead` : 'Unassigned the leader for'} ${k}`, { kind: 'plan', refId: k, changes: { leader: { from: userName(s?.leaderEmail), to: userName(email) } } });
}
export async function applyRotation(assignments) {
  await fb.batchWrite(assignments.map(a => ({ type: 'update', path: `sundays/${a.date}`, data: { leaderEmail: a.leaderEmail } })));
  log('plan', `Auto-assigned leaders to ${assignments.length} Sundays`, { kind: 'plan' });
}
export const getHistory = k => fb.getMany(`sundays/${k}/history`, { orderBy: 'savedAt', desc: true, limit: 50 });
export async function restoreVersion(k, v) {
  await savePlan(k, v.plan || {}, v.leaderEmail || '');
  log('restore', `Restored an earlier version of the ${k} study plan`, { kind: 'plan', refId: k });
}
let commentWatch = { k: null, unsub: null };
export const comments = { k: null, list: [] };
export function watchComments(k) {
  if (commentWatch.k === k) return;
  commentWatch.unsub?.();
  comments.k = k; comments.list = [];
  commentWatch = { k, unsub: fb.watch(`sundays/${k}/comments`, {}, d => { comments.list = d.sort((a, b) => (a.at || 0) - (b.at || 0)); emit(); }) };
}
export async function addComment(k, text) {
  await fb.addOne(`sundays/${k}/comments`, { text: text.trim(), by: S.user.email, byName: S.user.name || S.user.email, at: NOW });
  log('comment', `Commented on the ${k} study plan`, { kind: 'plan', refId: k });
}
export async function deleteComment(k, c) {
  await fb.removeOne(`sundays/${k}/comments/${c.id}`);
  log('delete', `Deleted a comment on the ${k} study plan`, { kind: 'plan', refId: k, snapshot: { text: c.text, by: c.by } });
}

// ---------- attendance ----------
export async function addAttendance(k, p) {
  await fb.updateOne(`sundays/${k}`, { [`attendees.${p.id}`]: { teamId: p.teamId || '', teamOther: p.teamOther || '', classYear: p.classYear || '', source: 'manual', addedBy: S.user.email, at: NOW } });
  log('attendance', `Marked ${fullName(p)} present on ${k}`, { kind: 'attendance', refId: k, personId: p.id });
}
export async function removeAttendance(k, p) {
  await fb.updateOne(`sundays/${k}`, { [`attendees.${p.id}`]: DELETE });
  log('attendance', `Removed ${fullName(p)} from ${k}`, { kind: 'attendance', refId: k, personId: p.id });
}
export async function setSundayStatus(k, status) {
  await fb.updateOne(`sundays/${k}`, { status });
  log('edit', `${k} marked as ${status === 'nostudy' ? `"${ORG.noMeeting}"` : 'a meeting night'}`, { kind: 'sunday', refId: k });
}
export async function openCheckinNow(k, hours = 2) {
  const now = new Date();
  await fb.updateOne(`sundays/${k}`, { checkinOpensAt: new Date(now.getTime() - 60000), checkinClosesAt: new Date(now.getTime() + hours * 3600000) });
  log('edit', `Opened check-in for ${k} for ${hours} hours`, { kind: 'sunday', refId: k });
}
export async function resetCheckinWindow(k) {
  const w = checkinWindow(k, S.settings);
  await fb.updateOne(`sundays/${k}`, { checkinOpensAt: w.opensAt, checkinClosesAt: w.closesAt });
}
export async function newQrToken(k) {
  await fb.updateOne(`sundays/${k}`, { checkinToken: randomToken() });
  log('edit', `Made a new QR code for ${k} (old one stops working)`, { kind: 'sunday', refId: k });
}

// ---------- settings ----------
export async function saveSettings(patch) {
  const before = S.settings;
  await fb.setOne('settings/app', patch, true);
  log('settings', 'Changed settings', { changes: diff(before, patch) });
  if (patch.checkinOpen !== before.checkinOpen || patch.checkinClose !== before.checkinClose) {
    const merged = { ...before, ...patch }, today = todayKey();
    const ops = S.sundays.filter(s => s.date >= today).map(s => {
      const w = checkinWindow(s.date, merged);
      return { type: 'update', path: `sundays/${s.date}`, data: { checkinOpensAt: w.opensAt, checkinClosesAt: w.closesAt } };
    });
    await fb.batchWrite(ops);
  }
}
export async function saveSemester(sem, d) {
  if (sem) { await fb.updateOne(`semesters/${sem.id}`, d); log('edit', `Edited semester ${d.name}`, { kind: 'semester', refId: sem.id, changes: diff(sem, d) }); }
  else { const id = await fb.addOne('semesters', { ...d, deleted: false, createdAt: NOW }); log('create', `Added semester ${d.name}`, { kind: 'semester', refId: id }); }
  await ensureSundays();
}
export async function deleteSemester(sem) {
  await fb.updateOne(`semesters/${sem.id}`, { deleted: true, deletedAt: NOW, deletedBy: S.user.email });
  log('delete', `Removed semester ${sem.name} (attendance is kept)`, { kind: 'semester', refId: sem.id });
}
export async function restoreSemester(sem) {
  await fb.updateOne(`semesters/${sem.id}`, { deleted: false });
  log('restore', `Restored semester ${sem.name}`, { kind: 'semester', refId: sem.id });
  await ensureSundays();
}
export async function saveTeam(team, d) {
  if (team) { await fb.updateOne(`teams/${team.id}`, d); log('edit', `Edited team ${d.name || team.name}`, { kind: 'team', refId: team.id, changes: diff(team, d) }); }
  else { const id = await fb.addOne('teams', { name: d.name, active: true, sortOrder: S.teams.length }); log('create', `Added team ${d.name}`, { kind: 'team', refId: id }); }
}
export async function saveUser(d, existing) {
  const email = d.email.trim().toLowerCase();
  const data = { email, name: d.name.trim(), role: d.role, active: d.active !== false };
  if (!existing) { data.addedBy = S.user.email; data.addedAt = NOW; }
  await fb.setOne(`users/${email}`, data, true);
  log(existing ? 'edit' : 'create', `${existing ? 'Updated' : 'Gave access to'} ${data.name} (${email})`, { kind: 'user', refId: email });
}
export async function removeUser(u) {
  await fb.removeOne(`users/${u.email}`);
  log('delete', `Removed access for ${u.name} (${u.email})`, { kind: 'user', refId: u.email, snapshot: JSON.parse(JSON.stringify(u)) });
}

// ---------- backup ----------
export async function fullBackup() {
  const colls = ['settings', 'semesters', 'teams', 'users', 'people', 'sundays', 'checkins', 'activity', 'outreach', 'schedules', 'scheduleExceptions'];
  const data = { exportedAt: new Date().toISOString(), exportedBy: S.user.email };
  for (const c of colls) data[c] = await fb.getMany(c).catch(() => []);
  log('backup', 'Downloaded a full backup');
  return data;
}

export const getActivity = (n = 200) => fb.getMany('activity', { orderBy: 'at', desc: true, limit: n });
export const getCheckinsFor = k => fb.getMany('checkins', { where: [['sundayDate', '==', k]] });
export { fb };

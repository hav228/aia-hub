// Pure logic: no Firebase, no DOM. Everything here is unit-tested.

export const CLASS_YEARS = ['Freshman', 'Sophomore', 'Junior', 'Senior', 'Grad'];

export const DEFAULT_SETTINGS = {
  regularPct: 50,          // Phase 2: % of studies in the window to count as "regular"
  regularWindowWeeks: 8,
  newWindowWeeks: 4,
  coldMissedWeeks: 4,
  inconsistentPct: 25,     // weeks this far above/below the average are flagged
  checkinOpen: '17:00',    // Sunday, local time
  checkinClose: '02:00',   // if earlier than open, it means Monday
  dropRecentWeeks: 4,      // "dropping off" looks at the last N studies
  staffCount: '',
  typicalAttendance: '',
};

export const LEHIGH_TEAMS = [
  'Baseball', "Men's Basketball", "Women's Basketball", "Men's Cross Country", "Women's Cross Country",
  'Field Hockey', 'Football', "Men's Golf", "Women's Golf", "Men's Lacrosse", "Women's Lacrosse",
  'Rowing', "Men's Soccer", "Women's Soccer", 'Softball', "Men's Swimming & Diving",
  "Women's Swimming & Diving", "Men's Tennis", "Women's Tennis", "Men's Track & Field",
  "Women's Track & Field", 'Volleyball', 'Wrestling', "Women's Wrestling",
];

// ---------- dates (all local time, keys are YYYY-MM-DD) ----------
const pad = n => String(n).padStart(2, '0');
export function dateKey(d) { return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; }
export function parseKey(k) { const [y, m, d] = k.split('-').map(Number); return new Date(y, m - 1, d); }
export function addDays(k, n) { const d = parseKey(k); d.setDate(d.getDate() + n); return dateKey(d); }
export function isSunday(k) { return parseKey(k).getDay() === 0; }

export function sundaysBetween(startKey, endKey) {
  if (!startKey || !endKey || startKey > endKey) return [];
  let d = parseKey(startKey);
  d.setDate(d.getDate() + ((7 - d.getDay()) % 7));
  const out = [];
  while (dateKey(d) <= endKey) { out.push(dateKey(d)); d.setDate(d.getDate() + 7); }
  return out;
}

function atTime(k, hhmm) { const d = parseKey(k); const [h, m] = hhmm.split(':').map(Number); d.setHours(h, m, 0, 0); return d; }

export function checkinWindow(sundayKey, settings) {
  const s = { ...DEFAULT_SETTINGS, ...settings };
  const opensAt = atTime(sundayKey, s.checkinOpen);
  let closesAt = atTime(sundayKey, s.checkinClose);
  if (closesAt <= opensAt) closesAt = atTime(addDays(sundayKey, 1), s.checkinClose);
  return { opensAt, closesAt };
}

// The Sunday the "This Week" page should show by default.
export function currentSundayKey(now, settings) {
  const today = dateKey(now);
  if (now.getDay() === 0) return today;
  if (now.getDay() === 1) {
    const yesterday = addDays(today, -1);
    if (now < checkinWindow(yesterday, settings).closesAt) return yesterday;
  }
  return addDays(today, 7 - now.getDay());
}

export function schoolYearOf(k) { const d = parseKey(k); const y = d.getFullYear(); return d.getMonth() >= 6 ? y : y - 1; } // Jul+ = new year
export function schoolYearLabel(y) { return `${y}–${String(y + 1).slice(2)}`; }
export function schoolYearRange(y) { return { from: `${y}-08-01`, to: `${y + 1}-05-31` }; }

// ---------- names & matching ----------
export function normalizeName(s) {
  return (s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
    .replace(/[-_]/g, ' ').replace(/[^a-z ]/g, '').replace(/\s+/g, ' ').trim();
}
export function tidyName(s) {
  s = (s || '').replace(/\s+/g, ' ').trim();
  if (s && s === s.toLowerCase()) s = s.replace(/(^|[\s'-])([a-z])/g, (m, p, c) => p + c.toUpperCase());
  return s;
}
export function fullName(p) { return `${p.firstName || ''} ${p.lastName || ''}`.trim(); }
export function personKey(p) { return normalizeName(fullName(p)); }

export function levenshtein(a, b) {
  if (a === b) return 0;
  const m = a.length, n = b.length;
  if (!m) return n; if (!n) return m;
  let prev = Array.from({ length: n + 1 }, (_, i) => i);
  for (let i = 1; i <= m; i++) {
    const cur = [i];
    for (let j = 1; j <= n; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    prev = cur;
  }
  return prev[n];
}

const sameTeam = (a, b) => (a.teamId || '') === (b.teamId || '') &&
  (a.teamId !== 'other' || normalizeName(a.teamOther) === normalizeName(b.teamOther));

export function activePeople(people) { return people.filter(p => !p.deleted && !p.mergedInto); }

// Are two names close enough that they might be the same person?
export function namesSimilar(a, b) {
  // a, b: {firstName, lastName}
  const fa = normalizeName(a.firstName), fb = normalizeName(b.firstName);
  const la = normalizeName(a.lastName), lb = normalizeName(b.lastName);
  const ka = `${fa} ${la}`.trim(), kb = `${fb} ${lb}`.trim();
  if (ka === kb) return true;
  const tol = Math.min(ka.length, kb.length) >= 8 ? 2 : 1;
  if (levenshtein(ka, kb) <= tol) return true;
  if (la && la === lb && fa && fb && (fa.startsWith(fb) || fb.startsWith(fa))) return true; // Matt / Matthew
  if (fa && fa === fb && la && lb && levenshtein(la, lb) <= 1) return true;
  return false;
}

/**
 * Decide what to do with a check-in.
 * returns {type:'exact', person} | {type:'new'} | {type:'review', candidates:[person], reason}
 */
export function matchCheckin(c, people) {
  const key = normalizeName(`${c.firstName} ${c.lastName}`);
  const pool = activePeople(people);
  const exact = pool.filter(p => (p.nameKey || personKey(p)) === key || (p.aliases || []).includes(key));
  if (exact.length === 1) {
    if (sameTeam(exact[0], c)) return { type: 'exact', person: exact[0] };
    return { type: 'review', candidates: exact, reason: 'Same name, different team' };
  }
  if (exact.length > 1) {
    const st = exact.filter(p => sameTeam(p, c));
    if (st.length === 1) return { type: 'exact', person: st[0] };
    return { type: 'review', candidates: exact, reason: 'More than one person has this name' };
  }
  const similar = pool.filter(p => namesSimilar(p, c) ||
    (p.aliases || []).some(al => levenshtein(al, key) <= 1));
  if (similar.length) return { type: 'review', candidates: similar.slice(0, 5), reason: 'Possible typo or nickname' };
  return { type: 'new' };
}

export function findPossibleDuplicates(people) {
  const pool = activePeople(people);
  const pairs = [];
  for (let i = 0; i < pool.length; i++)
    for (let j = i + 1; j < pool.length; j++)
      if (namesSimilar(pool[i], pool[j])) pairs.push([pool[i], pool[j]]);
  return pairs;
}

export function randomToken(len = 20) {
  const chars = 'abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const arr = new Uint32Array(len);
  globalThis.crypto.getRandomValues(arr);
  return Array.from(arr, x => chars[x % chars.length]).join('');
}

// ---------- attendance index ----------
// sundays: [{id/date, status, attendees:{pid:{teamId, classYear, source}}}]
export function attendanceIndex(sundays) {
  const byPerson = new Map(); // pid -> sorted [dateKey]
  for (const s of [...sundays].sort((a, b) => a.date < b.date ? -1 : 1)) {
    for (const pid of Object.keys(s.attendees || {})) {
      if (!byPerson.has(pid)) byPerson.set(pid, []);
      byPerson.get(pid).push(s.date);
    }
  }
  return byPerson;
}

export function heldSundays(sundays, from, to, todayKey) {
  return sundays.filter(s => s.status !== 'nostudy' && s.date >= from && s.date <= to && s.date <= todayKey)
    .sort((a, b) => a.date < b.date ? -1 : 1);
}

const mean = xs => xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0;
const round1 = x => Math.round(x * 10) / 10;

function teamLabel(entry, teamsById) {
  if (!entry) return 'Unknown';
  if (entry.teamId === 'other') return entry.teamOther ? `Other: ${entry.teamOther}` : 'Other';
  return teamsById.get(entry.teamId)?.name || 'Unknown';
}

function tally(map, key, field) {
  if (!map.has(key)) map.set(key, { name: key, checkins: 0, people: new Set() });
  const t = map.get(key); t.checkins++; t.people.add(field);
}
const finishTally = (map, order) => {
  const rows = [...map.values()].map(t => ({ name: t.name, checkins: t.checkins, unique: t.people.size }));
  if (order) rows.sort((a, b) => order.indexOf(a.name) - order.indexOf(b.name));
  else rows.sort((a, b) => b.checkins - a.checkins || a.name.localeCompare(b.name));
  return rows;
};

/** Report for any date range (semester or school year). */
export function buildPeriodReport({ sundays, people, teams, settings, from, to, todayKey, prev }) {
  const st = { ...DEFAULT_SETTINGS, ...settings };
  const teamsById = new Map(teams.map(t => [t.id, t]));
  const peopleById = new Map(people.map(p => [p.id, p]));
  const firstSeen = new Map();
  for (const [pid, dates] of attendanceIndex(sundays)) firstSeen.set(pid, dates[0]);

  const held = heldSundays(sundays, from, to, todayKey);
  const weeks = held.map(s => {
    const ids = Object.keys(s.attendees || {});
    const newCount = ids.filter(id => firstSeen.get(id) === s.date).length;
    return { date: s.date, count: ids.length, newCount, returningCount: ids.length - newCount };
  });
  const avg = mean(weeks.map(w => w.count));
  const thr = Number(st.inconsistentPct) || 25;
  for (const w of weeks) {
    w.vsAvgPct = avg ? round1((w.count - avg) / avg * 100) : 0;
    w.inconsistent = avg > 0 && Math.abs(w.vsAvgPct) > thr;
  }
  const byCount = [...weeks].sort((a, b) => b.count - a.count || (a.date < b.date ? -1 : 1));
  const n = Math.min(3, weeks.length);

  const teamMap = new Map(), classMap = new Map(), personStats = new Map();
  for (const s of held) for (const [pid, e] of Object.entries(s.attendees || {})) {
    tally(teamMap, teamLabel(e, teamsById), pid);
    tally(classMap, e.classYear || 'Unknown', pid);
    if (!personStats.has(pid)) personStats.set(pid, { pid, dates: [] });
    personStats.get(pid).dates.push(s.date);
  }

  const heldDates = held.map(s => s.date);
  const recentN = Number(st.dropRecentWeeks) || 4;
  const recent = new Set(heldDates.slice(-recentN));
  const earlierCount = Math.max(0, heldDates.length - recent.size);
  const members = [...personStats.values()].map(ps => {
    const p = peopleById.get(ps.pid);
    const recentAttended = ps.dates.filter(d => recent.has(d)).length;
    const earlierAttended = ps.dates.length - recentAttended;
    const first = firstSeen.get(ps.pid);
    return {
      pid: ps.pid, name: p ? fullName(p) : '(removed person)',
      team: p ? teamLabel(p, teamsById) : '', classYear: p?.classYear || '',
      attended: ps.dates.length, possible: heldDates.length,
      rate: heldDates.length ? Math.round(ps.dates.length / heldDates.length * 100) : 0,
      lastAttended: ps.dates[ps.dates.length - 1], isNew: first >= from && first <= to,
      recentAttended, earlierAttended,
    };
  }).sort((a, b) => b.attended - a.attended || a.name.localeCompare(b.name));

  const dropping = earlierCount >= 2 ? members.filter(m =>
    m.earlierAttended / earlierCount >= 0.5 && m.recentAttended <= Math.floor(recent.size / 4)) : [];

  const report = {
    from, to, weeks, avg: round1(avg),
    studiesHeld: weeks.length,
    totalCheckins: weeks.reduce((a, w) => a + w.count, 0),
    uniquePeople: personStats.size,
    newPeople: members.filter(m => m.isNew).length,
    returningPeople: members.filter(m => !m.isNew).length,
    highest: byCount.slice(0, n),
    lowest: byCount.slice(-n).reverse(),
    inconsistent: weeks.filter(w => w.inconsistent),
    threshold: thr,
    byTeam: finishTally(teamMap),
    byClass: finishTally(classMap, [...CLASS_YEARS, 'Unknown']),
    members, mostConsistent: members.slice(0, 10), dropping, recentWindow: recent.size,
  };
  if (prev) {
    const prevWeeks = heldSundays(sundays, prev.from, prev.to, todayKey).map(s => ({ date: s.date, count: Object.keys(s.attendees || {}).length }));
    report.compare = { label: prev.label, weeks: prevWeeks, avg: round1(mean(prevWeeks.map(w => w.count))) };
  }
  return report;
}

/** Report for a single Sunday. */
export function buildWeekReport({ sundays, people, teams, dateKey: k, semester, todayKey }) {
  const teamsById = new Map(teams.map(t => [t.id, t]));
  const peopleById = new Map(people.map(p => [p.id, p]));
  const firstSeen = new Map();
  for (const [pid, dates] of attendanceIndex(sundays)) firstSeen.set(pid, dates[0]);
  const s = sundays.find(x => x.date === k);
  const att = Object.entries(s?.attendees || {}).map(([pid, e]) => {
    const p = peopleById.get(pid);
    return { pid, name: p ? fullName(p) : '(removed person)', team: teamLabel(e, teamsById), classYear: e.classYear || '', source: e.source, isNew: firstSeen.get(pid) === k };
  }).sort((a, b) => a.name.localeCompare(b.name));
  const teamMap = new Map(), classMap = new Map();
  for (const a of att) { tally(teamMap, a.team, a.pid); tally(classMap, a.classYear || 'Unknown', a.pid); }
  let semAvg = null;
  if (semester) {
    const hs = heldSundays(sundays, semester.startDate, semester.endDate, todayKey);
    semAvg = round1(mean(hs.map(x => Object.keys(x.attendees || {}).length)));
  }
  return {
    date: k, status: s?.status || 'none', total: att.length,
    newCount: att.filter(a => a.isNew).length, returningCount: att.filter(a => !a.isNew).length,
    attendees: att, byTeam: finishTally(teamMap), byClass: finishTally(classMap, [...CLASS_YEARS, 'Unknown']), semAvg,
  };
}

// ---------- CSV ----------
export function toCSV(rows) {
  return rows.map(r => r.map(v => {
    const s = v == null ? '' : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  }).join(',')).join('\n');
}

// ---------- outreach groups ----------
export const GROUPS = [
  ['new', 'New', 'First came recently'],
  ['regular', 'Regular', 'Coming consistently'],
  ['occasional', 'Occasional', 'Comes sometimes — not regular, not cold'],
  ['cold', 'Cold', 'Has missed several weeks in a row'],
  ['potential', 'Potential', 'Never attended yet'],
  ['inactive', 'Inactive / graduated', 'Archived — history kept'],
];
export const GROUP_KEYS = GROUPS.map(g => g[0]);
export const groupLabel = k => (GROUPS.find(g => g[0] === k) || [, k])[1];
export const OUTREACH_METHODS = ['Text', 'Call', 'Coffee / meal', 'In person', 'Social media', 'Email', 'Other'];

/** Studies that "count" for groups: past ones, plus today's if anyone has checked in yet. */
export function countedStudies(sundays, todayKey) {
  return sundays.filter(s => s.status !== 'nostudy' &&
    (s.date < todayKey || (s.date === todayKey && Object.keys(s.attendees || {}).length)))
    .map(s => s.date).sort();
}

/**
 * Work out each person's outreach group.
 * returns Map pid -> {group, auto, manual:boolean, reason, recent, window, lastAttended, firstAttended}
 */
export function computeGroups({ people, sundays, settings, todayKey, index }) {
  const st = { ...DEFAULT_SETTINGS, ...settings };
  const held = countedStudies(sundays, todayKey);
  const idx = index || attendanceIndex(sundays);
  const regN = Math.max(1, Number(st.regularWindowWeeks) || 8), newN = Math.max(1, Number(st.newWindowWeeks) || 4);
  const coldN = Math.max(1, Number(st.coldMissedWeeks) || 4), pct = Number(st.regularPct) || 50;
  const regWin = held.slice(-regN), newWin = held.slice(-newN), coldWin = held.slice(-coldN);
  const out = new Map();
  for (const p of activePeople(people)) {
    const dates = (idx.get(p.id) || []).filter(d => d <= todayKey);
    const set = new Set(dates);
    const recent = regWin.filter(d => set.has(d)).length;
    let auto, reason;
    if (p.archived) { auto = 'inactive'; reason = p.archivedReason || 'Archived'; }
    else if (!dates.length) { auto = 'potential'; reason = 'Hasn’t attended yet'; }
    else if (newWin.length && dates[0] >= newWin[0]) { auto = 'new'; reason = `First came within the last ${newN} studies`; }
    else if (held.length >= coldN && !coldWin.some(d => set.has(d))) { auto = 'cold'; reason = `Missed the last ${coldN}+ studies in a row`; }
    else if (regWin.length && recent / regWin.length * 100 >= pct) { auto = 'regular'; reason = `Came to ${recent} of the last ${regWin.length} studies`; }
    else { auto = 'occasional'; reason = `Came to ${recent} of the last ${regWin.length} studies`; }
    const manual = !p.archived && GROUP_KEYS.includes(p.groupOverride) && p.groupOverride !== 'inactive';
    out.set(p.id, { group: manual ? p.groupOverride : auto, auto, manual, reason, recent, window: regWin.length,
      lastAttended: dates[dates.length - 1] || '', firstAttended: dates[0] || '' });
  }
  return out;
}

/** Sunday that ends "this week" (today if it's Sunday). */
export function weekEndKey(todayKey) { const d = parseKey(todayKey); return addDays(todayKey, (7 - d.getDay()) % 7); }

/** Open follow-ups due by the end of this week (including overdue). */
export function followUpsDue(outreach, todayKey) {
  const end = weekEndKey(todayKey);
  return outreach.filter(o => !o.deleted && o.nextFollowUp && !o.followUpDone && o.nextFollowUp <= end)
    .sort((a, b) => a.nextFollowUp < b.nextFollowUp ? -1 : a.nextFollowUp > b.nextFollowUp ? 1 : 0);
}

/** Latest outreach per person. */
export function latestOutreach(outreach) {
  const m = new Map();
  for (const o of outreach) {
    if (o.deleted) continue;
    const cur = m.get(o.personId);
    if (!cur || o.date > cur.date || (o.date === cur.date && (o.createdAt || 0) > (cur.createdAt || 0))) m.set(o.personId, o);
  }
  return m;
}

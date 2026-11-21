import { ORG } from '../org.js';
import { h, card, empty, fmtDate, fmtLong, select, field, toast, downloadFile, go } from '../ui.js';
import { S, todayKey, liveSemesters, semesterFor, sundayByDate } from '../store.js';
import {
  buildPeriodReport, buildWeekReport, schoolYearOf, schoolYearLabel, schoolYearRange, toCSV, currentSundayKey,
} from '../logic.js';
import { statTile } from './common.js';

// Chart colors (validated for color-blind separation and contrast on white)
const C1 = '#8E4F1C', C2 = '#3478B5', GRID = '#ece6df', INK = '#2b2118', MUTED = '#6b5d52';
let charts = [];
const view = { threshold: null };

function chart(canvas, config) {
  if (!globalThis.Chart) return;
  const Chart = globalThis.Chart;
  Chart.defaults.font.family = getComputedStyle(document.body).fontFamily;
  Chart.defaults.color = MUTED;
  const c = new Chart(canvas, {
    ...config,
    options: {
      responsive: true, maintainAspectRatio: false, animation: false,
      interaction: { mode: 'index', intersect: false },
      plugins: { legend: { display: (config.data.datasets.length > 1), position: 'top', align: 'start', labels: { color: INK, boxWidth: 12, boxHeight: 12, useBorderRadius: true, borderRadius: 2 } },
        tooltip: { backgroundColor: '#2b2118', padding: 10, cornerRadius: 6 } },
      scales: {
        x: { grid: { display: false }, border: { color: GRID }, ticks: { maxRotation: 0, autoSkip: true } },
        y: { beginAtZero: true, grid: { color: GRID }, border: { display: false }, ticks: { precision: 0 } },
      },
      ...(config.options || {}),
    },
  });
  charts.push(c);
}
const chartBox = (height = 260) => { const cv = h('canvas'); return [h('div', { class: 'chart', style: `height:${height}px` }, cv), cv]; };
// Drop the 2nd column (Team) for ministries without teams
const cols = row => ORG.hasTeams ? row : row.filter((_, i) => i !== 1);
const shortDate = k => fmtDate(k, { month: 'short', day: 'numeric' });
const table = (head, rows) => h('div', { class: 'table-wrap' }, h('table', null,
  h('thead', null, h('tr', null, head.map(x => h('th', null, x)))),
  h('tbody', null, rows.map(r => h('tr', null, r.map(x => h('td', null, x)))))));

export function renderReports(level, arg) {
  charts.forEach(c => c.destroy()); charts = [];
  const sems = liveSemesters();
  const today = todayKey();
  const years = [...new Set([...S.sundays.map(s => schoolYearOf(s.date)), ...sems.map(s => schoolYearOf(s.startDate))])].sort((a, b) => b - a);
  const curSem = semesterFor(today) || [...sems].reverse().find(s => s.startDate <= today) || sems[sems.length - 1];
  level = ['week', 'semester', 'year'].includes(level) ? level : 'semester';

  const tabs = h('div', { class: 'tabs', role: 'tablist' }, [['week', 'Weekly'], ['semester', 'Semester'], ['year', 'School year']].map(([l, label]) =>
    h('a', { role: 'tab', class: l === level ? 'active' : '', 'aria-selected': l === level ? 'true' : 'false', href: `#/reports/${l}` }, label)));

  if (!sems.length) return [h('h1', null, 'Reports'), tabs, card(null, empty('Add a semester in Settings to start collecting attendance.'))];

  let picker, body, exportName, sections;
  if (level === 'week') {
    const held = S.sundays.filter(s => s.date <= today).sort((a, b) => b.date < a.date ? -1 : 1);
    let k = arg || (held[0]?.date) || currentSundayKey(new Date(), S.settings, ORG.day);
    picker = select(held.map(s => [s.date, `${fmtDate(s.date, { month: 'short', day: 'numeric', year: 'numeric' })}${s.status === 'nostudy' ? ` (${ORG.noMeeting.toLowerCase()})` : ''}`]), k, { 'aria-label': 'Week' });
    picker.onchange = () => go(`reports/week/${picker.value}`);
    const rep = buildWeekReport({ sundays: S.sundays, people: S.people, teams: S.teams, dateKey: k, semester: semesterFor(k), todayKey: today });
    ({ body, sections } = weekBody(rep));
    exportName = `${ORG.short}-week-${k}`;
  } else if (level === 'semester') {
    const sem = sems.find(s => s.id === arg) || curSem;
    picker = select([...sems].reverse().map(s => [s.id, s.name]), sem.id, { 'aria-label': 'Semester' });
    picker.onchange = () => go(`reports/semester/${picker.value}`);
    const i = sems.indexOf(sem), prevSem = sems[i - 1];
    const rep = buildPeriodReport({ sundays: S.sundays, people: S.people, teams: S.teams, settings: { ...S.settings, ...(view.threshold ? { inconsistentPct: view.threshold } : {}) },
      from: sem.startDate, to: sem.endDate, todayKey: today, prev: prevSem && { from: prevSem.startDate, to: prevSem.endDate, label: prevSem.name } });
    ({ body, sections } = periodBody(rep, sem.name, 'semester'));
    exportName = `${ORG.short}-${sem.name.replace(/\s+/g, '-')}`;
  } else {
    const y = Number(arg) || schoolYearOf(today);
    const list = years.includes(y) ? years : [y, ...years];
    picker = select(list.map(v => [String(v), schoolYearLabel(v)]), String(y), { 'aria-label': 'School year' });
    picker.onchange = () => go(`reports/year/${picker.value}`);
    const r = schoolYearRange(y), pr = schoolYearRange(y - 1);
    const rep = buildPeriodReport({ sundays: S.sundays, people: S.people, teams: S.teams, settings: { ...S.settings, ...(view.threshold ? { inconsistentPct: view.threshold } : {}) },
      ...r, todayKey: today, prev: { ...pr, label: schoolYearLabel(y - 1) } });
    ({ body, sections } = periodBody(rep, `School year ${schoolYearLabel(y)}`, 'year'));
    exportName = `${ORG.short}-school-year-${y}-${y + 1}`;
  }

  const exportRow = h('div', { class: 'btn-row no-print' },
    h('button', { class: 'btn', onclick: () => downloadFile(`${exportName}.csv`, sectionsToCSV(sections), 'text/csv') }, 'Export CSV'),
    h('button', { class: 'btn', onclick: () => exportExcel(exportName, sections) }, 'Export Excel'),
    h('button', { class: 'btn', onclick: printReport }, 'Save as PDF'));

  return [h('div', { class: 'page-head' }, h('h1', null, 'Reports')), tabs,
    h('div', { class: 'filters no-print' }, picker), exportRow, body];
}

function weekBody(rep) {
  const [teamBox, teamCv] = chartBox(Math.max(120, rep.byTeam.length * 30 + 40));
  const body = h('div', { class: 'report' },
    h('h2', { class: 'print-title' }, `Weekly report — ${fmtLong(rep.date)}`),
    rep.status === 'nostudy' ? h('p', { class: 'pill muted' }, `This week was marked “${ORG.noMeeting}”.`) : null,
    h('div', { class: 'stats' }, statTile('Attendance', rep.total, rep.semAvg != null ? `Semester avg ${rep.semAvg}` : null),
      statTile('First-timers', rep.newCount), statTile('Returning', rep.returningCount)),
    ORG.hasTeams ? card('By team', rep.byTeam.length ? teamBox : empty('No attendance.')) : null,
    card('By class year', table(['Class year', 'People'], rep.byClass.map(r => [r.name, r.checkins]))),
    card(`Who came (${rep.total})`, rep.attendees.length ? table(cols(['Name', 'Team', 'Class', '']), rep.attendees.map(a => cols([a.name, a.team, a.classYear, a.isNew ? 'First time' : '']))) : empty('No one yet.')));
  setTimeout(() => ORG.hasTeams && rep.byTeam.length && chart(teamCv, { type: 'bar', data: { labels: rep.byTeam.map(r => r.name), datasets: [{ label: 'People', data: rep.byTeam.map(r => r.checkins), backgroundColor: C1, borderRadius: 4, maxBarThickness: 22 }] }, options: { indexAxis: 'y', scales: { x: { beginAtZero: true, grid: { color: GRID }, ticks: { precision: 0 } }, y: { grid: { display: false } } } } }));
  const sections = [
    { name: 'Summary', rows: [['Date', rep.date], ['Attendance', rep.total], ['First-timers', rep.newCount], ['Returning', rep.returningCount], ['Semester average', rep.semAvg ?? '']] },
    ...(ORG.hasTeams ? [{ name: 'By team', rows: [['Team', 'People'], ...rep.byTeam.map(r => [r.name, r.checkins])] }] : []),
    { name: 'By class year', rows: [['Class year', 'People'], ...rep.byClass.map(r => [r.name, r.checkins])] },
    { name: 'Attendees', rows: [cols(['Name', 'Team', 'Class year', 'First time?', 'How']), ...rep.attendees.map(a => cols([a.name, a.team, a.classYear, a.isNew ? 'Yes' : 'No', a.source === 'manual' ? 'Added by leader' : 'QR']))] },
  ];
  return { body, sections };
}

function periodBody(rep, title, kind) {
  if (!rep.studiesHeld) return { body: card(null, empty('No meetings have happened in this period yet.')), sections: [] };
  const [lineBox, lineCv] = chartBox(240);
  const [stackBox, stackCv] = chartBox(240);
  const [teamBox, teamCv] = chartBox(Math.max(140, rep.byTeam.length * 28 + 40));
  const [cmpBox, cmpCv] = chartBox(240);
  const labels = rep.weeks.map(w => shortDate(w.date));
  const thrInput = h('input', { type: 'number', min: 5, max: 100, step: 5, value: rep.threshold, class: 'small-num', 'aria-label': 'Threshold percent' });
  thrInput.onchange = () => { view.threshold = Number(thrInput.value) || 25; window.dispatchEvent(new HashChangeEvent('hashchange')); };
  const weekList = ws => ws.length ? h('ul', { class: 'hl-list' }, ws.map(w => h('li', null, h('a', { href: `#/reports/week/${w.date}` }, shortDate(w.date)), ` — ${w.count}`,
    w.vsAvgPct ? h('span', { class: 'muted' }, ` (${w.vsAvgPct > 0 ? '+' : ''}${w.vsAvgPct}%)`) : null))) : empty('None');
  const prevName = kind === 'semester' ? 'last semester' : 'last year';

  const body = h('div', { class: 'report' },
    h('h2', { class: 'print-title' }, title),
    h('div', { class: 'stats' },
      statTile('Meetings held', rep.studiesHeld), statTile('Average attendance', rep.avg, rep.compare ? `${prevName}: ${rep.compare.avg || '—'}` : null),
      statTile('Total check-ins', rep.totalCheckins), statTile('Different people', rep.uniquePeople),
      statTile('New people', rep.newPeople), statTile('Returning people', rep.returningPeople)),
    card('Attendance over time', lineBox),
    card('Highlights', h('div', { class: 'grid3' },
      h('div', null, h('h3', null, 'Highest weeks'), weekList(rep.highest)),
      h('div', null, h('h3', null, 'Lowest weeks'), weekList(rep.lowest)),
      h('div', null, h('h3', null, 'Inconsistent weeks'),
        h('p', { class: 'muted small' }, 'More than ', thrInput, '% above or below the average of ', String(rep.avg)), weekList(rep.inconsistent)))),
    card('New vs. returning each week', stackBox),
    !ORG.hasTeams ? null : card('By team', teamBox, table(['Team', 'Check-ins', 'Different people'], rep.byTeam.map(r => [r.name, r.checkins, r.unique]))),
    card('By class year', table(['Class year', 'Check-ins', 'Different people'], rep.byClass.map(r => [r.name, r.checkins, r.unique]))),
    card(`Compared with ${rep.compare?.label || prevName}`, rep.compare?.weeks.length ? cmpBox : empty(`No data for ${prevName}.`)),
    card('Member consistency', h('div', { class: 'grid2' },
      h('div', null, h('h3', null, 'Most consistent'), table(cols(['Name', 'Team', 'Weeks']), rep.mostConsistent.map(m => cols([h('a', { href: `#/person/${m.pid}` }, m.name), m.team, `${m.attended}/${m.possible}`])))),
      h('div', null, h('h3', null, 'Attendance dropping'),
        h('p', { class: 'muted small' }, `Came to at least half the earlier studies but 1 or fewer of the last ${rep.recentWindow}.`),
        rep.dropping.length ? table(cols(['Name', 'Team', 'Last came']), rep.dropping.map(m => cols([h('a', { href: `#/person/${m.pid}` }, m.name), m.team, shortDate(m.lastAttended)]))) : empty('No one — nice.'))),
      h('details', { class: 'print-open' }, h('summary', null, `Weeks attended — everyone (${rep.members.length})`),
        table(cols(['Name', 'Team', 'Class', 'Weeks', '%']), rep.members.map(m => cols([m.name, m.team, m.classYear, m.attended, `${m.rate}%`]))))),
    card('Week by week', table([ORG.dayName, 'Attendance', 'First-timers', 'Returning', 'vs. average'],
      rep.weeks.map(w => [h('a', { href: `#/reports/week/${w.date}` }, shortDate(w.date)), w.count, w.newCount, w.returningCount, `${w.vsAvgPct > 0 ? '+' : ''}${w.vsAvgPct}%${w.inconsistent ? ' ⚑' : ''}`]))));

  setTimeout(() => {
    chart(lineCv, { type: 'line', data: { labels, datasets: [{ label: 'Attendance', data: rep.weeks.map(w => w.count), borderColor: C1, backgroundColor: C1, borderWidth: 2, pointRadius: 4, pointHoverRadius: 6, tension: 0.2 }] } });
    chart(stackCv, { type: 'bar', data: { labels, datasets: [
      { label: 'Returning', data: rep.weeks.map(w => w.returningCount), backgroundColor: C1, borderColor: '#fff', borderWidth: { top: 2 }, borderSkipped: false, maxBarThickness: 28 },
      { label: 'First-time', data: rep.weeks.map(w => w.newCount), backgroundColor: C2, borderColor: '#fff', borderWidth: { bottom: 2 }, borderRadius: { topLeft: 4, topRight: 4 }, borderSkipped: false, maxBarThickness: 28 },
    ] }, options: { scales: { x: { stacked: true, grid: { display: false } }, y: { stacked: true, beginAtZero: true, grid: { color: GRID }, ticks: { precision: 0 } } } } });
    if (ORG.hasTeams) chart(teamCv, { type: 'bar', data: { labels: rep.byTeam.map(r => r.name), datasets: [{ label: 'Check-ins', data: rep.byTeam.map(r => r.checkins), backgroundColor: C1, borderRadius: 4, maxBarThickness: 20 }] }, options: { indexAxis: 'y', interaction: { mode: 'nearest', intersect: true, axis: 'y' }, scales: { x: { beginAtZero: true, grid: { color: GRID }, ticks: { precision: 0 } }, y: { grid: { display: false } } } } });
    if (rep.compare?.weeks.length) {
      const n = Math.max(rep.weeks.length, rep.compare.weeks.length);
      chart(cmpCv, { type: 'line', data: { labels: Array.from({ length: n }, (_, i) => `Wk ${i + 1}`), datasets: [
        { label: 'This ' + (kind === 'semester' ? 'semester' : 'year'), data: rep.weeks.map(w => w.count), borderColor: C1, backgroundColor: C1, borderWidth: 2, pointRadius: 4, tension: 0.2 },
        { label: rep.compare.label, data: rep.compare.weeks.map(w => w.count), borderColor: C2, backgroundColor: C2, borderWidth: 2, pointRadius: 4, borderDash: [6, 4], tension: 0.2 },
      ] } });
    }
  });

  const sections = [
    { name: 'Summary', rows: [['Period', title], ['From', rep.from], ['To', rep.to], ['Meetings held', rep.studiesHeld], ['Average attendance', rep.avg],
      ['Total check-ins', rep.totalCheckins], ['Different people', rep.uniquePeople], ['New people', rep.newPeople], ['Returning people', rep.returningPeople],
      ['Inconsistent threshold %', rep.threshold], [`Average (${rep.compare?.label || prevName})`, rep.compare?.avg ?? '']] },
    { name: 'Week by week', rows: [[ORG.dayName, 'Attendance', 'First-timers', 'Returning', 'vs. average %', 'Inconsistent?'], ...rep.weeks.map(w => [w.date, w.count, w.newCount, w.returningCount, w.vsAvgPct, w.inconsistent ? 'Yes' : ''])] },
    { name: 'Highlights', rows: [['Type', ORG.dayName, 'Attendance'], ...rep.highest.map(w => ['Highest', w.date, w.count]), ...rep.lowest.map(w => ['Lowest', w.date, w.count]), ...rep.inconsistent.map(w => ['Inconsistent', w.date, w.count])] },
    ...(ORG.hasTeams ? [{ name: 'By team', rows: [['Team', 'Check-ins', 'Different people'], ...rep.byTeam.map(r => [r.name, r.checkins, r.unique])] }] : []),
    { name: 'By class year', rows: [['Class year', 'Check-ins', 'Different people'], ...rep.byClass.map(r => [r.name, r.checkins, r.unique])] },
    { name: 'Members', rows: [cols(['Name', 'Team', 'Class year', 'Weeks attended', 'Meetings held', '%', 'Last attended', 'New this period?', 'Dropping?']),
      ...rep.members.map(m => cols([m.name, m.team, m.classYear, m.attended, m.possible, m.rate, m.lastAttended, m.isNew ? 'Yes' : '', rep.dropping.includes(m) ? 'Yes' : '']))] },
    ...(rep.compare ? [{ name: 'Comparison', rows: [['Week #', 'This period', rep.compare.label], ...Array.from({ length: Math.max(rep.weeks.length, rep.compare.weeks.length) }, (_, i) => [i + 1, rep.weeks[i]?.count ?? '', rep.compare.weeks[i]?.count ?? ''])] }] : []),
  ];
  return { body, sections };
}

function sectionsToCSV(sections) {
  const rows = [];
  sections.forEach((s, i) => { if (i) rows.push([]); rows.push([s.name.toUpperCase()]); rows.push(...s.rows); });
  return toCSV(rows);
}

async function exportExcel(name, sections) {
  try {
    if (!globalThis.XLSX) await new Promise((res, rej) => {
      const s = document.createElement('script');
      s.src = 'https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js'; s.onload = res; s.onerror = () => rej(new Error('Could not load the Excel tool. Try CSV instead.'));
      document.head.append(s);
    });
    const X = globalThis.XLSX, wb = X.utils.book_new();
    for (const s of sections) X.utils.book_append_sheet(wb, X.utils.aoa_to_sheet(s.rows), s.name.slice(0, 31));
    X.writeFile(wb, `${name}.xlsx`);
  } catch (e) { toast(e.message, 'err'); }
}

function printReport() {
  document.querySelectorAll('details.print-open').forEach(d => (d.open = true));
  document.body.classList.add('print-report');
  const done = () => { document.body.classList.remove('print-report'); window.removeEventListener('afterprint', done); };
  window.addEventListener('afterprint', done);
  setTimeout(() => window.print(), 150);
}

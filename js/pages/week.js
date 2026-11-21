import { h, card, empty, fmtLong, fmtDate, fmtDateTime, toast, confirmBox, drawQR, downloadFile, go } from '../ui.js';
import {
  S, todayKey, sundayByDate, userName, semesterFor, liveSemesters, peopleById, setSundayStatus, openCheckinNow,
  resetCheckinWindow, newQrToken, addAttendance, removeAttendance,
} from '../store.js';
import { currentSundayKey, addDays, isSunday, buildWeekReport, fullName, hasPlan } from '../logic.js';
import { pickPerson, statTile, teamBars } from './common.js';

export function checkinUrl(s) {
  const u = new URL('checkin.html', location.href.split('#')[0]);
  u.search = ''; u.searchParams.set('d', s.date); u.searchParams.set('t', s.checkinToken);
  return u.toString();
}

function windowStatus(s) {
  const now = new Date();
  if (s.status === 'nostudy') return ['No study this week', 'muted'];
  if (now < s.checkinOpensAt) return [`Check-in opens ${fmtDateTime(s.checkinOpensAt)}`, 'muted'];
  if (now <= s.checkinClosesAt) return [`Check-in is OPEN until ${fmtDateTime(s.checkinClosesAt)}`, 'good'];
  return [`Check-in closed ${fmtDateTime(s.checkinClosesAt)}`, 'muted'];
}

export function renderWeek(dateArg) {
  const k = dateArg && isSunday(dateArg) ? dateArg : currentSundayKey(new Date(), S.settings);
  const s = sundayByDate(k);
  const sem = semesterFor(k);
  const head = h('div', { class: 'week-nav' },
    h('a', { class: 'btn icon', href: `#/week/${addDays(k, -7)}`, 'aria-label': 'Previous Sunday' }, '‹'),
    h('div', { class: 'week-title' }, h('h1', null, fmtLong(k)), h('div', { class: 'muted' }, sem ? sem.name : 'Not in a semester')),
    h('a', { class: 'btn icon', href: `#/week/${addDays(k, 7)}`, 'aria-label': 'Next Sunday' }, '›'));

  if (!liveSemesters().length) {
    return [head, card('Welcome! First step: add your semester dates',
      h('p', null, 'The app creates a check-in QR code for every Sunday inside your semesters.'),
      h('a', { class: 'btn primary', href: '#/settings' }, 'Go to Settings'))];
  }
  if (!s) {
    return [head, card(null, empty('This Sunday isn’t inside a semester, so it has no check-in code. You can change semester dates in More → Settings.'),
      h('a', { class: 'btn', href: `#/week` }, 'Back to this week'))];
  }

  const url = checkinUrl(s);
  const [statusText, statusKind] = windowStatus(s);
  const canvas = h('canvas', { class: 'qr', 'aria-label': 'QR code for this week’s check-in' });
  try { drawQR(canvas, url, 600); } catch (e) { console.error(e); }

  const qrCard = card(null,
    h('div', { class: `pill ${statusKind}` }, statusText),
    s.status === 'nostudy' ? h('p', { class: 'muted' }, 'This week is marked “No study”, so it won’t count in averages and the code won’t accept check-ins.') : canvas,
    h('div', { class: 'linkbox' }, h('input', { value: url, readonly: true, 'aria-label': 'Check-in link', onfocus: e => e.target.select() })),
    h('div', { class: 'btn-row' },
      h('button', { class: 'btn', onclick: () => navigator.clipboard.writeText(url).then(() => toast('Link copied')) }, 'Copy link'),
      h('button', { class: 'btn', onclick: () => canvas.toBlob(b => downloadFile(`AIA-checkin-${k}.png`, b)) }, 'Download QR'),
      h('button', { class: 'btn', onclick: () => printQR(k, url) }, 'Print'),
      h('a', { class: 'btn', href: url, target: '_blank', rel: 'noopener' }, 'Open form')),
    h('details', { class: 'more-actions' }, h('summary', null, 'More options'),
      h('div', { class: 'btn-row' },
        h('button', { class: 'btn', onclick: async () => { await openCheckinNow(k, 2); toast('Check-in open for the next 2 hours'); } }, 'Open check-in now (2 hrs)'),
        h('button', { class: 'btn', onclick: async () => { await resetCheckinWindow(k); toast('Back to the normal Sunday window'); } }, 'Reset to normal time'),
        h('button', { class: 'btn', onclick: () => setSundayStatus(k, s.status === 'nostudy' ? 'scheduled' : 'nostudy') },
          s.status === 'nostudy' ? 'We ARE meeting this week' : 'Mark as “No study”'),
        h('button', { class: 'btn danger-outline', onclick: async () => {
          if (await confirmBox('Make a new QR code?', 'The old code and link will stop working. Only do this if the link got shared somewhere it shouldn’t be.', 'Make new code', true)) { await newQrToken(k); toast('New code made'); }
        } }, 'New QR code'))));

  // attendance
  const rep = buildWeekReport({ sundays: S.sundays, people: S.people, teams: S.teams, dateKey: k, semester: sem, todayKey: todayKey() });
  const pmap = peopleById();
  const pendingHere = S.pending.filter(c => c.sundayDate === k).length;
  const reviewHere = S.review.filter(c => c.sundayDate === k).length;
  const attCard = card(`Attendance`,
    h('div', { class: 'stats' }, statTile('Here', rep.total, rep.semAvg != null ? `Semester avg ${rep.semAvg}` : null),
      statTile('First-timers', rep.newCount), statTile('Returning', rep.returningCount)),
    reviewHere ? h('a', { class: 'notice', href: '#/review' }, `${reviewHere} check-in${reviewHere > 1 ? 's' : ''} ${reviewHere > 1 ? 'need' : 'needs'} a quick review →`) : null,
    pendingHere ? h('p', { class: 'muted small' }, `Filing ${pendingHere} new check-in${pendingHere > 1 ? 's' : ''}…`) : null,
    h('div', { class: 'btn-row' }, h('button', { class: 'btn primary', onclick: () => pickPerson({
      title: 'Add someone who didn’t scan', exclude: new Set(Object.keys(s.attendees)),
      onPick: async p => { await addAttendance(k, p); toast(`${fullName(p)} added`); },
    }) }, '+ Add someone'),
    h('a', { class: 'btn', href: `#/reports/week/${k}` }, 'Full report')),
    rep.attendees.length ? h('ul', { class: 'att-list' }, rep.attendees.map(a => h('li', null,
      h('a', { href: `#/person/${a.pid}` }, h('strong', null, a.name)),
      h('span', { class: 'muted' }, ` ${a.team} · ${a.classYear}`),
      a.isNew ? h('span', { class: 'tag new' }, 'New') : null,
      a.source === 'manual' ? h('span', { class: 'tag' }, 'Added by leader') : null,
      h('button', { class: 'icon-btn', 'aria-label': `Remove ${a.name}`, onclick: async () => {
        const p = pmap.get(a.pid) || { id: a.pid, firstName: a.name, lastName: '' };
        if (await confirmBox('Remove from this week?', `Remove ${a.name} from ${fmtDate(k)}?`, 'Remove', true)) await removeAttendance(k, p);
      } }, '×')))) : empty('No one checked in yet.'),
    rep.byTeam.length ? [h('h3', null, 'By team'), teamBars(rep.byTeam)] : null);

  const p = s.plan || {};
  const planCard = s.status === 'nostudy' ? null : h('a', { class: 'card plan-strip', href: `#/study/${k}` },
    h('div', { class: 'muted small' }, s.leaderEmail ? `Led by ${userName(s.leaderEmail)}` : 'No leader assigned yet'),
    hasPlan(s) ? [h('strong', null, p.title || 'Untitled study'), p.scripture ? h('span', { class: 'muted' }, ` · ${p.scripture}`) : null] : h('span', null, 'No study plan yet — tap to add one'),
    h('span', { class: 'plan-go' }, '›'));
  return [head, planCard, h('div', { class: 'grid2' }, qrCard, attCard)];
}

function printQR(k, url) {
  const sheet = h('div', { id: 'print-sheet' },
    h('h1', null, 'AIA Sunday Night'), h('h2', null, fmtLong(k)),
    drawQR(h('canvas', { class: 'qr-print' }), url, 900),
    h('p', { class: 'big' }, 'Scan to check in'), h('p', { class: 'small' }, url));
  document.body.append(sheet); document.body.classList.add('printing');
  const done = () => { sheet.remove(); document.body.classList.remove('printing'); window.removeEventListener('afterprint', done); };
  window.addEventListener('afterprint', done);
  setTimeout(() => window.print(), 100);
}

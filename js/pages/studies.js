import { h, card, empty, fmtDate, fmtLong, fmtDateTime, toast, confirmBox, modal, select, field, go, markClean } from '../ui.js';
import {
  S, todayKey, liveSemesters, semesterFor, sundayByDate, activeUsers, userName, savePlan, setLeader, applyRotation,
  getHistory, restoreVersion, watchComments, comments, addComment, deleteComment,
} from '../store.js';
import { rotationPlan, searchStudies, hasPlan, LINK_TYPES, guessLinkType, normalizeUrl } from '../logic.js';

const view = { tab: 'upcoming', q: '', sem: '', editing: null };
const shortD = k => fmtDate(k, { weekday: 'short', month: 'short', day: 'numeric' });
const leaderOpts = (cur) => {
  const us = activeUsers();
  const opts = [['', 'No leader yet'], ...us.map(u => [u.email, u.name || u.email])];
  if (cur && !us.some(u => u.email === cur)) opts.push([cur, userName(cur)]);
  return opts;
};

export function renderStudies(tab) {
  if (tab === 'archive' || tab === 'upcoming') view.tab = tab;
  const tabs = h('div', { class: 'tabs' }, [['upcoming', 'Upcoming'], ['archive', 'Archive']].map(([k, l]) =>
    h('a', { href: `#/studies/${k}`, class: k === view.tab ? 'active' : '' }, l)));
  const head = h('div', { class: 'page-head' }, h('h1', null, 'Sunday Studies'));
  if (!liveSemesters().length) return [head, card(null, empty('Add a semester in Settings first.'))];
  return [head, tabs, view.tab === 'archive' ? archive() : upcoming()];
}

// ---------- upcoming ----------
function upcoming() {
  const today = todayKey();
  const list = S.sundays.filter(s => s.date >= today).sort((a, b) => a.date < b.date ? -1 : 1).slice(0, 20);
  const leaders = activeUsers().filter(u => (u.role || 'Leader') === 'Leader');
  const unassigned = list.filter(s => !s.leaderEmail && s.status !== 'nostudy');
  const countBy = new Map();
  for (const s of S.sundays) if (s.leaderEmail && s.status !== 'nostudy') countBy.set(s.leaderEmail, (countBy.get(s.leaderEmail) || 0) + 1);

  const rotate = () => {
    const sem = semesterFor(list[0]?.date || today);
    const pool = S.sundays.filter(s => s.date >= today && (!sem || s.semesterId === sem.id));
    const plan = rotationPlan(pool, leaders.map(u => u.email));
    if (!plan.length) { toast('Every upcoming Sunday already has a leader'); return; }
    modal('Fill in the rotation?', h('div', null,
      h('p', null, `This assigns leaders in turn (${leaders.map(u => u.name || u.email).join(' → ')}) to the ${plan.length} Sunday${plan.length > 1 ? 's' : ''} that don’t have one yet${sem ? ` in ${sem.name}` : ''}. Sundays that already have a leader stay the same.`),
      h('ul', { class: 'small' }, plan.map(a => h('li', null, `${shortD(a.date)} — ${userName(a.leaderEmail)}`)))), [
      { label: 'Cancel' },
      { label: 'Assign', kind: 'primary', onClick: async () => { await applyRotation(plan); toast('Leaders assigned'); } },
    ]);
  };

  return h('div', null,
    h('div', { class: 'btn-row' },
      unassigned.length && leaders.length ? h('button', { class: 'btn', onclick: rotate }, 'Fill in leader rotation') : null,
      h('a', { class: 'btn', href: 'https://docs.new', target: '_blank', rel: 'noopener' }, 'New Google Doc ↗')),
    leaders.length ? h('p', { class: 'muted small' }, 'Times leading so far: ', leaders.map(u => `${u.name || u.email} ${countBy.get(u.email) || 0}`).join(' · ')) : null,
    list.length ? h('div', { class: 'study-list' }, list.map(s => {
      const p = s.plan || {};
      const sel = select(leaderOpts(s.leaderEmail), s.leaderEmail || '', { 'aria-label': `Leader for ${s.date}`, class: 'inline-select' });
      sel.onchange = async () => { await setLeader(s.date, sel.value); toast('Leader updated'); };
      return h('div', { class: `study-row${s.status === 'nostudy' ? ' nostudy' : ''}` },
        h('a', { href: `#/study/${s.date}`, class: 'study-main' },
          h('div', { class: 'study-date' }, shortD(s.date), s.date === today ? h('span', { class: 'tag new' }, 'Tonight') : null),
          s.status === 'nostudy' ? h('div', { class: 'muted' }, 'No study this week')
            : hasPlan(s) ? [h('strong', null, p.title || 'Untitled study'), p.scripture ? h('div', { class: 'muted small' }, p.scripture) : null]
              : h('div', { class: 'muted' }, 'No plan yet — tap to add')),
        s.status === 'nostudy' ? null : sel);
    })) : card(null, empty('No upcoming Sundays. Add next semester in Settings.')));
}

// ---------- archive ----------
function archive() {
  const today = todayKey();
  const sems = liveSemesters().reverse();
  const search = h('input', { type: 'search', placeholder: 'Search title, passage, questions, notes, leader…', value: view.q, 'aria-label': 'Search studies' });
  const semSel = select([['', 'All semesters'], ...sems.map(s => [s.id, s.name])], view.sem, { 'aria-label': 'Semester' });
  const out = h('div');
  const draw = () => {
    let rows = S.sundays.filter(s => s.date < today && hasPlan(s) && (!view.sem || s.semesterId === view.sem));
    rows = searchStudies(rows, view.q, userName).sort((a, b) => a.date < b.date ? 1 : -1);
    out.replaceChildren(rows.length ? h('div', { class: 'study-list' }, rows.map(s => h('a', { class: 'study-row', href: `#/study/${s.date}` },
      h('div', { class: 'study-main' },
        h('div', { class: 'study-date' }, fmtDate(s.date, { month: 'short', day: 'numeric', year: 'numeric' })),
        h('strong', null, s.plan.title || 'Untitled study'),
        h('div', { class: 'muted small' }, [s.plan.scripture, s.leaderEmail ? `led by ${userName(s.leaderEmail)}` : null, `${Object.keys(s.attendees || {}).length} attended`].filter(Boolean).join(' · ')))))) :
      empty(view.q ? 'No studies match that search.' : 'Past studies with plans will show up here.'));
  };
  search.addEventListener('input', () => { view.q = search.value; draw(); });
  semSel.onchange = () => { view.sem = semSel.value; draw(); };
  draw();
  return h('div', null, h('div', { class: 'filters' }, search, semSel), out);
}

// ---------- one study ----------
export function renderStudy(k) {
  const s = sundayByDate(k);
  const back = h('a', { class: 'btn icon', href: `#/studies/${k < todayKey() ? 'archive' : 'upcoming'}`, 'aria-label': 'Back' }, '‹');
  if (!s) return [h('div', { class: 'page-head' }, back, h('h1', null, 'Study not found')), card(null, empty('That Sunday isn’t in a semester.'))];
  watchComments(k);
  const editing = view.editing === k;
  return [
    h('div', { class: 'page-head' }, back, h('div', { class: 'grow' }, h('div', { class: 'muted small' }, fmtLong(k)), h('h1', null, s.plan?.title || (editing ? 'Study plan' : 'No plan yet'))),
      editing ? null : h('button', { class: 'btn primary', onclick: () => { view.editing = k; window.dispatchEvent(new HashChangeEvent('hashchange')); } }, hasPlan(s) ? 'Edit' : 'Add plan')),
    s.status === 'nostudy' ? h('p', { class: 'pill muted' }, 'This Sunday is marked “No study”.') : null,
    h('div', { class: 'grid2' },
      h('div', null, editing ? planForm(s) : planView(s)),
      h('div', null, commentsCard(k), historyCard(k), k <= todayKey() ? card(null, h('a', { href: `#/reports/week/${k}` }, `${Object.keys(s.attendees || {}).length} attended — see the weekly report →`)) : null)),
  ];
}

function planView(s) {
  const p = s.plan || {};
  return card(null,
    h('dl', { class: 'plan-dl' },
      h('dt', null, 'Leader'), h('dd', null, s.leaderEmail ? userName(s.leaderEmail) : h('span', { class: 'muted' }, 'Not assigned')),
      h('dt', null, 'Scripture'), h('dd', null, p.scripture || h('span', { class: 'muted' }, '—'))),
    h('h3', null, 'Discussion questions'),
    (p.questions || []).length ? h('ol', { class: 'q-list' }, p.questions.map(q => h('li', null, q))) : empty('No questions yet.'),
    p.notes ? [h('h3', null, 'Notes'), h('div', { class: 'log-notes' }, p.notes)] : null,
    h('h3', null, 'Files & links'),
    (p.links || []).length ? h('ul', { class: 'link-list' }, p.links.map(l => h('li', null,
      h('span', { class: 'tag' }, l.type || 'Link'), ' ', h('a', { href: l.url, target: '_blank', rel: 'noopener' }, l.label || l.url, ' ↗')))) : empty('No files linked.'),
    s.planUpdatedAt instanceof Date ? h('p', { class: 'muted small' }, `Last edited ${fmtDateTime(s.planUpdatedAt)} by ${userName(s.planUpdatedBy)}`) : null);
}

function planForm(s) {
  const p = s.plan || {};
  const leader = select(leaderOpts(s.leaderEmail), s.leaderEmail || '');
  const title = h('input', { value: p.title || '', placeholder: 'e.g. The Prodigal Son' });
  const scripture = h('input', { value: p.scripture || '', placeholder: 'e.g. Luke 15:11–32' });
  const questions = h('textarea', { rows: 7, placeholder: 'One question per line' }, (p.questions || []).join('\n'));
  const notes = h('textarea', { rows: 4, placeholder: 'Leader notes, illustrations, prayer focus…' }, p.notes || '');
  const links = (p.links || []).map(l => ({ ...l }));
  const linkBox = h('div');
  const drawLinks = () => linkBox.replaceChildren(
    ...links.map((l, i) => h('div', { class: 'link-edit' },
      h('input', { value: l.label || '', placeholder: 'Name (e.g. Leader guide)', 'aria-label': 'Link name', oninput: e => (l.label = e.target.value) }),
      h('input', { value: l.url || '', placeholder: 'Paste a Google Drive / Docs / OneDrive link', 'aria-label': 'Link URL', oninput: e => { l.url = e.target.value; } }),
      select(LINK_TYPES, l.type || 'Other', { 'aria-label': 'Type', onchange: e => (l.type = e.target.value) }),
      h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Remove link', onclick: () => { links.splice(i, 1); drawLinks(); } }, '×'))),
    h('button', { class: 'btn small', type: 'button', onclick: () => { links.push({ label: '', url: '', type: 'Google Doc' }); drawLinks(); } }, '+ Add file link'));
  drawLinks();
  const cancel = () => { view.editing = null; markClean(); window.dispatchEvent(new HashChangeEvent('hashchange')); };
  return card('Edit plan',
    h('div', { class: 'form', 'data-form': '' },
      field('Leader', leader), field('Title', title), field('Scripture passage', scripture),
      field('Discussion questions', questions, 'One per line — they’ll show as a numbered list.'),
      field('Notes', notes),
      h('div', { class: 'field' }, h('span', { class: 'field-label' }, 'Files & links'),
        h('span', { class: 'hint' }, 'Put Word docs, slides and PDFs in Google Drive (or OneDrive), set sharing to “Anyone at Lehigh with the link”, and paste the link here. Edits happen in Google, which keeps its own version history.'),
        linkBox)),
    h('div', { class: 'btn-row' },
      h('button', { class: 'btn primary', onclick: async e => {
        e.target.disabled = true;
        try {
          const plan = {
            title: title.value.trim(), scripture: scripture.value.trim(),
            questions: questions.value.split('\n').map(x => x.trim()).filter(Boolean), notes: notes.value.trim(),
            links: links.filter(l => l.url.trim()).map(l => { const url = normalizeUrl(l.url); return { label: l.label.trim() || url, url, type: l.type === 'Other' ? guessLinkType(url) : l.type }; }),
          };
          await savePlan(s.date, plan, leader.value);
          toast('Saved'); view.editing = null; window.dispatchEvent(new HashChangeEvent('hashchange'));
        } finally { e.target.disabled = false; }
      } }, 'Save plan'),
      h('button', { class: 'btn', onclick: cancel }, 'Cancel')));
}

function commentsCard(k) {
  const list = comments.k === k ? comments.list : [];
  const box = h('textarea', { rows: 2, placeholder: 'Add a comment for the other leaders…', 'aria-label': 'Comment' });
  return card(`Comments (${list.length})`,
    list.length ? h('ul', { class: 'log-list' }, list.map(c => h('li', null,
      h('div', { class: 'log-head' }, h('strong', null, c.byName || userName(c.by)), h('span', { class: 'muted small' }, ` · ${fmtDateTime(c.at)}`)),
      h('div', { class: 'log-notes' }, c.text),
      c.by === S.user.email ? h('div', { class: 'log-actions' }, h('button', { class: 'linkish danger', onclick: async () => {
        if (await confirmBox('Delete comment?', 'Remove this comment?', 'Delete', true)) await deleteComment(k, c);
      } }, 'Delete')) : null))) : empty('No comments yet.'),
    box,
    h('div', { class: 'btn-row' }, h('button', { class: 'btn', onclick: async () => {
      if (!box.value.trim()) return;
      await addComment(k, box.value); box.value = ''; toast('Comment added');
    } }, 'Post comment')));
}

function historyCard(k) {
  const body = h('div', null, h('button', { class: 'btn small', onclick: async e => {
    e.target.disabled = true; e.target.textContent = 'Loading…';
    let versions = [];
    try { versions = await getHistory(k); } catch (err) { console.error(err); }
    body.replaceChildren(versions.length ? h('ul', { class: 'set-list' }, versions.map(v => h('li', null,
      h('div', null, h('strong', null, v.plan?.title || 'Untitled'), h('div', { class: 'muted small' }, `Replaced ${fmtDateTime(v.savedAt)} by ${userName(v.replacedBy)}`)),
      h('button', { class: 'btn small', onclick: () => versionModal(k, v) }, 'View')))) : empty('No earlier versions yet — they appear after the plan is edited.'));
  } }, 'Show earlier versions'));
  return card('Version history', h('p', { class: 'muted small' }, 'Every time the plan is saved, the previous version is kept here.'), body);
}

function versionModal(k, v) {
  const p = v.plan || {};
  modal('Earlier version', h('div', null,
    h('p', { class: 'muted small' }, `This version was replaced ${fmtDateTime(v.savedAt)} by ${userName(v.replacedBy)}.`),
    h('dl', { class: 'plan-dl' }, h('dt', null, 'Leader'), h('dd', null, userName(v.leaderEmail) || '—'), h('dt', null, 'Title'), h('dd', null, p.title || '—'), h('dt', null, 'Scripture'), h('dd', null, p.scripture || '—')),
    (p.questions || []).length ? h('ol', { class: 'q-list' }, p.questions.map(q => h('li', null, q))) : null,
    p.notes ? h('div', { class: 'log-notes' }, p.notes) : null,
    (p.links || []).length ? h('ul', { class: 'link-list' }, p.links.map(l => h('li', null, h('a', { href: l.url, target: '_blank', rel: 'noopener' }, l.label || l.url)))) : null), [
    { label: 'Close' },
    { label: 'Restore this version', kind: 'primary', onClick: async () => {
      if (!(await confirmBox('Restore this version?', 'The current plan will be saved to history first, so nothing is lost.', 'Restore'))) return false;
      await restoreVersion(k, v); toast('Restored');
    } },
  ]);
}

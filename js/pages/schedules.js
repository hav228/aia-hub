import { h, card, empty, fmtDate, toast, confirmBox, modal, select, field, go } from '../ui.js';
import {
  S, todayKey, liveSemesters, semesterFor, scheduleFor, exceptionsFor, activeUsers, userName, saveBlock, deleteBlock,
  copySchedule, saveException, trashException, fb,
} from '../store.js';
import {
  SLOTS, SLOT, DAY_START, WEEK_DAYS, DAY_NAMES, CATEGORIES, toMin, endMin, fmtMin, slotStart, busyGrid, findTimes,
  mondayOf, addDays,
} from '../logic.js';

const view = { semId: null, email: null, selected: null, week: 'this', pref: 'any', minLen: 2, cell: null };
const PREFS = { any: [8 * 60, 23 * 60, 'Any time (8am–11pm)'], day: [8 * 60, 17 * 60, 'Daytime (8am–5pm)'], evening: [17 * 60, 23 * 60, 'Evenings (5pm–11pm)'] };
const catClass = c => `cat-${(c || 'Other').toLowerCase()}`;
const dur = slots => { const m = slots * SLOT; return m % 60 ? `${Math.floor(m / 60) ? Math.floor(m / 60) + ' hr ' : ''}${m % 60} min` : `${m / 60} hr${m > 60 ? 's' : ''}`; };

function pickSemester() {
  const sems = liveSemesters();
  const today = todayKey();
  if (!view.semId || !sems.some(s => s.id === view.semId))
    view.semId = (semesterFor(today) || sems.find(s => s.startDate > today) || sems[sems.length - 1])?.id || null;
  return sems.find(s => s.id === view.semId);
}

function tabs(active) {
  return h('div', { class: 'tabs' }, [['person', 'Schedules'], ['find', 'Find a time']].map(([k, l]) =>
    h('a', { href: k === 'find' ? '#/schedules/find' : '#/schedules', class: k === active ? 'active' : '' }, l)));
}

export function renderSchedules(mode, arg) {
  const sem = pickSemester();
  const head = h('div', { class: 'page-head' }, h('a', { class: 'btn icon', href: '#/more', 'aria-label': 'Back' }, '‹'), h('h1', null, 'Schedules'));
  if (!sem) return [head, card(null, empty('Add a semester in Settings first.'))];
  const semSel = select(liveSemesters().reverse().map(s => [s.id, s.name]), sem.id, { 'aria-label': 'Semester' });
  semSel.onchange = () => { view.semId = semSel.value; window.dispatchEvent(new HashChangeEvent('hashchange')); };
  if (mode === 'find') return [head, tabs('find'), h('div', { class: 'filters' }, semSel), finder(sem)];
  if (mode === 'person' && arg) view.email = arg;
  return [head, tabs('person'), personView(sem, semSel)];
}

// ======================= one person's schedule =======================
function personView(sem, semSel) {
  const users = activeUsers();
  if (!view.email || !users.some(u => u.email === view.email)) view.email = users.some(u => u.email === S.user.email) ? S.user.email : users[0]?.email;
  const email = view.email;
  const who = select(users.map(u => [u.email, `${u.name || u.email}${u.email === S.user.email ? ' (you)' : ''}`]), email, { 'aria-label': 'Person' });
  who.onchange = () => go(`schedules/person/${encodeURIComponent(who.value)}`);
  const sched = scheduleFor(sem.id, email);
  const blocks = sched?.blocks || [];
  const sems = liveSemesters();
  const prev = sems[sems.indexOf(sems.find(s => s.id === sem.id)) - 1];
  const prevBlocks = prev ? scheduleFor(prev.id, email)?.blocks || [] : [];

  const grid = weekGrid({ blocks, onBlock: b => blockModal(sem, email, b), onEmpty: (day, slot) => blockModal(sem, email, null, { days: [day], start: hhmm(slotStart(slot)), end: hhmm(slotStart(slot) + 60) }) });
  const status = users.map(u => {
    const n = scheduleFor(sem.id, u.email)?.blocks?.length || 0;
    return h('a', { href: `#/schedules/person/${encodeURIComponent(u.email)}`, class: `who-chip${u.email === email ? ' active' : ''}${n ? '' : ' missing'}` }, `${n ? '✓' : '○'} ${u.name || u.email}`);
  });

  return [
    h('div', { class: 'filters' }, who, semSel),
    card(null,
      h('div', { class: 'row-between' }, h('div', null, h('strong', null, `${userName(email)} · ${sem.name}`),
        h('div', { class: 'muted small' }, !blocks.length ? 'Nothing entered yet' : `${blocks.length} item${blocks.length > 1 ? 's' : ''}${sched?.updatedAt instanceof Date ? ` · updated ${sched.updatedAt.toLocaleDateString()} by ${userName(sched.updatedBy)}` : ''}`)),
        h('button', { class: 'btn primary', onclick: () => blockModal(sem, email) }, '+ Add')),
      !blocks.length && prevBlocks.length ? h('button', { class: 'notice', onclick: async () => { await copySchedule(prev.id, sem.id, email); toast('Copied — now adjust anything that changed'); } },
        `Copy ${prevBlocks.length} items from ${prev.name} to start →`) : null,
      h('p', { class: 'muted small' }, 'Your usual week: classes, practices, lifts, work… Tap an empty spot to add, or tap something to change it.'),
      grid),
    exceptionsCard(email),
    card(`Who has entered a ${sem.name} schedule`, h('div', { class: 'chip-list' }, status)),
  ];
}

const hhmm = min => `${String(Math.floor(min / 60) % 24).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`;

function blockModal(sem, email, b, preset = {}) {
  const v = b || { days: [], category: 'Class', start: '09:00', end: '10:00', ...preset };
  const label = h('input', { value: v.label || '', placeholder: 'e.g. ECO 001, Practice, Lift' });
  const cat = select(CATEGORIES, v.category || 'Class');
  const days = new Set(v.days || []);
  const dayBtns = h('div', { class: 'day-toggles', role: 'group', 'aria-label': 'Days' }, WEEK_DAYS.map(d => {
    const btn = h('button', { type: 'button', class: `day-toggle${days.has(d) ? ' on' : ''}`, 'aria-pressed': days.has(d) ? 'true' : 'false' }, DAY_NAMES[d]);
    btn.onclick = () => { days.has(d) ? days.delete(d) : days.add(d); btn.classList.toggle('on'); btn.setAttribute('aria-pressed', days.has(d)); };
    return btn;
  }));
  const start = h('input', { type: 'time', value: v.start, step: 300 });
  const end = h('input', { type: 'time', value: v.end, step: 300 });
  const actions = [{ label: 'Cancel' }];
  if (b) actions.push({ label: 'Delete', kind: 'danger-outline', onClick: async () => {
    if (!(await confirmBox('Remove this?', `Remove “${b.label || b.category}” from the weekly schedule?`, 'Remove', true))) return false;
    await deleteBlock(sem.id, email, b); toast('Removed');
  } });
  actions.push({ label: 'Save', kind: 'primary', onClick: async () => {
    if (!days.size) { toast('Pick at least one day', 'err'); return false; }
    if (!start.value || !end.value || (toMin(end.value) <= toMin(start.value) && end.value !== '00:00')) { toast('End time must be after start time', 'err'); return false; }
    const data = { id: b?.id || fb.newId('x'), label: label.value.trim(), category: cat.value, days: WEEK_DAYS.filter(d => days.has(d)), start: start.value, end: end.value };
    await saveBlock(sem.id, email, data, !b); toast('Saved');
  } });
  modal(b ? 'Edit weekly item' : `Add to ${userName(email)}'s week`, h('div', { class: 'form' },
    h('div', { class: 'row2' }, field('What', label), field('Type', cat)),
    h('div', { class: 'field' }, h('span', { class: 'field-label' }, 'Days'), dayBtns),
    h('div', { class: 'row2' }, field('Starts', start), field('Ends', end))), actions);
}

function exceptionsCard(email) {
  const today = todayKey();
  const list = exceptionsFor(email).sort((a, b) => a.startDate < b.startDate ? -1 : 1);
  const upcoming = list.filter(x => (x.endDate || x.startDate) >= today), past = list.filter(x => (x.endDate || x.startDate) < today);
  const row = x => h('li', null,
    h('div', null, h('strong', null, x.label || (x.type === 'busy' ? 'Busy' : 'Free')), h('span', { class: `tag ${x.type === 'busy' ? 'g-cold' : 'g-regular'}` }, x.type === 'busy' ? 'Busy' : 'Free'),
      h('div', { class: 'muted small' }, `${fmtDate(x.startDate)}${x.endDate && x.endDate !== x.startDate ? ` – ${fmtDate(x.endDate)}` : ''} · ${x.allDay ? 'all day' : `${fmtMin(toMin(x.start))}–${fmtMin(endMin(x.start, x.end))}`}`)),
    h('button', { class: 'btn small', onclick: () => exceptionModal(email, x) }, 'Edit'));
  return card('One-time changes',
    h('p', { class: 'muted small' }, 'Away games, travel, exam weeks, or a class that’s cancelled. These only apply to those dates.'),
    upcoming.length ? h('ul', { class: 'set-list' }, upcoming.map(row)) : empty('None coming up.'),
    past.length ? h('details', null, h('summary', { class: 'small' }, `Past (${past.length})`), h('ul', { class: 'set-list' }, past.reverse().map(row))) : null,
    h('button', { class: 'btn primary', onclick: () => exceptionModal(email) }, '+ Add one-time change'));
}

function exceptionModal(email, x) {
  const today = todayKey();
  const label = h('input', { value: x?.label || '', placeholder: 'e.g. Away at Navy, Finals week' });
  const type = select([['busy', 'Busy (away game, exam, travel)'], ['free', 'Free (no class / practice cancelled)']], x?.type || 'busy');
  const sd = h('input', { type: 'date', value: x?.startDate || today });
  const ed = h('input', { type: 'date', value: x?.endDate || '' });
  const allDay = h('input', { type: 'checkbox', checked: x ? !!x.allDay : true });
  const st = h('input', { type: 'time', value: x?.start || '15:00', step: 300 });
  const et = h('input', { type: 'time', value: x?.end || '18:00', step: 300 });
  const times = h('div', { class: 'row2' }, field('From', st), field('To', et));
  const sync = () => (times.hidden = allDay.checked); allDay.onchange = sync; sync();
  const actions = [{ label: 'Cancel' }];
  if (x) actions.push({ label: 'Delete', kind: 'danger-outline', onClick: async () => { await trashException(x); toast('Moved to Trash'); } });
  actions.push({ label: 'Save', kind: 'primary', onClick: async () => {
    if (!sd.value) { toast('Pick a date', 'err'); return false; }
    if (ed.value && ed.value < sd.value) { toast('End date is before start date', 'err'); return false; }
    if (!allDay.checked && toMin(et.value) <= toMin(st.value) && et.value !== '00:00') { toast('End time must be after start time', 'err'); return false; }
    await saveException(x, { userEmail: email, label: label.value.trim(), type: type.value, startDate: sd.value, endDate: ed.value && ed.value !== sd.value ? ed.value : '',
      allDay: allDay.checked, start: allDay.checked ? '' : st.value, end: allDay.checked ? '' : et.value });
    toast('Saved');
  } });
  modal(x ? 'Edit one-time change' : `One-time change for ${userName(email)}`, h('div', { class: 'form' },
    field('What', label), field('This makes them…', type),
    h('div', { class: 'row2' }, field('Date', sd), field('Until (optional)', ed, 'For multi-day trips or exam week')),
    h('label', { class: 'check' }, allDay, ' All day'), times), actions);
}

// ======================= weekly grid =======================
/** blocks mode: {blocks, onBlock, onEmpty}; heat mode: {heat:{counts,n,best,onCell}} */
function weekGrid({ blocks, onBlock, onEmpty, heat }) {
  const cols = WEEK_DAYS.map(d => {
    const col = h('div', { class: 'wk-col', 'data-day': d });
    if (heat) {
      for (let i = 0; i < SLOTS; i++) {
        const c = heat.counts[d][i], frac = heat.n ? c / heat.n : 0;
        const cell = h('button', { type: 'button', class: `wk-cell${c === heat.n && heat.n ? ' all' : ''}`, style: `background:${heatColor(frac)}`,
          'aria-label': `${DAY_NAMES[d]} ${fmtMin(slotStart(i))}: ${c} of ${heat.n} free` });
        cell.onclick = () => heat.onCell(d, i);
        col.append(cell);
      }
      heat.best.forEach((w, k) => w.day === d && col.append(h('div', { class: 'wk-best', style: `top:calc(var(--slot) * ${w.startSlot});height:calc(var(--slot) * ${w.endSlot - w.startSlot})` }, h('span', null, k + 1))));
    } else {
      col.classList.add('lines');
      if (onEmpty) col.onclick = e => { if (e.target !== col) return; const r = col.getBoundingClientRect(); onEmpty(d, Math.max(0, Math.min(SLOTS - 2, Math.floor((e.clientY - r.top) / (r.height / SLOTS))))); };
      const items = (blocks || []).filter(b => (b.days || []).includes(d)).map(b => ({ b, s: Math.max(toMin(b.start), DAY_START), e: endMin(b.start, b.end) }))
        .filter(x => x.e > DAY_START).sort((a, b) => a.s - b.s || b.e - a.e);
      const lanes = [];
      for (const it of items) { let l = lanes.findIndex(end => end <= it.s); if (l < 0) { l = lanes.length; lanes.push(0); } lanes[l] = it.e; it.lane = l; }
      for (const it of items) {
        const top = (it.s - DAY_START) / SLOT, ht = (it.e - it.s) / SLOT, w = 100 / lanes.length;
        col.append(h('button', { type: 'button', class: `wk-block ${catClass(it.b.category)}`, title: `${it.b.label || it.b.category} ${fmtMin(toMin(it.b.start))}–${fmtMin(it.e)}`,
          style: `top:calc(var(--slot) * ${top});height:calc(var(--slot) * ${ht} - 2px);left:${it.lane * w}%;width:calc(${w}% - 2px)`, onclick: () => onBlock(it.b) },
          h('span', { class: 'wk-label' }, it.b.label || it.b.category), ht >= 2 ? h('span', { class: 'wk-time' }, fmtMin(toMin(it.b.start))) : null));
      }
    }
    return col;
  });
  const times = h('div', { class: 'wk-times' }, Array.from({ length: SLOTS / 2 }, (_, i) => h('div', { class: 'wk-t' }, fmtMin(DAY_START + i * 60))));
  return h('div', { class: `wk${heat ? ' heat' : ''}` },
    h('div', { class: 'wk-head' }, h('div'), WEEK_DAYS.map(d => h('div', { class: 'wk-day' }, DAY_NAMES[d]))),
    h('div', { class: 'wk-body' }, times, cols));
}

// sequential scale: light (nobody free) → Lehigh brown (everyone free)
function heatColor(f) {
  const a = [247, 241, 234], b = [107, 58, 30];
  const t = Math.pow(f, 1.2);
  return `rgb(${a.map((x, i) => Math.round(x + (b[i] - x) * t)).join(',')})`;
}

// ======================= find a time =======================
function finder(sem) {
  const users = activeUsers();
  if (!view.selected) view.selected = new Set(users.map(u => u.email));
  for (const e of [...view.selected]) if (!users.some(u => u.email === e)) view.selected.delete(e);
  const thisMon = mondayOf(todayKey());
  const weekOpts = [['typical', 'Typical week (no one-time changes)'], ...Array.from({ length: 10 }, (_, i) => {
    const m = addDays(thisMon, i * 7);
    return [m, `${i === 0 ? 'This week' : i === 1 ? 'Next week' : 'Week of'} · ${fmtDate(m, { month: 'short', day: 'numeric' })}–${fmtDate(addDays(m, 6), { month: 'short', day: 'numeric' })}`];
  })];
  if (view.week === 'this') view.week = thisMon;
  if (!weekOpts.some(o => o[0] === view.week)) view.week = thisMon;
  const weekMon = view.week === 'typical' ? null : view.week;
  const rerender = () => window.dispatchEvent(new HashChangeEvent('hashchange'));

  const chips = h('div', { class: 'chip-list' }, users.map(u => {
    const on = view.selected.has(u.email);
    return h('button', { type: 'button', class: `who-chip${on ? ' active' : ''}`, 'aria-pressed': on ? 'true' : 'false',
      onclick: () => { on ? view.selected.delete(u.email) : view.selected.add(u.email); view.cell = null; rerender(); } }, `${on ? '✓ ' : ''}${u.name || u.email}`);
  }));
  const weekSel = select(weekOpts, view.week, { 'aria-label': 'Week' }); weekSel.onchange = () => { view.week = weekSel.value; view.cell = null; rerender(); };
  const prefSel = select(Object.entries(PREFS).map(([k, v]) => [k, v[2]]), view.pref, { 'aria-label': 'Time of day' }); prefSel.onchange = () => { view.pref = prefSel.value; rerender(); };
  const lenSel = select([['1', 'At least 30 min'], ['2', 'At least 1 hour'], ['3', 'At least 1.5 hours'], ['4', 'At least 2 hours']], String(view.minLen), { 'aria-label': 'Length' });
  lenSel.onchange = () => { view.minLen = Number(lenSel.value); rerender(); };

  const chosen = users.filter(u => view.selected.has(u.email));
  const people = chosen.map(u => ({ id: u.email, name: u.name || u.email, grid: busyGrid(scheduleFor(sem.id, u.email)?.blocks, exceptionsFor(u.email), weekMon) }));
  const missing = chosen.filter(u => !(scheduleFor(sem.id, u.email)?.blocks?.length));
  const [pf, pt] = PREFS[view.pref];
  const r = findTimes(people, { minSlots: view.minLen, prefFrom: pf, prefTo: pt, max: 5 });
  const dayDate = d => weekMon ? ` ${fmtDate(addDays(weekMon, WEEK_DAYS.indexOf(d)), { month: 'short', day: 'numeric' })}` : '';

  const info = h('div', { class: 'cell-info', 'aria-live': 'polite' });
  const showCell = (d, i) => {
    view.cell = [d, i];
    const freeIds = r.free[d][i];
    info.replaceChildren(h('strong', null, `${DAY_NAMES[d]}${dayDate(d)} at ${fmtMin(slotStart(i))}: ${freeIds.length} of ${r.n} free`),
      h('div', { class: 'small' }, h('span', { class: 'muted' }, 'Free: '), freeIds.map(userName).join(', ') || '—'),
      h('div', { class: 'small' }, h('span', { class: 'muted' }, 'Busy: '), people.filter(p => !freeIds.includes(p.id)).map(p => p.name).join(', ') || '—'));
  };
  if (view.cell) setTimeout(() => showCell(...view.cell));
  else info.append(h('span', { class: 'muted small' }, 'Tap any square to see who’s free.'));

  return h('div', null,
    card('Who needs to meet?', chips,
      h('div', { class: 'btn-row' },
        h('button', { class: 'btn small', onclick: () => { view.selected = new Set(users.map(u => u.email)); rerender(); } }, 'Everyone'),
        h('button', { class: 'btn small', onclick: () => { view.selected = new Set(users.filter(u => (u.role || 'Leader') === 'Leader').map(u => u.email)); rerender(); } }, 'Leaders only'),
        h('button', { class: 'btn small', onclick: () => { view.selected = new Set(); rerender(); } }, 'Clear')),
      missing.length ? h('p', { class: 'warn small' }, `No ${sem.name} schedule yet for ${missing.map(u => u.name || u.email).join(', ')} — they’ll look free all week.`) : null),
    h('div', { class: 'filters' }, weekSel, prefSel, lenSel),
    card('Best times',
      !r.n ? empty('Pick at least one person.')
        : r.best.length ? [
          r.level === 'allButOne' ? h('p', { class: 'warn small' }, 'There’s no time when everyone is free, so these are times when all but one person is free.') : null,
          h('ol', { class: 'best-list' }, r.best.map(w => h('li', null,
            h('button', { class: 'linkish strong', onclick: () => showCell(w.day, w.startSlot) }, `${DAY_NAMES[w.day]}${dayDate(w.day)}, ${fmtMin(w.start)}–${fmtMin(w.end)}`),
            h('span', { class: 'muted small' }, ` · ${dur(w.endSlot - w.startSlot)}${w.busyIds.length ? ` · ${w.busyIds.map(userName).join(', ')} busy` : ' · everyone free'}`))))]
          : empty('No shared free time that long. Try a shorter length or a different time of day.')),
    card(null, h('div', { class: 'heat-legend small' }, h('span', null, 'Nobody free'), h('span', { class: 'heat-bar' }), h('span', null, 'Everyone free'), h('span', { class: 'best-key' }, '1'), h('span', null, 'Best times')),
      weekGrid({ heat: { counts: r.counts, n: r.n, best: r.best, onCell: showCell } }), info));
}

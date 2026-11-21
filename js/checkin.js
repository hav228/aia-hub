// Public check-in form. No login. Can only ADD a check-in (see firestore.rules).
import { addOne, getMany, NOW, setPrefix } from './fb.js';
import { useOrg } from './org.js';
import { parseKey } from './logic.js';

const $ = s => document.querySelector(s);
const params = new URLSearchParams(location.search);
const ORG = useOrg(params.get('o') || 'aia');
setPrefix(ORG.prefix);
const d = params.get('d') || '', t = params.get('t') || '';
const form = $('#ci-form'), msg = $('#ci-msg'), err = $('#ci-error');
const SAVE_KEY = `${ORG.key}-checkin-me`, DONE_KEY = `${ORG.key}-checked-${d}`;
document.title = `${ORG.short} Check-in`;
document.body.dataset.org = ORG.key;
document.querySelector('.ci-head .logo').textContent = ORG.short;
document.querySelector('.ci-title').textContent = `${ORG.dayName} Night Check-in`;
if (!ORG.hasTeams) { document.getElementById('sport-wrap').hidden = true; form.teamId.required = false; }
document.querySelector('#new-fields .muted').textContent = `First time here? Leave your number so we can stay in touch (optional — only ${ORG.short} leaders and staff can see it).`;
const store = {
  get(k) { try { return JSON.parse(localStorage.getItem(k)); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* private mode */ } },
};

function show(html) { msg.innerHTML = html; msg.hidden = false; form.hidden = true; }

if (!/^\d{4}-\d{2}-\d{2}$/.test(d) || !t) {
  show('<h2>Hmm, this link isn’t complete</h2><p>Please scan the QR code again, or ask a leader for the link.</p>');
} else {
  $('#ci-date').textContent = parseKey(d).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
  init();
}

async function init(force = false) {
  if (!force && store.get(DONE_KEY)) return doneScreen(store.get(DONE_KEY));
  const sel = form.teamId;
  if (ORG.hasTeams) try {
    const teams = (await getMany('teams')).filter(x => x.active !== false)
      .sort((a, b) => (a.sortOrder ?? 999) - (b.sortOrder ?? 999) || a.name.localeCompare(b.name));
    sel.innerHTML = '<option value="">Choose…</option>' + teams.map(x => `<option value="${x.id}">${x.name.replace(/</g, '&lt;')}</option>`).join('') + '<option value="other">Other</option>';
  } catch (e) {
    console.error(e);
    sel.innerHTML = '<option value="">Choose…</option><option value="other">Other</option>';
  } else sel.innerHTML = '<option value="" selected></option>';
  const me = store.get(SAVE_KEY);
  if (me) {
    for (const k of ['firstName', 'lastName', 'classYear', 'teamOther', 'phone', 'email']) if (me[k]) form[k].value = me[k];
    if (me.teamId && [...sel.options].some(o => o.value === me.teamId)) sel.value = me.teamId;
    $('#ci-returning').hidden = false;
    $('#new-fields').hidden = true;
  }
  const syncOther = () => ($('#other-wrap').hidden = sel.value !== 'other');
  sel.addEventListener('change', syncOther); syncOther();
  form.hidden = false;
}

form.addEventListener('submit', async e => {
  e.preventDefault();
  err.hidden = true;
  const v = k => (form[k].value || '').trim();
  const data = {
    sundayDate: d, token: t, firstName: v('firstName'), lastName: v('lastName'), classYear: v('classYear'),
    teamId: v('teamId'), teamOther: v('teamId') === 'other' ? v('teamOther') : '', phone: v('phone'), email: v('email'),
    status: 'pending', submittedAt: NOW,
  };
  const missing = [!data.firstName && 'first name', !data.lastName && 'last name', !data.classYear && 'class year', ORG.hasTeams && !data.teamId && 'sport',
    data.teamId === 'other' && !data.teamOther && 'which sport'].filter(Boolean);
  if (missing.length) { err.textContent = `Please fill in: ${missing.join(', ')}.`; err.hidden = false; return; }
  const btn = form.querySelector('button[type=submit]');
  btn.disabled = true; btn.textContent = 'Checking in…';
  const slow = setTimeout(() => { btn.textContent = 'Still sending… (weak signal?) keep this open'; }, 8000);
  try {
    await addOne('checkins', data);
    if (!form.dataset.someoneElse) store.set(SAVE_KEY, { ...data, token: undefined, sundayDate: undefined, status: undefined, submittedAt: undefined });
    store.set(DONE_KEY, data.firstName);
    doneScreen(data.firstName);
  } catch (e2) {
    console.error(e2);
    err.textContent = e2.code === 'permission-denied'
      ? `This check-in isn’t open right now. It opens ${ORG.dayName} evening for that week — if you’re there now, ask a leader.`
      : 'Couldn’t check in — please try again.';
    err.hidden = false;
  } finally { clearTimeout(slow); btn.disabled = false; btn.textContent = 'Check in'; }
});

function doneScreen(name) {
  show(`<div class="center"><div class="done-mark" aria-hidden="true">✓</div><h2>You’re checked in${name ? `, ${String(name).replace(/</g, '&lt;')}` : ''}!</h2>
    <p class="muted">Glad you’re here tonight.</p>
    <button class="btn" id="someone-else" type="button">Check in someone else</button></div>`);
  $('#someone-else').onclick = () => {
    form.reset(); form.dataset.someoneElse = '1';
    $('#ci-returning').hidden = true; $('#new-fields').hidden = false; $('#other-wrap').hidden = true;
    msg.hidden = true;
    if (form.teamId.options.length <= 1) init(true).then(() => { form.reset(); $('#ci-returning').hidden = true; $('#new-fields').hidden = false; });
    else form.hidden = false;
  };
}

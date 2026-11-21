import * as fb from './fb.js';
import { S, stop, onChange, checkAccess, switchOrg, preferredOrg, orgChoices } from './store.js';
import { ORG } from './org.js';
import { h, modalState, toast, formState } from './ui.js';
import { firebaseConfig } from './firebase-config.js';
import { renderWeek } from './pages/week.js';
import { renderPeople, renderPerson } from './pages/people.js';
import { renderReview } from './pages/review.js';
import { renderReports } from './pages/reports.js';
import { renderSettings, renderMore } from './pages/settings.js';
import { renderActivity } from './pages/activity.js';
import { renderTrash } from './pages/trash.js';
import { renderOutreach } from './pages/outreach.js';
import { renderSchedules } from './pages/schedules.js';
import { renderStudies, renderStudy } from './pages/studies.js';

const root = document.getElementById('app');
const routes = {
  week: renderWeek, people: renderPeople, person: renderPerson, review: renderReview,
  outreach: renderOutreach, schedules: renderSchedules, studies: renderStudies, study: renderStudy, reports: renderReports, settings: renderSettings, more: renderMore, activity: renderActivity, trash: renderTrash,
};
const NAV = () => [
  ['week', 'This Week', '📅'], ['studies', ORG.plansNav, '📖'], ['people', 'People', '👥'], ['outreach', 'Outreach', '💬'], ['reports', 'Reports', '📊'], ['more', 'More', '☰'],
];

export function parseRoute() {
  const [name, ...args] = (location.hash.replace(/^#\/?/, '') || 'week').split('/');
  return { name: routes[name] ? name : 'week', args: args.map(decodeURIComponent) };
}


function shell(content, routeName) {
  const reviewCount = S.review.length;
  const nav = h('nav', { class: 'nav', 'aria-label': 'Main' }, NAV().map(([r, label, icon]) => {
    const active = r === routeName || (r === 'people' && routeName === 'person') || (r === 'studies' && routeName === 'study') || (r === 'more' && ['settings', 'activity', 'trash', 'schedules', 'review'].includes(routeName));
    return h('a', { href: `#/${r}`, class: active ? 'active' : '', 'aria-current': active ? 'page' : null },
      h('span', { class: 'nav-icon', 'aria-hidden': 'true' }, icon), h('span', null, label),
      r === 'more' && reviewCount ? h('span', { class: 'badge', 'aria-label': `${reviewCount} to review` }, reviewCount) : null);
  }));
  return [
    h('header', { class: `topbar org-${ORG.key}` }, h('div', { class: 'brand' }, h('span', { class: 'logo' }, ORG.short), h('span', { class: 'brand-name' }, ORG.name), orgSwitcher()), nav),
    h('main', { id: 'main' }, content),
  ];
}

function orgSwitcher() {
  const orgs = orgChoices();
  if (orgs.length < 2) return null;
  return h('div', { class: 'org-switch', role: 'group', 'aria-label': 'Ministry' }, orgs.map(o =>
    h('button', { type: 'button', class: o.key === ORG.key ? 'on' : '', 'aria-pressed': o.key === ORG.key ? 'true' : 'false',
      onclick: () => { if (o.key === ORG.key) return; switchOrg(o.key); render(true); } }, o.short)));
}

let renderTimer = null, pendingRender = false, lastRouteKey = '';
function inputFocused() {
  const a = document.activeElement;
  return a && root.contains(a) && ['INPUT', 'TEXTAREA', 'SELECT'].includes(a.tagName);
}
export function render(force = false) {
  if (!S.user || !S.me) return;
  if (!force && (modalState.open || inputFocused() || formState.dirty)) { pendingRender = true; return; }
  pendingRender = false; formState.dirty = false;
  const { name, args } = parseRoute();
  const key = location.hash;
  const scroll = key === lastRouteKey ? window.scrollY : 0;
  lastRouteKey = key;
  let content;
  if (!S.ready) content = h('div', { class: 'loading' }, 'Loading…');
  else {
    try { content = routes[name](...args); }
    catch (e) { console.error(e); content = h('div', { class: 'card error' }, 'Something went wrong on this page: ', e.message); }
  }
  document.body.dataset.org = ORG.key;
  root.replaceChildren(...shell(content, name));
  window.scrollTo(0, scroll);
}
const scheduleRender = () => { clearTimeout(renderTimer); renderTimer = setTimeout(() => render(), 120); };
modalState.onClose.push(() => pendingRender && scheduleRender());
formState.onClean = () => pendingRender && scheduleRender();
document.addEventListener('focusout', () => setTimeout(() => pendingRender && !inputFocused() && scheduleRender(), 50));
window.addEventListener('hashchange', () => render(true));
onChange(scheduleRender);

function loginScreen(msg) {
  root.replaceChildren(h('div', { class: 'login' },
    h('div', { class: 'logo big' }, 'AIA · Cru'),
    h('h1', null, 'Lehigh Leaders Hub'),
    h('p', null, 'Sign in with the Google account a leader added for you (your Lehigh email works).'),
    msg ? h('p', { class: 'warn' }, msg) : null,
    h('button', { class: 'btn primary big', onclick: async () => {
      try { await fb.signIn(); } catch (e) { if (e.code !== 'auth/popup-closed-by-user') toast(e.message, 'err'); }
    } }, 'Sign in with Google'),
    h('p', { class: 'muted small' }, 'Attendees don’t need to sign in — they just scan the weekly QR code.')));
}

if (String(firebaseConfig.apiKey).includes('PASTE')) {
  root.replaceChildren(h('div', { class: 'login' }, h('h1', null, 'Almost there'),
    h('p', null, 'Paste your Firebase config into js/firebase-config.js (see SETUP.md, step 1), then upload it again.')));
} else fb.onAuth(async user => {
  if (!user) { stop(); S.user = S.me = null; loginScreen(); return; }
  root.replaceChildren(h('div', { class: 'loading' }, 'Checking access…'));
  let ok = false;
  try { ok = await checkAccess(user); } catch (e) { console.error(e); }
  if (!ok) {
    loginScreen(`${user.email} isn’t on the AIA or Cru leader list yet. Ask a leader to add you in More → Settings → Leaders & staff, then try again.`);
    root.querySelector('.login').append(h('button', { class: 'btn', onclick: () => fb.signOut() }, 'Use a different account'));
    return;
  }
  switchOrg(preferredOrg());
  render(true);
});

export { fb };

import * as fb from './fb.js';
import { S, start, stop, onChange, checkAccess } from './store.js';
import { h, modalState, toast } from './ui.js';
import { GROUP_NAME, firebaseConfig } from './firebase-config.js';
import { renderWeek } from './pages/week.js';
import { renderPeople, renderPerson } from './pages/people.js';
import { renderReview } from './pages/review.js';
import { renderReports } from './pages/reports.js';
import { renderSettings, renderMore } from './pages/settings.js';
import { renderActivity } from './pages/activity.js';
import { renderTrash } from './pages/trash.js';

const root = document.getElementById('app');
const routes = {
  week: renderWeek, people: renderPeople, person: renderPerson, review: renderReview,
  reports: renderReports, settings: renderSettings, more: renderMore, activity: renderActivity, trash: renderTrash,
};
const NAV = [
  ['week', 'This Week', '📅'], ['people', 'People', '👥'], ['reports', 'Reports', '📊'], ['review', 'Review', '✅'], ['more', 'More', '☰'],
];

export function parseRoute() {
  const [name, ...args] = (location.hash.replace(/^#\/?/, '') || 'week').split('/');
  return { name: routes[name] ? name : 'week', args: args.map(decodeURIComponent) };
}


function shell(content, routeName) {
  const reviewCount = S.review.length;
  const nav = h('nav', { class: 'nav', 'aria-label': 'Main' }, NAV.map(([r, label, icon]) => {
    const active = r === routeName || (r === 'people' && routeName === 'person') || (r === 'more' && ['settings', 'activity', 'trash'].includes(routeName));
    return h('a', { href: `#/${r}`, class: active ? 'active' : '', 'aria-current': active ? 'page' : null },
      h('span', { class: 'nav-icon', 'aria-hidden': 'true' }, icon), h('span', null, label),
      r === 'review' && reviewCount ? h('span', { class: 'badge', 'aria-label': `${reviewCount} to review` }, reviewCount) : null);
  }));
  return [
    h('header', { class: 'topbar' }, h('div', { class: 'brand' }, h('span', { class: 'logo' }, 'AIA'), GROUP_NAME), nav),
    h('main', { id: 'main' }, content),
  ];
}

let renderTimer = null, pendingRender = false, lastRouteKey = '';
function inputFocused() {
  const a = document.activeElement;
  return a && root.contains(a) && ['INPUT', 'TEXTAREA', 'SELECT'].includes(a.tagName);
}
export function render(force = false) {
  if (!S.user || !S.me) return;
  if (!force && (modalState.open || inputFocused())) { pendingRender = true; return; }
  pendingRender = false;
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
  root.replaceChildren(...shell(content, name));
  window.scrollTo(0, scroll);
}
const scheduleRender = () => { clearTimeout(renderTimer); renderTimer = setTimeout(() => render(), 120); };
modalState.onClose.push(() => pendingRender && scheduleRender());
document.addEventListener('focusout', () => setTimeout(() => pendingRender && !inputFocused() && scheduleRender(), 50));
window.addEventListener('hashchange', () => render(true));
onChange(scheduleRender);

function loginScreen(msg) {
  root.replaceChildren(h('div', { class: 'login' },
    h('div', { class: 'logo big' }, 'AIA'),
    h('h1', null, `${GROUP_NAME} Leaders`),
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
    loginScreen(`${user.email} isn’t on the leader list yet. Ask a leader to add you in More → Settings → Leaders & staff, then try again.`);
    root.querySelector('.login').append(h('button', { class: 'btn', onclick: () => fb.signOut() }, 'Use a different account'));
    return;
  }
  start();
  render(true);
});

export { fb };

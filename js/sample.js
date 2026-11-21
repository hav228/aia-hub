// Sample data for trying the app. Everything created here is tagged sample:true (or planSample:true)
// so "Remove sample data" can take it all out again without touching real data.
import * as fb from './fb.js';
import { NOW, DELETE } from './fb.js';
import { S, todayKey, liveSemesters, semesterFor, log, ensureSundays, scheduleId } from './store.js';
import { sundaysBetween, schoolYearOf, schoolYearLabel, addDays, checkinWindow, randomToken, normalizeName } from './logic.js';

const LEADERS = [
  ['jordan.reyes@example.com', 'Jordan Reyes (sample)', 'Leader'],
  ['maya.chen@example.com', 'Maya Chen (sample)', 'Leader'],
  ['tyler.brooks@example.com', 'Tyler Brooks (sample)', 'Leader'],
  ['abby.nolan@example.com', 'Abby Nolan (sample)', 'Leader'],
  ['coach.mark@example.com', 'Mark Davis — AIA staff (sample)', 'Staff'],
];
const NAMES = ['Ethan Parker', 'Olivia Bennett', 'Noah Sullivan', 'Ava Mitchell', 'Liam Foster', 'Emma Hayes', 'Mason Reed', 'Sophia Ward',
  'Lucas Gray', 'Isabella Price', 'Owen Murphy', 'Mia Russell', 'Caleb Hughes', 'Grace Coleman', 'Henry Barnes', 'Lily Jenkins',
  'Jack Perry', 'Chloe Powell', 'Wyatt Long', 'Ella Patterson', 'Levi Simmons', 'Avery Butler', 'Carter Flores', 'Zoe Henderson',
  'Isaac Bryant', 'Hannah Griffin', 'Gavin Diaz', 'Leah Myers', 'Eli Ford', 'Nora Hamilton', 'Jude Graham', 'Ruby Wallace'];
const PERSONAS = [...Array(10).fill('regular'), ...Array(6).fill('occasional'), ...Array(4).fill('dropping'), ...Array(3).fill('cold'), ...Array(4).fill('new'), ...Array(5).fill('potential')];
const YEARS = ['Freshman', 'Sophomore', 'Junior', 'Senior', 'Grad'];
const STUDIES = [
  ['Who Do You Say I Am?', 'Matthew 16:13–20', ['Who do people around campus say Jesus is?', 'Why do you think Jesus asked the disciples this directly?', 'How would you answer His question today?', 'What changes if Peter’s answer is true?']],
  ['The Prodigal Son', 'Luke 15:11–32', ['Which son do you relate to more, and why?', 'What does the father’s response show us about God?', 'Where do you see the older brother’s attitude in team culture?', 'What would “coming home” look like for you this week?']],
  ['Running the Race', 'Hebrews 12:1–3', ['What “weights” slow you down in your sport? In your faith?', 'What does it mean to fix your eyes on Jesus during a hard season?', 'Who is in your “great cloud of witnesses”?']],
  ['Identity Beyond the Game', 'Galatians 2:20', ['How much of your identity is tied to your performance?', 'What would it look like to play from acceptance instead of for it?', 'How do you respond after a bad game?']],
  ['Strength in Weakness', '2 Corinthians 12:7–10', ['Share a time an injury or setback humbled you.', 'Why would God’s power be made perfect in weakness?', 'How can we encourage a teammate who is struggling?']],
  ['The Armor of God', 'Ephesians 6:10–18', ['Which piece of armor do you most need right now?', 'How is spiritual “training” like physical training?', 'What does praying “at all times” look like in a busy athlete schedule?']],
  ['Do Not Be Anxious', 'Philippians 4:4–9', ['What are you most anxious about this season?', 'How is thanksgiving connected to peace?', 'What would you “think about” more if you took verse 8 seriously?']],
  ['The Good Samaritan', 'Luke 10:25–37', ['Who is your “neighbor” on campus?', 'What keeps us from stopping for others?', 'Who is one person you can serve this week?']],
  ['Faith Over Fear', 'Joshua 1:1–9', ['What new challenge are you facing like Joshua?', 'Why does God repeat “be strong and courageous”?', 'How does God’s presence change how we compete?']],
  ['Iron Sharpens Iron', 'Proverbs 27:17; Hebrews 10:24–25', ['Who sharpens you, and who do you sharpen?', 'What makes Christian community different from a team?', 'How can this group spur each other on this week?']],
  ['Rest', 'Matthew 11:28–30', ['When was the last time you truly rested?', 'What is the difference between recovery and rest for the soul?', 'What would taking Jesus’ yoke look like in season?']],
  ['Playing for an Audience of One', 'Colossians 3:17, 23–24', ['Who are you really playing for?', 'How would practice change if you did it “as for the Lord”?', 'What is one area to give your full effort this week?']],
];

function rng(seed) { return () => (seed = (seed * 16807) % 2147483647) / 2147483647; }

export async function hasSampleData() {
  const r = await fb.getMany('people', { where: [['sample', '==', true]], limit: 1 }).catch(() => []);
  return r.length > 0;
}

export async function loadSampleData(progress = () => {}) {
  const today = todayKey(), rand = rng(20261122);
  const ops = [];
  // 1. semesters (only if there are none overlapping these dates)
  progress('Checking semesters…');
  const y = schoolYearOf(today);
  const wanted = [
    { name: `Spring ${y}`, term: 'Spring', year: y, startDate: `${y}-01-19`, endDate: `${y}-05-08` },
    { name: `Fall ${y}`, term: 'Fall', year: y, startDate: `${y}-08-24`, endDate: `${y}-12-12` },
    { name: `Spring ${y + 1}`, term: 'Spring', year: y + 1, startDate: `${y + 1}-01-18`, endDate: `${y + 1}-05-07` },
  ];
  const newSundays = [];
  for (const w of wanted) {
    if (liveSemesters().some(s => s.startDate <= w.endDate && s.endDate >= w.startDate)) continue;
    const id = fb.newId('semesters');
    ops.push({ type: 'set', path: `semesters/${id}`, data: { ...w, schoolYear: schoolYearLabel(schoolYearOf(w.startDate)), deleted: false, sample: true, createdAt: NOW } });
    for (const k of sundaysBetween(w.startDate, w.endDate)) {
      if (S.sundays.some(s => s.date === k)) continue;
      const win = checkinWindow(k, S.settings);
      newSundays.push(k);
      ops.push({ type: 'set', path: `sundays/${k}`, data: { semesterId: id, status: 'scheduled', checkinToken: randomToken(), checkinOpensAt: win.opensAt, checkinClosesAt: win.closesAt, attendees: {}, sample: true, createdAt: NOW } });
    }
  }
  const allSundays = [...new Set([...S.sundays.map(s => s.date), ...newSundays])].sort();
  const statusOf = k => S.sundays.find(s => s.date === k)?.status || 'scheduled';
  const past = allSundays.filter(k => k < today && statusOf(k) !== 'nostudy');

  // 2. leaders & staff
  progress('Adding sample leaders…');
  for (const [email, name, role] of LEADERS) if (!S.users.some(u => u.email === email))
    ops.push({ type: 'set', path: `users/${email}`, data: { email, name, role, active: true, sample: true, addedBy: S.user.email, addedAt: NOW } });

  // 3. people + attendance
  progress('Adding sample athletes and attendance…');
  const teams = S.teams.filter(t => t.active !== false);
  const people = NAMES.map((full, i) => {
    const [firstName, lastName] = full.split(' ');
    const team = teams[(i * 7) % Math.max(1, teams.length)];
    return { id: fb.newId('people'), persona: PERSONAS[i], firstName, lastName, classYear: YEARS[i % 5 === 4 && i % 3 ? 3 : i % 4], teamId: team?.id || 'other', teamOther: team ? '' : 'Sample team' };
  });
  for (const p of people) {
    ops.push({ type: 'set', path: `people/${p.id}`, data: {
      firstName: p.firstName, lastName: p.lastName, nameKey: normalizeName(`${p.firstName} ${p.lastName}`), aliases: [],
      classYear: p.classYear, teamId: p.teamId, teamOther: p.teamOther, phone: `610-555-01${String(people.indexOf(p)).padStart(2, '0')}`,
      email: `${p.firstName.toLowerCase()}.${p.lastName.toLowerCase()}@example.com`, notes: p.persona === 'dropping' ? 'Sample note: started a new job, schedule changed.' : '',
      source: p.persona === 'potential' ? 'manual' : 'checkin', archived: false, deleted: false, sample: true, createdAt: NOW, createdBy: 'sample data' } });
  }
  const n = past.length;
  for (const [idx, k] of past.entries()) {
    const data = {};
    for (const p of people) {
      const pr = { regular: 0.85, occasional: 0.33, dropping: idx < n - 5 ? 0.8 : 0, cold: idx < Math.min(5, n - 5) ? 0.7 : 0, new: idx >= n - 3 ? 0.9 : 0, potential: 0 }[p.persona];
      if (rand() < pr) data[`attendees.${p.id}`] = { teamId: p.teamId, teamOther: p.teamOther, classYear: p.classYear, source: rand() < 0.1 ? 'manual' : 'qr', sample: true, at: NOW };
    }
    if (Object.keys(data).length) ops.push({ type: 'update', path: `sundays/${k}`, data });
  }

  // 4. outreach
  progress('Adding outreach notes…');
  const leaderEmails = [S.user.email, ...LEADERS.map(l => l[0])];
  const methods = ['Text', 'Coffee / meal', 'In person', 'Call', 'Text'];
  const notes = ['Checked in after the game — doing well, coming Sunday.', 'Got lunch at Hawk’s Nest. Asked good questions about faith.', 'Busy with midterms, said he’d try to make it.',
    'Prayed together about her injury recovery.', 'Invited a teammate to come along next week.', 'Hasn’t been in a while — sent an encouraging text.'];
  const targets = people.filter(p => ['dropping', 'cold', 'new', 'potential', 'occasional'].includes(p.persona)).slice(0, 14);
  targets.forEach((p, i) => {
    const date = addDays(today, -((i * 3) % 20) - 1);
    const fu = i % 3 === 0 ? addDays(today, (i % 2) ? -2 : 1) : i % 3 === 1 ? addDays(today, 9) : '';
    ops.push({ type: 'set', path: `outreach/${fb.newId('outreach')}`, data: { personId: p.id, by: leaderEmails[i % leaderEmails.length], date, method: methods[i % methods.length],
      notes: notes[i % notes.length], nextFollowUp: fu, followUpDone: false, deleted: false, sample: true, createdAt: NOW, createdBy: S.user.email } });
  });

  // 5. schedules for the sample leaders (current or next semester)
  progress('Adding sample schedules…');
  const sem = semesterFor(today) || liveSemesters().find(s => s.startDate > today) || liveSemesters().slice(-1)[0];
  const B = (days, start, end, label, category) => ({ id: fb.newId('x'), days, start, end, label, category });
  const plans = [
    [B([1, 3, 5], '09:20', '10:10', 'ECO 001', 'Class'), B([2, 4], '10:45', '12:00', 'MATH 021', 'Class'), B([1, 2, 3, 4, 5], '15:30', '18:00', 'Practice', 'Practice'), B([2, 4], '06:30', '07:30', 'Lift', 'Lift')],
    [B([1, 3, 5], '08:00', '11:00', 'Classes', 'Class'), B([1, 2, 3, 4, 5], '14:00', '17:00', 'Practice', 'Practice'), B([3], '19:00', '21:00', 'Lab', 'Class')],
    [B([2, 4], '09:00', '12:00', 'Classes', 'Class'), B([1, 2, 3, 4, 5], '06:00', '08:00', 'Morning practice', 'Practice'), B([5], '17:00', '22:00', 'Work', 'Work')],
    [B([1, 3], '13:00', '16:00', 'Classes', 'Class'), B([1, 2, 3, 4], '16:30', '19:00', 'Practice', 'Practice'), B([6], '10:00', '16:00', 'Games', 'Game')],
    [B([1, 2, 3, 4, 5], '08:30', '16:30', 'AIA office / campus', 'Work'), B([2], '18:00', '19:30', 'Staff meeting', 'Meeting')],
  ];
  if (sem) LEADERS.forEach(([email], i) => ops.push({ type: 'set', path: `schedules/${scheduleId(sem.id, email)}`, data: { semesterId: sem.id, userEmail: email, blocks: plans[i], sample: true, updatedAt: NOW, updatedBy: S.user.email } }));
  ops.push({ type: 'set', path: `scheduleExceptions/${fb.newId('x')}`, data: { userEmail: LEADERS[0][0], label: 'Away game (sample)', type: 'busy', startDate: addDays(today, 3), endDate: addDays(today, 4), allDay: true, start: '', end: '', deleted: false, sample: true, createdAt: NOW } });
  ops.push({ type: 'set', path: `scheduleExceptions/${fb.newId('x')}`, data: { userEmail: LEADERS[2][0], label: 'No practice (sample)', type: 'free', startDate: addDays(today, 2), endDate: '', allDay: false, start: '06:00', end: '08:00', deleted: false, sample: true, createdAt: NOW } });

  // 6. study plans (only on Sundays that don't have one) + a couple of comments
  progress('Adding sample study plans…');
  const studyDays = [...past.slice(-8), ...allSundays.filter(k => k >= today && statusOf(k) !== 'nostudy').slice(0, 4)];
  const rot = LEADERS.filter(l => l[2] === 'Leader').map(l => l[0]).concat(S.user.email);
  const commentOps = [];
  studyDays.forEach((k, i) => {
    const s = S.sundays.find(x => x.date === k);
    if (s && (s.plan?.title || s.leaderEmail)) return;
    const [title, scripture, questions] = STUDIES[i % STUDIES.length];
    ops.push({ type: 'update', path: `sundays/${k}`, data: { leaderEmail: rot[i % rot.length], plan: { title, scripture, questions, notes: 'Sample notes: open with a short story from the week, then read the passage twice.',
      links: [{ label: 'Leader guide (sample link)', url: 'https://docs.google.com/document/', type: 'Google Doc' }] }, planSample: true, planUpdatedAt: NOW, planUpdatedBy: rot[i % rot.length] } });
    if (i % 4 === 1) commentOps.push({ type: 'set', path: `sundays/${k}/comments/${fb.newId('c')}`, data: { text: 'Great passage for this week — I can bring snacks.', by: LEADERS[1][0], byName: LEADERS[1][1], at: NOW, sample: true } });
  });

  // 7. one check-in that needs review
  const lastPast = past[past.length - 1], someone = people.find(p => p.persona === 'regular');
  if (lastPast && someone) ops.push({ type: 'set', path: `checkins/${fb.newId('checkins')}`, data: { sundayDate: lastPast, token: 'sample', firstName: someone.firstName, lastName: someone.lastName.slice(0, -1) + 'e',
    classYear: someone.classYear, teamId: someone.teamId, teamOther: someone.teamOther, phone: '', email: '', status: 'review', reason: 'Possible typo or nickname', candidates: [someone.id], submittedAt: NOW, sample: true } });

  progress('Saving…');
  await fb.batchWrite(ops);
  await fb.batchWrite(commentOps);
  await ensureSundays();
  log('sample', 'Loaded sample data');
}

export async function removeSampleData(progress = () => {}) {
  progress('Finding sample data…');
  const get = c => fb.getMany(c, { where: [['sample', '==', true]] }).catch(() => []);
  const people = await get('people');
  const ids = new Set(people.map(p => p.id));
  const ops = [];
  const sundays = await fb.getMany('sundays');
  const sampleUsers = new Set((await get('users')).map(u => u.id));
  for (const s of sundays) {
    const data = {};
    if (sampleUsers.has(s.leaderEmail)) data.leaderEmail = DELETE;
    for (const c of await fb.getMany(`sundays/${s.id}/comments`, { where: [['sample', '==', true]] }).catch(() => [])) ops.push({ type: 'delete', path: `sundays/${s.id}/comments/${c.id}` });
    for (const [pid, e] of Object.entries(s.attendees || {})) if (ids.has(pid) || e.sample) data[`attendees.${pid}`] = DELETE;
    if (s.planSample) {
      Object.assign(data, { plan: DELETE, leaderEmail: DELETE, planSample: DELETE, planUpdatedAt: DELETE, planUpdatedBy: DELETE });
    }
    const realLeft = Object.keys(s.attendees || {}).filter(pid => !data[`attendees.${pid}`]).length;
    const keepsPlan = s.plan && !s.planSample;
    if (s.sample && !realLeft && !keepsPlan) ops.push({ type: 'delete', path: `sundays/${s.id}` });
    else if (Object.keys(data).length) ops.push({ type: 'update', path: `sundays/${s.id}`, data });
  }
  progress('Removing…');
  for (const c of ['people', 'outreach', 'users', 'schedules', 'scheduleExceptions', 'checkins', 'semesters'])
    for (const d of (c === 'people' ? people : await get(c))) ops.push({ type: 'delete', path: `${c}/${d.id}` });
  for (const o of await fb.getMany('outreach').catch(() => [])) if (ids.has(o.personId) && !o.sample) ops.push({ type: 'delete', path: `outreach/${o.id}` });
  await fb.batchWrite(ops);
  log('sample', 'Removed sample data');
  return ops.length;
}

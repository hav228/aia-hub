# AIA Lehigh Leaders Hub: Handoff Guide

This guide is for whoever runs the app after Harrison. Read it once when you take over, and again at the start of each semester. You don't need to know how to code.

---

## 1. What this is

A website for AIA leaders and staff. It has:

| Section | What it does |
|---|---|
| **This Week** | The weekly QR code (print it or put it on a screen). Live attendance and the plan for tonight. |
| **Studies** | Upcoming Sundays with their leaders, each study plan (passage, questions, notes, file links), comments, version history, and a searchable archive. |
| **People** | Every athlete, with private phone, email and notes. Merge duplicates and archive graduates. |
| **Outreach** | Groups (New, Regular, Occasional, Cold, Potential, Inactive), outreach notes, and the "Needs follow-up this week" list. |
| **Reports** | Weekly, semester and school-year attendance, with charts. Export to CSV, Excel or PDF. |
| **More** | Review check-ins, Schedules, Find a time, Settings, Activity log, Trash. |

- **Leader site:** `https://hav228.github.io/aia-hub/`
- **Attendees** never log in. They scan the weekly QR code, which opens a short form.

### Where things live
| Thing | Where | Who owns it now |
|---|---|---|
| The data (people, attendance and so on) | Firebase project **cru-aia-lehigh** (console.firebase.google.com) | hav228@lehigh.edu |
| The website files | GitHub repo **hav228/aia-hub** | GitHub user hav228 |
| Sign-in | Firebase Authentication (Google accounts) | n/a |

Everything runs on free plans: Firebase "Spark" and GitHub Pages. There's no card on file and nothing to renew.

---

## 2. Everyday jobs

**Give someone access:** More → Settings → Leaders & staff → **+ Add leader or staff**. Use the exact Google account they'll sign in with. Their @lehigh.edu email works.

**Remove someone's access:** in the same place, click **Edit → Remove access**. Nothing they entered is deleted.

**Sunday night:**
1. Open **This Week**. Show the QR code on a screen or print it with **Print**.
2. Check-ins appear live as people scan.
3. Use **+ Add someone** for anyone who forgot to scan.
4. If a name lands in **Review** (More → Review), pick the right person or choose "It's a new person".

**Weeks off (breaks, finals):** go to This Week → **›** to that Sunday → More options → **Mark as "No study"**. Weeks marked this way don't count against anyone's attendance.

**Check-in on a different day or time:** This Week → More options → **Open check-in now (2 hrs)**.

---

## 3. Start-of-semester checklist
1. **Settings → Semesters → + Add semester** with the first and last day. A QR code is created for every Sunday in between.
2. **Studies → Fill in leader rotation** assigns leaders in turn. Adjust any Sunday with its dropdown.
3. Ask every leader and staff member to enter their week under **More → Schedules**. When a schedule is empty, the app offers to copy last semester's.
4. **Settings → Leaders & staff:** add new leaders and remove people who graduated.
5. **People:** archive graduated athletes (open the person → Archive → Graduated). Their history is kept.
6. **Settings → Teams:** add, rename or hide teams if anything changed.
7. **Settings → Download full backup** and save the file in a shared Google Drive folder.

## 4. Once a month
- **Settings → Download full backup.** Keep the file in Google Drive.
- Look at **Outreach → Cold** and the follow-up list.

---

## 5. Handing the app to the next leader

You have two options.

**Option A (simplest): add them as co-owner.** Do this every year so there are always two owners.
1. **Firebase:** console.firebase.google.com → cru-aia-lehigh → ⚙️ **Project settings → Users and permissions → Add member**, enter their Google email, role **Owner**.
2. **GitHub:** github.com/hav228/aia-hub → **Settings → Collaborators → Add people**, then enter their GitHub username.
3. **In the app:** add them under Settings → Leaders & staff.
4. **Change the app's "owner" email** (the account that can always sign in):
   - Edit `js/firebase-config.js` on GitHub (open the file → ✏️ pencil → change `OWNER_EMAIL` → Commit).
   - Edit `firestore.rules` the same way (change the email inside `isOwner()`).
   - Copy the whole updated `firestore.rules` into Firebase console → Firestore Database → **Rules** → **Publish**.

**Option B: move the website to their GitHub account.** Only do this if hav228 should no longer hold it.
1. On GitHub: repo **Settings → General → Danger Zone → Transfer ownership** to their GitHub username.
2. The site address changes to `https://THEIR-USERNAME.github.io/aia-hub/`.
3. In Firebase: Authentication → Settings → **Authorized domains → Add domain** → `THEIR-USERNAME.github.io`.
4. In their repo: **Settings → Pages**, and make sure it's deploying from `main` / root.
5. **Old printed QR codes stop working** because the address changed. Reprint from This Week.
6. Tell all the leaders the new link.

> **Long-term tip:** a ministry Gmail account (for example `lehighaia@gmail.com`) that every new leader inherits as Firebase Owner makes handoffs painless. You can add it as an extra owner at any time.

---

## 6. Changing or fixing the app
- **Small text changes:** edit the file on GitHub (✏️ pencil → Commit). The site updates in 1–2 minutes.
- **Bigger changes:** describe what you want to Claude. Give it this repo (hav228/aia-hub) and attach this guide. The code is plain HTML and JavaScript with no build step.
- **Main files:**
  - `index.html`: the leader app
  - `checkin.html`: the public check-in form
  - `js/pages/*.js`: one file per screen
  - `js/store.js`: everything that reads or writes data
  - `js/logic.js`: calculations (matching, reports, groups, availability)
  - `firestore.rules`: who can see and change what

## 7. Privacy
- Phone numbers, emails and notes are only visible to signed-in leaders and staff. The security rules in `firestore.rules` enforce this; it isn't just hidden on screen.
- Attendees can only *add* a check-in, only with that week's code, and only during that Sunday's check-in window.
- Remove access for leaders who graduate.
- Don't put sensitive pastoral details in notes. Keep them brief and kind, since any leader can read them.

## 8. Recovering from mistakes
- **Deleted a person, note or schedule change?** More → **Trash** → Restore. Items stay there for 90 days.
- **Who changed something?** More → **Activity log** shows who changed what and when, with before and after values.
- **Study plan edited by mistake?** Open the study → Version history → Show earlier versions → **Restore this version**.
- **Merged the wrong people?** The merged record still exists, hidden. Ask Claude or a developer to undo it from the Activity log entry.
- **Total disaster?** The monthly backup file has everything. A developer (or Claude) can load it back.

## 9. Troubleshooting
| Problem | Fix |
|---|---|
| "isn't on the leader list" | Add that exact Google email under Settings → Leaders & staff. |
| Sign-in popup errors | Firebase → Authentication → Settings → Authorized domains must include the site's domain (for example `hav228.github.io`). |
| Check-in says "isn't open right now" | It's outside the Sunday window. Use This Week → More options → Open check-in now. |
| Stuck on "Loading…" | Hard refresh (Cmd+Shift+R). If that doesn't fix it, check that the GitHub repo still has the `css` and `js` folders. |
| Firebase "quota exceeded" | Very unlikely at this size. Wait until the next day; usage resets daily. |

## 10. Sample data
More → Settings → **Sample data** can load made-up people, attendance, outreach, schedules and study plans for demos or training. **Remove sample data** deletes all of it and leaves real data alone. Sample leaders use @example.com emails, which can't sign in. If you edit a sample study plan, the app treats it as real and keeps it.

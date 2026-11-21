# Lehigh Leaders Hub (AIA + Cru): Setup

This takes about 20–30 minutes, and you only do it once. No software to install. Everything happens in your web browser.

**How it fits together**
- **Firebase** (free) stores the data and handles Google sign-in. You already made the project `cru-aia-lehigh`.
- **GitHub Pages** (free) hosts the website. Your site will be at `https://hav228.github.io/aia-hub/`.
- Leaders and staff open the site and sign in with Google. Attendees just scan the QR code and never log in.

---

## Part 1: Firebase (about 10 minutes)

Go to https://console.firebase.google.com and open **cru-aia-lehigh**.

### 1. Copy your app's config into the code  ✅ already done for cru-aia-lehigh
1. Click the **gear icon** (top left), then **Project settings**.
2. Scroll down to **Your apps** and click your web app **CRU/AIA**.
3. Under **SDK setup and configuration**, choose **Config**. You'll see a block like `apiKey: "AIza..."`.
4. On your computer, open `js/firebase-config.js` from this folder in any text editor (Notepad or TextEdit is fine).
5. Replace each `PASTE-YOURS-HERE` (and check the other lines) with your values. Keep the quote marks. Save the file.

> These values are **not secret**. Every Firebase website shows them. The security comes from the rules in step 3.

### 2. Create the database
1. In the left menu: **Databases & Storage → Firestore → Create database** (older layouts call it Build → Firestore Database).
2. Location: **nam5 (United States)**. You can't change this later.
3. Choose **Start in production mode**, then **Create**.

### 3. Paste in the security rules
1. Still in Firestore Database, open the **Rules** tab.
2. Delete everything there. Open `firestore.rules` from this folder, copy all of it, and paste it in.
3. Click **Publish**.

These rules let approved leaders and staff do everything in their own ministry (AIA or Cru). Anyone else can only submit a check-in, and only with that week's code during the Sunday check-in window.

### 4. Turn on Google sign-in
1. Left menu: **Security → Authentication → Get started** (older layouts: Build → Authentication).
2. **Sign-in method** tab → **Google** → turn on **Enable** → pick your email as the support email → **Save**.
3. **Settings** tab → **Authorized domains** → **Add domain** → type `hav228.github.io` → **Add**.

---

## Part 2: GitHub Pages (about 10 minutes)

### 5. Create the repository
1. Go to https://github.com/new while signed in as **hav228**.
2. Repository name: `aia-hub`. Choose **Public**. Free GitHub Pages needs a public repo, and that's safe: no member data lives in the code. It's all in Firebase behind the rules.
3. Click **Create repository**.

### 6. Upload the files
1. On the new repo page, click **uploading an existing file**.
2. Open the unzipped `aia-hub` folder, select **everything inside it** (`index.html`, `checkin.html`, the `css` and `js` folders, `firestore.rules`, `SETUP.md`), and drag it all onto the page. Use Chrome or Edge; they keep the folders intact.
3. Click **Commit changes**.
4. Check that you can see `index.html` at the top level of the repo, plus folders named `css` and `js`.

### 7. Turn on the website
1. In the repo: **Settings → Pages**.
2. Under **Build and deployment**: Source = **Deploy from a branch**, Branch = **main**, folder = **/ (root)**, then **Save**.
3. Wait 1–2 minutes and refresh. GitHub will show **"Your site is live at https://hav228.github.io/aia-hub/"**.

---

## Part 3: First use (5 minutes)

1. Open `https://hav228.github.io/aia-hub/` and tap **Sign in with Google**, using **hav228@lehigh.edu**. You're the owner, so you get in automatically.
2. The app loads all Lehigh varsity teams by itself. You can edit them in **More → Settings → Teams**.
3. **More → Settings → Semesters → + Add semester.** Add the current semester, and the previous one too if you want comparisons. A QR code is created for every Sunday in between.
4. **More → Settings → Leaders & staff → + Add.** Add each leader and staff member's Google email. They can sign in right away.
5. Check the **check-in times** (default: Sunday 5:00 PM to Monday 2:00 AM).

---

## Testing checklist for Phase 1

Try these before we start Phase 2. Tell me anything that feels off.

- [ ] **This Week**: the QR code shows. Tap **More options → Open check-in now (2 hrs)** so you can test on a weekday.
- [ ] Scan the QR with your phone camera and check in. Your name should appear on This Week within a few seconds.
- [ ] Scan again on the same phone. It should say you're already checked in, with your info remembered.
- [ ] Have a friend check in with a slightly misspelled version of an existing name. It should show up under **Review**.
- [ ] **+ Add someone**: add a person manually, then remove them with the ×.
- [ ] **People**: open someone, edit their phone number, then try **Merge with a duplicate** on a test record.
- [ ] Delete a test person, then restore them from **More → Trash**.
- [ ] **Reports**: switch between Weekly, Semester and School year. Try **Export CSV**, **Export Excel** and **Save as PDF**.
- [ ] **More → Activity log**: your changes should be listed.
- [ ] Have another leader sign in on their phone after you add them.
- [ ] When you're done testing: **This Week → More options → Reset to normal time**, and discard or delete any test check-ins and people.

---

> **Whenever `firestore.rules` changes** (for example when Cru was added), copy the whole file into Firestore Database → Rules again and click **Publish**.

## Updating the site later
When I send new files for a phase: go to the repo, click **Add file → Upload files**, drag in the new files and folders (same names replace the old ones), then **Commit changes**. The site updates in 1–2 minutes. **Keep your edited `js/firebase-config.js`.** Don't overwrite it with a blank one.

## Backups
**More → Settings → Download full backup** saves everything to one file. Do this about once a month and keep the file in a Google Drive folder.

## Cost
Everything here fits in Firebase's free "Spark" plan and free GitHub Pages. You won't be asked for a card.

## If something goes wrong
- **Sign-in popup closes or errors**: make sure `hav228.github.io` is under Authentication → Settings → Authorized domains.
- **"isn't on the leader list"**: add that exact Google email under Settings → Leaders & staff.
- **Check-in says "isn't open right now"**: it's outside the Sunday window. Use "Open check-in now" on This Week.
- **Blank page**: `js/firebase-config.js` probably still has `PASTE-YOURS-HERE` in it.

// The ONLY file that talks to Firebase. Everything else uses these small helpers.
import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js';
import { getAuth, GoogleAuthProvider, signInWithPopup, signOut as fbSignOut, onAuthStateChanged }
  from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js';
import {
  getFirestore, collection, doc, getDoc, getDocs, setDoc, updateDoc, deleteDoc, addDoc, onSnapshot,
  query, where, orderBy, limit, writeBatch, runTransaction, serverTimestamp, deleteField, Timestamp,
} from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js';
import { firebaseConfig } from './firebase-config.js';

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
let auth = null;

// Special values you can put in data you write
export const NOW = { __now: true };      // server time
export const DELETE = { __delete: true }; // remove this field

function out(v) {
  if (v === NOW) return serverTimestamp();
  if (v === DELETE) return deleteField();
  if (v instanceof Date || v === null || typeof v !== 'object') return v;
  if (Array.isArray(v)) return v.map(out);
  const o = {}; for (const [k, x] of Object.entries(v)) if (x !== undefined) o[k] = out(x); return o;
}
function inn(v) {
  if (v instanceof Timestamp) return v.toDate();
  if (v === null || typeof v !== 'object') return v;
  if (Array.isArray(v)) return v.map(inn);
  const o = {}; for (const [k, x] of Object.entries(v)) o[k] = inn(x); return o;
}
// All paths are relative to the current ministry (set with setPrefix). A path starting with "/" is absolute.
let prefix = '';
export function setPrefix(p) { prefix = p || ''; }
const full = p => p.startsWith('/') ? p.slice(1) : prefix + p;
const ref = p => doc(db, ...full(p).split('/'));
const cref = p => collection(db, ...full(p).split('/'));
const toObj = d => ({ id: d.id, ...inn(d.data()) });
function q(path, opts = {}) {
  const c = [];
  for (const [f, op, v] of opts.where || []) c.push(where(f, op, out(v)));
  if (opts.orderBy) c.push(orderBy(opts.orderBy, opts.desc ? 'desc' : 'asc'));
  if (opts.limit) c.push(limit(opts.limit));
  return query(cref(path), ...c);
}

// ---- auth ----
export function onAuth(cb) {
  auth = auth || getAuth(app);
  return onAuthStateChanged(auth, u => cb(u ? { email: (u.email || '').toLowerCase(), name: u.displayName || u.email, photo: u.photoURL } : null));
}
export async function signIn() {
  auth = auth || getAuth(app);
  const p = new GoogleAuthProvider(); p.setCustomParameters({ prompt: 'select_account' });
  await signInWithPopup(auth, p);
}
export function signOut() { return fbSignOut(auth || getAuth(app)); }

// ---- data ----
export function watch(path, opts, cb, onErr) {
  return onSnapshot(q(path, opts), s => cb(s.docs.map(toObj)), onErr || (e => console.error(path, e)));
}
export function watchDoc(path, cb, onErr) {
  return onSnapshot(ref(path), s => cb(s.exists() ? toObj(s) : null), onErr || (e => console.error(path, e)));
}
export async function getOne(path) { const s = await getDoc(ref(path)); return s.exists() ? toObj(s) : null; }
export async function getMany(path, opts) { return (await getDocs(q(path, opts))).docs.map(toObj); }
export const setOne = (path, data, merge = false) => setDoc(ref(path), out(data), { merge });
export const updateOne = (path, data) => updateDoc(ref(path), out(data));
export async function addOne(path, data) { return (await addDoc(cref(path), out(data))).id; }
export const newId = path => doc(cref(path)).id;
export const removeOne = path => deleteDoc(ref(path));

// ops: [{type:'set'|'update'|'delete', path, data, merge}]
export async function batchWrite(ops) {
  for (let i = 0; i < ops.length; i += 400) {
    const b = writeBatch(db);
    for (const op of ops.slice(i, i + 400)) {
      if (op.type === 'set') b.set(ref(op.path), out(op.data), { merge: !!op.merge });
      else if (op.type === 'update') b.update(ref(op.path), out(op.data));
      else if (op.type === 'delete') b.delete(ref(op.path));
    }
    await b.commit();
  }
}

export function transact(fn) {
  return runTransaction(db, t => fn({
    get: async p => { const s = await t.get(ref(p)); return s.exists() ? toObj(s) : null; },
    set: (p, d, merge) => t.set(ref(p), out(d), { merge: !!merge }),
    update: (p, d) => t.update(ref(p), out(d)),
    delete: p => t.delete(ref(p)),
  }));
}

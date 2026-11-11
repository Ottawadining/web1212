// Plated — Collection: the plates a visitor keeps, from every city.
// Without an account, saves live in this browser (localStorage). With one (optional, Supabase Auth:
// Google or an emailed link/code), they live in public.saved_plates and follow the visitor to any
// device; anything saved on this device before signing in is merged into the account.
// The sign-in library only loads when someone opens the sign-in panel or is already signed in.
import { CONFIG, LIVE, esc, fetchByIds } from './core.js?v=20261110b';

const LOCAL = 'plated-saved';        // [[dishId, savedAtMs], ...] while signed out
const MIRROR = 'plated-saved-acct';  // copy of the account's list, so hearts show instantly on load
const AUTH_KEY = 'plated-auth';      // supabase-js session (separate from the admin page's)
const NUDGE = 'plated-nudge-off';

const store = {
  get(k) { try { return localStorage.getItem(k); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch {} },
  del(k) { try { localStorage.removeItem(k); } catch {} },
};
const readList = (k) => { try { const a = JSON.parse(store.get(k) || '[]'); return Array.isArray(a) ? a.filter((x) => Array.isArray(x) && typeof x[0] === 'string') : []; } catch { return []; } };

export const SIGN_IN = { google: !!CONFIG.SIGN_IN?.google, email: !!CONFIG.SIGN_IN?.email };
const GOOGLE_ID = /\.apps\.googleusercontent\.com$/.test(CONFIG.GOOGLE_CLIENT_ID || '') ? CONFIG.GOOGLE_CLIENT_ID : '';
export const ACCOUNTS = LIVE && (SIGN_IN.google || SIGN_IN.email);

let saved = new Map();          // dishId -> savedAt (ms)
let user = null;                // { id, email } once signed in
let sb = null, sbLoading = null;
const dishes = new Map();       // dishId -> dish, cached between calls
const listeners = new Set();
const emit = () => listeners.forEach((f) => { try { f(); } catch (e) { console.error(e); } });

const hasSession = () => !!store.get(AUTH_KEY);
const returning = () => /access_token=|error_description=/.test(location.hash);
saved = new Map(readList(hasSession() ? MIRROR : LOCAL));

function persist() {
  const arr = [...saved.entries()].sort((a, b) => b[1] - a[1]);
  store.set(user ? MIRROR : LOCAL, JSON.stringify(arr));
}

async function client() {
  if (sb) return sb;
  if (!sbLoading) {
    sbLoading = import('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/+esm').then(({ createClient }) => {
      sb = createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_ANON_KEY, {
        auth: { storageKey: AUTH_KEY, persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, flowType: 'implicit' },
      });
      sb.auth.onAuthStateChange((ev, session) => {
        if (session?.user && (!user || user.id !== session.user.id)) setTimeout(() => adopt(session.user), 0);
        else if (ev === 'SIGNED_OUT' && user) dropUser();
      });
      return sb;
    });
  }
  return sbLoading;
}

// signed in: merge this device's saves into the account, then take the account's list
async function adopt(u) {
  user = { id: u.id, email: u.email || '' };
  const local = readList(LOCAL);
  if (local.length) {
    try {
      const ok = new Set((await fetchByIds(local.map((x) => x[0]))).map((d) => d.id));
      const rows = local.filter((x) => ok.has(x[0])).map(([id, at]) => ({ user_id: user.id, dish_id: id, saved_at: new Date(at).toISOString() }));
      if (rows.length) {
        const { error } = await sb.from('saved_plates').upsert(rows, { onConflict: 'user_id,dish_id', ignoreDuplicates: true });
        if (error) throw error;
      }
      store.del(LOCAL);
    } catch (e) { console.error('Collection: could not merge this device yet', e); }
  }
  await pull();
  closePanel();
}

async function pull() {
  if (!user) return;
  const { data, error } = await sb.from('saved_plates').select('dish_id,saved_at').order('saved_at', { ascending: false }).limit(2000);
  if (error) { console.error(error); emit(); return; }
  saved = new Map(data.map((r) => [r.dish_id, Date.parse(r.saved_at)]));
  persist();
  emit();
}

function dropUser() {
  user = null;
  store.del(MIRROR);
  saved = new Map(readList(LOCAL));
  emit();
}

export const mine = {
  get user() { return user; },
  count: () => saved.size,
  has: (id) => saved.has(id),
  onChange(f) { listeners.add(f); return () => listeners.delete(f); },

  // call once on every page: picks up an existing session (or one arriving from a sign-in link)
  async init() {
    if (!LIVE || !(hasSession() || returning())) return;
    try {
      await client();
      const { data } = await sb.auth.getSession();
      if (data.session?.user) { if (!user) await adopt(data.session.user); }
      else dropUser(); // the session had expired
      if (returning()) history.replaceState(history.state, '', location.pathname + location.search);
    } catch (e) { console.error('Collection: sign-in unavailable', e); }
  },

  // save or unsave; resolves to the new state
  async toggle(d) {
    const on = !saved.has(d.id), at = Date.now();
    dishes.set(d.id, d);
    if (on) saved.set(d.id, at); else saved.delete(d.id);
    persist(); emit();
    if (!user) return on;
    try {
      const q = on
        ? sb.from('saved_plates').upsert({ user_id: user.id, dish_id: d.id, saved_at: new Date(at).toISOString() }, { onConflict: 'user_id,dish_id', ignoreDuplicates: true })
        : sb.from('saved_plates').delete().eq('dish_id', d.id);
      const { error } = await q;
      if (error) throw error;
    } catch (e) {
      console.error(e);
      if (on) saved.delete(d.id); else saved.set(d.id, at);
      persist(); emit();
      return !on;
    }
    return on;
  },

  // the saved dishes, most recently saved first (unpublished ones quietly drop out)
  async list() {
    const ids = [...saved.keys()];
    const missing = ids.filter((id) => !dishes.has(id));
    if (missing.length) (await fetchByIds(missing)).forEach((d) => dishes.set(d.id, d));
    return ids.map((id) => dishes.get(id)).filter(Boolean).sort((a, b) => saved.get(b.id) - saved.get(a.id));
  },

  nudgeOff: () => store.get(NUDGE) === '1',
  dismissNudge() { store.set(NUDGE, '1'); emit(); },
  openPanel,
};

/* ---------- the sign-in panel ---------- */
let panel = null, lastFocus = null;
const G = '<svg viewBox="0 0 18 18" aria-hidden="true"><path fill="#4285F4" d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.92c1.7-1.57 2.68-3.88 2.68-6.62z"/><path fill="#34A853" d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.92-2.26c-.8.54-1.84.86-3.04.86-2.34 0-4.32-1.58-5.03-3.7H.96v2.33A9 9 0 0 0 9 18z"/><path fill="#FBBC05" d="M3.97 10.72a5.4 5.4 0 0 1 0-3.44V4.95H.96a9 9 0 0 0 0 8.1l3.01-2.33z"/><path fill="#EA4335" d="M9 3.58c1.32 0 2.5.45 3.44 1.35l2.58-2.58A9 9 0 0 0 .96 4.95l3.01 2.33C4.68 5.16 6.66 3.58 9 3.58z"/></svg>';

function view(state, email = '') {
  if (user) {
    return `<p class="ac-kicker mono">Collection</p>
      <h2 class="ac-title">Your collection follows you.</h2>
      <p class="ac-text">Signed in as ${esc(user.email || 'you')}. Plates you save appear on every device where you sign in.</p>
      <button type="button" class="ac-line" data-act="out">Sign out</button>`;
  }
  if (state === 'sent') {
    return `<p class="ac-kicker mono">Check your email</p>
      <h2 class="ac-title">We sent a sign-in link.</h2>
      <p class="ac-text">Open the email sent to ${esc(email)} and tap the link, or type the code from it here.</p>
      <form class="ac-form" data-act="code" novalidate>
        <input class="ac-input" name="code" inputmode="numeric" autocomplete="one-time-code" placeholder="Code" maxlength="10" aria-label="Code from the email">
        <button type="submit" class="ac-btn">Sign in</button>
      </form>
      <p class="ac-err" role="alert"></p>
      <button type="button" class="ac-line" data-act="back">Use a different email</button>`;
  }
  return `<p class="ac-kicker mono">Collection</p>
    <h2 class="ac-title">Keep your collection.</h2>
    <p class="ac-text">Sign in to protect the plates you save and see them on any device. Nothing else changes.</p>
    ${SIGN_IN.google ? (GOOGLE_ID ? '<div class="ac-gslot" aria-label="Continue with Google"></div>' : `<button type="button" class="ac-btn ac-google" data-act="google">${G}<span>Continue with Google</span></button>`) : ''}
    ${SIGN_IN.google && SIGN_IN.email ? '<p class="ac-or mono"><span>or</span></p>' : ''}
    ${SIGN_IN.email ? `<form class="ac-form" data-act="email" novalidate>
        <input class="ac-input" name="email" type="email" autocomplete="email" placeholder="Email address" aria-label="Email address" value="${esc(email)}">
        <button type="submit" class="ac-btn">Email me a link</button>
      </form>` : ''}
    <p class="ac-err" role="alert"></p>`;
}

function render(state, email) {
  const body = panel.querySelector('.ac-body');
  body.innerHTML = view(state, email);
  body.dataset.email = email || '';
  const f = body.querySelector('input, button');
  if (f && matchMedia('(hover: hover)').matches) f.focus({ preventScroll: true });
  const slot = body.querySelector('.ac-gslot');
  if (slot) googleButton(slot);
}

/* Google's own button (Google Identity Services): its sign-in window names plated.gallery, and the
   visitor stays on the page they were on. Falls back to the redirect button if Google's script fails. */
let gsiLoading = null;
function loadGsi() {
  if (window.google?.accounts?.id) return Promise.resolve();
  if (!gsiLoading) {
    gsiLoading = new Promise((ok, fail) => {
      const s = document.createElement('script');
      s.src = 'https://accounts.google.com/gsi/client';
      s.async = true; s.onload = ok; s.onerror = fail;
      document.head.appendChild(s);
    });
    gsiLoading.catch(() => { gsiLoading = null; });
  }
  return gsiLoading;
}
async function sha256hex(t) {
  const b = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(t));
  return [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, '0')).join('');
}
function showAltGoogle() {
  const body = panel?.querySelector('.ac-body');
  if (!body || body.querySelector('.ac-alt')) return;
  const b = document.createElement('button');
  b.type = 'button'; b.className = 'ac-line ac-alt'; b.dataset.act = 'google';
  b.textContent = 'Trouble signing in? Use Google another way';
  body.appendChild(b);
}
async function googleButton(slot) {
  try {
    await loadGsi();
    const raw = [...crypto.getRandomValues(new Uint8Array(16))].map((x) => x.toString(16).padStart(2, '0')).join('');
    const hashed = await sha256hex(raw);
    if (!slot.isConnected) return;
    window.google.accounts.id.initialize({
      client_id: GOOGLE_ID,
      nonce: hashed,
      ux_mode: 'popup',
      itp_support: true,
      callback: async (res) => {
        err('');
        try {
          await client();
          const { data, error } = await sb.auth.signInWithIdToken({ provider: 'google', token: res.credential, nonce: raw });
          if (error) throw error;
          if (data.user) await adopt(data.user);
        } catch (x) {
          console.error(x);
          err(`Google sign-in didn’t finish${x?.message ? ` (${x.message})` : ''}. You can try the other way below.`);
          showAltGoogle();
        }
      },
    });
    slot.innerHTML = '';
    window.google.accounts.id.renderButton(slot, {
      type: 'standard', theme: 'filled_black', size: 'large', shape: 'rectangular',
      text: 'continue_with', logo_alignment: 'center', width: Math.min(400, Math.round(slot.clientWidth || 320)),
    });
    slot.classList.add('is-ready');
    // a quiet second route, in case Google's window can't open on this browser
    setTimeout(() => { if (slot.isConnected && panel && !panel.hidden && !user) showAltGoogle(); }, 4000);
  } catch (x) {
    console.warn('Google sign-in script unavailable, using redirect', x);
    slot.outerHTML = `<button type="button" class="ac-btn ac-google" data-act="google">${G}<span>Continue with Google</span></button>`;
  }
}

function openPanel() {
  if (!ACCOUNTS && !user) return;
  if (!panel) {
    panel = document.createElement('div');
    panel.className = 'acct';
    panel.setAttribute('role', 'dialog');
    panel.setAttribute('aria-modal', 'true');
    panel.setAttribute('aria-label', 'Collection account');
    panel.innerHTML = '<button type="button" class="rv-close ac-close">Close</button><div class="ac-card"><div class="ac-body"></div></div>';
    document.body.appendChild(panel);
    panel.addEventListener('click', onClick);
    panel.addEventListener('submit', onSubmit);
    panel.addEventListener('keydown', (e) => { if (e.key === 'Escape') { e.stopPropagation(); closePanel(); } });
  }
  lastFocus = document.activeElement;
  render('start');
  panel.hidden = false;
  document.documentElement.classList.add('is-acct');
  requestAnimationFrame(() => panel.classList.add('is-open'));
  client().catch(() => {}); // warm up while they choose
  if (SIGN_IN.google && GOOGLE_ID) loadGsi().catch(() => {});
}

function closePanel() {
  if (!panel || panel.hidden) return;
  panel.classList.remove('is-open');
  document.documentElement.classList.remove('is-acct');
  setTimeout(() => { if (!panel.classList.contains('is-open')) panel.hidden = true; }, 450);
  lastFocus?.focus?.({ preventScroll: true });
}

const err = (msg) => { const el = panel.querySelector('.ac-err'); if (el) el.textContent = msg; };
const busy = (el, on) => { if (el) { el.disabled = on; el.classList.toggle('is-busy', on); } };
const back = () => `${location.origin}/collection/`;

async function onClick(e) {
  if (e.target === panel || e.target.closest('.ac-close')) { closePanel(); return; }
  const b = e.target.closest('[data-act]');
  if (!b || b.tagName === 'FORM') return;
  const act = b.dataset.act;
  if (act === 'back') { render('start', panel.querySelector('.ac-body').dataset.email); return; }
  busy(b, true);
  try {
    await client();
    if (act === 'google') {
      const { error } = await sb.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: back() } });
      if (error) throw error;
      return; // the browser is on its way to Google
    }
    if (act === 'out') { await sb.auth.signOut(); dropUser(); closePanel(); }
  } catch (x) { console.error(x); err('That didn’t work. Please try again in a moment.'); }
  busy(b, false);
}

async function onSubmit(e) {
  e.preventDefault();
  const form = e.target, btn = form.querySelector('button');
  err('');
  busy(btn, true);
  try {
    await client();
    if (form.dataset.act === 'email') {
      const email = form.email.value.trim();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { err('Please enter your email address.'); busy(btn, false); return; }
      const { error } = await sb.auth.signInWithOtp({ email, options: { emailRedirectTo: back(), shouldCreateUser: true } });
      if (error) throw error;
      render('sent', email);
      return;
    }
    if (form.dataset.act === 'code') {
      const token = form.code.value.replace(/\s/g, ''), email = panel.querySelector('.ac-body').dataset.email;
      if (!token) { err('Enter the code from the email.'); busy(btn, false); return; }
      const { data, error } = await sb.auth.verifyOtp({ email, token, type: 'email' });
      if (error) { err('That code didn’t work. Check it, or tap the link in the email.'); busy(btn, false); return; }
      if (data.user) await adopt(data.user);
      return;
    }
  } catch (x) {
    console.error(x);
    err(/rate|seconds/i.test(x?.message || '') ? 'Please wait a minute before asking for another email.' : 'That didn’t work. Please try again in a moment.');
  }
  busy(btn, false);
}

// Kefu Christmas 2026: helpers shared by the main site (app.js) and the TV quiz screen (tv.js).
// Both talk to Supabase only through the database functions in supabase/schema.sql.

const sb = supabase.createClient(KEFU_CONFIG.supabaseUrl, KEFU_CONFIG.supabaseKey);
const TOKEN_KEY = 'kefu-xmas-token';
const TEAM_COLOURS = 6; // --team-1 … --team-6 in the stylesheets

let token = store(TOKEN_KEY);
let onStaleSession = () => {}; // each page sets what happens when the login has expired

// ---------- helpers ----------

function store(key, value) {
  try {
    if (value === undefined) return localStorage.getItem(key);
    value === null ? localStorage.removeItem(key) : localStorage.setItem(key, value);
  } catch { return null; }
}

// Build DOM safely: every string becomes a text node, so names and
// questions people type can never inject HTML.
function h(tag, props = {}, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else if (k === 'class') el.className = v;
    else if (v === true) el.setAttribute(k, '');
    else if (v !== false && v != null) el.setAttribute(k, v);
  }
  el.append(...kids.flat().filter(k => k != null && k !== false));
  return el;
}
const $ = sel => document.querySelector(sel);

// Replace an element's contents. Like h(), it flattens lists and skips null/false,
// so `cond && h(...)` and arrays of elements are safe to pass.
function fill(el, ...kids) {
  el.replaceChildren(...kids.flat().filter(k => k != null && k !== false));
  return el;
}
const cssVar = name => getComputedStyle(document.documentElement).getPropertyValue(name).trim();

let toastTimer;
function toast(msg, bad = false) {
  const t = $('#toast');
  t.textContent = msg;
  t.className = 'toast' + (bad ? ' bad' : '');
  t.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { t.hidden = true; }, bad ? 5000 : 2500);
}

async function call(fn, args = {}) {
  const { data, error } = await sb.rpc(fn, { p_token: token, ...args });
  if (error) {
    if (error.message.includes('log in again')) onStaleSession();
    throw new Error(error.message);
  }
  return data;
}

// Run a click handler with the button disabled; show any error as a toast.
function busy(fn) {
  return async e => {
    const btn = e.currentTarget;
    btn.disabled = true;
    try { await fn(e); } catch (err) { toast(err.message, true); } finally { btn.disabled = false; }
  };
}

// A destructive button that needs a second tap within 3 seconds.
function confirmButton(label, onConfirm, cls = 'btn ghost small danger') {
  let armed = false, timer;
  const b = h('button', { class: cls, type: 'button' }, label);
  b.addEventListener('click', busy(async () => {
    if (!armed) {
      armed = true; b.textContent = 'Tap again to confirm';
      timer = setTimeout(() => { armed = false; b.textContent = label; }, 3000);
      return;
    }
    clearTimeout(timer);
    armed = false; b.textContent = label;
    await onConfirm();
  }));
  return b;
}

function shuffle(list) {
  const a = [...list];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

const teamColour = i => `var(--team-${(i % TEAM_COLOURS) + 1})`;

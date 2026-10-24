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
const teamInk = i => `var(--team-${(i % TEAM_COLOURS) + 1}-ink)`;

// Drawn icons (static markup only). Stroke icons share one 2.5 stroke on a 24 grid;
// the crown is the paper crown from a cracker, filled in its team colour.
const ICONS = {
  check: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>',
  back: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M15 5l-7 7 7 7"/></svg>',
  minus: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><path d="M6 12h12"/></svg>',
  trophy: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M8 4h8v5a4 4 0 0 1-8 0z"/><path d="M8 6H5v1a3 3 0 0 0 3 3M16 6h3v1a3 3 0 0 1-3 3M12 13v4M8.5 20h7M10 17h4"/></svg>',
  crown: '<svg viewBox="0 0 40 28"><path fill="currentColor" d="M3 23 1 5l10 8 9-11 9 11 10-8-2 18z"/><rect fill="currentColor" x="3" y="21" width="34" height="6" rx="1.5"/><path fill="none" stroke="rgb(0 0 0 / .22)" stroke-width="1.5" d="M3 21h34"/></svg>',
};
function icon(name, cls = 'icon') {
  const wrap = document.createElement('span');
  wrap.innerHTML = ICONS[name];
  const svg = wrap.firstChild;
  svg.setAttribute('class', cls);
  svg.setAttribute('aria-hidden', 'true');
  return svg;
}

// Tissue-paper confetti bursting from an element (the spin wheel). Skipped under reduced motion.
function confetti(fromEl) {
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const canvas = document.createElement('canvas');
  canvas.className = 'confetti';
  document.body.append(canvas);
  const dpr = window.devicePixelRatio || 1;
  canvas.width = innerWidth * dpr; canvas.height = innerHeight * dpr;
  const ctx = canvas.getContext('2d');
  ctx.scale(dpr, dpr);
  const css = getComputedStyle(document.documentElement);
  const colours = ['--gold', '--team-1', '--team-2', '--team-3', '--team-4', '--team-5', '--team-6', '--on-red']
    .map(v => css.getPropertyValue(v).trim()).filter(Boolean);
  const box = fromEl.getBoundingClientRect();
  const ox = box.left + box.width / 2, oy = box.top + box.height / 2;
  const bits = Array.from({ length: 150 }, () => {
    const a = Math.random() * Math.PI * 2, speed = 4 + Math.random() * 9;
    return {
      x: ox, y: oy, vx: Math.cos(a) * speed, vy: Math.sin(a) * speed - 6,
      w: 6 + Math.random() * 8, h: 4 + Math.random() * 6, r: Math.random() * 6, vr: (Math.random() - .5) * .4,
      c: colours[Math.floor(Math.random() * colours.length)],
    };
  });
  const start = performance.now();
  (function frame(now) {
    const t = now - start;
    ctx.clearRect(0, 0, innerWidth, innerHeight);
    ctx.globalAlpha = Math.max(0, 1 - Math.max(0, t - 1600) / 900);
    for (const b of bits) {
      b.vy += .32; b.vx *= .985; b.x += b.vx; b.y += b.vy; b.r += b.vr;
      ctx.save(); ctx.translate(b.x, b.y); ctx.rotate(b.r);
      ctx.fillStyle = b.c; ctx.fillRect(-b.w / 2, -b.h / 2, b.w, b.h * Math.abs(Math.cos(b.r * 2)));
      ctx.restore();
    }
    if (t < 2500) requestAnimationFrame(frame); else canvas.remove();
  })(start);
}

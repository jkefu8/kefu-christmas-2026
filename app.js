// Kefu Christmas 2026: front end. Talks to Supabase only through the
// database functions in supabase/schema.sql (sb.rpc), never to tables.

const sb = supabase.createClient(KEFU_CONFIG.supabaseUrl, KEFU_CONFIG.supabaseKey);
const TOKEN_KEY = 'kefu-xmas-token';
const TAB_KEY = 'kefu-xmas-tab';
const TEAM_NAMES = ['Tinsel', 'Sprouts', 'Crackers', 'Baubles', 'Mince Pies', 'Snowballs',
  'Holly', 'Reindeer', 'Pudding', 'Stockings', 'Gingerbread', 'Mistletoe'];
const TEAM_COLOURS = 6; // --team-1 … --team-6 in style.css
const POLL_MS = 5000;

let token = store(TOKEN_KEY);
let me = null;
let authMode = 'new';
let pollTimer = null;

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
    if (error.message.includes('log in again')) signOut();
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

function sleepsLabel() {
  const now = new Date();
  const xmas = new Date(2026, 11, 25);
  const days = Math.ceil((xmas - new Date(now.getFullYear(), now.getMonth(), now.getDate())) / 86400000);
  if (days > 1) return `${days} sleeps till Christmas`;
  if (days === 1) return '1 sleep till Christmas';
  if (days === 0) return 'Merry Christmas!';
  return 'Christmas 2026';
}

// ---------- sign up / log in ----------

function setAuthMode(mode) {
  authMode = mode;
  const isNew = mode === 'new';
  $('#mode-new').classList.toggle('is-on', isNew);
  $('#mode-back').classList.toggle('is-on', !isNew);
  $('#mode-new').setAttribute('aria-selected', isNew);
  $('#mode-back').setAttribute('aria-selected', !isNew);
  $('#auth-intro').textContent = isNew
    ? "Type your full name as it's on the invite, then choose a 4-digit PIN. You'll use them to get back in."
    : 'Welcome back. Type your full name and your PIN.';
  $('#auth-pin-hint').hidden = !isNew;
  $('#auth-submit').textContent = isNew ? 'Join the Christmas fun' : 'Log in';
  $('#auth-error').hidden = true;
}

async function submitAuth(e) {
  e.preventDefault();
  const name = $('#auth-name').value;
  const pin = $('#auth-pin').value.trim();
  const err = $('#auth-error');
  const btn = $('#auth-submit');
  err.hidden = true;
  btn.disabled = true;
  try {
    let newToken;
    if (authMode === 'new') {
      const { data, error } = await sb.rpc('register', { p_name: name, p_pin: pin });
      if (error) throw new Error(error.message);
      newToken = data;
    } else {
      const { data, error } = await sb.rpc('login', { p_name: name, p_pin: pin });
      if (error) throw new Error(error.message);
      if (data.error) throw new Error(data.error);
      newToken = data.token;
    }
    token = newToken;
    store(TOKEN_KEY, token);
    $('#auth-form').reset();
    await boot();
  } catch (ex) {
    err.textContent = ex.message;
    err.hidden = false;
  } finally {
    btn.disabled = false;
  }
}

async function signOut() {
  if (token) sb.rpc('logout', { p_token: token }); // fire and forget
  token = null; me = null;
  clearInterval(pollTimer);
  store(TOKEN_KEY, null);
  showAuth();
}

function showAuth() {
  $('#loading').hidden = true;
  $('#app').hidden = true;
  $('#whoami').hidden = true;
  $('#auth').hidden = false;
  setAuthMode(authMode);
}

// ---------- tabs ----------

const RENDER = { teams: renderTeams, quiz: renderQuiz, games: renderGames, admin: renderAdmin };

async function openTab(name) {
  if (name === 'admin' && !me?.is_admin) name = 'teams';
  if (!RENDER[name]) name = 'teams';
  clearInterval(pollTimer);
  store(TAB_KEY, name);
  document.querySelectorAll('.tabs button').forEach(b => b.setAttribute('aria-selected', b.dataset.tab === name));
  document.querySelectorAll('.panel').forEach(p => { p.hidden = p.id !== 'tab-' + name; });
  try { await RENDER[name]($('#tab-' + name)); } catch (err) { toast(err.message, true); }
}
const refresh = () => openTab(store(TAB_KEY) || 'teams');

// ---------- Teams: board + spin wheel ----------

function teamBoard(view) {
  return h('div', { class: 'team-grid' }, view.teams.map((t, i) => {
    const empty = Math.max(0, t.size - t.members.length);
    return h('article', {
      class: 'team-card' + (t.id === view.my_team ? ' is-mine' : ''),
      style: `--team:${teamColour(i)}`, 'data-team': t.id,
    },
      h('div', { class: 'team-head' },
        h('h4', {}, 'Team ' + t.name),
        h('span', { class: 'team-count' }, `${t.members.length}/${t.size}`)),
      h('ul', {},
        t.members.map(m => h('li', {}, m.full_name + (m.id === me.id ? ' (you)' : ''))),
        Array.from({ length: empty }, () => h('li', { class: 'slot' }, 'Waiting for a spin'))));
  }));
}

// Draws the wheel once; spinning just rotates the canvas with a CSS transition.
function drawWheel(canvas, teams) {
  const dpr = window.devicePixelRatio || 1;
  const size = 320;
  canvas.width = size * dpr; canvas.height = size * dpr;
  const ctx = canvas.getContext('2d');
  ctx.scale(dpr, dpr);
  const r = size / 2, seg = (Math.PI * 2) / teams.length;
  teams.forEach((t, i) => {
    const start = -Math.PI / 2 + i * seg;
    ctx.beginPath();
    ctx.moveTo(r, r);
    ctx.arc(r, r, r - 4, start, start + seg);
    ctx.closePath();
    ctx.fillStyle = cssVar(`--team-${(i % TEAM_COLOURS) + 1}`);
    ctx.fill();
    ctx.strokeStyle = cssVar('--surface');
    ctx.lineWidth = 3;
    ctx.stroke();
    ctx.save();
    ctx.translate(r, r);
    ctx.rotate(start + seg / 2);
    ctx.fillStyle = '#fff';
    ctx.font = `800 ${teams.length > 8 ? 12 : 15}px ${cssVar('--font-body')}`;
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    ctx.fillText(t.name, r - 18, 0);
    ctx.restore();
  });
  ctx.beginPath();
  ctx.arc(r, r, 26, 0, Math.PI * 2);
  ctx.fillStyle = cssVar('--surface');
  ctx.fill();
}

let wheelTurn = 0;
function spinTo(canvas, teams, teamId) {
  const i = teams.findIndex(t => t.id === teamId);
  const seg = 360 / teams.length;
  const landAt = i * seg + seg * (0.2 + Math.random() * 0.6); // somewhere inside the segment
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const base = Math.ceil(wheelTurn / 360) * 360 + (reduce ? 360 : 360 * 6);
  wheelTurn = base + (360 - landAt);
  canvas.style.transitionDuration = reduce ? '0.6s' : '4.5s';
  canvas.style.transform = `rotate(${wheelTurn}deg)`;
  return new Promise(res => setTimeout(res, reduce ? 700 : 4700));
}

async function renderTeams(panel) {
  let view = await call('teams_view');
  const board = h('div', {}, teamBoard(view));

  if (!view.teams.length) {
    panel.replaceChildren(h('section', { class: 'my-team' },
      h('p', { class: 'eyebrow' }, 'Team draw'),
      h('h2', {}, 'The wheel is coming'),
      h('p', {}, 'Once the organiser sets up the draw, you can spin the wheel here to find your team of three.')));
    return;
  }

  const canvas = h('canvas', { class: 'wheel', width: 320, height: 320, 'aria-hidden': 'true' });
  const status = h('p', { class: 'spin-status', 'aria-live': 'polite' });
  const spinBtn = h('button', { class: 'btn big', type: 'button' }, 'Spin for my team');
  let spinning = false;

  const myTeamName = () => view.teams.find(t => t.id === view.my_team)?.name;
  function setStatus() {
    spinBtn.hidden = !view.in_draw || !!view.my_team;
    if (!view.in_draw) status.textContent = "You're not in the draw yet. Ask the organiser to add you.";
    else if (view.my_team) status.textContent = `You're in Team ${myTeamName()}!`;
    else status.textContent = 'Spin the wheel to find out which team you are in.';
  }

  spinBtn.addEventListener('click', busy(async () => {
    spinning = true;
    status.textContent = 'Spinning…';
    try {
      const res = await call('spin');
      await spinTo(canvas, view.teams, res.team_id);
      view = await call('teams_view');
      board.replaceChildren(teamBoard(view));
      setStatus();
      board.querySelector(`[data-team="${res.team_id}"]`)?.classList.add('just-joined');
    } finally { spinning = false; }
  }));

  panel.replaceChildren(
    h('section', { class: 'stack' },
      h('p', { class: 'eyebrow' }, `${view.teams.reduce((n, t) => n + t.members.length, 0)} of ${view.teams.reduce((n, t) => n + t.size, 0)} have spun`),
      h('h2', {}, 'The teams'),
      board),
    h('section', { class: 'wheel-box' },
      h('div', { class: 'wheel-wrap' }, h('div', { class: 'wheel-pointer', 'aria-hidden': 'true' }), canvas),
      status, spinBtn),
  );
  drawWheel(canvas, view.teams);
  if (view.my_team) { // rest the wheel on your team
    const seg = 360 / view.teams.length, i = view.teams.findIndex(t => t.id === view.my_team);
    wheelTurn = 360 - (i * seg + seg / 2);
    canvas.style.transitionDuration = '0s';
    canvas.style.transform = `rotate(${wheelTurn}deg)`;
  }
  setStatus();

  // Keep the board live so everyone sees new names land.
  pollTimer = setInterval(async () => {
    if (spinning || document.hidden) return;
    try {
      const next = await call('teams_view');
      if (JSON.stringify(next) !== JSON.stringify(view)) {
        view = next;
        board.replaceChildren(teamBoard(view));
        setStatus();
      }
    } catch { /* try again next tick */ }
  }, POLL_MS);
}

// ---------- Quiz ----------

// Shrink a phone photo to a JPEG data URL small enough to store (well under 700 KB).
function loadImage(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("That file couldn't be opened as a photo. Try a JPG or PNG.")); };
    img.src = url;
  });
}
async function photoToDataUrl(file) {
  const img = await loadImage(file);
  for (const [max, q] of [[1000, 0.8], [800, 0.7], [600, 0.6]]) {
    const scale = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
    const c = document.createElement('canvas');
    c.width = Math.round(img.naturalWidth * scale);
    c.height = Math.round(img.naturalHeight * scale);
    c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
    const url = c.toDataURL('image/jpeg', q);
    if (url.length < 650000) return url;
  }
  throw new Error('That photo is too big. Try a smaller one.');
}

function questionCard(x, actions) {
  return h('li', { class: 'q-item' },
    h('div', { class: 'stack tight' },
      x.author && h('p', { class: 'hint' }, x.author),
      h('p', { class: 'q-kind' }, x.kind === 'tf' ? 'True / False' : 'Multiple choice'),
      x.photo && h('img', { class: 'q-photo', src: x.photo, alt: 'Photo for this question' }),
      h('p', { class: 'q-text' }, x.question),
      x.options
        ? h('ul', { class: 'q-options' }, x.options.map((o, i) =>
            h('li', { class: i === x.correct ? 'is-correct' : '' }, i === x.correct ? `✓ ${o}` : o)))
        : h('p', { class: 'q-answer' }, h('b', {}, 'Answer: '), x.answer)),
    actions);
}

async function renderQuiz(panel) {
  const mine = await call('my_questions');
  let kind = 'mc';
  let photo = null;

  const typeSwitch = h('div', { class: 'mode-switch', role: 'radiogroup', 'aria-label': 'Question type' });
  const q = h('textarea', { id: 'quiz-q', maxlength: 500, placeholder: 'e.g. Who burnt the turkey in 2019?' });
  const answers = h('div', { class: 'stack' });
  const photoInput = h('input', { id: 'quiz-photo', type: 'file', accept: 'image/*', class: 'visually-hidden' });
  const photoBox = h('div', { class: 'photo-box' });

  function drawTypeSwitch() {
    typeSwitch.replaceChildren(...[['tf', 'True / False'], ['mc', 'Multiple choice']].map(([k, label]) =>
      h('button', {
        type: 'button', role: 'radio', 'aria-checked': kind === k, class: kind === k ? 'is-on' : '',
        onclick: () => { kind = k; drawTypeSwitch(); drawAnswers(); },
      }, label)));
  }

  function drawAnswers() {
    if (kind === 'tf') {
      answers.replaceChildren(
        h('p', { class: 'label' }, 'Which is correct?'),
        h('div', { class: 'row' }, ['True', 'False'].map((t, i) =>
          h('label', { class: 'choice' }, h('input', { type: 'radio', name: 'correct', value: i, id: `tf-${i}` }), t))));
    } else {
      answers.replaceChildren(
        h('p', { class: 'label' }, 'Four choices. Tick the correct one.'),
        ['A', 'B', 'C', 'D'].map((letter, i) =>
          h('div', { class: 'mc-row' },
            h('input', { type: 'radio', name: 'correct', value: i, id: `mc-correct-${i}`, 'aria-label': `Choice ${letter} is correct` }),
            h('input', { id: `mc-${i}`, class: 'mc-option', maxlength: 120, placeholder: `Choice ${letter}`, 'aria-label': `Choice ${letter}` }))));
    }
  }

  function drawPhoto() {
    photoBox.replaceChildren(photo
      ? h('div', { class: 'row' },
          h('img', { class: 'q-photo small', src: photo, alt: 'Your chosen photo' }),
          h('button', { class: 'btn ghost small', type: 'button', onclick: () => { photo = null; photoInput.value = ''; drawPhoto(); } }, 'Remove photo'))
      : h('label', { class: 'btn ghost small', for: 'quiz-photo' }, 'Add a photo (optional)'));
  }

  photoInput.addEventListener('change', async () => {
    const file = photoInput.files[0];
    if (!file) return;
    try { photo = await photoToDataUrl(file); drawPhoto(); }
    catch (err) { toast(err.message, true); photoInput.value = ''; }
  });

  const submit = h('button', { class: 'btn', type: 'submit' }, 'Add question');
  const form = h('form', { class: 'card stack' },
    h('h2', {}, 'Add a quiz question'),
    h('p', { class: 'lede' }, 'Only you and the quizmaster can see your questions, so no peeking.'),
    h('p', { class: 'label' }, 'Question type'), typeSwitch,
    h('label', { for: 'quiz-q' }, 'Question'), q,
    photoInput, photoBox,
    answers,
    submit);
  form.addEventListener('submit', async e => {
    e.preventDefault();
    const picked = form.querySelector('input[name="correct"]:checked');
    const options = kind === 'mc' ? [...form.querySelectorAll('.mc-option')].map(i => i.value) : null;
    submit.disabled = true;
    try {
      await call('add_question', {
        p_kind: kind, p_question: q.value, p_options: options,
        p_correct: picked ? Number(picked.value) : null, p_photo: photo,
      });
      toast('Question added');
      renderQuiz(panel);
    } catch (err) { toast(err.message, true); } finally { submit.disabled = false; }
  });

  drawTypeSwitch(); drawAnswers(); drawPhoto();
  panel.replaceChildren(
    form,
    h('h3', {}, mine.length ? `Your questions (${mine.length})` : 'Your questions'),
    mine.length
      ? h('ol', { class: 'q-list' }, mine.map(x => questionCard(x,
          confirmButton('Delete', async () => { await call('delete_question', { p_id: x.id }); renderQuiz(panel); }))))
      : h('p', { class: 'hint' }, "You haven't added any yet. Two or three each is plenty."),
  );
}

// ---------- Games ----------

async function renderGames(panel) {
  const games = await call('games_view');
  const top = Math.max(1, ...games.map(g => g.votes));
  const name = h('input', { id: 'game-name', maxlength: 60, placeholder: 'e.g. Charades, Articulate, Pictionary' });
  const form = h('form', { class: 'card stack' },
    h('label', { for: 'game-name' }, 'Suggest another game'),
    h('div', { class: 'row' }, name, h('button', { class: 'btn', type: 'submit' }, 'Add')));
  form.addEventListener('submit', async e => {
    e.preventDefault();
    try { await call('add_game', { p_name: name.value }); toast('Game added'); renderGames(panel); }
    catch (err) { toast(err.message, true); }
  });

  const voteButton = g => h('button', {
    class: 'vote' + (g.mine ? ' is-on' : ''), type: 'button',
    'aria-pressed': g.mine, 'aria-label': `${g.mine ? 'Remove vote for' : 'Vote for'} ${g.name}`,
    onclick: busy(async () => { await call('toggle_vote', { p_game_id: g.id }); await renderGames(panel); }),
  }, h('span', {}, String(g.votes)), h('small', {}, g.votes === 1 ? 'vote' : 'votes'));

  panel.replaceChildren(
    h('div', { class: 'stack tight' },
      h('h2', {}, 'Which games shall we play?'),
      h('p', { class: 'lede' }, 'Tap the number to vote. Vote for as many as you like, and tap again to take a vote back. Drinking games are adults only, so please drink responsibly.')),
    games.length
      ? h('ul', { class: 'plain stack' }, games.map(g => h('li', { class: 'game' },
          h('div', { class: 'game-top' },
            voteButton(g),
            h('div', { class: 'game-title' },
              h('p', { class: 'game-name' }, g.name),
              h('p', { class: 'game-voters' }, g.description || `Suggested by ${g.added_by || 'someone'}`)),
            g.can_delete && !g.slug ? confirmButton('Remove', async () => { await call('delete_game', { p_id: g.id }); renderGames(panel); }) : null),
          h('div', { class: 'bar' }, h('span', { style: `transform:scaleX(${g.votes / top})` })),
          g.voters.length > 0 && h('p', { class: 'game-voters' }, 'Votes: ' + g.voters.join(', ')),
          g.steps && h('details', { class: 'how' },
            h('summary', {}, 'How to play'),
            gameArt(g.slug),
            h('ol', { class: 'steps' }, g.steps.map(s => h('li', {}, s)))))))
      : h('p', { class: 'hint' }, 'No games yet. Suggest the first one below.'),
    form,
  );
}

// ---------- Organiser ----------

// Split an already-shuffled list of people into teams of three.
// Leftovers (1 or 2 people) each join a different team, making teams of four.
function makeTeams(people) {
  const count = Math.max(1, Math.floor(people.length / 3));
  const teams = Array.from({ length: count }, (_, i) => people.slice(i * 3, i * 3 + 3));
  people.slice(count * 3).forEach((p, i) => teams[i % count].push(p));
  return teams;
}

// Reshuffle until no couple shares a team.
function drawTeams(people) {
  for (let attempt = 0; attempt < 2000; attempt++) {
    const teams = makeTeams(shuffle(people));
    const ok = teams.every(t => t.every(p => !p.partner_id || !t.some(o => o.id === p.partner_id)));
    if (ok) {
      const names = shuffle(TEAM_NAMES);
      return teams.map((members, i) => ({ name: names[i % names.length], members: members.map(m => m.id) }));
    }
  }
  throw new Error("Couldn't split up every couple. Check the partner list.");
}

async function renderAdmin(panel) {
  const [people, view, questions] = await Promise.all([call('people_list'), call('teams_view'), call('all_questions')]);
  const byId = Object.fromEntries(people.map(p => [p.id, p]));
  const teamOf = {};
  view.teams.forEach(t => t.members.forEach(m => { teamOf[m.id] = t.name; }));
  const spun = people.filter(p => p.spun).length;
  const inDraw = people.filter(p => p.in_draw).length;
  const hasDraw = view.teams.length > 0;

  const setUp = () => call('save_teams', { p_teams: drawTeams(people) });
  const drawBox = h('section', { class: 'card stack' },
    h('h2', {}, 'Team draw'),
    hasDraw
      ? h('p', { class: 'lede' }, `${view.teams.length} teams, ${inDraw} people. ${spun} have spun so far. Teams stay secret until each person spins, even from you.`)
      : h('p', { class: 'lede' }, `Shuffles all ${people.length} guests into teams of three in secret, keeping partners apart. Each person then spins the wheel to reveal their team.`),
    h('div', { class: 'row' },
      !hasDraw && h('button', {
        class: 'btn', type: 'button',
        onclick: busy(async () => { await setUp(); toast('Draw set up. Everyone can spin now.'); renderAdmin(panel); }),
      }, 'Set up the draw'),
      hasDraw && spun < inDraw && confirmButton(`Reveal the other ${inDraw - spun}`, async () => {
        const n = await call('admin_reveal_all');
        toast(`Revealed ${n} people`); renderAdmin(panel);
      }, 'btn'),
      hasDraw && confirmButton(spun ? 'Redo the draw (clears all spins)' : 'Redo the draw', async () => {
        await setUp(); toast('New draw set up.'); renderAdmin(panel);
      })),
    hasDraw && h('p', { class: 'hint' }, 'For the end of November: "Reveal" places everyone who hasn\'t spun.'));

  const partnerSelect = h('select', { id: 'guest-partner' },
    h('option', { value: '' }, 'No partner'),
    people.filter(p => !p.partner_id).map(p => h('option', { value: p.id }, p.full_name)));
  const guestName = h('input', { id: 'guest-name', placeholder: 'Full name', autocapitalize: 'words' });
  const addGuest = h('form', { class: 'stack' },
    h('h3', {}, 'Add a guest'),
    h('label', { for: 'guest-name' }, 'Full name'), guestName,
    h('label', { for: 'guest-partner' }, 'Partner (kept on a different team)'), partnerSelect,
    h('button', { class: 'btn', type: 'submit' }, 'Add guest'));
  addGuest.addEventListener('submit', async e => {
    e.preventDefault();
    try {
      await call('admin_add_guest', { p_name: guestName.value, p_partner_id: partnerSelect.value || null });
      toast('Guest added'); renderAdmin(panel);
    } catch (err) { toast(err.message, true); }
  });

  const peopleBox = h('section', { class: 'card' },
    h('h2', {}, `Guests (${people.length})`),
    h('p', { class: 'hint' }, `${people.filter(p => p.signed_up).length} signed up. Forgot their PIN? Type a new one next to their name and tell them.`),
    people.map(p => {
      const pin = h('input', { id: 'pin-' + p.id, inputmode: 'numeric', maxlength: 4, placeholder: 'New PIN', 'aria-label': `New PIN for ${p.full_name}` });
      const drawState = !hasDraw ? null : p.spun ? `Team ${teamOf[p.id]}` : p.in_draw ? 'Not spun yet' : 'Not in draw';
      return h('div', { class: 'person-row' },
        h('div', { class: 'name' },
          h('span', {}, p.full_name),
          h('span', { class: 'hint' }, [
            p.signed_up ? 'Signed up' : 'Not signed up',
            p.partner_id && byId[p.partner_id] ? `with ${byId[p.partner_id].full_name}` : null,
            drawState,
          ].filter(Boolean).join(' · '))),
        p.signed_up && pin,
        p.signed_up && h('button', {
          class: 'btn ghost small', type: 'button',
          onclick: busy(async () => {
            await call('admin_reset_pin', { p_person_id: p.id, p_pin: pin.value.trim() });
            pin.value = '';
            toast(`PIN reset for ${p.full_name}`);
          }),
        }, 'Reset PIN'),
        hasDraw && !p.in_draw && h('button', {
          class: 'btn ghost small', type: 'button',
          onclick: busy(async () => { await call('admin_place_person', { p_person_id: p.id }); toast(`${p.full_name} added to the draw`); renderAdmin(panel); }),
        }, 'Add to draw'),
        p.id !== me.id && confirmButton('Remove', async () => { await call('admin_remove_person', { p_person_id: p.id }); renderAdmin(panel); }));
    }),
    addGuest);

  const quizBox = h('section', { class: 'card stack' },
    h('h2', {}, `All quiz questions (${questions.length})`),
    questions.length
      ? h('ol', { class: 'q-list' }, questions.map(x => questionCard(x,
          confirmButton('Delete', async () => { await call('delete_question', { p_id: x.id }); renderAdmin(panel); }))))
      : h('p', { class: 'hint' }, 'No questions yet.'));

  panel.replaceChildren(drawBox, peopleBox, quizBox);
}

// ---------- start ----------

async function boot() {
  $('#sleeps').textContent = sleepsLabel();
  if (!token) return showAuth();
  try {
    me = await call('me');
  } catch {
    // A stale token has already sent them to the login screen; anything else is a network problem.
    if (token) $('#loading').textContent = "Couldn't reach the Christmas server. Refresh the page to try again.";
    return;
  }
  $('#loading').hidden = true;
  $('#auth').hidden = true;
  $('#app').hidden = false;
  $('#whoami').hidden = false;
  $('#whoami-name').textContent = me.full_name;
  $('#admin-tab').hidden = !me.is_admin;
  refresh();
}

$('#mode-new').addEventListener('click', () => setAuthMode('new'));
$('#mode-back').addEventListener('click', () => setAuthMode('back'));
$('#auth-form').addEventListener('submit', submitAuth);
$('#signout').addEventListener('click', signOut);
document.querySelectorAll('.tabs button').forEach(b => b.addEventListener('click', () => openTab(b.dataset.tab)));

boot();

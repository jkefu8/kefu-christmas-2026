// Kefu Christmas 2026: front end. Talks to Supabase only through the
// database functions in supabase/schema.sql (sb.rpc), never to tables.

const sb = supabase.createClient(KEFU_CONFIG.supabaseUrl, KEFU_CONFIG.supabaseKey);
const TOKEN_KEY = 'kefu-xmas-token';
const TAB_KEY = 'kefu-xmas-tab';
const TEAM_NAMES = ['Tinsel', 'Sprouts', 'Crackers', 'Baubles', 'Mince Pies', 'Snowballs',
  'Holly', 'Reindeer', 'Pudding', 'Stockings', 'Gingerbread', 'Mistletoe'];

let token = store(TOKEN_KEY);
let me = null;
let authMode = 'new';
let draft = null; // organiser's unsaved team draw

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
function confirmButton(label, onConfirm) {
  let armed = false, timer;
  const b = h('button', { class: 'btn ghost small danger', type: 'button' }, label);
  b.addEventListener('click', busy(async () => {
    if (!armed) {
      armed = true; b.textContent = 'Tap again to confirm';
      timer = setTimeout(() => { armed = false; b.textContent = label; }, 3000);
      return;
    }
    clearTimeout(timer);
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
    ? "Put your full name in and choose a 4-digit PIN. You'll use them to get back in."
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
  store(TAB_KEY, name);
  document.querySelectorAll('.tabs button').forEach(b => b.setAttribute('aria-selected', b.dataset.tab === name));
  document.querySelectorAll('.panel').forEach(p => { p.hidden = p.id !== 'tab-' + name; });
  try { await RENDER[name]($('#tab-' + name)); } catch (err) { toast(err.message, true); }
}
const refresh = () => openTab(store(TAB_KEY) || 'teams');

// ---------- Teams ----------

async function renderTeams(panel) {
  const [teams, people] = await Promise.all([call('teams_view'), call('people_list')]);
  const mine = teams.find(t => t.members.some(m => m.id === me.id));
  panel.replaceChildren(
    mine
      ? h('section', { class: 'my-team' },
          h('p', { class: 'eyebrow' }, 'Your team'),
          h('h2', {}, 'Team ' + mine.name),
          h('ul', {}, mine.members.map(m => h('li', {}, m.full_name + (m.id === me.id ? ' (you)' : '')))))
      : h('section', { class: 'my-team' },
          h('p', { class: 'eyebrow' }, 'Your team'),
          h('h2', {}, 'Not drawn yet'),
          h('p', {}, `Teams of three are drawn once everyone has signed up. ${people.length} signed up so far.`)),
    teams.length > 0 && h('h3', {}, 'All teams'),
    teams.length > 0 && h('div', { class: 'team-grid' }, teams.map(t =>
      h('article', { class: 'team-card' + (t === mine ? ' is-mine' : '') },
        h('h4', {}, 'Team ' + t.name),
        h('ul', {}, t.members.map(m => h('li', {}, m.full_name)))))),
    h('h3', {}, `Who's signed up (${people.length})`),
    h('ul', { class: 'chips' }, people.map(p => h('li', { class: 'chip' }, p.full_name))),
  );
}

// ---------- Quiz ----------

async function renderQuiz(panel) {
  const mine = await call('my_questions');
  const q = h('textarea', { id: 'quiz-q', maxlength: 500, placeholder: 'e.g. What year did Grandad first burn the turkey?' });
  const a = h('input', { id: 'quiz-a', maxlength: 200, placeholder: 'e.g. 1998' });
  const form = h('form', { class: 'card stack' },
    h('h2', {}, 'Add a quiz question'),
    h('p', { class: 'lede' }, 'Only you and the quizmaster can see your questions, so no peeking.'),
    h('label', { for: 'quiz-q' }, 'Question'), q,
    h('label', { for: 'quiz-a' }, 'Answer'), a,
    h('button', { class: 'btn', type: 'submit' }, 'Add question'));
  form.addEventListener('submit', async e => {
    e.preventDefault();
    try {
      await call('add_question', { p_question: q.value, p_answer: a.value });
      toast('Question added');
      renderQuiz(panel);
    } catch (err) { toast(err.message, true); }
  });

  panel.replaceChildren(
    form,
    h('h3', {}, mine.length ? `Your questions (${mine.length})` : 'Your questions'),
    mine.length
      ? h('ol', { class: 'q-list' }, mine.map(x => h('li', { class: 'q-item' },
          h('div', {}, h('p', {}, x.question), h('p', { class: 'q-answer' }, h('b', {}, 'Answer: '), x.answer)),
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
    h('h2', {}, 'Which games shall we play?'),
    h('p', { class: 'lede' }, 'Tap a game to vote for it. Vote for as many as you like, and tap again to take your vote back.'),
    h('label', { for: 'game-name' }, 'Suggest a game'),
    h('div', { class: 'row' }, name, h('button', { class: 'btn', type: 'submit' }, 'Add')));
  form.addEventListener('submit', async e => {
    e.preventDefault();
    try { await call('add_game', { p_name: name.value }); toast('Game added'); renderGames(panel); }
    catch (err) { toast(err.message, true); }
  });

  panel.replaceChildren(
    form,
    games.length
      ? h('ul', { class: 'plain stack' }, games.map(g => h('li', { class: 'game' },
          h('button', {
            class: 'vote' + (g.mine ? ' is-on' : ''), type: 'button',
            'aria-pressed': g.mine, 'aria-label': `${g.mine ? 'Remove vote for' : 'Vote for'} ${g.name}`,
            onclick: busy(async () => { await call('toggle_vote', { p_game_id: g.id }); await renderGames(panel); }),
          }, h('span', {}, String(g.votes)), h('small', {}, g.votes === 1 ? 'vote' : 'votes')),
          h('div', {},
            h('p', { class: 'game-name' }, g.name),
            h('p', { class: 'game-voters' }, g.voters.length ? g.voters.join(', ') : `Suggested by ${g.added_by || 'someone'}`)),
          g.can_delete ? confirmButton('Remove', async () => { await call('delete_game', { p_id: g.id }); renderGames(panel); }) : h('span'),
          h('div', { class: 'bar' }, h('span', { style: `transform:scaleX(${g.votes / top})` })))))
      : h('p', { class: 'hint' }, 'No games yet. Suggest the first one above.'),
  );
}

// ---------- Organiser ----------

// Split an already-shuffled list of people into teams of three.
// Leftovers (1 or 2 people) each join a different team, making teams of four.
// Returns an array of teams, each an array of people, e.g. [[p1,p2,p3],[p4,p5,p6]].
function makeTeams(people) {
  const count = Math.max(1, Math.floor(people.length / 3));
  const teams = Array.from({ length: count }, (_, i) => people.slice(i * 3, i * 3 + 3));
  people.slice(count * 3).forEach((p, i) => teams[i % count].push(p));
  return teams;
}

function drawDraft(people) {
  const names = shuffle(TEAM_NAMES);
  return makeTeams(shuffle(people)).map((members, i) => ({
    name: names[i % names.length] + (i >= names.length ? ` ${Math.floor(i / names.length) + 1}` : ''),
    members,
  }));
}

async function renderAdmin(panel) {
  const [people, teams, questions] = await Promise.all([call('people_list'), call('teams_view'), call('all_questions')]);
  const teamOf = {};
  teams.forEach(t => t.members.forEach(m => { teamOf[m.id] = t.name; }));

  const drawBox = h('section', { class: 'card stack' },
    h('h2', {}, 'Draw the teams'),
    h('p', { class: 'lede' }, draft
      ? 'Here is a draw. Nobody else sees it until you save it.'
      : `${people.length} people signed up. Draw a random set of teams to preview it first.`),
    draft && h('div', { class: 'team-grid' }, draft.map(t =>
      h('article', { class: 'team-card' }, h('h4', {}, 'Team ' + t.name), h('ul', {}, t.members.map(m => h('li', {}, m.full_name)))))),
    h('div', { class: 'row' },
      h('button', {
        class: 'btn' + (draft ? ' ghost' : ''), type: 'button',
        onclick: () => {
          if (people.length < 2) return toast('Wait until a few more people sign up.', true);
          draft = drawDraft(people);
          renderAdmin(panel);
        },
      }, draft ? 'Draw again' : 'Draw teams'),
      draft && h('button', {
        class: 'btn', type: 'button',
        onclick: busy(async () => {
          await call('save_teams', { p_teams: draft.map(t => ({ name: t.name, members: t.members.map(m => m.id) })) });
          draft = null;
          toast('Teams saved. Everyone can see them now.');
          renderAdmin(panel);
        }),
      }, 'Save and show everyone')));

  const peopleBox = h('section', { class: 'card' },
    h('h2', {}, `People (${people.length})`),
    h('p', { class: 'hint' }, 'Someone forgot their PIN? Type a new one next to their name and tell them.'),
    people.map(p => {
      const pin = h('input', { id: 'pin-' + p.id, inputmode: 'numeric', maxlength: 4, placeholder: 'New PIN', 'aria-label': `New PIN for ${p.full_name}` });
      return h('div', { class: 'person-row' },
        h('span', { class: 'name' }, p.full_name, h('span', { class: 'hint' }, teamOf[p.id] ? ` · Team ${teamOf[p.id]}` : '')),
        pin,
        h('button', {
          class: 'btn ghost small', type: 'button',
          onclick: busy(async () => {
            await call('admin_reset_pin', { p_person_id: p.id, p_pin: pin.value.trim() });
            pin.value = '';
            toast(`PIN reset for ${p.full_name}`);
          }),
        }, 'Reset PIN'),
        p.id !== me.id && confirmButton('Remove', async () => { await call('admin_remove_person', { p_person_id: p.id }); renderAdmin(panel); }));
    }));

  const quizBox = h('section', { class: 'card stack' },
    h('h2', {}, `All quiz questions (${questions.length})`),
    questions.length
      ? h('ol', { class: 'q-list' }, questions.map(x => h('li', { class: 'q-item' },
          h('div', {},
            h('p', { class: 'hint' }, x.author),
            h('p', {}, x.question),
            h('p', { class: 'q-answer' }, h('b', {}, 'Answer: '), x.answer)),
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

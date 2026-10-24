// A Xmas for the Ages (Kefu Christmas 2026): front end. Talks to Supabase only through the
// database functions in supabase/schema.sql (sb.rpc), never to tables.

const TAB_KEY = 'kefu-xmas-tab';
const TEAM_NAMES = ['Tinsel', 'Sprouts', 'Crackers', 'Baubles', 'Mince Pies', 'Snowballs',
  'Holly', 'Reindeer', 'Pudding', 'Stockings', 'Gingerbread', 'Mistletoe'];
const POLL_MS = 5000;

let me = null;
let authMode = 'new';
let pollTimer = null;

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
    ? "Type your name, then choose a 4-digit PIN. You'll use them to get back in."
    : 'Welcome back. Type your full name and your PIN.';
  $('#auth-pin-hint').hidden = !isNew;
  $('#auth-submit').textContent = isNew ? 'Join the Christmas fun' : 'Log in';
  $('#auth-error').hidden = true;
}

// Shows the error, plus "Did you mean…" buttons that fill in a close guest name.
function showAuthError(message, suggestions = []) {
  const err = $('#auth-error');
  fill(err, 
    h('span', {}, message),
    suggestions.length > 0 && h('span', { class: 'suggest' },
      h('span', {}, 'Did you mean:'),
      suggestions.map(n => h('button', {
        class: 'btn ghost small', type: 'button',
        onclick: () => { $('#auth-name').value = n; err.hidden = true; $('#auth-pin').focus(); },
      }, n))),
    suggestions.length === 0 && message.includes('guest list') &&
      h('span', { class: 'hint' }, 'Try your full name as it is on the invite, or ask the organiser.'));
  err.hidden = false;
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
    const { data, error } = await sb.rpc(authMode === 'new' ? 'register' : 'login', { p_name: name, p_pin: pin });
    if (error) throw new Error(error.message);
    if (data.error) {
      showAuthError(data.error, data.suggestions);
      return;
    }
    token = data.token;
    store(TOKEN_KEY, token);
    $('#auth-form').reset();
    await boot();
    toast(`Welcome, ${data.full_name}!`);
  } catch (ex) {
    showAuthError(ex.message);
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
        icon('crown', 'crown'),
        h('h4', {}, t.name),
        h('span', { class: 'team-count' }, `${t.members.length}/${t.size}`)),
      h('ul', {},
        t.members.map(m => h('li', {}, m.full_name + (m.id === me.id ? ' (you)' : ''))),
        Array.from({ length: empty }, () => h('li', { class: 'slot' }, 'Waiting for a spin'))));
  }));
}

// Draws the wheel; spinning just rotates the canvas with a CSS transition.
// turnDeg is where the wheel rests, so labels on the left half can be flipped the right way up.
function drawWheel(canvas, teams, turnDeg = 0) {
  const dpr = window.devicePixelRatio || 1;
  const size = 320;
  canvas.width = size * dpr; canvas.height = size * dpr;
  const ctx = canvas.getContext('2d');
  ctx.scale(dpr, dpr);
  const r = size / 2, seg = (Math.PI * 2) / teams.length;
  teams.forEach((t, i) => {
    const start = -Math.PI / 2 + i * seg, mid = start + seg / 2;
    ctx.beginPath();
    ctx.moveTo(r, r);
    ctx.arc(r, r, r - 4, start, start + seg);
    ctx.closePath();
    ctx.fillStyle = cssVar(`--team-${(i % TEAM_COLOURS) + 1}`);
    ctx.fill();
    ctx.strokeStyle = cssVar('--slip');
    ctx.lineWidth = 3;
    ctx.stroke();
    ctx.save();
    ctx.translate(r, r);
    const upsideDown = Math.cos(mid + (turnDeg * Math.PI) / 180) < 0;
    ctx.rotate(upsideDown ? mid + Math.PI : mid);
    ctx.fillStyle = cssVar(`--team-${(i % TEAM_COLOURS) + 1}-ink`);
    let px = teams.length > 8 ? 13 : 17; // shrink captain-chosen names until they fit
    do { ctx.font = `${px}px ${cssVar('--font-display')}`; } while (ctx.measureText(t.name).width > r - 52 && --px > 9);
    ctx.textAlign = upsideDown ? 'left' : 'right';
    ctx.textBaseline = 'middle';
    ctx.fillText(t.name, upsideDown ? -(r - 18) : r - 18, 0);
    ctx.restore();
  });
  ctx.beginPath();
  ctx.arc(r, r, 26, 0, Math.PI * 2);
  ctx.fillStyle = cssVar('--gold');
  ctx.fill();
}

// The wheel is drawn on a canvas, so wait for the display face before lettering it.
async function displayFontReady() {
  try { await document.fonts.load(`17px ${cssVar('--font-display')}`); } catch { /* draw with the fallback */ }
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

// Your team, presented as the prize from the cracker. The captain (first to spin) names it.
function prizeSlip(view, isNew, onRenamed) {
  const i = view.teams.findIndex(t => t.id === view.my_team), t = view.teams[i];
  const mates = t.members.filter(m => m.id !== me.id).map(m => m.full_name);
  const waiting = t.size - t.members.length;
  const captain = t.members.find(m => m.id === t.captain_id);
  let naming = null;
  if (t.captain_id === me.id) {
    const input = h('input', { id: 'team-name', maxlength: 24, value: t.name, 'aria-label': 'Team name', autocapitalize: 'words' });
    naming = h('form', { class: 'team-namer' },
      h('p', { class: 'label' }, "You're the captain, so you choose the team name."),
      h('div', { class: 'row' }, input, h('button', { class: 'btn', type: 'submit' }, 'Save name')));
    naming.addEventListener('submit', async e => {
      e.preventDefault();
      try { await call('rename_team', { p_team_id: t.id, p_name: input.value }); toast('Team name saved'); onRenamed?.(); }
      catch (err) { toast(err.message, true); }
    });
  }
  return h('section', { class: 'prize' + (isNew ? ' is-new' : ''), style: `--team:${teamColour(i)}` },
    icon('crown', 'prize-crown'),
    h('h2', {}, `You're in ${t.name}!`),
    h('p', {}, mates.length ? `With ${mates.join(', ')}.` : 'Your teammates appear here as they spin.'),
    waiting > 0 && h('p', { class: 'prize-wait' }, waiting === 1 ? 'One more still to spin.' : `${waiting} more still to spin.`),
    naming || (captain && h('p', { class: 'prize-wait' }, `${captain.full_name} is captain and picks the team name.`)));
}

let justSpun = false;
async function renderTeams(panel) {
  clearInterval(pollTimer);
  let view = await call('teams_view');

  if (!view.teams.length) {
    fill(panel, h('section', { class: 'my-team' },
      h('h2', {}, 'The wheel is coming'),
      h('p', {}, 'Once the organiser sets up the draw, you can spin the wheel here to find your team of three.')));
    return;
  }

  const board = h('div', {}, teamBoard(view));
  const spun = () => view.teams.reduce((n, t) => n + t.members.length, 0);
  const total = view.teams.reduce((n, t) => n + t.size, 0);
  const progress = h('p', { class: 'lede' }, `${spun()} of ${total} have spun so far.`);
  const boardSection = h('section', { class: 'stack' }, h('h2', { class: 'section-title' }, 'The teams'), progress, board);

  if (view.my_team) {
    // Already spun: your team is the prize, then the board. The wheel has done its job.
    fill(panel, prizeSlip(view, justSpun, () => renderTeams(panel)), boardSection);
    justSpun = false;
  } else {
    const canvas = h('canvas', { class: 'wheel', width: 320, height: 320, 'aria-hidden': 'true' });
    const status = h('p', { class: 'spin-status', 'aria-live': 'polite' },
      view.in_draw ? 'Spin the wheel to find out which team you are in.' : "You're not in the draw yet. Ask the organiser to add you.");
    const spinBtn = h('button', { class: 'btn big', type: 'button', hidden: !view.in_draw }, 'Spin for my team');
    spinBtn.addEventListener('click', busy(async () => {
      clearInterval(pollTimer);
      status.textContent = 'Spinning…';
      const res = await call('spin');
      await spinTo(canvas, view.teams, res.team_id);
      confetti(canvas);
      justSpun = true;
      await renderTeams(panel);
    }));
    fill(panel,
      h('section', { class: 'wheel-box' },
        h('div', { class: 'wheel-wrap' }, h('div', { class: 'wheel-pointer', 'aria-hidden': 'true' }), canvas),
        status, spinBtn),
      boardSection);
    wheelTurn = 0;
    canvas.style.transitionDuration = '0s';
    canvas.style.transform = 'rotate(0deg)';
    drawWheel(canvas, view.teams);
    displayFontReady().then(() => drawWheel(canvas, view.teams));
  }

  // Keep the board live so everyone sees new names land.
  pollTimer = setInterval(async () => {
    if (document.hidden || panel.querySelector('button:disabled')) return;
    try {
      const next = await call('teams_view');
      if (JSON.stringify(next) === JSON.stringify(view)) return;
      if (next.my_team !== view.my_team) return renderTeams(panel); // revealed by the organiser
      view = next;
      fill(board, teamBoard(view));
      progress.textContent = `${spun()} of ${total} have spun so far.`;
      const prize = panel.querySelector('.prize');
      if (prize && !prize.contains(document.activeElement)) fill(prize, ...prizeSlip(view, false, () => renderTeams(panel)).childNodes);
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

function questionCard(x, n, actions) {
  return h('li', { class: 'q-item' },
    h('div', { class: 'stack tight' },
      x.photo && h('img', { class: 'q-photo', src: x.photo, alt: 'Photo for this question' }),
      h('p', { class: 'q-text' }, x.question),
      x.options
        ? h('ul', { class: 'q-options' }, x.options.map((o, i) =>
            h('li', { class: i === x.correct ? 'is-correct' : '' }, i === x.correct && icon('check'), o)))
        : h('p', { class: 'q-answer' }, h('b', {}, 'Answer: '), x.answer),
      h('p', { class: 'q-meta' }, [`Slip ${n}`, x.kind === 'tf' ? 'True or false' : 'Multiple choice', x.author].filter(Boolean).join(' · '))),
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
    fill(typeSwitch, ...[['tf', 'True / False'], ['mc', 'Multiple choice']].map(([k, label]) =>
      h('button', {
        type: 'button', role: 'radio', 'aria-checked': kind === k, class: kind === k ? 'is-on' : '',
        onclick: () => { kind = k; drawTypeSwitch(); drawAnswers(); },
      }, label)));
  }

  function drawAnswers() {
    if (kind === 'tf') {
      fill(answers, 
        h('p', { class: 'label' }, 'Which is correct?'),
        h('div', { class: 'row' }, ['True', 'False'].map((t, i) =>
          h('label', { class: 'choice' }, h('input', { type: 'radio', name: 'correct', value: i, id: `tf-${i}` }), t))));
    } else {
      fill(answers, 
        h('p', { class: 'label' }, 'Four choices. Tick the correct one.'),
        ['A', 'B', 'C', 'D'].map((letter, i) =>
          h('div', { class: 'mc-row' },
            h('input', { type: 'radio', name: 'correct', value: i, id: `mc-correct-${i}`, 'aria-label': `Choice ${letter} is correct` }),
            h('input', { id: `mc-${i}`, class: 'mc-option', maxlength: 120, placeholder: `Choice ${letter}`, 'aria-label': `Choice ${letter}` }))));
    }
  }

  function drawPhoto() {
    fill(photoBox, photo
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
  fill(panel, 
    form,
    h('h3', {}, mine.length ? `Your questions (${mine.length})` : 'Your questions'),
    mine.length
      ? h('ol', { class: 'q-list' }, mine.map((x, i) => questionCard(x, i + 1,
          confirmButton('Delete', async () => { await call('delete_question', { p_id: x.id }); renderQuiz(panel); }))))
      : h('p', { class: 'hint' }, "You haven't added any yet. Two or three each is plenty."),
  );
}

// ---------- Games ----------

// How-to-play guide for a game: its illustration and numbered steps, folded away.
function howToPlay(g) {
  return g?.steps && h('details', { class: 'how' },
    h('summary', {}, 'How to play'),
    gameArt(g.slug),
    h('ol', { class: 'steps' }, g.steps.map(s => h('li', {}, s))));
}

async function renderGames(panel) {
  const games = await call('games_view');
  const main = games.find(g => g.slug === 'bauble-pong'); // Beer Pong: the tournament, not a vote
  const others = games.filter(g => g !== main);
  const top = Math.max(1, ...others.map(g => g.votes));
  const name = h('input', { id: 'game-name', maxlength: 60, placeholder: 'e.g. Charades, Articulate, Pictionary' });
  const form = h('form', { class: 'card stack' },
    h('label', { for: 'game-name' }, 'Add a game'),
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

  const tourney = h('section', { class: 'card stack' });
  fill(panel,
    tourney,
    h('div', { class: 'stack tight' },
      h('h2', {}, 'More games'),
      h('p', { class: 'lede' }, others.length
        ? 'Tap the number to vote for what else we play. Tap again to take your vote back.'
        : 'More games are on the way. Add one below and everyone can vote on it.')),
    others.length > 0 && h('ul', { class: 'plain stack' }, others.map(g => h('li', { class: 'game' },
      h('div', { class: 'game-top' },
        voteButton(g),
        h('div', { class: 'game-title' },
          h('p', { class: 'game-name' }, g.name),
          h('p', { class: 'game-voters' }, g.description || `Added by ${g.added_by || 'someone'}`)),
        g.can_delete ? confirmButton('Remove', async () => { await call('delete_game', { p_id: g.id }); renderGames(panel); }) : null),
      h('div', { class: 'bar' }, h('span', { style: `transform:scaleX(${g.votes / top})` })),
      g.voters.length > 0 && h('p', { class: 'game-voters' }, 'Votes: ' + g.voters.join(', ')),
      howToPlay(g)))),
    form,
  );
  await renderTournament(tourney, main);
}

// ---------- Beer Pong tournament ----------

const TOURNAMENT_RULES = [
  'Every team plays. Lose a match and your team is out. Teams with a bye go straight to the semi-finals.',
  'Two throwers per match. Swap who throws between matches so everyone on the team gets a go.',
  'Six cups in a triangle at each end, each with a splash of beer. Water or a soft drink is fine for anyone who prefers.',
  'Take turns throwing, one ball per thrower. Elbows stay behind the edge of the table.',
  'Sink a cup and the other team drinks it and takes it away. If both throwers sink, you get the balls back.',
  'A bounce shot counts for two cups, but the other team can swat a bounce away.',
  'Each team gets one re-rack per match.',
  'Lose your last cup and each thrower gets one redemption shot. Miss both and the match is over.',
  'The organiser has the final say on any argument.',
];

// Bracket positions that spread the seeds so byes go to the top seeds.
// size 8 -> [0, 7, 3, 4, 1, 6, 2, 5] (0-based seed numbers).
function bracketOrder(size) {
  let order = [0];
  while (order.length < size) {
    const n = order.length * 2;
    order = order.flatMap(i => [i, n - 1 - i]);
  }
  return order;
}

// Every match, worked out from the seeding and the winners picked so far.
// A side is a team id, null for a bye, or undefined while that earlier match is unplayed.
function buildBracket(seeds, results) {
  const size = 2 ** Math.ceil(Math.log2(Math.max(2, seeds.length)));
  let slots = bracketOrder(size).map(i => (i < seeds.length ? seeds[i] : null));
  const rounds = [];
  for (let r = 0; slots.length > 1; r++) {
    const matches = [];
    for (let i = 0; i < slots.length; i += 2) {
      const a = slots[i], b = slots[i + 1], key = `${r}-${i / 2}`;
      const bye = a === null || b === null;
      let winner;
      if (a === null && b === null) winner = null;
      else if (bye) winner = a === null ? b : a; // undefined if the other side isn't decided yet
      else if (a !== undefined && b !== undefined && (results[key] === a || results[key] === b)) winner = results[key];
      matches.push({ key, a, b, bye, winner });
    }
    rounds.push(matches);
    slots = matches.map(m => m.winner);
  }
  return rounds;
}

// Drop any result that no longer fits, e.g. after an earlier winner was changed.
function pruneResults(seeds, results) {
  return Object.fromEntries(buildBracket(seeds, results).flat()
    .filter(m => !m.bye && m.winner != null && results[m.key] === m.winner)
    .map(m => [m.key, m.winner]));
}

function roundName(r, total) {
  const fromEnd = total - 1 - r;
  return ['Final', 'Semi-finals', 'Quarter-finals'][fromEnd] || `Round ${r + 1}`;
}

async function renderTournament(box, game) {
  let t = await call('tournament_view');
  const teamIdx = Object.fromEntries(t.teams.map((x, i) => [x.id, i]));
  const name = id => t.teams[teamIdx[id]]?.name;

  const save = async (seeds, results) => {
    await call('tournament_set', { p_seeds: seeds, p_results: pruneResults(seeds, results) });
    renderTournament(box, game);
  };
  const drawBracket = () => save(shuffle(t.teams.map(x => x.id)), {});

  const intro = [
    h('div', { class: 'main-game-head' }, h('span', { class: 'main-tag' }, 'Main game'), h('h2', {}, 'Beer Pong tournament')),
    h('p', { class: 'lede' }, 'Every team plays, knockout style. Adults only, so please drink responsibly.'),
    h('h3', { class: 'slip-sub' }, 'Tournament rules'),
    h('ul', { class: 'rules' }, TOURNAMENT_RULES.map(r => h('li', {}, r))),
    howToPlay(game),
    h('h3', { class: 'slip-sub' }, 'The bracket'),
  ];
  if (!t.teams.length) {
    return fill(box, intro, h('p', { class: 'lede' }, 'The bracket appears here once the teams have been drawn.'));
  }
  const valid = t.seeds.length === t.teams.length && t.seeds.every(id => id in teamIdx);
  if (!valid) {
    return fill(box, intro,
      h('p', { class: 'lede' }, `All ${t.teams.length} teams play. The organiser draws the bracket, with random byes if the numbers are uneven.`),
      me.is_admin && h('button', { class: 'btn', type: 'button', onclick: busy(drawBracket) }, t.seeds.length ? 'Teams changed: draw a new bracket' : 'Draw the bracket'));
  }

  const rounds = buildBracket(t.seeds, t.results);
  const champion = rounds.at(-1)[0].winner;

  const side = (m, id) => {
    if (id === null) return h('div', { class: 'side bye' }, 'Bye');
    if (id === undefined) return h('div', { class: 'side tbd' }, 'To be decided');
    const decided = m.winner != null && !m.bye;
    const cls = 'side' + (m.winner === id ? ' won' : decided ? ' lost' : '');
    const label = [h('span', { class: 'dot', style: `--team:${teamColour(teamIdx[id])}` }), h('span', { class: 'side-name' }, name(id)),
      m.winner === id && !m.bye && icon('check')];
    const canPick = me.is_admin && !m.bye && m.a !== undefined && m.b !== undefined;
    if (!canPick) return h('div', { class: cls }, label);
    return h('button', {
      class: cls, type: 'button', 'aria-pressed': m.winner === id,
      title: m.winner === id ? 'Tap again to undo' : `${name(id)} won`,
      onclick: busy(() => {
        const results = { ...t.results };
        if (results[m.key] === id) delete results[m.key]; else results[m.key] = id;
        return save(t.seeds, results);
      }),
    }, label);
  };

  fill(box, intro,
    champion != null
      ? h('p', { class: 'champion' }, icon('trophy'), `${name(champion)} are the Beer Pong champions!`)
      : h('p', { class: 'lede' }, me.is_admin ? 'Tap the winning team of each match. Tap again to undo.' : 'Winners move on automatically. The organiser records each result.'),
    h('div', { class: 'bracket-scroll' }, h('div', { class: 'bracket' }, rounds.map((ms, r) =>
      h('section', { class: 'round' },
        h('h4', {}, roundName(r, rounds.length)),
        h('div', { class: 'round-matches' }, ms.map(m => h('div', { class: 'match' + (m.bye ? ' is-bye' : '') }, side(m, m.a), side(m, m.b)))))))),
    me.is_admin && h('div', { class: 'row' },
      confirmButton('Redraw the bracket', drawBracket),
      Object.keys(t.results).length > 0 && confirmButton('Clear all results', () => save(t.seeds, {}))));

  // Keep the bracket live while the Games tab is open.
  clearInterval(pollTimer);
  pollTimer = setInterval(async () => {
    if (document.hidden || box.querySelector(':disabled')) return;
    try {
      const next = await call('tournament_view');
      if (JSON.stringify(next) !== JSON.stringify(t)) { t = next; renderTournament(box, game); }
    } catch { /* try again next tick */ }
  }, POLL_MS);
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

// Organiser override for a team name (captains normally choose their own).
function renameControl(t, done) {
  const input = h('input', { id: 'rename-' + t.id, maxlength: 24, value: t.name, 'aria-label': `New name for ${t.name}` });
  const form = h('form', { class: 'rename' }, input, h('button', { class: 'btn ghost small', type: 'submit' }, 'Rename'));
  form.addEventListener('submit', async e => {
    e.preventDefault();
    try { await call('rename_team', { p_team_id: t.id, p_name: input.value }); toast('Team renamed'); done(); }
    catch (err) { toast(err.message, true); }
  });
  return form;
}

async function renderAdmin(panel) {
  const [people, view, questions, fullTeams] = await Promise.all([call('people_list'), call('teams_view'), call('all_questions'), call('admin_teams_full')]);
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
      const drawState = !hasDraw ? null : p.spun ? teamOf[p.id] : p.in_draw ? 'Not spun yet' : 'Not in draw';
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
      ? h('ol', { class: 'q-list' }, questions.map((x, i) => questionCard(x, i + 1,
          confirmButton('Delete', async () => { await call('delete_question', { p_id: x.id }); renderAdmin(panel); }))))
      : h('p', { class: 'hint' }, 'No questions yet.'));

  const tvBox = h('section', { class: 'card stack' },
    h('h2', {}, 'Quiz night'),
    h('p', { class: 'lede' }, `Open this on the laptop connected to the TV. ${questions.length} questions so far. Space reveals the answer, the right arrow moves on, F goes fullscreen.`),
    h('a', { class: 'btn', href: 'tv.html', target: '_blank', rel: 'noopener' }, 'Open the TV quiz screen'));

  const fullBox = fullTeams.length > 0 && h('section', { class: 'card stack' },
    h('h2', {}, 'Full team list'),
    h('p', { class: 'lede' }, "Everyone in every team. Names in italics haven't spun yet, so keep those a secret."),
    h('div', { class: 'team-grid' }, fullTeams.map((t, i) =>
      h('article', { class: 'team-card full', style: `--team:${teamColour(i)}` },
        h('div', { class: 'team-head' },
          icon('crown', 'crown'),
          h('span', { class: 'team-count' }, `${t.members.filter(m => m.spun).length}/${t.members.length} spun`),
          h('h4', {}, t.name)),
        h('ul', {}, t.members.map(m => h('li', { class: m.spun ? '' : 'slot' }, m.full_name))),
        renameControl(t, () => renderAdmin(panel))))));

  fill(panel, drawBox, fullBox, tvBox, peopleBox, quizBox);
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
onStaleSession = signOut;
document.querySelectorAll('.tabs button').forEach(b => b.addEventListener('click', () => openTab(b.dataset.tab)));

boot();

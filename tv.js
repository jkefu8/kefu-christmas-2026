// Kefu Christmas 2026: TV quiz screen. Organiser only.
// Keys: Space/Enter reveal or next · → next · ← back · S scores · T 30s timer · F fullscreen.

const TIMER_SECONDS = 30;
const LETTERS = ['A', 'B', 'C', 'D'];

const tv = $('#tv');
const state = {
  view: 'start',      // start | question | scores | end
  questions: [],      // in quiz order
  idx: 0,
  revealed: false,
  teams: [],          // [{id, name, members}]
  scores: {},         // team_id -> points
  teamOf: {},         // person_id -> team_id
};
let timer = null;     // {ends, tick}

onStaleSession = () => message('Your login has expired. ', h('a', { href: './' }, 'Log in on the main site'), ', then come back.');

function message(...kids) {
  fill(tv, h('p', { class: 'tv-message' }, ...kids));
}

const teamIndex = id => state.teams.findIndex(t => t.id === id);
const current = () => state.questions[state.idx];
const ownTeam = q => q && state.teamOf[q.author_id];

function save() {
  call('quiz_night_set', {
    p_question_ids: state.questions.map(q => q.id), p_idx: state.idx, p_revealed: state.revealed,
  }).catch(err => toast(err.message, true));
}

// ---------- loading ----------

async function load() {
  const [questions, night, teamsView, scores] = await Promise.all([
    call('all_questions'), call('quiz_night_get'), call('teams_view'), call('quiz_scores_view'),
  ]);
  state.teams = teamsView.teams;
  state.teamOf = {};
  state.teams.forEach(t => t.members.forEach(m => { state.teamOf[m.id] = t.id; }));
  state.scores = Object.fromEntries(scores.map(s => [s.team_id, s.points]));

  // Keep the saved order; drop deleted questions, add any new ones at the end.
  const byId = new Map(questions.map(q => [q.id, q]));
  const ordered = night.question_ids.map(id => byId.get(id)).filter(Boolean);
  const extra = questions.filter(q => !night.question_ids.includes(q.id));
  state.questions = [...ordered, ...extra];
  state.idx = Math.min(night.idx, Math.max(0, state.questions.length - 1));
  state.revealed = night.revealed;
  state.started = night.question_ids.length > 0;
}

// ---------- views ----------

function topStrip(left) {
  return h('header', { class: 'tv-top' },
    h('span', {}, left),
    h('div', { class: 'timer', id: 'timer', hidden: !timer }, h('span', { id: 'timer-fill' })),
    h('span', { class: 'timer-label', id: 'timer-label' }, timer ? '' : 'Kefu Christmas 2026'));
}

function scoreChips(q) {
  const own = ownTeam(q);
  return h('div', { class: 'bar-group' }, state.teams.map(t => {
    const isOwn = t.id === own;
    return h('span', {
      class: 'score-chip' + (isOwn ? ' own' : ''), style: `--team:${teamColour(teamIndex(t.id))}`,
      title: isOwn ? "Their own question, so they can't score" : `Give Team ${t.name} a point`,
    },
      h('button', { class: 'plus', type: 'button', disabled: isOwn, onclick: busy(() => addPoint(t.id, 1)) }, `${t.name} +1`),
      h('span', { class: 'pts' }, String(state.scores[t.id] || 0)),
      h('button', { class: 'minus', type: 'button', 'aria-label': `Take a point from Team ${t.name}`, onclick: busy(() => addPoint(t.id, -1)) }, '−'));
  }));
}

function controls(extra) {
  return h('footer', { class: 'bar' },
    extra || h('span'),
    h('div', { class: 'bar-group' },
      state.view === 'question' && h('button', { class: 'btn', type: 'button', onclick: back, disabled: state.idx === 0 && !state.revealed }, '← Back'),
      state.view === 'question' && h('button', { class: 'btn primary', type: 'button', onclick: forward },
        state.revealed ? (state.idx === state.questions.length - 1 ? 'Final scores' : 'Next question') : 'Reveal answer',
        h('span', { class: 'key' }, 'Space')),
      state.view === 'question' && h('button', { class: 'btn', type: 'button', onclick: toggleTimer }, timer ? 'Stop timer' : '30s timer', h('span', { class: 'key' }, 'T')),
      state.view !== 'start' && h('button', { class: 'btn', type: 'button', onclick: toggleScores },
        state.view === 'scores' ? 'Back to quiz' : 'Scores', h('span', { class: 'key' }, 'S')),
      h('button', { class: 'btn', type: 'button', onclick: toggleFullscreen }, 'Fullscreen', h('span', { class: 'key' }, 'F')),
      h('a', { class: 'btn', href: './' }, 'Exit')));
}

function renderStart() {
  const n = state.questions.length;
  const people = new Set(state.questions.map(q => q.author_id)).size;
  fill(tv, 
    topStrip('Quiz night'),
    h('main', { class: 'stage' },
      h('p', { class: 'eyebrow' }, 'Kefu Christmas 2026'),
      h('h1', { class: 'big-title' }, 'Quiz Night'),
      h('p', { class: 'lede' }, n
        ? `${n} questions from ${people} ${people === 1 ? 'person' : 'people'}, ${state.teams.length} teams. Nobody can score on a question their own team wrote.`
        : 'No questions yet. People add them on the Quiz tab of the main site.'),
      h('div', { class: 'bar-group' },
        state.started && state.idx < n && h('button', { class: 'btn primary', type: 'button', onclick: () => show('question') },
          `Continue from question ${state.idx + 1}`),
        n > 0 && h('button', { class: 'btn' + (state.started ? '' : ' primary'), type: 'button', onclick: startNew },
          state.started ? 'Start again (new order)' : 'Start the quiz'),
        Object.values(state.scores).some(Boolean) && h('button', { class: 'btn', type: 'button', onclick: busy(resetScores) }, 'Reset scores'))),
    controls());
}

function renderQuestion() {
  const q = current();
  const own = ownTeam(q);
  const ownName = state.teams.find(t => t.id === own)?.name;
  const options = q.options || ['True', 'False'];
  fill(tv, 
    topStrip(`Question ${state.idx + 1} of ${state.questions.length} · ${q.kind === 'tf' ? 'True or false' : 'Multiple choice'}`),
    h('main', { class: 'stage' + (q.photo ? ' has-photo' : '') + (state.revealed ? ' revealed' : '') },
      q.photo && h('img', { class: 'q-photo', src: q.photo, alt: '' }),
      h('h1', { class: 'q-text' }, q.question),
      h('div', { class: 'tiles' }, options.map((o, i) =>
        h('div', { class: 'tile' + (i === q.correct ? ' correct' : '') },
          h('span', { class: 'letter' }, q.kind === 'tf' ? '' : LETTERS[i]),
          h('span', {}, o),
          state.revealed && i === q.correct && h('span', { class: 'tick', 'aria-label': 'Correct' }, '✓')))),
      state.revealed && h('p', { class: 'asked-by' },
        'Asked by ', h('b', {}, q.author), ownName ? `. Team ${ownName} can't score this one.` : '.')),
    controls(state.revealed ? scoreChips(q) : null));
  if (timer) drawTimer();
}

function leaderboard() {
  const rows = [...state.teams].sort((a, b) => (state.scores[b.id] || 0) - (state.scores[a.id] || 0));
  const top = Math.max(1, ...rows.map(t => state.scores[t.id] || 0));
  const topScore = state.scores[rows[0]?.id] || 0;
  return h('div', { class: 'board' }, rows.map((t, i) => {
    const pts = state.scores[t.id] || 0;
    return h('div', { class: 'board-row' + (pts === topScore && pts > 0 ? ' leader' : ''), style: `--team:${teamColour(teamIndex(t.id))}` },
      h('span', { class: 'pos' }, String(i + 1)),
      h('span', { class: 'name' }, t.name),
      h('div', { class: 'board-bar' }, h('span', { style: `transform:scaleX(${pts / top})` })),
      h('span', { class: 'pts' }, String(pts)));
  }));
}

function renderScores() {
  fill(tv, 
    topStrip(`After question ${state.idx + 1} of ${state.questions.length}`),
    h('main', { class: 'stage' }, h('p', { class: 'eyebrow' }, 'Scoreboard'), h('h2', { class: 'big-title' }, 'How the teams stand'), leaderboard()),
    controls());
}

function renderEnd() {
  const best = Math.max(0, ...state.teams.map(t => state.scores[t.id] || 0));
  const winners = state.teams.filter(t => (state.scores[t.id] || 0) === best && best > 0);
  fill(tv, 
    topStrip('Final scores'),
    h('main', { class: 'stage' },
      h('p', { class: 'eyebrow' }, 'And the winner is…'),
      h('h1', { class: 'winner' }, winners.length
        ? (winners.length === 1 ? `Team ${winners[0].name}!` : `A tie: ${winners.map(t => t.name).join(' & ')}!`)
        : 'Nobody scored. Everyone loses!'),
      winners[0] && h('p', { class: 'lede' }, winners.flatMap(t => t.members.map(m => m.full_name)).join(', ')),
      leaderboard()),
    controls());
}

function show(view) {
  state.view = view;
  ({ start: renderStart, question: renderQuestion, scores: renderScores, end: renderEnd })[view]();
}

// ---------- actions ----------

function startNew() {
  state.questions = shuffle(state.questions);
  state.idx = 0; state.revealed = false; state.started = true;
  save();
  show('question');
}

function forward() {
  if (state.view !== 'question') return;
  stopTimer();
  if (!state.revealed) { state.revealed = true; save(); return show('question'); }
  if (state.idx >= state.questions.length - 1) return show('end');
  state.idx++; state.revealed = false;
  save(); show('question');
}

function back() {
  if (state.view !== 'question') return;
  stopTimer();
  if (state.revealed) state.revealed = false;
  else if (state.idx > 0) { state.idx--; state.revealed = true; }
  save(); show('question');
}

function toggleScores() {
  if (state.view === 'scores' || state.view === 'end') return show(state.questions.length ? 'question' : 'start');
  if (state.view === 'question') show('scores');
}

async function addPoint(teamId, delta) {
  state.scores[teamId] = await call('quiz_score_add', { p_team_id: teamId, p_delta: delta });
  if (state.view === 'question') {
    // Update the number in place so the buttons don't jump around.
    const chip = tv.querySelectorAll('.score-chip')[teamIndex(teamId)];
    if (chip) chip.querySelector('.pts').textContent = String(state.scores[teamId]);
  }
}

async function resetScores() {
  await call('quiz_scores_reset');
  state.scores = {};
  toast('Scores reset');
  show('start');
}

function toggleFullscreen() {
  const req = document.documentElement.requestFullscreen;
  if (document.fullscreenElement) document.exitFullscreen?.();
  else req?.call(document.documentElement).catch(() => toast("This browser won't go fullscreen. Try the browser's own fullscreen option.", true));
}

// ---------- timer ----------

function toggleTimer() {
  if (timer) { stopTimer(); return show(state.view); }
  timer = { ends: Date.now() + TIMER_SECONDS * 1000 };
  timer.tick = setInterval(drawTimer, 250);
  show(state.view);
}
function stopTimer() {
  if (!timer) return;
  clearInterval(timer.tick);
  timer = null;
}
function drawTimer() {
  const bar = $('#timer'), fill = $('#timer-fill'), label = $('#timer-label');
  if (!timer || !bar) return;
  const left = Math.max(0, timer.ends - Date.now());
  bar.hidden = false;
  fill.style.transitionDuration = '0.25s';
  fill.style.transform = `scaleX(${left / (TIMER_SECONDS * 1000)})`;
  bar.classList.toggle('done', left === 0);
  label.textContent = left ? `${Math.ceil(left / 1000)}s` : "Time's up!";
  if (!left) clearInterval(timer.tick);
}

// ---------- keyboard ----------

document.addEventListener('keydown', e => {
  if (e.target.closest('input, textarea') || e.metaKey || e.ctrlKey || e.altKey) return;
  const k = e.key;
  if (k === ' ' || k === 'Enter' || k === 'ArrowRight' || k === 'PageDown') {
    if (state.view === 'question') { e.preventDefault(); forward(); }
  } else if (k === 'ArrowLeft' || k === 'PageUp') { e.preventDefault(); back(); }
  else if (k === 's' || k === 'S') toggleScores();
  else if ((k === 't' || k === 'T') && state.view === 'question') toggleTimer();
  else if (k === 'f' || k === 'F') toggleFullscreen();
});

// ---------- start ----------

(async function boot() {
  if (!token) return message('Log in on the ', h('a', { href: './' }, 'main site'), ' first, then open Quiz night from the Organiser tab.');
  try {
    const me = await call('me');
    if (!me.is_admin) return message('Only the organiser can run quiz night. ', h('a', { href: './' }, 'Back to the site'));
    await load();
    show('start');
  } catch (err) {
    if (token) message(err.message, ' ', h('a', { href: './' }, 'Back to the site'));
  }
})();

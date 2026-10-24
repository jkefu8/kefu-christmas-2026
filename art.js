// "How to play" illustration for the built-in game, keyed by games.slug.
// Static markup only (no user text), coloured through the .art-* classes in style.css.

const arrowHead = `<defs><marker id="ah" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path class="art-ink-fill" d="M0 0 L10 5 L0 10 z"/></marker></defs>`;

const GAME_ART = {
  'bauble-pong': () => {
    const tri = (cx, dir) => [[0, 0], [1, -1], [1, 1], [2, -2], [2, 0], [2, 2]]
      .map(([c, r]) => `<circle class="art-holly" cx="${cx + dir * c * 13}" cy="${60 + r * 8}" r="7"/>`).join('');
    return `${arrowHead}<rect class="art-table" x="8" y="30" width="224" height="60" rx="6"/>
      ${tri(30, 1)}${tri(210, -1)}
      <path class="art-dash" d="M70 52 Q120 -2 172 52" marker-end="url(#ah)"/>
      <circle class="art-gold" cx="120" cy="25" r="5"/>
      <text class="art-caption" x="120" y="110">land it and they drink</text>`;
  },
};

function gameArt(slug) {
  const draw = GAME_ART[slug];
  if (!draw) return null;
  const wrap = document.createElement('div');
  wrap.className = 'game-art';
  wrap.innerHTML = `<svg viewBox="0 0 240 120" role="img" aria-hidden="true">${draw()}</svg>`;
  return wrap;
}

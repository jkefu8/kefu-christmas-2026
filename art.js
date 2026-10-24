// "How to play" illustrations for the built-in games, keyed by games.slug.
// Static markup only (no user text), coloured through the .art-* classes in style.css.

const cup = (x, y, cls = 'art-holly') => `<path class="${cls}" d="M${x - 9} ${y - 11} h18 l-3 22 h-12 z"/>`;
const flipped = (x, y) => `<path class="art-gold" d="M${x - 6} ${y - 11} h12 l3 22 h-18 z"/>`;
const head = (x, y, cls = 'art-pine') => `<circle class="${cls}" cx="${x}" cy="${y}" r="9"/><path class="${cls}" d="M${x - 13} ${y + 24} q13 -22 26 0 z"/>`;
const arrowHead = `<defs><marker id="ah" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path class="art-ink-fill" d="M0 0 L10 5 L0 10 z"/></marker></defs>`;

const GAME_ART = {
  'twelve-drinks': () => {
    const items = ['1', '2', '3', '4', '5'];
    const nodes = items.map((n, i) => {
      const x = 28 + i * 40;
      return `${i ? `<line class="art-line" x1="${x - 26}" y1="60" x2="${x - 14}" y2="60"/>` : ''}
        <circle class="art-pine" cx="${x}" cy="60" r="14"/>
        <text class="art-label-inv" x="${x}" y="65">${n}</text>`;
    }).join('');
    return `${nodes}<text class="art-label" x="222" y="65">…12</text>
      <text class="art-caption" x="120" y="102">repeat the chain, add one more</text>`;
  },

  'bauble-pong': () => {
    const tri = (cx, dir) => [[0, 0], [1, -1], [1, 1], [2, -2], [2, 0], [2, 2]]
      .map(([c, r]) => `<circle class="art-holly" cx="${cx + dir * c * 13}" cy="${60 + r * 8}" r="7"/>`).join('');
    return `${arrowHead}<rect class="art-table" x="8" y="30" width="224" height="60" rx="6"/>
      ${tri(30, 1)}${tri(210, -1)}
      <path class="art-dash" d="M70 52 Q120 -2 172 52" marker-end="url(#ah)"/>
      <circle class="art-gold" cx="120" cy="25" r="5"/>
      <text class="art-caption" x="120" y="110">land it and they drink</text>`;
  },

  'ring-of-fire': () => {
    const cards = Array.from({ length: 12 }, (_, i) => {
      const a = (i / 12) * Math.PI * 2;
      const x = 120 + Math.cos(a) * 42, y = 58 + Math.sin(a) * 42;
      return `<rect class="${i === 3 ? 'art-gold' : 'art-card'}" x="${x - 6}" y="${y - 9}" width="12" height="18" rx="2"
        transform="rotate(${(a * 180) / Math.PI + 90} ${x} ${y})"/>`;
    }).join('');
    return `${cards}${cup(120, 58)}<text class="art-caption" x="120" y="114">4th King drinks the centre cup</text>`;
  },

  'flip-cup': () => {
    const row = (y, cls) => [0, 1, 2, 3].map(i => cup(60 + i * 40, y, cls)).join('');
    return `${arrowHead}<rect class="art-table" x="30" y="44" width="180" height="32" rx="5"/>
      ${flipped(60, 26)}${[1, 2, 3].map(i => cup(60 + i * 40, 26)).join('')}
      ${row(94, 'art-pine')}
      <path class="art-dash" d="M74 20 q16 -14 24 0" marker-end="url(#ah)"/>
      <text class="art-label" x="18" y="31">A</text><text class="art-label" x="18" y="99">B</text>`;
  },

  movie: () => `
    <rect class="art-ink-fill" x="44" y="14" width="120" height="76" rx="6"/>
    <rect class="art-screen" x="51" y="21" width="106" height="62" rx="3"/>
    <path class="art-line" d="M90 90 l-10 14 M118 90 l10 14"/>
    <path class="art-gold" d="M150 6 h76 a6 6 0 0 1 6 6 v24 a6 6 0 0 1 -6 6 h-52 l-12 10 v-10 h-12 a6 6 0 0 1 -6 -6 v-24 a6 6 0 0 1 6 -6 z"/>
    <text class="art-label" x="190" y="29">Keviiin!</text>
    ${cup(200, 92)}<text class="art-caption" x="104" y="56">▶</text>`,

  never: () => {
    const fingers = [0, 1, 2, 3, 4].map(i => {
      const down = i < 2;
      const h = down ? 18 : 40 - Math.abs(2 - i) * 4;
      return `<rect class="${down ? 'art-card' : 'art-pine'}" x="${74 + i * 19}" y="${62 - h}" width="14" height="${h + 6}" rx="7"/>`;
    }).join('');
    return `${fingers}<rect class="art-pine" x="72" y="60" width="96" height="40" rx="14"/>
      <text class="art-caption" x="120" y="116">done it? finger down, drink</text>`;
  },

  'santa-says': () => `
    <path class="art-holly" d="M40 78 L78 18 L104 78 z"/>
    <circle class="art-card" cx="78" cy="16" r="9"/>
    <rect class="art-card" x="32" y="74" width="80" height="16" rx="8"/>
    <path class="art-gold" d="M128 26 h92 a8 8 0 0 1 8 8 v28 a8 8 0 0 1 -8 8 h-62 l-14 12 v-12 h-16 a8 8 0 0 1 -8 -8 v-28 a8 8 0 0 1 8 -8 z"/>
    <text class="art-label" x="174" y="53">Santa says…</text>
    <text class="art-caption" x="120" y="112">no "Santa says"? don't move</text>`,

  'most-likely': () => {
    const ring = [0, 1, 2, 3, 4].map(i => {
      const a = -Math.PI / 2 + (i / 5) * Math.PI * 2 + 0.6;
      const x = 120 + Math.cos(a) * 82, y = 54 + Math.sin(a) * 40;
      const tx = 120 + Math.cos(a) * 26, ty = 54 + Math.sin(a) * 18;
      return `<circle class="art-pine" cx="${x}" cy="${y}" r="9"/>
        <line class="art-line" x1="${x - Math.cos(a) * 12}" y1="${y - Math.sin(a) * 12}" x2="${tx}" y2="${ty}" marker-end="url(#ah)"/>`;
    }).join('');
    return `${arrowHead}${ring}<circle class="art-holly" cx="120" cy="54" r="13"/>
      <text class="art-caption" x="120" y="114">most fingers on you? drink</text>`;
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

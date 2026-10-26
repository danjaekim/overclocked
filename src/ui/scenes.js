// Title and results illustrations: the locked art (sprites.js) composed with plain HTML and CSS.
// Each scene is an in-flow block, so it never collides with the menu text. Sizes are percentages of
// the block, so it scales with the screen. Styles live in index.html (.scene, .tscene, .rscene).

import { spriteUrl } from '../render/sprites.js';

const img = (id, style, cls = '') => `<img class="${cls}" src="${spriteUrl(id)}" alt="" draggable="false" style="${style}">`;
const HEROES = ['smith', 'archer', 'mage', 'berserker', 'summoner', 'saint'];

// Embers drift up from the anvil. Deterministic positions, CSS animation only.
function embers(n) {
  let s = '';
  for (let i = 0; i < n; i++) {
    s += `<i class="ember" style="left:${(i * 37 + 11) % 90 + 5}%;bottom:${(i * 23 + 30) % 40 + 25}%;animation-delay:${-(i * 0.7).toFixed(1)}s;animation-duration:${3 + (i % 4)}s"></i>`;
  }
  return s;
}

// Title: the anvil aflame with the six heroes lined up beneath it.
export function titleSceneHtml() {
  const row = HEROES.map((h, i) => img(h, `left:${1 + i * 16.4}%`, 'hero')).join('');
  return `<div class="scene tscene"><div class="glow"></div>${embers(10)}${img('shrine', '', 'anvil')}${row}</div>`;
}

// Results: the anvil blazing with the hero beside it and gems around (win), or cold and grey with
// the hero sitting by it (lose).
export function resultsSceneHtml(classId, won) {
  const gems = won
    ? img('gem3', 'left:76%;top:6%;width:17%', 'gem') + img('gem2', 'left:8%;top:12%;width:15%', 'gem') +
      img('ore_starsteel', 'left:84%;top:46%;width:14%', 'gem') + img('gem1', 'left:66%;top:52%;width:13%', 'gem') +
      img('gem3', 'left:30%;top:0%;width:14%', 'gem')
    : '';
  const hero = img(classId, won ? 'left:6%;bottom:2%;width:38%' : 'left:62%;bottom:4%;width:34%', 'rhero');
  return `<div class="scene rscene ${won ? 'win' : 'lose'}">${won ? '<div class="glow"></div>' + embers(8) : ''}` +
    `${img('shrine', won ? 'left:34%;bottom:0;width:58%' : 'left:14%;bottom:2%;width:56%', 'anvil')}${hero}${gems}</div>`;
}

// Pilot sprite sheet (docs/plan-v12-pilots.md, M3). The pilot sprites live in src/render/neon-art.js (approved by Dan on
// 2026-11-04); this renders them large and at game size beside 1, 2 and 3 chain nodes drawn with the game's own orbit,
// radius and spacing, to check a new or changed hull clears the nodes the same as the others.
//   node tools/art/pilots-concept.mjs --sheet out.html

import fs from 'node:fs';
import { PALETTE as P } from '../../src/data/palette.js';
import { NEON_ART, PILOT_SPRITES, PILOT_NODE_ORBIT as NODE_ORBIT } from '../../src/render/neon-art.js';

export const PILOT_ART = Object.fromEntries(PILOT_SPRITES.map((id) => [id, NEON_ART[id]]));

const i = process.argv.indexOf('--sheet');
if (i >= 0) {
  // Each pilot large, then in-game: the sprite at its real 68-unit size with 1, 2 and 3 chain nodes drawn the way
  // render/renderer.js drawChainNodes draws them (same orbit, radius, glow and spacing), at twice game scale.
  const names = { rookie: 'Rookie', courier: 'Courier', bulwark: 'Bulwark', splicer: 'Splicer', broker: 'Broker', overclocker: 'Overclocker', tinker: 'Tinker' };
  const uri = (s) => `data:image/svg+xml;utf8,${encodeURIComponent(s)}`;
  const cells = Object.entries(PILOT_ART).map(([id, s]) => `<div class="c"><img class="big" src="${uri(s)}"><div class="row">${[1, 2, 3].map((n) => `<canvas data-id="${id}" data-n="${n}" width="160" height="160"></canvas>`).join('')}</div><b>${names[id]}</b></div>`).join('');
  fs.writeFileSync(process.argv[i + 1], `<!doctype html><meta charset="utf-8"><style>
body{margin:0;background:${P.bg};font:600 15px system-ui;color:#cfd8ff;padding:24px;width:1010px}
.grid{display:grid;grid-template-columns:repeat(4,1fr);gap:18px}
.c{background:${P.floor};border:1px solid rgba(138,92,255,.25);border-radius:10px;padding:14px;text-align:center}
.big{width:180px;height:180px}.row{display:flex;justify-content:center;gap:0}canvas{width:70px;height:70px}
b{display:block;margin-top:6px;font-size:18px}h1{font-size:20px;margin:0 0 4px}p{margin:0 0 16px;color:#8f97c0}
</style><h1>Pilot sprites (src/render/neon-art.js)</h1><p>Large, then at game size with 1, 2 and 3 chains, nodes drawn with the game's own spacing. Every hull now fits the same ring, so the nodes clear each one equally.</p><div class="grid">${cells}</div>
<script>
const ART = ${JSON.stringify(Object.fromEntries(Object.entries(PILOT_ART).map(([k, v]) => [k, uri(v)])))};
const COLORS = ${JSON.stringify(['#5ee7ff', P.pink, P.lime, P.amber])};
const ORBIT = ${NODE_ORBIT}, R = 3.6, W = 68, S = 160 / 80;   // canvas px per world unit (80 units across)
Promise.all([...document.querySelectorAll('canvas')].map(async (cv) => {
  const img = new Image(); img.src = ART[cv.dataset.id]; await img.decode();
  const x = cv.getContext('2d'); x.scale(S, S); x.translate(40, 40);
  x.drawImage(img, -W / 2, -W / 2 - 1.8, W, W);
  const n = +cv.dataset.n, t = 0.4;
  for (let k = 0; k < n; k++) {
    const a = t * 1.6 + (k * Math.PI * 2) / n, px = Math.cos(a) * ORBIT, py = Math.sin(a) * ORBIT;
    x.fillStyle = COLORS[k]; x.globalAlpha = 0.28; x.beginPath(); x.arc(px, py, R * 2.1, 0, 7); x.fill();
    x.globalAlpha = 1; x.beginPath(); x.arc(px, py, R, 0, 7); x.fill();
  }
})).then(() => { document.body.dataset.ready = 1; });
</script>`);
}

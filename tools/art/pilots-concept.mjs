// Pilot sprite concepts (docs/plan-v12-pilots.md, M3). Same 76x76 viewBox, helpers and rules as src/render/neon-art.js:
// cyan (`rig`) only, since cyan is the player's colour, a dark body, and every pilot keeps the glowing core in the centre
// so it still reads as "you". The pilots differ by the hull around the core. M3 copies the chosen ones into neon-art.js.
//   node tools/art/pilots-concept.mjs --sheet out.html   writes a sheet with each pilot large and at game size

import fs from 'node:fs';
import { PALETTE as P } from '../../src/data/palette.js';

const BODY = '#17141f';
const HEAD = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="-6 -6 76 76"><defs><filter id="g" x="-40%" y="-40%" width="180%" height="180%"><feGaussianBlur stdDeviation="2.6"/></filter></defs>';
const shadow = (rx = 16) => `<ellipse cx="32" cy="60" rx="${rx}" ry="3.2" fill="#000" opacity=".45"/>`;
// Every hull fits inside HULL_MAX world units of the core (at the game's 68-unit sprite size), so the chain nodes, which
// orbit at NODE_ORBIT for every pilot, always clear it by the same margin. `k` scales a hull down to fit (measured with
// tools/art/pilots-concept.mjs --measure).
export const HULL_MAX = 20, NODE_ORBIT = 28;
const art = (inner, rx, k = 1, top = '') => `${HEAD}${shadow(rx * k)}${k === 1 ? inner : `<g transform="translate(32 34) scale(${k}) translate(-32 -34)">${inner}</g>`}${top}</svg>`;   // `top`: drawn unscaled (the core, the same size on every pilot)
const glow = (s) => `<g filter="url(#g)" opacity=".9">${s}</g>${s}`;
const line = (c, w = 3) => `fill="none" stroke="${c}" stroke-width="${w}" stroke-linejoin="round" stroke-linecap="round"`;
const C = P.rig;
const rad = (d) => d * Math.PI / 180;
const pt = (r, d, cx = 32, cy = 34) => [cx + Math.cos(rad(d)) * r, cy + Math.sin(rad(d)) * r].map((v) => v.toFixed(1)).join(',');
const core = (r = 6) => glow(`<circle cx="32" cy="34" r="${r}" fill="${C}"/>`) + `<circle cx="32" cy="34" r="${r * 0.66}" fill="${P.rigHot}"/>`;
const shell = (r, w = 3) => glow(`<circle cx="32" cy="34" r="${r}" ${line(C, w)}/>`) + `<circle cx="32" cy="34" r="${r}" fill="${BODY}" stroke="${C}" stroke-width="${w}"/>`;

// Rookie (Standard): today's Runner, unchanged.
const rookie = art(shell(17) +
  `<circle cx="32" cy="34" r="11" fill="none" stroke="${C}" stroke-width="1.2" opacity=".5" stroke-dasharray="3 3"/>` + core(), 16);

// Courier: three swept blades round a small shell, a pinwheel that reads as spin and speed.
const blade = (d) => `<path d="M${pt(12, d)} Q${pt(26, d + 10)} ${pt(27, d + 52)} Q${pt(19, d + 40)} ${pt(12, d + 40)} Z" fill="${BODY}" stroke="${C}" stroke-width="2.4" stroke-linejoin="round"/>`;
const courier = art(glow([0, 120, 240].map((d) => blade(d - 90)).join('')) + shell(12, 2.6) , 15, 0.791, core());

// Bulwark: a thick double hull with four heavy armour plates, wider and squatter than the rest.
const plate = (d) => `<path d="M${pt(20, d - 30)} A20 20 0 0 1 ${pt(20, d + 30)} L${pt(27, d + 24)} A27 27 0 0 0 ${pt(27, d - 24)} Z" fill="${BODY}" stroke="${C}" stroke-width="2.6" stroke-linejoin="round"/>`;
const bulwark = art(glow([45, 135, 225, 315].map(plate).join('')) + shell(17, 4) +
  `<circle cx="32" cy="34" r="12" fill="none" stroke="${C}" stroke-width="2" opacity=".6"/>` , 22, 0.787, core());

// Splicer: the core threaded on a long chain: two linked side loops (an infinity shape) with a bead in each.
const splicer = art(
  glow(`<path d="M32 34 C40 20 58 22 58 34 C58 46 40 48 32 34 C24 20 6 22 6 34 C6 46 24 48 32 34 Z" ${line(C, 3)}/>`) +
  `<circle cx="50" cy="34" r="3.2" fill="${C}"/><circle cx="14" cy="34" r="3.2" fill="${C}"/>` +
  shell(11, 2.8) , 22, 0.813, core());

// Broker: a roulette wheel: a shell with eight pockets round the rim and a ticking marker on top.
const broker = art(shell(19, 3) +
  Array.from({ length: 8 }, (_, i) => `<path d="M${pt(13, i * 45)} L${pt(19, i * 45)}" ${line(C, 2)} opacity=".7"/>`).join('') +
  `<circle cx="32" cy="34" r="13" fill="none" stroke="${C}" stroke-width="1.4" opacity=".6"/>` +
  glow(`<path d="M27 9 L37 9 L32 16 Z" fill="${C}"/>`) , 17, 0.877, core());

// Overclocker: a shell with four heat vents and a big white-hot core, as if running past its limit.
const overclocker = art(
  glow([0, 90, 180, 270].map((d) => `<path d="M${pt(20, d + 45)} L${pt(28, d + 45)}" ${line(C, 4.2)}/>`).join('')) +
  shell(16, 3) + glow(`<circle cx="32" cy="34" r="9" fill="${C}"/>`) + `<circle cx="32" cy="34" r="6.5" fill="${P.rigHot}"/>`, 17, 0.741);

// Tinker (Standard pilot): a gear round the core, the hand-built frame.
const gear = (() => {
  const n = 10, ro = 22, ri = 17;
  const pts = [];
  for (let i = 0; i < n; i++) {
    const a = (i * 360) / n;
    pts.push(pt(ri, a - 13), pt(ro, a - 8), pt(ro, a + 8), pt(ri, a + 13));
  }
  return `<polygon points="${pts.join(' ')}" fill="${BODY}" stroke="${C}" stroke-width="2.6" stroke-linejoin="round"/>`;
})();
const tinker = art(glow(gear) + `<circle cx="32" cy="34" r="11" fill="none" stroke="${C}" stroke-width="1.6" opacity=".7"/>` , 18, 0.957, core());

export const PILOT_ART = { rookie, courier, bulwark, splicer, broker, overclocker, tinker };

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
</style><h1>Pilot sprites, pass 2</h1><p>Large, then at game size with 1, 2 and 3 chains, nodes drawn with the game's own spacing. Every hull now fits the same ring, so the nodes clear each one equally.</p><div class="grid">${cells}</div>
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

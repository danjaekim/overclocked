// Neon Noir sprites (docs/plan-v10-neon.md, M2): hand-written SVG on the same 76x76 viewBox (a 64-unit design grid) as the
// old woodcut art. sprites.js merges this last, so each id here replaces the old sprite; the old files stay in the repo
// as the way back. Every sprite is a dark body with one bright accent colour, one bold silhouette per type, and glow baked
// in with a blur filter (sprites are rasterized once, so glow costs nothing per frame). Cyan is the player's colour and no
// enemy uses it. Colours come from data/palette.js.

import { PALETTE as P } from '../data/palette.js';

const BODY = '#17141f';                // the dark body fill
const DEEP = '#0d0b16';                // darker detail on a body
const HEAD = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="-6 -6 76 76"><defs><filter id="g" x="-40%" y="-40%" width="180%" height="180%"><feGaussianBlur stdDeviation="2.6"/></filter></defs>';
const shadow = (rx = 16) => `<ellipse cx="32" cy="60" rx="${rx}" ry="3.2" fill="#000" opacity=".45"/>`;
const art = (inner, rx) => `${HEAD}${shadow(rx)}${inner}</svg>`;
const glow = (s) => `<g filter="url(#g)" opacity=".9">${s}</g>${s}`;       // a blurred copy underneath, then the sharp shape
const line = (c, w = 3) => `fill="none" stroke="${c}" stroke-width="${w}" stroke-linejoin="round" stroke-linecap="round"`;
// v0.10.6: bodies are filled with a dark shade of their accent, so enemies read as solid objects and the player's
// attacks (light: strokes and streaks, never filled shapes) read as something else.
const mix = (c, k) => '#' + [1, 3, 5].map((i) => Math.round(parseInt(c.slice(i, i + 2), 16) * k + parseInt(BODY.slice(i, i + 2), 16) * (1 - k)).toString(16).padStart(2, '0')).join('');
const body = (c, w = 2.6) => `fill="${mix(c, 0.32)}" stroke="${c}" stroke-width="${w}" stroke-linejoin="round"`;
const poly = (pts) => pts.map((p) => p.join(',')).join(' ');
const hex = (cx, cy, r, rot = -90) => poly(Array.from({ length: 6 }, (_, i) => [cx + Math.cos((rot + i * 60) * Math.PI / 180) * r, cy + Math.sin((rot + i * 60) * Math.PI / 180) * r]));

// The player (v0.10.5): a round core drone with no front, so it never has to face anything. The renderer draws one small
// node orbiting it per chain, in that chain's colour (render/renderer.js drawChainNodes). Every class id maps to it.
const RUNNER = art(
  glow(`<circle cx="32" cy="34" r="17" ${line(P.rig, 3)}/>`) +
  `<circle cx="32" cy="34" r="17" fill="${BODY}" stroke="${P.rig}" stroke-width="3"/>` +
  `<circle cx="32" cy="34" r="11" fill="none" stroke="${P.rig}" stroke-width="1.2" opacity=".5" stroke-dasharray="3 3"/>` +
  glow(`<circle cx="32" cy="34" r="6" fill="${P.rig}"/>`) +
  `<circle cx="32" cy="34" r="4" fill="${P.rigHot}"/>`, 16);

// Enemies. One silhouette and one accent each (the table in docs/plan-v10-neon.md).
const goblin = art(                                                    // Street Drone: a small hexagon with one eye
  `<polygon points="${hex(32, 34, 21)}" ${body(P.pink)}/>` +
  `<polygon points="${hex(32, 34, 12)}" fill="${DEEP}"/>` +
  glow(`<circle cx="32" cy="34" r="6" fill="${P.pink}"/>`) + `<circle cx="31" cy="33" r="2" fill="#fff"/>` +
  `<path d="M24 56 L24 50 M40 56 L40 50" ${line(P.pink, 2)}/>`, 15);

const brute = art(                                                     // Bruiser: a big square body with cut corners and a visor
  `<path d="M16 14 H48 L56 22 V50 L48 56 H16 L8 50 V22 Z" ${body(P.orange, 3)}/>` +
  `<rect x="4" y="24" width="8" height="22" rx="2" fill="${DEEP}" stroke="${P.orange}" stroke-width="2"/><rect x="52" y="24" width="8" height="22" rx="2" fill="${DEEP}" stroke="${P.orange}" stroke-width="2"/>` +
  glow(`<rect x="16" y="27" width="32" height="8" rx="2" fill="${P.orange}"/>`) + `<rect x="19" y="29" width="26" height="2.5" fill="#fff" opacity=".8"/>` +
  `<path d="M18 46 H46" ${line(P.orange, 2)} opacity=".5"/>`, 22);

const shieldbearer = art(                                              // Riot Unit: a police-badge shield with a visor slit (v0.10.4)
  `<path d="M32 6 L54 14 V32 C54 46 44 54 32 60 C20 54 10 46 10 32 V14 Z" ${body(P.blue, 3.2)}/>` +
  `<path d="M32 13 L47 19 V32 C47 42 40 48 32 52 C24 48 17 42 17 32 V19 Z" fill="${DEEP}"/>` +
  glow(`<rect x="20" y="28" width="24" height="6" rx="2" fill="${P.blue}"/>`) + `<rect x="23" y="30" width="18" height="2" fill="#fff" opacity=".85"/>` +
  `<path d="M32 38 V48" ${line(P.blue, 2)} opacity=".6"/>`, 18);

const slinger = art(                                                   // Spitter: an arrowhead
  `<path d="M32 8 L52 54 L32 44 L12 54 Z" ${body(P.lime, 3)}/>` +
  glow(`<path d="M32 18 L40 40 L32 36 L24 40 Z" fill="${P.lime}"/>`) +
  `<circle cx="32" cy="30" r="2.5" fill="#fff"/>`, 14);

const splitter = art(                                                  // Swarm Pod: a circle in three segments
  [0, 120, 240].map((a) => {
    const r = (d) => (d * Math.PI) / 180, x = (d, rad) => (32 + Math.cos(r(d)) * rad).toFixed(1), y = (d, rad) => (34 + Math.sin(r(d)) * rad).toFixed(1);
    return `<path d="M${x(a + 62, 4)} ${y(a + 62, 4)} L${x(a + 62, 22)} ${y(a + 62, 22)} A22 22 0 0 1 ${x(a + 178, 22)} ${y(a + 178, 22)} L${x(a + 178, 4)} ${y(a + 178, 4)} Z" ${body(P.red, 2.4)}/>`;
  }).join('') +
  glow(`<circle cx="32" cy="34" r="5" fill="${P.red}"/>`) + `<circle cx="32" cy="34" r="1.8" fill="#fff"/>`, 18);

const shaman = art(                                                    // Hacker: a diamond with two antennae
  `<path d="M24 20 L18 6 M40 20 L46 6" ${line(P.violet, 2.2)}/>` +
  glow(`<circle cx="18" cy="6" r="2.6" fill="${P.violet}"/><circle cx="46" cy="6" r="2.6" fill="${P.violet}"/>`) +
  `<path d="M32 14 L52 36 L32 58 L12 36 Z" ${body(P.violet, 3)}/>` +
  glow(`<path d="M32 28 L40 36 L32 44 L24 36 Z" fill="${P.violet}"/>`) + `<circle cx="32" cy="36" r="2.4" fill="#fff"/>`, 16);

const crusher = art(                                                   // Wrecker: a spiked wrecking ball with a white stripe (v0.10.4)
  `<polygon points="52.6,37.8 58.8,45.1 49.3,45.9" fill="${BODY}" stroke="${P.orange}" stroke-width="2.4" stroke-linejoin="round"/><polygon points="43.9,51.3 43.1,60.8 35.8,54.6" fill="${BODY}" stroke="${P.orange}" stroke-width="2.4" stroke-linejoin="round"/><polygon points="28.2,54.6 20.9,60.8 20.1,51.3" fill="${BODY}" stroke="${P.orange}" stroke-width="2.4" stroke-linejoin="round"/><polygon points="14.7,45.9 5.2,45.1 11.4,37.8" fill="${BODY}" stroke="${P.orange}" stroke-width="2.4" stroke-linejoin="round"/><polygon points="11.4,30.2 5.2,22.9 14.7,22.1" fill="${BODY}" stroke="${P.orange}" stroke-width="2.4" stroke-linejoin="round"/><polygon points="20.1,16.7 20.9,7.2 28.2,13.4" fill="${BODY}" stroke="${P.orange}" stroke-width="2.4" stroke-linejoin="round"/><polygon points="35.8,13.4 43.1,7.2 43.9,16.7" fill="${BODY}" stroke="${P.orange}" stroke-width="2.4" stroke-linejoin="round"/><polygon points="49.3,22.1 58.8,22.9 52.6,30.2" fill="${BODY}" stroke="${P.orange}" stroke-width="2.4" stroke-linejoin="round"/>` +
  `<circle cx="32" cy="34" r="22" ${body(P.orange, 3.2)}/>` +
  `<circle cx="32" cy="34" r="14" fill="${DEEP}"/>` +
  glow(`<rect x="14" y="31" width="36" height="6" rx="2" fill="${P.orange}"/>`) + `<rect x="16" y="33" width="32" height="2" fill="#fff" opacity=".9"/>`, 22);

const warlord = art(                                                   // Enforcer (boss): a walker with a hull, arms and a red visor
  `<rect x="10" y="48" width="14" height="12" rx="2" ${body(P.pink, 2.4)}/><rect x="40" y="48" width="14" height="12" rx="2" ${body(P.pink, 2.4)}/>` +
  `<rect x="0" y="16" width="12" height="30" rx="3" ${body(P.pink, 2.6)}/><rect x="52" y="16" width="12" height="30" rx="3" ${body(P.pink, 2.6)}/>` +
  `<path d="M14 8 H50 L56 16 V50 H8 V16 Z" ${body(P.pink, 3.4)}/>` +
  `<path d="M14 8 L10 0 M50 8 L54 0" ${line(P.pink, 3)}/>` +
  glow(`<rect x="14" y="20" width="36" height="10" rx="2" fill="${P.pink}"/>`) + `<rect x="18" y="23" width="28" height="3.4" fill="#fff"/>` +
  `<path d="M20 40 H44 M20 45 H44" ${line(P.pink, 2)} opacity=".6"/>`, 28);

const seer = art(                                                      // Oracle (boss): a floating ring with an eye, and orbiting dots
  glow(`<circle cx="32" cy="33" r="24" ${line(P.violet, 3.4)}/>`) +
  `<circle cx="32" cy="33" r="19" fill="${BODY}" opacity=".9"/>` +
  [0, 90, 180, 270].map((a) => { const t = (a + 45) * Math.PI / 180; return glow(`<circle cx="${(32 + Math.cos(t) * 24).toFixed(1)}" cy="${(33 + Math.sin(t) * 24).toFixed(1)}" r="3.2" fill="${P.violet}"/>`); }).join('') +
  `<ellipse cx="32" cy="33" rx="15" ry="9" fill="#fff"/>` +
  glow(`<circle cx="32" cy="33" r="6.5" fill="${P.violet}"/>`) + `<circle cx="32" cy="33" r="2.6" fill="${DEEP}"/>`, 24);

const crate = art(                                                     // Cargo Drop: a crate with gold hazard corners
  `<rect x="10" y="16" width="44" height="38" rx="3" ${body(P.gold, 3)}/>` +
  `<path d="M10 16 L22 16 L10 28 Z M54 16 L42 16 L54 28 Z M10 54 L22 54 L10 42 Z M54 54 L42 54 L54 42 Z" fill="${P.gold}"/>` +
  glow(`<path d="M32 28 V42 M25 35 H39" ${line(P.gold, 3.4)}/>`), 22);

// Loot and props.
// Pickups (v0.10.6): small, solid and flat (no glow), so they sit under the fight instead of competing with it. XP is a
// diamond; credits are a round coin, a shape no enemy uses.
const shard = (c, pts) => art(`<polygon points="${poly(pts)}" fill="${c}" stroke="${mix(c, 0.45)}" stroke-width="2" stroke-linejoin="round"/>` +
  `<path d="M32 22 L36 34 L32 46" fill="none" stroke="#fff" stroke-width="1.6" opacity=".55"/>`, 6);
const SHARD_SLIM = [[32, 18], [40, 34], [32, 50], [24, 34]];
const chip = (c, r) => art(`<circle cx="32" cy="34" r="${r}" fill="${c}" stroke="${mix(c, 0.5)}" stroke-width="2.4"/>` +
  `<circle cx="32" cy="34" r="${r * 0.58}" fill="none" stroke="${mix(c, 0.45)}" stroke-width="2"/>`, r * 0.7);
const caseArt = (w, h, strap, k) => art(
  `<rect x="${32 - w / 2}" y="${48 - h}" width="${w}" height="${h}" rx="3" ${body(P.gold, 3)}/>` +
  `<path d="M${32 - w / 2} ${48 - h * 0.55} H${32 + w / 2}" ${line(P.gold, 2)} opacity=".7"/>` +
  glow(`<rect x="28" y="${48 - h * 0.55 - 4}" width="8" height="9" rx="1.5" fill="${P.gold}"/>`) +
  (strap ? `<path d="M${32 - w * 0.28} ${48 - h} V48 M${32 + w * 0.28} ${48 - h} V48" ${line(P.gold, 2.4)} opacity=".8"/>` : '') +
  (k ? glow(`<path d="M${32 - w / 2} ${48 - h} L${32 - w / 2 + 8} ${48 - h - 6} H${32 + w / 2 - 8} L${32 + w / 2} ${48 - h}" ${line(P.gold, 2.6)}/>`) : ''), w * 0.5);
const terminal = art(                                                  // Terminal: the black-market workbench console
  `<path d="M14 58 H50 L46 46 H18 Z" ${body(P.gold, 2.6)}/>` +
  `<rect x="12" y="8" width="40" height="38" rx="4" ${body(P.gold, 3.2)}/>` +
  glow(`<rect x="18" y="14" width="28" height="24" rx="2" fill="${P.gold}" opacity=".9"/>`) +
  `<path d="M20 20 H44 M20 26 H38 M20 32 H42" ${line(DEEP, 2)}/>` +
  `<circle cx="22" cy="42" r="1.8" fill="${P.gold}"/><circle cx="30" cy="42" r="1.8" fill="${P.gold}"/>`, 22);

// Elites keep their own enemy's behaviour but wear one body per affix: a white-ringed hexagon with the affix's glyph.
const elite = (c, glyph) => art(
  `<polygon points="${hex(32, 34, 24)}" fill="${BODY}" stroke="#ffffff" stroke-width="3.4" stroke-linejoin="round"/>` +
  `<polygon points="${hex(32, 34, 19)}" fill="${DEEP}" stroke="${c}" stroke-width="1.6" stroke-linejoin="round"/>` + glow(glyph), 18);

export const NEON_ART = {
  smith: RUNNER, archer: RUNNER, mage: RUNNER, berserker: RUNNER, summoner: RUNNER, saint: RUNNER,
  goblin, brute, shieldbearer, slinger, splitter, shaman, crusher, warlord, seer, crate,
  gem0: shard(P.xp, SHARD_SLIM),
  gem1: shard('#3ff0c0', SHARD_SLIM),
  gem2: shard('#b8ffd8', SHARD_SLIM),
  gem3: shard(P.gold, SHARD_SLIM),
  ore_iron: chip(P.gold, 14),
  ore_starsteel: chip('#fff2b0', 18),
  chest: caseArt(40, 28, false, false),
  bosschest: caseArt(50, 36, true, true),
  shrine: terminal,
  elite_swift: elite('#ffe45e', `<path d="M20 26 L28 34 L20 42 M30 26 L38 34 L30 42 M40 26 L48 34 L40 42" ${line('#ffe45e', 2.6)}/>`),
  elite_armoured: elite('#aeb4c4', `<path d="M22 24 H42 V38 L32 46 L22 38 Z" fill="#aeb4c4" stroke="#fff" stroke-width="1.6" stroke-linejoin="round"/>`),
  elite_volatile: elite(P.orange, `<path d="M32 22 L44 44 H20 Z" fill="none" stroke="${P.orange}" stroke-width="3" stroke-linejoin="round"/><path d="M32 30 V37" ${line(P.orange, 3)}/><circle cx="32" cy="41" r="1.8" fill="${P.orange}"/>`),
  elite_regenerating: elite(P.xp, `<path d="M32 22 V46 M20 34 H44" ${line(P.xp, 4.4)}/>`),
  elite_warded: elite(P.violet, `<polygon points="${hex(32, 34, 11)}" fill="none" stroke="${P.violet}" stroke-width="3" stroke-linejoin="round"/>`),
};

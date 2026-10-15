// Graft payload audit: for every generic payload (data/grafts.js PAYLOADS), graft it onto one evolved
// host of every behavior and measure how much of the damage dealt in a pinned crowd the payload adds.
//   node tools/payload-audit.mjs            all payloads, summary
//   node tools/payload-audit.mjs saw,quake  just those
// Share = (damage with the payload - damage without) / damage with. A payload whose share is a few
// percent is invisible in play; the audit exists so a new payload does not ship that way.

import { createRun } from '../src/game/run.js';
import { spawnEnemy } from '../src/game/director.js';
import { addWeapon } from '../src/game/weapons.js';
import { WEAPONS } from '../src/data/weapons.js';
import { PAYLOADS } from '../src/data/grafts.js';

const STEP = 1 / 60;
const SECONDS = 20;
const only = process.argv[2] ? process.argv[2].split(',') : Object.keys(PAYLOADS);

const hosts = {};
for (const [id, d] of Object.entries(WEAPONS)) {
  if (d.rarity === 'evolved' && !d.base.ownChain && !hosts[d.behavior]) hosts[d.behavior] = id;
}

function measure(hostId, payload) {
  const run = createRun({ seed: 5, view: { w: 480, h: 1040 }, debug: { god: true }, classId: 'smith' });
  run.player.weapons.length = 0;
  run.director.update = () => {};
  const h = addWeapon(run, hostId);
  if (payload) h.graft = { id: 'echo', name: 'audit', desc: '', donorId: 'x', tags: [], triggers: [], payload, elements: [], light: false, hooks: {} };
  const homes = [];
  for (let k = 0; k < 16; k++) {
    const a = k * 0.9;
    const r = 40 + k * 12;
    const e = spawnEnemy(run, 'goblin', Math.cos(a) * r, Math.sin(a) * r);
    e.speed = 0; e.hp = e.maxHp = 1e9;
    homes.push([e, e.x, e.y]);
  }
  let shots = 0;
  const acq = run.world.projectiles.acquire;
  run.world.projectiles.acquire = () => { const o = acq(); if (o) shots++; return o; };
  const hz0 = { n: 0 };
  for (let i = 0; i < SECONDS * 60; i++) {
    const before = run.hazards.length;
    run.update(STEP, { x: 0, y: 0 });
    for (const [e, x, y] of homes) { e.x = x; e.y = y; e.kx = e.ky = 0; }      // knockback would scatter the crowd
    if (run.hazards.length > before) hz0.n += run.hazards.length - before;
  }
  return { dmg: run.stats.total, shots, hazards: hz0.n };
}

const rows = [];
for (const p of only) {
  const shares = [];
  let shots = 0;
  let hz = 0;
  for (const [beh, hid] of Object.entries(hosts)) {
    const base = measure(hid, null);
    const withP = measure(hid, p);
    shares.push(withP.dmg > 0 ? (withP.dmg - base.dmg) / withP.dmg : 0);
    shots += withP.shots - base.shots;
    hz += withP.hazards - base.hazards;
  }
  const mean = shares.reduce((a, b) => a + b, 0) / shares.length;
  const sorted = [...shares].sort((a, b) => a - b);
  rows.push({ payload: p, frac: PAYLOADS[p].frac, mean, median: sorted[sorted.length >> 1], shots, hazards: hz });
}
rows.sort((a, b) => a.mean - b.mean);
console.log('payload      frac   mean share  median   extra shots  extra hazards');
for (const r of rows) {
  console.log(`${r.payload.padEnd(12)} ${r.frac.toFixed(2)}   ${(r.mean * 100).toFixed(1).padStart(6)}%   ${(r.median * 100).toFixed(1).padStart(6)}%   ${String(r.shots).padStart(9)}   ${String(r.hazards).padStart(9)}`);
}

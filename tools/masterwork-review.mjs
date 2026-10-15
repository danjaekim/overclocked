// Masterwork review (M33b): each masterwork vs its host alone, both weapons kept, and the generic payload graft.
// Two scenes: a pinned ring of 24 dummies (dps; inflated for freeze-shatter effects) and a 30 s walking horde
// (kills). Usage: node tools/masterwork-review.mjs [id,id,...]
import { createRun } from '../src/game/run.js';
import { spawnEnemy } from '../src/game/director.js';
import { addWeapon, levelUpWeapon, canLevelUp } from '../src/game/weapons.js';
import { graft } from '../src/game/graft.js';
import { MASTERWORKS } from '../src/data/grafts.js';
import { WEAPONS } from '../src/data/weapons.js';

const STEP = 1 / 60;
const VIEW = { w: 480, h: 1040 };
function setup(hostId, donorId, mode) {
  const run = createRun({ seed: 3, view: VIEW, debug: { god: true }, classId: 'archer' });
  run.player.stats.removeBySource(`weapon:${run.player.weapons[0].instanceId}:`);
  run.player.weapons.length = 0;
  run.director.update = () => {};
  run.starsteel = 3;
  const host = addWeapon(run, hostId);
  while (host.level < 6 && canLevelUp(host)) levelUpWeapon(run, host);
  let removed = null;
  if (mode === 'generic') { const i = MASTERWORKS.findIndex((m) => m.host === hostId && m.donor === donorId); removed = MASTERWORKS.splice(i, 1)[0]; }
  if (mode !== 'alone') { const d = addWeapon(run, donorId); while (d.level < 6 && canLevelUp(d)) levelUpWeapon(run, d); if (mode !== 'both' && !graft(run, host, d).ok) throw new Error('graft failed'); }
  if (removed) MASTERWORKS.push(removed);
  return run;
}
function ring(run) {
  const ds = [];
  for (let i = 0; i < 24; i++) { const a = (i / 24) * Math.PI * 2; const d = 90 + (i % 3) * 40; const e = spawnEnemy(run, 'goblin', Math.cos(a) * d, Math.sin(a) * d); e.hp = e.maxHp = 1e12; e.speed = 0; ds.push([e, e.x, e.y]); }
  for (let i = 0; i < 15 / STEP; i++) { run.update(STEP, { x: 0, y: 0 }); for (const [e, x, y] of ds) { e.x = x; e.y = y; e.kx = e.ky = 0; } }
  return ds.reduce((a, [e]) => a + (1e12 - e.hp), 0) / 15;
}
// A horde that walks in from all sides, enemies die (real hp, scaled), new ones spawn: kills in 30 s.
function stream(run) {
  let rnd = 99; const r = () => { rnd = (rnd * 1664525 + 1013904223) >>> 0; return rnd / 4294967296; };
  const spawn = () => { const a = r() * Math.PI * 2; const d = 260 + r() * 80; const e = spawnEnemy(run, r() < 0.15 ? 'brute' : 'goblin', run.player.x + Math.cos(a) * d, run.player.y + Math.sin(a) * d); if (e) { e.hp = e.maxHp = e.maxHp * 6; } };
  for (let i = 0; i < 40; i++) spawn();
  let ang = 0;
  for (let i = 0; i < 30 / STEP; i++) {
    ang += STEP * 0.5;
    run.update(STEP, { x: Math.cos(ang) * 0.4, y: Math.sin(ang) * 0.4 });
    while (run.world.enemies.count < 40) spawn();
  }
  return run.kills;
}
const pct = (v, b) => `${v >= b ? '+' : ''}${Math.round((v / b - 1) * 100)}%`;
const rows = [];
for (const m of MASTERWORKS.slice().filter((m) => !process.argv[2] || process.argv[2].split(',').includes(m.id))) {
  const out = { id: m.id, host: m.host, donor: m.donor };
  for (const mode of ['alone', 'both', 'generic', 'mw']) {
    out[mode] = [ring(setup(m.host, m.donor, mode)), stream(setup(m.host, m.donor, mode))];
  }
  rows.push(out);
  console.log(`${m.name.padEnd(16)} ${WEAPONS[m.host].behavior.padEnd(10)}<- ${WEAPONS[m.donor].behavior.padEnd(10)} ring: alone ${Math.round(out.alone[0])} both ${pct(out.both[0], out.alone[0])} generic ${pct(out.generic[0], out.alone[0])} MW ${pct(out.mw[0], out.alone[0])} | kills/30s: alone ${out.alone[1]} both ${out.both[1]} generic ${out.generic[1]} MW ${out.mw[1]}`);
}

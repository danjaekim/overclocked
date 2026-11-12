// Overcharge bench (docs/plan-v13-boss-rewards.md): sustained damage of a small chain on 12 pinned dummies for 10 s, plain vs each
// of its pieces overcharged, as a ratio. Target x1.5-x3 on a fed battery. `--starved`: an early battery (10, +6/s), where the doubled energy bites.
//   node tools/overchargebench.mjs [--starved]
import { createRun } from '../src/game/run.js';
import { spawnEnemy } from '../src/game/director.js';
import { installRig } from '../src/rig/rig.js';
const BAT = process.argv.includes('--starved') ? { energy: 10, recharge: 6 } : { energy: 40, recharge: 24 };   // a late rig's battery, or an early one
const dps = (slots, overcharged, chassis = {}) => {
  const run = createRun({ seed: 11, view: { w: 480, h: 1040 }, debug: { god: true }, classId: 'smith' });
  run.director.update = () => {}; run.player.weapons.length = 0;
  installRig(run, [{ rule: 'pulse', slots, ...BAT, overcharged, ...chassis }], { log: false });
  const es = []; for (let i = 0; i < 12; i++) { const e = spawnEnemy(run, 'goblin', 90 + (i % 4) * 25, (Math.floor(i / 4) - 1) * 30); e.speed = 0; e.hp = e.maxHp = 1e9; e.knock = 0; es.push(e); }
  for (let i = 0; i < 600; i++) { run.update(1 / 60, { x: 0, y: 0 }); for (const e of es) { e.x = e.x; e.vx = 0; e.vy = 0; } }
  return Math.round(es.reduce((a, e) => a + (1e9 - e.hp), 0) / 10);
};
const cases = [['blaster'], ['scatter', 'blaster'], ['heavy', 'mortar'], ['blaster', 'on_hit', 'nova'], ['scatter', 'chain_bolt'], ['nova'], ['echo', 'blaster'], ['slam'], ['sunder', 'blaster', 'on_hit', 'nova'], ['flame', 'blaster'], ['storm', 'chain_bolt']];
for (const c of cases) { const base = dps(c, []); const o = {}; for (const p of new Set(c)) o[p] = (dps(c, [p]) / base).toFixed(2); console.log(c.join(' '), base, JSON.stringify(o)); }

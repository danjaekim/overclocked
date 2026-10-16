// Diagnostic: how does a class's damage actually land in bot play? (docs/architecture.md, M43 archer work)
//   node tools/diag-class.mjs <class> [seeds] [--smart]
// Reports, over the first 5 minutes of each bot run: enemies struck per arrow of the starting weapon, the distance
// of struck enemies (what Long Shot sees), how much of the run the player is moving (Fleet), and damage by cause.
process.argv.push('--lib');
const { playBot } = await import('./bench.mjs');
import { CAUSE_NAMES } from '../src/systems/damage-queue.js';

const cls = process.argv[2] || 'archer';
const nSeeds = Number(process.argv[3]) || 6;
const END = Number(process.env.DIAG_END || 300);          // the window: the first END seconds
const out = { arrows: 0, struck: 0, distW: 0, dmgW: 0, near: 0, mid: 0, far: 0, moving: 0, ticks: 0, causes: new Array(CAUSE_NAMES.length).fill(0), crowd: 0, hitsPerTick: 0, total: 0, kills: 0, level: 0, hp: 0, taken: 0, src: new Map() };
for (let seed = 1; seed <= nSeeds; seed++) {
  const live = new Map();
  let prevHp = new Map();
  let px = 0, py = 0;
  playBot(cls, seed, (run) => {
    if (run.time > END || out._done === seed) return;
    const p = run.player;
    out.ticks++;
    if (Math.hypot(p.x - px, p.y - py) > 0.5) out.moving++;
    px = p.x; py = p.y;
    const w0 = p.weapons[0];
    // arrows: remember each live projectile of the first weapon; when it leaves, count what it struck
    const seen = new Set();
    for (const pr of run.world.projectiles.active) {
      if (pr.inst !== w0 || pr.sub) continue;
      seen.add(pr);
      live.set(pr, pr.nh);
    }
    for (const [pr, nh] of live) if (!seen.has(pr)) { out.arrows++; out.struck += nh; live.delete(pr); }
    // distance of damaged enemies, weighted by damage
    const hp = new Map();
    for (const e of run.world.enemies.active) {
      hp.set(e, e.hp);
      const before = prevHp.get(e);
      if (before !== undefined && e.hp < before) {
        const d = Math.hypot(e.x - p.x, e.y - p.y);
        const dmg = before - e.hp;
        out.distW += d * dmg; out.dmgW += dmg;
        if (d < 110) out.near += dmg; else if (d < 220) out.mid += dmg; else out.far += dmg;
      }
    }
    prevHp = hp;
    out.crowd += run.world.enemies.count;
    if (out._lastHp !== undefined && p.hp < out._lastHp) out.taken += out._lastHp - p.hp;
    out._lastHp = p.hp;
    if (run.time >= END - 0.02 || run.over) {
      out._done = seed;
      out.runs = (out.runs || 0) + 1;
      out.died = (out.died || 0) + (run.over && !run.won ? 1 : 0);
      for (let i = 0; i < CAUSE_NAMES.length; i++) out.causes[i] += run.stats.causes[i];
      out.total += run.stats.total; out.kills += run.kills; out.level += p.level; out.hp += p.hp;
      for (const r of run.stats.src.values()) out.src.set(r.name, (out.src.get(r.name) || 0) + r.dmg);
    }
  });
}
const tot = out.causes.reduce((a, b) => a + b, 0) || 1;
console.log(`${cls}: ${nSeeds} bot runs, first ${END} s (${out.died || 0} died inside it)`);
console.log(`  arrows of the first weapon: ${out.arrows}, enemies struck per arrow ${(out.struck / Math.max(1, out.arrows)).toFixed(2)}`);
console.log(`  distance of damaged enemies (dmg-weighted): ${(out.distW / out.dmgW).toFixed(0)}; share <110: ${(out.near / out.dmgW * 100).toFixed(0)}%  110-220: ${(out.mid / out.dmgW * 100).toFixed(0)}%  >220: ${(out.far / out.dmgW * 100).toFixed(0)}%`);
console.log(`  moving ${(out.moving / out.ticks * 100).toFixed(0)}% of the time; avg enemies alive ${(out.crowd / out.ticks).toFixed(0)}`);
console.log(`  by the end of the window (per run): damage ${(out.total / nSeeds / 1000).toFixed(0)}k, kills ${(out.kills / nSeeds).toFixed(0)}, level ${(out.level / nSeeds).toFixed(1)}, hp ${(out.hp / nSeeds).toFixed(0)}, hp lost (before healing) ${(out.taken / nSeeds).toFixed(0)}`);
console.log('  by source: ' + [...out.src].sort((a, b) => b[1] - a[1]).slice(0, 6).map(([n, v]) => `${n} ${(v / out.total * 100).toFixed(0)}%`).join(', '));
console.log('  damage by cause: ' + CAUSE_NAMES.map((n, i) => [n, out.causes[i] / tot]).filter(([, v]) => v > 0.005).map(([n, v]) => `${n} ${(v * 100).toFixed(0)}%`).join(', '));

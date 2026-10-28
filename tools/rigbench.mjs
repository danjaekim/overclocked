// Bot runs of the full run (game/ovrun.js), for balance numbers: node tools/rigbench.mjs [--seeds N] [--policy smart|first] [--god]
// MODS='[...]' adds stat modifiers to the player first, to try a number before changing it in the game.
// The bot kites like the Overforged bench bot (tools/bench.mjs), takes level-up offers by a score, places pieces at their
// suggested slot, opens chests, and walks to a shrine when nothing is close to spend its gold at the workbench
// (NOSHOP=1 turns that off). Prints one row per seed and the means.

import { createOverclockedRun } from '../src/game/ovrun.js';
import { applyRig } from '../src/game/sandbox.js';
import { makeOffers, applyOffer, CAPACITY_LEVELS } from '../src/rig/offers.js';
import { placeSuggested, owned } from '../src/rig/editor.js';
import { openRigChest } from '../src/rig/chests.js';
import { stockUp, buyItem } from '../src/rig/workbench.js';
import { PIECES } from '../src/rig/pieces.js';
import { WAVES, RATE_RAMP } from '../src/data/waves.js';
import { ENEMIES } from '../src/data/enemies.js';

// Experiments on the enemy side, applied before any run: RAMP_END (the late spawn-rate ramp's end, data/waves.js),
// HP_MID / HP_LATE (hpScale of the 3:00-6:00 and 6:00-10:00 segments), BOSS_DMG / BOSS_HP (Warlord multipliers).
if (process.env.RAMP_END) RATE_RAMP.end = Number(process.env.RAMP_END);
if (process.env.HP_MID) WAVES[2].hpScale = Number(process.env.HP_MID);
if (process.env.HP_LATE) WAVES[3].hpScale = Number(process.env.HP_LATE);
if (process.env.BOSS_DMG) ENEMIES.warlord.damage *= Number(process.env.BOSS_DMG);
if (process.env.BOSS_HP) ENEMIES.warlord.hp *= Number(process.env.BOSS_HP);
// PIECE='{"blaster":{"count":3}}' overrides base numbers of weapon pieces for an experiment.
if (process.env.PIECE) for (const [id, b] of Object.entries(JSON.parse(process.env.PIECE))) Object.assign(PIECES[id].def.base, b);
const arg = (k, d) => { const i = process.argv.indexOf(k); return i >= 0 ? process.argv[i + 1] : d; };
const SEEDS = Number(arg('--seeds', 5));
const POLICY = arg('--policy', 'smart');
const GOD = process.argv.includes('--god');
const STEP = 1 / 30;
const VIEW = { w: 390, h: 844, insetTop: 0 };

const types = (rig) => {
  const n = { weapon: 0, modifier: 0, trigger: 0, chains: rig.chains.length };
  for (const c of rig.chains) for (const id of c.slots) if (id) n[PIECES[id].type]++;
  return n;
};

// Higher is better. A structural score: a rig needs weapons, then triggers that multiply them, then modifiers.
function score(o, rig) {
  if (POLICY === 'first') return 0;
  const n = types(rig);
  if (o.kind === 'cap') return o.cap === 'chain' ? 70 : o.cap === 'slot' ? 65 : 45;
  if (o.kind === 'stat') return o.id === 'hp' ? 30 : 15;
  if (o.kind === 'level') return PIECES[o.id].type === 'weapon' ? 55 + o.to : 40 + o.to;
  const p = PIECES[o.id];
  if (p.type === 'weapon') return n.weapon < 2 ? 80 : n.weapon < 4 ? 50 : 20;
  if (p.type === 'trigger') return n.weapon > n.trigger ? 75 : 25;
  return n.modifier < n.weapon * 2 ? 60 : 25;
}

export function playRig(seed, { god = GOD, onTick = null } = {}) {
  const run = createOverclockedRun({ seed, view: VIEW, debug: { god }, sfx: () => {} });
  if (process.env.MODS) for (const m of JSON.parse(process.env.MODS)) run.player.stats.add({ ...m, source: 'bench:' });   // experiments: MODS='[{"stat":"damage","op":"inc","value":0.5}]'
  run.player.maxHp = run.player.hp = run.player.stats.get('maxHp');
  const move = { x: 0, y: 0 };
  let chests = 0;
  let bought = 0;
  let bossSeen = false;
  const at = {};
  while (!run.over && run.time < 601) {
    const p = run.player;
    let sx = 0;
    let sy = 0;
    let near = null;
    let nd = 1e9;
    for (const e of run.world.enemies.active) {
      const dx = p.x - e.x;
      const dy = p.y - e.y;
      const d = Math.hypot(dx, dy);
      if (d < nd) { nd = d; near = e; }
      if (d < 110) { sx += dx / (d * d + 1); sy += dy / (d * d + 1); }
    }
    const l = Math.hypot(sx, sy);
    let chest = null;
    for (const g of run.world.pickups.active) if (g.kind === 2) { chest = g; break; }
    if (!chest && !process.env.NOSHOP && run.shrines.length) chest = run.shrines[0];            // a shrine is walked to the same way
    if (l > 0) {                                  // back off the crowd, with a sideways bias so enemies stay in range
      const fx = sx / l;
      const fy = sy / l;
      move.x = fx * Math.cos(0.6) - fy * Math.sin(0.6);
      move.y = fx * Math.sin(0.6) + fy * Math.cos(0.6);
    } else if (chest) {
      const d = Math.hypot(chest.x - p.x, chest.y - p.y) || 1;
      move.x = (chest.x - p.x) / d; move.y = (chest.y - p.y) / d;
    } else if (near) {
      const d = nd || 1;
      move.x = (near.x - p.x) / d; move.y = (near.y - p.y) / d;
    } else { move.x = 0; move.y = 0; }

    run.update(STEP, move);
    if (onTick) onTick(run);
    if (run.bossAlive) bossSeen = true;
    for (const t of [60, 120, 180, 300, 450]) if (!at[t] && run.time >= t) at[t] = { lv: p.level, k: run.kills, hp: Math.round(p.hp) };

    if (run.forgeReady) {                                          // the workbench: buy what scores best while the gold lasts
      run.forgeReady = false;
      const items = stockUp(run.rng, run.rigState, run.banished).filter((i) => i.kind !== 'rule');
      items.sort((a, b) => score(b, run.rigState) - score(a, run.rigState));
      for (const it of items) {
        if (run.ore < it.price) continue;
        const res = buyItem(run.rigState, it);
        if (!res) continue;
        run.rigState = res.rig;
        run.ore -= it.price;
        bought++;
      }
      applyRig(run);
    }
    while (run.pendingChests.length > 0) {
      const r = openRigChest(run.rng, run.rigState, run.pendingChests.shift(), run.chestsOpened === 0);
      run.chestsOpened++;
      run.rigState = r.rig;
      applyRig(run);
      chests++;
    }
    while (run.pendingLevelUps > 0) {
      const level = p.level - (run.pendingLevelUps - 1);
      const offers = makeOffers(run.rng, run.rigState, { capacity: CAPACITY_LEVELS.includes(level) });
      offers.sort((a, b) => score(b, run.rigState) - score(a, run.rigState));
      let done = false;
      for (const o of offers) {
        let next = null;
        if (o.kind === 'piece') { const pl = placeSuggested(run.rigState, o.id); next = pl && pl.rig; } else next = applyOffer(run.rigState, o);
        if (next) { run.rigState = next; done = true; break; }
      }
      if (done) applyRig(run);
      run.pendingLevelUps--;
    }
  }
  const n = types(run.rigState);
  return { seed, won: run.won, time: Math.round(run.time), level: run.player.level, kills: run.kills, bossSeen, bossKilled: run.bossKilled, chests, bought, at, rig: n, owned: [...owned(run.rigState)].length };
}

if (process.argv[1] && process.argv[1].endsWith('rigbench.mjs')) {
  const rows = [];
  for (let s = 1; s <= SEEDS; s++) {
    const r = playRig(s);
    rows.push(r);
    console.log(`seed ${s}: ${r.won ? 'WON ' : 'died'} ${String(r.time).padStart(3)}s  lv ${String(r.level).padStart(2)}  kills ${String(r.kills).padStart(5)}  boss ${r.bossKilled ? 'killed' : r.bossSeen ? 'seen' : '-'}  chests ${r.chests}  shop ${r.bought}  rig w${r.rig.weapon} m${r.rig.modifier} t${r.rig.trigger} chains ${r.rig.chains}  | 60s ${JSON.stringify(r.at[60] || null)}  180s ${JSON.stringify(r.at[180] || null)}  300s ${JSON.stringify(r.at[300] || null)}`);
  }
  const mean = (f) => (rows.reduce((a, r) => a + f(r), 0) / rows.length).toFixed(1);
  console.log(`\nwins ${rows.filter((r) => r.won).length}/${rows.length}  mean time ${mean((r) => r.time)}s  level ${mean((r) => r.level)}  kills ${mean((r) => r.kills)}  boss kills ${rows.filter((r) => r.bossKilled).length}`);
}

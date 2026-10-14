// Applying damage: the queued enemy damage flush, enemy deaths, and damage to the player.

import { addDamageNumber, addPuff } from '../render/fx.js';
import { spawnGem, spawnOre, spawnChest } from './pickups.js';
import { ELITE, affixDefs } from '../data/elites.js';
import { spawnEnemy } from '../game/director.js';
import { ORES } from '../data/ores.js';
import { fireTriggers } from '../game/triggers.js';
import { onMilestone } from '../game/titles.js';
import { spawnShrine } from './shrines.js';
import { SHRINE } from '../data/forge.js';
import { KIND_HIT, KIND_DOT } from './damage-queue.js';
import { recordDamage, recordKill } from '../game/run-stats.js';
import { ST } from '../data/statuses.js';
import { applyBurn, applyChill, applyShock, chainArc, onStatusDeath } from './status.js';

const IFRAMES = 0.5;       // seconds of invulnerability after a hit
const HURT_FLASH = 0.15;
const HIT_FLASH = 0.08;
const WARD_MULT = 0.5;     // damage taken inside a Shaman's ward
const BLESS_MULT = 1.1;    // damage taken by a blessed enemy
const ARMOR_FLOOR = 0.25;  // armor never takes more than 75% off a hit

export function killEnemy(run, e) {
  run.kills++;
  run.sfx('kill');
  run.lastKillTime = run.time;
  addPuff(run, e.x, e.y, e.r, e.def.color);
  if (e.elite) {
    for (const a of affixDefs(e)) {
      if (!a.blastRadius) continue;                           // Volatile: it explodes, hurting anyone standing close
      addPuff(run, e.x, e.y, a.blastRadius / 2.2, '#ff5a3c');
      const p = run.player;
      if (Math.hypot(p.x - e.x, p.y - e.y) < a.blastRadius + p.r) damagePlayer(run, e.damage * a.blastMult);
    }
  }
  if (e.def.splits && run.director) {                         // Splitter: three goblins burst out of it
    for (let k = 0; k < e.def.splits; k++) {
      const a = (k / e.def.splits) * Math.PI * 2 + run.rng.next();
      spawnEnemy(run, 'goblin', e.x + Math.cos(a) * 14, e.y + Math.sin(a) * 14, run.director.hpScale * 0.7);
    }
  }
  spawnGem(run, e.x, e.y, e.def.xp * (e.elite ? ELITE.xpMult : 1));
  const ore = e.def.ore;
  if (ore && ORES[ore.type].bank === 'starsteel') {
    run.starsteel += ore.count || 1;               // starsteel is banked at once, so the boss chest can use it
  } else if (ore && run.rng.next() < ore.chance * run.player.stats.get('oreGain')) {
    spawnOre(run, e.x + 6, e.y - 4, ore.type, ore.count || 1);
  }
  if (e.elite) {
    spawnChest(run, e.x, e.y, 0);
    // starsteel for evolutions: the first elite always drops one, later ones with a chance
    if (run.eliteKills++ === 0 || run.rng.next() < ELITE.starsteelChance) {
      run.starsteel += 1;
      run.toast = { text: '+1 starsteel', ttl: 2 };
    }
  }
  if (e.def.boss) {
    run.bossAlive = false;
    run.bossKilled = true;
    run.boss = null;
    spawnShrine(run, SHRINE.bossShrineTtl, { x: e.x, y: e.y }, true);
    spawnChest(run, e.x - 40, e.y, 1);
    run.toast = { text: `${e.def.name} slain!`, ttl: 3 };
    onMilestone(run, 'boss', 1);
  }
  run.world.enemies.release(e);
  onMilestone(run, 'kills', run.kills);
}

// Damage multiplier from the target's statuses (vsBurning / vsChilled / vsShocked), read through
// the source weapon's tag scope. Untouched enemies cost one integer test.
function targetMult(run, e, src) {
  const st = e.status;
  if ((st & 15) === 0 || !src) return 1;
  const stats = run.player.stats;
  let m = 1;
  if (st & ST.BURN) m *= stats.getFor('vsBurning', src.tags);
  if (st & (ST.CHILL | ST.FROZEN)) m *= stats.getFor('vsChilled', src.tags);
  if (st & ST.SHOCK) m *= stats.getFor('vsShocked', src.tags);
  return m;
}

// Rolls the three status chances for one hit and applies what lands. A shock on a weapon hit
// chains even if the hit killed its target, so overkill does not waste the arc.
function rollStatuses(run, e, src, amount, depth, kind) {
  const stats = run.player.stats;
  const tags = src.tags;
  const rng = run.rng;
  const alive = e.hp > 0;
  let c = stats.getFor('burnChance', tags);
  if (c > 0 && rng.next() < c && alive) applyBurn(run, e, src, amount, depth);
  c = stats.getFor('chillChance', tags);
  if (c > 0 && rng.next() < c && alive) applyChill(run, e, src, depth);
  c = stats.getFor('shockChance', tags);
  if (c > 0 && rng.next() < c) {
    if (alive) applyShock(run, e, src);
    if (kind === KIND_HIT) chainArc(run, e, src, amount, depth);
  }
}

// Step 8 of the tick: apply every queued hit (docs/design-m10-m13.md §3.6).
export function flushDamage(run) {
  const q = run.world.dmg;
  const lifesteal = run.player.stats.mods.lifesteal.length;   // any lifesteal modifier at all (global or tag-scoped)? most runs have none
  for (let i = 0; i < q.n; i++) {
    const e = q.enemy[i];
    q.enemy[i] = null;
    const src = q.src[i];
    q.src[i] = null;
    if (!e.alive || e.uid !== q.uid[i]) continue;     // already dead (or slot reused) this tick
    const depth = q.depth[i];
    const kind = q.kind[i];
    const ex = e.x;
    const ey = e.y;
    let amount = q.amount[i] * targetMult(run, e, src);
    if (e.blessT > 0) amount *= BLESS_MULT;                   // Radiant Halo's mark
    if (e.armor > 0 && e.sunderT <= 0 && kind !== KIND_DOT) {                  // armour: flat loss per hit, so heavy hits and burns beat it
      const left = amount - e.armor;
      amount = left > amount * ARMOR_FLOOR ? left : amount * ARMOR_FLOOR;
    }
    if (e.elite) {
      for (const a of affixDefs(e)) {
        if (a.untilHpFrac !== undefined && e.hp > e.maxHp * a.untilHpFrac) amount *= a.damageTaken;   // Warded: half damage until it is wounded
      }
    }
    if (e.wardT > 0) amount *= WARD_MULT;                     // a Shaman's ward
    if (q.crit[i] === 1 && src && !e.def.boss) {          // Headsman: a crit that would leave it under the threshold kills it
      const thr = run.player.stats.getFor('executeBelow', src.tags);
      if (thr > 0 && (e.hp - amount) / e.maxHp < thr) amount = e.hp;
    }
    const dealt = amount < e.hp ? amount : e.hp;          // overkill is not damage dealt
    recordDamage(run, src, q.cause[i], dealt > 0 ? dealt : 0, q.crit[i] === 1);
    run.hitFrozen = (e.status & ST.FROZEN) !== 0;           // for Glacier Maul's shatter
    e.hp -= amount;
    e.lastHitT = run.time;
    e.flash = HIT_FLASH;
    e.kx += q.kx[i];
    e.ky += q.ky[i];
    if (kind !== KIND_DOT) addDamageNumber(run, e.x, e.y - e.r, amount, q.crit[i] === 1);
    if (src && kind !== KIND_DOT) {
      if (lifesteal > 0) {                            // heal a share of damage dealt (per weapon scope)
        const p = run.player;
        p.hp = Math.min(p.maxHp, p.hp + amount * p.stats.getFor('lifesteal', src.tags));
      }
      rollStatuses(run, e, src, amount, depth, kind);
      if (q.crit[i] === 1) fireTriggers(run, 'crit', src, ex, ey, depth, e);
      fireTriggers(run, 'hit', src, ex, ey, depth, e);
    }
    if (e.hp <= 0) {
      const mask = e.status;
      const maxHp = e.maxHp;
      const burnLeft = e.burnT > 0 ? e.burnDps * e.burnT : 0;
      killEnemy(run, e);
      recordKill(run, src);
      if ((mask & 15) !== 0 && src) onStatusDeath(run, e, src, depth, mask, maxHp, burnLeft, amount);
      if (src) fireTriggers(run, 'kill', src, ex, ey, depth);   // burn kills still count as the weapon's kills
    }
  }
  q.n = 0;
}

export function damagePlayer(run, amount) {
  const p = run.player;
  if (p.iframes > 0 || run.over) return;
  run.sfx('hurt');
  p.iframes = IFRAMES;
  p.hurtFlash = HURT_FLASH;
  run.cam.shake = 7;
  if (run.debug.god) return;
  let dmg = Math.max(1, amount - p.stats.get('armor'));
  if (p.shield > 0) {                    // the shield soaks damage first
    const soak = Math.min(p.shield, dmg);
    p.shield -= soak;
    dmg -= soak;
  }
  p.hp -= dmg;
  if (p.hp <= 0) {
    p.hp = 0;
    run.over = true;
    run.won = false;
  }
}

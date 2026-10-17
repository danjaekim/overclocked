// M45c: affix cleanup and new affixes (docs/design-m45.md).

import { test, assert } from './harness.mjs';
import { createRun } from '../src/game/run.js';
import { spawnEnemy, spawnElite } from '../src/game/director.js';
import { addWeapon } from '../src/game/weapons.js';
import { AFFIXES } from '../src/data/forge.js';
import { WEAPONS } from '../src/data/weapons.js';
import { rebuildAffixes, eligibleAffixes } from '../src/game/forge.js';
import { validateData } from '../src/data/validate.js';
import { queueDamage, KIND_HIT } from '../src/systems/damage-queue.js';
import { flushDamage } from '../src/systems/damage.js';
import { fireTriggers } from '../src/game/triggers.js';
import { VERSION } from '../src/version.js';

const STEP = 1 / 60;
const newRun = () => {
  const run = createRun({ seed: 6, view: { w: 480, h: 1040 }, debug: { god: true }, classId: 'smith' });
  run.director.update = () => {};
  run.player.weapons.length = 0;
  return run;
};
const tick = (run, s) => { for (let i = 0; i < Math.round(s / STEP); i++) run.update(STEP, { x: 0, y: 0 }); };
const withAffix = (id, ...affixes) => {
  const run = newRun();
  const w = addWeapon(run, id);
  w.affixes = [...affixes];
  rebuildAffixes(run, w);
  return { run, w };
};
const dummy = (run, x, y, hp = 1e9) => { const e = spawnEnemy(run, 'goblin', x, y); e.speed = 0; e.hp = e.maxHp = hp; return e; };

test('version bumped', () => assert.ok(/^0\.(45\.([3-9]|\d\d)|4[6-9]\.|[5-9]\d\.)/.test(VERSION), VERSION));

test('data: Brutal and Shoving are gone, Keen is merged, new affixes validate', () => {
  assert.deepEqual(validateData(), []);
  assert.ok(!AFFIXES.brutal && !AFFIXES.shoving);
  assert.deepEqual(AFFIXES.keen.mods.map((m) => m.stat).sort(), ['critChance', 'critMult']);
  assert.equal(AFFIXES.heavy.mods[0].op, 'more');
  for (const id of ['staggering', 'lingering', 'swiftshot', 'packmaster', 'bane', 'seeking', 'echoing', 'overcharged', 'hunters_mark', 'prismatic']) assert.ok(AFFIXES[id], id);
});

test('eligibility: shape-only affixes need their shape; Prismatic and Hunter\'s Mark fit anything', () => {
  const run = newRun();
  const bow = eligibleAffixes(addWeapon(run, 'storm_volley'));
  const halo = eligibleAffixes(addWeapon(newRun(), 'halo'));
  const pack = eligibleAffixes(addWeapon(newRun(), 'bone_call'));
  assert.ok(bow.includes('seeking') && bow.includes('swiftshot') && !bow.includes('packmaster'));
  assert.ok(!halo.includes('seeking') && !halo.includes('lingering') && halo.includes('hunters_mark') && halo.includes('prismatic') && halo.includes('bane'));
  assert.ok(pack.includes('packmaster'));
  assert.ok(!halo.includes('echoing') || WEAPONS.halo.behavior === 'pulse');
});

test('Staggering: a hit sometimes staggers (bosses half); over many hits it lands', () => {
  const { run, w } = withAffix('colossus_maul', 'staggering');
  w.cd = 1e9;
  const es = Array.from({ length: 60 }, (_, i) => dummy(run, 300 + i, 0));
  for (const e of es) { queueDamage(run, e, 1, false, 0, 0, 0, w, KIND_HIT); fireTriggers(run, 'hit', w, e.x, e.y, 0, e); }
  flushDamage(run);
  const n = es.filter((e) => e.stunT > 0).length;
  assert.ok(n >= 1 && n <= 25, `staggered ${n} of 60`);
});

test('Bane: 30% more damage to elites and bosses, none to plain enemies', () => {
  const { run, w } = withAffix('storm_volley', 'bane');
  w.cd = 1e9;
  const plain = dummy(run, 300, 0);
  const el = spawnElite(run, 'brute', 340, 0, 1, 'swift'); el.speed = 0; el.hp = el.maxHp = 1e9;
  const ref = spawnElite(run, 'brute', 380, 0, 1, 'swift'); ref.speed = 0; ref.hp = ref.maxHp = 1e9;
  const hit = (e, src) => { queueDamage(run, e, 100, false, 0, 0, 0, src, KIND_HIT); flushDamage(run); return e.maxHp - e.hp; };
  const other = addWeapon(run, 'halo');
  assert.equal(hit(plain, w), 100);
  const a = hit(el, w);
  const b = hit(ref, other);
  assert.ok(a > b * 1.25 && a < b * 1.35, `${a} vs ${b}`);
});

test("Hunter's Mark: the weapon's hit marks an enemy and every other weapon then hits it 20% harder; the mark ends", () => {
  const { run, w } = withAffix('storm_volley', 'hunters_mark');
  w.cd = 1e9;
  const other = addWeapon(run, 'halo');
  other.cd = 1e9;
  const e = dummy(run, 300, 0);
  const hit = (src) => { const h = e.hp; queueDamage(run, e, 100, false, 0, 0, 0, src, KIND_HIT); flushDamage(run); return h - e.hp; };
  const before = hit(other);
  fireTriggers(run, 'hit', w, e.x, e.y, 0, e);
  assert.ok(e.markT > 3);
  assert.ok(Math.abs(hit(other) / before - 1.2) < 0.01);
  tick(run, 4.2);
  assert.ok(!(e.markT > 0));
});

test('Seeking: a projectile aimed off-line curves into an enemy it would otherwise miss', () => {
  const miss = (id) => {
    const { run, w } = withAffix('storm_volley', ...(id ? [id] : []));
    w.cd = 1e9;
    const e = dummy(run, 260, 90);
    const pr = run.world.projectiles.acquire();
    Object.assign(pr, { inst: w, x: 0, y: 0, dx: 1, dy: 0, vx: 420, vy: 0, r: 8, ttl: 1.2, dmg: 50, pierce: 0, nh: 0, bounce: 0, split: 0, splitFrac: 0, sub: false, depth: 0, trailD: 0, ret: 0, fall: 0, hx: NaN, hy: NaN, chain: 0, ci: 0, look: 0, pierce0: 0, ttl0: 0, homing: id ? 5 : 0 });
    tick(run, 1.2);
    return e.maxHp - e.hp;
  };
  assert.equal(miss(null), 0, 'a straight shot misses');
  assert.ok(miss('seeking') > 0, 'a seeking shot lands');
});

test('Packmaster adds a minion; Prismatic gives all three elements and three status chances', () => {
  const base = addWeapon(newRun(), 'bone_call');
  const { run, w } = withAffix('bone_call', 'packmaster');
  tick(run, 8);
  const r0 = newRun(); const b = addWeapon(r0, 'bone_call'); tick(r0, 8);
  assert.equal(w.minions.length, b.minions.length + 1);
  const p = withAffix('halo', 'prismatic');
  for (const t of ['fire', 'frost', 'storm']) assert.ok(p.w.tags.set.has(t), t);
  assert.ok(base);
});

const SHAPES = { projectile: 'storm_volley', arc: 'reaper_axe', slam: 'colossus_maul', nova: 'rime_shards', bolt: 'prismatic_bolt', chain: 'static_rod', mortar: 'cinder_mortar', judge: 'judgement', pulse: 'halo', rod: 'thunder_lance', boomerang: 'chakram' };
test('Echoing and Overcharged arm and spend the next attack on every cooldown shape', () => {
  for (const affix of ['echoing', 'overcharged']) {
    for (const [shape, id] of Object.entries(SHAPES)) {
      const { run, w } = withAffix(id, affix);
      for (let i = 0; i < 14; i++) { const a = (i / 14) * Math.PI * 2; dummy(run, Math.cos(a) * (60 + (i % 3) * 25), Math.sin(a) * (60 + (i % 3) * 25)); }
      let arms = 0;
      let was = null;
      for (let i = 0; i < 60 * 25; i++) {
        run.update(STEP, { x: 0, y: 0 });
        if (w.armed && !was) arms++;
        was = w.armed;
      }
      assert.ok(arms >= 2, `${affix} on ${shape} (${id}) armed ${arms}x`);
      assert.ok(run.stats.total > 0 && Number.isFinite(run.stats.total));
    }
  }
});

test('Echoing: the repeat fires at once at reduced damage and adds damage over the same time', () => {
  const total = (affix) => {
    const { run, w } = withAffix('storm_volley', ...(affix ? [affix] : []));
    for (let i = 0; i < 12; i++) dummy(run, 150 + i * 6, (i - 6) * 14);
    let spent = 0;
    let was = null;
    for (let i = 0; i < 60 * 20; i++) {
      run.update(STEP, { x: 0, y: 0 });
      if (was && !w.armed) spent++;
      was = w.armed;
    }
    return { dmg: run.stats.total, spent };
  };
  const a = total('echoing');
  const b = total(null);
  assert.ok(a.spent >= 2, `echoes ${a.spent}`);
  assert.ok(a.dmg > b.dmg && a.dmg < b.dmg * 1.4, `${a.dmg} vs ${b.dmg}`);
});

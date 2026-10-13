import { test, assert, approx } from './harness.mjs';
import { StatBlock, makeTags, NO_TAGS } from '../src/stats/stats.js';
import { STATS } from '../src/stats/stat-defs.js';

const mk = (ctx = {}, conditions = { always: () => true, never: () => false, lowHp: (c) => c.hp < 50 }) =>
  new StatBlock(STATS, { conditions, getContext: () => ctx });

test('no modifiers returns the base value', () => {
  const sb = mk();
  assert.equal(sb.get('maxHp'), 100);
  assert.equal(sb.get('damage'), 1);
});

test('flat adds to base before multipliers', () => {
  const sb = mk();
  sb.add({ stat: 'maxHp', op: 'flat', value: 20 });
  sb.add({ stat: 'maxHp', op: 'inc', value: 0.5 });
  approx(sb.get('maxHp'), (100 + 20) * 1.5);
});

test('inc modifiers sum together, more modifiers multiply separately', () => {
  const sb = mk();
  sb.add({ stat: 'damage', op: 'inc', value: 0.15 });
  sb.add({ stat: 'damage', op: 'inc', value: 0.2 });
  approx(sb.get('damage'), 1.35);
  const sb2 = mk();
  sb2.add({ stat: 'damage', op: 'more', value: 0.5 });
  sb2.add({ stat: 'damage', op: 'more', value: 0.5 });
  approx(sb2.get('damage'), 2.25);
});

test('full formula: (base + flat) x (1 + inc) x more', () => {
  const sb = mk();
  sb.add({ stat: 'maxHp', op: 'flat', value: 50 });
  sb.add({ stat: 'maxHp', op: 'inc', value: 0.1 });
  sb.add({ stat: 'maxHp', op: 'inc', value: 0.2 });
  sb.add({ stat: 'maxHp', op: 'more', value: 0.5 });
  sb.add({ stat: 'maxHp', op: 'more', value: 0.2 });
  approx(sb.get('maxHp'), 150 * 1.3 * 1.5 * 1.2);
});

test("'set' overrides the result and is still clamped", () => {
  const sb = mk();
  sb.add({ stat: 'moveSpeed', op: 'inc', value: 1 });
  sb.add({ stat: 'moveSpeed', op: 'set', value: 10 });
  assert.equal(sb.get('moveSpeed'), 40);                 // min clamp
  sb.add({ stat: 'moveSpeed', op: 'set', value: 9999 });
  assert.equal(sb.get('moveSpeed'), 600);                // max clamp, last set wins
});

test('clamps respect min and max', () => {
  const sb = mk();
  sb.add({ stat: 'cooldown', op: 'inc', value: -5 });
  assert.equal(sb.get('cooldown'), 0.1);
  sb.add({ stat: 'critChance', op: 'flat', value: 5 });
  assert.equal(sb.get('critChance'), 1);
});

test('negative inc speeds up cooldown', () => {
  const sb = mk();
  sb.add({ stat: 'cooldown', op: 'inc', value: -0.15 });
  approx(sb.get('cooldown'), 0.85);
});

test('tag scoping: a modifier applies only when the reader has ALL its tags', () => {
  const sb = mk();
  sb.add({ stat: 'damage', op: 'inc', value: 0.1 });                                  // global
  sb.add({ stat: 'damage', op: 'inc', value: 0.5, tags: ['fire'] });
  sb.add({ stat: 'damage', op: 'inc', value: 1, tags: ['fire', 'projectile'] });
  const bow = makeTags(['projectile', 'ranged', 'fire', 'weapon:1']);
  const torch = makeTags(['fire', 'melee']);
  const axe = makeTags(['melee']);
  approx(sb.getFor('damage', bow), 1 + 0.1 + 0.5 + 1);
  approx(sb.getFor('damage', torch), 1 + 0.1 + 0.5);
  approx(sb.getFor('damage', axe), 1.1);
  approx(sb.get('damage'), 1.1);                                                      // no tags: scoped mods ignored
});

test('weapon-instance tags isolate weapon-local upgrades', () => {
  const sb = mk();
  sb.add({ stat: 'damage', op: 'inc', value: 0.4, tags: ['weapon:1'] });
  const w1 = makeTags(['projectile', 'weapon:1']);
  const w2 = makeTags(['projectile', 'weapon:2']);
  approx(sb.getFor('damage', w1), 1.4);
  approx(sb.getFor('damage', w2), 1);
});

test('makeTags is order-independent and de-duplicates', () => {
  assert.equal(makeTags(['b', 'a', 'a']).key, makeTags(['a', 'b']).key);
  assert.equal(NO_TAGS.key, '');
});

test('conditional modifiers are evaluated on every read and never cached', () => {
  const ctx = { hp: 80 };
  const sb = mk(ctx);
  sb.add({ stat: 'damage', op: 'more', value: 0.4, when: 'lowHp' });
  approx(sb.get('damage'), 1);
  ctx.hp = 30;
  approx(sb.get('damage'), 1.4);
  ctx.hp = 90;
  approx(sb.get('damage'), 1);
});

test('conditional bookkeeping survives removal (stat goes back to cached path)', () => {
  const ctx = { hp: 10 };
  const sb = mk(ctx);
  sb.add({ stat: 'damage', op: 'more', value: 1, when: 'lowHp', source: 'title:x' });
  assert.equal(sb.conditional.damage, 1);
  sb.removeBySource('title:x');
  assert.equal(sb.conditional.damage, 0);
  approx(sb.get('damage'), 1);
});

test('cache is invalidated by add and removeBySource', () => {
  const sb = mk();
  approx(sb.get('damage'), 1);
  sb.add({ stat: 'damage', op: 'inc', value: 0.5, source: 'passive:core:1' });
  approx(sb.get('damage'), 1.5);
  sb.add({ stat: 'damage', op: 'inc', value: 0.5, source: 'passive:core:2' });
  approx(sb.get('damage'), 2);
  assert.equal(sb.removeBySource('passive:core'), 2);
  approx(sb.get('damage'), 1);
  assert.equal(sb.removeBySource('passive:core'), 0);
});

test('removeBySource matches by prefix only', () => {
  const sb = mk();
  sb.add({ stat: 'damage', op: 'inc', value: 0.1, source: 'passive:ember_core:1' });
  sb.add({ stat: 'damage', op: 'inc', value: 0.1, source: 'passive:ember_coreX:1' });
  sb.add({ stat: 'damage', op: 'inc', value: 0.1, source: 'weapon:1:2' });
  assert.equal(sb.removeBySource('passive:ember_core:'), 1);
  approx(sb.get('damage'), 1.2);
});

test('unknown stat, op or condition throws at add time', () => {
  const sb = mk();
  assert.throws(() => sb.add({ stat: 'nope', op: 'flat', value: 1 }), /Unknown stat/);
  assert.throws(() => sb.add({ stat: 'damage', op: 'times', value: 1 }), /Unknown op/);
  assert.throws(() => sb.add({ stat: 'damage', op: 'inc', value: 1, when: 'whenever' }), /Unknown condition/);
});

test('worked example from the architecture doc: Ember Bow at level 8 hits for 22.5', () => {
  const sb = mk();
  const tags = makeTags(['projectile', 'ranged', 'fire', 'weapon:1']);
  const lvl = [
    { stat: 'damage', op: 'inc', value: 0.2 },
    { stat: 'projectiles', op: 'flat', value: 1 },
    { stat: 'pierce', op: 'flat', value: 1 },
    { stat: 'cooldown', op: 'inc', value: -0.15 },
    { stat: 'projectiles', op: 'flat', value: 1 },
    { stat: 'damage', op: 'inc', value: 0.3 },
    { stat: 'damage', op: 'more', value: 0.25 },
  ];
  lvl.forEach((m) => sb.add({ ...m, tags: ['weapon:1'] }));
  approx(12 * sb.getFor('damage', tags), 22.5);
  approx(1.1 * sb.getFor('cooldown', tags), 0.935);
  assert.equal(0 + sb.getFor('projectiles', tags), 2);
  assert.equal(0 + sb.getFor('pierce', tags), 1);
});

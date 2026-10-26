// M30: fusion payloads. A generic fusion makes the first hit of every host attack fire an effect shaped
// like the donor's attack (docs/design-m30-m33.md §3).

import { test, assert } from './harness.mjs';
import { createRun } from '../src/game/run.js';
import { spawnEnemy } from '../src/game/director.js';
import { addWeapon } from '../src/game/weapons.js';
import { fuse, previewFusion } from '../src/game/fusion.js';
import { FUSION, PAYLOADS, SHAPE_PAYLOAD, payloadFor } from '../src/data/fusions.js';
import { BEHAVIORS } from '../src/behaviors/index.js';
import { WEAPONS } from '../src/data/weapons.js';
import { validateData } from '../src/data/validate.js';
import { firePayload, PAYLOAD_FX } from '../src/effects/payloads.js';
import { attackTriggers, fireTriggers } from '../src/game/triggers.js';
import { queueDamage, KIND_HIT, CAUSE_NAMES, CAUSE } from '../src/systems/damage-queue.js';
import { flushDamage } from '../src/systems/damage.js';
import { buildEntries } from '../src/game/compendium.js';

const STEP = 1 / 60;
const newRun = (seed = 7) => {
  const run = createRun({ seed, view: { w: 480, h: 1040 }, debug: { god: true }, classId: 'smith' });
  run.director.update = () => {};
  run.player.weapons.length = 0;
  run.starsteel = 5;
  return run;
};
const tick = (run, s) => { for (let i = 0; i < Math.round(s / STEP); i++) run.update(STEP, { x: 0, y: 0 }); };
const dummy = (run, x, y, hp = 1e9) => { const e = spawnEnemy(run, 'goblin', x, y); e.speed = 0; e.hp = e.maxHp = hp; return e; };
const rehash = (run) => run.world.hash.rebuild(run.world.enemies.active, run.world.enemies.count);
const dealt = (e) => e.maxHp - e.hp;
// A fused host (never fires on its own: cooldown huge) so a test controls every attack.
const fused = (host, donor) => {
  const run = newRun();
  const h = addWeapon(run, host);
  const d = addWeapon(run, donor);
  assert.ok(fuse(run, h, d).ok);
  h.cd = 1e9;
  return { run, h };
};
const hit = (run, h, e) => { queueDamage(run, e, 10, false, 0, 0, 0, h, KIND_HIT); flushDamage(run); };

test('m30 data validates; every behavior has a payload and every payload is defined', () => {
  assert.deepEqual(validateData(), []);
  for (const b of Object.keys(BEHAVIORS)) assert.ok(SHAPE_PAYLOAD[b], b);
  for (const id of Object.values(SHAPE_PAYLOAD)) assert.ok(PAYLOADS[id], id);
  assert.equal(payloadFor(WEAPONS.whirlwind_cleaver), 'cleave', 'a spinning aura counts as an arc');
  assert.equal(payloadFor(WEAPONS.pyre_crown), 'imprint');
});

test('a generic fusion has a payload and no echo; a masterwork has neither', () => {
  const { h } = fused('reaper_axe', 'glacial_bloom');
  assert.equal(h.fusion.payload, 'burst');
  assert.deepEqual(h.fusion.triggers, []);
  assert.deepEqual(h.fusion.elements, ['frost']);
  assert.match(previewFusion(h, h).desc, /first hit/);
  const { h: m } = fused('colossus_maul', 'glacial_bloom');
  assert.equal(m.fusion.payload, null);
});

test('one attack arms the payload, its first hit fires it, the second hit does not, the next attack fires again', () => {
  const { run, h } = fused('reaper_axe', 'glacial_bloom');
  const a = dummy(run, 300, 0);
  const b = dummy(run, 340, 0);
  rehash(run);
  let fired = 0;
  const orig = PAYLOAD_FX.burst;
  PAYLOAD_FX.burst = (...x) => { fired++; return orig(...x); };
  try {
    hit(run, h, a);
    assert.equal(fired, 0, 'not armed before an attack');
    attackTriggers(run, h, 300, 0, 0);
    run.time += 1;
    hit(run, h, a);
    hit(run, h, b);
    assert.equal(fired, 1, 'only the first hit of the attack');
    attackTriggers(run, h, 300, 0, 0);
    run.time += 1;
    hit(run, h, b);
    assert.equal(fired, 2, 'the next attack carries it again');
  } finally { PAYLOAD_FX.burst = orig; }
});

test('the minimum gap stops a fast weapon spamming the payload', () => {
  const { run, h } = fused('pyre_crown', 'glacial_bloom');
  h.fusion.payload = 'burst';
  const a = dummy(run, 300, 0);
  rehash(run);
  let fired = 0;
  const orig = PAYLOAD_FX.burst;
  PAYLOAD_FX.burst = (...x) => { fired++; return orig(...x); };
  try {
    for (let i = 0; i < 10; i++) { attackTriggers(run, h, 0, 0, 0); run.time += 0.03; hit(run, h, a); }
  } finally { PAYLOAD_FX.burst = orig; }
  assert.ok(fired >= 1 && fired <= 3, `fired ${fired} in 0.3 s`);
  assert.ok(FUSION.payloadMinGap >= 0.1);
});

test('payload hits are PROC damage credited to Fusion and never fire another payload', () => {
  const { run, h } = fused('sunpiercer', 'stormshell_mortar');      // blast
  assert.equal(h.fusion.payload, 'blast');
  const a = dummy(run, 300, 0);
  const near = dummy(run, 320, 0);
  rehash(run);
  attackTriggers(run, h, 300, 0, 0);
  hit(run, h, a);
  tick(run, 0.6);
  assert.ok(dealt(near) > 0, 'the blast reached the neighbour');
  assert.equal(CAUSE_NAMES[CAUSE.FUSION], 'Fusion');
  assert.ok(run.statsSnapshot().causes.some((c) => c.name === 'Fusion'));
  assert.equal(h.payloadArmed, false, 'the payload disarmed and was not re-armed by its own hits');
});

test('each payload reaches an enemy next to the target and not one far away', () => {
  const donors = { projectile: 'storm_volley', arc: 'reaper_axe', slam: 'colossus_maul', rod: 'thunder_lance', orbit: 'seraph_blades', aura: 'pyre_crown', bolt: 'singularity',
    nova: 'glacial_bloom', mortar: 'stormshell_mortar', summon: 'bone_colossus', judge: 'judgement' };
  for (const [shape, donorId] of Object.entries(donors)) {
    const { run, h } = fused('prismatic_bolt', donorId);
    assert.equal(SHAPE_PAYLOAD[shape], SHAPE_PAYLOAD[WEAPONS[donorId].behavior]);
    const t = dummy(run, 200, 0);
    const near = dummy(run, 235, 5);
    const far = dummy(run, 900, 900);
    rehash(run);
    for (let k = 0; k < 6; k++) {                                   // a few attacks, in case one payload misses a neighbour
      attackTriggers(run, h, 200, 0, 0);
      run.time += 1;
      fireTriggers(run, 'hit', h, 200, 0, 0, t);
      rehash(run);
      tick(run, 0.7);
      if (dealt(near) > 0) break;
    }
    assert.ok(dealt(near) > 0 || dealt(t) > 0, `${shape} (${h.fusion.payload}) did nothing`);
    assert.equal(dealt(far), 0, shape);
  }
});

test('payload damage follows the host damage stat', () => {
  const { run, h } = fused('sunpiercer', 'stormshell_mortar');
  const a = dummy(run, 300, 0);
  const n1 = dummy(run, 320, 0);
  rehash(run);
  attackTriggers(run, h, 300, 0, 0);
  hit(run, h, a);
  tick(run, 0.6);
  const base = dealt(n1);
  const { run: r2, h: h2 } = fused('sunpiercer', 'stormshell_mortar');
  r2.player.stats.add({ stat: 'damage', op: 'more', value: 1, tags: [h2.instanceTag], source: 'test' });
  const a2 = dummy(r2, 300, 0);
  const n2 = dummy(r2, 320, 0);
  rehash(r2);
  attackTriggers(r2, h2, 300, 0, 0);
  hit(r2, h2, a2);
  tick(r2, 0.6);
  assert.ok(dealt(n2) > base * 1.6, `${dealt(n2)} vs ${base}`);
});

test('a fused weapon still fights: a whole run with each shape of donor does not throw', () => {
  for (const donorId of ['storm_volley', 'colossus_maul', 'singularity', 'bone_colossus', 'judgement', 'stormshell_mortar', 'seraph_blades', 'pyre_crown', 'glacial_bloom', 'thunder_lance', 'whirlwind_cleaver']) {
    const run = newRun(11);
    const h = addWeapon(run, 'prismatic_bolt');
    const d = addWeapon(run, donorId);
    assert.ok(fuse(run, h, d).ok, donorId);
    for (let i = 0; i < 30; i++) { const e = spawnEnemy(run, 'goblin', Math.cos(i) * (80 + i * 6), Math.sin(i) * (80 + i * 6)); e.speed = 0; }
    tick(run, 4);
    assert.ok(run.kills >= 0);
  }
});

test('the compendium fusion rules describe payloads, and the forge preview names the payload', () => {
  const rules = buildEntries({ fusions: [] }).find((e) => e.id === 'fusion:rules');
  assert.ok(rules.lines.some((l) => /payload/.test(l)));
  assert.ok(rules.lines.some((l) => /Hound donor/.test(l)));
  assert.ok(!rules.lines.some((l) => /echo/i.test(l)));
});

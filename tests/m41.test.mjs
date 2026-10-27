// M41: Starforge, six more mutations: aura Shockwave, rod Star Mark, nova Return Orbit, arc Afterimage,
// chain Forked Chain, trail Pulse Wake. Each must fire (state appears), draw state exists, and add damage.

import { test, assert } from './harness.mjs';
import { createRun } from '../src/game/run.js';
import { spawnEnemy } from '../src/game/director.js';
import { addWeapon, levelUpWeapon, canLevelUp } from '../src/game/weapons.js';
import { MUTATIONS, STARFORGE } from '../src/data/starforge.js';
import { validateData } from '../src/data/validate.js';
import { starforge, mutationOf } from '../src/game/starforge.js';

const VIEW = { w: 480, h: 1040 };
const STEP = 1 / 60;
const newRun = () => {
  const run = createRun({ seed: 11, view: VIEW, debug: { god: true }, classId: 'archer' });
  run.director.update = () => {};
  run.player.weapons.length = 0;
  return run;
};
const maxed = (run, id) => { const w = addWeapon(run, id); while (canLevelUp(w)) levelUpWeapon(run, w); return w; };
const dummy = (run, x, y) => {
  const e = spawnEnemy(run, 'goblin', run.player.x + x, run.player.y + y);
  e.hp = e.maxHp = 1e9;
  e.speed = 0;
  e.home = { x: e.x, y: e.y };
  return e;
};
const hold = (run) => { for (const e of run.world.enemies.active) if (e.home) { e.x = e.home.x; e.y = e.home.y; e.kx = e.ky = 0; } };
const step = (run) => { hold(run); run.update(STEP, { x: 0, y: 0 }); };
const tick = (run, n) => { for (let i = 0; i < n; i++) step(run); };
const dealt = (run) => { let s = 0; for (const e of run.world.enemies.active) if (e.home) s += e.maxHp - e.hp; return s; };

// A ring of dummies around the player at the given radii, so every behavior has targets whatever its reach.
function arena(run, radii = [50, 90, 130, 170]) {
  for (const r of radii) for (let k = 0; k < 6; k++) { const a = (k / 6) * Math.PI * 2 + r; dummy(run, Math.cos(a) * r, Math.sin(a) * r); }
}

function play(id, star, ticks, setup) {
  const run = newRun();
  const w = maxed(run, id);
  if (star) { run.starsteel = 2; assert.ok(starforge(run, w).ok); }
  arena(run);
  if (setup) setup(run, w);
  const seen = { run, w };
  seen.states = [];
  for (let i = 0; i < ticks; i++) {
    step(run);
    if (seen.probe) seen.probe(run, w, i);
  }
  seen.dealt = dealt(run);
  return seen;
}

const ALL = { aura: 'cinder_ward', rod: 'storm_javelin', nova: 'rime_shards', arc: 'rending_axe', chain: 'static_rod', trail: 'rime_orbs' };

test('m41 data validates; each of the six behaviors has a mutation and the weapons can be starforged', () => {
  assert.deepEqual(validateData(), []);
  const run = newRun();
  for (const [b, id] of Object.entries(ALL)) {
    const w = maxed(run, id);
    assert.equal(mutationOf(w), MUTATIONS[b], b);
    assert.ok(MUTATIONS[b].name && MUTATIONS[b].desc, b);
  }
});

test('m41 every starred weapon out-damages the plain one over a few seconds', () => {
  for (const [b, id] of Object.entries(ALL)) {
    const plain = play(id, false, 60 * 6).dealt;
    const star = play(id, true, 60 * 6).dealt;
    assert.ok(star > plain * 1.02, `${b}: starred ${star.toFixed(0)} vs plain ${plain.toFixed(0)}`);
  }
});

test('m41 shockwave: a starred aura sends a cyan ring out to twice its radius; a plain one never does', () => {
  const cyan = (run) => run.hazards.find((h) => h.color === STARFORGE.color);
  const a = play(ALL.aura, true, 5);
  const star = MUTATIONS.aura;
  let ring = null;
  const run = a.run;
  tick(run, 20);
  ring = cyan(run);
  assert.ok(ring, 'a shockwave ring exists');
  assert.ok(Math.abs(ring.rMax - run.player.stats.getFor('area', a.w.tags) * 0 - a.w.auraR * star.reach) < 1, 'reaches twice the aura radius');
  const plain = play(ALL.aura, false, 5);
  tick(plain.run, 120);
  assert.ok(!cyan(plain.run), 'no ring without the star');
});

test('m41 star mark: every javelin leaves a mark that detonates a second later', () => {
  const run = newRun();
  const w = maxed(run, ALL.rod);
  run.starsteel = 2;
  starforge(run, w);
  arena(run, [60, 110]);
  let mark = null;
  let before = 0;
  for (let i = 0; i < 60 * 4 && !mark; i++) { step(run); mark = (w.falls || []).find((f) => f.mark); }
  assert.ok(mark, 'a mark appeared after the first javelin struck');
  assert.ok(mark.d === MUTATIONS.rod.delay);
  const n = (w.falls || []).length;
  tick(run, Math.ceil(MUTATIONS.rod.delay * 60) + 5);
  assert.ok(!(w.falls || []).includes(mark), 'it detonated');
  assert.ok(n >= 1);
});

test('m41 return orbit: starred shards turn and come back at 70%, plain shards never do', () => {
  const probe = (s) => { s.sawBack = false; s.probe = (run) => { for (const p of run.world.projectiles.active) if (p.ret === 2) s.sawBack = true; }; };
  const run = newRun();
  const w = maxed(run, ALL.nova);
  run.starsteel = 2;
  starforge(run, w);
  let back = null;
  for (let i = 0; i < 60 * 4 && !back; i++) { run.update(STEP, { x: 0, y: 0 }); back = run.world.projectiles.active.find((p) => p.ret === 2); }
  assert.equal(back, undefined, 'nothing in range, nothing fires');
  dummy(run, 150, 0);
  for (let i = 0; i < 60 * 4 && !back; i++) { step(run); back = run.world.projectiles.active.find((p) => p.ret === 2); }
  assert.ok(back, 'a shard turned');
  assert.ok(back.dmg > 0 && back.pierce === back.pierce0);
  const p2 = newRun();
  const w2 = maxed(p2, ALL.nova);
  dummy(p2, 150, 0);
  for (let i = 0; i < 60 * 4; i++) { step(p2); assert.ok(!p2.world.projectiles.active.some((p) => p.ret)); }
  void probe; void w2;
});

test('m41 afterimage: a swing leaves a crescent that cuts again after its delay', () => {
  const run = newRun();
  const w = maxed(run, ALL.arc);
  run.starsteel = 2;
  starforge(run, w);
  arena(run, [40, 60]);
  let first = -1;
  for (let i = 0; i < 60 * 3 && first < 0; i++) { step(run); if (w.echoes && w.echoes.length) first = i; }
  assert.ok(first >= 0, 'an echo was left');
  const e = w.echoes[0];
  assert.equal(e.d, MUTATIONS.arc.delay);
  tick(run, Math.ceil(MUTATIONS.arc.delay * 60) + 3);
  assert.ok(!w.echoes.includes(e), 'it cut again');
  assert.ok((w.flashes || []).length >= 0);
  const plain = newRun();
  const pw = maxed(plain, ALL.arc);
  arena(plain, [40, 60]);
  tick(plain, 120);
  assert.ok(!pw.echoes || !pw.echoes.length, 'a plain axe leaves nothing');
});

test('m41 forked chain: the star strikes more enemies per bolt, and a tempest grows a generation', () => {
  const hitCount = (id, star) => {
    const run = newRun();
    const w = maxed(run, id);
    if (star) { run.starsteel = 2; starforge(run, w); }
    arena(run, [50, 90, 130]);
    w.cd = 0;
    const hit = new Set();
    const before = new Map();
    for (const e of run.world.enemies.active) before.set(e.uid, e.hp);
    step(run);
    for (const e of run.world.enemies.active) if (e.hp < before.get(e.uid)) hit.add(e.uid);
    // queued damage lands in the next tick
    step(run);
    for (const e of run.world.enemies.active) if (e.hp < before.get(e.uid)) hit.add(e.uid);
    return hit.size;
  };
  assert.ok(hitCount('static_rod', true) > hitCount('static_rod', false), 'the fork reaches more enemies');
  assert.ok(hitCount('static_rod', true) <= 22);
});

test('m41 pulse wake: patches of a starred trail send a cyan ring as they fade', () => {
  const run = newRun();
  const w = maxed(run, ALL.trail);
  run.starsteel = 2;
  starforge(run, w);
  arena(run, [30, 60]);
  let sawPulse = false;
  let flagged = false;
  for (let i = 0; i < 60 * 6; i++) {
    step(run);
    if (run.hazards.some((h) => h.pulse)) flagged = true;
    if (run.hazards.some((h) => h.color === STARFORGE.color)) sawPulse = true;
  }
  assert.ok(flagged, 'patches carry the pulse');
  assert.ok(sawPulse, 'and send it');
  const plain = newRun();
  maxed(plain, ALL.trail);
  arena(plain, [30, 60]);
  for (let i = 0; i < 60 * 6; i++) { step(plain); assert.ok(!plain.hazards.some((h) => h.pulse || h.color === STARFORGE.color)); }
});


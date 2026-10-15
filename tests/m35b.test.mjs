// M35b: graft payload audit. The Saws payload was nearly invisible (a 0.27 s yellow dash, ~4% of a slam's
// damage); it is now two real hopping saw discs. Shards got the same visual treatment.
// tools/payload-audit.mjs measures every payload's share of the damage dealt.

import { test, assert } from './harness.mjs';
import { createRun } from '../src/game/run.js';
import { spawnEnemy } from '../src/game/director.js';
import { addWeapon } from '../src/game/weapons.js';
import { PAYLOAD_FX } from '../src/effects/payloads.js';
import { PAYLOADS } from '../src/data/grafts.js';
import { VERSION } from '../src/version.js';

const STEP = 1 / 60;

function crowd(hostId, payload, ticks, pin = true) {
  const run = createRun({ seed: 5, view: { w: 480, h: 1040 }, debug: { god: true }, classId: 'smith' });
  run.player.weapons.length = 0;
  run.director.update = () => {};
  const h = addWeapon(run, hostId);
  if (payload) h.graft = { id: 'echo', name: 't', desc: '', donorId: 'x', tags: [], triggers: [], payload, elements: [], light: false, hooks: {} };
  const homes = [];
  for (let k = 0; k < 14; k++) {
    const a = k * 0.9;
    const r = 40 + k * 14;
    const e = spawnEnemy(run, 'goblin', Math.cos(a) * r, Math.sin(a) * r);
    e.speed = 0; e.hp = e.maxHp = 1e9;
    homes.push([e, e.x, e.y]);
  }
  for (let i = 0; i < ticks; i++) {
    run.update(STEP, { x: 0, y: 0 });
    if (pin) for (const [e, x, y] of homes) { e.x = x; e.y = y; e.kx = e.ky = 0; }
  }
  return run;
}

test('m35b: the Saws payload throws two spinning discs that hop between different enemies', () => {
  const run = crowd('quakebreaker', null, 1);
  const target = run.world.enemies.active[5];
  const before = run.world.projectiles.count;
  PAYLOAD_FX.saw(run, run.player.weapons[0], target, 10);
  const discs = run.world.projectiles.active.slice(before);
  assert.equal(discs.length, 2);
  for (const d of discs) {
    assert.equal(d.look, 1, 'drawn as a saw disc');
    assert.ok(d.bounce >= 3, 'hops');
    assert.equal(d.depth, 1, 'its hits never start another payload');
  }
  const hit = new Set();
  const origQueue = run.world.dmg;
  for (let i = 0; i < 90; i++) {
    run.update(STEP, { x: 0, y: 0 });
    for (const p of run.world.projectiles.active) for (let k = 0; k < Math.min(p.nh, 16); k++) hit.add(p.hits[k]);
  }
  assert.ok(hit.size >= 4, `the saws cut ${hit.size} different enemies`);
  assert.ok(origQueue);
});

test('m35b: Shards are drawn as shards (look 2) and pierce', () => {
  const run = crowd('quakebreaker', null, 1);
  const before = run.world.projectiles.count;
  PAYLOAD_FX.burst(run, run.player.weapons[0], run.world.enemies.active[3], 10);
  const shards = run.world.projectiles.active.slice(before);
  assert.equal(shards.length, 6);
  assert.ok(shards.every((s) => s.look === 2 && s.pierce >= 1));
});

test('m35b: a payload shot never leaves a stale look on a reused projectile', () => {
  const run = crowd('quakebreaker', 'saw', 60 * 4);
  for (const p of run.world.projectiles.active) assert.ok(p.look === 1 || p.look === 0 || p.look === 2);
  const w = run.world.projectiles;
  for (const p of [...w.active]) w.release(p);
  const e = run.world.enemies.active[0];
  PAYLOAD_FX.saw(run, run.player.weapons[0], e, 1);
  PAYLOAD_FX.shrapnel(run, run.player.weapons[0], e, 1);
  assert.ok(run.world.projectiles.active.some((p) => p.look === 0), 'shrapnel is still a plain streak');
});

test('m35b: audit: on a slam host the Saws payload adds a real share of the damage (it used to add about 4%)', () => {
  const on = crowd('quakebreaker', 'saw', 60 * 12).stats.total;
  const off = crowd('quakebreaker', null, 60 * 12).stats.total;
  const share = (on - off) / on;
  assert.ok(share > 0.15 && share < 0.45, `saw share ${share.toFixed(2)}`);
});

test('m35b: audit: every generic payload adds at least 10% on a slam host, and none more than half', () => {
  const off = crowd('quakebreaker', null, 60 * 10).stats.total;
  for (const id of Object.keys(PAYLOADS)) {
    const on = crowd('quakebreaker', id, 60 * 10).stats.total;
    const share = (on - off) / on;
    assert.ok(share > 0.10 && share < 0.5, `${id}: ${share.toFixed(2)}`);
  }
  assert.ok(/^0\.(35\.[1-9]|3[6-9]|[4-9]\d)/.test(VERSION), VERSION);
});

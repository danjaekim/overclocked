// M33b: the masterwork review (docs/design-m30-m33.md §6.2). Every masterwork still works on the new
// shapes, and the ones retuned in the review do what their text now says.

import { test, assert } from './harness.mjs';
import { createRun } from '../src/game/run.js';
import { spawnEnemy } from '../src/game/director.js';
import { addWeapon, levelUpWeapon, canLevelUp } from '../src/game/weapons.js';
import { graft } from '../src/game/graft.js';
import { MASTERWORKS } from '../src/data/grafts.js';
import { WEAPONS } from '../src/data/weapons.js';
import { buildEntries } from '../src/game/compendium.js';
import { PERKS } from '../src/data/perks.js';
import { VERSION } from '../src/version.js';

const STEP = 1 / 60;
const newRun = () => {
  const run = createRun({ seed: 3, view: { w: 480, h: 1040 }, debug: { god: true }, classId: 'archer' });
  run.player.stats.removeBySource(`weapon:${run.player.weapons[0].instanceId}:`);
  run.player.weapons.length = 0;
  run.director.update = () => {};
  run.starsteel = 3;
  return run;
};
const tick = (run, s) => { for (let i = 0; i < Math.round(s / STEP); i++) run.update(STEP, { x: 0, y: 0 }); };
const crowd = (run, n = 30) => {
  const out = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const d = 70 + (i % 4) * 35;
    const e = spawnEnemy(run, 'goblin', Math.cos(a) * d, Math.sin(a) * d);
    e.hp = e.maxHp = 1e9; e.speed = 0;
    out.push(e);
  }
  return out;
};
const make = (m) => {
  const run = newRun();
  const h = addWeapon(run, m.host);
  while (h.level < 4 && canLevelUp(h)) levelUpWeapon(run, h);
  const d = addWeapon(run, m.donor);
  const r = graft(run, h, d);
  assert.ok(r.ok && r.masterwork && r.masterwork.id === m.id, m.id);
  return { run, h };
};

test('version bumped', () => assert.ok(/^0\.(3[3-9]|[4-9]\d)\.([1-9]|\d\d)/.test(VERSION), VERSION));

test('every masterwork grafts, runs 6 s in a crowd, and deals more than its host alone', () => {
  for (const m of MASTERWORKS) {
    const alone = newRun();
    const a = addWeapon(alone, m.host);
    while (a.level < 4 && canLevelUp(a)) levelUpWeapon(alone, a);
    crowd(alone);
    tick(alone, 6);
    const { run } = make(m);
    crowd(run);
    tick(run, 6);
    assert.ok(Number.isFinite(run.stats.total) && run.stats.total > alone.stats.total, `${m.id}: ${Math.round(run.stats.total)} vs ${Math.round(alone.stats.total)}`);
    assert.ok(run.hazards.length <= 90);
  }
});

test('Sanctum Titan: the colossus sends out blessing rings of light (the Radiant Pulse it carries)', () => {
  const m = MASTERWORKS.find((x) => x.id === 'sanctum_titan');
  assert.ok(m.hooks.minionPulse && !m.hooks.minionAura);
  const { run } = make(m);
  const es = crowd(run);
  let rings = 0;
  for (let i = 0; i < 180; i++) { run.update(STEP, { x: 0, y: 0 }); rings = Math.max(rings, run.hazards.filter((h) => h.kind === 6).length); }
  assert.ok(rings >= 1, 'a ring went out');
  assert.ok(es.some((e) => e.blessT > 0), 'and blessed what it passed');
});

test('Comet bursts its ice shards at the last enemy the arrow pierced, not off-screen', () => {
  const m = MASTERWORKS.find((x) => x.id === 'comet');
  const { run, h } = make(m);
  h.cd = 1e9;
  const e = spawnEnemy(run, 'goblin', 150, 0); e.hp = e.maxHp = 1e9; e.speed = 0;
  tick(run, 0.05);
  h.cd = 0;
  let shards = [];
  for (let i = 0; i < 90 && !shards.length; i++) {
    run.update(STEP, { x: 0, y: 0 });
    shards = run.world.projectiles.active.filter((p) => p.sub);
  }
  assert.ok(shards.length >= 8, 'the ring of shards');
  assert.ok(shards.every((p) => Math.hypot(p.x - 150, p.y) < 40), 'around the enemy it struck');
  assert.ok(shards.every((p) => p.depth === 1), 'shards never set off the arrow\'s own shatter');
});

test('Familiars: each hound bolt strikes two enemies', () => {
  const m = MASTERWORKS.find((x) => x.id === 'familiars');
  assert.equal(m.hooks.familiars.targets, 2);
  const { run, h } = make(m);
  h.cd = 1e9;                                              // only the hounds cast
  const a = spawnEnemy(run, 'goblin', 120, 0); a.hp = a.maxHp = 1e9; a.speed = 0;
  const b = spawnEnemy(run, 'goblin', 170, 0); b.hp = b.maxHp = 1e9; b.speed = 0;
  tick(run, 2.5);
  assert.ok(a.hp < a.maxHp && b.hp < b.maxHp);
});

test('Bladestorm flings blades on every spin; Hellhounds wear a wider aura', () => {
  assert.equal(MASTERWORKS.find((x) => x.id === 'bladestorm').triggers[0].every, undefined);
  assert.ok(MASTERWORKS.find((x) => x.id === 'hellhounds').hooks.minionAura.radius >= 46);
});

test('text: Echo Strike mentions slams; the Grafts tab names the new shapes; masterwork text mentions no arc for the slam hosts', () => {
  assert.match(PERKS.echo_strike.desc, /slam/);
  const gm = MASTERWORKS.find((x) => x.id === 'glacier_maul');
  assert.ok(!/arc\b/.test(gm.desc) && WEAPONS[gm.host].behavior === 'slam');
  const lines = buildEntries({ grafts: MASTERWORKS.map((x) => x.id) }).filter((e) => e.tab === 'grafts').flatMap((e) => e.lines).join(' ');
  assert.match(lines, /Planted rod/);
  assert.match(lines, /Slam/);
});

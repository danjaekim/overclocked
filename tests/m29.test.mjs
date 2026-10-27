// M29: build-agnostic crowd control: Chain Reaction, Forked Strikes, Broad Strokes, and a Shatter
// that no longer needs a frost weapon.

import { test, assert, approx } from './harness.mjs';
import { createRun } from '../src/game/run.js';
import { spawnEnemy } from '../src/game/director.js';
import { addPerk, levelUpPerk, findPerk } from '../src/game/perks.js';
import { queueDamage, KIND_HIT, KIND_PROC } from '../src/systems/damage-queue.js';
import { flushDamage } from '../src/systems/damage.js';
import { validateData } from '../src/data/validate.js';
import { ST } from '../src/data/statuses.js';

const setup = () => {
  const run = createRun({ seed: 9, view: { w: 480, h: 1040 }, debug: { god: true }, classId: 'archer' });
  run.director.update = () => {};
  const w = run.player.weapons[0];
  run.player.stats.removeBySource(`weapon:${w.instanceId}:base:`);
  w.cd = 1e9;
  return { run, w };
};
const dummy = (run, x, y, hp = 1e9) => { const e = spawnEnemy(run, 'goblin', x, y); e.speed = 0; e.hp = e.maxHp = hp; return e; };
const rehash = (run) => run.world.hash.rebuild(run.world.enemies.active, run.world.enemies.count);
const own = (run, id, level = 1) => { addPerk(run, id); for (let i = 1; i < level; i++) levelUpPerk(run, findPerk(run.player, id)); };
const dealt = (e) => e.maxHp - e.hp;

test('m29 data validates', () => assert.deepEqual(validateData(), []));

test('Chain Reaction: a kill bursts for a share of its max hp, and the burst can kill and burst again', () => {
  const { run, w } = setup();
  own(run, 'chain_reaction', 1);                       // 20%, radius 55
  const a = dummy(run, 300, 0, 100);
  const b = dummy(run, 330, 0, 15);                    // dies to a's burst (20)
  const c = dummy(run, 360, 0, 1000);                  // only b's burst reaches it
  const far = dummy(run, 600, 0, 1000);
  rehash(run);
  queueDamage(run, a, 500, false, 0, 0, 0, w, KIND_HIT);
  flushDamage(run);                                    // a dies
  flushDamage(run);                                    // a's burst kills b
  flushDamage(run);                                    // b's burst lands on c
  assert.ok(!a.alive && !b.alive);
  assert.ok(dealt(c) > 0);
  assert.equal(dealt(far), 0);
});

test('Chain Reaction does not fire without the perk, or from a boss', () => {
  const { run, w } = setup();
  const a = dummy(run, 300, 0, 10);
  const n = dummy(run, 320, 0);
  rehash(run);
  queueDamage(run, a, 500, false, 0, 0, 0, w, KIND_HIT);
  flushDamage(run); flushDamage(run);
  assert.equal(dealt(n), 0);
  own(run, 'chain_reaction', 3);
  const boss = spawnEnemy(run, 'warlord', 300, 200);
  boss.speed = 0;
  const n2 = dummy(run, 320, 200);
  rehash(run);
  boss.hp = 1;
  queueDamage(run, boss, 500, false, 0, 0, 0, w, KIND_HIT);
  flushDamage(run); flushDamage(run);
  assert.equal(dealt(n2), 0);
});

test('Forked Strikes: a direct hit forks to the nearest other enemy, plain damage and no shock', () => {
  const { run, w } = setup();
  own(run, 'forked_strikes', 1);
  run.rules.fork = { ...run.rules.fork, chance: 1 };
  const a = dummy(run, 300, 0);
  const b = dummy(run, 330, 0);
  rehash(run);
  queueDamage(run, a, 100, false, 0, 0, 0, w, KIND_HIT);
  flushDamage(run);
  flushDamage(run);
  approx(dealt(b), 50, 1e-6);
  assert.equal(b.status & ST.SHOCK, 0);
});

test('Forked Strikes only forks direct hits', () => {
  const { run, w } = setup();
  own(run, 'forked_strikes', 1);
  run.rules.fork = { ...run.rules.fork, chance: 1 };
  const a = dummy(run, 300, 0);
  const b = dummy(run, 330, 0);
  rehash(run);
  queueDamage(run, a, 100, false, 0, 0, 0, w, KIND_PROC);
  flushDamage(run); flushDamage(run);
  assert.equal(dealt(b), 0);
});

test('Broad Strokes adds area; Shatter is offered without a frost weapon and chills', () => {
  const { run } = setup();
  const before = run.player.stats.get('area');
  own(run, 'broad_strokes', 2);
  assert.ok(run.player.stats.get('area') > before);
  const before2 = run.player.stats.get('chillChance');
  own(run, 'shatter', 1);
  approx(run.player.stats.get('chillChance') - before2, 0.08, 1e-9);
});

// ---- fusions in the results summary and the run history -------------------------------------------
import { addWeapon } from '../src/game/weapons.js';
import { fuse } from '../src/game/fusion.js';
import { entryFromSummary, normalize } from '../src/save/save.js';



test('the results screen scrolls and keeps its buttons in a pinned bar', async () => {
  const { showResults } = await import('../src/ui/results.js');
  let html = '', cls = '';
  showResults({ show: (h, _f, c) => { html = h; cls = c; } }, { classId: 'smith', won: true, time: 600, kills: 1, level: 5, titles: [], seed: 1, stats: null, fusionList: [] }, { onAgain() {} });
  assert.equal(cls, 'results');
  assert.ok(/class="rbar"[\s\S]*data-act="again"/.test(html));
});

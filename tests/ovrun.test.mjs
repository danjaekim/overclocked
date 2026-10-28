// M4: the full run (game/ovrun.js), level-up offers, capacity, piece levels and chests (src/rig).

import { test, assert, approx } from './harness.mjs';
import { createRng } from '../src/core/rng.js';
import { createOverclockedRun, START_CHAIN } from '../src/game/ovrun.js';
import { applyRig, applyRigStats } from '../src/game/sandbox.js';
import { spawnShrine, updateShrines } from '../src/systems/shrines.js';
import { stockUp, buyItem, levelPrice, rerollPrice, describeItem } from '../src/rig/workbench.js';
import { spawnEnemy } from '../src/game/director.js';
import { queueDamage } from '../src/systems/damage-queue.js';
import { flushDamage } from '../src/systems/damage.js';
import { newRig, levelUp, addSlot, addChain, addEnergy, slotTarget, chainDefOf, owned, pieceLevel, placeSuggested } from '../src/rig/editor.js';
import { makeOffers, applyOffer, describeOffer, capacityOffers, pieceCandidates } from '../src/rig/offers.js';
import { openRigChest, chestCount } from '../src/rig/chests.js';
import { PIECES, RULES, MAX_LEVEL, MAX_CHAINS, DEFAULT_ENERGY } from '../src/rig/pieces.js';
import { rigHtml } from '../src/ui/results.js';
import { playRig } from '../tools/rigbench.mjs';

const VIEW = { w: 390, h: 844, insetTop: 0 };
const newRun = () => createOverclockedRun({ seed: 7, view: VIEW, debug: {}, sfx: () => {} });
const rigOf = (...chains) => newRig(chains.map((slots) => ({ rule: 'pulse', slots, size: 3 })));

test('a run starts with one Pulse chain of three slots holding a Blaster, and no class weapon or bonuses', () => {
  const run = newRun();
  assert.ok(run.rigRun && !run.sandbox);
  assert.equal(run.player.weapons.length, 0);
  assert.deepEqual(run.rigState.chains.map((c) => [c.rule, c.slots.length, c.slots.filter(Boolean)]), [['pulse', 3, ['blaster']]]);
  assert.deepEqual(START_CHAIN.slots, ['blaster']);
  assert.equal(run.rig.chains.length, 1);
  assert.equal(run.player.stats.get('maxHp'), 130);                        // the stat default plus the run's base
  assert.equal(run.player.hp, 130);
  assert.equal(run.player.stats.get('armor'), 0);                          // none of the Smith's class mods
  assert.equal(run.player.stats.get('oreGain'), 1);
  assert.equal(run.trait && Object.keys(run.trait).length, 0);
});

test('a run has shrines (the workbench), and the first chest is an elite chest', () => {
  const run = newRun();
  const sh = spawnShrine(run);
  assert.ok(sh && run.shrines.length === 1);
  assert.equal(spawnShrine(run), null, 'one shrine at a time');
  assert.ok(spawnShrine(run, 10, { x: 0, y: 0 }, true));
  run.player.x = sh.x; run.player.y = sh.y;
  for (let i = 0; i < 60; i++) updateShrines(run, 1 / 30);          // stand in it long enough
  assert.equal(run.forgeReady, true);
});

test('the workbench: stock, prices, buying a piece, a level and a rule card', () => {
  const r = rigOf(['blaster']);
  const stock = stockUp(createRng(4), r);
  assert.deepEqual(stock.map((i) => i.kind).sort(), ['level', 'piece', 'piece', 'rule']);
  assert.ok(stock.every((i) => i.price > 0));
  assert.deepEqual([2, 3, 4, 5].map(levelPrice), [30, 40, 50, 60]);
  assert.deepEqual([0, 1, 2].map(rerollPrice), [10, 20, 30]);
  const piece = stock.find((i) => i.kind === 'piece');
  const bought = buyItem(r, piece);
  assert.ok(owned(bought.rig).has(piece.id) && bought.placed);
  const lv = buyItem(r, { kind: 'level', id: 'blaster', to: 2 });
  assert.equal(pieceLevel(lv.rig, 'blaster'), 2);
  assert.equal(buyItem(rigOf(['blaster']), { kind: 'rule', rule: 'reaper' }, 0).rig.chains[0].rule, 'reaper');
  assert.equal(buyItem(rigOf(['blaster']), { kind: 'rule', rule: 'reaper' }, 3), null, 'no such chain');
  let full = rigOf(['blaster', 'nova', 'mortar'], ['scatter', 'flame', 'frost'], ['storm', 'heavy', 'echo'], ['pierce', 'on_impact', 'on_kill']);
  full.bench = ['slam', 'chain_bolt', 'on_hit'];
  assert.equal(buyItem(full, { kind: 'piece', id: 'every_3rd', price: 40 }), null, 'no room');
  assert.ok(describeItem(r, piece).title && describeItem(r, stock.find((i) => i.kind === 'rule')).desc);
});

test('ore is gold in a run: enemies drop it', () => {
  const run = newRun();
  let dropped = 0;
  for (let i = 0; i < 400; i++) {
    const e = spawnEnemy(run, 'brute', 300, 0);
    e.hp = 1;
    const before = run.world.pickups.count;
    queueDamage(run, e, 99, false, 0, 0, 0, null);
    flushDamage(run);
    dropped += run.world.pickups.count - before;
  }
  assert.ok(dropped > 0);
});

test('the rig a run built is on the summary, for the results screen', () => {
  const run = newRun();
  run.rigState = levelUp(run.rigState, 'blaster');
  const s = run.summary();
  assert.deepEqual(s.rig.chains[0].slots.filter(Boolean), ['blaster']);
  assert.deepEqual(s.rig.levels, { blaster: 2 });
  const html = rigHtml(s.rig);
  assert.ok(html.includes('Blaster') && html.includes('L2') && html.includes('Pulse'));
  assert.equal(rigHtml(null), '');
});

test('piece levels: all copies share a level, the maximum is 5, and a leveled piece powers its attack', () => {
  let r = rigOf(['blaster'], ['blaster']);
  for (let i = 0; i < 9; i++) r = levelUp(r, 'blaster');
  assert.equal(pieceLevel(r, 'blaster'), MAX_LEVEL);
  assert.equal(pieceLevel(r, 'nova'), 1);
  const defs = r.chains.map((_, c) => chainDefOf(r, c));
  assert.deepEqual(defs.map((d) => d.levels.blaster), [5, 5]);
});

test('capacity: a slot goes to the shortest chain up to 6, a chain up to 4, +3 energy per pick', () => {
  let r = rigOf(['blaster']);
  assert.equal(slotTarget(r), 0);
  for (let i = 0; i < 3; i++) r = addSlot(r, 0);
  assert.equal(r.chains[0].slots.length, 6);
  assert.equal(addSlot(r, 0), null);
  assert.equal(slotTarget(r), -1);
  r = addChain(r, 'reaper');
  assert.equal(r.chains[1].slots.length, 3);
  assert.equal(r.chains[1].rule, 'reaper');
  assert.equal(slotTarget(r), 1);
  r = addChain(addChain(r, 'spite'), 'anchor');
  assert.equal(r.chains.length, MAX_CHAINS);
  assert.equal(addChain(r, 'pulse'), null);
  assert.equal(addChain(rigOf(['blaster']), 'nope'), null);
  r = addEnergy(addEnergy(r, 1), 1);
  assert.equal(chainDefOf(r, 1).energy, DEFAULT_ENERGY + 6);
  assert.equal(chainDefOf(r, 0).energy, DEFAULT_ENERGY);
});

test('offers: a piece you own is offered as a level, a piece you lack as new, a maxed piece not at all', () => {
  let r = rigOf(['blaster']);
  const cands = pieceCandidates(r);
  assert.deepEqual(cands.find((c) => c.id === 'blaster'), { kind: 'level', id: 'blaster', to: 2 });
  assert.deepEqual(cands.find((c) => c.id === 'nova'), { kind: 'piece', id: 'nova' });
  for (let i = 0; i < 4; i++) r = levelUp(r, 'blaster');
  assert.ok(!pieceCandidates(r).some((c) => c.id === 'blaster'));
  assert.ok(!pieceCandidates(rigOf(['blaster']), ['nova']).some((c) => c.id === 'nova'), 'a banished piece is not offered');
});

test('offers: three cards, no repeats, about one in six a passive', () => {
  const r = rigOf(['blaster']);
  let stats = 0;
  let cards = 0;
  for (let i = 0; i < 400; i++) {
    const o = makeOffers(createRng(i), r);
    assert.equal(o.length, 3);
    const key = (c) => (c.kind === 'stat' ? 'stat:' + c.id : c.id);
    assert.equal(new Set(o.map(key)).size, 3);
    for (const c of o) { cards++; if (c.kind === 'stat') stats++; }
  }
  const share = stats / cards;
  assert.ok(share > 0.1 && share < 0.25, `passives were ${(share * 100).toFixed(0)}% of cards`);
});

test('offers: levels 5, 10, 15 and 20 give capacity cards instead', () => {
  const r = rigOf(['blaster']);
  const o = makeOffers(createRng(1), r, { capacity: true });
  assert.deepEqual(o.map((c) => c.cap).sort(), ['chain', 'energy', 'slot']);
  assert.ok(o.every((c) => c.kind === 'cap'));
  const full = addChain(addChain(addChain(rigOf(['blaster']), 'pulse'), 'pulse'), 'pulse');
  const maxed = [0, 1, 2, 3].reduce((x, c) => { while (x.chains[c].slots.length < 6) x = addSlot(x, c); return x; }, full);
  assert.deepEqual(capacityOffers(createRng(2), maxed).map((c) => c.cap), ['energy']);
});

test('applying a card: levels, passives and capacity change the rig; a piece card is the editor\'s job', () => {
  const r = rigOf(['blaster']);
  assert.equal(pieceLevel(applyOffer(r, { kind: 'level', id: 'blaster', to: 2 }), 'blaster'), 2);
  assert.equal(applyOffer(r, { kind: 'stat', id: 'hp' }).stats.hp, 1);
  assert.equal(applyOffer(r, { kind: 'cap', cap: 'slot', c: 0 }).chains[0].slots.length, 4);
  assert.equal(applyOffer(r, { kind: 'cap', cap: 'chain', rule: 'spite' }).chains.length, 2);
  assert.equal(applyOffer(r, { kind: 'cap', cap: 'energy', c: 0 }).chains[0].bonus, 3);
  assert.equal(applyOffer(r, { kind: 'piece', id: 'nova' }), null);
  for (const o of [{ kind: 'piece', id: 'nova' }, { kind: 'level', id: 'blaster', to: 2 }, { kind: 'stat', id: 'speed' }, { kind: 'cap', cap: 'chain', rule: 'anchor' }]) {
    const d = describeOffer(r, o);
    assert.ok(d.title && d.tag && d.desc, JSON.stringify(o));
  }
});

test('passives take effect as stat modifiers and are replaced, not stacked, each time the rig is applied', () => {
  const run = newRun();
  const hp0 = run.player.stats.get('maxHp');
  const v0 = run.player.stats.get('moveSpeed');
  run.rigState.stats = { hp: 2, speed: 1, magnet: 1, armor: 3 };
  applyRig(run);
  applyRig(run);
  approx(run.player.stats.get('maxHp'), hp0 + 30, 1e-9);
  approx(run.player.stats.get('moveSpeed'), v0 * 1.08, 1e-9);
  assert.equal(run.player.stats.get('armor'), 3);
  run.rigState.stats = {};
  applyRigStats(run);
  assert.equal(run.player.stats.get('maxHp'), hp0);
});

test('chests: 1, 3 or 5 rolls (the first elite chest at least 3, a boss chest always 5), deterministic for a seed', () => {
  const counts = new Set();
  for (let i = 0; i < 200; i++) counts.add(chestCount(createRng(i), 0));
  assert.deepEqual([...counts].sort(), [1, 3, 5]);
  for (let i = 0; i < 100; i++) assert.ok(chestCount(createRng(i), 0, true) >= 3);
  for (let i = 0; i < 50; i++) assert.equal(chestCount(createRng(i), 1), 5);
  const r = rigOf(['blaster']);
  const a = openRigChest(createRng(9), r, 1);
  const b = openRigChest(createRng(9), r, 1);
  assert.deepEqual(a.rolls.map((x) => x.title), b.rolls.map((x) => x.title));
});

test('chests: a boss chest always starts with capacity; every roll lands in the returned rig', () => {
  for (let i = 0; i < 60; i++) {
    const r = rigOf(['blaster']);
    const res = openRigChest(createRng(i), r, 1);
    assert.equal(res.rolls[0].kind, 'cap', `seed ${i}`);
    assert.equal(res.count, res.rolls.length);
    for (const roll of res.rolls) {
      assert.ok(['piece', 'level', 'cap'].includes(roll.kind));
      if (roll.kind === 'piece') assert.ok(owned(res.rig).has(roll.offer.id), 'the piece is in the rig');
    }
    const before = r.chains.reduce((n, c) => n + c.slots.length, 0) + r.chains.length * 100 + Object.keys(r.levels).length;
    const after = res.rig.chains.reduce((n, c) => n + c.slots.length, 0) + res.rig.chains.length * 100 + Object.keys(res.rig.levels).length;
    assert.ok(after >= before);
  }
});

test('chests: with the rig full, a piece roll only follows a roll that made room, never a lost piece', () => {
  let r = rigOf(['blaster', 'nova', 'mortar'], ['scatter', 'flame', 'frost'], ['storm', 'heavy', 'echo'], ['pierce', 'on_impact', 'on_kill']);
  r.bench = ['slam', 'chain_bolt', 'on_hit'];
  assert.equal(placeSuggested(r, 'every_3rd'), null);
  for (let i = 0; i < 40; i++) {
    const res = openRigChest(createRng(i), r, 0);
    res.rolls.forEach((x, k) => {                                      // a piece can only come once a roll made room for it
      if (x.kind === 'piece') assert.ok(res.rolls.slice(0, k).some((y) => y.kind === 'cap' && ['slot', 'chain'].includes(y.offer.cap)), `seed ${i} roll ${k}`);
    });
  }
});

test('the bench bot plays a full run without errors and the rig grows', () => {
  const r = playRig(3, { god: true });
  assert.ok(r.won && r.time >= 600, `ended at ${r.time}s`);
  assert.ok(r.level >= 6 && r.kills > 200);
  assert.ok(r.rig.weapon >= 1 && r.owned >= 2);
});

test('every rule card has a name, a description and a HUD label', () => {
  for (const [id, r] of Object.entries(RULES)) assert.ok(r.name && r.desc && r.short, id);
  for (const id of Object.keys(PIECES)) assert.ok(PIECES[id].icon && PIECES[id].short, id);
});

test('Spite heals you a little each time it fires, and a piece in several slots is one row in the damage breakdown', async () => {
  const { createRun } = await import('../src/game/run.js');
  const run = newRun();
  run.rigState = { ...run.rigState, chains: [...run.rigState.chains, { rule: 'spite', key: null, bonus: 0, slots: ['blaster', 'blaster', null] }] };
  applyRig(run);
  run.player.hp = 50;
  run.director.update = () => {};
  run.update(1 / 60, { x: 0, y: 0 });
  run.player.iframes = 0;
  const { damagePlayer } = await import('../src/systems/damage.js');
  damagePlayer(run, 5);
  const hp = run.player.hp;
  for (let i = 0; i < 6; i++) run.update(1 / 60, { x: 0, y: 0 });
  assert.ok(run.player.hp > hp, 'spite healed');
  const names = run.statsSnapshot().weapons.map((w) => w.name);
  assert.equal(new Set(names).size, names.length, 'one row per piece');
});

test('the compendium: reactions are found once and persist, a finished run keeps its rig in the history, and the screens render', async () => {
  const { createSave } = await import('../src/save/save.js');
  const { showCompendium } = await import('../src/ui/compendium.js');
  const m = new Map();
  const storage = { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, v) };
  const save = createSave(storage);
  assert.equal(save.discoverReaction('steam'), true);
  assert.equal(save.discoverReaction('steam'), false);
  assert.deepEqual(createSave(storage).data.discovered.reactions, ['steam']);
  const run = newRun();
  run.rigState = levelUp(run.rigState, 'blaster');
  run.over = true;
  save.recordRun(run.summary());
  const entry = save.data.history[save.data.history.length - 1];
  assert.deepEqual(entry.rig.chains[0].slots, ['blaster']);
  assert.equal(entry.rig.levels.blaster, 2);
  let html = '';
  const overlays = { show: (h) => { html = h; return null; } };
  for (const tab of ['how', 'pieces', 'rules', 'reactions', 'runs']) {
    let handler;
    showCompendium({ show: (h, fn) => { html = h; handler = fn; } }, { save, onBack: () => {} });
    handler(`tab:${tab}`);
    assert.ok(html.includes('Compendium') && html.length > 300, tab);
    if (tab === 'reactions') assert.ok(html.includes('Steam') && html.includes('???') && html.includes('1 of 9'));
    if (tab === 'runs') assert.ok(html.includes('Blaster'));
    if (tab === 'pieces') assert.ok(html.includes('Mortar') && html.includes('+1 copy'));
  }
});

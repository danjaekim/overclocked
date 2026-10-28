// M3: the rig editor's rules (src/rig/editor.js, offers.js, analyzeChain) and how the sandbox applies an edit.

import { test, assert } from './harness.mjs';
import { newRig, moveTo, placeSuggested, pieceAt, cloneRig, BENCH, SLOTS } from '../src/rig/editor.js';
import { makeOffers, offerWeights } from '../src/rig/offers.js';
import { analyzeChain, compileChain } from '../src/rig/chain.js';
import { TEST_CHAINS } from '../src/rig/presets.js';
import { PIECES } from '../src/rig/pieces.js';
import { createSandboxRun, applyRig, loadChain, chainKeys } from '../src/game/sandbox.js';
import { createRng } from '../src/core/rng.js';

const rigOf = (...chains) => newRig(chains.map((slots) => ({ rule: 'pulse', slots })));
const slotsOf = (rig, c = 0) => rig.chains[c].slots;
const S = (c, i) => ({ kind: 'slot', c, i });

test('a new rig has 6 slots per chain padded with empties, and a bench of 3', () => {
  const r = rigOf(['mortar'], []);
  assert.equal(slotsOf(r).length, SLOTS);
  assert.deepEqual(slotsOf(r), ['mortar', null, null, null, null, null]);
  assert.equal(r.bench.length, BENCH);
});

test('moving a piece onto an empty slot moves it; onto a piece swaps; the old rig is untouched', () => {
  const r = rigOf(['flame', 'mortar'], ['blaster']);
  const a = moveTo(r, S(0, 0), S(0, 3));
  assert.deepEqual(slotsOf(a).slice(0, 4), [null, 'mortar', null, 'flame']);
  const b = moveTo(r, S(0, 0), S(0, 1));
  assert.deepEqual(slotsOf(b).slice(0, 2), ['mortar', 'flame']);
  const c = moveTo(r, S(0, 1), { kind: 'bench', i: 2 });
  assert.equal(c.bench[2], 'mortar');
  assert.equal(slotsOf(c)[1], null);
  assert.deepEqual(slotsOf(r).slice(0, 2), ['flame', 'mortar']);
  assert.equal(moveTo(r, S(0, 4), S(0, 5)), null, 'nothing to move');
  assert.equal(moveTo(r, S(0, 0), S(0, 0)), null);
});

test('across chains and the bench, pieces swap places', () => {
  const r = rigOf(['mortar'], ['nova']);
  const m = moveTo(r, S(0, 0), S(1, 0));
  assert.equal(pieceAt(m, S(0, 0)), 'nova');
  assert.equal(pieceAt(m, S(1, 0)), 'mortar');
});

test('inserting at a gap pushes the pieces to its right along, or left when the right is full', () => {
  const r = rigOf(['flame', 'mortar', 'on_kill'], ['blaster']);
  const a = moveTo(r, S(1, 0), { kind: 'gap', c: 0, i: 1 });
  assert.deepEqual(slotsOf(a).slice(0, 4), ['flame', 'blaster', 'mortar', 'on_kill']);
  assert.equal(slotsOf(a, 1).every((x) => x === null), true);
  const full = rigOf(['flame', 'frost', 'mortar', 'nova', 'blaster', 'scatter'], ['on_kill']);
  assert.equal(moveTo(full, S(1, 0), { kind: 'gap', c: 0, i: 2 }), null, 'a full chain has no room');
  const rightFull = rigOf([null, 'flame', 'frost', 'mortar', 'nova', 'blaster'], ['on_kill']);
  const l = moveTo(rightFull, S(1, 0), { kind: 'gap', c: 0, i: 5 });
  assert.deepEqual(slotsOf(l), ['flame', 'frost', 'mortar', 'nova', 'on_kill', 'blaster']);
  const within = moveTo(rigOf(['mortar', 'flame', null]), S(0, 1), { kind: 'gap', c: 0, i: 0 });
  assert.deepEqual(slotsOf(within).slice(0, 3), ['flame', 'mortar', null]);
});

test('suggested slots: weapons at the end, a modifier before a bare weapon, a trigger in a chain that lacks one', () => {
  const r = rigOf(['mortar'], ['blaster', 'on_kill', 'nova']);
  const w = placeSuggested(r, 'nova');
  assert.deepEqual(w.loc, S(0, 1));
  const m = placeSuggested(r, 'flame');
  assert.deepEqual(m.loc, S(0, 0));
  assert.deepEqual(slotsOf(m.rig).slice(0, 2), ['flame', 'mortar']);
  const t = placeSuggested(r, 'on_impact');
  assert.deepEqual(t.loc, S(0, 1));
  assert.equal(r.chains[0].slots[1], null, 'the old rig is untouched');
});

test('suggested slots fall back to the bench, and to nothing when everything is full', () => {
  const full = newRig([{ rule: 'pulse', slots: ['mortar', 'nova', 'blaster', 'flame', 'frost', 'scatter'] }]);
  const b = placeSuggested(full, 'flame');
  assert.deepEqual(b.loc, { kind: 'bench', i: 0 });
  const jam = cloneRig(full);
  jam.bench = ['flame', 'flame', 'flame'];
  assert.equal(placeSuggested(jam, 'nova'), null);
});

test('analyze: a line that says what the chain does, with its cost, and a reason for each greyed slot', () => {
  const a = analyzeChain({ rule: 'pulse', slots: TEST_CHAINS.cluster_mortar.slots, energy: 10 });
  assert.equal(a.text, 'Every 1 s: Flame Mortar, on impact: 5× Nova (cost 9 of 10)');
  assert.equal(a.reasons.size, 0);
  const n = analyzeChain({ rule: 'pulse', slots: ['frost', 'flame', 'nova'] });
  assert.ok(n.text.includes('Frost Flame Nova [Shatter]'));
  const bad = analyzeChain({ rule: 'pulse', slots: ['on_impact', 'nova', null] });
  assert.equal(bad.reasons.get(0), 'no weapon before this trigger');
  assert.ok(bad.text.includes('nothing to run yet'));
  assert.equal(analyzeChain({ rule: 'stride', slots: [] }).text, 'Every 0.5 s while moving: nothing to run yet (cost 0 of 12)');
});

test('analyze: pieces beyond the energy pool are greyed as out of energy', () => {
  const a = analyzeChain({ rule: 'pulse', slots: ['mortar', 'mortar', 'mortar', 'mortar', null, null], energy: 10 });
  assert.equal(a.cost, 12, 'cost is the whole chain, whether or not the battery covers it');
  assert.equal(a.reasons.get(3), 'out of energy');
  assert.equal(a.reasons.has(2), false);
  const p = analyzeChain({ rule: 'pulse', slots: ['mortar', 'on_kill', 'nova', 'on_kill', 'nova', 'nova'], energy: 10 });
  assert.equal(p.cost, 11);                                  // 3 + 1 + 2 + 1 + 2 + 2 (a payload piece costs 1 less); the last Nova needs 2 with 1 left
  assert.equal(p.reasons.get(5), 'out of energy');
  assert.equal(p.reasons.has(4), false);
  assert.equal(p.reasons.has(2), false);
});

test('analyze: a weapon that costs more than the whole battery is greyed with the numbers, not just "out of energy"', () => {
  const a = analyzeChain({ rule: 'pulse', slots: ['scatter', 'echo', 'storm', 'slam'], energy: 12, quirk: { costAdd: 1 } });
  assert.equal(a.cost, 13);
  assert.match(a.reasons.get(3), /costs 13, the battery holds 12/);
  assert.match(a.reasons.get(0), /costs 13/, 'its modifiers are greyed too');
});

test('empty slots are skipped by the compiler and keep their positions', () => {
  const c = compileChain({ rule: 'pulse', slots: [null, 'flame', null, 'mortar', null, 'on_impact'] });
  assert.equal(c.nodes[0].idx, 3);
  assert.deepEqual(c.nodes[0].modIdx, [1]);
  assert.equal(c.nodes[0].trigger.idx, 5);
  assert.deepEqual(c.problems, []);
});

test('offers: three different pieces; a rig with a weapon and no trigger leans toward triggers', () => {
  const rng = createRng(3);
  const r = rigOf(['mortar']);
  const o = makeOffers(rng, r).filter((c) => c.kind !== 'stat');
  assert.ok(o.length >= 2);
  assert.equal(new Set(o.map((c) => c.id)).size, o.length);
  assert.ok(o.every((c) => PIECES[c.id]));
  const w = offerWeights(r);
  assert.ok(w.on_impact > w.nova && w.flame > w.nova);
  let triggers = 0;
  for (let i = 0; i < 300; i++) if (makeOffers(createRng(i), r).some((c) => c.kind === 'piece' && PIECES[c.id].type === 'trigger')) triggers++;
  assert.ok(triggers > 200, `offered a trigger in ${triggers} of 300`);
  const empty = offerWeights(rigOf([]));
  assert.ok(empty.mortar > empty.flame);
});

test('applying an edit rebuilds the live rig; an edited chain stops carrying its test chain name', () => {
  const run = createSandboxRun({ seed: 5, view: { w: 480, h: 1040 }, debug: {}, sfx: () => {} });
  const st = cloneRig(run.rigState);
  const next = moveTo(st, S(1, 0), { kind: 'gap', c: 1, i: 3 });
  run.rigState = next;
  applyRig(run);
  assert.equal(run.rig.chains[1].def.slots[3], 'blaster');
  assert.deepEqual(chainKeys(run), ['cluster_mortar', null]);
  loadChain(run, 1, 'kill_chain');
  assert.deepEqual(chainKeys(run), ['cluster_mortar', 'kill_chain']);
  assert.deepEqual(run.rig.chains[1].def.slots, [...TEST_CHAINS.kill_chain.slots, null]);
});

test('the default energy pool is 12: the spec example uses 9 of it and a full six slots fit', () => {
  const a = analyzeChain({ rule: 'pulse', slots: TEST_CHAINS.cluster_mortar.slots });
  assert.equal(a.energy, 12);
  assert.ok(a.text.endsWith('(cost 9 of 12)'));
  const full = analyzeChain({ rule: 'pulse', slots: ['scatter', 'flame', 'mortar', 'on_impact', 'scatter', 'nova'] });
  assert.equal(full.reasons.size, 0);
  assert.equal(full.cost, 11);
});

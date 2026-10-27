// Compiles a chain (a rule card plus a list of piece ids) into the tree the rig runs. Pure: no engine,
// no randomness, so the evaluation rules can be tested and previewed without a run.
//
// The four rules (spec, "How a chain runs"):
//   1. Slots are read left to right.
//   2. A modifier is held and applies to the next weapon only. A trigger ends the hold.
//   3. A trigger attaches to the nearest weapon on its left; everything to its right is its payload.
//   4. Energy: see rig.js. The cost fields here are what the rig charges.
//
// compileChain(def) -> { rule, energy, nodes, problems }
//   node     { kind: 'weapon', piece, idx, mods: [piece ids], elements: [ids], reaction, scatter, echo, power, cost, trigger }
//   trigger  { piece, idx, on, every, cost, payload: [node] }
//   power    damage multiplier from piece levels (def.levels: { piece id: 1..5 }): +20% a level for the weapon,
//            for each modifier held for it, and for the trigger that leads to it
//   problems [{ idx, why }]: slots that can never run, for the editor to grey out

import { PIECES, REACTIONS, RULES, DEFAULT_ENERGY, SCATTER, EVERY, LEVEL_STEP } from './pieces.js';

const lvlMult = (levels, id) => 1 + LEVEL_STEP * (((levels && levels[id]) || 1) - 1);

export function compileChain(def) {
  const slots = def.slots;
  const problems = [];
  const nodes = parse(slots, 0, problems, def.levels || null, 1);
  return { rule: def.rule, energy: def.energy === undefined ? DEFAULT_ENERGY : def.energy, nodes, problems };
}

// Parses slots[start..] as one segment: the top level, or one payload.
function parse(slots, start, problems, levels, outer) {
  const nodes = [];
  let held = [];                              // modifiers waiting for a weapon: { id, idx }
  let last = null;                            // the nearest weapon so far in this segment
  for (let i = start; i < slots.length; i++) {
    const id = slots[i];
    if (id === null || id === undefined) continue;             // an empty slot
    const piece = PIECES[id];
    if (!piece) {
      problems.push({ idx: i, why: 'unknown piece' });
    } else if (piece.type === 'modifier') {
      held.push({ id, idx: i });
    } else if (piece.type === 'weapon') {
      last = makeNode(id, i, held, levels, outer);
      held = [];
      nodes.push(last);
    } else {                                  // trigger
      for (const h of held) problems.push({ idx: h.idx, why: 'no weapon after this modifier' });
      held = [];
      if (!last) {
        problems.push({ idx: i, why: 'no weapon before this trigger' });
        for (let k = i + 1; k < slots.length; k++) if (slots[k] !== null && slots[k] !== undefined) problems.push({ idx: k, why: 'follows a trigger that cannot run' });
        return nodes;
      }
      last.trigger = { piece: id, idx: i, on: piece.on, every: piece.on === 'every' ? EVERY : 0, cost: piece.cost, payload: parse(slots, i + 1, problems, levels, outer * lvlMult(levels, id)) };
      return nodes;                           // the rest of the slots belong to the payload
    }
  }
  for (const h of held) problems.push({ idx: h.idx, why: 'no weapon after this modifier' });
  return nodes;
}

function makeNode(id, idx, held, levels, outer) {
  const elements = [];
  let scatter = false;
  let echo = false;
  let cost = PIECES[id].cost;
  let power = outer * lvlMult(levels, id);
  for (const h of held) {
    const m = PIECES[h.id];
    cost += m.cost;
    power *= lvlMult(levels, h.id);
    if (m.scatter) scatter = true;
    if (m.echo) echo = true;
    if (m.element && !elements.includes(m.element)) elements.push(m.element);
  }
  const reaction = elements.length >= 2 ? REACTIONS[`${elements[0]}>${elements[1]}`] || null : null;
  return { kind: 'weapon', piece: id, idx, mods: held.map((h) => h.id), modIdx: held.map((h) => h.idx), elements, reaction, scatter, echo, power, cost, trigger: null };
}

// Energy the whole chain uses if every attack lands and every trigger fires once: the number the
// editor shows as "cost 9 of 10". Counting a payload once, however often it runs.
export function chainCost(nodes) {
  let c = 0;
  for (const n of nodes) {
    c += n.cost;
    if (n.trigger) c += n.trigger.cost + chainCost(n.trigger.payload);
  }
  return c;
}

export function ruleOf(id) {
  const r = RULES[id];
  if (!r) throw new Error(`Unknown rule card "${id}"`);
  return r;
}

// What the editor shows for a chain: one line saying what it does, its energy cost, and a reason for every
// slot that will not run (a compile problem, or "out of energy" counted as if each attack lands once).
//   analyzeChain(def) -> { text, cost, energy, reasons: Map(slot idx -> why) }
export function analyzeChain(def) {
  const c = compileChain(def);
  const reasons = new Map();
  for (const p of c.problems) if (!reasons.has(p.idx)) reasons.set(p.idx, p.why);
  let left = c.energy;
  let used = 0;
  const dry = (n) => {
    const stack = [n];
    while (stack.length) {
      const m = stack.pop();
      for (const i of [m.idx, ...m.modIdx]) reasons.set(i, 'out of energy');
      if (m.trigger) {
        reasons.set(m.trigger.idx, 'out of energy');
        stack.push(...m.trigger.payload);
      }
    }
  };
  const walk = (nodes) => {
    for (let i = 0; i < nodes.length; i++) {
      const n = nodes[i];
      if (n.cost > left) {
        for (let k = i; k < nodes.length; k++) dry(nodes[k]);
        return;
      }
      left -= n.cost;
      used += n.cost;
      if (!n.trigger) continue;
      if (n.trigger.cost > left) {
        reasons.set(n.trigger.idx, 'out of energy');
        for (const m of n.trigger.payload) dry(m);
        continue;
      }
      left -= n.trigger.cost;
      used += n.trigger.cost;
      walk(n.trigger.payload);
    }
  };
  walk(c.nodes);
  const rule = ruleOf(def.rule);
  const body = c.nodes.length ? describe(c.nodes) : 'nothing to run yet';
  return { text: `${rule.desc}: ${body} (cost ${used} of ${c.energy})`, cost: used, energy: c.energy, reasons };
}

const TRIGGER_WORDS = { impact: 'on impact', kill: 'on kill', hit: 'on every hit', every: `every ${EVERY}rd time` };
const REACTION_NAMES = { steam: 'Steam', shatter: 'Shatter' };

function describe(nodes) {
  return nodes.map((n) => {
    const mods = n.mods.filter((m) => m !== 'scatter').map((m) => PIECES[m].name);
    let t = `${n.scatter ? `${SCATTER.copies}\u00d7 ` : ''}${[...mods, PIECES[n.piece].name].join(' ')}`;
    if (n.reaction) t += ` [${REACTION_NAMES[n.reaction]}]`;
    if (n.trigger) t += `, ${TRIGGER_WORDS[n.trigger.on]}: ${n.trigger.payload.length ? describe(n.trigger.payload) : 'nothing'}`;
    return t;
  }).join(', then ');
}

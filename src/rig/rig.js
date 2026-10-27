// The rig at runtime: each chain owns hidden weapon instances (one per weapon piece), a rule-card timer
// and an energy pool, and runs the tree that rig/chain.js compiled. docs/overclocked-spec.md has the rules.
//
//   activation   the rule card fires: the pool refills and the top-level pieces run, left to right, from the player
//   payload      what sits right of a trigger. When the trigger's event happens the rig queues a payload run from
//                that point; it runs on the next tick, paying from the pool of the activation that fired the attack
//   energy       a piece is charged when it runs. A piece the pool cannot pay for does not run, and neither does
//                anything after it in its segment. This is the only thing that ends a chain reaction
//
// Attacks come from the behaviors' fire(inst, run, ctx) (game/fire-ctx.js). Events come back through
// inst.onRig, which the behaviors, collision and triggers.js call.

import { BEHAVIORS } from '../behaviors/index.js';
import { createRigWeapon, instanceTagSet } from '../game/weapons.js';
import { makeFireCtx } from '../game/fire-ctx.js';
import { PIECES, ELEMENTS, SCATTER, ECHO, CHAIN_COLORS } from './pieces.js';
import { compileChain, ruleOf } from './chain.js';
import { healPlayer } from '../systems/pickups.js';
import { reactOnHit } from './reactions.js';

const MAX_PAYLOADS_PER_TICK = 24;      // payload runs started per tick; the rest wait in the queue
const MAX_QUEUE = 256;                 // queued payload runs; further events are dropped
const PING_TIME = 0.4;                 // seconds a chain's ring stays on screen
const SOURCE = 'rig:';                 // stat modifier source prefix for everything the rig adds

const defs = new Map();                // piece id -> full weapon definition, built once

function weaponDef(id) {
  let d = defs.get(id);
  if (!d) {
    d = { maxLevel: 1, levels: [], triggers: [], baseMods: [], ...PIECES[id].def };
    defs.set(id, d);
  }
  return d;
}

// Builds the rig from chain definitions [{ rule, slots, energy? }] and installs it as run.rig, replacing any
// earlier one. `log: true` records what the rig does in rig.log, for tests.
export function installRig(run, chainDefs, { log = false } = {}) {
  removeRig(run);
  const rig = { chains: [], insts: [], queue: [], head: 0, actN: 0, pings: [], log: log ? [] : null, ctx: makeFireCtx(), atks: [], delayed: [], flags: { kill: false, hurt: false } };
  for (let i = 0; i < chainDefs.length; i++) rig.chains.push(buildChain(run, rig, chainDefs[i], i));
  run.rig = rig;
  return rig;
}

export function removeRig(run) {
  if (run.rig === null) return;
  run.player.stats.removeBySource(SOURCE);
  run.rig = null;                       // shots still in flight find the rig gone and set off nothing
}

function buildChain(run, rig, def, index) {
  const c = compileChain(def);
  const rule = ruleOf(def.rule);
  const chain = { index, def, rule, energy: c.energy, nodes: c.nodes, problems: c.problems, t: rule.on ? 0 : rule.first,
    act: null,                          // the latest activation: its pool is what the HUD's energy pips show
    flash: new Float64Array(def.slots.length).fill(-1e9) };   // run.time each slot last ran, for the HUD strip
  const stack = [...c.nodes];
  while (stack.length) {
    const node = stack.pop();
    node.inst = makeInstance(run, rig, node, chain);
    rig.insts.push(node.inst);
    if (node.trigger) for (const n of node.trigger.payload) stack.push(n);
  }
  return chain;
}

function makeInstance(run, rig, node, chain) {
  const inst = createRigWeapon(run, node.piece, weaponDef(node.piece));
  for (const el of node.elements) {
    const e = ELEMENTS[el];
    for (const m of e.mods) run.player.stats.add({ ...m, tags: [inst.instanceTag], source: `${SOURCE}${inst.instanceId}:` });
    inst.addTags.push(e.tag);
  }
  if (inst.addTags.length) inst.tags = instanceTagSet(inst);
  for (const id of node.mods) {                      // modifiers that are plain stat changes (Heavy, Pierce)
    const mods = PIECES[id].mods;
    if (mods) for (const m of mods) run.player.stats.add({ ...m, tags: [inst.instanceTag], source: `${SOURCE}${inst.instanceId}:` });
  }
  inst.reactAt = -1e9;
  node.count = 0;                                    // Every 3rd: how many times the cursor has reached it
  inst.onRig = (r, ev, atk, x, y, target, depth) => onEvent(r, rig, chain, node, inst, ev, atk, x, y, target, depth);
  return inst;
}

// An event from a piece's attack: queue the payload run if this node's trigger listens for it.
function onEvent(run, rig, chain, node, inst, ev, atk, x, y, target, depth) {
  if (run.rig !== rig) return;
  if (ev === 'hit') {                   // the node's own direct hits drive its element reaction
    if (node.reaction !== null && depth === 0 && target !== null) reactOnHit(run, node, inst, target);
  }
  const trig = node.trigger;
  if (trig === null || trig.on !== ev) return;
  if (ev === 'hit' && (depth !== 0 || target === null)) return;       // On Hit listens to direct hits only, so a blast does not feed it
  let act;
  if (ev === 'impact') {                // once per attack, at its first hit or landing
    if (atk === null || !atk.armed || atk.landed) return;
    atk.landed = true;
    act = atk.act;
  } else {                              // kill, hit
    if (!inst.rigArmed) return;
    act = inst.rigAct;
  }
  if (act === null || act.pool < 1 || rig.queue.length - rig.head >= MAX_QUEUE) return;
  rig.queue.push({ trig, act, x, y, chain });
}

function note(run, rig, ev, o) {
  if (rig.log !== null) rig.log.push({ t: run.time, ev, ...o });
}

// Runs one segment of nodes from (x, y), paying from act's pool. Stops at the first piece the pool cannot pay for.
function runNodes(run, rig, nodes, x, y, act) {
  const chains = rig.chains;
  for (let i = 0; i < nodes.length; i++) {
    const node = nodes[i];
    if (act.pool < node.cost) {
      note(run, rig, 'dry', { act: act.id, piece: node.piece, need: node.cost, pool: act.pool });
      return;
    }
    fireNode(run, rig, chains[act.chain], node, x, y, act);
  }
}

const TAU = Math.PI * 2;

// One launch of a node's weapon at (x, y): Scatter makes its copies. Leaves the attacks that carry an On Impact
// token in rig.atks. Returns how many copies fired.
function launch(run, rig, node, x, y, act, mult, armed) {
  const inst = node.inst;
  const behavior = BEHAVIORS[inst.def.behavior];
  const ctx = rig.ctx;
  const atks = rig.atks;
  atks.length = 0;
  const copies = node.scatter ? SCATTER.copies : 1;
  let fired = 0;
  for (let c = 0; c < copies; c++) {
    if (node.scatter) {
      const a = (c / copies) * TAU;
      ctx.x = x + Math.cos(a) * SCATTER.ring;
      ctx.y = y + Math.sin(a) * SCATTER.ring;
      ctx.da = (c - (copies - 1) / 2) * SCATTER.fan;
      ctx.mult = SCATTER.mult * mult;
    } else {
      ctx.x = x;
      ctx.y = y;
      ctx.da = 0;
      ctx.mult = mult;
    }
    const atk = node.trigger !== null && node.trigger.on === 'impact' ? { act, landed: false, armed } : null;
    ctx.atk = atk;
    if (!behavior.fire(inst, run, ctx)) continue;
    fired++;
    if (atk !== null) atks.push(atk);
  }
  return fired;
}

function fireNode(run, rig, chain, node, x, y, act) {
  const inst = node.inst;
  const mult = node.power * (node.echo ? ECHO.mult : 1);
  const armed = node.trigger !== null && act.pool - node.cost >= node.trigger.cost;     // the trigger is paid for if the attack fires (an impact can come in the same tick)
  const fired = launch(run, rig, node, x, y, act, mult, armed);
  if (fired === 0) {                    // nothing in range: no attack, no energy spent
    note(run, rig, 'skip', { act: act.id, piece: node.piece, pool: act.pool });
    return;
  }
  act.pool -= node.cost;
  act.spent += node.cost;
  inst.rigAct = act;
  if (armed) {
    act.pool -= node.trigger.cost;
    act.spent += node.trigger.cost;
  }
  inst.rigArmed = armed;
  if (node.echo) rig.delayed.push({ t: ECHO.delay, node, x, y, act, mult, armed });
  if (armed && node.trigger.on === 'every' && ++node.count % node.trigger.every === 0 && rig.queue.length - rig.head < MAX_QUEUE) {
    rig.queue.push({ trig: node.trigger, act, x: run.player.x, y: run.player.y, chain });   // Every 3rd: the payload runs from the player
  }
  chain.flash[node.idx] = run.time;
  if (rig.pings.length < 32) rig.pings.push({ x, y, t0: run.time, color: CHAIN_COLORS[chain.index % CHAIN_COLORS.length] });   // a ring where this chain's piece ran
  for (let i = 0; i < node.modIdx.length; i++) chain.flash[node.modIdx[i]] = run.time;
  if (armed) chain.flash[node.trigger.idx] = run.time;
  note(run, rig, 'fire', { act: act.id, piece: node.piece, mods: node.mods, copies: fired, x, y, armed, pool: act.pool });
}

function activate(run, rig, chain) {
  const act = { id: ++rig.actN, chain: chain.index, pool: chain.energy, spent: 0 };
  chain.act = act;
  note(run, rig, 'activate', { act: act.id, chain: chain.index, pool: act.pool });
  const p = run.player;
  runNodes(run, rig, chain.nodes, p.x, p.y, act);
}

// Step 3b of the tick (after the player's own weapons): rule-card timers, queued payloads, then the pieces' shells and shots.
export function updateRig(run, dt) {
  const rig = run.rig;
  const p = run.player;
  for (let i = 0; i < rig.chains.length; i++) {
    const chain = rig.chains[i];
    const rule = chain.rule;
    if (rule.on) {                                             // Reaper, Spite: an event starts it, at most once per `gap`
      if (chain.t > 0) chain.t -= dt;
      if (rig.flags[rule.on] && chain.t <= 0) {
        chain.t = rule.gap;
        if (rule.heal) healPlayer(run, rule.heal);
        activate(run, rig, chain);
      }
      continue;
    }
    if (rule.while === 'moving' && !p.moving) continue;
    if (rule.while === 'still' && p.moving) continue;
    chain.t -= dt;
    if (chain.t > 0) continue;
    chain.t += rule.every;
    if (chain.t <= 0) chain.t = rule.every;
    activate(run, rig, chain);
  }
  rig.flags.kill = rig.flags.hurt = false;

  const dl = rig.delayed;                                      // Echo: the second shot
  for (let i = dl.length - 1; i >= 0; i--) {
    const d = dl[i];
    d.t -= dt;
    if (d.t > 0) continue;
    dl.splice(i, 1);
    const fired = launch(run, rig, d.node, d.x, d.y, d.act, d.mult, d.armed);
    if (fired > 0) note(run, rig, 'echo', { act: d.act.id, piece: d.node.piece, copies: fired });
  }

  const q = rig.queue;
  for (let n = 0; rig.head < q.length && n < MAX_PAYLOADS_PER_TICK; n++) {
    const job = q[rig.head++];
    note(run, rig, 'payload', { act: job.act.id, trigger: job.trig.piece, x: job.x, y: job.y, pool: job.act.pool });
    job.chain.flash[job.trig.idx] = run.time;
    runNodes(run, rig, job.trig.payload, job.x, job.y, job.act);
  }
  if (rig.head >= q.length) {
    q.length = 0;
    rig.head = 0;
  }

  while (rig.pings.length && run.time - rig.pings[0].t0 > PING_TIME) rig.pings.shift();
  for (let i = 0; i < rig.insts.length; i++) {
    const inst = rig.insts[i];
    BEHAVIORS[inst.def.behavior].update(inst, dt, run);
  }
}

// Rule-card events from the rest of the game: an enemy died ('kill'), the player was hit ('hurt').
export function rigEvent(run, name) {
  if (run.rig !== null) run.rig.flags[name] = true;
}

export function drawRig(ctx, run) {
  const pings = run.rig.pings;
  ctx.lineWidth = 3;
  for (let i = 0; i < pings.length; i++) {
    const g = pings[i];
    const u = (run.time - g.t0) / PING_TIME;
    ctx.globalAlpha = 0.85 * (1 - u);
    ctx.strokeStyle = g.color;
    ctx.beginPath();
    ctx.arc(g.x, g.y, 14 + 26 * u, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
  const insts = run.rig.insts;
  for (let i = 0; i < insts.length; i++) {
    const b = BEHAVIORS[insts[i].def.behavior];
    if (b.draw) b.draw(insts[i], ctx, run);
  }
}

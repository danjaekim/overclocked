// The rig at runtime: each chain owns hidden weapon instances (one per weapon piece), a rule-card timer
// and a battery, and runs the tree that rig/chain.js compiled. docs/overclocked-spec.md has the rules.
//
//   battery      each chain's energy. It recharges at the chain's rate (only while moving or still, for some chassis)
//                up to its size, and starts full. Activations and their payloads spend it; nothing else refills it
//   activation   the rule card fires: the top-level pieces run, left to right, from the player
//   payload      what sits right of a trigger. When the trigger's event happens the rig queues a payload run from
//                that point; it runs on the next tick, paying from the battery of the chain that fired the attack
//   energy       a piece is charged when it runs. A piece the battery cannot pay for does not run, and neither does
//                anything after it in its segment. This is the only thing that ends a chain reaction
//
// Attacks come from the behaviors' fire(inst, run, ctx) (game/fire-ctx.js). Events come back through
// inst.onRig, which the behaviors, collision and triggers.js call.

import { BEHAVIORS } from '../behaviors/index.js';
import { createRigWeapon, instanceTagSet } from '../game/weapons.js';
import { makeFireCtx } from '../game/fire-ctx.js';
import { PALETTE } from '../data/palette.js';
import { PIECES, RULES, ELEMENTS, SCATTER, ECHO, CHAIN_COLORS, SUNDER, CASCADE_MAX } from './pieces.js';
import { compileChain, ruleOf } from './chain.js';
import { RELAY_ECHO } from './chassis.js';
import { passiveValues } from './passives.js';
import { addLabel } from '../render/fx.js';
import { reactOnHit, INTENSIFY, SUPERCONDUCT_CRIT } from './reactions.js';

const MAX_PAYLOADS_PER_TICK = 24;      // payload runs started per tick; the rest wait in the queue
const MAX_QUEUE = 256;                 // queued payload runs; further events are dropped
const PING_TIME = 0.4;                 // seconds a chain's ring stays on screen
const SOURCE = 'rig:';                 // stat modifier source prefix for everything the rig adds
const LOOP_DELAY = 0.35;               // Feedback loop: seconds between a chain's last payload and its repeat
const LOOP_MAX = 3;                    // repeats deep
const LOOP_POOL = 12;                  // a repeat's own energy, so it costs the chain nothing
const MINE = { every: 80, arm: 0.4, near: 50, life: 6, max: 16, power: 0.7 };    // Courier's Wake: px per mine, seconds to arm, trigger radius, lifetime, live mines, share of the weapon's power
const BRACE = 'pilot:brace';           // Bulwark's armor while braced (removed with the rig)

const defs = new Map();                // piece id -> full weapon definition, built once

function weaponDef(id) {
  let d = defs.get(id);
  if (!d) {
    d = { maxLevel: 1, levels: [], triggers: [], baseMods: [], ...PIECES[id].def };
    defs.set(id, d);
  }
  return d;
}

// Builds the rig from chain definitions [{ rule, slots, energy?, recharge?, chargeWhile?, quirk? }] (editor.js chainDefOf) and installs it as run.rig, replacing any
// earlier one. `log: true` records what the rig does in rig.log, for tests.
export function installRig(run, chainDefs, { log = false } = {}) {
  removeRig(run);
  const rig = { chains: [], insts: [], queue: [], head: 0, actN: 0, pings: [], log: log ? [] : null, ctx: makeFireCtx(), atks: [], delayed: [], echoes: [], loops: [], wake: wakeOf(run), wakeDist: 0, flags: { kill: false }, kills: 0 };
  for (let i = 0; i < chainDefs.length; i++) rig.chains.push(buildChain(run, rig, chainDefs[i], i));
  run.rig = rig;
  return rig;
}

// The weapons Courier's Wake drops as mines (rig.rewards, entries { id: 'wake', piece }).
const wakeOf = (run) => ((run.rigState && run.rigState.rewards) || []).filter((r) => r.id === 'wake').map((r) => r.piece);

// The compiled node of a weapon piece, wherever it sits (top level first, then payloads).
function findNode(rig, piece) {
  for (const deep of [false, true]) {
    for (const c of rig.chains) {
      const stack = [...c.nodes];
      while (stack.length) {
        const n = stack.shift();
        if (n.piece === piece) return n;
        if (deep && n.trigger) stack.push(...n.trigger.payload);
      }
    }
  }
  return null;
}

// Wake: every MINE.every px you move drops a mine per Wake weapon. Once armed, an enemy within MINE.near sets it off: the weapon
// (with the modifiers held for it) fires from the mine, free, at MINE.power. Mines are plain data on run.mines so a snapshot keeps them.
function updateMines(run, rig, dt, moved) {
  const mines = run.mines || (run.mines = []);
  if (rig.wake.length) {
    rig.wakeDist += moved;
    while (rig.wakeDist >= MINE.every) {
      rig.wakeDist -= MINE.every;
      for (const piece of rig.wake) {
        if (mines.length >= MINE.max) mines.shift();
        mines.push({ x: run.player.x, y: run.player.y, t: 0, piece });
      }
    }
  }
  for (let i = mines.length - 1; i >= 0; i--) {
    const m = mines[i];
    m.t += dt;
    if (m.t > MINE.life) { mines.splice(i, 1); continue; }
    if (m.t < MINE.arm) continue;
    if (!run.world.hash.queryNearest(m.x, m.y, MINE.near, (o) => o.alive && o.hp > 0)) continue;
    const node = findNode(rig, m.piece);
    mines.splice(i, 1);
    if (!node) continue;
    const act = { id: ++rig.actN, chain: 0, bat: rig.chains[0] ? rig.chains[0].bat : null, spent: 0, scale: 1, pool: 0, loopDepth: 9, looped: true, echo: true };
    if (launch(run, rig, node, m.x, m.y, act, node.power * MINE.power, false, 0) > 0) {
      note(run, rig, 'mine', { piece: m.piece, x: m.x, y: m.y });
      if (rig.pings.length < 32) rig.pings.push({ x: m.x, y: m.y, t0: run.time, color: CHAIN_COLORS[0], big: true });
    }
  }
}

export function removeRig(run) {
  if (run.rig === null) return;
  run.player.stats.removeBySource(SOURCE);
  run.player.stats.removeBySource(BRACE);
  run.rig = null;                       // shots still in flight find the rig gone and set off nothing
}

function buildChain(run, rig, def, index) {
  const c = compileChain(def);
  const rule = ruleOf(def.rule);
  const q = def.quirk || {};
  const pv = passiveValues(def.passives);
  const chain = { index, def, rule, pv, energy: c.energy, nodes: c.nodes, problems: c.problems, t: rule.on ? 0 : rule.first,
    bat: { pool: c.energy, size: c.energy, rate: c.recharge, while: def.chargeWhile || null, kill: (q.killCharge || 0) + pv.siphon, over: 0 },
    extra: (def.extra || []).filter((r) => RULES[r] && r !== def.rule).map((id) => { const r = ruleOf(id); return { id, rule: r, t: r.on ? 0 : r.first, dist: 0, idleT: 0 }; }),     // Retrofit: more rule cards
    loop: def.loop || 0,                // Feedback loop: the share of power each repeat keeps (0: none)
    act: null,                          // the latest activation
    flash: new Float64Array(def.slots.length).fill(-1e9) };   // run.time each slot last ran, for the HUD strip
  const mark = (nodes, trig) => {                        // On Kill cascade: every payload node can set the carrier's trigger off again
    for (const n of nodes) {
      if (trig !== null && n.cascadeOf === undefined) n.cascadeOf = trig;
      if (n.trigger) mark(n.trigger.payload, trig !== null ? trig : n.trigger.on === 'kill' ? n.trigger : null);
    }
  };
  for (const n of c.nodes) if (n.trigger) mark(n.trigger.payload, n.trigger.on === 'kill' ? n.trigger : null);
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
  for (const m of node.sigMods) run.player.stats.add({ ...m, tags: [inst.instanceTag], source: `${SOURCE}${inst.instanceId}:` });   // level 3 and 5 signature effects
  for (const m of node.ocMods) run.player.stats.add({ ...m, tags: [inst.instanceTag], source: `${SOURCE}${inst.instanceId}:` });   // Overcharge
  for (const id of node.mods) {                      // modifiers that are plain stat changes (Heavy, Pierce)
    const mods = PIECES[id].mods;
    if (mods) for (const m of mods) run.player.stats.add({ ...m, tags: [inst.instanceTag], source: `${SOURCE}${inst.instanceId}:` });
  }
  if (node.boost) for (const el of node.elements) for (const m of INTENSIFY[el]) run.player.stats.add({ ...m, tags: [inst.instanceTag], source: `${SOURCE}${inst.instanceId}:` });   // Kiln: each element as if held twice
  if (chain.def.quirk && chain.def.quirk.area) run.player.stats.add({ stat: 'area', op: 'inc', value: chain.def.quirk.area, tags: [inst.instanceTag], source: `${SOURCE}${inst.instanceId}:` });   // Anchor: bigger blasts
  const mods = node.reaction === 'superconduct' ? [{ stat: 'critChance', op: 'flat', value: SUPERCONDUCT_CRIT }]
    : node.reaction && node.reaction.startsWith('intensify_') ? INTENSIFY[node.reaction.slice(10)] : null;
  if (mods) for (const m of mods) run.player.stats.add({ ...m, tags: [inst.instanceTag], source: `${SOURCE}${inst.instanceId}:` });
  inst.reactAt = -1e9;
  inst.chainIdx = chain.index;                       // render: this chain's colour tints the piece's rings and shots
  node.count = 0;                                    // Every 3rd: how many times the cursor has reached it
  inst.onRig = (r, ev, atk, x, y, target, depth) => onEvent(r, rig, chain, node, inst, ev, atk, x, y, target, depth);
  return inst;
}

// An event from a piece's attack: queue the payload run if this node's trigger listens for it.
function onEvent(run, rig, chain, node, inst, ev, atk, x, y, target, depth) {
  if (run.rig !== rig) return;
  if (ev === 'hit') {                   // the node's own direct hits drive its element reaction
    if (node.sunder > 0 && depth === 0 && target !== null && target.alive) {     // Sunder: one more stack on the enemy, and the clock restarts
      target.sunderN = Math.min(node.sunder, (target.sunderN || 0) + (node.sunderAdd || 1));
      target.sunderS = SUNDER.duration;
    }
    if (node.reaction !== null && depth === 0 && target !== null) {
      reactOnHit(run, node, inst, target);
      if (run.discover) run.discover(node.reaction);                  // the compendium notes the first time a reaction happens
    }
  }
  if (ev === 'kill' && node.cascadeOf && (node.trigger === null || node.trigger.on !== 'kill')) {     // a payload's kill asks for the carrier's payload again, a generation deeper
    const gen = (inst.rigGen || 0) + 1;
    const cact = inst.rigAct;
    if (gen <= CASCADE_MAX && cact && cact.pool >= 1 && rig.queue.length - rig.head < MAX_QUEUE) rig.queue.push({ trig: node.cascadeOf, act: cact, x, y, chain, gen });
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
  for (let k = 0; k < (trig.reps || 1) && rig.queue.length - rig.head < MAX_QUEUE; k++) rig.queue.push({ trig, act, x, y, chain, gen: inst.rigGen || 0 });     // Overcharge: the payload runs more than once
}

function note(run, rig, ev, o) {
  if (rig.log !== null) rig.log.push({ t: run.time, ev, ...o });
}

// Runs one segment of nodes from (x, y), paying from act's pool. Stops at the first piece the pool cannot pay for.
function runNodes(run, rig, nodes, x, y, act, free = false, gen = 0) {
  const chains = rig.chains;
  for (let i = 0; i < nodes.length; i++) {
    const node = nodes[i];
    // A piece that costs more than the whole battery fires when the battery is full and puts it in debt: the pool goes
    // negative and recharges back up, so an expensive stack is slow rather than dead.
    const bat = chains[act.chain].bat;
    if (!free && act.pool < node.cost && !(bat.size > 0 && node.cost > bat.size && act.pool >= bat.size - 1e-6)) {
      note(run, rig, 'dry', { act: act.id, piece: node.piece, need: node.cost, pool: act.pool });
      return;
    }
    fireNode(run, rig, chains[act.chain], node, x, y, act, free, gen);
  }
}

const TAU = Math.PI * 2;

// One launch of a node's weapon at (x, y): Scatter makes its copies. Leaves the attacks that carry an On Impact
// token in rig.atks. Returns how many copies fired.
function launch(run, rig, node, x, y, act, mult, armed, gen = 0) {
  node.inst.rigGen = gen;                  // the payload generation these shots belong to (On Kill cascades)
  const inst = node.inst;
  const behavior = BEHAVIORS[inst.def.behavior];
  const ctx = rig.ctx;
  const atks = rig.atks;
  atks.length = 0;
  const copies = node.scatter ? node.copies : 1;
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

function fireNode(run, rig, chain, node, x, y, act, free = false, gen = 0) {
  const inst = node.inst;
  const mult = node.power * act.scale * (node.echo ? node.echoMult : 1);
  const cost = free ? 0 : node.cost;                                   // Every 3rd's payload runs for nothing
  const armed = node.trigger !== null && act.pool - cost >= node.trigger.cost && act.pool >= cost;     // the trigger is paid for if the attack fires (an impact can come in the same tick)
  const fired = launch(run, rig, node, x, y, act, mult, armed, gen);
  if (fired === 0) {                    // nothing in range: no attack, no energy spent
    note(run, rig, 'skip', { act: act.id, piece: node.piece, pool: act.pool });
    return;
  }
  act.pool -= cost;
  act.spent += cost;
  inst.rigAct = act;
  if (armed) {
    act.pool -= node.trigger.cost;
    act.spent += node.trigger.cost;
  }
  inst.rigArmed = armed;
  if (node.echo) for (let k = 1; k <= node.echoShots; k++) rig.delayed.push({ t: ECHO.delay * k, node, x, y, act, mult, armed, gen });
  if (armed && node.trigger.on === 'every' && ++node.count % node.trigger.every === 0 && rig.queue.length - rig.head < MAX_QUEUE) {
    for (let k = 0; k < (node.trigger.reps || 1); k++) rig.queue.push({ trig: node.trigger, act, x: run.player.x, y: run.player.y, chain, gen });   // Every 3rd: the payload runs from the player
  }
  chain.flash[node.idx] = run.time;
  if (rig.pings.length < 32) rig.pings.push({ x, y, t0: run.time, color: CHAIN_COLORS[chain.index % CHAIN_COLORS.length] });   // a ring where this chain's piece ran
  for (let i = 0; i < node.modIdx.length; i++) chain.flash[node.modIdx[i]] = run.time;
  if (armed) chain.flash[node.trigger.idx] = run.time;
  note(run, rig, 'fire', { act: act.id, piece: node.piece, mods: node.mods, copies: fired, x, y, armed, pool: act.pool });
}

// An activation pays from its chain's battery, so a payload that runs later sees what is left then.
function activate(run, rig, chain, scale = 1) {
  const bat = chain.bat;
  const pv = chain.pv;
  if (pv.overflow > 0 && bat.over > 0) {                       // Overflow: the recharge banked past a full battery goes into this activation
    scale *= 1 + Math.min(pv.overflow, bat.over / bat.size);
    bat.over = 0;
  }
  if (pv.turret > 0 && rig.stillT >= 1) scale *= 1 + pv.turret;   // Turret Mode: standing still for a second
  const act = { id: ++rig.actN, chain: chain.index, bat, spent: 0, scale, loopDepth: 0, looped: false, get pool() { return bat.pool; }, set pool(v) { bat.pool = v; } };
  chain.act = act;
  note(run, rig, 'activate', { act: act.id, chain: chain.index, pool: act.pool });
  const p = run.player;
  runNodes(run, rig, chain.nodes, p.x, p.y, act);
}

// Whether a rule card says "fire now". `st` holds its timers ({ t, dist, idleT }): the chain itself for its own rule card, an entry of
// chain.extra for a Retrofit one. Each card keeps its own timer, so two cards on one chain fire independently.
function ruleDue(rig, rule, st, chain, dt, moved, p, bat) {
  if (rule.on === 'full') {                                    // Charge: fires each time the battery fills
    if (st.t > 0) st.t -= dt;
    if (bat.pool >= bat.size - 1e-6 && st.t <= 0) { st.t = rule.gap; return true; }
    return false;
  }
  if (rule.on) {                                               // Reaper: an event starts it, at most once per `gap`
    if (st.t > 0) st.t -= dt;
    if (rule.idle) st.idleT = (st.idleT || 0) + dt;
    const idle = rule.idle && st.idleT >= rule.idle;           // Reaper: nothing has died for `idle` s, so it fires anyway and cannot stall for good
    if ((rig.flags[rule.on] || idle) && st.t <= 0) { st.t = rule.gap; st.idleT = 0; return true; }
    return false;
  }
  if (rule.dist) {                                             // Stride: every `dist` px moved, after the first delay
    if (st.t > 0) { st.t -= dt; return false; }
    st.dist = Math.min(rule.dist, (st.dist || 0) + moved);
    if (st.dist < rule.dist) return false;
    st.dist -= rule.dist;
    return true;
  }
  if (rule.while === 'moving' && !p.moving) return false;
  if (rule.while === 'still' && p.moving) return false;
  st.t -= dt;
  if (st.t > 0) return false;
  st.t += rule.every;
  if (st.t <= 0) st.t = rule.every;
  return true;
}

// Step 3b of the tick (after the player's own weapons): rule-card timers, queued payloads, then the pieces' shells and shots.
export function updateRig(run, dt) {
  const rig = run.rig;
  const p = run.player;
  rig.stillT = p.moving ? 0 : (rig.stillT || 0) + dt;
  const braceArmor = (run.rigState && run.rigState.pilot && run.rigState.pilot.braceArmor) || 0;       // Bulwark: armor while Turret Mode's second of standing still is up
  if (braceArmor > 0 && (rig.stillT >= 1) !== !!rig.braced) {
    rig.braced = rig.stillT >= 1;
    p.stats.removeBySource(BRACE);
    if (rig.braced) p.stats.add({ stat: 'armor', op: 'flat', value: braceArmor, source: BRACE });
  }
  const heal = run.rigState && run.rigState.pilot && run.rigState.pilot.braceHeal;            // Bulwark: kills heal while braced, up to a cap per second
  if (heal && rig.stillT >= 1) {
    rig.healBank = Math.min(heal.cap * p.maxHp, (rig.healBank || 0) + heal.cap * p.maxHp * dt);
    if (rig.kills > 0 && p.hp > 0) {
      const amt = Math.min(rig.healBank, rig.kills * heal.perKill * p.maxHp, p.maxHp - p.hp);
      p.hp += amt;
      rig.healBank -= amt;
    }
  } else if (heal) rig.healBank = 0;
  const hop = rig.px === undefined ? 0 : Math.hypot(p.x - rig.px, p.y - rig.py);       // Stride: how far you moved this tick (a jump of 50 px or more is a respawn, not a step)
  rig.px = p.x;
  rig.py = p.y;
  const moved = hop < 50 ? hop : 0;
  for (let i = 0; i < rig.chains.length; i++) {
    const chain = rig.chains[i];
    const rule = chain.rule;
    const bat = chain.bat;
    const pv = chain.pv;
    if (!bat.while || (bat.while === 'moving') === !!p.moving) bat.pool += bat.rate * dt * (pv.momentum > 0 ? (p.moving ? 1 + pv.momentum : 0.8) : 1) * (pv.redline > 0 && bat.pool < bat.size * 0.5 ? 1 + pv.redline : 1);   // Momentum; Redline: a nearly empty battery refills faster
    bat.pool += bat.kill * rig.kills;
    if (bat.pool > bat.size) {
      if (pv.overflow > 0) bat.over = Math.min(pv.overflow * bat.size, bat.over + bat.pool - bat.size);
      bat.pool = bat.size;
    }
    let fire = ruleDue(rig, rule, chain, chain, dt, moved, p, bat);
    for (const x of chain.extra) if (ruleDue(rig, x.rule, x, chain, dt, moved, p, bat)) fire = true;      // Retrofit: any of its rule cards starts the chain, from the one battery
    if (fire) activate(run, rig, chain);
  }
  updateMines(run, rig, dt, moved);
  rig.flags.kill = false;
  rig.kills = 0;

  const dl = rig.delayed;                                      // Echo: the second shot
  for (let i = dl.length - 1; i >= 0; i--) {
    const d = dl[i];
    d.t -= dt;
    if (d.t > 0) continue;
    dl.splice(i, 1);
    const fired = launch(run, rig, d.node, d.x, d.y, d.act, d.mult, d.armed, d.gen);
    if (fired > 0) note(run, rig, 'echo', { act: d.act.id, piece: d.node.piece, copies: fired });
  }

  const ec = rig.echoes;                                       // Relay: a payload's second run
  for (let i = ec.length - 1; i >= 0; i--) {
    const e = ec[i];
    e.t -= dt;
    if (e.t > 0) continue;
    ec.splice(i, 1);
    const job = e.job;
    const act = { id: job.act.id, chain: job.act.chain, bat: job.act.bat, spent: 0, scale: job.act.scale * RELAY_ECHO.mult, pool: RELAY_ECHO.pool, echo: true };   // its own pool: the echo costs the chain nothing
    note(run, rig, 'payload', { act: act.id, trigger: job.trig.piece, x: job.x, y: job.y, pool: act.pool, gen: job.gen || 0, echo: true });
    runNodes(run, rig, job.trig.payload, job.x, job.y, act, true, job.gen || 0);
  }

  const lp = rig.loops;                                        // Feedback loop: the whole chain again, free, a share weaker each time
  for (let i = lp.length - 1; i >= 0; i--) {
    const l = lp[i];
    l.t -= dt;
    if (l.t > 0) continue;
    lp.splice(i, 1);
    const ch = l.chain;
    const act = { id: ++rig.actN, chain: ch.index, bat: ch.bat, spent: 0, scale: Math.pow(ch.loop, l.depth), loopDepth: l.depth, looped: false, pool: LOOP_POOL };
    note(run, rig, 'loop', { act: act.id, chain: ch.index, depth: l.depth, scale: act.scale });
    addLabel(run, p.x, p.y - 26, `loop ${l.depth}`, '#ffe08a');
    runNodes(run, rig, ch.nodes, p.x, p.y, act, true, 0);
  }

  const q = rig.queue;
  for (let n = 0; rig.head < q.length && n < MAX_PAYLOADS_PER_TICK; n++) {
    const job = q[rig.head++];
    note(run, rig, 'payload', { act: job.act.id, trigger: job.trig.piece, x: job.x, y: job.y, pool: job.act.pool, gen: job.gen || 0 });
    job.chain.flash[job.trig.idx] = run.time;
    if (rig.pings.length < 32) rig.pings.push({ x: job.x, y: job.y, t0: run.time, color: CHAIN_COLORS[job.chain.index % CHAIN_COLORS.length], big: true });   // the payload going off: a bigger, whiter ring
    run.sfx('proc');
    if (job.gen > 0) addLabel(run, job.x, job.y - 14, `x${job.gen + 1}`, '#ffe08a');          // a cascade, counting up
    runNodes(run, rig, job.trig.payload, job.x, job.y, job.act, job.trig.free === true, job.gen || 0);
    if (job.chain.loop > 0 && !job.act.echo && !job.act.looped && job.act.loopDepth < LOOP_MAX && !job.trig.payload.some((nd) => nd.trigger) && lp.length < 8) {   // the chain's last trigger just fired: run it all again
      job.act.looped = true;
      lp.push({ t: LOOP_DELAY, chain: job.chain, depth: job.act.loopDepth + 1 });
    }
    const pe = job.chain.def.quirk && job.chain.def.quirk.payloadEcho;
    if (pe && !job.act.echo && ec.length < MAX_QUEUE) ec.push({ t: pe.delay, job });          // Relay: again a moment later
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

// Rule-card events from the rest of the game: an enemy died ('kill').
export function rigEvent(run, name) {
  if (run.rig === null) return;
  run.rig.flags[name] = true;
  if (name === 'kill') run.rig.kills++;
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
    ctx.arc(g.x, g.y, g.big ? 22 + 42 * u : 14 + 26 * u, 0, Math.PI * 2);
    ctx.stroke();
    if (g.big) {                                  // a white edge, so a payload reads differently from a piece firing
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 1.5;
      ctx.stroke();
      ctx.lineWidth = 3;
    }
  }
  ctx.globalAlpha = 1;
  const mines = run.mines;
  if (mines && mines.length) {                                   // Wake: a small diamond, brighter once armed, with a dot in the weapon's colour
    for (let i = 0; i < mines.length; i++) {
      const m = mines[i];
      const armed = m.t >= MINE.arm;
      ctx.globalAlpha = armed ? 0.95 : 0.45;
      ctx.strokeStyle = PALETTE.rig;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(m.x, m.y - 5); ctx.lineTo(m.x + 5, m.y); ctx.lineTo(m.x, m.y + 5); ctx.lineTo(m.x - 5, m.y); ctx.closePath();
      ctx.stroke();
      ctx.fillStyle = PALETTE.ink;
      ctx.fillRect(m.x - 1, m.y - 1, 2, 2);
    }
    ctx.globalAlpha = 1;
  }
  const insts = run.rig.insts;
  for (let i = 0; i < insts.length; i++) {
    const b = BEHAVIORS[insts[i].def.behavior];
    if (b.draw) b.draw(insts[i], ctx, run);
  }
}

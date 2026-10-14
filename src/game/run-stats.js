// Per-run damage accounting: who dealt it (weapon instance), through what (cause), and a
// per-second timeline for DPS. Fed by flushDamage; read by the build panel and the end screen.

import { CAUSE_NAMES } from '../systems/damage-queue.js';

export function createStats() {
  return {
    total: 0,
    sec: [],                          // damage dealt in each whole second of the run
    causes: new Array(CAUSE_NAMES.length).fill(0),
    src: new Map(),                   // weapon instanceId -> { name, dmg, kills, crits, byCause[] }
  };
}

function rec(run, inst) {
  const st = run.stats;
  let r = st.src.get(inst.instanceId);
  if (!r) {
    r = { name: inst.def.name, dmg: 0, kills: 0, crits: 0, byCause: new Array(CAUSE_NAMES.length).fill(0), gone: false, t0: run.time, t1: 0 };
    st.src.set(inst.instanceId, r);
  }
  r.name = inst.def.name;             // follows evolution
  return r;
}

export function recordDamage(run, src, cause, dealt, crit) {
  const st = run.stats;
  st.total += dealt;
  st.causes[cause] += dealt;
  const s = Math.floor(run.time);
  while (st.sec.length <= s) st.sec.push(0);
  st.sec[s] += dealt;
  if (src) {
    const r = rec(run, src);
    r.dmg += dealt;
    r.byCause[cause] += dealt;
    if (crit) r.crits++;
  }
}

export function recordKill(run, src) {
  if (src) rec(run, src).kills++;
}

export function markGone(run, inst) {
  const r = run.stats.src.get(inst.instanceId);
  if (r) { r.gone = true; r.t1 = run.time; }
}

// Damage per second over the last `window` whole seconds (the current second is partial, so skipped).
export function recentDps(run, window = 5) {
  const sec = run.stats.sec;
  const end = Math.min(Math.floor(run.time), sec.length);
  const start = Math.max(0, end - window);
  if (end <= start) return 0;
  let sum = 0;
  for (let i = start; i < end; i++) sum += sec[i];
  return sum / (end - start);
}

export function peakDps(run, window = 5) {
  const sec = run.stats.sec;
  let best = 0;
  let sum = 0;
  for (let i = 0; i < sec.length; i++) {
    sum += sec[i];
    if (i >= window) sum -= sec[i - window];
    if (i >= window - 1 && sum / window > best) best = sum / window;
  }
  return best;
}

// Plain-data snapshot for the UI (and the results summary).
export function statsSnapshot(run) {
  const st = run.stats;
  const t = Math.max(1, run.time);
  const weapons = [...st.src.values()]
    .map((r) => ({ name: r.name, dmg: r.dmg, kills: r.kills, crits: r.crits, gone: r.gone, byCause: r.byCause.slice(),
      dps: r.dmg / Math.max(1, (r.gone ? r.t1 : run.time) - r.t0) }))     // per second from its first hit until the run ends (or it was salvaged)
    .sort((a, b) => b.dmg - a.dmg);
  const causes = st.causes.map((dmg, i) => ({ name: CAUSE_NAMES[i], dmg })).filter((c) => c.dmg > 0).sort((a, b) => b.dmg - a.dmg);
  return { total: st.total, avgDps: st.total / t, recentDps: recentDps(run), peakDps: peakDps(run), weapons, causes, sec: st.sec.slice() };
}

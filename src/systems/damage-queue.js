// Preallocated ring of pending damage entries. Collisions enqueue; damage.flush applies them
// in one place so crits, knockback, numbers, kills and (later) triggers are handled
// consistently and can't recurse (docs/architecture.md §3.3).

const CAP = 1024;

// What produced an entry (docs/design-m10-m13.md §3.6):
//   HIT  a weapon hit: statuses, chains, lifesteal and all triggers
//   PROC triggered damage (explode, chain hops): statuses and triggers, but never chains
//   DOT  burn ticks: no statuses, lifesteal or hit/crit triggers; kills still count
export const KIND_HIT = 0;
export const KIND_PROC = 1;
export const KIND_DOT = 2;

// Where an entry's damage came from, for the run stats (what the end screen breaks down).
export const CAUSE = { DIRECT: 0, BURN: 1, CHAIN: 2, BLAST: 3, QUENCH: 4, OVERLOAD: 5, SHATTER: 6, THUNDERCLAP: 7, REACTION: 8, FORK: 9, GRAFT: 10, SPELLBURST: 11 };
export const CAUSE_NAMES = ['Direct hits', 'Burn', 'Shock chains', 'Blasts', 'Quench', 'Overload', 'Shatter', 'Thunderclap', 'Chain Reaction', 'Forked Strikes', 'Graft', 'Spellburst'];
const DEFAULT_CAUSE = [CAUSE.DIRECT, CAUSE.BLAST, CAUSE.BURN];   // by kind: HIT, PROC, DOT

export function createDamageQueue() {
  return {
    n: 0,
    dropped: 0,                       // entries lost to overflow (shown in debug)
    enemy: new Array(CAP).fill(null),
    uid: new Int32Array(CAP),         // guards against the enemy slot being reused before the flush
    amount: new Float32Array(CAP),
    crit: new Uint8Array(CAP),
    kx: new Float32Array(CAP),
    ky: new Float32Array(CAP),
    src: new Array(CAP).fill(null),   // weapon instance that caused the hit (drives triggers)
    kind: new Uint8Array(CAP),
    cause: new Uint8Array(CAP),
    depth: new Uint8Array(CAP),       // trigger recursion depth (capped at 3 once triggers exist)
  };
}

export function queueDamage(run, enemy, amount, crit, kx = 0, ky = 0, depth = 0, src = null, kind = KIND_HIT, cause = DEFAULT_CAUSE[kind]) {
  const q = run.world.dmg;
  if (q.n >= CAP) {
    q.dropped++;
    return;
  }
  const i = q.n++;
  q.enemy[i] = enemy;
  q.uid[i] = enemy.uid;
  q.amount[i] = amount;
  q.crit[i] = crit ? 1 : 0;
  q.kx[i] = kx;
  q.ky[i] = ky;
  q.depth[i] = depth;
  q.src[i] = src;
  q.kind[i] = kind;
  q.cause[i] = cause;
}

// Meta save (docs/architecture.md §8): a small versioned JSON blob in localStorage.
// Storage can be missing or throw (private windows, blocked site data), so every access is
// wrapped and the game plays fine without it. A run in progress is saved separately (save/run-save.js)
// when the game pauses, which also happens whenever the tab is hidden.
// createSave(storage) takes the storage object so tests can pass a fake.

const KEY = 'overclocked.save.v1';

export const DEFAULTS = {
  version: 3,
  lastClass: 'archer',
  unlocked: [],                       // class ids unlocked through play
  bests: { time: 0, kills: 0, level: 0 },
  runs: 0,
  wins: 0,
  bossKills: 0,
  sound: true,
  music: true,                        // music on/off (the sound toggle mutes everything)
  musicVolume: 0.6,                   // 0..1
  sfxVolume: 1,                       // sound effects, 0..1 (1 = the original level)
  history: [],                        // finished runs, oldest first (see entryFromSummary), capped
  discovered: { fusions: [], reactions: [] },   // masterwork ids found at the forge (v3); element reactions seen in a run (the compendium)
};

export const HISTORY_CAP = 100;

// Fusions made in a run: [hostWeaponId, donorWeaponId, fusionId, name] (strings only).
function cleanFusions(l) {
  if (!Array.isArray(l)) return [];
  return l.filter((x) => Array.isArray(x) && x.length >= 4 && x.slice(0, 4).every((v) => typeof v === 'string')).slice(0, 6).map((x) => [x[0], x[1], x[2], x[3].slice(0, 40)]);
}

// A finished run as stored in the history: ids and numbers only, so it stays small and survives data edits.
export function entryFromSummary(summary, now = Date.now()) {
  const b = summary.build || {};
  const pairs = (l) => (Array.isArray(l) ? l.map((x) => [String(x[0]), Math.floor(x[1]) || 1]) : []);
  return {
    t: now,
    cls: summary.classId,
    won: !!summary.won,
    time: Math.floor(summary.time),
    kills: summary.kills,
    level: summary.level,
    seed: summary.seed,
    boss: !!summary.bossKilled,
    dmg: Math.round(summary.stats ? summary.stats.total : 0),
    dps: Math.round(summary.stats ? summary.stats.avgDps : 0),
    gear: cleanGear(b.gear),
    weapons: pairs(b.weapons),
    passives: pairs(b.passives),
    perks: pairs(b.perks),
    fusions: cleanFusions(b.fusions),
    titles: Array.isArray(summary.titleIds) ? summary.titleIds.map(String) : [],
    rig: cleanRig(summary.rig),
  };
}

// The rig of a finished run, compact: [{ rule, chassis?, mk?, slots: [piece ids] }] and { piece id: level }. Strings and small numbers only.
function cleanRig(r) {
  if (!r || !Array.isArray(r.chains)) return null;
  const chains = r.chains.slice(0, 4).map((c) => ({ rule: String(c.rule).slice(0, 20), ...(typeof c.chassis === 'string' ? { chassis: c.chassis.slice(0, 20), mk: Math.max(1, Math.min(3, Math.floor(Number(c.mk)) || 1)) } : {}), slots: (Array.isArray(c.slots) ? c.slots : []).filter((x) => typeof x === 'string').slice(0, 6).map((x) => (x === 'pierce' ? 'sunder' : x.slice(0, 20))) }));
  const levels = {};
  if (r.levels && typeof r.levels === 'object') for (const [k, v] of Object.entries(r.levels).slice(0, 20)) if (Number.isFinite(v)) levels[k === 'pierce' ? 'sunder' : String(k).slice(0, 20)] = Math.max(1, Math.min(5, Math.floor(v)));
  const passives = {};
  if (r.passives && typeof r.passives === 'object') for (const [k, v] of Object.entries(r.passives).slice(0, 20)) if (Number.isFinite(v)) passives[String(k).slice(0, 20)] = Math.max(1, Math.min(3, Math.floor(v)));
  return { chains, levels, passives };
}

// Per-weapon forge marks, aligned with `weapons`: [enhance, starforged, tempers, effects, legendary]. Old entries have none.
function cleanGear(g) {
  if (!Array.isArray(g)) return [];
  return g.slice(0, 12).map((x) => (Array.isArray(x) ? [0, 1, 2, 3, 4].map((i) => Math.max(0, Math.min(99, Math.floor(Number(x[i])) || 0))) : [0, 0, 0, 0, 0]));
}

// Keeps a stored history entry only if it has the right shape (a hand-edited or imported blob can be anything).
function cleanEntry(e) {
  if (!e || typeof e !== 'object' || typeof e.cls !== 'string') return null;
  for (const k of ['t', 'time', 'kills', 'level']) if (!Number.isFinite(e[k]) || e[k] < 0) return null;
  const pairs = (l) => (Array.isArray(l) ? l.filter((x) => Array.isArray(x) && typeof x[0] === 'string' && Number.isFinite(x[1])).slice(0, 12).map((x) => [x[0], x[1]]) : []);
  return {
    t: e.t, cls: e.cls, won: !!e.won, time: Math.floor(e.time), kills: Math.floor(e.kills), level: Math.floor(e.level),
    seed: Number.isFinite(e.seed) ? e.seed : 0, boss: !!e.boss,
    dmg: Number.isFinite(e.dmg) ? e.dmg : 0, dps: Number.isFinite(e.dps) ? e.dps : 0,
    gear: cleanGear(e.gear),
    weapons: pairs(e.weapons), passives: pairs(e.passives), perks: pairs(e.perks), fusions: cleanFusions(e.fusions || e.grafts),
    titles: Array.isArray(e.titles) ? e.titles.filter((x) => typeof x === 'string').slice(0, 12) : [],
    rig: cleanRig(e.rig),
  };
}

// Two entries identical in everything but the timestamp (class, seed, length, kills, level, damage and
// the whole build) are one run recorded twice: real play never lands on identical totals.
function sameRun(a, b) {
  const { t: ta, ...ra } = a;
  const { t: tb, ...rb } = b;
  return JSON.stringify(ra) === JSON.stringify(rb);
}

function clone(o) {
  return JSON.parse(JSON.stringify(o));
}

// Merges whatever was stored over the defaults, ignoring anything of the wrong shape.
export function normalize(raw) {
  const out = clone(DEFAULTS);
  if (!raw || typeof raw !== 'object') return out;
  if (typeof raw.lastClass === 'string') out.lastClass = raw.lastClass;
  if (Array.isArray(raw.unlocked)) out.unlocked = raw.unlocked.filter((x) => typeof x === 'string');
  if (raw.bests && typeof raw.bests === 'object') {
    for (const k of ['time', 'kills', 'level']) {
      if (Number.isFinite(raw.bests[k]) && raw.bests[k] >= 0) out.bests[k] = raw.bests[k];
    }
  }
  for (const k of ['runs', 'wins', 'bossKills']) {
    if (Number.isFinite(raw[k]) && raw[k] >= 0) out[k] = Math.floor(raw[k]);
  }
  // A run recorded twice (an update landing between runs, say) is counted once: drop the copies and take them off the counters.
  if (Array.isArray(raw.history)) {
    const kept = [];
    for (const e of raw.history.map(cleanEntry).filter(Boolean)) {
      const twin = kept.find((k) => sameRun(k, e));
      if (twin) {
        out.runs = Math.max(0, out.runs - 1);
        if (e.won) out.wins = Math.max(0, out.wins - 1);
        if (e.boss) out.bossKills = Math.max(0, out.bossKills - 1);
      } else kept.push(e);
    }
    out.history = kept.slice(-HISTORY_CAP);
  }
  if (typeof raw.sound === 'boolean') out.sound = raw.sound;
  if (typeof raw.music === 'boolean') out.music = raw.music;
  if (Number.isFinite(raw.musicVolume)) out.musicVolume = Math.min(1, Math.max(0, raw.musicVolume));
  if (Number.isFinite(raw.sfxVolume)) out.sfxVolume = Math.min(1, Math.max(0, raw.sfxVolume));
  const found = raw.discovered && (Array.isArray(raw.discovered.fusions) ? raw.discovered.fusions : raw.discovered.grafts);   // saves from before the rename say "grafts"
  if (Array.isArray(found)) {
    out.discovered.fusions = [...new Set(found.filter((x) => typeof x === 'string'))].slice(0, 100);
  }
  if (raw.discovered && Array.isArray(raw.discovered.reactions)) out.discovered.reactions = [...new Set(raw.discovered.reactions.filter((x) => typeof x === 'string'))].slice(0, 30);
  return out;
}

export function createSave(storage) {
  let data = clone(DEFAULTS);
  try {
    const text = storage && storage.getItem(KEY);
    if (text) data = normalize(JSON.parse(text));
  } catch (e) { /* unreadable or unavailable: start fresh */ }

  function persist() {
    try {
      if (storage) storage.setItem(KEY, JSON.stringify(data));
    } catch (e) { /* storage full or blocked */ }
  }

  const save = {
    get data() { return data; },

    isUnlocked(classId, def) {
      return !!(def && def.unlocked) || data.unlocked.includes(classId);
    },

    unlock(classId) {
      if (data.unlocked.includes(classId)) return false;
      data.unlocked.push(classId);
      persist();
      return true;
    },

    setLastClass(id) {
      data.lastClass = id;
      persist();
    },

    setSound(on) {
      data.sound = !!on;
      persist();
    },

    setMusic(on) {
      data.music = !!on;
      persist();
    },

    setMusicVolume(v) {
      data.musicVolume = Math.min(1, Math.max(0, Number(v) || 0));
      persist();
    },

    setSfxVolume(v) {
      data.sfxVolume = Math.min(1, Math.max(0, Number(v) || 0));
      persist();
    },

    // Marks a masterwork as found. Returns true the first time.
    discoverFusion(id) {
      if (data.discovered.fusions.includes(id)) return false;
      data.discovered.fusions.push(id);
      persist();
      return true;
    },

    // Marks an element reaction as seen. Returns true the first time.
    discoverReaction(id) {
      if (data.discovered.reactions.includes(id)) return false;
      data.discovered.reactions.push(id);
      persist();
      return true;
    },

    // Records a finished run and returns { newBests: ['time', ...] }.
    recordRun(summary, now = Date.now()) {
      const entry = entryFromSummary(summary, now);
      if (data.history.some((e) => sameRun(e, entry))) return { newBests: [] };      // already recorded
      data.runs++;
      if (summary.won) data.wins++;
      if (summary.bossKilled) data.bossKills++;
      const newBests = [];
      for (const [k, v] of [['time', summary.time], ['kills', summary.kills], ['level', summary.level]]) {
        if (v > data.bests[k]) {
          data.bests[k] = k === 'time' ? Math.floor(v) : v;
          newBests.push(k);
        }
      }
      data.history.push(entry);
      if (data.history.length > HISTORY_CAP) data.history.splice(0, data.history.length - HISTORY_CAP);
      persist();
      return { newBests };
    },

    // Import: the whole save is replaced by a (re-validated) imported one.
    replaceAll(raw) {
      data = normalize(raw);
      persist();
      return data;
    },

    reset() {
      data = clone(DEFAULTS);
      persist();
    },
  };
  return save;
}

// The real thing, with a guard for environments where even touching localStorage throws.
export function browserStorage() {
  try {
    return window.localStorage;
  } catch (e) {
    return null;
  }
}

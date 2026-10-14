// Meta save (docs/architecture.md §8): a small versioned JSON blob in localStorage.
// Storage can be missing or throw (private windows, blocked site data), so every access is
// wrapped and the game plays fine without it. There is no mid-run save: runs are short and
// auto-pause when the tab is hidden.
// createSave(storage) takes the storage object so tests can pass a fake.

const KEY = 'overforged.save.v1';

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
  history: [],                        // finished runs, oldest first (see entryFromSummary), capped
  discovered: { grafts: [] },         // masterwork ids found at the forge (v3)
};

export const HISTORY_CAP = 100;

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
    weapons: pairs(b.weapons),
    passives: pairs(b.passives),
    perks: pairs(b.perks),
    titles: Array.isArray(summary.titleIds) ? summary.titleIds.map(String) : [],
  };
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
    weapons: pairs(e.weapons), passives: pairs(e.passives), perks: pairs(e.perks),
    titles: Array.isArray(e.titles) ? e.titles.filter((x) => typeof x === 'string').slice(0, 12) : [],
  };
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
  if (typeof raw.sound === 'boolean') out.sound = raw.sound;
  if (typeof raw.music === 'boolean') out.music = raw.music;
  if (Number.isFinite(raw.musicVolume)) out.musicVolume = Math.min(1, Math.max(0, raw.musicVolume));
  if (Array.isArray(raw.history)) out.history = raw.history.map(cleanEntry).filter(Boolean).slice(-HISTORY_CAP);
  if (raw.discovered && Array.isArray(raw.discovered.grafts)) {
    out.discovered.grafts = [...new Set(raw.discovered.grafts.filter((x) => typeof x === 'string'))].slice(0, 100);
  }
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

    // Marks a masterwork as found. Returns true the first time.
    discoverGraft(id) {
      if (data.discovered.grafts.includes(id)) return false;
      data.discovered.grafts.push(id);
      persist();
      return true;
    },

    // Records a finished run and returns { newBests: ['time', ...] }.
    recordRun(summary, now = Date.now()) {
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
      data.history.push(entryFromSummary(summary, now));
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

// Meta save (docs/architecture.md §8): a small versioned JSON blob in localStorage.
// Storage can be missing or throw (private windows, blocked site data), so every access is
// wrapped and the game plays fine without it. There is no mid-run save: runs are short and
// auto-pause when the tab is hidden.
// createSave(storage) takes the storage object so tests can pass a fake.

const KEY = 'overforged.save.v1';

export const DEFAULTS = {
  version: 1,
  lastClass: 'archer',
  unlocked: [],                       // class ids unlocked through play
  bests: { time: 0, kills: 0, level: 0 },
  runs: 0,
  wins: 0,
  bossKills: 0,
  sound: true,
};

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

    // Records a finished run and returns { newBests: ['time', ...] }.
    recordRun(summary) {
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
      persist();
      return { newBests };
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

// StatBlock: modifiers go in, cached final values come out (docs/architecture.md §4).
//
//   final = clamp( (base + Σflat) × (1 + Σinc) × Π(1 + more) )      'set' overrides the result
//
// A modifier may be scoped with `tags: [...]` (applies only when the reader's tag set contains
// ALL of them) and gated with `when: 'conditionId'` (evaluated on every read, never cached).
// Readers pass a prebuilt tag set (makeTags) so hot paths don't allocate.

export function makeTags(list) {
  const arr = [...new Set(list)].sort();
  return { set: new Set(arr), key: arr.join(',') };
}
export const NO_TAGS = makeTags([]);

export class StatBlock {
  constructor(defs, { conditions = {}, getContext = () => null } = {}) {
    this.defs = defs;
    this.conditions = conditions;
    this.getContext = getContext;
    this.mods = {};            // stat id -> modifier[]
    this.cache = {};           // stat id -> Map(tagKey -> value)
    this.conditional = {};     // stat id -> number of `when` modifiers (those stats bypass the cache)
    for (const id of Object.keys(defs)) {
      this.mods[id] = [];
      this.cache[id] = new Map();
      this.conditional[id] = 0;
    }
  }

  add(mod) {
    const list = this.mods[mod.stat];
    if (!list) throw new Error(`Unknown stat "${mod.stat}" (source ${mod.source})`);
    if (mod.op !== 'flat' && mod.op !== 'inc' && mod.op !== 'more' && mod.op !== 'set') {
      throw new Error(`Unknown op "${mod.op}" on stat "${mod.stat}"`);
    }
    if (mod.when) {
      if (!this.conditions[mod.when]) throw new Error(`Unknown condition "${mod.when}" (source ${mod.source})`);
      this.conditional[mod.stat]++;
    }
    list.push(mod);
    this.cache[mod.stat].clear();
    return mod;
  }

  addMany(mods) {
    for (let i = 0; i < mods.length; i++) this.add(mods[i]);
  }

  // Removes every modifier whose source starts with `prefix`. Returns how many were removed.
  removeBySource(prefix) {
    let removed = 0;
    for (const id of Object.keys(this.mods)) {
      const list = this.mods[id];
      let changed = false;
      for (let i = list.length - 1; i >= 0; i--) {
        const m = list[i];
        if (m.source && m.source.startsWith(prefix)) {
          if (m.when) this.conditional[id]--;
          list.splice(i, 1);
          removed++;
          changed = true;
        }
      }
      if (changed) this.cache[id].clear();
    }
    return removed;
  }

  get(stat) {
    return this.getFor(stat, NO_TAGS);
  }

  getFor(stat, tags) {
    if (this.conditional[stat] === 0) {
      const cache = this.cache[stat];
      let v = cache.get(tags.key);
      if (v === undefined) {
        v = this.compute(stat, tags, false);
        cache.set(tags.key, v);
      }
      return v;
    }
    return this.compute(stat, tags, true);
  }

  compute(stat, tags, evalConditions) {
    const def = this.defs[stat];
    const list = this.mods[stat];
    let flat = 0;
    let inc = 0;
    let more = 1;
    let forced;
    for (let i = 0; i < list.length; i++) {
      const m = list[i];
      if (m.tags) {
        let ok = true;
        for (let k = 0; k < m.tags.length; k++) {
          if (!tags.set.has(m.tags[k])) { ok = false; break; }
        }
        if (!ok) continue;
      }
      if (m.when && evalConditions && !this.conditions[m.when](this.getContext())) continue;
      if (m.op === 'flat') flat += m.value;
      else if (m.op === 'inc') inc += m.value;
      else if (m.op === 'more') more *= 1 + m.value;
      else forced = m.value;
    }
    let v = forced !== undefined ? forced : (def.base + flat) * (1 + inc) * more;
    if (def.min !== undefined && v < def.min) v = def.min;
    if (def.max !== undefined && v > def.max) v = def.max;
    return v;
  }
}

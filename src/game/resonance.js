// Recomputes resonance set bonuses (data/resonance.js). Call whenever the set of weapon tags
// changes: a weapon is added, evolved or infused. Modifiers use source `resonance:<tag>:<tier>:`.

import { RESONANCE } from '../data/resonance.js';

export function refreshResonance(run) {
  const p = run.player;
  p.stats.removeBySource('resonance:');
  run.resonance.length = 0;
  for (const tag of Object.keys(RESONANCE)) {
    let n = 0;
    for (const w of p.weapons) if (w.tags.set.has(tag)) n++;
    const tier = n >= 3 ? 2 : n >= 2 ? 1 : 0;
    if (tier === 0) continue;
    const def = RESONANCE[tag];
    for (let t = 0; t < tier; t++) {
      for (const m of def.tiers[t]) {
        p.stats.add({ ...m, tags: [tag], source: `resonance:${tag}:${t + 1}:` });
      }
    }
    run.resonance.push({ tag, tier, name: def.name });
  }
}

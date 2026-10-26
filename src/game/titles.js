// Titles (docs/architecture.md §5.4): granting, milestones and the toast.

import { TITLES } from '../data/titles.js';

export function hasTitle(run, id) {
  return run.titles.some((t) => t.id === id);
}

export function grantTitle(run, id, announce = true) {
  const def = TITLES[id];
  if (!def) throw new Error(`Unknown title "${id}"`);
  if (hasTitle(run, id)) return false;
  run.titles.push({ id, def, level: '' });
  for (const m of def.mods) run.player.stats.add({ ...m, source: `title:${id}` });
  if (announce) run.toast = { text: `Title earned: ${def.name}`, ttl: 3.5 };
  return true;
}

// Called when a counted event happens ('kills', 'enhance', 'boss') with the new total / level.
// (The list is precomputed: this runs on every kill, so it must not allocate.)
const MILESTONES = Object.entries(TITLES)
  .filter(([, def]) => def.grant.type === 'milestone')
  .map(([id, def]) => ({ id, event: def.grant.event, count: def.grant.count }));

export function onMilestone(run, event, value) {
  for (let i = 0; i < MILESTONES.length; i++) {
    const m = MILESTONES[i];
    if (m.event === event && value >= m.count && !hasTitle(run, m.id)) grantTitle(run, m.id);
  }
}

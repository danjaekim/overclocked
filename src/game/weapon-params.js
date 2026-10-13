// How a weapon's base params combine with player stats (docs/architecture.md §5.2).
// One place, so behaviors never re-derive it.
//   'mul'  base × stat      'add'  base + stat

const RULES = {
  damage:   ['mul', 'damage'],
  cooldown: ['mul', 'cooldown'],
  count:    ['add', 'projectiles'],
  pierce:   ['add', 'pierce'],
  speed:    ['mul', 'projSpeed'],
  ttl:      ['mul', 'duration'],
  radius:   ['mul', 'area'],
  range:    ['mul', 'area'],
  arcWidth: ['mul', 'area'],
};

// Final value of one base param for a weapon instance. Keys without a rule are used as-is.
export function param(run, inst, key) {
  const base = inst.def.base[key];
  const rule = RULES[key];
  if (!rule) return base;
  const s = run.player.stats.getFor(rule[1], inst.tags);
  return rule[0] === 'mul' ? base * s : base + s;
}

// Any stat read through a weapon's tag scope (crit, knockback, ...).
export function weaponStat(run, inst, statId) {
  return run.player.stats.getFor(statId, inst.tags);
}

// Ore types. `bank` says where a pickup goes:
//   'ore'       the shared currency in iron-equivalents (run.ore); every forge cost is paid in it
//   'starsteel' a separate counter (run.starsteel): rare, from the boss, spent on evolutions
// mithril and void_ember are possible later additions.

export const ORES = {
  iron:      { name: 'Iron',      bank: 'ore',       color: '#ffb45e', r: 5 },
  starsteel: { name: 'Starsteel', bank: 'starsteel', color: '#7fe9ff', r: 8 },
};

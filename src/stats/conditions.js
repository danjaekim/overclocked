// Named predicates for conditional modifiers ({ when: 'hpBelow50' }). Data never contains
// code; add a new condition here and reference it by id. Each receives the run.

export const CONDITIONS = {
  hpBelow50:     (run) => run.player.hp < run.player.maxHp * 0.5,
  hpFull:        (run) => run.player.hp >= run.player.maxHp,
  moving:        (run) => run.player.moving,
  standingStill: (run) => !run.player.moving,
  recentKill3s:  (run) => run.time - run.lastKillTime < 3,
  bossAlive:     (run) => run.bossAlive === true,
};

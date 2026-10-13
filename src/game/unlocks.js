// Class unlock rules (data/classes.js `unlock`), checked against a finished run's summary.

export function unlockMet(unlock, summary) {
  if (!unlock) return false;
  switch (unlock.event) {
    case 'boss': return !!summary.bossKilled;
    case 'win': return !!summary.won;
    case 'kills': return summary.kills >= unlock.count;
    case 'level': return summary.level >= unlock.count;
    default: return false;
  }
}

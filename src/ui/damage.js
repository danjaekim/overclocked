// The end-of-run damage breakdown, from the summary snapshot (the run is gone by then). Pure HTML strings.

export function fmtNum(n) {
  if (n >= 1e6) return (n / 1e6).toFixed(1) + 'M';
  if (n >= 1e4) return Math.round(n / 1e3) + 'k';
  if (n >= 1e3) return (n / 1e3).toFixed(1) + 'k';
  return String(Math.round(n));
}

const pct = (v) => Math.round(v * 100) + '%';

function causeBars(causes, total) {
  if (!causes.length || total <= 0) return '';
  return causes.map((c) => `<div class="bbar"><span>${c.name}</span><i style="--w:${Math.max(2, Math.round((c.dmg / total) * 100))}%"></i><b>${pct(c.dmg / total)}</b></div>`).join('');
}

export function resultsDamageHtml(stats) {
  if (!stats || stats.total <= 0) return '';
  const rows = stats.weapons.map((w) => `<div class="bbar wide"><span>${w.name}<small>${w.kills} kills · ${fmtNum(w.dps)} dps</small></span><i style="--w:${Math.max(2, Math.round((w.dmg / stats.total) * 100))}%"></i><b>${fmtNum(w.dmg)}</b></div>`).join('');
  return `<div class="build-wrap results">
    <h3>Damage</h3>
    <div class="bdps"><div><span>Average</span><b>${fmtNum(stats.avgDps)}</b></div><div><span>Peak</span><b>${fmtNum(stats.peakDps)}</b></div><div><span>Total</span><b>${fmtNum(stats.total)}</b></div></div>
    <h3>By piece</h3>${rows}
    <h3>By source</h3>${causeBars(stats.causes, stats.total)}
  </div>`;
}

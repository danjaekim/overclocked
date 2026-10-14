// Debug helpers, enabled with ?debug=1 (adds a `stress` button and a `lab` panel for trying any
// weapon, branch or masterwork directly). Other URL flags: ?god=1 (no damage), ?seed=N.

export function readParams() {
  const q = new URLSearchParams(window.location.search);
  return {
    enabled: q.get('debug') === '1',
    god: q.get('god') === '1',
    unlockAll: q.get('unlock') === 'all',   // ?unlock=all shows every class as unlocked (not saved)
    classId: q.get('class'),         // ?class=smith starts that class directly, skipping class select
    seed: q.has('seed') ? Number(q.get('seed')) >>> 0 : null,
  };
}

export function createDebug(params) {
  if (params.enabled) {
    // On-screen button so the stress test works on a phone, where there is no console.
    const btn = document.createElement('button');
    btn.textContent = 'stress';
    btn.style.cssText =
      'position:fixed;left:8px;bottom:8px;z-index:5;padding:10px 14px;font:12px monospace;' +
      'background:#222;color:#9fe870;border:1px solid #9fe870;border-radius:6px;opacity:.85';
    btn.addEventListener('click', () => {
      const o = window.__overforged;
      if (o && o.game.run) o.game.run.stress();
    });
    document.body.appendChild(btn);
    const lab = document.createElement('button');
    lab.textContent = 'lab';
    lab.style.cssText = btn.style.cssText.replace('left:8px', 'left:100px');
    lab.addEventListener('click', () => toggleLab());
    document.body.appendChild(lab);
  }
  const dbg = {
    enabled: params.enabled,
    god: params.god,
    fps: 60,
    simMs: 0,
    renderMs: 0,
    worstFrameMs: 0,
    spikes: 0,          // frames whose real interval exceeded 20 ms
    lastSpikeMs: 0,
    onFrameStats(dtReal, simMs, renderMs, frameMs) {
      const a = 0.05;
      dbg.fps += ((dtReal > 0 ? 1 / dtReal : 60) - dbg.fps) * a;
      dbg.simMs += (simMs - dbg.simMs) * a;
      dbg.renderMs += (renderMs - dbg.renderMs) * a;
      if (dtReal > 0.020) { dbg.spikes++; dbg.lastSpikeMs = dtReal * 1000; }
      dbg.worstFrameMs = Math.max(dbg.worstFrameMs * 0.98, frameMs);
    },
    draw(ctx, view, run, extraLines) {
      if (!dbg.enabled) return;
      const lines = [
        `fps ${dbg.fps.toFixed(0)}  sim ${dbg.simMs.toFixed(1)}ms  draw ${dbg.renderMs.toFixed(1)}ms`,
        `spikes ${dbg.spikes} (last ${dbg.lastSpikeMs.toFixed(0)}ms)  work ${dbg.worstFrameMs.toFixed(1)}ms  view ${view.w}x${view.h.toFixed(0)}`,
      ];
      if (dbg.audioState) lines.push(`audio ${dbg.audioState()}  (silent switch? check ringer)`);
      if (run && run.debugLines) lines.push(...run.debugLines());
      if (extraLines) lines.push(...extraLines);
      ctx.font = '11px monospace';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'top';
      const y0 = view.insetTop + 114;
      ctx.fillStyle = 'rgba(0,0,0,0.55)';
      ctx.fillRect(6, y0 - 3, 300, lines.length * 13 + 6);
      ctx.fillStyle = '#9fe870';
      for (let i = 0; i < lines.length; i++) ctx.fillText(lines[i], 10, y0 + i * 13);
    },
  };
  return dbg;
}

// ---- the lab: a debug panel to put any weapon, branch or masterwork on the player in one tap ----

let labEl = null;
async function toggleLab() {
  if (labEl) { labEl.remove(); labEl = null; return; }
  const o = window.__overforged;
  if (!o || !o.game.run) return;
  const [{ WEAPONS }, W, G, D, { MASTERWORKS }, { EVOLUTIONS }] = await Promise.all([
    import('../data/weapons.js'), import('../game/weapons.js'), import('../game/graft.js'),
    import('../game/director.js'), import('../data/grafts.js'), import('../data/evolutions.js'),
  ]);
  const run = () => o.game.run;
  const maxOut = (inst) => { while (W.canLevelUp(inst)) W.levelUpWeapon(run(), inst); return inst; };
  const clear = () => {
    const r = run();
    for (const w of r.player.weapons) { r.player.stats.removeBySource(`weapon:${w.instanceId}:`); r.player.stats.removeBySource(`forge:${w.instanceId}:`); r.player.stats.removeBySource(`graft:${w.instanceId}:`); }
    r.player.weapons.length = 0;
  };
  const calm = () => { run().debug.god = true; run().player.level = 80; };     // no damage, no level-up screens
  const swarm = (n = 40) => {
    const r = run();
    for (let i = 0; i < n; i++) {
      const a = r.rng.next() * Math.PI * 2;
      const d = 80 + r.rng.next() * 220;
      D.spawnEnemy(r, i % 10 === 0 ? 'brute' : i % 7 === 0 ? 'shieldbearer' : 'goblin', r.player.x + Math.cos(a) * d, r.player.y + Math.sin(a) * d);
    }
  };
  const actions = {
    swarm: () => swarm(60),
    elite: () => D.spawnElite(run(), 'brute', run().player.x + 160, run().player.y, run().director.hpScale, 'warded'),
    boss: () => D.spawnEnemy(run(), 'warlord', run().player.x, run().player.y - 260, run().director.hpScale),
    heal: () => { run().player.hp = run().player.maxHp; },
    low: () => { run().player.hp = run().player.maxHp * 0.25; },
    clear,
    star: () => { run().starsteel += 3; },
  };
  const branchIds = EVOLUTIONS.filter((r) => !r.with).map((r) => r.into);
  const row = (title, items) => `<div style="margin:4px 0"><div style="opacity:.7">${title}</div>${items.map(([k, label]) =>
    `<button data-k="${k}" style="margin:2px;padding:6px 8px;font:11px monospace;background:#222;color:#9fe870;border:1px solid #4a6;border-radius:5px">${label}</button>`).join('')}</div>`;
  labEl = document.createElement('div');
  labEl.style.cssText = 'position:fixed;left:6px;right:6px;bottom:52px;max-height:52vh;overflow:auto;z-index:6;background:rgba(0,0,0,.88);color:#9fe870;font:11px monospace;padding:8px;border:1px solid #4a6;border-radius:8px';
  labEl.innerHTML =
    row('Branches and evolutions (replaces your weapons, max level)', branchIds.map((id) => [`w:${id}`, WEAPONS[id].name])) +
    row('Masterworks (host + donor, max level, grafted)', MASTERWORKS.map((m) => [`m:${m.id}`, m.name])) +
    row('Generic graft: pick two evolved weapons', [['gen', 'graft last two']]) +
    row('World', Object.keys(actions).map((k) => [`a:${k}`, k]).concat([['calm', 'god + no level-ups']]));
  labEl.addEventListener('click', (ev) => {
    const b = ev.target.closest('button');
    if (!b || !run()) return;
    const [kind, id] = b.dataset.k.split(':');
    if (kind === 'w') { clear(); maxOut(W.addWeapon(run(), id)); calm(); swarm(); }
    else if (kind === 'm') {
      const m = MASTERWORKS.find((x) => x.id === id);
      clear();
      const h = maxOut(W.addWeapon(run(), m.host));
      const d = maxOut(W.addWeapon(run(), m.donor));
      run().starsteel += 1;
      G.graft(run(), h, d);
      calm(); swarm();
    } else if (kind === 'gen') {
      const ws = run().player.weapons.filter((w) => w.def.rarity === 'evolved' && !w.graft);
      if (ws.length >= 2) { run().starsteel += 1; G.graft(run(), ws[ws.length - 2], ws[ws.length - 1]); }
    } else if (kind === 'a') actions[id]();
    else if (kind === 'calm') calm();
  });
  document.body.appendChild(labEl);
}

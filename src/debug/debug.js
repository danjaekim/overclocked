// Debug helpers, enabled with ?debug=1. Other URL flags: ?god=1 (no damage), ?seed=N.

export function readParams() {
  const q = new URLSearchParams(window.location.search);
  return {
    enabled: q.get('debug') === '1',
    god: q.get('god') === '1',
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
  }
  const dbg = {
    enabled: params.enabled,
    god: params.god,
    fps: 60,
    simMs: 0,
    renderMs: 0,
    worstFrameMs: 0,
    onFrameStats(dtReal, simMs, renderMs, frameMs) {
      const a = 0.05;
      dbg.fps += ((dtReal > 0 ? 1 / dtReal : 60) - dbg.fps) * a;
      dbg.simMs += (simMs - dbg.simMs) * a;
      dbg.renderMs += (renderMs - dbg.renderMs) * a;
      dbg.worstFrameMs = Math.max(dbg.worstFrameMs * 0.98, frameMs);
    },
    draw(ctx, view, run, extraLines) {
      if (!dbg.enabled) return;
      const lines = [
        `fps ${dbg.fps.toFixed(0)}  sim ${dbg.simMs.toFixed(1)}ms  draw ${dbg.renderMs.toFixed(1)}ms`,
        `worst frame ${dbg.worstFrameMs.toFixed(1)}ms  view ${view.w}x${view.h.toFixed(0)}`,
      ];
      if (run && run.debugLines) lines.push(...run.debugLines());
      if (extraLines) lines.push(...extraLines);
      ctx.font = '11px monospace';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'top';
      const y0 = view.insetTop + 54;
      ctx.fillStyle = 'rgba(0,0,0,0.55)';
      ctx.fillRect(6, y0 - 3, 300, lines.length * 13 + 6);
      ctx.fillStyle = '#9fe870';
      for (let i = 0; i < lines.length; i++) ctx.fillText(lines[i], 10, y0 + i * 13);
    },
  };
  return dbg;
}

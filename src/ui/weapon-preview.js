// A live weapon preview for the compendium (M31b): the real engine on a small canvas. One weapon at a
// chosen level, a stream of unkillable goblins walking at a player who strolls in a slow circle (so
// trails, orbits and slams all have something to do). Nothing is recorded: it is always exactly what
// the weapon does now, and it adds no files to the offline cache.

import { createRun } from '../game/run.js';
import { spawnEnemy } from '../game/director.js';
import { addWeapon, levelUpWeapon } from '../game/weapons.js';
import { WEAPONS } from '../data/weapons.js';
import { getSprite } from '../render/sprites.js';
import { fuse } from '../game/fusion.js';
import { FUSION } from '../data/fusions.js';

const VIEW = { w: 480, h: 300, scale: 1, insetTop: 0, isTouch: false };
const STEP = 1 / 60;
const CROWD = 26;
let current = null;

// Level choices for a weapon: the first, a middling one, the last.
export function previewLevels(id) {
  const max = WEAPONS[id].maxLevel;
  return [...new Set([1, Math.min(4, max), max])];
}

export function stopPreview() {
  if (current) current.stop();
  current = null;
}

// `pair` = [hostId, donorId] previews a fusion: both weapons at max level, fused the way the forge does it.
export function startPreview(canvas, weaponId, level, pair = null) {
  stopPreview();
  const def = WEAPONS[weaponId];
  if (!def || !canvas.getContext) return null;
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const cssW = canvas.clientWidth || 480;
  canvas.width = Math.round(cssW * dpr);
  canvas.height = Math.round(cssW * dpr * (VIEW.h / VIEW.w));
  const scale = canvas.width / VIEW.w;
  const view = { ...VIEW, scale };
  const ctx = canvas.getContext('2d', { alpha: false });

  const run = createRun({ seed: 7, view, debug: { god: true }, classId: 'smith' });
  run.director.update = () => {};
  run.player.weapons.length = 0;
  const inst = addWeapon(run, weaponId);
  while (inst.level < Math.min(level, def.maxLevel)) levelUpWeapon(run, inst);
  if (pair) {
    const donor = addWeapon(run, pair[1]);
    while (donor && donor.level < donor.def.maxLevel) levelUpWeapon(run, donor);
    run.starsteel = FUSION.cost;
    if (donor) fuse(run, inst, donor);
    run.toast = null;
  }

  let seed = 12345;
  const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
  const place = (e) => {
    const a = rnd() * Math.PI * 2;
    const d = 80 + rnd() * 110;
    e.x = run.player.x + Math.cos(a) * d;
    e.y = run.player.y + Math.sin(a) * d * 0.7;
  };
  const crowd = [];
  for (let i = 0; i < CROWD; i++) {
    const e = spawnEnemy(run, i % 8 === 0 ? 'brute' : 'goblin', 0, 0);
    if (!e) continue;
    e.hp = e.maxHp = 1e9;
    e.speed = e.def.boss ? e.speed : Math.min(e.speed, 34);
    place(e);
    crowd.push(e);
  }

  let angle = 0;
  let raf = 0;
  let last = 0;
  let acc = 0;
  let dead = false;

  function sim() {
    angle += STEP * 0.9;
    run.update(STEP, { x: Math.cos(angle) * 0.55, y: Math.sin(angle) * 0.55 });
    const p = run.player;
    for (const e of crowd) {
      if (!e.alive) continue;
      const dx = e.x - p.x;
      const dy = e.y - p.y;
      if (dx * dx + dy * dy < 26 * 26 || dx * dx + dy * dy > 340 * 340) place(e);          // recycle: always a crowd, never a pile
    }
  }

  function draw() {
    const p = run.player;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = '#0e0f14';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.setTransform(scale, 0, 0, scale, (VIEW.w / 2 - p.x) * scale, (VIEW.h / 2 - p.y + 6) * scale);
    ctx.strokeStyle = '#1a1c26';
    ctx.lineWidth = 1;
    ctx.beginPath();
    const x0 = Math.floor((p.x - VIEW.w / 2) / 64) * 64;
    const y0 = Math.floor((p.y - VIEW.h / 2) / 64) * 64;
    for (let x = x0; x <= p.x + VIEW.w / 2; x += 64) { ctx.moveTo(x, p.y - VIEW.h); ctx.lineTo(x, p.y + VIEW.h); }
    for (let y = y0; y <= p.y + VIEW.h / 2; y += 64) { ctx.moveTo(p.x - VIEW.w, y); ctx.lineTo(p.x + VIEW.w, y); }
    ctx.stroke();
    run.drawWorld(ctx, view);
    const spr = getSprite(p.classId, false);
    if (spr) {
      ctx.save();
      ctx.translate(p.x, p.y - 8);
      if (p.facingX < -0.2) ctx.scale(-1, 1);
      ctx.drawImage(spr, -34, -36, 68, 68);
      ctx.restore();
    } else {
      ctx.fillStyle = '#e8a33d';
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx.fill();
    }
    run.drawWeapons(ctx);
    run.drawFx(ctx, view);
  }

  function frame(t) {
    if (dead) return;
    if (!canvas.isConnected) { api.stop(); return; }                 // the entry closed or the overlay went away
    raf = requestAnimationFrame(frame);
    if (document.hidden) { last = 0; return; }
    if (!last) last = t;
    acc = Math.min(acc + (t - last) / 1000, 0.1);
    last = t;
    while (acc >= STEP) { sim(); acc -= STEP; }
    draw();
  }

  const api = {
    stop() { dead = true; cancelAnimationFrame(raf); if (current === api) current = null; },
  };
  current = api;
  raf = requestAnimationFrame(frame);
  return api;
}

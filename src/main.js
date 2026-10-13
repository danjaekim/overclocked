// Overforged — scaffold shell.
// Fixed-timestep loop, DPR-aware canvas, joystick input, and a placeholder player.
// Game systems (weapons, upgrades, forge, enemies) are intentionally not here yet.

import { createInput } from './input.js';

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
const input = createInput(canvas);

const STEP = 1 / 60;
const PLAYER_SPEED = 220; // world units per second

const state = {
  player: { x: 0, y: 0, r: 14 },
  cam: { x: 0, y: 0 },
  view: { w: 0, h: 0, dpr: 1 },
};

function resize() {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const w = window.innerWidth;
  const h = window.innerHeight;
  canvas.width = Math.round(w * dpr);
  canvas.height = Math.round(h * dpr);
  state.view = { w, h, dpr };
}
window.addEventListener('resize', resize);
window.addEventListener('orientationchange', resize);
resize();

function update(dt) {
  const move = input.getMove();
  state.player.x += move.x * PLAYER_SPEED * dt;
  state.player.y += move.y * PLAYER_SPEED * dt;
  state.cam.x = state.player.x;
  state.cam.y = state.player.y;
}

function drawGrid() {
  const { w, h } = state.view;
  const size = 64;
  const offX = -((state.cam.x % size) + size) % size;
  const offY = -((state.cam.y % size) + size) % size;
  ctx.strokeStyle = '#1a1c26';
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let x = offX; x < w; x += size) {
    ctx.moveTo(x, 0);
    ctx.lineTo(x, h);
  }
  for (let y = offY; y < h; y += size) {
    ctx.moveTo(0, y);
    ctx.lineTo(w, y);
  }
  ctx.stroke();
}

function drawStick() {
  const s = input.getStick();
  if (!s.active) return;
  ctx.strokeStyle = 'rgba(255,255,255,0.25)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(s.ox, s.oy, s.maxRadius, 0, Math.PI * 2);
  ctx.stroke();
  const dx = s.x - s.ox;
  const dy = s.y - s.oy;
  const len = Math.hypot(dx, dy) || 1;
  const k = Math.min(len, s.maxRadius) / len;
  ctx.fillStyle = 'rgba(255,255,255,0.35)';
  ctx.beginPath();
  ctx.arc(s.ox + dx * k, s.oy + dy * k, 22, 0, Math.PI * 2);
  ctx.fill();
}

function render() {
  const { w, h, dpr } = state.view;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.fillStyle = '#0e0f14';
  ctx.fillRect(0, 0, w, h);

  drawGrid();

  // Player is always screen-centered; the world scrolls under it.
  ctx.fillStyle = '#e8a33d';
  ctx.beginPath();
  ctx.arc(w / 2, h / 2, state.player.r, 0, Math.PI * 2);
  ctx.fill();

  drawStick();
}

let last = performance.now();
let acc = 0;
function frame(now) {
  acc += Math.min((now - last) / 1000, 0.1); // clamp to avoid spiral after tab switch
  last = now;
  while (acc >= STEP) {
    update(STEP);
    acc -= STEP;
  }
  render();
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

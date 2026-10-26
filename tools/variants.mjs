// Balance variant runner (docs/balance-playbook.md). Runs tools/bench.mjs once per variant (and per class and bot
// policy), in parallel child processes, with the variant's data overrides in the environment, then prints one table.
//
//   node tools/variants.mjs <spec.json> [--seeds 100] [--jobs 2] [--out <dir>]
//
// spec.json:
//   {
//     "mode": "bots",                       // "bots": win rates from full bot runs; "dps": max-level weapon DPS
//     "classes": ["archer", "mage"],        // bots: the classes each variant is played with
//     "policies": ["plain", "smart"],       // bots: the bot's upgrade policy (tools/bench.mjs BOT_POLICY)
//     "spend": "none",                      // bots: what the bot buys with starsteel (none | quench | all)
//     "weapons": ["ember_bow"],             // dps: the weapons to measure
//     "variants": [
//       { "name": "base" },
//       { "name": "rain", "classOverride": { "archer": { "trait": { "rain": { ... } } } } },
//       { "name": "embers", "weaponOverride": { "ember_bow": { "triggers": [ ... ] } } },
//       { "name": "slam", "sfOverride": { "slam": { "frac": 0.3 } } }
//     ]
//   }
// Override shapes are the ones tools/bench.mjs reads: CLASS_OVERRIDE (addMods, mods, trait, dropTrait, startWeapon),
// WEAPON_OVERRIDE (base, triggers, levels, baseMods) and SF_OVERRIDE (Starforge mutation numbers).
//
// The table gives each bots row a win rate with its standard error. Two rows whose difference is under about two
// standard errors are not different: run more seeds before believing it.

import { spawn } from 'node:child_process';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { cpus, tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const opt = (n, d) => (args.includes(n) ? args[args.indexOf(n) + 1] : d);
const specPath = args.find((a) => a.endsWith('.json'));
if (!specPath) { console.error('usage: node tools/variants.mjs <spec.json> [--seeds 100] [--jobs 2] [--out dir]'); process.exit(1); }
const spec = JSON.parse(readFileSync(specPath, 'utf8'));
const mode = spec.mode || 'bots';
const seeds = Number(opt('--seeds', mode === 'dps' ? 3 : 100));
const jobs = Number(opt('--jobs', Math.max(1, cpus().length)));
const outDir = opt('--out', join(tmpdir(), 'overclocked-variants'));
mkdirSync(outDir, { recursive: true });

// One bench invocation per (variant, class, policy) for bots, per variant for dps.
const tasks = [];
for (const v of spec.variants) {
  const env = {
    ...process.env,
    CLASS_OVERRIDE: v.classOverride ? JSON.stringify(v.classOverride) : '',
    WEAPON_OVERRIDE: v.weaponOverride ? JSON.stringify(v.weaponOverride) : '',
    SF_OVERRIDE: v.sfOverride ? JSON.stringify(v.sfOverride) : '',
    ENEMY_OVERRIDE: v.enemyOverride ? JSON.stringify(v.enemyOverride) : '',
    ...(v.env || {}),                                   // extra environment for the bench (e.g. BOT_FORGE=full)
  };
  for (const k of ['CLASS_OVERRIDE', 'WEAPON_OVERRIDE', 'SF_OVERRIDE', 'ENEMY_OVERRIDE']) if (!env[k]) delete env[k];
  if (mode === 'dps') {
    tasks.push({ v, key: v.name, args: ['--dps', '--json', '--seeds', String(seeds)], env: { ...env, DPS_IDS: (spec.weapons || []).join(',') || undefined } });
    if (!tasks[tasks.length - 1].env.DPS_IDS) delete tasks[tasks.length - 1].env.DPS_IDS;
  } else {
    for (const cls of spec.classes || ['archer']) {
      for (const pol of spec.policies || ['plain']) {
        tasks.push({ v, cls, pol, key: `${v.name}|${cls}|${pol}`, args: ['--bots', '--json', '--seeds', String(seeds), '--class', cls], env: { ...env, BOT_POLICY: pol, BOT_SPEND: spec.spend || 'none' } });
      }
    }
  }
}

function run(task) {
  return new Promise((resolve) => {
    const ch = spawn(process.execPath, [join(here, 'bench.mjs'), ...task.args], { env: task.env, stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '';
    let err = '';
    ch.stdout.on('data', (d) => { out += d; });
    ch.stderr.on('data', (d) => { err += d; });
    ch.on('close', (code) => {
      try { task.result = JSON.parse(out); } catch { task.error = `exit ${code}: ${err.split('\n').slice(0, 4).join(' ')}`; }
      process.stderr.write(`  done ${task.key}${task.error ? ' (error)' : ''}\n`);
      resolve();
    });
  });
}

const queue = tasks.slice();
const t0 = Date.now();
process.stderr.write(`${tasks.length} bench runs, ${seeds} seeds each, ${jobs} at a time\n`);
await Promise.all(Array.from({ length: Math.min(jobs, queue.length) }, async () => { while (queue.length) await run(queue.shift()); }));
process.stderr.write(`finished in ${Math.round((Date.now() - t0) / 1000)} s\n`);

const pad = (v, n) => String(v).padEnd(n);
const mean = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0);
const summary = [];

if (mode === 'dps') {
  const base = tasks[0].result && tasks[0].result.dps;
  console.log(`\nWEAPON DPS  (max level, no class, no star; mean of ${seeds} seeds; % against the first variant)`);
  console.log(pad('variant', 26) + pad('weapon', 18) + pad('single', 16) + pad('held', 16) + pad('live', 16));
  for (const t of tasks) {
    if (t.error) { console.log(pad(t.v.name, 26) + t.error); continue; }
    for (const r of t.result.dps) {
      const b = base && base.find((x) => x.id === r.id);
      const cell = (m) => {
        const pct = b && b[m] > 0 && t !== tasks[0] ? ` ${r[m] >= b[m] ? '+' : ''}${Math.round((r[m] / b[m] - 1) * 100)}%` : '';
        return pad(`${Math.round(r[m])}${pct}`, 16);
      };
      console.log(pad(t.v.name, 26) + pad(r.id, 18) + cell('single') + cell('held') + cell('flow'));
      summary.push({ variant: t.v.name, ...r });
    }
  }
} else {
  console.log(`\nBOT WIN RATES  (${seeds} seeds per row; ± is one standard error; spend ${spec.spend || 'none'})`);
  console.log(pad('variant', 26) + pad('class', 11) + pad('bot', 7) + pad('won', 15) + pad('avg lvl', 9) + pad('kills', 8) + pad('lvl@5:00', 10) + pad('hp@5:00', 9) + 'deaths (median s)');
  for (const t of tasks) {
    if (t.error) { console.log(pad(t.v.name, 26) + pad(t.cls, 11) + pad(t.pol, 7) + t.error); continue; }
    const runs = t.result.bots[t.cls];
    const n = runs.length;
    const w = runs.filter((r) => r.won).length;
    const p = w / n;
    const se = Math.sqrt((p * (1 - p)) / n);
    const at5 = runs.filter((r) => r.at300).map((r) => r.at300);
    const deaths = runs.filter((r) => !r.won).map((r) => r.time).sort((a, b) => a - b);
    const row = {
      variant: t.v.name, cls: t.cls, policy: t.pol, won: w, n, rate: p, se,
      level: mean(runs.map((r) => r.level)), kills: mean(runs.map((r) => r.kills)),
      level5: mean(at5.map((a) => a.level)), hp5: mean(at5.map((a) => a.hp)),
      deathMedian: deaths.length ? deaths[Math.floor(deaths.length / 2)] : null,
    };
    summary.push(row);
    console.log(pad(row.variant, 26) + pad(row.cls, 11) + pad(row.policy, 7) + pad(`${w}/${n} ${Math.round(p * 100)}%±${Math.round(se * 100)}`, 15)
      + pad(row.level.toFixed(1), 9) + pad(Math.round(row.kills), 8) + pad(row.level5.toFixed(1), 10) + pad(Math.round(row.hp5), 9) + (row.deathMedian ?? '-'));
  }
}
const file = join(outDir, `${(specPath.split('/').pop() || 'spec').replace(/\.json$/, '')}-${mode}-${Date.now()}.json`);
writeFileSync(file, JSON.stringify({ spec, seeds, summary, raw: tasks.map((t) => ({ key: t.key, result: t.result, error: t.error })) }, null, 1));
console.log(`\nfull results: ${file}`);

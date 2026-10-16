# Balance playbook

How to find and fix a balance problem in Overforged, for a class, a weapon (including its evolutions), a Starforge
mutation or a masterwork graft. Written after the Archer rework (M43, M43b in `docs/architecture.md`), which is the
worked example: read those two rows before starting.

The rule that matters most: **fix the cause, not the symptom.** A flat "+20% damage" usually makes the numbers
right and the class or weapon no more interesting. Find out *why* it is weak (what it fails to do in a real fight),
then give it something that answers that, and measure that it worked.

## 1. Tools

All headless, deterministic, no dependencies. Run from the repo root.

| Tool | What it answers |
|---|---|
| `node tools/bench.mjs --bots --class <id> --seeds N [--json]` | Bot win rate, level, kills, level and hp at 5:00, death times, the bot's build at 5:00 and at the end |
| `node tools/bench.mjs --dps` | Max-level DPS per weapon: single target, pinned crowd of 24, live crowd of 40 walking goblins. `DPS_IDS=a,b` narrows it |
| `node tools/bench.mjs --starforge` / `--masterworks` | A weapon (or masterwork graft at +15) with and without its Starforge mutation. `STAR_ONLY=`, `MW_ONLY=` narrow them |
| `node tools/bench.mjs --classes` | The same four builds played by every class: a class's damage multiplier on equal footing |
| `node tools/diag-class.mjs <class> [seeds]` | How a class's damage actually lands in bot play: enemies hit per arrow, distance of hits (Long Shot), time moving (Fleet), damage by source and cause, deaths. `DIAG_END=600` for the whole run (default first 300 s) |
| `node tools/variants.mjs <spec.json> [--seeds N]` | Runs any set of variants (data overrides) in parallel and prints one table, with standard errors on win rates. Specs live in `tools/specs/` |

Overrides (environment variables read by `tools/bench.mjs`; `variants.mjs` sets them from the spec):

- `CLASS_OVERRIDE` `{"archer":{"addMods":[...],"mods":[...],"trait":{...},"dropTrait":["dodge"],"startWeapon":"forge_hammer"}}`
- `WEAPON_OVERRIDE` `{"ember_bow":{"base":{...},"levels":[...],"triggers":[...],"baseMods":[...]}}`
- `SF_OVERRIDE` `{"slam":{"frac":0.3}}` (Starforge mutation numbers)
- `BOT_POLICY=smart` a bot that chases evolution requirements and the perks and passives that scale what it holds.
  The default (`plain`) bot is greedy and naive (about 1.7 weapons at 5:00, ignores evolution requirements).
- `BOT_SPEND=none|quench|all` what the bot buys with starsteel. Use `none` for class and weapon work so Starforge does
  not blur the comparison.
- `BENCH_CLASS=<id>` puts a class kit back into the weapon measurements (by default they use no class at all).

Spec example (`tools/specs/archer-rain-tune.json` is a real one):

```json
{
  "mode": "bots",
  "classes": ["archer"],
  "policies": ["plain", "smart"],
  "variants": [
    { "name": "current" },
    { "name": "rain-every3", "classOverride": { "archer": { "trait": { "rain": { "every": 3, "...": "..." } } } } }
  ]
}
```

For weapon work use `"mode": "dps"` and `"weapons": ["ember_bow", "storm_volley", "sunpiercer"]`.

## 2. Targets

- **Classes (bot win rate, 200 seeds, `BOT_SPEND=none`).** At M43b: Berserker, Saint and Smith 91-98% on both bots;
  Summoner 74% (plain) / 99% (smart); Mage 60% / 85% (before M44); Archer 67% / 77%. After M44 the Mage is 76% / 94%. A class far below the others on *both* bots
  has a problem. The bot cannot dodge, so these are relative standings, not how hard a human finds the class.
- **Weapons (`--dps`, live crowd is the column that matters most for survival).** An evolution beats its base weapon
  in every column, or evolving is pointless. Peers of the same tier sit within about 2x of each other. A weapon that
  is weak in the live crowd but fine on a single target is a crowd problem; fix it with area, more shots or a
  mechanic, not damage.
- **Starforge mutations.** About +20-40% crowd damage on its weapon; none more than 2x the median.
- **Masterworks.** A star multiplies a masterwork by about 1.0-1.6x; more than that means the mutation is feeding the
  graft's triggers (see M42b, Glacier Maul).

## 3. Procedure for a class

1. **Baseline.** Every class, 200 seeds, both bots (`classes` = all six in a spec with one `current` variant). Write
   the numbers down; seeds 1-30 are harder than average, so never compare a 30-seed run with a 200-seed one.
2. **Diagnose.** `diag-class.mjs` for the class and for a healthy class with a similar role, at `DIAG_END=300` and
   `600`. Questions: does it fall behind early (damage and level at 5:00) or late (deaths after 5:00)? Does its
   damage reach crowds (hits per projectile, blasts share) or one enemy at a time? Do its traits actually fire in
   play (distance for Long Shot, time moving for Fleet)? What do the other classes have that it lacks (sustain,
   area, crowd control)?
3. **Separate weapon from kit.** Swap start weapons with `CLASS_OVERRIDE startWeapon`: the weak class with a
   healthy class's weapon, and a healthy class with the weak class's weapon. If the weak class is fine with
   another weapon, the weapon is the problem; if the healthy class is fine with the weak weapon, the kit is.
   **Only swap between classes the bot plays the same way:** the bot wades in with the melee classes
   (`MELEE` in `tools/bench.mjs`: Smith, Berserker, Saint), so a melee class with a ranged weapon is not a valid test.
4. **Check the bot is not the cause.** Run the same comparison with `BOT_POLICY=smart`. If the smart bot lifts every
   class but the gap stays, the problem is real.
5. **Hypotheses as variants.** Write a spec with one change per variant first, then the promising combinations.
   Changes interact (the Archer's Rain of Arrows did nothing alone, Quiver little alone, together +18 points), so
   always test the pairs. 100 seeds to sort the field, 200 to decide.
6. **Prefer mechanics that give the class an identity.** The class should be better than others at something. For
   the Archer: every ranged weapon fires one more shot, and a rain that grows with those shots.
7. **Implement in the data and code**, then measure **the shipped data** again at 200 seeds without overrides. The
   shipped version differs from the override in small ways (the Archer's rain reach went from 360 to 240 to stay on
   screen, and that cost 6 points).
8. **Look at it.** Run it in a phone-sized browser and screenshot it (see the Playwright scripts in earlier
   milestones): every effect must be visible, on screen, and readable.
9. **Record.** A row in `docs/architecture.md` with the diagnosis, what was tried, the numbers and what was
   rejected; a row in `docs/roadmap.md`; bump `src/version.js`; tests for each new mechanic.

## 4. Procedure for a weapon

1. **Measure the family.** `--dps` for the weapon, its evolutions and two or three peers of the same tier.
2. **Find the weak column.** Single target (bosses), pinned crowd (area effects at their best) or live crowd (what
   keeps you alive). The pinned crowd flatters area effects badly (Comet read +889% there and +13% live): trust the
   live crowd.
3. **Variants in `"mode": "dps"`.** Change one thing at a time: the level path (`levels`), base numbers (`base`),
   on-hit effects (`triggers`). Make sure the evolution stays ahead of the base weapon.
4. **Check it in play.** Bot win rates for the class that starts with the weapon, or for any class with
   `CLASS_OVERRIDE startWeapon`, so a DPS gain that does nothing for survival shows up.
5. **If it has a Starforge mutation or masterworks**, rerun `--starforge` / `--masterworks` for it.
6. **Record** as for a class.

## 5. Pitfalls (each one cost time once)

- **Noise.** 30 seeds is about ±9 points of win rate; 100 is about ±5; 200 about ±3. `variants.mjs` prints the
  standard error: a difference under two of them is not a difference.
- **Hit-trigger cascades.** A weapon's `hit` triggers fire on every non-DoT hit it deals, including its own
  explosions, down to the trigger depth limit. An on-hit explosion therefore sets off explosions of explosions
  (Embers read about 37x before the fix). Give such triggers `direct: true` (only depth-0 hits), and be suspicious of
  any number that jumps several-fold.
- **Measurements need a neutral class.** The weapon benches used the Archer's kit until M43b; once the Archer gained
  Quiver and Rain of Arrows every weapon number moved. They now run with no class.
- **Off-screen effects.** The play area is a phone (480 wide in the benches). An effect that reaches further than
  about 240 from the player happens where the player cannot see it, and kills there drop gems out of magnet reach.
- **The bot's blind spots.** It forges only its first weapon, never grafts, cannot dodge and kites with every
  non-melee class. Results are comparisons between classes and variants, not absolute difficulty.
- **Second-order hits.** A mutation or effect that re-hits enemies can re-fire grafts' hit triggers (Aftershock and
  Glacier Maul's shatter, M42b). Secondary hits should resolve at depth 1 or more.
- **Forcing a status in a test.** `e.status` is rebuilt from the timers (`burnT`, `chill`/`chillT`, `shockT`) every tick;
  set the timers too, or the mask is wiped before the kill is processed (M44 test).
- **Live-crowd DPS is noisy.** Arc Bolt read 259 -> 1919 live for a 2x change in targets plus a burst; trust win
  rates over that column when it moves several-fold.
- **Tests that assume a class.** Many tests run as the Archer (the default class). A kit change breaks tests that
  were really about something else: fix their setup (another class, or switch the trait off) rather than weakening
  the assertion, and say why in a comment.

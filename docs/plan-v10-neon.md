# Plan: the Neon Noir look (v0.10.0 to v0.10.3)

Dan picked this on 2026-11-02 from the concept sheet (https://claude.ai/artifact/W9KBoUa4Vw9YsSA69C3M4t): look **A, Neon
Noir**, with one rule taken from look C. **Every enemy type gets one bold silhouette and one colour.** The game moves from
fantasy woodcut ink (goblins, ogres, a forge) to a cyberpunk street at night, which suits chains, batteries and overloads.

Nothing about the rules changes. Every number, rule and screen stays. Only the art, effects, HUD, menus and names change.
There are four milestones, and each one is one push to main. Run them in order, then stop at the playtest gate.

## The look in one paragraph

A rain-slick city block at night. The floor is near-black asphalt with a faint violet grid, and soft pools of pink and cyan
light sit on it like reflections in puddles. **Cyan is the player's colour:** your rig, your shots and your battery. **Hot colours are
threats:** each enemy type is a dark body with one bright accent in its own colour. Gold is money and loot. The HUD is
dark glass panels with clipped corners and thin cyan edges. Text is a squared techno face for labels and numbers, and a mono face for
small data.

## Palette (put these in `src/data/palette.js`, one export, every file reads from it)

| Token | Hex | Used for |
| --- | --- | --- |
| `bg` | `#07060d` | page and floor base |
| `floor` | `#0d0b16` | floor cells |
| `grid` | `rgba(138,92,255,0.16)` | floor grid lines |
| `panel` | `rgba(10,8,20,0.84)` | HUD and menu panels |
| `ink` | `#e7e6ef` | text |
| `dim` | `#8f8ea6` | secondary text |
| `rig` | `#5ee7ff` | player, rig shots, battery, chain highlights |
| `rigHot` | `#e9fdff` | the white core of rig glows |
| `gold` | `#ffd23f` | gold, chests, loot, the workbench |
| `xp` | `#39ff88` | XP shards (was green gems) |
| `danger` | `#ff2e97` | player hurt, low battery, warnings |
| `fire` | `#ff7a1a` | burn |
| `frost` | `#b9c8ff` | chill and freeze (pale periwinkle, kept apart from the rig's cyan) |
| `storm` | `#fff04a` | shock |

Chain colours (`CHAIN_COLORS` in `src/rig/pieces.js`) become `['#5ee7ff', '#ff4fd8', '#b6ff3b', '#ffb02e']`. Chain A
matches the rig, and the others are clearly different hues.

## Enemy cast: one silhouette, one colour each

| id (unchanged) | New name | Silhouette | Accent |
| --- | --- | --- | --- |
| `goblin` | Street Drone | small hexagon, one glowing eye | `#ff2e97` pink |
| `brute` | Bruiser | big square body, clipped corners, visor bar | `#ff8a1f` orange |
| `shieldbearer` | Riot Unit | rectangle with a wide shield plate in front | `#4f7bff` blue |
| `slinger` | Spitter | arrowhead pointing at you | `#b6ff3b` lime |
| `splitter` | Swarm Pod | circle split into 3 segments | `#ff3b5c` red |
| `shaman` | Hacker | diamond with two antennae | `#c86bff` violet |
| `crusher` | Wrecker | wide hammerhead block | `#ff8a1f` orange, with a white stripe |
| `warlord` (boss) | Enforcer | large walker: square hull, two arms, red visor | `#ff2e97` and white |
| `seer` (boss) | Oracle | floating ring with an eye in the middle and orbiting dots | `#c86bff` and white |
| `crate` | Cargo Drop | crate with gold hazard corners | `gold` |

Elites keep the sprite of their own enemy and get a white outline ring plus a small affix glyph. The affix bodies in
`elite-art.js` are restyled to match: swift gets speed lines, armoured gets plates, volatile gets a warning triangle,
regenerating gets a plus, and warded gets a hex shield.

Player: **Runner**. A cyan chevron inside a thin cyan ring, with a white core. It's one sprite, used for the rig run.

Loot and props:
- XP gems 0-3 become **data shards**: green, cyan-green, violet and gold by tier. Each is a slim diamond.
- Ore becomes a gold **credit chip**.
- The chest becomes a **cargo case** and the boss chest a **vault case**. Both are gold.
- The shrine becomes a **terminal**: a black-market workbench console with a gold screen.

## Ground rules for whoever runs this

- **Before starting:**
  - Read `docs/architecture.md` (render section) and skim each file in `src/render/`.
  - Sprites are SVG strings (`sprite-art.js` is generated, plus the hand-written `boss-art.js` and `elite-art.js`). Each is rasterized once to a 192 px canvas by `src/render/sprites.js`, which also builds the white hurt-flash copy.
  - The floor is `src/render/ground.js`: procedural 64-unit cells, with `THEMES` picked by `?ground=`.
  - Menus and screens are HTML in `index.html` and `src/ui/`. The service worker is `sw.js`.
- **Keep it simple.** Restyle what exists; add no new screens, settings, animations or game rules. Keep every sprite id, enemy id and save key unchanged, so saves, tests and benches keep working. Only `name:` strings and other text the player reads change.
- **Performance is a hard rule.** A late run has 300+ enemies on a phone.
  - Never set `ctx.shadowBlur` or a canvas `filter` inside a per-entity draw.
  - Bake glow into the SVG instead (`feGaussianBlur` in the sprite's own `<filter>`). Sprites are rasterized once, so glow there costs nothing per frame.
  - For effect glows (rings, shots), draw a wider low-alpha stroke under the bright one, or use `globalCompositeOperation = 'lighter'` on a few big effects only.
  - Run `node tests/smoke.mjs --ui` and compare the `simMs`/fps it prints against main before your change. Flag any frame-time increase over 15%.
- **Readability over prettiness.** At phone scale, you must be able to tell each enemy type apart by shape alone, and the player must never be confused with an enemy. Cyan belongs to the rig only. No enemy uses cyan or pale blue.
- **Fonts work offline.**
  - Self-host two faces in `fonts/`: Chakra Petch (700) for labels and numbers, and IBM Plex Mono (500) for small data. Use woff2 and Latin subset files only. Both are OFL licensed; add the licence text in `fonts/OFL.txt`.
  - Load them with `@font-face` in `index.html`, and list them in `sw.js` `SHELL`.
  - Bump `CACHE` in `sw.js` (to `overclocked-v2`) so phones pick up the new files.
  - Canvas text needs the faces loaded: draw HUD text only after `document.fonts.ready`, or accept the first frame in the fallback face.
- **Tests:**
  - `node tests/run.mjs` must pass before every push.
  - Run the browser smokes on every milestone: `node tests/smoke.mjs --ui`, `node tests/run-smoke.mjs`, `node tests/resume-smoke.mjs` and `node tests/offline.mjs` (the font files must be cached).
  - Tests that check a name or a colour string: update them to the new values. Never delete one to get green.
- **Screenshots for Dan:**
  - At the end of each milestone, take one phone-sized screenshot of a run at about 3:00 with a crowd: `node tests/smoke.mjs --ui --shot <path>`. Extend the smoke's options if it can't reach a busy moment.
  - Save it to `/mnt/project-files/neon/<version>.png` and attach it to the thread reply. Dan judges the look on his phone, so the screenshot is the main review.
- **Versioning:**
  - Bump `src/version.js`.
  - The commit message starts with `vX.Y.Z:`.
  - Add a short "Look" section to `docs/overclocked-spec.md` in M1 that points here, and keep the cast table there up to date.
  - Push to main once the tests pass. Dan doesn't need to approve each push.

---

## M1, v0.10.0: palette, floor, HUD and menus

**Goal.** The world and every panel are Neon Noir. Sprites are still the old ones, and that's fine for one push.

1. Add `src/data/palette.js` with the tokens above and `CHAIN_COLORS` from it. `pieces.js` re-exports the chain colours, so imports elsewhere keep working.
2. Add a `neon` theme to `THEMES` in `ground.js` and make it the default (keep the old themes behind `?ground=`). Each cell gets:
   - the `floor` colour with a hairline `grid` edge on two sides;
   - about one cell in six gets a soft puddle of light, a radial gradient of pink or cyan at 0.10-0.16 alpha, 40-90 units wide, picked by the cell hash so it's stable;
   - about one cell in twelve gets a faint road marking: a short dashed line in `rgba(255,255,255,0.06)`.
   - Cache each cell to an offscreen canvas if `ground.js` doesn't already. The floor must stay cheap.
   - No falling rain over the play area in this plan. It hurts readability with 300 enemies.
3. HUD (`hud.js`, `rig-hud.js`):
   - Panels use `panel` with clipped corners (a 6-8 px chamfer) and a 1 px `rig` edge at 0.5 alpha.
   - The chain badge uses its chain colour. A lit slot gets a `rig` edge and `rigHot` text, and an unlit one `dim`.
   - The battery is a segmented bar (20 segments) in `rig`, turning `danger` below 25%.
   - Timer and level: Chakra Petch 15-17 px, timer in `rig` and level in `danger`.
4. Menus (`index.html` CSS and `src/ui/`):
   - Swap the CSS variables to the palette: `--bg`, `--panel`, `--ink`, `--dim`, and `--ember` becomes `--accent: rig`. Keep a `--gold`.
   - Buttons get the clipped-corner look, a cyan edge, and a filled cyan state on press.
   - Card tags keep their type colours: weapon, modifier and trigger colours from `TYPE_COLOR`. Bring those into the palette so they don't fight the neon: weapon `#ff8a1f`, modifier `#c86bff`, trigger `#5ee7ff`.
   - The title screen shows OVERCLOCKED in Chakra Petch with a thin cyan underline. No new animation.
5. Self-hosted fonts and `sw.js` as in the ground rules.
6. **Acceptance:**
   - Screenshot posted.
   - Smoke frame time within 15% of main.
   - `node tests/offline.mjs` passes with the fonts cached.

## M2, v0.10.1: sprites

**Goal.** Every sprite is in the new cast, one silhouette and one colour per type.

1. Add `src/render/neon-art.js` exporting `NEON_ART`, keyed by the existing sprite ids, as hand-written SVG on the same `SPRITE_VIEWBOX` (`-6 -6 76 76`, a 64-unit design grid).
   - In `sprites.js`, merge it last: `{ ...BASE_ART, ...ELITE_ART, ...BOSS_ART, ...NEON_ART }`. The old art stays in the repo, unused, so this is easy to roll back. Don't delete it in this plan.
2. Style of every sprite:
   - a dark body (`#15131f` to `#1d1a2b`) with a 2-3 unit stroke in the type's accent;
   - one bright feature (an eye, visor or core) in the accent with a baked glow: a blurred copy under it via a `<filter>` with `feGaussianBlur stdDeviation 2-3`, then the sharp shape on top;
   - a soft dark ellipse shadow under ground units, as the old art has;
   - no outlines in cyan, which belongs to the rig.
3. Player: the rig run uses `classId: 'smith'`, so override the `smith` id with the Runner. Leave a one-line comment in `neon-art.js` saying so. Override the other class ids with the same Runner too; they aren't reachable in Overclocked.
4. Enemies, bosses and elites as in the cast table. Set each enemy's `color` in `src/data/enemies.js` to its accent, since the renderer falls back to discs in that colour before the art loads.
5. Loot and props: data shards (gem0-3), credit chip (`ore_iron`; `ore_starsteel` is a bigger chip), cargo case (`chest`), vault case (`bosschest`), terminal (`shrine`) and cargo drop (`crate`).
6. Check the hurt flash (white silhouette) and status tints still read on the new shapes, since they're built from the sprite.
7. **Acceptance:**
   - Screenshot posted, with at least five enemy types visible.
   - In that screenshot, every type can be told apart by shape.
   - Smoke frame time within 15% of main.

## M3, v0.10.2: effects

**Goal.** Shots, blasts, statuses and numbers glow like neon without costing frame time.

1. Rig shots (`shots.js`): a bright core line in `rigHot` over a wider `rig` stroke at about 0.35 alpha, with no `shadowBlur`.
   - Shots from chains B to D use their chain colour for the outer stroke.
   - Enemy shots use `danger` with a dark core, so they never look like yours.
2. Novas, Slam shockwaves and Mortar blasts (`melee.js`, `auras.js`, `fx.js`):
   - Novas and blasts are a ring in the chain's colour, with an outer glow stroke at low alpha.
   - Slam shockwaves turn from dust to a white-cyan shock ring with a few spark lines.
3. Statuses keep their hues, moved to the palette: burn in `fire`, chill and freeze in `frost`, and shock in `storm`.
   - Reaction effects (steam, shatter, overload, plasma, static) keep their shapes and take palette colours. Steam is a pale violet cloud.
4. Damage numbers in Chakra Petch:
   - white normally, `gold` for crits, `danger` for damage you take;
   - keep their current sizes.
5. Pickup and level-up flashes: XP shards sparkle in `xp`, gold in `gold`, and level up is a cyan ring burst.
6. Payload rings from `drawRig` (the big white-edged ring): keep the white edge, and draw the colour ring in the chain colour.
7. **Acceptance:**
   - Screenshot posted, taken during a Nova or a payload burst.
   - Smoke frame time within 15% of main.
   - No `shadowBlur` in any per-entity path. Show it by running `grep -rn shadowBlur src/` and explaining every hit in the commit message.

## M4, v0.10.3: names and words

**Goal.** Everything the player reads matches the new world.

1. Enemy `name:` strings per the cast table. Ids don't change.
2. Text in `src/ui/`:
   - Result and treasure lines: "The Warlord is slain." becomes "The Enforcer is down.", and "Warlord's hoard" becomes "Enforcer's vault".
   - Anything that says forge, shrine, ore, anvil or gem becomes, in order: workbench, terminal, credits, terminal, data shard.
   - Use `grep -rni "forge\|shrine\|ore\b\|anvil\|gem\|goblin\|warlord\|seer\|ogre" src/ui src/data src/game` to find them.
   - Skip code identifiers, and only change the strings a player sees.
3. The compendium:
   - Enemy and boss entries use the new names.
   - Add a one-line flavour description per enemy if the compendium shows one.
4. App icons: `tools/make-icons.py` already draws a cyan bolt on a dark tile. Leave it, unless the bolt clashes with the new cyan, in which case match it to `rig`.
5. Update the cast table in the spec's Look section.
6. **Acceptance:**
   - A grep for goblin, ogre, warlord, seer, forge and anvil in player-facing strings (`src/ui`, and `name:`/`desc:` in `src/data`) finds nothing.
   - Final screenshot posted.

## Playtest gate

Stop here. Dan plays on his phone and says what to tune: glow strength, puddle density, enemy colours, panel opacity. Each
of those should be a one-line change in `palette.js` or `ground.js`.

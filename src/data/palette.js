// The Neon Noir palette (docs/plan-v10-neon.md). Every colour the look uses comes from here, so a playtest note like
// "less glow" or "pinker" is a one-line change. Cyan (`rig`) belongs to the player and the rig only: no enemy uses it.

export const PALETTE = {
  bg: '#07060d',                          // page and floor base
  floor: '#0d0b16',                       // floor cells
  grid: 'rgba(138,92,255,0.16)',          // floor grid lines
  panel: 'rgba(10,8,20,0.84)',            // HUD and menu panels
  ink: '#e7e6ef',                         // text
  dim: '#8f8ea6',                         // secondary text
  rig: '#5ee7ff',                         // player, rig shots, battery, chain highlights
  rigHot: '#e9fdff',                      // the white core of rig glows
  gold: '#ffd23f',                        // gold, chests, loot, the workbench
  xp: '#39ff88',                          // XP shards
  danger: '#ff2e97',                      // player hurt, low battery, warnings
  fire: '#ff7a1a',                        // burn
  frost: '#b9c8ff',                       // chill and freeze (pale periwinkle, apart from the rig's cyan)
  storm: '#fff04a',                       // shock
  pink: '#ff4fd8',
  lime: '#b6ff3b',
  amber: '#ffb02e',
  violet: '#c86bff',
  orange: '#ff8a1f',
  blue: '#4f7bff',
  red: '#ff3b5c',
};

export const CHAIN_COLORS = [PALETTE.rig, PALETTE.pink, PALETTE.lime, PALETTE.amber];   // chains A to D
export const TYPE_COLOR = { weapon: PALETTE.orange, modifier: PALETTE.violet, trigger: PALETTE.rig };   // piece types
export const PUDDLE_COLORS = ['255,46,151', '94,231,255', '138,92,255'];                // floor light pools: pink, cyan, violet
export const PUDDLE_CHANCE = 1 / 6;                                                      // share of floor cells that hold a light pool
export const MARKING_CHANCE = 1 / 12;                                                    // share of floor cells with a road marking

// Chassis (docs/overclocked-spec.md, "Chassis"): what a chain is built on. A chassis fixes the chain's rule card, how many
// slots it starts with and can grow to, its battery and recharge rate, and one quirk. Data and pure helpers only.
//
//   battery    energy the chain can hold. Activations spend it; it never refills on its own at an activation
//   recharge   energy a second flowing back in, up to the battery. `chargeWhile` limits it to moving or standing still
//   quirk      changes how the chain compiles or charges:
//                power        every attack's power x this
//                costAdd      every piece costs this much more
//                elemBoost    a weapon with an element gets the same-element-twice boost for each (reactions.js INTENSIFY), and Steam/Plasma/Static cool down KILN_REACT as long
//                area         every weapon's area (radius, range, arc, jump) x 1 + this (Anchor)
//                payloadEcho  each payload run is repeated { delay, mult } later, for free (rig.js)
//                payloadPower payloads hit x this harder
//                killCharge   energy each enemy kill (anyone's) adds
//
// A chassis comes in marks 1 to MK_MAX: each mark past the first adds a starting slot (up to its max), MK_BATTERY of its
// battery and MK_RECHARGE recharge. A chain also keeps what was bought for it: `charge` (+CHARGE_STEP recharge each)
// and `cell` (+CELL_STEP of the base battery each). Both are lost when the chassis is replaced.

export const RELAY_ECHO = { delay: 0.15, mult: 0.6, pool: 8 };   // Relay: the second run of a payload, seconds later, at this share of the power, from a free pool this big for anything nested in it
export const KILN_REACT = 0.5;                          // Kiln: Steam, Plasma and Static cooldowns x this

export const CHASSIS = {
  standard: { name: 'Standard', rule: 'pulse', slots: 3, max: 6, battery: 10, recharge: 6, quirk: {}, desc: 'Fires every 1 s, no quirk; room for 6 slots' },
  capacitor: { name: 'Capacitor', rule: 'charge', slots: 4, max: 6, battery: 24, recharge: 5, quirk: { power: 1.5 }, desc: 'Fires when its battery is full (at most once a second), at x1.5 power' },
  overdrive: { name: 'Overdrive', rule: 'rapid', slots: 3, max: 4, battery: 8, recharge: 8, quirk: { costAdd: 1 }, desc: 'Fires every 0.6 s; pieces cost 1 more' },
  kiln: { name: 'Kiln', rule: 'pulse', slots: 4, max: 6, battery: 12, recharge: 6, quirk: { elemBoost: true }, desc: 'Elements here hit as if held twice (stronger burn, chill, shock); Steam, Plasma and Static fire twice as often' },
  relay: { name: 'Relay', rule: 'pulse', slots: 5, max: 6, battery: 14, recharge: 6, quirk: { payloadEcho: RELAY_ECHO }, desc: 'Every payload goes off twice: again 0.15 s later at 60%, for free' },
  strider: { name: 'Strider', rule: 'stride', slots: 4, max: 6, battery: 10, recharge: 7, chargeWhile: 'moving', quirk: {}, desc: 'Fires every 80 px you move, so move speed is its fire rate; recharges only while moving' },
  anchor: { name: 'Anchor', rule: 'anchor', slots: 4, max: 6, battery: 16, recharge: 8, chargeWhile: 'still', quirk: { power: 1.6, area: 0.5 }, desc: 'Turret: fires and recharges only while you stand still, at x1.6 power and +50% area' },
  reaper: { name: 'Reaper', rule: 'reaper', slots: 4, max: 5, battery: 12, recharge: 5, quirk: { killCharge: 0.3 }, desc: 'Fires on kills (twice a second at most), or every 3 s if nothing dies; every kill adds 0.3 energy' },
};

export const START_CHASSIS = 'standard';
export const MK_MAX = 3;
export const MK_BATTERY = 0.25;
export const MK_RECHARGE = 1;
export const CHARGE_STEP = 1;
export const CELL_STEP = 0.5;

// The chassis a bare rule card stands for (sandbox presets and old saves name a rule, not a chassis).
const BY_RULE = { pulse: 'standard', stride: 'strider', anchor: 'anchor', reaper: 'reaper', charge: 'capacitor', rapid: 'overdrive' };
// Chassis cut in v0.9.0 (Long frame, Spite) become Standard on old saves, keeping mark, pieces, charge and cell.
export function migrateChassis(c) {
  if (c && (c.chassis === 'long' || c.chassis === 'spite' || c.rule === 'spite')) { c.chassis = START_CHASSIS; c.rule = 'pulse'; }
  return c;
}

export const chassisForRule = (rule) => BY_RULE[rule] || START_CHASSIS;

export const MK_NAMES = ['', 'Mk I', 'Mk II', 'Mk III'];

// A chain's numbers: { start, max, battery, recharge } for chain state { chassis, mk, charge, cell }.
export function chassisStats(ch) {
  const d = CHASSIS[ch.chassis] || CHASSIS[START_CHASSIS];
  const mk = Math.max(1, Math.min(MK_MAX, ch.mk || 1));
  return {
    start: Math.min(d.max, d.slots + mk - 1),
    max: d.max,
    battery: Math.round(d.battery * (1 + MK_BATTERY * (mk - 1) + CELL_STEP * (ch.cell || 0))),
    recharge: d.recharge + MK_RECHARGE * (mk - 1) + CHARGE_STEP * (ch.charge || 0),
  };
}

// Replacing a chain with the same chassis at an equal or higher mark keeps what was bought for it (recharge and battery upgrades).
export const keepsUpgrades = (old, chassis, mk = 1) => old.chassis === chassis && (old.mk || 1) <= mk;

export const chassisName = (ch) => `${(CHASSIS[ch.chassis] || CHASSIS[START_CHASSIS]).name} ${MK_NAMES[Math.max(1, Math.min(MK_MAX, ch.mk || 1))]}`;

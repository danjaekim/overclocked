// The request a behavior's fire() answers: "make one attack, from here". Behaviors that can fire on
// request (mortar, nova, projectile) take one of these instead of reading the player's position, so a
// weapon's own cooldown and a rig chain (src/rig) share the same attack code.
//   in:  x, y   where the attack starts          mult  damage multiplier (Scatter copies are 0.25)
//        da     aim offset in radians            atk   the rig's attack token, or null
//   out: ax, ay, aa   where fire() aimed (what attackTriggers wants)

export function makeFireCtx() {
  return { x: 0, y: 0, mult: 1, da: 0, atk: null, ax: 0, ay: 0, aa: 0 };
}

const AUTO = makeFireCtx();

// The context a weapon uses when it fires on its own cooldown: from the player, at full power.
export function playerCtx(p) {
  AUTO.x = p.x;
  AUTO.y = p.y;
  AUTO.mult = 1;
  AUTO.da = 0;
  AUTO.atk = null;
  return AUTO;
}

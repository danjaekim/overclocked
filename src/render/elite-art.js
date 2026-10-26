// Hand-drawn elite bodies, one per affix, in the same woodcut ink style as the rest of the art (sprite-art.js, 64x64 grid).
// An elite wears the body of its first affix instead of a bigger copy of its normal enemy; render/entities.js picks
// `elite_<affix>` and falls back to the enemy's own sprite for an affix with no body here.

const HEAD = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="-6 -6 76 76"><defs><filter id="rough" x="-8%" y="-8%" width="116%" height="116%"><feTurbulence type="fractalNoise" baseFrequency="0.07" numOctaves="2" seed="4" result="n"/><feDisplacementMap in="SourceGraphic" in2="n" scale="2.6"/></filter></defs>';
const INK = '<g filter="url(#rough)" fill="#1d1713" stroke="#e9dcc0" stroke-width="2" stroke-linejoin="round" stroke-linecap="round">';
const art = (shadow, body, face = '') => `${HEAD}${shadow}${INK}${body}</g>${face}</svg>`;
const shadow = (rx) => `<ellipse cx="32" cy="60" rx="${rx}" ry="3.2" fill="#000" opacity=".3"/>`;

export const ELITE_ART = {
  // Swift: a lean cutthroat caught mid-lunge, a long scarf streaming behind it and wings on its boots.
  elite_swift: art(shadow(16),
    '<g transform="rotate(-9 32 52)">' +
      '<path d="M26 31 Q6 26 -3 36 Q8 33 2 44 Q16 38 22 38 Z" fill="#6cf0c8"/>' +              // the scarf
      '<path d="M20 36 L6 33 M18 40 L2 42" stroke="#1d1713" stroke-width="1" fill="none"/>' +
      '<path d="M22 56 L8 50 L12 60 Z M42 56 L56 50 L50 60 Z" fill="#e9dcc0" stroke-width="1.4"/>' + // boot wings
      '<ellipse cx="23" cy="57" rx="6" ry="3"/><ellipse cx="42" cy="57" rx="6" ry="3"/>' +
      '<path d="M24 56 L26 48 M40 56 L38 48" fill="none" stroke="#e9dcc0" stroke-width="5"/>' +
      '<path d="M24 56 L26 48 M40 56 L38 48" fill="none" stroke="#2f7f6c" stroke-width="2.4"/>' +
      '<ellipse cx="32" cy="42" rx="10" ry="12" fill="#2f7f6c"/>' +
      '<path d="M26 36 H38 M25 42 H39" stroke="#1d1713" stroke-width="1.2" fill="none"/>' +
      '<path d="M43 34 L62 24 L58 31 L45 40 Z" fill="#e9dcc0" stroke-width="1.4"/>' +           // a blade in the lead hand
      '<circle cx="43" cy="38" r="4.500" fill="#3fb89a"/>' +
      '<circle cx="21" cy="40" r="4" fill="#3fb89a"/>' +
      '<path d="M21 28 Q22 11 33 11 Q44 12 43 28 L40 22 H25 Z" fill="#2f7f6c"/>' +              // the hood
      '<circle cx="32" cy="27" r="10.500" fill="#3fb89a"/>' +
    '</g>',
    '<g transform="rotate(-9 32 52)"><ellipse cx="28" cy="27" rx="2.800" ry="3.400" fill="#1d1713"/><ellipse cx="37" cy="27" rx="2.800" ry="3.400" fill="#1d1713"/>' +
    '<ellipse cx="28" cy="27.400" rx="1.800" ry="2.400" fill="#6cf0c8"/><ellipse cx="37" cy="27.400" rx="1.800" ry="2.400" fill="#6cf0c8"/>' +
    '<path d="M24 22 l6 2.500 M41 22 l-6 2.500" stroke="#1d1713" stroke-width="1.800" stroke-linecap="round"/>' +
    '<path d="M28 33 Q32.500 36 37 33" fill="none" stroke="#1d1713" stroke-width="1.600" stroke-linecap="round"/></g>' +
    '<path d="M2 14 H14 M0 20 H10 M4 26 H12" stroke="#6cf0c8" stroke-width="1.400" stroke-linecap="round" opacity=".8"/>'),

  // Armoured: a knight sealed in plate: horned helm with one glowing slit, great pauldrons, a riveted breastplate.
  elite_armoured: art(shadow(25),
    '<ellipse cx="22" cy="58" rx="8" ry="3.500" fill="#8fa3b8"/><ellipse cx="42" cy="58" rx="8" ry="3.500" fill="#8fa3b8"/>' +
    '<path d="M14 30 L50 30 L46 54 L18 54 Z" fill="#8fa3b8"/>' +                                    // breastplate
    '<path d="M32 30 V54 M18 42 H46" stroke="#1d1713" stroke-width="1.600" fill="none"/>' +
    '<circle cx="23" cy="36" r="1.500" fill="#e9dcc0" stroke-width="0"/><circle cx="41" cy="36" r="1.500" fill="#e9dcc0" stroke-width="0"/>' +
    '<circle cx="23" cy="49" r="1.500" fill="#e9dcc0" stroke-width="0"/><circle cx="41" cy="49" r="1.500" fill="#e9dcc0" stroke-width="0"/>' +
    '<path d="M2 26 Q4 12 18 14 L20 34 Q8 38 2 26 Z" fill="#a9b8c9"/>' +                        // pauldrons
    '<path d="M62 26 Q60 12 46 14 L44 34 Q56 38 62 26 Z" fill="#a9b8c9"/>' +
    '<path d="M6 22 L16 20 M6 28 L16 26 M58 22 L48 20 M58 28 L48 26" stroke="#1d1713" stroke-width="1.200" fill="none"/>' +
    '<path d="M56 56 L58 22" stroke="#e9dcc0" stroke-width="6" fill="none"/><path d="M56 56 L58 22" stroke="#6b5a48" stroke-width="2.800" fill="none"/>' +  // a mace
    '<circle cx="58" cy="17" r="7.500" fill="#8fa3b8"/><path d="M58 9 V25 M50 17 H66" stroke="#1d1713" stroke-width="1.400" fill="none"/>' +
    '<path d="M21 17 L15 5 L25 12 Z M43 17 L49 5 L39 12 Z" fill="#e9dcc0"/>' +                  // horns
    '<path d="M20 14 Q20 3 32 3 Q44 3 44 14 L44 26 L32 31 L20 26 Z" fill="#8fa3b8"/>',          // the helm
    '<path d="M24 14 Q32 11 40 14" fill="none" stroke="#1d1713" stroke-width="1.400"/>' +
    '<path d="M23 19 H41 V22.500 H23 Z" fill="#1d1713"/><rect x="26" y="19.800" width="12" height="1.800" fill="#e8531e"/>' +
    '<path d="M32 22 V29 M27 25.500 H37" stroke="#1d1713" stroke-width="1.200" fill="none"/>'),

  // Volatile: a bomber stuffed with powder; a lit fuse on its head and molten cracks all over the body.
  elite_volatile: art(shadow(19),
    '<ellipse cx="23" cy="58" rx="6" ry="3"/><ellipse cx="41" cy="58" rx="6" ry="3"/>' +
    '<ellipse cx="32" cy="42" rx="20" ry="17" fill="#4a2b22"/>' +                                 // the keg of a body
    '<path d="M13 36 Q32 42 51 36 M13 48 Q32 54 51 48" stroke="#e9dcc0" stroke-width="2" fill="none"/>' +  // hoops
    '<path d="M24 30 L28 40 L24 46 L30 56 M42 32 L38 40 L44 47 M33 33 L35 42" stroke="#ff7a3a" stroke-width="2.200" fill="none"/>' + // cracks
    '<path d="M24 30 L28 40 L24 46 L30 56 M42 32 L38 40 L44 47 M33 33 L35 42" stroke="#ffd9a0" stroke-width=".8" fill="none"/>' +
    '<circle cx="9" cy="40" r="6" fill="#4a2b22"/><circle cx="55" cy="40" r="6" fill="#4a2b22"/>' + // little fists
    '<circle cx="9" cy="40" r="2.600" fill="#ff7a3a" stroke-width="0"/><circle cx="55" cy="40" r="2.600" fill="#ff7a3a" stroke-width="0"/>' +
    '<path d="M32 10 Q36 4 33 -2" stroke="#e9dcc0" stroke-width="2.400" fill="none"/>' +          // the fuse
    '<circle cx="32" cy="23" r="12.500" fill="#6b3a2a"/>',
    '<circle cx="33" cy="-2" r="3.600" fill="#ffe14d" stroke="#e8531e" stroke-width="1.400"/><circle cx="33" cy="-2" r="1.400" fill="#ffffff"/>' +
    '<path d="M27 6 l-5 -4 M38 5 l5 -5 M34 -8 l1 -4" stroke="#ffe14d" stroke-width="1.400" stroke-linecap="round"/>' +
    '<ellipse cx="27" cy="23" rx="3.200" ry="3.800" fill="#1d1713"/><ellipse cx="37" cy="23" rx="3.200" ry="3.800" fill="#1d1713"/>' +
    '<circle cx="27" cy="23.400" r="2" fill="#ffe14d"/><circle cx="37" cy="23.400" r="2" fill="#ffe14d"/>' +
    '<path d="M21 17 l7 3 M43 17 l-7 3" stroke="#1d1713" stroke-width="2" stroke-linecap="round"/>' +
    '<path d="M24 29 Q32 36 40 29 Z" fill="#1d1713"/><path d="M26 29.600 l1.600 3 l1.600 -3 M34.800 29.600 l1.600 3 l1.600 -3" fill="#e9dcc0"/>'),

  // Regenerating: a mossy troll hunched over its own wounds, sprouts coming up through the hide.
  elite_regenerating: art(shadow(24),
    '<ellipse cx="22" cy="58" rx="8" ry="3.500" fill="#5b7a43"/><ellipse cx="43" cy="58" rx="8" ry="3.500" fill="#5b7a43"/>' +
    '<path d="M8 50 Q4 30 22 26 Q32 22 42 26 Q60 30 56 50 Q32 62 8 50 Z" fill="#6f9455"/>' +   // the hunched back
    '<path d="M14 36 q4 -3 8 0 M32 30 q4 -3 8 0 M42 40 q4 -3 8 0 M18 46 q4 -3 8 0" stroke="#4a6b36" stroke-width="2.400" fill="none"/>' +  // moss
    '<path d="M18 30 q-3 -9 2 -13 q4 4 -2 13 M34 26 q-2 -9 3 -12 q3 4 -3 12 M48 33 q1 -9 7 -10 q0 6 -7 10" fill="#8fd16a" stroke-width="1.400"/>' + // sprouts
    '<circle cx="9" cy="50" r="8" fill="#6f9455"/><circle cx="55" cy="50" r="8" fill="#6f9455"/>' +
    '<path d="M4 46 h10 M50 46 h10" stroke="#1d1713" stroke-width="1.200" fill="none"/>' +
    '<circle cx="24" cy="44" r="3.200" fill="#b6ff9a" stroke-width="1.200"/><circle cx="43" cy="48" r="2.600" fill="#b6ff9a" stroke-width="1.200"/>' + // mending wounds
    '<path d="M25 18 q-6 -12 2 -14 q4 4 0 14 M38 18 q6 -12 -2 -14 q-4 4 0 14" fill="#8fd16a" stroke-width="1.400"/>' +  // leaf crown
    '<circle cx="32" cy="27" r="12" fill="#7ea75f"/>',
    '<ellipse cx="27.500" cy="27" rx="2.800" ry="3.200" fill="#1d1713"/><ellipse cx="36.500" cy="27" rx="2.800" ry="3.200" fill="#1d1713"/>' +
    '<circle cx="27.500" cy="27.400" r="1.700" fill="#b6ff9a"/><circle cx="36.500" cy="27.400" r="1.700" fill="#b6ff9a"/>' +
    '<path d="M22 22 l7 2.500 M42 22 l-7 2.500" stroke="#1d1713" stroke-width="1.800" stroke-linecap="round"/>' +
    '<path d="M26 33 Q32 37 38 33" fill="none" stroke="#1d1713" stroke-width="1.800" stroke-linecap="round"/>' +
    '<path d="M28.500 33.400 l1 2.400 l1.100 -2.200" fill="#e9dcc0"/>'),

  // Warded: a robed warden behind a great runed shield, rune-stones circling it; the shield bubble in the game is its ward.
  elite_warded: art(shadow(20),
    '<path d="M16 56 L20 28 Q32 22 44 28 L48 56 Q32 62 16 56 Z" fill="#3b4a78"/>' +                    // the robe
    '<path d="M22 56 L24 36 M32 58 V34 M42 56 L40 36" stroke="#1d1713" stroke-width="1.200" fill="none"/>' +
    '<path d="M16 50 Q32 56 48 50" fill="none" stroke="#9cc4ff" stroke-width="2"/>' +                  // trim
    '<path d="M4 20 L22 14 L40 20 L40 44 L22 58 L4 44 Z" fill="#7f9fd8"/>' +                          // the shield
    '<path d="M22 14 V58 M4 32 H40" stroke="#1d1713" stroke-width="1.600" fill="none"/>' +
    '<path d="M22 24 L29 32 L22 42 L15 32 Z" fill="#cfe4ff" stroke-width="1.400"/>' +
    '<circle cx="22" cy="32" r="2.600" fill="#6fa8ff" stroke-width="0"/>' +
    '<path d="M56 60 L54 14" stroke="#e9dcc0" stroke-width="6" fill="none"/><path d="M56 60 L54 14" stroke="#6b5a48" stroke-width="2.800" fill="none"/>' +   // the staff
    '<path d="M54 14 L47 6 L54 -2 L61 6 Z" fill="#9cc4ff"/><circle cx="54" cy="6" r="2.200" fill="#ffffff" stroke-width="0"/>' +
    '<circle cx="46" cy="40" r="4.600" fill="#5a74b0"/>' +
    '<path d="M18 30 Q18 8 32 8 Q46 8 46 30 L40 22 H24 Z" fill="#3b4a78"/>' +                          // the hood
    '<circle cx="33" cy="25" r="10" fill="#5a74b0"/>',
    '<ellipse cx="29" cy="25" rx="2.600" ry="3.200" fill="#1d1713"/><ellipse cx="38" cy="25" rx="2.600" ry="3.200" fill="#1d1713"/>' +
    '<circle cx="29" cy="25.400" r="1.600" fill="#bfe0ff"/><circle cx="38" cy="25.400" r="1.600" fill="#bfe0ff"/>' +
    '<path d="M24 20 l7 2.500 M43 20 l-7 2.500" stroke="#1d1713" stroke-width="1.800" stroke-linecap="round"/>' +
    '<path d="M29 31 H38" stroke="#1d1713" stroke-width="1.800" stroke-linecap="round"/>' +
    '<g fill="#cfe4ff" stroke="#1d1713" stroke-width="1"><path d="M4 8 l4 -4 l4 4 l-4 4 Z"/><path d="M40 -4 l3 -3 l3 3 l-3 3 Z" transform="translate(-6 8)"/><path d="M52 34 l3 -3 l3 3 l-3 3 Z" transform="translate(6 8)"/></g>'),
};

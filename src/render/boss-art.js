// Hand-drawn boss and heavy-enemy sprites (woodcut ink style, 64x64 grid, same filter as sprite-art.js / elite-art.js).

const HEAD = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="-6 -6 76 76"><defs><filter id="rough" x="-8%" y="-8%" width="116%" height="116%"><feTurbulence type="fractalNoise" baseFrequency="0.07" numOctaves="2" seed="4" result="n"/><feDisplacementMap in="SourceGraphic" in2="n" scale="2.6"/></filter></defs>';
const INK = '<g filter="url(#rough)" fill="#1d1713" stroke="#e9dcc0" stroke-width="2" stroke-linejoin="round" stroke-linecap="round">';

export const BOSS_ART = {
  // Crusher: a hulking stone-plated ogre, one cracked slab on its shoulder and a heavy fist raised to slam.
  crusher: HEAD + '<ellipse cx="32" cy="60" rx="25" ry="3.4" fill="#000" opacity=".3"/>' + INK +
    '<ellipse cx="20" cy="57" rx="9" ry="4" fill="#5b5f66"/><ellipse cx="44" cy="57" rx="9" ry="4" fill="#5b5f66"/>' +
    '<ellipse cx="32" cy="42" rx="24" ry="18" fill="#7d828b"/>' +
    '<path d="M14 36 L24 30 L26 42 L16 48 Z M38 32 L50 36 L48 48 L38 44 Z" fill="#9aa0aa" stroke-width="1.6"/>' +
    '<path d="M30 34 L33 40 L29 46 L33 52" fill="none" stroke="#1d1713" stroke-width="1.4"/>' +
    '<path d="M44 34 L52 28" stroke="#7d828b" stroke-width="9" fill="none"/>' +
    '<circle cx="53" cy="22" r="11" fill="#5b5f66"/>' +
    '<path d="M46 20 l3 -4 M52 14 l1 -4 M58 17 l4 -2" stroke="#e9dcc0" stroke-width="1.6" fill="none"/>' +
    '<path d="M6 30 L16 24 L24 34 L14 44 Z" fill="#9aa0aa"/>' +
    '<path d="M10 32 L16 38 M14 28 L18 34" stroke="#1d1713" stroke-width="1.2" fill="none"/>' +
    '<circle cx="31" cy="24" r="12" fill="#7d828b"/>' +
    '<path d="M21 17 L18 7 L26 13 Z M41 17 L44 7 L36 13 Z" fill="#e9dcc0" stroke-width="1.2"/>' +
    '</g>' +
    '<path d="M23 22 l7 3 M39 22 l-7 3" stroke="#1d1713" stroke-width="2.4" stroke-linecap="round"/>' +
    '<circle cx="26" cy="26" r="2" fill="#e8531e"/><circle cx="36" cy="26" r="2" fill="#e8531e"/>' +
    '<path d="M25 32 Q31 36 37 32" fill="none" stroke="#1d1713" stroke-width="2"/></svg>',

  // Ashen Seer: a hooded cinder-priest in a violet robe, antlers of bone, a burning orb held aloft in one hand.
  seer: `${HEAD}<ellipse cx="30" cy="60" rx="24" ry="3.4" fill="#000" opacity=".3"/>${INK}` +
    '<path d="M10 60 Q6 38 20 24 L42 24 Q56 38 52 60 Z" fill="#3b2a4a"/>' +                      // the robe
    '<path d="M12 56 Q31 63 50 56" fill="none" stroke="#e8531e" stroke-width="2.4"/>' +           // ember hem
    '<path d="M16 52 l2 -5 l2 5 M26 56 l2 -6 l2 6 M38 56 l2 -6 l2 6" fill="none" stroke="#ffd34d" stroke-width="1.4"/>' + // runes
    '<path d="M20 30 Q31 36 42 30 L40 40 Q31 44 22 40 Z" fill="#2a1d36" stroke-width="1.4"/>' +    // collar
    '<path d="M18 30 Q16 8 31 6 Q46 8 44 30 Q31 22 18 30 Z" fill="#3b2a4a"/>' +                 // the hood
    '<ellipse cx="31" cy="21" rx="9" ry="9.500" fill="#0d0a08" stroke-width="1.4"/>' +           // the face in shadow
    '<path d="M22 10 L14 0 L19 3 L12 -3 M20 6 L9 4 M40 10 L48 0 L43 3 L50 -3 M42 6 L53 4" fill="none" stroke="#e9dcc0" stroke-width="2.600"/>' + // antlers
    '<path d="M44 34 L54 24" fill="none" stroke="#e9dcc0" stroke-width="7"/>' +                  // the raised arm
    '<path d="M44 34 L54 24" fill="none" stroke="#3b2a4a" stroke-width="3.600"/>' +
    '<circle cx="57" cy="15" r="9" fill="#e8531e"/>' +                                           // the orb
    '<path d="M57 4 l-3 -6 l6 3 Z M65 12 l5 -3 l-2 6 Z M50 9 l-6 -2 l5 5 Z" fill="#ffd34d" stroke-width="1"/>' +
    '<circle cx="57" cy="15" r="4.500" fill="#ffd34d" stroke="none"/>' +
    '<circle cx="14" cy="36" r="4" fill="#e9dcc0" stroke-width="1.4"/>' +                        // the other hand, open
    '</g>' +
    '<ellipse cx="26" cy="21" rx="2.600" ry="3" fill="#ffd34d"/><ellipse cx="36" cy="21" rx="2.600" ry="3" fill="#ffd34d"/>' +
    '<circle cx="26" cy="21.500" r="1" fill="#1d1713"/><circle cx="36" cy="21.500" r="1" fill="#1d1713"/>' +
    '<circle cx="8" cy="22" r="1.400" fill="#ffd34d"/><circle cx="4" cy="30" r="1" fill="#e8531e"/><circle cx="14" cy="14" r="1" fill="#e8531e"/></svg>',
};

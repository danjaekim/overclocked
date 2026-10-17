// The compendium's data model (M16): every weapon, evolution, technique, passive, forge effect and
// build, generated from the data files so the guide can never drift from the game. Pure functions,
// no DOM; ui/compendium.js renders them.
//
// An entry: { tab, id, name, glyph, rarity, elements[], cat, classes[], summary, lines[], builds[], text }
//   elements  subset of fire / frost / storm (empty = neutral)    cat  a facet value within the tab
//   lines     detail rows shown when the entry is opened          builds  names of builds that use it

import { WEAPONS } from '../data/weapons.js';
import { PERKS } from '../data/perks.js';
import { PASSIVES } from '../data/passives.js';
import { EVOLUTIONS } from '../data/evolutions.js';
import { AFFIXES, ENHANCE, QUENCH } from '../data/forge.js';
import { STARFORGE, MUTATIONS } from '../data/starforge.js';
import { RESONANCE } from '../data/resonance.js';
import { CLASSES } from '../data/classes.js';
import { BUILDS } from '../data/builds.js';
import { RARITIES } from '../data/rarities.js';
import { describe as describeReq } from './evolution.js';
import { masterworkFor } from './fusion.js';
import { MASTERWORKS, FUSION, PAYLOADS, SHAPE_PAYLOAD } from '../data/fusions.js';

export const ELEMENTS = ['fire', 'frost', 'storm'];
export const TABS = [
  { id: 'weapons', label: 'Weapons' },
  { id: 'evolve', label: 'Evolve' },
  { id: 'techniques', label: 'Techniques' },
  { id: 'passives', label: 'Passives' },
  { id: 'fusions', label: 'Fusions' },
  { id: 'forge', label: 'Forge' },
  { id: 'builds', label: 'Builds' },
];

const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
const elementsOf = (tags) => ELEMENTS.filter((e) => tags.includes(e));
const ENABLER = { kindling: 'fire', frostbite: 'frost', static_charge: 'storm' };

// 'tag:fire' -> "a Fire weapon", 'perk:kindling:2' -> "Kindling 2", 'class:berserker' -> "the Berserker class"
function requireText(token) {
  const [kind, id, lvl] = token.split(':');
  if (kind === 'tag') return ELEMENTS.includes(id) ? `a ${cap(id)} weapon` : `a ${id} weapon`;
  if (kind === 'perk') return `${PERKS[id].name}${lvl ? ` ${lvl}` : ''}`;
  if (kind === 'class') return `the ${CLASSES[id].name} class`;
  return token;
}
export function requiresText(requires) {
  if (!requires || requires.length === 0) return 'Always available';
  return requires.map((any) => any.map(requireText).join(' or ')).join(', and ');
}

function perkElements(id, def) {
  const out = new Set();
  if (ENABLER[id]) out.add(ENABLER[id]);
  for (const t of def.affinity || []) if (ELEMENTS.includes(t)) out.add(t);
  for (const any of def.requires || []) for (const tok of any) {
    const [kind, v] = tok.split(':');
    if (kind === 'tag' && ELEMENTS.includes(v)) out.add(v);
    if (kind === 'perk' && ENABLER[v]) out.add(ENABLER[v]);
  }
  return ELEMENTS.filter((e) => out.has(e));
}

export function perkCategory(id, def) {
  if (def.rarity === 'epic') return 'Alloy';
  if (id === 'headsman') return 'Execute';
  if (def.rule) return 'Payoff';
  if (ENABLER[id]) return 'Enabler';
  if ((def.requires || []).some((any) => any.some((t) => t === 'tag:projectile'))) return 'Projectile';
  if ((def.requires || []).some((any) => any.some((t) => t === 'tag:close' || t === 'tag:arc'))) return 'Close range';
  if (perkElements(id, def).length) return 'Amplifier';
  return 'General';
}

function recipeLines(recipe) {
  return recipe.requires.map((r) => describeReq(r, recipe));
}

function weaponEntry(id, def, buildsFor) {
  const evolved = def.pool === false;
  const lines = [def.desc];
  for (const r of EVOLUTIONS.filter((x) => x.into === id)) {
    lines.push(r.with
      ? `Made by combining ${WEAPONS[r.from].name} with ${WEAPONS[r.with].name}: ${recipeLines(r).join(', ')}.`
      : `Made by evolving ${WEAPONS[r.from].name}: ${recipeLines(r).join(', ')}.`);
  }
  def.levelText.forEach((t, i) => lines.push(`Level ${i + 2}: ${t}`));
  if (def.baseMods && def.baseMods.length) lines.push('Comes with a built-in elemental effect.');
  for (const r of EVOLUTIONS.filter((x) => x.from === id || x.with === id)) {
    const into = WEAPONS[r.into].name;
    lines.push(r.with
      ? `Combines with ${WEAPONS[r.with === id ? r.from : r.with].name} into ${into}: ${recipeLines(r).join(', ')}.`
      : `Evolves into ${into}: ${recipeLines(r).join(', ')}.`);
  }
  if (def.forge && def.forge.tempers) {
    for (const lvl of Object.keys(def.forge.tempers)) lines.push(`+${lvl} temper: ${def.forge.tempers[lvl].map((t) => t.name).join(' or ')}.`);
  }
  const classes = def.class ? [def.class] : [];
  return {
    tab: evolved ? 'evolve' : 'weapons', id, name: def.name, glyph: def.glyph, rarity: def.rarity,
    elements: elementsOf(def.tags),
    cat: def.tags.includes('close') ? 'Close range' : def.behavior === 'summon' ? 'Summon' : 'Ranged',
    classes, summary: def.desc, lines, builds: buildsFor('weapon', id),
  };
}

// Plain names for the donor shapes, for the Fusions tab.
const SHAPE_LABEL = {
  projectile: 'Arrow', arc: 'Melee swing', orbit: 'Orbiting', aura: 'Ring', bolt: 'Bolt', nova: 'Shard burst', mortar: 'Mortar',
  summon: 'Hound', judge: 'Pillar', boomerang: 'Thrown disc', trail: 'Trail', pulse: 'Pulse', slam: 'Slam', chain: 'Chain lightning', rod: 'Planted rod',
};

// A build that ends in a masterwork would give its name and pair away, so it stays hidden until that masterwork is found.
export function buildVisible(b, found) {
  if (!b.end || !b.end.fuse) return true;
  const m = masterworkFor(b.end.fuse[0], b.end.fuse[1]);
  return !m || found.has(m.id);
}

export function buildEntries(discovered = { fusions: [] }) {
  const foundIds = new Set(discovered.fusions || []);
  const visibleBuilds = BUILDS.filter((b) => buildVisible(b, foundIds));
  const buildsFor = (kind, id) => visibleBuilds.filter((b) => (kind === 'weapon' ? b.weapons : b.perks).includes(id)).map((b) => b.name);
  const out = [];

  for (const [id, def] of Object.entries(WEAPONS)) out.push(weaponEntry(id, def, buildsFor));

  for (const [id, def] of Object.entries(PERKS)) {
    const lines = [def.desc, `Offered when: ${requiresText(def.requires)}.`];
    def.levelText.forEach((t, i) => lines.push(`Level ${i + 1}: ${t}`));
    out.push({
      tab: 'techniques', id, name: def.name, glyph: def.glyph, rarity: def.rarity,
      elements: perkElements(id, def), cat: perkCategory(id, def), classes: [],
      summary: def.desc, lines, builds: buildsFor('perk', id),
    });
  }

  for (const [id, def] of Object.entries(PASSIVES)) {
    const lines = [def.desc];
    def.levelText.forEach((t, i) => lines.push(`Level ${i + 1}: ${t}`));
    const evo = EVOLUTIONS.filter((r) => r.requires.some((q) => q.passive === id));
    for (const r of evo) lines.push(`Needed to evolve ${WEAPONS[r.from].name}.`);
    out.push({
      tab: 'passives', id, name: def.name, glyph: def.glyph || def.name[0], rarity: def.rarity,
      elements: [], cat: cap(def.tags[0] || 'general'), classes: [], summary: def.desc, lines, builds: [],
    });
  }

  for (const [id, a] of Object.entries(AFFIXES)) {
    out.push({
      tab: 'forge', id: `affix:${id}`, name: a.name, glyph: a.infusion ? '✦' : '◆', rarity: a.rarity,
      elements: elementsOf(a.addTags || []), cat: a.infusion ? 'Infusion' : 'Effect', classes: [],
      summary: a.desc,
      lines: [a.desc, a.requires ? `Only on ${a.requires.map(cap).join(', ')} weapons.` : 'Any weapon.', 'Rolled by reforging a weapon: you see three and pick one.'], builds: [],
    });
  }
  for (const lvl of Object.keys(ENHANCE.tempers)) {
    for (const t of ENHANCE.tempers[lvl]) {
      out.push({
        tab: 'forge', id: `temper:${lvl}:${t.id}`, name: t.name, glyph: '+', rarity: 'rare', elements: elementsOf(t.addTags || []),
        cat: 'Temper', classes: [], summary: `+${lvl} temper: ${t.desc}`,
        lines: [`Offered at +${lvl}: ${t.desc}`, 'Most weapons have their own pair of tempers; these are the defaults.'], builds: [],
      });
    }
  }
  for (const [id, r] of Object.entries(RESONANCE)) {
    out.push({
      tab: 'forge', id: `resonance:${id}`, name: `${r.name} resonance`, glyph: '≈', rarity: 'epic', elements: ELEMENTS.includes(id) ? [id] : [],
      cat: 'Resonance', classes: [], summary: `Own ${r.tiers.length === 2 ? '2 or 3' : 'several'} ${id} weapons: ${r.text.join('; then ')}.`,
      lines: [`Two ${id} weapons: ${r.text[0]}.`, `Three: ${r.text[1]}.`, 'Infusions and tempers count, so any weapon can join a set.'], builds: [],
    });
  }

  out.push({
    tab: 'forge', id: 'quench', name: 'Star Quench', glyph: '◆', rarity: 'epic', elements: [], cat: 'Forge', classes: [],
    summary: `Spend ${QUENCH.cost} starsteel to make several enhance attempts certain.`,
    lines: [`At the forge, ${QUENCH.cost} starsteel gives a weapon Quench charges: 3 at +4 to +9, 2 at +10 to +12, 1 at +13 or +14.`,
      'A charge makes the next enhance attempt succeed, with no roll and no downgrade. The ore is still paid.',
      'Charges stay on the weapon, carry through evolving, join the host in a fusion, and are lost if the weapon is salvaged.'], builds: [],
  });

  out.push({
    tab: 'forge', id: 'starforge', name: 'Starforge', glyph: '✦', rarity: 'epic', elements: [], cat: 'Forge', classes: [],
    summary: `Spend ${STARFORGE.cost} starsteel to give a maxed weapon a mutation.`,
    lines: [`At the forge, a weapon at its maximum level can be starforged once for ${STARFORGE.cost} starsteel. It gains one mutation set by how it attacks, drawn in cyan.`,
      ...Object.entries(MUTATIONS).map(([b, m]) => `${b[0].toUpperCase()}${b.slice(1)} weapons: ${m.name}. ${m.desc}`),
      'It works on evolved and fused weapons too. The star survives evolving, a fusion passes it to the host (two stars become one), and salvaging loses it.'], builds: [],
  });

  const found = new Set(discovered.fusions || []);
  out.push({
    tab: 'fusions', id: 'fusion:rules', name: `Masterworks found ${MASTERWORKS.filter((m) => found.has(m.id)).length} / ${MASTERWORKS.length}`,
    glyph: '✦', rarity: 'epic', elements: [], cat: 'Guide', classes: [],
    summary: `At the forge, fuse one evolved weapon into another for ${FUSION.cost} starsteel.`,
    lines: [`Fuse one evolved weapon (the donor) into another (the host) for ${FUSION.cost} starsteel. The donor is consumed and frees its slot.`,
      'The host keeps its level, enhancement and effects, gains the donor\'s elements, and gets a fusion effect. A weapon takes one fusion.',
      'Most pairs give a payload: the first hit of every attack the host makes also does something shaped like the donor\'s attack.',
      ...Object.entries(SHAPE_PAYLOAD).map(([shape, id]) => `${SHAPE_LABEL[shape] || shape} donor: ${PAYLOADS[id].text} (${Math.round(PAYLOADS[id].frac * 100)}%).`),
      'Some pairs are masterworks with an effect of their own. Find them by trying.'], builds: [],
  });
  for (const m of MASTERWORKS) {
    const ok = found.has(m.id);
    out.push({
      tab: 'fusions', id: `fusion:${m.id}`, name: ok ? m.name : `${WEAPONS[m.host].name} + ???`, glyph: ok ? '✦' : '?', rarity: ok ? 'epic' : 'common',
      elements: ok ? ELEMENTS.filter((e) => WEAPONS[m.host].tags.includes(e) || WEAPONS[m.donor].tags.includes(e)) : [],
      cat: 'Masterwork', classes: [],
      summary: ok ? m.desc : 'Not found yet. Fuse the right weapon into this one.',
      fusePair: ok ? [m.host, m.donor] : null,
      lines: ok ? [m.desc, `Host: ${WEAPONS[m.host].name}. Donor: ${WEAPONS[m.donor].name}. Either order works; the host is fixed.`]
        : [`Something is waiting to be fused into the ${WEAPONS[m.host].name}.`], builds: [],
    });
  }

  for (const b of visibleBuilds) {
    const parts = [...b.weapons.map((w) => WEAPONS[w].name), ...b.perks.map((p) => PERKS[p].name)];
    const els = new Set();
    for (const w of b.weapons) elementsOf(WEAPONS[w].tags).forEach((e) => els.add(e));
    for (const p of b.perks) perkElements(p, PERKS[p]).forEach((e) => els.add(e));
    out.push({
      tab: 'builds', id: `build:${b.id}`, name: b.name, glyph: b.name[0], rarity: 'rare', elements: ELEMENTS.filter((e) => els.has(e)),
      cat: CLASSES[b.cls].name, classes: [b.cls], summary: b.idea,
      lines: [b.idea, `Weapons: ${b.weapons.map((w) => WEAPONS[w].name).join(', ')}.`,
        ...(b.end ? [`Finished: ${b.end.weapons.map((w) => WEAPONS[w].name).join(', ')}.${b.end.fuse ? ` Fusion: ${masterworkFor(b.end.fuse[0], b.end.fuse[1]).name}.` : ''}`] : []),
        ...(b.passives && b.passives.length ? [`Passives: ${b.passives.map((p) => PASSIVES[p].name).join(', ')}.`] : []),
        `Techniques: ${b.perks.map((p) => PERKS[p].name).join(', ')}.`, b.tips],
      builds: [], parts,
    });
  }

  for (const e of out) e.text = `${e.name} ${e.summary} ${e.cat} ${e.elements.join(' ')} ${(e.parts || []).join(' ')}`.toLowerCase();
  return out;
}

// Facets available on each tab (the UI offers one row of chips per facet).
export function facetsFor(tab, entries) {
  const list = entries.filter((e) => e.tab === tab);
  const uniq = (f) => [...new Set(list.flatMap(f))];
  const facets = [];
  if (['weapons', 'evolve', 'techniques', 'forge', 'builds', 'fusions'].includes(tab)) {
    const els = uniq((e) => e.elements);
    if (els.length) facets.push({ key: 'element', label: 'Element', options: ELEMENTS.filter((e) => els.includes(e)) });
  }
  const cats = uniq((e) => [e.cat]);
  if (cats.length > 1) facets.push({ key: 'cat', label: tab === 'builds' ? 'Class' : 'Type', options: cats });
  if (['weapons', 'evolve'].includes(tab)) {
    const cls = uniq((e) => e.classes);
    if (cls.length) facets.push({ key: 'cls', label: 'Class', options: cls });
  }
  const rar = Object.keys(RARITIES).filter((r) => list.some((e) => e.rarity === r));
  if (rar.length > 1 && tab !== 'builds') facets.push({ key: 'rarity', label: 'Rarity', options: rar });
  return facets;
}

export function filterEntries(entries, { tab, element, cat, cls, rarity, q } = {}) {
  const needle = (q || '').trim().toLowerCase();
  return entries.filter((e) => e.tab === tab
    && (!element || e.elements.includes(element))
    && (!cat || e.cat === cat)
    && (!cls || e.classes.includes(cls))
    && (!rarity || e.rarity === rarity)
    && (!needle || e.text.includes(needle)));
}

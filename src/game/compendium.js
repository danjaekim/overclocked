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
import { AFFIXES, ENHANCE, QUENCH, TEMPERS_BY_BEHAVIOR, LEGENDARY, LEGENDARIES } from '../data/forge.js';
import { STARFORGE, MUTATIONS } from '../data/starforge.js';
import { RESONANCE } from '../data/resonance.js';
import { CLASSES } from '../data/classes.js';
import { BUILDS } from '../data/builds.js';
import { RARITIES } from '../data/rarities.js';
import { describe as describeReq, recipeProgress } from './evolution.js';
import { findPerk } from './perks.js';
import { findPassive } from './passives.js';
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

// Section builders: the detail view of an entry is a list of these, so the UI can give each kind of
// information its own look (a paragraph, label/value facts, a level ladder, an evolution recipe).
const text = (t) => ({ kind: 'text', text: t });
const facts = (title, rows) => ({ kind: 'facts', title, rows });          // rows: [label, value]
const levels = (title, rows) => ({ kind: 'levels', title, rows });         // rows: [badge, text]
const bullets = (title, items) => ({ kind: 'list', title, items });
const evolinks = (title, items) => ({ kind: 'evolinks', title, items });   // items: recipe ids; each links to its Evolve entry
const chips = (title, refs) => ({ kind: 'chips', title, refs });             // refs: { id, text }: each links to that entry
const ref = (id, text) => ({ id, text });
const recipes = (title, items) => ({ kind: 'recipes', title, items });     // items: { id, role: 'made' | 'next' }

function recipeLines(recipe) {
  return recipe.requires.map((r) => describeReq(r, recipe));
}

function weaponEntry(id, def, buildsFor, buildRefs, foundMasterworks) {
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
  const made = EVOLUTIONS.filter((x) => x.into === id).map((r) => ({ id: r.id, role: 'made' }));
  const next = EVOLUTIONS.filter((x) => x.from === id || x.with === id).map((r) => ({ id: r.id, role: 'next' }));
  const sections = [text(def.desc)];
  if (made.length) sections.push(recipes('How to get it', made));
  if (def.levelText.length) sections.push(levels('Levels', def.levelText.map((t, i) => [`Lv ${i + 2}`, t])));
  if (def.baseMods && def.baseMods.length) sections.push(text('Comes with a built-in elemental effect.'));
  if (next.length) sections.push(evolinks('Evolution', next.map((x) => x.id)));
  if (evolved) {                                  // evolved weapons can be fused: link the rules and any masterwork found with this weapon
    const mine = MASTERWORKS.filter((m) => (m.host === id || m.donor === id) && foundMasterworks.has(m.id)).map((m) => ref(`fusion:${m.id}`, m.name));
    sections.push(chips('Fusion', [ref('fusion:rules', 'How fusion works'), ...mine]));
  }
  if (def.forge && def.forge.tempers) sections.push(facts('Tempers', Object.keys(def.forge.tempers).map((lvl) => [`+${lvl}`, def.forge.tempers[lvl].map((t) => t.name).join(' or ')])));
  return {
    tab: evolved ? 'evolve' : 'weapons', id, name: def.name, glyph: def.glyph, rarity: def.rarity,
    elements: elementsOf(def.tags),
    cat: def.tags.includes('close') ? 'Close range' : def.behavior === 'summon' ? 'Summon' : 'Ranged',
    classes, summary: def.desc, lines, sections, builds: buildsFor('weapon', id), buildRefs: buildRefs('weapon', id),
    recipeIds: [...made, ...next].map((x) => x.id), madeIds: made.map((x) => x.id),
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
  const buildRefs = (kind, id) => visibleBuilds.filter((b) => (kind === 'weapon' ? b.weapons : b.perks).includes(id)).map((b) => ref(`build:${b.id}`, b.name));
  const out = [];

  for (const [id, def] of Object.entries(WEAPONS)) out.push(weaponEntry(id, def, buildsFor, buildRefs, foundIds));

  for (const [id, def] of Object.entries(PERKS)) {
    const lines = [def.desc, `Offered when: ${requiresText(def.requires)}.`];
    def.levelText.forEach((t, i) => lines.push(`Level ${i + 1}: ${t}`));
    out.push({
      tab: 'techniques', id, name: def.name, glyph: def.glyph, rarity: def.rarity,
      elements: perkElements(id, def), cat: perkCategory(id, def), classes: [],
      summary: def.desc, lines, builds: buildsFor('perk', id), buildRefs: buildRefs('perk', id),
      sections: [text(def.desc), facts('Offered when', [['', requiresText(def.requires)]]), levels('Levels', def.levelText.map((t, i) => [`Lv ${i + 1}`, t]))],
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
      sections: [text(def.desc), levels('Levels', def.levelText.map((t, i) => [`Lv ${i + 1}`, t])), ...(evo.length ? [chips('Needed to evolve', evo.map((r) => ref(r.into, `${WEAPONS[r.from].name} › ${WEAPONS[r.into].name}`)))] : [])],
    });
  }

  for (const [id, a] of Object.entries(AFFIXES)) {
    out.push({
      tab: 'forge', id: `affix:${id}`, name: a.name, glyph: a.infusion ? '✦' : '◆', rarity: a.rarity,
      elements: elementsOf(a.addTags || []), cat: a.infusion ? 'Infusion' : 'Effect', classes: [],
      summary: a.desc,
      lines: [a.desc, a.requires ? `Only on ${a.requires.map(cap).join(', ')} weapons.` : 'Any weapon.', 'Rolled by reforging a weapon: you see three and pick one.'], builds: [],
      sections: [text(a.desc), facts('', [['Fits', a.requires ? `${a.requires.map(cap).join(', ')} weapons only` : 'Any weapon'], ['How', 'Reforge a weapon: you see three and pick one']])],
    });
  }
  for (const lvl of Object.keys(ENHANCE.tempers)) {
    for (const t of ENHANCE.tempers[lvl]) {
      out.push({
        tab: 'forge', id: `temper:${lvl}:${t.id}`, name: t.name, glyph: '+', rarity: 'rare', elements: elementsOf(t.addTags || []),
        cat: 'Temper', classes: [], summary: `+${lvl} temper: ${t.desc}`,
        lines: [`Offered at +${lvl}: ${t.desc}`, 'The last-resort pair; most weapons are offered a pair that fits how they attack.'], builds: [],
        sections: [text(t.desc), facts('', [['Offered at', `+${lvl}`], ['Fits', 'Any weapon with no pair of its own, the last resort']])],
      });
    }
  }
  for (const [id, l] of Object.entries(LEGENDARIES)) {
    out.push({
      tab: 'forge', id: `legendary:${id}`, name: l.name, glyph: '★', rarity: 'epic', elements: elementsOf(l.addTags || []),
      cat: 'Legendary', classes: [], summary: l.desc,
      lines: [l.desc, l.requires ? `Only on ${l.requires.map(cap).join(', ')} weapons.` : 'Any weapon.', `At +${LEGENDARY.unlockEnhance} a weapon can buy a legendary for ${LEGENDARY.cost} starsteel: you see ${LEGENDARY.options} that fit it and pick one. Rerolling costs ${LEGENDARY.reroll}.`], builds: [],
      sections: [text(l.desc), facts('', [['Fits', l.requires ? `${l.requires.map(cap).join(', ')} weapons only` : 'Any weapon'], ['Unlocks at', `+${LEGENDARY.unlockEnhance}`], ['Cost', `${LEGENDARY.cost} starsteel, reroll ${LEGENDARY.reroll}`], ['How', `You see ${LEGENDARY.options} that fit and pick one`]])],
    });
  }
  const seenTemper = new Set();
  for (const [beh, tp] of Object.entries(TEMPERS_BY_BEHAVIOR)) {
    for (const lvl of Object.keys(tp)) {
      for (const t of tp[lvl]) {
        if (seenTemper.has(t.id)) continue;
        seenTemper.add(t.id);
        const shapes = Object.entries(TEMPERS_BY_BEHAVIOR).filter(([, v]) => v === tp).map(([k]) => k);
        out.push({
          tab: 'forge', id: `temper:${lvl}:${t.id}`, name: t.name, glyph: '+', rarity: 'rare', elements: elementsOf(t.addTags || []),
          cat: 'Temper', classes: [], summary: `+${lvl} temper: ${t.desc}`,
          lines: [`Offered at +${lvl}: ${t.desc}`, `Offered to ${shapes.map(cap).join(', ')} weapons that have no pair of their own.`], builds: [],
          sections: [text(t.desc), facts('', [['Offered at', `+${lvl}`], ['Fits', `${shapes.map(cap).join(', ')} weapons with no pair of their own`]])],
        });
      }
    }
  }
  for (const [id, r] of Object.entries(RESONANCE)) {
    out.push({
      tab: 'forge', id: `resonance:${id}`, name: `${r.name} resonance`, glyph: '≈', rarity: 'epic', elements: ELEMENTS.includes(id) ? [id] : [],
      cat: 'Resonance', classes: [], summary: `Own ${r.tiers.length === 2 ? '2 or 3' : 'several'} ${id} weapons: ${r.text.join('; then ')}.`,
      lines: [`Two ${id} weapons: ${r.text[0]}.`, `Three: ${r.text[1]}.`, 'Infusions and tempers count, so any weapon can join a set.'], builds: [],
      sections: [facts('', [[`Two ${id}`, r.text[0]], ['Three', r.text[1]]]), text('Infusions and tempers count, so any weapon can join a set.')],
    });
  }

  out.push({
    tab: 'forge', id: 'quench', name: 'Star Quench', glyph: '◆', rarity: 'epic', elements: [], cat: 'Forge', classes: [],
    summary: `Spend ${QUENCH.cost} starsteel to make several enhance attempts certain.`,
    lines: [`At the forge, ${QUENCH.cost} starsteel gives a weapon Quench charges: 3 at +4 to +9, 2 at +10 to +12, 1 at +13 or +14.`,
      'A charge makes the next enhance attempt succeed, with no roll and no downgrade. The ore is still paid.',
      'Charges stay on the weapon, carry through evolving, join the host in a fusion, and are lost if the weapon is salvaged.'], builds: [],
    sections: [text(`Spend ${QUENCH.cost} starsteel at the forge to make several enhance attempts certain.`),
      facts('Charges', [['+4 to +9', '3'], ['+10 to +12', '2'], ['+13 to +14', '1']]),
      text('A charge makes the next enhance succeed: no roll, no downgrade. The ore is still paid.'),
      text('Charges stay through evolving and join the host in a fusion. Salvaging the weapon loses them.')],
  });

  out.push({
    tab: 'forge', id: 'starforge', name: 'Starforge', glyph: '✦', rarity: 'epic', elements: [], cat: 'Forge', classes: [],
    summary: `Spend ${STARFORGE.cost} starsteel to give a maxed weapon a mutation.`,
    lines: [`At the forge, a weapon at its maximum level can be starforged once for ${STARFORGE.cost} starsteel. It gains one mutation set by how it attacks, drawn in cyan.`,
      ...Object.entries(MUTATIONS).map(([b, m]) => `${b[0].toUpperCase()}${b.slice(1)} weapons: ${m.name}. ${m.desc}`),
      'It works on evolved and fused weapons too. The star survives evolving, a fusion passes it to the host (two stars become one), and salvaging loses it.'], builds: [],
    sections: [text(`A weapon at its maximum level can be starforged once for ${STARFORGE.cost} starsteel. It gains one mutation set by how it attacks, drawn in cyan.`),
      facts('Mutations', Object.entries(MUTATIONS).map(([b, m]) => [cap(b), `${m.name}. ${m.desc}`])),
      text('Works on evolved and fused weapons. The star survives evolving; a fusion passes it to the host (two stars become one); salvaging loses it.')],
  });

  const found = new Set(discovered.fusions || []);
  out.push({
    tab: 'fusions', id: 'fusion:rules', name: `Masterworks found ${MASTERWORKS.filter((m) => found.has(m.id)).length} / ${MASTERWORKS.length}`,
    glyph: '✦', rarity: 'epic', elements: [], cat: 'Guide', classes: [],
    summary: `At the forge, fuse one evolved weapon into another for ${FUSION.cost} starsteel.`,
    lines: [`Fuse one evolved weapon (the donor) into another (the host) for ${FUSION.cost} starsteel. The donor is consumed and frees its slot.`,
      'The host keeps its level, enhancement and effects, gains the donor\'s elements, and gets a fusion effect. A weapon takes one fusion. The host keeps its legendary; the donor\'s is lost with it.',
      'Most pairs give a payload: the first hit of every attack the host makes also does something shaped like the donor\'s attack.',
      ...Object.entries(SHAPE_PAYLOAD).map(([shape, id]) => `${SHAPE_LABEL[shape] || shape} donor: ${PAYLOADS[id].text} (${Math.round(PAYLOADS[id].frac * 100)}%).`),
      'Some pairs are masterworks with an effect of their own. Find them by trying.'], builds: [],
    sections: [text(`Fuse one evolved weapon (the donor) into another (the host) for ${FUSION.cost} starsteel. The donor is consumed and frees its slot.`),
      text('The host keeps its level, enhancement, effects and legendary, gains the donor\'s elements, and gets a fusion effect. A weapon takes one fusion. The donor\'s legendary is lost with it.'),
      facts('Payload by donor', Object.entries(SHAPE_PAYLOAD).map(([shape, pid]) => [SHAPE_LABEL[shape] || shape, `${PAYLOADS[pid].text} (${Math.round(PAYLOADS[pid].frac * 100)}%)`])),
      text('Most pairs give a payload: the first hit of every attack the host makes also does something shaped like the donor\'s attack. Some pairs are masterworks with an effect of their own. Find them by trying.')],
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
      masterwork: m.id,
      sections: ok ? [text(m.desc), facts('', [['Host', [ref(m.host, WEAPONS[m.host].name)]], ['Donor', [ref(m.donor, WEAPONS[m.donor].name)]]]), text('Either order works; the host is fixed.')]
        : [text(`Something is waiting to be fused into the ${WEAPONS[m.host].name}.`)],
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
      builds: [], parts, buildWeapons: b.weapons,
      sections: [text(b.idea),
        facts('', [['Weapons', b.weapons.map((w) => ref(w, WEAPONS[w].name))],
          ...(b.end ? [['Finished', [...b.end.weapons.map((w) => ref(w, WEAPONS[w].name)), ...(b.end.fuse ? [ref(`fusion:${masterworkFor(b.end.fuse[0], b.end.fuse[1]).id}`, `Fusion: ${masterworkFor(b.end.fuse[0], b.end.fuse[1]).name}`)] : [])]]] : []),
          ...(b.passives && b.passives.length ? [['Passives', b.passives.map((p) => ref(p, PASSIVES[p].name))]] : []),
          ['Techniques', b.perks.map((p) => ref(p, PERKS[p].name))]]),
        text(b.tips)],
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


// ---- live status (opened during a run): what you hold, what each evolution or fusion still needs ----

const EVO_BY_ID = Object.fromEntries(EVOLUTIONS.map((r) => [r.id, r]));
export const evolutionById = (id) => EVO_BY_ID[id];

export function ownedWeapon(run, id) {
  return run.player.weapons.find((w) => w.weaponId === id) || null;
}

// Rows for a masterwork's fusion: both weapons in hand (evolved), and the starsteel.
export function fusionProgress(run, host, donor) {
  const h = ownedWeapon(run, host);
  const d = ownedWeapon(run, donor);
  const rows = [
    { text: `Own ${WEAPONS[host].name} (host)`, state: h ? 'ok' : 'missing', note: h ? '' : 'evolve it first', links: [[WEAPONS[host].name, host]] },
    { text: `Own ${WEAPONS[donor].name} (donor)`, state: d ? 'ok' : 'missing', note: d ? '' : 'evolve it first', links: [[WEAPONS[donor].name, donor]] },
    { text: `${FUSION.cost} starsteel`, state: run.starsteel >= FUSION.cost ? 'ok' : (run.starsteel > 0 ? 'short' : 'missing'), note: run.starsteel >= FUSION.cost ? '' : `you have ${run.starsteel}` },
  ];
  const met = rows.filter((r) => r.state === 'ok').length;
  return { rows, met, total: rows.length, own: !!h && !!d, ready: met === rows.length };
}

// The short "still need" line for a collapsed entry: unmet rows, with what you have beside them.
const needLine = (rows) => rows.filter((r) => r.state !== 'ok').map((r) => (r.note ? `${r.text} (${r.note})` : r.text)).join(' · ');

// { rank, badge, tone, need } for one entry against the run, or null when it has nothing to say.
// rank orders the list (higher first); tone is 'ready' | 'have' | 'near'.
export function liveStatus(entry, run) {
  if (entry.tab === 'weapons' || entry.tab === 'evolve') {
    const inst = ownedWeapon(run, entry.id);
    const mine = inst ? `Owned · Lv ${inst.level}${inst.enhance ? ` · +${inst.enhance}` : ''}` : '';
    if (entry.tab === 'weapons') {
      // A base weapon says only that you hold it; each evolution it can take is a chip that links to the Evolve tab, where the requirements are.
      if (!inst) return null;
      const chips = (entry.recipeIds || []).filter((rid) => EVO_BY_ID[rid].from === entry.id || EVO_BY_ID[rid].with === entry.id).map((rid) => {
        const r = EVO_BY_ID[rid];
        const pr = recipeProgress(run, r);
        return { id: r.into, label: WEAPONS[r.into].name, tone: pr.ready ? 'ready' : pr.own ? 'near' : '', progress: `${pr.met}/${pr.total}` };
      });
      const ready = chips.some((c) => c.tone === 'ready');
      return { rank: ready ? 4 : 3, tone: ready ? 'ready' : 'have', badge: mine, need: '', chips };
    }
    let best = null;
    const made = (entry.madeIds || []).map((rid) => EVO_BY_ID[rid]);
    for (const r of made) {
      const pr = recipeProgress(run, r);
      const score = (pr.ready ? 100 : pr.own ? 50 : 0) + pr.met;
      if (!best || score > best.score) best = { score, pr, r };
    }
    if (best && best.pr.ready) return { rank: 6, tone: 'ready', badge: 'Ready to combine', need: '' };
    // With several ways to get it, say what each still needs (the ones you hold pieces for).
    const lines = made.map((r) => ({ r, pr: recipeProgress(run, r) })).filter((x) => x.pr.own)
      .map((x) => `${made.length > 1 ? `${WEAPONS[x.r.from].name}${x.r.with ? ' + ' + WEAPONS[x.r.with].name : ''}: ` : ''}${needLine(x.pr.rows)}`);
    if (best && best.pr.own) return { rank: 4 + best.pr.met / 20, tone: 'near', badge: `${best.pr.met} of ${best.pr.total} ready`, need: `Still need: ${lines.join(' | ')}` };
    if (inst) return { rank: 2, tone: 'have', badge: mine, need: '' };
    return null;
  }
  if (entry.tab === 'techniques' || entry.tab === 'passives') {
    const k = entry.tab === 'techniques' ? findPerk(run.player, entry.id) : findPassive(run.player, entry.id);
    if (k) return { rank: 3, tone: 'have', badge: `You have Lv ${k.level}`, need: '' };
    if (entry.tab === 'passives') {
      const wants = EVOLUTIONS.filter((r) => r.requires.some((q) => q.passive === entry.id) && ownedWeapon(run, r.from));
      if (wants.length) return { rank: 2, tone: 'near', badge: `Needed for your ${WEAPONS[wants[0].from].name}`, need: '' };
    }
    return null;
  }
  if (entry.tab === 'fusions') {
    if (entry.id === 'fusion:rules') {
      const evolved = run.player.weapons.filter((w) => w.def.rarity === 'evolved').length;
      return evolved ? { rank: 4, tone: evolved >= 2 ? 'ready' : 'near', badge: `${evolved} evolved weapon${evolved === 1 ? '' : 's'} owned`, need: evolved >= 2 ? '' : 'A fusion needs two' } : null;
    }
    const m = MASTERWORKS.find((x) => `fusion:${x.id}` === entry.id);
    if (!m) return null;
    const h = ownedWeapon(run, m.host);
    const d = ownedWeapon(run, m.donor);
    if (entry.fusePair) {
      const pr = fusionProgress(run, m.host, m.donor);
      if (pr.ready) return { rank: 6, tone: 'ready', badge: 'Ready to fuse', need: '' };
      if (pr.own) return { rank: 5, tone: 'near', badge: 'You have both', need: `Still need: ${needLine(pr.rows)}` };
      if (h || d) return { rank: 3, tone: 'near', badge: h ? 'You have the host' : 'You have the donor', need: `Still need: ${needLine(pr.rows)}` };
      return null;
    }
    if (h) return { rank: 3, tone: 'near', badge: 'You own the host', need: '' };      // the pair itself stays hidden until found
    return null;
  }
  if (entry.tab === 'builds') {
    const have = (entry.buildWeapons || []).filter((w) => ownedWeapon(run, w)).length;
    const total = (entry.buildWeapons || []).length;
    if (have) return { rank: 2 + have / 10, tone: have === total ? 'ready' : 'near', badge: `You have ${have} of ${total} weapons`, need: '' };
  }
  return null;
}

// Stable sort: entries with live status first, best match at the top.
export function sortByStatus(list, run) {
  const ranked = list.map((e, i) => ({ e, i, st: liveStatus(e, run) }));
  ranked.sort((a, b) => ((b.st ? b.st.rank : -1) - (a.st ? a.st.rank : -1)) || a.i - b.i);
  return ranked.map((x) => ({ entry: x.e, status: x.st }));
}

// The six test chains (docs/overclocked-spec.md, M1). Each shows one idea; the sandbox loads them
// from buttons and the headless tests check what each one does.

export const TEST_CHAINS = {
  blaster: { name: 'Blaster', rule: 'pulse', slots: ['blaster'], note: 'Baseline: one volley a pulse' },
  scatter_shot: { name: 'Scatter shot', rule: 'pulse', slots: ['scatter', 'blaster'], note: 'Five weak shots, spread out' },
  cluster_mortar: { name: 'Cluster mortar', rule: 'pulse', slots: ['flame', 'mortar', 'on_impact', 'scatter', 'nova'], note: 'A burning shell, then five novas at the crater' },
  steam_nova: { name: 'Steam nova', rule: 'pulse', slots: ['flame', 'frost', 'nova'], note: 'Fire then frost: the Steam reaction' },
  shatter_shell: { name: 'Shatter shell', rule: 'stride', slots: ['frost', 'flame', 'mortar'], note: 'Frost then fire: the Shatter reaction, while moving' },
  kill_chain: { name: 'Kill chain', rule: 'pulse', slots: ['blaster', 'on_kill', 'nova', 'on_kill', 'nova'], note: 'Each kill sets off a nova, whose kills set off another, until the energy runs out' },
};

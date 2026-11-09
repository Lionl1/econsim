// Quick model run without UI: node scripts/headless.mjs [months]
import fs from 'node:fs';
import { loadWorld } from './load.mjs';
import { Sim } from '../src/sim/engine.js';
const world = loadWorld();
const sim = new Sim(world, { seed: 1 });
const months = +process.argv[2] || 120;
const t0 = Date.now();
for (let m = 0; m < months; m++) {
  sim.step();
  if (m % 12 === 11) {
    const a = sim.agg;
    console.log(sim.date(), 'GDP', (a.gdp / 1e12).toFixed(1), 'T$ g', a.g.toFixed(2), 'infl', a.infl.toFixed(2), 'unemp', a.unemp.toFixed(2), 'stab', a.stab.toFixed(2), 'oil', sim.oil.toFixed(2), 'wars', a.wars);
  }
}
console.log('ms/step', ((Date.now() - t0) / months).toFixed(1));
const cnt = {}; sim.events.forEach(e => cnt[e.kind] = (cnt[e.kind] || 0) + 1); console.log(cnt);
['USA', 'CHN', 'RUS', 'DEU', 'NGA', 'ARG'].forEach(iso => { const i = world.idx.get(iso), s = sim.S[i]; console.log(iso, 'gdp', (s.gdp / 1e9).toFixed(0), 'g', s.g.toFixed(1), 'infl', s.infl.toFixed(1), 'u', s.unemp.toFixed(1), 'debt', s.debt.toFixed(0), 'stab', s.stab.toFixed(2), 'sent', s.sent.toFixed(2), 'prot', s.protest.toFixed(2)); });
console.log(sim.events.slice(-12).map(e => e.text).join('\n'));

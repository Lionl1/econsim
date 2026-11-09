// Each preset vs baseline: node scripts/scenario-test.mjs [id ...]
import fs from 'node:fs';
import { loadWorld } from './load.mjs';
import { Sim } from '../src/sim/engine.js';
import { PRESETS } from '../src/sim/scenarios.js';
const world = loadWorld();
const ids = process.argv.slice(2);
for (const pid of ids.length ? ids : PRESETS.map(p => p.id)) {
  const base = new Sim(world, { seed: 1 }), sim = new Sim(world, { seed: 1 });
  const p = PRESETS.find(x => x.id === pid);
  sim.addScenario({ ...p, start: 6 });
  for (let m = 0; m < 60; m++) { base.step(); sim.step(); }
  const d = (iso, k) => sim.metric(world.idx.get(iso), k, base).toFixed(1);
  console.log(`\n== ${p.title} | world GDP ${((sim.agg.gdp / base.agg.gdp - 1) * 100).toFixed(2)}% | oil ${sim.oil.toFixed(2)} | wars ${sim.agg.wars} (base ${base.agg.wars})`);
  console.log(['USA', 'CHN', 'RUS', 'DEU', 'SAU', 'IND', 'NGA', 'JPN'].map(c => `${c}:${d(c, 'dGdp')}%`).join('  '), '| dUnemp USA', d('USA', 'dUnemp'), 'dInfl USA', d('USA', 'dInfl'));
  console.log(sim.events.filter(e => e.kind !== 'gov').slice(0, 7).map(e => e.text).join('\n'));
}

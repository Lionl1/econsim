// Сравнение сценариев с базовой линией: node scripts/scenario-test.mjs [id ...]
import fs from 'node:fs';
import { buildWorld } from '../src/sim/world.js';
import { Sim } from '../src/sim/engine.js';
import { PRESETS } from '../src/sim/scenarios.js';
const world = buildWorld(JSON.parse(fs.readFileSync(new URL('../public/data/countries.json', import.meta.url))));
const ids = process.argv.slice(2);
for (const pid of ids.length ? ids : PRESETS.map(p => p.id)) {
  const base = new Sim(world, { seed: 1 }), sim = new Sim(world, { seed: 1 });
  const p = PRESETS.find(x => x.id === pid);
  sim.addScenario({ ...p, start: 6 });
  for (let m = 0; m < 60; m++) { base.step(); sim.step(); }
  const d = (iso, k) => sim.metric(world.idx.get(iso), k, base).toFixed(1);
  console.log(`\n== ${p.title} | мир ВВП ${((sim.agg.gdp / base.agg.gdp - 1) * 100).toFixed(2)}% | нефть ${sim.oil.toFixed(2)} | войн ${sim.agg.wars} (баз ${base.agg.wars})`);
  console.log(['USA', 'CHN', 'RUS', 'DEU', 'SAU', 'IND', 'NGA', 'JPN'].map(c => `${c}:${d(c, 'dGdp')}%`).join('  '), '| ΔБезраб USA', d('USA', 'dUnemp'), 'ΔИнфл USA', d('USA', 'dInfl'));
  console.log(sim.events.filter(e => e.kind !== 'gov').slice(0, 7).map(e => e.text).join('\n'));
}

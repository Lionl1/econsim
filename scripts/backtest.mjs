// Backtest: known shocks vs history.  node scripts/backtest.mjs
import fs from 'node:fs';
import { loadWorld } from './load.mjs';
import { Sim } from '../src/sim/engine.js';
import { PRESETS } from '../src/sim/scenarios.js';
const world = loadWorld();
const SEEDS = 5;
const cases = [
  { name: 'Pandemic 2020', id: 'pandemic', ref: 'world growth 2020 = -3.0% vs trend ~+3% -> gap ~-5...-6 pp, GDP level ~-5% vs trend; US unemployment +4...+5 pp (peak)' },
  { name: 'Financial crisis 2008-09', id: 'us-crisis', ref: 'world growth 2009 = -1.4% vs trend ~+3.5% -> gap ~-5 pp, level ~-4...-5%; US unemployment +5 pp' },
  { name: 'Oil +40%, 12 months (2022)', custom: { title: 'oil40', duration: 12, effects: [{ kind: 'oil', value: 0.4 }] }, ref: 'world CPI 2021 4.7% -> 2022 ~8.7% (+4 pp including other drivers; oil ~1/3 of it)' },
];
const mean = a => a.reduce((x, y) => x + y, 0) / a.length;
for (const c of cases) {
  const p = c.custom || PRESETS.find(x => x.id === c.id);
  const res = { dG: [], dLevel: [], dU: [], dInfl: [] };
  for (let seed = 1; seed <= SEEDS; seed++) {
    const base = new Sim(world, { seed }), sim = new Sim(world, { seed });
    sim.addScenario({ ...p, start: 12 });
    let minG = 0, minL = 0, maxU = 0, maxI = -99; const gy = []; const bg = [];
    for (let m = 0; m < 72; m++) {
      base.step(); sim.step();
      gy.push(sim.agg.g - base.agg.g);
      minL = Math.min(minL, (sim.agg.gdp / base.agg.gdp - 1) * 100);
      const us = world.idx.get('USA'); maxU = Math.max(maxU, sim.S[us].unemp - base.S[us].unemp);
      maxI = Math.max(maxI, sim.agg.infl - base.agg.infl);
      if (m >= 12 && m < 24) bg.push(sim.agg.g - base.agg.g);
    }
    res.dG.push(mean(bg)); res.dLevel.push(minL); res.dU.push(maxU); res.dInfl.push(maxI);
  }
  console.log(`\n${c.name}\n  history: ${c.ref}\n  model (mean of ${SEEDS} seeds): world growth in year one ${mean(res.dG).toFixed(1)} pp | GDP level trough ${mean(res.dLevel).toFixed(1)}% | US unemployment peak +${mean(res.dU).toFixed(1)} pp | world inflation peak +${mean(res.dInfl).toFixed(1)} pp`);
}

// Бэктест: известные шоки vs реальность.  node scripts/backtest.mjs
import fs from 'node:fs';
import { loadWorld } from './load.mjs';
import { Sim } from '../src/sim/engine.js';
import { PRESETS } from '../src/sim/scenarios.js';
const world = loadWorld();
const SEEDS = 5;
const cases = [
  { name: 'Пандемия 2020', id: 'pandemic', ref: 'мир: рост 2020 = −3.0% при тренде ≈ +3% → просадка ≈ −5…−6 п.п., уровень ВВП ≈ −5% к тренду; безработица США +4…+5 п.п. (пик)' },
  { name: 'Финкризис 2008–09', id: 'us-crisis', ref: 'мир: рост 2009 = −1.4% при тренде ≈ +3.5% → просадка ≈ −5 п.п., уровень ≈ −4…−5%; безработица США +5 п.п.' },
  { name: 'Нефть +40%, 12 мес. (2022)', custom: { title: 'oil40', duration: 12, effects: [{ kind: 'oil', value: 0.4 }] }, ref: 'мир: CPI 2021 4.7% → 2022 ≈ 8.7% (+4 п.п. с учётом других факторов; доля нефти ~1/3)' },
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
  console.log(`\n${c.name}\n  реальность: ${c.ref}\n  модель (ср. по ${SEEDS} сидам): рост мира в первый год Δ ${mean(res.dG).toFixed(1)} п.п. | минимум уровня ВВП ${mean(res.dLevel).toFixed(1)}% | пик ΔБезраб. США +${mean(res.dU).toFixed(1)} п.п. | пик ΔИнфл. мира +${mean(res.dInfl).toFixed(1)} п.п.`);
}

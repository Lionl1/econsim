// Ансамбль из командной строки:  node scripts/ensemble.mjs <preset-id | "текст события"> [сидов] [месяцев]
import fs from 'node:fs';
import { loadWorld } from './load.mjs';
import { runEnsemble } from '../src/sim/ensemble.js';
import { PRESETS } from '../src/sim/scenarios.js';
import { parseEvent } from '../src/sim/nlp.js';
import { buildTargets } from '../src/ui/targets.js';
const world = loadWorld();
const [arg = 'oil-shock', seeds = 20, months = 60] = process.argv.slice(2);
const preset = PRESETS.find(p => p.id === arg);
let scenarios;
if (preset) scenarios = [{ def: preset, delay: 0 }];
else {
  const T = buildTargets(world);
  const r = parseEvent(arg, world, sel => T.label(sel));
  if (!r.ok) { console.error(r.notes.join('\n')); process.exit(1); }
  scenarios = r.parts.map(p => ({ def: p, delay: p.delay }));
}
const t0 = Date.now();
const r = runEnsemble(world, scenarios, { seeds: +seeds, months: +months, params: !process.env.NOPARAMS, magnitude: !process.env.NOPARAMS });
const f = (x, d = 2) => (x > 0 ? '+' : '') + x.toFixed(d);
const rng = o => `${f(o.p50)} [${f(o.p10)} … ${f(o.p90)}]`;
console.log(`${scenarios.map(s => s.def.title).join(' + ')} — ${seeds} прогонов × ${months} мес. (${((Date.now() - t0) / 1000).toFixed(1)} с)`);
console.log(`ВВП мира в конце, %:     ${rng(r.end.gdp)}   хуже базы в ${(r.end.gdp.neg * 100).toFixed(0)}% прогонов`);
console.log(`ВВП мира, худшая точка:  ${rng(r.peak.gdp)}`);
console.log(`Инфляция, пик, п.п.:     ${rng(r.peak.infl)}`);
console.log(`Безработица, пик, п.п.:  ${rng(r.peak.unemp)}`);
console.log(`Мировой фондовый рынок, %: ${rng(r.end.eq)}   Биткоин, %: ${rng(r.end.btc)}   Мировая торговля, %: ${rng(r.end.trade)}`);
console.log(`Базовый рост мира по годам (медиана [10…90]) vs IMF WEO: ${r.baseline.years.map((y, k) => `${y}: ${r.baseline.growth.p50[k].toFixed(1)} [${r.baseline.growth.p10[k].toFixed(1)}…${r.baseline.growth.p90[k].toFixed(1)}] / ${r.baseline.imf[k] ?? '—'}`).join('; ')}`);
console.log(`Новые войны сверх базы:   ${f(r.wars.newWarsMedian, 0)}, больше войн чем в базе в ${(r.wars.pMore * 100).toFixed(0)}% прогонов`);
const big = r.countries.filter(c => world.countries[c.i].gdp > 5e9).sort((a, b) => a.p50 - b.p50);
const row = c => `  ${world.countries[c.i].nameRu.padEnd(28)} ${rng(c)}  (хуже базы в ${(c.neg * 100).toFixed(0)}%)`;
console.log('Больше всех теряют:\n' + big.slice(0, 6).map(row).join('\n'));
console.log('Больше всех выигрывают:\n' + big.slice(-4).reverse().map(row).join('\n'));

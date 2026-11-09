// Ensemble worker: runs off the main thread so the globe keeps animating.
import { buildWorld } from './world.js';
import { runEnsemble } from './ensemble.js';

const worlds = new Map();   // one world per start year
self.onmessage = ({ data }) => {
  const { id, raw, trade, markets, history, startYear = 2026, scenarios, baseScenarios, seeds, months, params, magnitude } = data;
  if (!worlds.has(startYear)) worlds.set(startYear, buildWorld(raw, { trade, markets, history, startYear }));
  const world = worlds.get(startYear);
  try {
    const result = runEnsemble(world, scenarios, { seeds, months, params, magnitude, baseScenarios, onProgress: p => self.postMessage({ id, progress: p }) });
    self.postMessage({ id, result });
  } catch (err) { self.postMessage({ id, error: String(err?.stack || err) }); }
};

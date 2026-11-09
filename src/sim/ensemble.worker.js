// Ensemble worker: runs off the main thread so the globe keeps animating.
import { buildWorld } from './world.js';
import { runEnsemble } from './ensemble.js';

let world = null;
self.onmessage = ({ data }) => {
  const { id, raw, trade, markets, scenarios, seeds, months, params, magnitude } = data;
  world ??= buildWorld(raw, { trade, markets });
  try {
    const result = runEnsemble(world, scenarios, { seeds, months, params, magnitude, onProgress: p => self.postMessage({ id, progress: p }) });
    self.postMessage({ id, result });
  } catch (err) { self.postMessage({ id, error: String(err?.stack || err) }); }
};

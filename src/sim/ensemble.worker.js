// Воркер ансамбля: считает прогоны вне основного потока, чтобы глобус не замирал.
import { buildWorld } from './world.js';
import { runEnsemble } from './ensemble.js';

let world = null;
self.onmessage = ({ data }) => {
  const { id, raw, scenarios, seeds, months } = data;
  world ??= buildWorld(raw);
  try {
    const result = runEnsemble(world, scenarios, { seeds, months, onProgress: p => self.postMessage({ id, progress: p }) });
    self.postMessage({ id, result });
  } catch (err) { self.postMessage({ id, error: String(err?.stack || err) }); }
};

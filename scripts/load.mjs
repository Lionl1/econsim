// World loader for Node scripts: countries + Comtrade trade + markets (when downloaded).
import fs from 'node:fs';
import { buildWorld } from '../src/sim/world.js';
const read = f => { const u = new URL('../public/data/' + f, import.meta.url); return fs.existsSync(u) ? JSON.parse(fs.readFileSync(u)) : null; };
export const loadData = () => ({ raw: read('countries.json'), trade: read('trade.json'), markets: read('markets.json') });
export function loadWorld() { const d = loadData(); return buildWorld(d.raw, d); }

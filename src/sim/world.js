// Builds the static "world": countries, distances, trade matrix and shares, currencies, forecasts, baseline relations.
import { BLOCS, ALLIES, RIVALRIES, NATO_ADVERSARIES, NUCLEAR } from './blocs.js';
import { BTC_BY_YEAR } from './calendar.js';

const R = 6371;
export function haversine(lat1, lon1, lat2, lon2) {
  const toR = Math.PI / 180;
  const dLat = (lat2 - lat1) * toR, dLon = (lon2 - lon1) * toR;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * toR) * Math.cos(lat2 * toR) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(a)));
}

const clamp = (x, a, b) => Math.max(a, Math.min(b, x));

export function buildWorld(raw, { trade = null, markets = null, history = null, startYear = 2026 } = {}) {
  const N = raw.length;
  const idx = new Map(raw.map((c, i) => [c.iso3, i]));
  const countries = raw.map((c, i) => {
    const blocs = Object.keys(BLOCS).filter(b => BLOCS[b].includes(c.iso3));
    const dem = clamp((c.wgiVA + 2.5) / 5, 0, 1);
    return {
      ...c, i, blocs, dem,
      ge: clamp((c.wgiGE + 2.5) / 5, 0, 1),
      cc: clamp((c.wgiCC + 2.5) / 5, 0, 1),
      nuclear: NUCLEAR.has(c.iso3),
      cLat: c.capLat ?? c.lat, cLon: c.capLon ?? c.lon,
      openness: clamp((c.exports + c.imports) / 200, 0.05, 1.2),
    };
  });

  // historical start: the state at January of startYear comes from actual data for startYear-1
  if (startYear < 2026 && history) applyHistory(countries, history, startYear);

  // distances between capitals
  const dist = new Float32Array(N * N);
  for (let i = 0; i < N; i++) for (let j = i + 1; j < N; j++) {
    const d = haversine(countries[i].cLat, countries[i].cLon, countries[j].cLat, countries[j].cLon);
    dist[i * N + j] = dist[j * N + i] = d;
  }
  const border = new Uint8Array(N * N);
  countries.forEach((c, i) => c.borders.forEach(b => { const j = idx.get(b); if (j != null) border[i * N + j] = border[j * N + i] = 1; }));

  const sharedBlocs = (a, b) => a.blocs.filter(x => b.blocs.includes(x) && x !== 'G20' && x !== 'G7').length;

  // trade weights share[i][j]: j's share of i's foreign trade (gravity model, replaced by Comtrade below)
  const share = new Float32Array(N * N);
  for (let i = 0; i < N; i++) {
    let sum = 0;
    for (let j = 0; j < N; j++) {
      if (i === j) continue;
      const aff = 1 + 1.2 * border[i * N + j] + 0.7 * sharedBlocs(countries[i], countries[j])
        + (countries[i].blocs.includes('EU') && countries[j].blocs.includes('EU') ? 1.5 : 0);
      const g = Math.pow(countries[j].gdp, 0.85) / Math.pow(dist[i * N + j] + 400, 1.0) * aff;
      share[i * N + j] = g; sum += g;
    }
    for (let j = 0; j < N; j++) share[i * N + j] /= sum;
  }
  // ---- actual trade (UN Comtrade) ----
  // X[i*N+j]: exports from i to j, USD mn. Partner structure from Comtrade (goods), total from World Bank exports
  // (goods + services). Countries without Comtrade data get the gravity structure.
  const X = new Float64Array(N * N);
  const expTot = countries.map(c => c.exports / 100 * c.gdp / 1e6);               // USD mn
  let tradeCover = 0;
  if (trade?.exports) {
    for (let i = 0; i < N; i++) {
      const row = trade.exports[countries[i].iso3] || {};
      for (const [iso, v] of Object.entries(row)) { const j = idx.get(iso); if (j != null && j !== i) X[i * N + j] = v; }
    }
    // a pair i->j is "observed" if the importer j reported imports or the exporter i reported exports;
    // unobserved pairs get a gravity estimate scaled to the exporter's observed flows (not a zero)
    const repM = new Set(trade.reportersM || trade.reporters || []), repX = new Set(trade.reportersX || trade.reporters || []);
    for (let i = 0; i < N; i++) {
      const xi = repX.has(countries[i].iso3);
      let sObs = 0, gObs = 0, gAll = 0;
      for (let j = 0; j < N; j++) {
        if (j === i) continue;
        const obs = xi || repM.has(countries[j].iso3);
        gAll += share[i * N + j];
        if (obs) { sObs += X[i * N + j]; gObs += share[i * N + j]; }
      }
      if (sObs > 0 && gObs > 0.05) {
        tradeCover++;
        const k = sObs / gObs;                                   // $ per unit of gravity share, from observed pairs
        for (let j = 0; j < N; j++) if (j !== i && !(xi || repM.has(countries[j].iso3))) X[i * N + j] = k * share[i * N + j];
        let s = 0; for (let j = 0; j < N; j++) s += X[i * N + j];
        for (let j = 0; j < N; j++) X[i * N + j] *= expTot[i] / s;
        countries[i].tradeData = true;
      } else {
        for (let j = 0; j < N; j++) X[i * N + j] = expTot[i] * share[i * N + j];   // gravity as the fallback
        countries[i].tradeData = false;
      }
    }
  } else for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) X[i * N + j] = expTot[i] * share[i * N + j];
  // shares: xs, where i exports to; ms, where i imports from; share, j's share of all of i's trade
  const xs = new Float32Array(N * N), ms = new Float32Array(N * N);
  const impTot = new Float64Array(N);
  for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) impTot[j] += X[i * N + j];
  for (let i = 0; i < N; i++) {
    let sx = 0, st = 0;
    for (let j = 0; j < N; j++) { sx += X[i * N + j]; st += X[i * N + j] + X[j * N + i]; }
    for (let j = 0; j < N; j++) {
      xs[i * N + j] = sx ? X[i * N + j] / sx : 0;
      ms[i * N + j] = impTot[i] ? X[j * N + i] / impTot[i] : 0;
      if (trade?.exports && st > 0) share[i * N + j] = (X[i * N + j] + X[j * N + i]) / st;
    }
  }

  // top partners for fast iteration
  const partners = countries.map((_, i) => {
    const arr = [];
    for (let j = 0; j < N; j++) if (share[i * N + j] > 0) arr.push(j);
    arr.sort((a, b) => share[i * N + b] - share[i * N + a]);
    return arr.slice(0, 40);
  });

  // baseline relations [-1..1]
  const base = new Float32Array(N * N);
  for (let i = 0; i < N; i++) for (let j = i + 1; j < N; j++) {
    const a = countries[i], b = countries[j];
    let r = 0.12;
    r += 0.18 * Math.min(2, sharedBlocs(a, b));
    if (a.region === b.region) r += 0.05;
    if (a.subregion === b.subregion) r += 0.04;
    r -= 0.12 * Math.abs(a.dem - b.dem);
    if (border[i * N + j]) r -= 0.04;
    if (a.blocs.includes('NATO') && NATO_ADVERSARIES.includes(b.iso3)) r -= 0.35;
    if (b.blocs.includes('NATO') && NATO_ADVERSARIES.includes(a.iso3)) r -= 0.35;
    base[i * N + j] = base[j * N + i] = r;
  }
  const applyPair = (x, y, fn) => { const i = idx.get(x), j = idx.get(y); if (i != null && j != null) { base[i * N + j] = base[j * N + i] = fn(base[i * N + j]); } };
  ALLIES.forEach(([x, y]) => applyPair(x, y, r => Math.max(r, 0.75)));
  RIVALRIES.forEach(([x, y, v]) => applyPair(x, y, r => Math.min(r, v)));
  for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) base[i * N + j] = clamp(base[i * N + j], -1, 1);

  // alliances (for joining wars): bilateral + defense blocs
  const allies = countries.map(() => new Set());
  ALLIES.forEach(([x, y]) => { const i = idx.get(x), j = idx.get(y); if (i != null && j != null) { allies[i].add(j); allies[j].add(i); } });

  // groups for selectors
  const groups = { all: countries.map(c => c.i) };
  countries.forEach(c => {
    (groups['region:' + c.region] ??= []).push(c.i);
    if (c.subregion) (groups['subregion:' + c.subregion] ??= []).push(c.i);
    (groups['income:' + c.income] ??= []).push(c.i);
    c.blocs.forEach(b => (groups['bloc:' + b] ??= []).push(c.i));
    if (c.fuelExp > 30) (groups['oilExp'] ??= []).push(c.i);
    if (c.energyImp > 40) (groups['energyImp'] ??= []).push(c.i);
  });

  // import sources for the trade model: top by import share
  const sources = countries.map((_, i) => {
    const arr = [];
    for (let j = 0; j < N; j++) if (ms[i * N + j] > 0) arr.push(j);
    arr.sort((a, b) => ms[i * N + b] - ms[i * N + a]);
    return arr.slice(0, 45);
  });

  // ---- currencies, forecasts, crypto ----
  const cur = markets?.currencies || {};
  countries.forEach(c => {
    const m = cur[c.iso3] || {};
    c.currency = { code: m.code || 'USD', name: m.name || '', symbol: m.symbol || '', regime: m.regime || (c.iso3 === 'USA' ? 'anchor' : 'float'),
      anchor: m.anchor || null, rate0: (startYear < 2026 && c.fx0) || m.rateUSD || 1, fxVol: m.fxVol ?? 0.08 };
    c.forecast = markets?.forecast?.[c.iso3] || null;
    c.equity = markets?.equity?.[c.iso3] || null;
  });
  // exports covered by the trade model (pairs where the supplier is among the importer's top sources)
  const expCovered = new Float64Array(N);
  for (let i = 0; i < N; i++) for (const j of sources[i]) expCovered[j] += X[j * N + i];

  return { N, countries, idx, dist, border, share, partners, base, allies, groups, X, xs, ms, sources, impTot, expTot, expCovered, tradeCover,
    companies: markets?.companies || [],
    startYear,
    crypto: startYear < 2026 ? { btc: { price: BTC_BY_YEAR[startYear] ?? 1 } } : markets?.crypto || null,
    cryptoScale: clamp((startYear - 2012) / 12, 0, 1), worldForecastPPP: markets?.worldForecast || null, worldForecast: forecastMER(countries, raw), marketsAsOf: markets?.asOf || null };
}

// Replace current values with the actual state at the end of startYear-1. Potential growth and the inflation
// anchor become the averages of the five years before the start (the model's pre-event trend); from 2026 on the
// engine switches to the IMF WEO forecast. Countries without history are scaled by the median ratio.
function applyHistory(countries, history, startYear) {
  const y0 = String(startYear - 1), years = [0, 1, 2, 3, 4].map(k => String(startYear - 1 - k));
  const ratios = [], popRatios = [];
  for (const c of countries) {
    const h = history[c.iso3];
    if (h?.gdp?.[y0] && h.gdp['2024']) ratios.push(h.gdp[y0] / h.gdp['2024']);
    if (h?.pop?.[y0] && h.pop['2024']) popRatios.push(h.pop[y0] / h.pop['2024']);
  }
  const med = a => { const b = [...a].sort((x, y) => x - y); return b[Math.floor(b.length / 2)] ?? 1; };
  if (ratios.length < 50) throw new Error(`No World Bank history for ${startYear - 1}: refresh public/data/history.json (npm run history)`);
  const gR = med(ratios), pR = med(popRatios);
  const medianOf = v => v.length ? [...v].sort((a, b) => a - b)[Math.floor(v.length / 2)] : null;
  const mean = (h, k) => { const v = years.map(y => h?.[k]?.[y]).filter(x => x != null); return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null; };
  for (const c of countries) {
    const h = history[c.iso3] || {};
    c.gdp = h.gdp?.[y0] ?? c.gdp * gR;
    c.pop = h.pop?.[y0] ?? c.pop * pR;
    c.gdpPc = c.gdp / c.pop;
    if (h.growth?.[y0] != null) c.growth = h.growth[y0];
    if (h.infl?.[y0] != null) c.infl = h.infl[y0];
    if (h.unemp?.[y0] != null) c.unemp = h.unemp[y0];
    if (h.debt?.[y0] != null) c.debt = h.debt[y0];
    // growth trend: 5-year mean; inflation: 5-year median (robust to one-off crisis spikes like 1995 Russia or 1998 Asia)
    const tg = mean(h, 'growth'), ti = medianOf(years.map(y => h.infl?.[y]).filter(x => x != null));
    c.trend = clamp(tg ?? c.growth, -2, 9);
    c.inflTrend = clamp(ti ?? c.infl, 0.5, 40);
    c.fx0 = h.fx?.[y0] ?? null;
  }
}

// IMF world forecast weighted by GDP at market rates (like the model aggregate); the IMF publishes it in PPP
function forecastMER(countries, raw) {
  const out = {};
  for (let y = 2026; y <= 2031; y++) {
    let w = 0, v = 0;   // today's GDP weights, also when the world starts in the past
    for (const c of countries) { const g = c.forecast?.growth?.[y], gdp = raw[c.i].gdp; if (g != null) { w += gdp; v += gdp * g; } }
    if (w) out[y] = +(v / w).toFixed(2);
  }
  return out;
}

// Target "selector" -> array of indices. Examples: 'all', 'iso:USA', 'region:Europe', 'bloc:NATO', 'oilExp'
export function resolve(world, sel) {
  const out = new Set();
  const list = Array.isArray(sel) ? sel : [sel];
  for (const s of list) {
    if (s.startsWith('iso:')) { const i = world.idx.get(s.slice(4)); if (i != null) out.add(i); }
    else (world.groups[s] || []).forEach(i => out.add(i));
  }
  return [...out];
}

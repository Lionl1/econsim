// Строит статический «мир»: страны, расстояния, торговые веса (гравитационная модель), базовые отношения.
import { BLOCS, ALLIES, RIVALRIES, NATO_ADVERSARIES, NUCLEAR } from './blocs.js';

const R = 6371;
export function haversine(lat1, lon1, lat2, lon2) {
  const toR = Math.PI / 180;
  const dLat = (lat2 - lat1) * toR, dLon = (lon2 - lon1) * toR;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * toR) * Math.cos(lat2 * toR) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(a)));
}

const clamp = (x, a, b) => Math.max(a, Math.min(b, x));

export function buildWorld(raw) {
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

  // расстояния между столицами
  const dist = new Float32Array(N * N);
  for (let i = 0; i < N; i++) for (let j = i + 1; j < N; j++) {
    const d = haversine(countries[i].cLat, countries[i].cLon, countries[j].cLat, countries[j].cLon);
    dist[i * N + j] = dist[j * N + i] = d;
  }
  const border = new Uint8Array(N * N);
  countries.forEach((c, i) => c.borders.forEach(b => { const j = idx.get(b); if (j != null) border[i * N + j] = border[j * N + i] = 1; }));

  const sharedBlocs = (a, b) => a.blocs.filter(x => b.blocs.includes(x) && x !== 'G20' && x !== 'G7').length;

  // торговые веса share[i][j]: доля внешней торговли i, приходящаяся на j (гравитационная модель)
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
  // топ-партнёры для быстрого обхода
  const partners = countries.map((_, i) => {
    const arr = [];
    for (let j = 0; j < N; j++) if (share[i * N + j] > 0) arr.push(j);
    arr.sort((a, b) => share[i * N + b] - share[i * N + a]);
    return arr.slice(0, 40);
  });

  // базовые отношения [-1..1]
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

  // альянсы (для вступления в войны): bilateral + defense blocs
  const allies = countries.map(() => new Set());
  ALLIES.forEach(([x, y]) => { const i = idx.get(x), j = idx.get(y); if (i != null && j != null) { allies[i].add(j); allies[j].add(i); } });

  // группы для селекторов
  const groups = { all: countries.map(c => c.i) };
  countries.forEach(c => {
    (groups['region:' + c.region] ??= []).push(c.i);
    if (c.subregion) (groups['subregion:' + c.subregion] ??= []).push(c.i);
    (groups['income:' + c.income] ??= []).push(c.i);
    c.blocs.forEach(b => (groups['bloc:' + b] ??= []).push(c.i));
    if (c.fuelExp > 30) (groups['oilExp'] ??= []).push(c.i);
    if (c.energyImp > 40) (groups['energyImp'] ??= []).push(c.i);
  });

  return { N, countries, idx, dist, border, share, partners, base, allies, groups };
}

// «Селектор» цели -> массив индексов. Примеры: 'all', 'iso:USA', 'region:Europe', 'bloc:NATO', 'oilExp'
export function resolve(world, sel) {
  const out = new Set();
  const list = Array.isArray(sel) ? sel : [sel];
  for (const s of list) {
    if (s.startsWith('iso:')) { const i = world.idx.get(s.slice(4)); if (i != null) out.add(i); }
    else (world.groups[s] || []).forEach(i => out.add(i));
  }
  return [...out];
}

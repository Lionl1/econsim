// Агенты-граждане: каждый агент представляет долю населения страны (pop / n).
// Они теряют работу, реагируют на инфляцию и рост, протестуют, эмигрируют и голосуют (через настроения).
import { hash, gauss } from './rng.js';

const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
// id агента-гражданина: отдельное от индексов стран пространство, чтобы не делить с ними случайные числа
const cid = (i, k) => 1_000_000 + i * 1000 + k;

export function initCitizens(sim, s, c) {
  const n = clamp(Math.round(16 + 14 * Math.log10(Math.max(c.pop, 1e5) / 1e5)), 16, 100);
  const cit = { n, inc: new Float32Array(n), sent: new Float32Array(n), emp: new Uint8Array(n), prot: new Uint8Array(n) };
  for (let k = 0; k < n; k++) {
    cit.inc[k] = (k + 0.5) / n;
    cit.sent[k] = clamp(s.sentBase + 0.03 * gauss(sim.seed, cid(s.i, k), 0, 70), 0, 1);
    cit.emp[k] = hash(sim.seed, cid(s.i, k), 0, 71) < s.unemp / 100 ? 0 : 1;
  }
  s.cit = cit; s.sent = cit.sent.reduce((a, b) => a + b, 0) / n;
}

export function updateCitizens(sim, s, c) {
  const t = sim.t, i = s.i, cit = s.cit, n = cit.n, W = sim.world, N = W.N;
  const ur = s.unemp / 100;
  const thr = 0.32 - 0.08 * (1 - s.dem);
  const gini = c.gini / 40;
  let sum = 0, prot = 0;
  for (let k = 0; k < n; k++) {
    const id = cid(i, k);
    // рынок труда: часть агентов перебрасывается между занятостью и безработицей
    if (hash(sim.seed, id, t, 72) < 0.12) cit.emp[k] = hash(sim.seed, id, t, 73) < clamp(ur * (1.7 - 1.4 * cit.inc[k]), 0, 0.92) ? 0 : 1;
    const target = s.sentBase
      + 0.035 * (s.gc - s.gpot) - 0.012 * clamp(s.infl - s.infl0, -8, 40) - 0.04 * (s.unemp - s.unemp0)
      + (cit.emp[k] ? 0 : -0.12) + (cit.inc[k] - 0.5) * 0.1 * gini
      - 0.25 * Math.min(1, s.warCount) + 0.4 * (s.stab - s.stab0) + s.mods.sent
      + 0.04 * gauss(sim.seed, id, t, 74);
    cit.sent[k] = clamp(cit.sent[k] + 0.2 * (target - cit.sent[k]), 0, 1);
    sum += cit.sent[k];
    cit.prot[k] = cit.sent[k] < thr && hash(sim.seed, id, t, 75) < 0.25 ? 1 : 0;
    prot += cit.prot[k];
    // эмиграция: недовольные уезжают в более богатые/стабильные страны-партнёры
    if (cit.sent[k] < 0.26 && hash(sim.seed, id, t, 76) < 0.005) migrate(sim, s, c, id);
  }
  s.sent = sum / n; s.protest = prot / n;

  if (s.protest > 0.22 && !s.protestFlag) { s.protestFlag = true; sim.log('protest', `✊ Массовые протесты: ${c.nameRu}`, [i], 3); }
  else if (s.protest < 0.1) s.protestFlag = false;

  // политика: выборы в демократиях, перевороты в авторитарных режимах
  if (s.dem > 0.5 && t >= s.nextElection) {
    s.nextElection = t + 48 + Math.floor(24 * sim.rnd(i, 77));
    const pLoss = clamp(0.5 - 3 * (s.sent - s.sentBase), 0.1, 0.95);
    if (sim.rnd(i, 78) < pLoss) govChange(sim, s, c, 'Выборы: смена власти');
  } else if (s.dem <= 0.5 && s.stab < 0.2 && s.protest > 0.15 && sim.rnd(i, 79) < 0.03 && t - s.lastGovChange > 24) {
    govChange(sim, s, c, 'Переворот/революция');
    s.dem = clamp(s.dem + 0.2 * gauss(sim.seed, i, t, 80), 0, 1); s.stab = Math.min(0.9, s.stab + 0.15);
  }
}

function govChange(sim, s, c, label) {
  const t = sim.t, i = s.i;
  s.lastGovChange = t;
  s.hawk = clamp(s.hawk + 0.14 * gauss(sim.seed, i, t, 81), 0.02, 0.98);
  s.protect = clamp(s.protect + 0.18 * gauss(sim.seed, i, t, 82), 0.02, 0.98);
  s.coop = clamp(s.coop + 0.12 * gauss(sim.seed, i, t, 83), 0.05, 0.98);
  s.cit.sent.forEach((_, k) => (s.cit.sent[k] = clamp(s.cit.sent[k] + 0.05, 0, 1)));
  sim.log('gov', `🗳 ${label}: ${c.nameRu}`, [i], s.gdp > 4e11 ? 2 : 1);
}

function migrate(sim, s, c, id) {
  const W = sim.world, N = W.N, i = s.i;
  let tot = 0; const ws = [];
  for (const j of W.partners[i].slice(0, 25)) {
    if (sim.warMat[i * N + j] || sim.R[i * N + j] < -0.5) { ws.push(0); continue; }
    const d = sim.S[j];
    const w = Math.sqrt(W.share[i * N + j]) * (0.2 + d.stab) * Math.pow((d.gdp / d.pop) / (s.gdp / s.pop + 500), 0.3);
    ws.push(w); tot += w;
  }
  if (tot <= 0) return;
  let r = hash(sim.seed, id, sim.t, 84) * tot, pick = -1;
  for (let k = 0; k < ws.length; k++) { r -= ws[k]; if (r <= 0) { pick = W.partners[i][k]; break; } }
  if (pick < 0) return;
  const mass = 0.02 * s.pop / s.cit.n;
  s.pop -= mass; sim.S[pick].pop += mass; s.migNet -= mass; sim.S[pick].migNet += mass;
}

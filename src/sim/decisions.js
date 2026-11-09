// Агенты-правительства: каждая страна принимает решения по фискальной/денежной политике, торговле,
// дипломатии, военным расходам, санкциям, помощи и войне. Решения зависят от «характера» (hawk, coop, protect),
// типа режима и текущей ситуации — так, как вели бы себя правительства.
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));

export function decide(sim, i) {
  const W = sim.world, N = W.N, s = sim.S[i], c = W.countries[i], t = sim.t;

  // --- денежная политика (каждый месяц): правило Тейлора с шагом 0.25 п.п. ---
  const gap = s.gc - s.gpot;
  const rT = clamp(s.r0 + 1.3 * (s.infl - s.infl0) + 0.4 * gap, 0, 45);
  s.r += clamp(rT - s.r, -0.5, 0.5);

  // --- военные расходы: реакция на угрозу ---
  let threat = 0;
  for (const j of W.partners[i].slice(0, 15)) {
    if (W.border[i * N + j] || W.dist[i * N + j] < 2500) threat += Math.max(0, -sim.R[i * N + j] - 0.2);
  }
  threat = clamp(threat * 0.8 + 0.7 * Math.min(1, s.warCount), 0, 1);
  const milT = s.mil0 * (1 + 0.9 * threat) + s.mods.mil;
  s.mil += 0.08 * (milT - s.mil);

  if ((t + i) % 3 !== 0) return;
  s.lastDecide = t;

  // --- фискальная политика ---
  let fT = 0;
  if (gap < -1) fT = clamp(0.7 * -gap, 0, 5);
  else if (gap > 1.5) fT = -clamp(0.3 * gap, 0, 1.5);
  if (s.debt > 100) fT = Math.min(fT, 0) - clamp((s.debt - 100) / 60, 0, 2.5);
  if (c.ge < 0.35) fT *= 0.5;                             // слабое государство хуже стимулирует
  s.f += clamp(fT - s.f, -0.4, 0.4);

  // --- тарифы: ответные меры и протекционизм ---
  for (const j of W.partners[i].slice(0, 20)) {
    const k = i * N + j, kr = j * N + i;
    if (sim.lockedT.has(k)) continue;
    const rel = sim.R[k];
    const theirs = sim.T[kr], mine = sim.T[k];
    if (theirs > mine + 4 && sim.rnd(i, 10 + (j % 7), t) < 0.5 + 0.4 * s.protect) {
      sim.T[k] = Math.min(80, mine + Math.max(5, (theirs - mine) * 0.6));
      if (sim.T[k] - mine >= 10) sim.log('tariff', `🛃 Ответные пошлины ${sim.T[k].toFixed(0)}%: ${c.nameRu} → ${W.countries[j].nameRu}`, [i, j], 2);
    } else if (rel < 0.05 && s.protect > 0.65 && s.unemp > s.unemp0 + 1.5 && mine < 30 && sim.rnd(i, 20 + (j % 5), t) < 0.03 * W.share[k] * 30) {
      sim.T[k] = mine + 10;
      sim.log('tariff', `🛃 Пошлины +10% (протекционизм): ${c.nameRu} → ${W.countries[j].nameRu}`, [i, j], 2);
    } else if (mine > 0 && rel > 0.3 && theirs <= mine) {
      sim.T[k] = Math.max(0, mine - 2 * (0.5 + s.coop));      // разрядка
    }
  }

  // --- санкции: снятие и введение ---
  for (const j of W.partners[i].slice(0, 30)) {
    const k = i * N + j;
    if (sim.San[k] && !sim.lockedSan.has(k) && sim.R[k] > -0.2 && sim.rnd(i, 30 + (j % 9), t) < 0.06 && !sim.warMat[k]) {
      sim.San[k] = 0; sim.log('sanction', `🔓 Санкции сняты: ${c.nameRu} → ${W.countries[j].nameRu}`, [i, j], 2);
    }
  }
  if (c.gdp > 3e11 && s.coop > 0.3 && s.dem > 0.5 && c.gdpPc > 12000) {
    for (const w of sim.wars) {
      const atk = w.primaryA, vic = w.primaryB;
      if (w.a.includes(i) || w.b.includes(i)) continue;
      if (sim.San[i * N + atk] || W.allies[i].has(atk) || sim.R[i * N + atk] > 0.35) continue;
      if (sim.R[i * N + vic] > 0.1 && sim.R[i * N + atk] < 0.2 && sim.rnd(i, 40 + (atk % 7), t) < 0.12 * (0.5 + s.coop)) {
        sim.San[i * N + atk] = 1; sim.log('sanction', `⛔ Санкции: ${c.nameRu} → ${W.countries[atk].nameRu}`, [i, atk], 3);
      }
    }
  }

  // --- помощь пострадавшим друзьям ---
  if (c.gdpPc > 20000 && s.coop > 0.5 && s.debt < 110 && sim.rnd(i, 50, t) < 0.15) {
    let best = -1, bestV = 0;
    for (const j of W.partners[i].slice(0, 20)) {
      const d = sim.S[j];
      const need = (d.g < -2 ? 1 : 0) + (d.stab < 0.3 ? 1 : 0) + (d.warCount ? 1 : 0);
      const v = need * (sim.R[i * N + j] + 0.3);
      if (need && d.gdp / d.pop < 0.7 * s.gdp / s.pop && sim.R[i * N + j] > 0.2 && v > bestV &&!sim.warMat[i * N + j] && !sim.wars.some(w => w.a.includes(j))) { bestV = v; best = j; }
    }
    if (best >= 0) {
      const d = sim.S[best], amt = s.gdp * 0.0004;
      d.gdp += amt; s.gdp -= amt * 0.3;
      sim.aid[i * N + best] += 0.05; d.stab = Math.min(0.99, d.stab + 0.01);
      if (sim.rnd(i, 51, t) < 0.3) sim.log('aid', `🤝 Помощь: ${c.nameRu} → ${W.countries[best].nameRu}`, [i, best], 1);
    }
  }

  // --- война ---
  if (s.warCount >= 1 || t < 3) return;
  let best = -1, bestScore = 0;
  const P0 = sim.milPower(i);
  for (const j of W.partners[i].slice(0, 30)) {
    const k = i * N + j;
    if (sim.R[k] > -0.5 || (sim.truce.get(k) ?? 0) > t || sim.warMat[k]) continue;
    const near = W.border[k] || W.dist[k] < 3000;
    if (!near) continue;
    const d = W.countries[j];
    if (d.nuclear && !c.nuclear) continue;
    if (d.nuclear && c.nuclear && sim.rnd(i, 60, t) < 0.9) continue;
    const defBloc = d.blocs.some(b => ['NATO', 'CSTO'].includes(b) && !c.blocs.includes(b));
    let Pj = sim.milPower(j);
    W.allies[j].forEach(a => { if (!W.allies[i].has(a)) Pj += 0.5 * sim.milPower(a); });
    if (defBloc) Pj *= 8;
    const win = P0 / (P0 + Pj);
    const score = (win - 0.5) * 3 + 0.9 * (s.hawk - 0.5) + 0.8 * (-sim.R[k] - 0.5) + (s.sent < s.sentBase - 0.05 && s.dem < 0.5 ? 0.3 : 0) - 0.3 * s.coop;
    if (score > bestScore) { bestScore = score; best = j; }
  }
  if (best >= 0 && sim.rnd(i, 61, t) < 0.02 * bestScore) sim.declareWar([i], [best]);
}

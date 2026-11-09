// Окно «Оценка на N прогонах»: сценарий против базового мира на многих сидах, медиана и коридор 10–90%.
import { lineChart } from './charts.js';
import { esc } from './targets.js';

const $ = (s, r = document) => r.querySelector(s);
const f = (x, d = 2) => (x > 0 ? '+' : '') + x.toFixed(d);
const rng = (o, u = '') => `<b>${f(o.p50)}${u}</b> <span class="hint">[${f(o.p10)} … ${f(o.p90)}]</span>`;

export function initEnsemble(app) {
  const box = document.createElement('div');
  box.id = 'ens';
  box.innerHTML = `<div class="ens-card panel">
    <div class="row"><b id="ens-title">Оценка сценария</b><button class="small" id="ens-close">✕</button></div>
    <div class="hint" id="ens-sub"></div>
    <div class="form ens-opts"><div class="r2">
      <div><label>Прогонов</label><select id="ens-seeds"><option>10</option><option selected>20</option><option>40</option></select></div>
      <div><label>Горизонт, мес.</label><select id="ens-months"><option>36</option><option selected>60</option><option>120</option></select></div></div>
      <button id="ens-rerun">Пересчитать</button></div>
    <div class="bar" id="ens-bar"><i style="width:0%"></i></div>
    <div id="ens-body"></div>
    <div class="r2" style="margin-top:10px"><button class="primary" id="ens-launch">▶ Запустить в основном мире</button><button id="ens-close2">Закрыть</button></div>
  </div>`;
  document.body.appendChild(box);
  let worker = null, job = 0, current = null;
  const close = () => { box.classList.remove('on'); worker?.terminate(); worker = null; };
  $('#ens-close').onclick = close; $('#ens-close2').onclick = close;
  box.onclick = e => { if (e.target === box) close(); };
  $('#ens-rerun').onclick = () => current && run(current);
  $('#ens-launch').onclick = () => { if (!current) return; current.scenarios.forEach(s => app.launch(s.def, s.delay)); close(); };

  const run = req => {
    current = req;
    const seeds = +$('#ens-seeds').value, months = +$('#ens-months').value;
    $('#ens-title').textContent = 'Оценка: ' + req.title;
    $('#ens-sub').textContent = `Сценарий против базового мира на ${seeds} прогонах с разными случайными событиями, ${months} мес. от стартового мира 2026 г. Жирное — медиана, в скобках — 10…90% прогонов.`;
    $('#ens-body').innerHTML = '<div class="hint" style="padding:12px 0">Считаю…</div>';
    $('#ens-bar i').style.width = '0%';
    worker?.terminate();
    worker = new Worker(new URL('../sim/ensemble.worker.js', import.meta.url), { type: 'module' });
    const id = ++job;
    worker.onmessage = ({ data }) => {
      if (data.id !== id) return;
      if (data.progress != null) $('#ens-bar i').style.width = (data.progress * 100).toFixed(0) + '%';
      if (data.error) $('#ens-body').innerHTML = `<pre class="hint">${esc(data.error)}</pre>`;
      if (data.result) { render(data.result); worker.terminate(); worker = null; }
    };
    worker.postMessage({ id, raw: app.raw, scenarios: req.scenarios, seeds, months });
  };

  const render = r => {
    const W = app.world;
    const big = r.countries.filter(c => W.countries[c.i].gdp > 5e9).sort((a, b) => a.p50 - b.p50);
    const row = c => `<div class="eff"><span>${esc(W.countries[c.i].nameRu)}</span><span>${rng(c, '%')} <span class="hint">${Math.round((c.p50 < 0 ? c.neg : c.pos) * 100)}%</span></span></div>`;
    const robust = r.end.gdp.neg >= 0.8 ? 'устойчиво отрицательный' : r.end.gdp.neg <= 0.2 ? 'устойчиво положительный' : 'неустойчивый: знак зависит от случайных событий';
    $('#ens-body').innerHTML = `
      <div class="card">
        <div class="row"><span>ВВП мира в конце</span><span>${rng(r.end.gdp, '%')}</span></div>
        <div class="row"><span>ВВП мира, худшая точка</span><span>${rng(r.peak.gdp, '%')}</span></div>
        <div class="row"><span>Инфляция мира, пик</span><span>${rng(r.peak.infl, ' п.п.')}</span></div>
        <div class="row"><span>Безработица, пик</span><span>${rng(r.peak.unemp, ' п.п.')}</span></div>
        <div class="row"><span>Новые войны (кроме заданных сценарием)</span><span><b>${f(r.wars.newWarsMedian, 0)}</b> <span class="hint">больше, чем в базе, в ${Math.round(r.wars.pMore * 100)}% прогонов</span></span></div>
        <div class="d" style="margin:6px 0 0">Эффект на ВВП мира ${robust} (хуже базы в ${Math.round(r.end.gdp.neg * 100)}% прогонов).</div>
      </div>
      <h3>ВВП мира к базе, % (медиана и 10–90%)</h3><canvas id="ens-c1"></canvas>
      <h3>Инфляция и безработица к базе, п.п.</h3><canvas id="ens-c2"></canvas>
      <h3>${big[0].p50 < 0 ? 'Больше всех теряют' : 'Меньше всех выигрывают'} <span class="hint">(медиана, разброс, доля прогонов с таким знаком)</span></h3>${big.slice(0, 6).map(row).join('')}
      <h3>${big[big.length - 1].p50 > 0 ? 'Больше всех выигрывают' : 'Меньше всех теряют'}</h3>${big.slice(-5).reverse().map(row).join('')}`;
    const b = r.bands;
    lineChart($('#ens-c1'), [{ data: b.gdp.p50, lo: b.gdp.p10, hi: b.gdp.p90, color: '#6ea8ff', label: 'ВВП' }], { height: 110, zeroLine: true, fmt: v => v.toFixed(1) + '%' });
    lineChart($('#ens-c2'), [
      { data: b.infl.p50, lo: b.infl.p10, hi: b.infl.p90, color: '#f5a524', label: 'инфляция' },
      { data: b.unemp.p50, lo: b.unemp.p10, hi: b.unemp.p90, color: '#ff7a90', label: 'безработица' },
    ], { height: 110, zeroLine: true, fmt: v => v.toFixed(1) });
  };

  // req: { title, scenarios: [{ def, delay }] }
  app.evaluate = req => { box.classList.add('on'); run(req); };
}

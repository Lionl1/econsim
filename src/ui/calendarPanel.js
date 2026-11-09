// "Calendar" tab: global events 2000–2025. Pick a start year, untick events that "did not happen",
// travel back and compare the world as it was with the world without them, then extend both into the forecast.
import { CALENDAR, eventYear, monthOf } from '../sim/calendar.js';
import { esc } from './targets.js';

const $ = (s, r = document) => r.querySelector(s);
const flag = iso2 => iso2 ? String.fromCodePoint(...[...iso2.toUpperCase()].map(c => 0x1f1a5 + c.charCodeAt(0))) : '';
const MONTHS = ['янв', 'фев', 'мар', 'апр', 'май', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'];
const fmtDate = d => { const [y, m] = d.split('-').map(Number); return `${MONTHS[m - 1]} ${y}`; };
const sg = (v, d = 1) => (v > 0 ? '+' : '') + v.toFixed(d);

export function initCalendar(app) {
  const root = $('#tab-cal');
  const st = { startYear: 2019, removed: new Set(['covid']) };

  const render = () => {
    const years = Array.from({ length: 26 }, (_, k) => 2000 + k);
    const evs = CALENDAR.filter(ev => eventYear(ev) >= st.startYear);
    root.innerHTML = `
      <p class="hint">Вернитесь в прошлое с реальным состоянием мира на начало выбранного года (данные World Bank) и посмотрите, каким был бы мир без отдельных событий. Модель считает два мира с одной и той же случайностью: <b>как было</b> (все события) и <b>без отмеченных</b>, и продолжает оба в прогноз до 2031 г. (после 2025 г. база — прогноз IMF).</p>
      <div class="form"><div class="r2">
        <div><label>Начать с</label><select id="cal-year">${years.map(y => `<option ${y === st.startYear ? 'selected' : ''}>${y}</option>`).join('')}</select></div>
        <div><label>&nbsp;</label><button class="primary" id="cal-go">⏪ Перенестись в ${st.startYear}</button></div>
      </div></div>
      <h3>События с ${st.startYear} года</h3>
      <div class="hint" style="margin-bottom:8px">Отметьте ✕ события, которых в мире-сравнении «не было».</div>
      ${evs.map(ev => `<div class="cal-ev ${st.removed.has(ev.id) ? 'off' : ''}">
          <input type="checkbox" data-id="${ev.id}" ${st.removed.has(ev.id) ? 'checked' : ''} title="Убрать в мире-сравнении">
          <div><div class="cd">${fmtDate(ev.date)}</div><div class="ct">${ev.icon} ${esc(ev.title)}</div>
            <div class="cx">${esc(ev.desc)}</div>${ev.fact ? `<div class="cf">📌 ${esc(ev.fact)}</div>` : ''}
            <div class="row"><button class="small" data-only="${ev.id}">только без этого</button></div></div></div>`).join('')}
      <div class="r2" style="display:grid;grid-template-columns:1fr 1fr;gap:6px;margin:6px 0 10px">
        <button class="small" id="cal-all">убрать все</button><button class="small" id="cal-none">вернуть все</button></div>
      <h3>Результат</h3><div id="cal-res"><div class="hint">Нажмите «Перенестись», затем ▶ или «Прогнать до 2031».</div></div>`;
    $('#cal-year').onchange = e => { st.startYear = +e.target.value; render(); };
    root.querySelectorAll('[data-id]').forEach(cb => cb.onchange = () => { cb.checked ? st.removed.add(cb.dataset.id) : st.removed.delete(cb.dataset.id); render(); });
    root.querySelectorAll('[data-only]').forEach(b => b.onclick = () => { st.removed = new Set([b.dataset.only]); render(); });
    $('#cal-all').onclick = () => { st.removed = new Set(evs.map(e => e.id)); render(); };
    $('#cal-none').onclick = () => { st.removed = new Set(); render(); };
    $('#cal-go').onclick = go;
    if (app.cal) app.refreshCalendar(true);
  };

  const go = () => {
    if (!st.removed.size) app.toast('Ни одно событие не убрано — оба мира будут одинаковыми');
    app.setStartYear(st.startYear, { startYear: st.startYear, removed: new Set(st.removed) });
    app.toast(`Мир на январь ${st.startYear}: ${CALENDAR.filter(e => eventYear(e) >= st.startYear).length} событий впереди`);
    showResults();
  };

  // fast-forward to the end of 2031 in chunks so the page stays responsive
  const fastForward = () => {
    const end = (2032 - app.cal.startYear) * 12;
    app.setRunning(false);
    const tick = () => {
      for (let k = 0; k < 6 && app.sim.t < end; k++) { app.sim.step(); app.base.step(); }
      app.refreshAll(true);
      if (app.sim.t < end) setTimeout(tick, 0); else app.toast('Готово: 2031 год');
    };
    tick();
  };

  const showResults = () => {
    $('#cal-res').innerHTML = `<div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;margin-bottom:8px">
        <button class="primary small" id="cal-ens">📊 Оценить на 20 вариантах</button><button class="small" id="cal-ff">⏩ Прогнать до 2031</button></div>
      <div id="cal-ens-out"></div>
      <h3>Текущий вариант на глобусе</h3>
      <div class="hint" style="margin-bottom:6px">Один вариант будущего: в нём свои случайные потрясения, поэтому отдельные годы шумят. Надёжнее — оценка на 20 вариантах выше.</div>
      <div style="margin-bottom:6px"><button class="small" id="cal-swap">⇄ Показать на глобусе другой мир</button></div>
      <div id="cal-sum"></div><table class="tbl" id="cal-tbl"></table>
      <h3>Кого события задели сильнее всего</h3><div id="cal-top"></div>
      <div style="margin-top:10px"><button class="small" id="cal-exit">Вернуться в сегодняшний мир</button></div>`;
    $('#cal-ff').onclick = fastForward;
    $('#cal-ens').onclick = evaluate;
    $('#cal-swap').onclick = app.swapWorlds;
    $('#cal-exit').onclick = () => { app.setStartYear(2026, null); render(); app.toast('Вернулись в сегодняшний мир'); };
    app.refreshCalendar(true);
  };

  // ensemble over 20 futures: "as it was" = all events, comparison = all but the removed ones
  let worker = null;
  const evaluate = () => {
    const Y = app.cal.startYear, months = (2032 - Y) * 12, out = $('#cal-ens-out');
    const sc = CALENDAR.filter(ev => monthOf(ev, Y) >= 0).map(ev => ({ def: { title: ev.title, duration: ev.duration, effects: ev.effects }, delay: monthOf(ev, Y), id: ev.id }));
    out.innerHTML = '<div class="bar"><i style="width:0%"></i></div><div class="hint" style="margin:6px 0">Считаю 20 вариантов истории и прогноза…</div>';
    worker?.terminate();
    worker = new Worker(new URL('../sim/ensemble.worker.js', import.meta.url), { type: 'module' });
    worker.onmessage = ({ data }) => {
      if (data.progress != null) { const b = out.querySelector('.bar i'); if (b) b.style.width = (data.progress * 100).toFixed(0) + '%'; }
      if (data.error) out.innerHTML = `<pre class="hint">${esc(data.error)}</pre>`;
      if (data.result) { renderEnsemble(data.result, Y); worker.terminate(); worker = null; }
    };
    worker.postMessage({ raw: app.raw, trade: app.trade, markets: app.markets, history: app.history, startYear: Y, months, seeds: 20, params: true, magnitude: true,
      scenarios: sc.map(({ def, delay }) => ({ def, delay })), baseScenarios: sc.filter(s => !app.cal.removed.has(s.id)).map(({ def, delay }) => ({ def, delay })) });
  };
  const renderEnsemble = (r, Y) => {
    const wld = app.history?._WLD?.growth || {}, imf = app.world.worldForecast || {}, A = r.annual;
    const rows = A.sim.p50.map((_, k) => {
      const y = Y + k, fact = wld[y], fc = y >= 2026 ? imf[y] : null, base = fact ?? fc, e = A.effect;
      return `<tr class="${y >= 2026 ? 'fc' : ''}"><td>${y}${y >= 2026 ? ' п' : ''}</td><td class="n f">${base != null ? base.toFixed(1) : '—'}</td><td class="n">${A.sim.p50[k].toFixed(1)}</td><td class="n">${A.base.p50[k].toFixed(1)}</td>`
        + `<td class="n ${e.p50[k] < 0 ? 'neg' : 'pos'}">${sg(e.p50[k])}<div class="hint" style="font-size:10px">${sg(e.p10[k])}…${sg(e.p90[k])}</div></td><td class="n"><b>${base != null ? (base - e.p50[k]).toFixed(1) : '—'}</b></td></tr>`;
    }).join('');
    const lvl = r.end.gdp;
    $('#cal-ens-out').innerHTML = `<div class="card"><div class="row"><span>ВВП мира к ${Y + A.sim.p50.length - 1} г.: «как было» к «без событий»</span><b class="${lvl.p50 < 0 ? 'neg' : 'pos'}">${sg(lvl.p50)}%</b></div>
        <div class="hint">10…90% вариантов: ${sg(lvl.p10)}…${sg(lvl.p90)}%. Медианы по 20 вариантам с разными случайными событиями, параметрами модели и силой событий.</div></div>
      <table class="tbl"><tr><th>Год</th><th class="n">Факт</th><th class="n">Было</th><th class="n">Без</th><th class="n">Эффект</th><th class="n">Без событий</th></tr>${rows}</table>
      <div class="hint" style="margin-top:4px">Рост мирового ВВП, %. «Факт» — World Bank, с 2026 г. — прогноз IMF («п»). «Без событий» = факт − эффект модели (под эффектом — коридор 10…90%).</div>`;
  };

  app.refreshCalendar = force => {
    if (!app.cal || !$('#cal-tbl')) return;
    if (!force && !$('#tab-cal').classList.contains('on')) return;
    const asWas = app.swapped ? app.base : app.sim, without = app.swapped ? app.sim : app.base, Y = app.cal.startYear;
    const wld = app.history?._WLD?.growth || {}, imf = app.world.worldForecast || {};
    const annual = (w, k) => w.wh.gdp.length > 12 * (k + 1) ? (w.wh.gdp[12 * (k + 1)] / w.wh.gdp[12 * k] - 1) * 100 : null;
    const rows = [];
    for (let k = 0; ; k++) {
      const a = annual(asWas, k), b = annual(without, k);
      if (a == null) break;
      const y = Y + k, eff = a - b, fact = wld[y], fc = y >= 2026 ? imf[y] : null;
      const est = fact != null ? fact - eff : fc != null ? fc - eff : null;
      rows.push(`<tr class="${y >= 2026 ? 'fc' : ''}"><td>${y}${y >= 2026 ? ' п' : ''}</td><td class="n f">${fact != null ? fact.toFixed(1) : fc != null ? fc.toFixed(1) : '—'}</td><td class="n">${a.toFixed(1)}</td><td class="n">${b.toFixed(1)}</td>`
        + `<td class="n ${eff < 0 ? 'neg' : 'pos'}">${sg(eff)}</td><td class="n"><b>${est != null ? est.toFixed(1) : '—'}</b></td></tr>`);
    }
    $('#cal-tbl').innerHTML = `<tr><th>Год</th><th class="n">Факт</th><th class="n">Модель: было</th><th class="n">Модель: без</th><th class="n">Эффект</th><th class="n">Без событий</th></tr>${rows.join('')}`;
    const lvl = (asWas.agg.gdp / without.agg.gdp - 1) * 100;
    $('#cal-sum').innerHTML = rows.length ? `<div class="hint" style="margin-bottom:6px">Рост мирового ВВП, %. «Факт» — World Bank (с 2026 г. — прогноз IMF, «п»), «Без событий» — факт минус эффект, посчитанный моделью. Сейчас мир «как было» ${lvl < 0 ? 'беднее' : 'богаче'} мира без событий на <b>${Math.abs(lvl).toFixed(1)}%</b> ВВП.</div>` : '';
    const W = app.world;
    const arr = asWas.S.filter(s => s.gdp > 1e10).map(s => ({ i: s.i, d: (s.gdp / without.S[s.i].gdp - 1) * 100 })).sort((x, y) => x.d - y.d);
    const row = ({ i, d }) => `<div class="rel" data-i="${i}"><span>${flag(W.countries[i].iso2)} ${esc(W.countries[i].nameRu)}</span><span class="rv ${d >= 0 ? 'pos' : 'neg'}">${sg(d)}% ВВП</span></div>`;
    $('#cal-top').innerHTML = arr.length ? arr.slice(0, 6).map(row).join('') + '<div class="hint" style="margin:6px 0 2px">Выиграли</div>' + arr.slice(-3).reverse().map(row).join('') : '';
    root.querySelectorAll('#cal-top [data-i]').forEach(el => el.onclick = () => app.select(+el.dataset.i));
  };

  render();
}

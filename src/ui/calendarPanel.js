// "Calendar" tab: global events 2000–2025. Three steps: pick a year, click the events to remove, press one button.
// The button travels back, runs 20 futures in a worker, plays the globe up to 2031 and opens a results window.
import { CALENDAR, eventYear, monthOf } from '../sim/calendar.js';
import { lineChart } from './charts.js';
import { esc } from './targets.js';

const $ = (s, r = document) => r.querySelector(s);
const flag = iso2 => iso2 ? String.fromCodePoint(...[...iso2.toUpperCase()].map(c => 0x1f1a5 + c.charCodeAt(0))) : '';
const MONTHS = ['янв', 'фев', 'мар', 'апр', 'май', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'];
const fmtDate = d => { const [y, m] = d.split('-').map(Number); return `${MONTHS[m - 1]} ${y}`; };
const sg = (v, d = 1) => (v > 0 ? '+' : '') + v.toFixed(d);
const QUICK_YEARS = [[2000, 'доткомы'], [2008, 'финкризис'], [2014, 'Крым, нефть'], [2019, 'пандемия'], [2022, 'война в Украине']];
const plural = (n, one, few, many) => n % 10 === 1 && n % 100 !== 11 ? one : n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 10 || n % 100 >= 20) ? few : many;

export function initCalendar(app) {
  const root = $('#tab-cal');
  const st = { startYear: 2019, removed: new Set(['covid']), result: null };

  // ---------- the panel: 3 steps + a sticky button ----------
  const render = () => {
    const evs = CALENDAR.filter(ev => eventYear(ev) >= st.startYear);
    for (const id of [...st.removed]) if (!evs.some(e => e.id === id)) st.removed.delete(id);
    const removed = evs.filter(e => st.removed.has(e.id));
    root.innerHTML = `
      <div class="hint" style="margin-bottom:12px">Вернитесь в прошлое и посмотрите, каким был бы мир без отдельных событий — до сегодняшнего дня и в прогнозе до 2031 г.</div>
      <div class="step"><span class="n">1</span>С какого года начать</div>
      <div class="yr-chips">${QUICK_YEARS.map(([y, n]) => `<button data-y="${y}" class="${y === st.startYear ? 'on' : ''}"><b>${y}</b><span>${n}</span></button>`).join('')}</div>
      <div class="yr-other"><label>или любой год</label><select id="cal-year">${Array.from({ length: 26 }, (_, k) => 2000 + k).map(y => `<option ${y === st.startYear ? 'selected' : ''}>${y}</option>`).join('')}</select></div>
      <div class="step"><span class="n">2</span>Нажмите на события, которых «не было»</div>
      <div class="cal-quick"><button class="small" id="cal-all">убрать все</button><button class="small" id="cal-none">вернуть все</button></div>
      ${evs.map(ev => `<div class="cal-ev ${st.removed.has(ev.id) ? 'off' : ''}" data-id="${ev.id}" role="button" tabindex="0">
          <div class="ci">${ev.icon}</div>
          <div><div class="cd">${fmtDate(ev.date)} <span class="badge">${st.removed.has(ev.id) ? 'убрано' : 'было'}</span></div><div class="ct">${esc(ev.title)}</div>
            <div class="cx">${esc(ev.desc)}</div>${ev.fact ? `<div class="cf">📌 ${esc(ev.fact)}</div>` : ''}</div></div>`).join('')}
      <div class="cal-cta">
        <div class="hint">${removed.length ? `Убрано: <b>${removed.map(e => esc(e.title)).join(', ')}</b>` : 'Пока ничего не убрано — выберите хотя бы одно событие.'}</div>
        <button class="primary big" id="cal-run" ${removed.length ? '' : 'disabled'}>▶ Показать мир без ${removed.length === 1 ? 'этого события' : removed.length ? removed.length + ' ' + plural(removed.length, 'события', 'событий', 'событий') : 'событий'}</button>
        ${st.result ? '<button class="small" id="cal-open">Открыть последний результат</button>' : ''}
      </div>`;
    root.querySelectorAll('.yr-chips [data-y]').forEach(b => b.onclick = () => { st.startYear = +b.dataset.y; render(); });
    $('#cal-year').onchange = e => { st.startYear = +e.target.value; render(); };
    const toggle = el => { const id = el.dataset.id; st.removed.has(id) ? st.removed.delete(id) : st.removed.add(id); render(); };
    root.querySelectorAll('.cal-ev').forEach(el => { el.onclick = () => toggle(el); el.onkeydown = e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggle(el); } }; });
    $('#cal-all').onclick = () => { st.removed = new Set(evs.map(e => e.id)); render(); };
    $('#cal-none').onclick = () => { st.removed = new Set(); render(); };
    $('#cal-run').onclick = run;
    if ($('#cal-open')) $('#cal-open').onclick = () => modal.classList.add('on');
  };

  // ---------- results window ----------
  const modal = document.createElement('div');
  modal.id = 'calres';
  modal.innerHTML = `<div class="ens-card panel"><div class="row"><b id="cr-title"></b><button class="icon" id="cr-x" title="Закрыть">✕</button></div><div id="cr-body"></div>
    <div class="cr-actions"><button class="primary" id="cr-globe">🌍 Показать на глобусе мир без событий</button><button id="cr-edit">✏️ Изменить выбор</button><button id="cr-today">↩ Вернуться в сегодня</button></div></div>`;
  document.body.appendChild(modal);
  const closeModal = () => modal.classList.remove('on');
  $('#cr-x').onclick = closeModal;
  modal.onclick = e => { if (e.target === modal) closeModal(); };
  $('#cr-edit').onclick = () => { closeModal(); app.openTab('cal'); };
  $('#cr-today').onclick = () => { closeModal(); st.result = null; app.setStartYear(2026, null); render(); app.toast('Вернулись в сегодняшний мир'); };
  $('#cr-globe').onclick = () => { if (!app.swapped) app.swapWorlds(); closeModal(); app.toast('На глобусе — мир без выбранных событий'); };

  // ---------- one button does everything ----------
  let worker = null;
  const run = () => {
    const Y = st.startYear, removedIds = new Set(st.removed);
    const names = CALENDAR.filter(e => removedIds.has(e.id)).map(e => e.title);
    app.setStartYear(Y, { startYear: Y, removed: removedIds });
    st.result = null;
    $('#cr-title').textContent = `Мир без: ${names.join(', ')} · с ${Y} г.`;
    $('#cr-body').innerHTML = `<div class="hint" style="margin:6px 0 10px">Считаю 20 вариантов истории и прогноза до 2031 г. Пока идёт расчёт, глобус проигрывает мир «как было».</div><div class="bar"><i style="width:0%"></i></div>`;
    modal.classList.add('on');
    playGlobe(Y);
    const sc = CALENDAR.filter(ev => monthOf(ev, Y) >= 0).map(ev => ({ def: { title: ev.title, duration: ev.duration, effects: ev.effects }, delay: monthOf(ev, Y), id: ev.id }));
    worker?.terminate();
    worker = new Worker(new URL('../sim/ensemble.worker.js', import.meta.url), { type: 'module' });
    worker.onmessage = ({ data }) => {
      if (data.progress != null) { const b = $('#cr-body .bar i'); if (b) b.style.width = (data.progress * 100).toFixed(0) + '%'; }
      if (data.error) $('#cr-body').innerHTML = `<pre class="hint">${esc(data.error)}</pre>`;
      if (data.result) { st.result = { r: data.result, Y, names }; renderResult(); worker.terminate(); worker = null; render(); }
    };
    worker.postMessage({ raw: app.raw, trade: app.trade, markets: app.markets, history: app.history, startYear: Y, months: (2032 - Y) * 12, seeds: 20, params: true, magnitude: true,
      scenarios: sc.map(({ def, delay }) => ({ def, delay })), baseScenarios: sc.filter(s => !removedIds.has(s.id)).map(({ def, delay }) => ({ def, delay })) });
  };

  // play both globe worlds up to the end of 2031 in chunks, so the page stays responsive
  const playGlobe = Y => {
    const end = (2032 - Y) * 12;
    app.setRunning(false);
    const tick = () => {
      if (!app.cal || app.cal.startYear !== Y) return;
      for (let k = 0; k < 4 && app.sim.t < end; k++) { app.sim.step(); app.base.step(); }
      app.refreshAll(true);
      if (app.sim.t < end) setTimeout(tick, 0);
    };
    tick();
  };

  const renderResult = () => {
    const { r, Y, names } = st.result, A = r.annual;
    const wld = app.history?._WLD?.growth || {}, imf = app.world.worldForecast || {};
    const years = A.sim.p50.map((_, k) => Y + k);
    const fact = years.map(y => wld[y] ?? (y >= 2026 ? imf[y] : null) ?? NaN);
    const without = fact.map((f, k) => f - A.effect.p50[k]);
    const lo = fact.map((f, k) => f - A.effect.p90[k]), hi = fact.map((f, k) => f - A.effect.p10[k]);
    const gap = -r.end.gdp.p50;                       // world GDP without the events vs as it was, % (approximately)
    let kMax = 0; A.effect.p50.forEach((v, k) => { if (Math.abs(v) > Math.abs(A.effect.p50[kMax])) kMax = k; });
    const yMax = years[kMax];
    const W = app.world, cs = r.countries.filter(c => W.countries[c.i].gdp > 1e10).sort((a, b) => a.p50 - b.p50);
    const row = c => `<div class="rel" data-i="${c.i}"><span>${flag(W.countries[c.i].iso2)} ${esc(W.countries[c.i].nameRu)}</span><span class="rv ${-c.p50 >= 0 ? 'pos' : 'neg'}">${sg(-c.p50)}%</span></div>`;
    $('#cr-body').innerHTML = `
      <div class="stats" style="margin:10px 0">
        <div class="stat hero"><div class="k">Мировой ВВП в 2031 г. без этих событий</div><div class="v">${gap >= 0 ? 'на ' + gap.toFixed(1) + '% больше' : 'на ' + (-gap).toFixed(1) + '% меньше'}</div>
          <div class="hint">в 80% вариантов: от ${sg(-r.end.gdp.p90)}% до ${sg(-r.end.gdp.p10)}%</div></div>
        <div class="stat"><div class="k">Рост мира в ${yMax} г.</div><div class="v">${Number.isFinite(fact[kMax]) ? fact[kMax].toFixed(1) + '%' : '—'}</div><div class="hint">${yMax >= 2026 ? 'прогноз IMF' : 'факт'}</div></div>
        <div class="stat"><div class="k">А без событий</div><div class="v">${Number.isFinite(without[kMax]) ? without[kMax].toFixed(1) + '%' : '—'}</div><div class="hint">оценка модели</div></div>
      </div>
      <h3>Рост мирового ВВП по годам, %</h3><canvas id="cr-chart"></canvas>
      <div class="hint">Белый пунктир — как было (данные World Bank, с 2026 г. — прогноз IMF). Зелёный — без событий, с коридором 80% вариантов.</div>
      <h3>Кому эти события стоили больше всего</h3>
      <div class="hint" style="margin-bottom:4px">На сколько ВВП страны в 2031 г. был бы больше (или меньше) без событий.</div>
      ${cs.slice(0, 6).map(row).join('')}
      <details style="margin-top:10px"><summary class="hint" style="cursor:pointer">Подробно по годам</summary>
        <table class="tbl" style="margin-top:6px"><tr><th>Год</th><th class="n">Как было</th><th class="n">Эффект</th><th class="n">Без событий</th></tr>
        ${years.map((y, k) => `<tr class="${y >= 2026 ? 'fc' : ''}"><td>${y}${y >= 2026 ? ' (прогноз)' : ''}</td><td class="n">${Number.isFinite(fact[k]) ? fact[k].toFixed(1) : '—'}</td><td class="n ${A.effect.p50[k] < 0 ? 'neg' : 'pos'}">${sg(A.effect.p50[k])}</td><td class="n"><b>${Number.isFinite(without[k]) ? without[k].toFixed(1) : '—'}</b></td></tr>`).join('')}</table>
        <div class="hint" style="margin-top:4px">«Эффект» — разница двух миров модели (медиана 20 вариантов); «без событий» = как было − эффект. Сила событий — допущения модели.</div></details>`;
    lineChart($('#cr-chart'), [
      { data: fact, color: '#ffffff', label: 'как было', dash: [3, 3], width: 2 },
      { data: without, lo, hi, color: '#2fd3a7', label: 'без событий', width: 2 },
    ], { height: 140, zeroLine: true, fmt: v => v.toFixed(1) + '%' });
    $('#cr-body').querySelectorAll('[data-i]').forEach(el => el.onclick = () => { closeModal(); app.select(+el.dataset.i); });
    $('#cr-title').textContent = `Мир без: ${names.join(', ')} · с ${Y} г.`;
  };

  app.openCalendarResult = () => { if (st.result) { renderResult(); modal.classList.add('on'); } };
  app.refreshCalendar = () => {};
  // used by the timeline: travel to a year, keeping the removed events
  app.calendarTravel = y => {
    st.startYear = y; app.openTab('cal'); render();
    if (st.removed.size) run(); else { app.setStartYear(y, { startYear: y, removed: new Set() }); app.toast(`Мир на январь ${y}. Выберите события, которых «не было», и нажмите кнопку внизу панели`); }
  };

  render();
}

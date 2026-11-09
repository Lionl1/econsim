// Левая панель: готовые сценарии, конструктор, источники данных.
import { PRESETS, SHOCK_VARS } from '../sim/scenarios.js';
import { targetSelectHtml, describeEffect, esc } from './targets.js';
import { parseEvent } from '../sim/nlp.js';

const $ = (s, r = document) => r.querySelector(s);

export function initLeft(app) {
  const T = app.T;
  document.querySelectorAll('#tabs button').forEach(b => b.onclick = () => {
    document.querySelectorAll('#tabs button').forEach(x => x.classList.toggle('on', x === b));
    document.querySelectorAll('#left .tab').forEach(x => x.classList.toggle('on', x.id === 'tab-' + b.dataset.tab));
  });
  initScenarios(app); initBuilder(app); initPrompt(app); initSources(app);
}

// ---------- вкладка «Сценарии» ----------
function initScenarios(app) {
  const root = $('#tab-scen'), T = app.T;
  root.innerHTML = `
    <h3>Активные сценарии</h3><div id="sc-active"></div>
    <h3>Запуск</h3>
    <div class="form"><div><label>Старт через (мес.)</label><input id="sc-delay" type="number" min="0" max="120" value="0"></div></div>
    <div style="height:8px"></div>
    <div id="sc-presets"></div>`;
  $('#sc-presets').innerHTML = PRESETS.map(p => `
    <div class="card"><div class="t">${p.icon} ${p.title}</div><div class="d">${p.desc}</div>
      <div class="row"><span class="hint">${p.duration ? p.duration + ' мес.' : 'до развязки'}</span><button class="primary small" data-run="${p.id}">▶ Запустить</button></div></div>`).join('');
  root.querySelectorAll('[data-run]').forEach(b => b.onclick = () => {
    const p = PRESETS.find(x => x.id === b.dataset.run);
    app.launch({ ...p }, +$('#sc-delay').value || 0);
  });
  app.refreshActive = () => {
    const box = $('#sc-active'), sim = app.sim;
    if (!sim.scenarios.length) { box.innerHTML = '<div class="hint">Пока ничего не запущено. Выберите сценарий ниже или соберите свой в «Конструкторе», либо вмешайтесь через карточку страны. Результаты сравниваются с базовым миром без вмешательств (метрики «Δ к базе»).</div>'; return; }
    box.innerHTML = sim.scenarios.map(sc => {
      const el = sim.t - sc.start, pr = sc.duration ? Math.min(100, Math.max(0, el / sc.duration * 100)) : (sc.started ? 100 : 0);
      const st = !sc.started ? `старт через ${sc.start - sim.t} мес.` : sc.ended ? 'завершён' : sc.duration ? `идёт, ${Math.max(0, sc.duration - el)} мес. осталось` : 'бессрочно';
      return `<div class="card"><div class="row"><div class="t">${esc(sc.title)}</div><button class="small danger" data-rm="${sc.id}" title="Отменить и откатить">✕</button></div>
        <div class="d">${st}</div>${sc.effects.slice(0, 4).map(e => `<div class="hint">• ${describeEffect(T, e)}</div>`).join('')}
        <div class="bar"><i style="width:${pr}%"></i></div></div>`;
    }).join('');
    box.querySelectorAll('[data-rm]').forEach(b => b.onclick = () => { sim.removeScenario(+b.dataset.rm); app.refreshActive(); app.toast('Сценарий отменён'); });
  };
}

// ---------- вкладка «Конструктор» ----------
function initBuilder(app) {
  const T = app.T, root = $('#tab-build');
  const draft = { title: 'Мой сценарий', duration: 12, start: 0, effects: [] };
  root.innerHTML = `
    <h3>Параметры</h3>
    <div class="form">
      <div><label>Название</label><input id="b-title" value="${draft.title}"></div>
      <div class="r2"><div><label>Длительность (мес., 0 = бессрочно)</label><input id="b-dur" type="number" min="0" max="240" value="12"></div>
      <div><label>Старт через (мес.)</label><input id="b-start" type="number" min="0" max="120" value="0"></div></div>
    </div>
    <h3>Добавить эффект</h3>
    <div class="form">
      <div><label>Тип эффекта</label><select id="b-kind">
        <option value="shock">Шок (рост, инфляция, безработица…)</option><option value="oil">Цена нефти</option>
        <option value="tariff">Пошлины</option><option value="sanction">Санкции</option>
        <option value="war">Война</option><option value="relation">Отношения стран</option></select></div>
      <div id="b-fields" class="form"></div>
      <button id="b-add">＋ Добавить в сценарий</button>
    </div>
    <h3>Эффекты сценария</h3><div id="b-list"></div>
    <div class="form" style="margin-top:10px"><button class="primary" id="b-run">▶ Запустить сценарий</button>
      <div class="r2"><button id="b-copy">Копировать JSON</button><button id="b-load">Загрузить JSON</button></div>
      <textarea id="b-json" rows="4" placeholder="JSON сценария (для импорта вставьте и нажмите «Загрузить JSON»)" style="display:none"></textarea></div>`;

  const sel = (id, o) => targetSelectHtml(T, id, o);
  const FIELDS = {
    shock: () => `<div><label>Кого затрагивает</label>${sel('f-targets')}</div>
      <div><label>Показатель</label><select id="f-var">${Object.entries(SHOCK_VARS).map(([k, v]) => `<option value="${k}">${v}</option>`).join('')}</select></div>
      <div class="r2"><div><label>Величина (±)</label><input id="f-value" type="number" step="0.1" value="-3"></div>
      <div><label>Усиление по признаку</label><select id="f-scale"><option value="none">равномерно</option><option value="urban">урбанизация</option><option value="openness">открытость торговли</option><option value="internet">цифровизация</option></select></div></div>`,
    oil: () => `<div><label>Изменение цены нефти (1 = +100%, −0.4 = −40%)</label><input id="f-value" type="number" step="0.1" value="1"></div>`,
    tariff: () => `<div><label>Кто вводит</label>${sel('f-from', { selected: 'iso:USA' })}</div><div><label>Против кого</label>${sel('f-to', { selected: 'iso:CHN' })}</div><div><label>Пошлина, %</label><input id="f-value" type="number" value="40"></div>`,
    sanction: () => `<div><label>Кто вводит</label>${sel('f-from', { selected: 'bloc:NATO' })}</div><div><label>Против кого</label>${sel('f-to', { selected: 'iso:RUS' })}</div>`,
    war: () => `<div><label>Сторона A (агрессор)</label>${sel('f-a', { selected: 'iso:RUS' })}</div><div><label>Сторона B</label>${sel('f-b', { selected: 'iso:UKR' })}</div>`,
    relation: () => `<div><label>Страны/группа A</label>${sel('f-a', { selected: 'bloc:NATO' })}</div><div><label>Страны/группа B</label>${sel('f-b', { selected: 'bloc:BRICS' })}</div><div><label>Изменение отношений (−1…+1)</label><input id="f-value" type="number" step="0.1" value="-0.3"></div>`,
  };
  const renderFields = () => { $('#b-fields').innerHTML = FIELDS[$('#b-kind').value](); };
  $('#b-kind').onchange = renderFields; renderFields();

  const v = id => $('#' + id)?.value;
  const renderList = () => {
    $('#b-list').innerHTML = draft.effects.length ? draft.effects.map((e, i) => `<div class="eff"><span>${describeEffect(T, e)}</span><button class="small danger" data-del="${i}">✕</button></div>`).join('') : '<div class="hint">Пока пусто. Добавьте хотя бы один эффект.</div>';
    root.querySelectorAll('[data-del]').forEach(b => b.onclick = () => { draft.effects.splice(+b.dataset.del, 1); renderList(); });
  };
  renderList();
  app.loadDraft = d => {
    draft.effects = d.effects.map(e => ({ ...e })); $('#b-title').value = d.title; $('#b-dur').value = d.duration; $('#b-start').value = d.delay || 0; renderList();
    document.querySelector('#tabs [data-tab=build]').click();
  };

  $('#b-add').onclick = () => {
    const k = v('b-kind'), n = x => parseFloat(v(x));
    const e = { kind: k };
    if (k === 'shock') Object.assign(e, { targets: [v('f-targets')], var: v('f-var'), value: n('f-value'), scale: v('f-scale') });
    if (k === 'oil') e.value = n('f-value');
    if (k === 'tariff') Object.assign(e, { from: [v('f-from')], to: [v('f-to')], value: n('f-value') });
    if (k === 'sanction') Object.assign(e, { from: [v('f-from')], to: [v('f-to')] });
    if (k === 'war') Object.assign(e, { a: [v('f-a')], b: [v('f-b')] });
    if (k === 'relation') Object.assign(e, { a: [v('f-a')], b: [v('f-b')], value: n('f-value') });
    if (e.value !== undefined && Number.isNaN(e.value)) return app.toast('Введите число');
    draft.effects.push(e); renderList();
  };
  $('#b-run').onclick = () => {
    if (!draft.effects.length) return app.toast('Добавьте эффекты');
    app.launch({ title: v('b-title') || 'Мой сценарий', duration: Math.max(0, +v('b-dur') || 0), effects: draft.effects.map(e => ({ ...e })) }, +v('b-start') || 0);
  };
  $('#b-copy').onclick = () => {
    const json = JSON.stringify({ title: v('b-title'), duration: +v('b-dur'), effects: draft.effects }, null, 1);
    $('#b-json').style.display = 'block'; $('#b-json').value = json;
    navigator.clipboard?.writeText(json).then(() => app.toast('JSON скопирован')).catch(() => {});
  };
  $('#b-load').onclick = () => {
    const ta = $('#b-json');
    if (ta.style.display === 'none') { ta.style.display = 'block'; return app.toast('Вставьте JSON и нажмите ещё раз'); }
    try {
      const d = JSON.parse(ta.value);
      if (!Array.isArray(d.effects)) throw new Error('нет effects');
      draft.effects = d.effects; $('#b-title').value = d.title || 'Мой сценарий'; $('#b-dur').value = d.duration ?? 12; renderList(); app.toast('Загружено');
    } catch (err) { app.toast('Ошибка JSON: ' + err.message); }
  };
}

// ---------- вкладка «Промт»: событие свободным текстом ----------
const EXAMPLES = [
  'Россия нападает на Украину',
  'США вводят пошлины 50% против Китая',
  'Мощное землетрясение в Японии',
  'Нефть падает на 40% на год',
  'Китай вторгается на Тайвань через 6 месяцев',
  'Банковский кризис в Германии',
  'Переворот в Саудовской Аравии',
  'Технологический бум в Индии на 3 года',
  'Санкции против Ирана',
  'Эмбарго ЕС на Турцию и рост военных расходов Польши',
];
function initPrompt(app) {
  const root = $('#tab-prompt'), T = app.T;
  let parsed = null;
  root.innerHTML = `
    <h3>Опишите событие</h3>
    <div class="form"><textarea id="p-text" rows="3" placeholder="Например: Китай вводит блокаду Тайваня, нефть +30% на год"></textarea>
      <div class="r2"><button id="p-parse">Разобрать</button><button class="primary" id="p-run">▶ Разобрать и запустить</button></div></div>
    <div id="p-res"></div>
    <h3>Примеры</h3><div id="p-ex"></div>
    <h3>Влияние на мир</h3><div id="p-impact"></div>
    <h3>История запросов</h3><div id="p-hist" class="hint">Пока пусто.</div>`;
  $('#p-ex').innerHTML = EXAMPLES.map(x => `<button class="small chip" style="margin:0 4px 4px 0">${x}</button>`).join('');
  root.querySelectorAll('#p-ex .chip').forEach(b => b.onclick = () => { $('#p-text').value = b.textContent; doParse(); });
  const lab = sel => T.label(sel);
  const doParse = () => {
    const txt = $('#p-text').value.trim(); if (!txt) return null;
    parsed = parseEvent(txt, app.world, lab); parsed.text = txt;
    if (!parsed.ok) { $('#p-res').innerHTML = `<div class="card"><div class="d">${parsed.notes.map(esc).join('<br>')}</div></div>`; return null; }
    $('#p-res').innerHTML = parsed.parts.map((p, k) => `<div class="card"><div class="t">${esc(p.title)}</div>
      <div class="d">Распознано: ${p.recognized.join(', ')}${p.entities.length ? ' · цели: ' + p.entities.map(esc).join(', ') : ''}</div>
      ${p.effects.map(e => `<div class="hint">• ${describeEffect(T, e)}</div>`).join('')}
      ${p.notes.map(n => `<div class="hint" style="color:var(--warn,#f5a524)">⚠ ${esc(n)}</div>`).join('')}
      <div class="form" style="margin-top:8px"><div class="r2"><div><label>Длительность, мес. (0 = пока не закончится)</label><input data-dur="${k}" type="number" min="0" max="240" value="${p.duration}"></div>
        <div><label>Старт через, мес.</label><input data-delay="${k}" type="number" min="0" max="120" value="${p.delay}"></div></div>
        <button class="small" data-edit="${k}">Править в конструкторе</button></div></div>`).join('')
      + parsed.notes.map(n => `<div class="hint" style="color:var(--warn,#f5a524)">⚠ ${esc(n)}</div>`).join('')
      + `<button class="primary" id="p-go" style="width:100%;margin-bottom:8px">▶ Запустить${parsed.parts.length > 1 ? ` все (${parsed.parts.length})` : ''}</button>`;
    $('#p-go').onclick = go;
    root.querySelectorAll('[data-edit]').forEach(b => b.onclick = () => { const k = +b.dataset.edit; app.loadDraft({ ...partDef(k), delay: partDelay(k) }); });
    return parsed;
  };
  const partDur = k => Math.max(0, +root.querySelector(`[data-dur="${k}"]`).value || 0);
  const partDelay = k => Math.max(0, +root.querySelector(`[data-delay="${k}"]`).value || 0);
  const partDef = k => ({ title: parsed.parts[k].title, duration: partDur(k), effects: parsed.parts[k].effects.map(e => ({ ...e })) });
  const hist = [];
  const go = () => {
    if (!parsed?.ok) return;
    parsed.parts.forEach((_, k) => app.launch(partDef(k), partDelay(k)));
    hist.unshift(parsed.text);
    $('#p-hist').innerHTML = hist.slice(0, 8).map((h, k) => `<div class="hint" style="cursor:pointer" data-h="${k}">↻ ${esc(h)}</div>`).join('');
    root.querySelectorAll('[data-h]').forEach(el => el.onclick = () => { $('#p-text').value = hist[+el.dataset.h]; doParse(); });
    app.refreshImpact();
  };
  $('#p-parse').onclick = doParse;
  $('#p-run').onclick = () => { if (doParse()) go(); };
  $('#p-text').addEventListener('keydown', e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); if (doParse()) go(); } });

  app.refreshImpact = () => {
    const box = $('#p-impact'), { sim, base, world } = app;
    if (!sim.scenarios.length && sim.t === 0) { box.innerHTML = '<div class="hint">Запустите событие и нажмите «Пуск»: здесь появится разница с миром без вмешательств.</div>'; return; }
    const dG = (sim.agg.gdp / base.agg.gdp - 1) * 100, dI = sim.agg.infl - base.agg.infl, dU = sim.agg.unemp - base.agg.unemp, dS = (sim.agg.stab - base.agg.stab) * 100;
    const rows = world.countries.map(c => ({ c, d: (sim.S[c.i].gdp / base.S[c.i].gdp - 1) * 100, big: sim.S[c.i].gdp })).filter(r => Number.isFinite(r.d));
    const rel = rows.filter(r => r.big > 5e9).sort((a, b) => a.d - b.d);
    const cls = v => (v >= 0 ? 'pos' : 'neg'), f = (v, u = '') => (v > 0 ? '+' : '') + v.toFixed(2) + u;
    const li = a => a.map(r => `<div class="eff"><span>${r.c.nameRu}</span><span class="${cls(r.d)}">${f(r.d, '%')}</span></div>`).join('');
    box.innerHTML = `<div class="card"><div class="row"><span>ВВП мира</span><b class="${cls(dG)}">${f(dG, '%')}</b></div>
      <div class="row"><span>Инфляция мира</span><b class="${cls(-dI)}">${f(dI, ' п.п.')}</b></div>
      <div class="row"><span>Безработица</span><b class="${cls(-dU)}">${f(dU, ' п.п.')}</b></div>
      <div class="row"><span>Стабильность</span><b class="${cls(dS)}">${f(dS, ' п.п.')}</b></div>
      <div class="row"><span>Войн (база → сейчас)</span><b>${base.agg.wars} → ${sim.agg.wars}</b></div></div>
      <div class="hint">Больше всех теряют</div>${li(rel.slice(0, 5))}<div class="hint" style="margin-top:6px">Больше всех выигрывают</div>${li(rel.slice(-5).reverse())}`;
  };
  app.refreshImpact();
}

// ---------- вкладка «Данные» ----------
function initSources(app) {
  const root = $('#tab-src');
  const n = app.world.N, imp = app.world.countries.filter(c => c.imputed.length > 6).length;
  root.innerHTML = `
    <h3>Что внутри</h3>
    <p class="hint">${n} стран (194 независимых + Тайвань, Палестина и Косово). Зависимые территории (Гренландия, Пуэрто-Рико, Гонконг…) окрашены по своему государству; заштрихованы территории вне модели. Для каждой: ВВП, население, рост, инфляция, безработица, госдолг, торговля, военные расходы, неравенство, индикаторы управления (World Bank). Пропуски заполнены региональной медианой${imp ? ` (у ${imp} микрогосударств заполнено много полей)` : ''}. Обновить данные: <code>npm run data</code>.</p>
    <h3>Как устроена модель</h3>
    <p class="hint"><b>Страна</b> — монетарная и фискальная политика (правило Тейлора, стимулы, долг), торговля по гравитационной модели, тарифы, санкции, войны и союзы, цена нефти.<br>
    <b>Агенты-правительства</b> (характер: ястребиность, кооперативность, протекционизм) отвечают на пошлины, вводят санкции, наращивают армию, помогают союзникам и объявляют войны.<br>
    <b>Агенты-граждане</b> (десятки на страну) теряют работу, реагируют на инфляцию и войну, выходят на протесты, эмигрируют; настроение определяет смену власти на выборах и риск переворота.<br>
    Базовый мир идёт параллельно с теми же случайными числами — разница показывает чистый эффект вашего сценария.</p>
    <p class="hint">⚠ Это учебная модель, а не прогноз. Волатильность роста и инфляции, их инерция и корреляция с мировым циклом откалиброваны по рядам World Bank 2000–2024 (<code>npm run calibrate</code>); пандемия и финкризис сверены с реальными просадками (<code>npm run backtest</code>). Конкретные страны и структурные связи (торговля, войны) не калибровались.</p>
    <h3>Источники данных</h3><div id="src-list"></div>`;
  fetch('/data/sources.json').then(r => r.json()).then(list => {
    $('#src-list').innerHTML = list.map(s => `<div class="card"><div class="t">${s.used ? '✅' : '⬜'} <a href="${s.url}" target="_blank" rel="noopener">${s.name}</a></div><div class="d">${s.what}</div></div>`).join('');
  });
}

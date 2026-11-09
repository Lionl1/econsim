// Правый инспектор: мир или выбранная страна, по вкладкам.
import { lineChart } from './charts.js';
import { fmtMoney, fmtNum } from './colors.js';
import { targetSelectHtml, esc } from './targets.js';
import { BLOC_NAMES } from '../sim/blocs.js';
import { SECTORS } from '../sim/equity.js';

const $ = (s, r = document) => r.querySelector(s);
const flag = iso2 => iso2 ? String.fromCodePoint(...[...iso2.toUpperCase()].map(c => 0x1f1a5 + c.charCodeAt(0))) : '';
const dcls = (v, goodHigh = true) => Math.abs(v) < 0.005 ? '' : (v > 0) === goodHigh ? 'pos' : 'neg';
const delta = (v, d = 1, goodHigh = true, unit = '') => Math.abs(v) < 0.5 * Math.pow(10, -d) ? '' : `<span class="dl ${dcls(v, goodHigh)}">${v > 0 ? '+' : ''}${v.toFixed(d)}${unit}</span>`;
const stat = (k, v, dl = '', cls = '') => `<div class="stat ${cls}"><div class="k">${k}</div><div class="v">${v}${dl}</div></div>`;
const pc = x => (Math.exp(x) - 1) * 100;
const REG = { Europe: 'Европа', Asia: 'Азия', Africa: 'Африка', Americas: 'Америка', Oceania: 'Океания' };
const INCOME = { HIC: 'высокий доход', UMC: 'доход выше среднего', LMC: 'доход ниже среднего', LIC: 'низкий доход', UNK: '' };
const FXREG = { float: 'плавающий курс', peg: 'привязка', union: 'валютный союз', dollarized: 'чужая валюта', anchor: 'резервная валюта' };
const fmtRate = v => v >= 1000 ? Math.round(v).toLocaleString('ru') : v >= 10 ? v.toFixed(1) : v.toFixed(3);

export class RightPanel {
  constructor(app) { this.app = app; this.root = $('#right'); this.mode = null; this.tab = { world: 'ov', country: 'ov' }; }

  show(i) { this.mode = i >= 0 ? 'country' : 'world'; this.i = i; this.build(); this.update(); }

  tabs(list) {
    const cur = this.tab[this.mode];
    return `<div class="insp-tabs">${list.map(([k, n]) => `<button data-t="${k}" class="${k === cur ? 'on' : ''}">${n}</button>`).join('')}</div>`;
  }
  wireTabs() {
    this.root.querySelectorAll('.insp-tabs button').forEach(b => b.onclick = () => {
      this.tab[this.mode] = b.dataset.t;
      this.root.querySelectorAll('.insp-tabs button').forEach(x => x.classList.toggle('on', x === b));
      this.root.querySelectorAll('.insp-pane').forEach(p => p.classList.toggle('on', p.dataset.t === b.dataset.t));
      this.update();
    });
  }
  pane(k, html) { return `<div class="insp-pane ${this.tab[this.mode] === k ? 'on' : ''}" data-t="${k}">${html}</div>`; }

  build() {
    const app = this.app;
    if (this.mode === 'world') {
      this.root.innerHTML = `<div class="insp-head"><div class="name"><span class="flag">🌍</span>Мир</div>
          <div class="sub">Кликните на страну на глобусе, чтобы открыть её агентов, рынки и вмешаться</div></div>
        ${this.tabs([['ov', 'Обзор'], ['rk', 'Рейтинг']])}
        <div class="insp-body">
          ${this.pane('ov', `<div class="stats" id="w-stats"></div>
            <h3>ВВП мира: сценарий и база</h3><canvas class="chart" id="w-c1"></canvas>
            <h3>Рост и инфляция, %</h3><canvas class="chart" id="w-c2"></canvas>
            <h3>Прогноз IMF WEO (рыночные веса)</h3><div id="w-imf"></div>
            <h3>Нефть и войны</h3><canvas class="chart" id="w-c3"></canvas>`)}
          ${this.pane('rk', `<div class="seg" id="w-rk-mode"><button data-m="g" class="on">рост</button><button data-m="dGdp">Δ к базе</button><button data-m="fx">валюта</button><button data-m="eq">биржа</button></div>
            <h3 id="w-rk-t">Лидеры</h3><div id="w-rk"></div>`)}
        </div>`;
      this.rkMode = 'g';
      this.root.querySelectorAll('#w-rk-mode button').forEach(b => b.onclick = () => {
        this.rkMode = b.dataset.m; this.root.querySelectorAll('#w-rk-mode button').forEach(x => x.classList.toggle('on', x === b)); this.update();
      });
      this.wireTabs();
      return;
    }
    const c = app.world.countries[this.i];
    this.root.innerHTML = `<div class="insp-head">
        <div class="name"><span class="flag">${flag(c.iso2)}</span>${esc(c.nameRu)}<button class="icon" id="c-close" style="margin-left:auto" title="Закрыть">✕</button></div>
        <div class="sub">${REG[c.region] || c.region}${c.capital ? ' · ' + esc(c.capital) : ''} · ${esc(c.currency.code)}${INCOME[c.income] ? ' · ' + INCOME[c.income] : ''}</div>
        <div class="tags" id="c-tags"></div></div>
      ${this.tabs([['ov', 'Обзор'], ['ec', 'Экономика'], ['mk', 'Рынки'], ['po', 'Политика'], ['ac', 'Действия']])}
      <div class="insp-body">
        ${this.pane('ov', `<div class="stats" id="c-stats"></div>
          <h3>ВВП: сценарий и база (старт = 100)</h3><canvas class="chart" id="c-ch1"></canvas>
          <h3>Главное</h3><div id="c-sum"></div>`)}
        ${this.pane('ec', `<div class="stats" id="c-econ"></div>
          <h3>Рост ВВП и инфляция, %</h3><canvas class="chart" id="c-ch2"></canvas>
          <h3>Безработица и стабильность</h3><canvas class="chart" id="c-ch3"></canvas>
          <h3>Прогноз IMF WEO</h3><div id="c-imf"></div>`)}
        ${this.pane('mk', `<div class="stats" id="c-mkt"></div>
          <h3>Курс к $ и биржевой индекс, % с начала</h3><canvas class="chart" id="c-ch4"></canvas>
          <h3>Корпорации страны</h3><div id="c-corp"></div>
          <h3>Торговля</h3><div id="c-trade"></div>`)}
        ${this.pane('po', `<h3>Агент-правительство</h3><div id="c-gov"></div>
          <h3>Агенты-граждане</h3><div id="c-cit"></div>
          <h3>Отношения</h3><div id="c-rel"></div>`)}
        ${this.pane('ac', `<div id="c-act"></div>`)}
      </div>`;
    $('#c-close').onclick = () => app.select(-1);
    this.wireTabs();
    this.buildActions(c);
  }

  buildActions(c) {
    const app = this.app, T = app.T;
    const box = $('#c-act');
    box.innerHTML = `<div class="form">
      <select id="a-kind">
        <option value="fiscal">💰 Фискальный стимул (+) / сокращение (−), % ВВП</option>
        <option value="mil">🎖 Изменить военные расходы, п.п. ВВП</option>
        <option value="fx">💱 Девальвация (+) / укрепление (−) валюты, %</option>
        <option value="equity">📉 Обвал (−) / рост (+) фондового рынка, %</option>
        <option value="tariff">🛃 Ввести пошлины против…</option>
        <option value="sanction">⛔ Ввести санкции против…</option>
        <option value="war">⚔ Объявить войну…</option>
        <option value="relation">🤝 Изменить отношения с…</option>
        <option value="cryptoBan">🚫 Запретить криптовалюты</option>
      </select>
      <div id="a-fields" class="form"></div>
      <div class="r2"><button id="a-eval">📊 Оценить</button><button class="primary" id="a-go">Применить</button></div>
      <div class="hint">Вмешательство попадает в активные сценарии и сравнивается с базовым миром. «Оценить» прогоняет его на 20 вариантах будущего.</div></div>`;
    const sel = id => targetSelectHtml(T, id, { exclude: 'iso:' + c.iso3 });
    const num = (lab, v, step = 0.5) => `<div class="r2"><div><label>${lab}</label><input id="a-val" type="number" step="${step}" value="${v}"></div><div><label>Месяцев (0 = бессрочно)</label><input id="a-dur" type="number" value="12"></div></div>`;
    const fields = {
      fiscal: () => num('% ВВП', 3), mil: () => num('п.п. ВВП', 2), fx: () => num('%', 20, 5), equity: () => num('%', -30, 5).replace('value="12"', 'value="1"'),
      tariff: () => `<div><label>Против кого</label>${sel('a-to')}</div><div><label>Пошлина, % (бессрочно, пока не отмените)</label><input id="a-val" type="number" value="30"></div>`,
      sanction: () => `<div><label>Против кого</label>${sel('a-to')}</div>`,
      war: () => `<div><label>Против кого</label>${sel('a-to')}</div>`,
      relation: () => `<div><label>С кем</label>${sel('a-to')}</div><div><label>Изменение (−1…+1)</label><input id="a-val" type="number" step="0.1" value="0.4"></div>`,
      cryptoBan: () => `<div class="hint">Доля населения с криптой упадёт в 4 раза, пока действует запрет.</div><input id="a-dur" type="hidden" value="0">`,
    };
    const render = () => { $('#a-fields').innerHTML = fields[$('#a-kind').value](); };
    $('#a-kind').onchange = render; render();
    const make = () => {
      const kind = $('#a-kind').value, val = parseFloat($('#a-val')?.value), dur = parseInt($('#a-dur')?.value) || 0, to = $('#a-to')?.value;
      const me = ['iso:' + c.iso3], name = c.nameRu, shock = (v, value, d, title) => ({ title, duration: d, effects: [{ kind: 'shock', targets: me, var: v, value }] });
      let def;
      if (kind === 'fiscal') def = shock('fiscal', val, dur || 12, `${name}: фискальный ${val > 0 ? 'стимул' : 'курс на сокращение'} ${val}% ВВП`);
      if (kind === 'mil') def = shock('mil', val, dur || 24, `${name}: военные расходы ${val > 0 ? '+' : ''}${val} п.п.`);
      if (kind === 'fx') def = shock('fx', val, dur, `${name}: ${val > 0 ? 'девальвация' : 'укрепление'} ${c.currency.code} на ${Math.abs(val)}%`);
      if (kind === 'equity') def = shock('equity', val, Math.max(1, dur), `${name}: фондовый рынок ${val > 0 ? '+' : ''}${val}%`);
      if (kind === 'cryptoBan') def = shock('cryptoBan', 1, 0, `${name}: запрет криптовалют`);
      if (kind === 'tariff') def = { title: `${name}: пошлины ${val}% против ${T.label(to)}`, duration: 0, effects: [{ kind: 'tariff', from: me, to: [to], value: val }] };
      if (kind === 'sanction') def = { title: `${name}: санкции против ${T.label(to)}`, duration: 0, effects: [{ kind: 'sanction', from: me, to: [to] }] };
      if (kind === 'war') def = { title: `${name} объявляет войну: ${T.label(to)}`, duration: 0, effects: [{ kind: 'war', a: me, b: [to] }] };
      if (kind === 'relation') def = { title: `${name}: отношения с ${T.label(to)} ${val > 0 ? '+' : ''}${val}`, duration: 0, effects: [{ kind: 'relation', a: me, b: [to], value: val }] };
      if (def.effects.some(e => e.value !== undefined && Number.isNaN(e.value))) { app.toast('Введите число'); return null; }
      return def;
    };
    $('#a-go').onclick = () => { const d = make(); if (d) app.launch(d, 0); };
    $('#a-eval').onclick = () => { const d = make(); if (d) app.evaluate({ title: d.title, scenarios: [{ def: d, delay: 0 }] }); };
  }

  update() {
    if (this.mode === 'world') return this.updateWorld();
    if (this.mode === 'country') return this.updateCountry();
  }

  updateWorld() {
    const { sim, base, world } = this.app, a = sim.agg, b = base.agg, t = this.tab.world;
    if (t === 'ov') {
      $('#w-stats').innerHTML = [
        stat('ВВП мира', fmtMoney(a.gdp), delta((a.gdp / b.gdp - 1) * 100, 2, true, '%'), 'hero'),
        stat('Рост', a.g.toFixed(2) + '%', delta(a.g - b.g, 2)),
        stat('Инфляция', a.infl.toFixed(2) + '%', delta(a.infl - b.infl, 2, false)),
        stat('Безработица', a.unemp.toFixed(2) + '%', delta(a.unemp - b.unemp, 2, false)),
        stat('Стабильность', (a.stab * 100).toFixed(0) + '/100', delta((a.stab - b.stab) * 100, 1)),
        stat('Номинал, тек. $', fmtMoney(a.gdpUsd), ''),
        stat('Население', fmtNum(a.pop), ''),
      ].join('');
      const idx = h => h.map(v => v / h[0] * 100);
      lineChart($('#w-c1'), [{ data: idx(base.wh.gdp), color: '#5f6d87', label: 'база', dash: [4, 3] }, { data: idx(sim.wh.gdp), color: '#5b9cff', label: 'сценарий', width: 2 }], { fmt: v => v.toFixed(0) });
      lineChart($('#w-c2'), [{ data: sim.wh.g, color: '#2fd3a7', label: 'рост' }, { data: sim.wh.infl, color: '#ffb547', label: 'инфляция' }], { zeroLine: true, fmt: v => v.toFixed(1) });
      lineChart($('#w-c3'), [{ data: sim.wh.oil, color: '#c792ea', label: 'нефть' }, { data: sim.wh.wars.map(w => 1 + w * 0.1), color: '#ff5c6c', label: 'войны ×0.1' }], { fmt: v => v.toFixed(2) });
      const f = world.worldForecast || {};
      $('#w-imf').innerHTML = `<div class="stats s3">${Object.entries(f).slice(0, 6).map(([y, v]) => stat(y, v.toFixed(1) + '%')).join('')}</div>
        <div class="hint" style="margin-top:4px">Базовый мир модели опирается на эти прогнозы. В паритетах покупательной способности IMF даёт ${Object.values(world.worldForecastPPP || {}).slice(0, 1).map(v => v + '%').join('')} на 2026 г.</div>`;
    } else {
      const m = this.rkMode, has = sim.scenarios.length > 0;
      // рост — за последние 12 мес. (мгновенный месячный темп слишком шумный), до года — в годовом выражении с начала
      const g12 = s => { const h = s.hist.gdp, n = h.length - 1, k = Math.min(12, n); return k > 0 ? (Math.pow(h[n] / h[n - k], 12 / k) - 1) * 100 : s.g; };
      const cur = s => (1 / Math.exp(s.e) - 1) * 100;                      // стоимость валюты в $, %
      const val = s => m === 'g' ? g12(s) : m === 'dGdp' ? sim.metric(s.i, 'dGdp', base) : m === 'fx' ? cur(s) : pc(s.eq - s.e);
      const sub = s => m === 'eq' ? `в местной ${pc(s.eq) > 0 ? '+' : ''}${pc(s.eq).toFixed(0)}%` : m === 'fx' ? esc(world.countries[s.i].currency.code) : m === 'g' ? fmtMoney(s.gdp) : '';
      const arr = sim.S.filter(s => s.gdp > 1e10 && (m !== 'eq' || s.mcapGdp > 0.1) && (m !== 'fx' || (s.regime !== 'anchor' && s.regime !== 'union' && s.regime !== 'dollarized')))
        .map(s => ({ i: s.i, v: val(s), sub: sub(s) })).sort((x, y) => y.v - x.v);
      const row = ({ i, v, sub }) => `<div class="rel" data-i="${i}"><span>${flag(world.countries[i].iso2)} ${esc(world.countries[i].nameRu)} <span class="sub2">${sub}</span></span><span class="rv ${v >= 0 ? 'pos' : 'neg'}">${v > 0 ? '+' : ''}${v.toFixed(1)}%</span></div>`;
      $('#w-rk-t').textContent = { g: 'Рост ВВП за 12 месяцев', dGdp: has ? 'Кто выиграл / проиграл от сценария (ВВП к базе)' : 'ВВП к базе — запустите сценарий', fx: 'Валюты: стоимость в $ с начала', eq: 'Биржи: доходность в $ с начала' }[m];
      $('#w-rk').innerHTML = `<div class="hint" style="margin-bottom:6px">${arr.length} экономик крупнее $10 млрд${m === 'fx' ? ' со своей валютой' : ''}. Сверху — лучшие, снизу — худшие.</div>`
        + arr.slice(0, 8).map(row).join('') + '<div style="height:8px;border-bottom:1px dashed var(--line);margin-bottom:8px"></div>' + arr.slice(-8).map(row).join('');
      $('#w-rk').querySelectorAll('[data-i]').forEach(e => e.onclick = () => this.app.select(+e.dataset.i));
    }
  }

  updateCountry() {
    const { sim, base, world } = this.app, i = this.i, c = world.countries[i], s = sim.S[i], b = base.S[i], N = world.N, t = this.tab.country;
    const tags = [];
    c.blocs.filter(x => !['G20'].includes(x)).forEach(x => tags.push(`<span class="tag">${BLOC_NAMES[x] || x}</span>`));
    if (c.nuclear) tags.push('<span class="tag orange">☢ ядерная держава</span>');
    if (s.warCount) tags.push('<span class="tag red">⚔ война</span>');
    if (s.sanctionPressure > 0.05) tags.push(`<span class="tag orange">⛔ санкции ${(s.sanctionPressure * 100).toFixed(0)}%</span>`);
    if (s.protest > 0.2) tags.push('<span class="tag red">✊ протесты</span>');
    if (s.defaulted) tags.push('<span class="tag red">💥 дефолт</span>');
    if (s.regime !== c.currency.regime) tags.push('<span class="tag orange">💱 привязка сорвана</span>');
    if (s.fdi > 0.1) tags.push('<span class="tag green">🏭 приток производств</span>');
    if (c.imputed.length > 6) tags.push('<span class="tag">данные оценочные</span>');
    $('#c-tags').innerHTML = tags.join('');
    const idx = h => h.map(v => v / h[0] * 100);

    if (t === 'ov') {
      $('#c-stats').innerHTML = [
        stat('ВВП', fmtMoney(s.gdp), delta((s.gdp / b.gdp - 1) * 100, 2, true, '%'), 'hero'),
        stat('Рост ВВП', s.g.toFixed(1) + '%', delta(s.g - b.g, 1)),
        stat('Инфляция', s.infl.toFixed(1) + '%', delta(s.infl - b.infl, 1, false)),
        stat('Безработица', s.unemp.toFixed(1) + '%', delta(s.unemp - b.unemp, 1, false)),
        stat('Стабильность', (s.stab * 100).toFixed(0) + '/100', delta((s.stab - b.stab) * 100, 0)),
        stat('Курс ' + esc(c.currency.code), fmtRate(c.currency.rate0 * Math.exp(s.e)), delta(pc(s.e - b.e), 1, false, '%')),
        stat('Биржа', (pc(s.eq) > 0 ? '+' : '') + pc(s.eq).toFixed(0) + '%', delta(pc(s.eq - b.eq), 1, true, '%')),
      ].join('');
      lineChart($('#c-ch1'), [{ data: idx(b.hist.gdp), color: '#5f6d87', label: 'база', dash: [4, 3] }, { data: idx(s.hist.gdp), color: '#5b9cff', label: 'сценарий', width: 2 }], { fmt: v => v.toFixed(0) });
      const notes = [], has = sim.scenarios.length > 0, dG = (s.gdp / b.gdp - 1) * 100, dE = pc(s.eq - b.eq), dF = pc(s.e - b.e);
      if (has && Math.abs(dG) > 0.3) notes.push(`${dG < 0 ? '📉' : '📈'} ВВП ${dG > 0 ? '+' : ''}${dG.toFixed(1)}% к базовому миру`);
      if (has && s.mcapGdp && Math.abs(dE) > 3) notes.push(`${dE < 0 ? '🔻' : '🔺'} Биржа ${dE > 0 ? '+' : ''}${dE.toFixed(0)}% к базе`);
      if (has && Math.abs(dF) > 3) notes.push(`💱 ${esc(c.currency.code)} ${dF > 0 ? 'слабее' : 'крепче'} базы на ${Math.abs(dF).toFixed(0)}%`);
      if (s.expIdx < 0.97) notes.push(`📦 Экспорт на ${((1 - s.expIdx) * 100).toFixed(0)}% ниже, чем без барьеров`);
      if (s.expIdx > 1.03) notes.push(`📦 Экспорт на ${((s.expIdx - 1) * 100).toFixed(0)}% выше благодаря перетоку торговли`);
      if (s.tauImp > 0.03) notes.push(`🛃 Средняя пошлина на импорт ${(s.tauImp * 100).toFixed(0)}%`);
      if (Math.abs(s.inflPL) > 0.3) notes.push(`🏷 Разовый скачок цен (пошлины/курс): ${s.inflPL > 0 ? '+' : ''}${s.inflPL.toFixed(1)} п.п. инфляции`);
      if (s.fdi > 0.1) notes.push(`🏭 Приток производств: +${s.fdi.toFixed(1)} п.п. роста`);
      if (s.warCount) notes.push(`⚔ Участвует в ${s.warCount} войн${s.warCount > 1 ? 'ах' : 'е'}`);
      $('#c-sum').innerHTML = notes.length ? notes.map(n => `<div class="eff"><span>${n}</span></div>`).join('') : '<div class="hint">Ничего необычного: страна идёт по базовой траектории.</div>';
    }
    if (t === 'ec') {
      $('#c-econ').innerHTML = [
        stat('На душу', Math.round(s.gdp / s.pop).toLocaleString('ru') + ' $', ''),
        stat('Население', fmtNum(s.pop), ''),
        stat('Гос. долг', s.debt.toFixed(0) + '% ВВП', delta(s.debt - b.debt, 0, false)),
        stat('Ключевая ставка', s.r.toFixed(1) + '%', delta(s.r - b.r, 1, false)),
        stat('Фискальный курс', (s.f > 0 ? '+' : '') + s.f.toFixed(1) + '% ВВП', ''),
        stat('Армия, % ВВП', s.mil.toFixed(1) + '%', delta(s.mil - b.mil, 1, false)),
      ].join('');
      lineChart($('#c-ch2'), [{ data: s.hist.g, color: '#2fd3a7', label: 'рост' }, { data: s.hist.infl, color: '#ffb547', label: 'инфляция' }], { zeroLine: true, fmt: v => v.toFixed(1) });
      lineChart($('#c-ch3'), [{ data: s.hist.unemp, color: '#ff5c6c', label: 'безработица' }, { data: s.hist.stab.map(v => v * 20), color: '#9ad1ff', label: 'стабильность×20' }], { fmt: v => v.toFixed(1) });
      const f = c.forecast;
      $('#c-imf').innerHTML = f?.growth ? `<table class="tbl"><tr><th>Год</th><th class="n">Рост</th><th class="n">Инфляция</th><th class="n">Безраб.</th></tr>${Object.keys(f.growth).map(y => `<tr><td>${y}</td><td class="n">${f.growth[y]?.toFixed(1) ?? '—'}%</td><td class="n">${f.infl?.[y]?.toFixed(1) ?? '—'}%</td><td class="n">${f.unemp?.[y]?.toFixed(1) ?? '—'}</td></tr>`).join('')}</table>` : '<div class="hint">Нет прогноза IMF — траектория по формуле модели.</div>';
    }
    if (t === 'mk') {
      const corps = sim.corps.filter(co => co.hq === i);
      $('#c-mkt').innerHTML = [
        stat(`${esc(c.currency.code)} за $1`, fmtRate(c.currency.rate0 * Math.exp(s.e)), delta(pc(s.e - b.e), 1, false, '%'), 'hero'),
        stat('Режим', FXREG[s.regime] || s.regime),
        stat('Курс с начала', (pc(s.e) > 0 ? '+' : '') + pc(s.e).toFixed(0) + '%'),
        stat('Биржа', s.mcapGdp ? (pc(s.eq) > 0 ? '+' : '') + pc(s.eq).toFixed(0) + '%' : '—', s.mcapGdp ? delta(pc(s.eq - b.eq), 1, true, '%') : ''),
        stat('Капитализация', s.mcapGdp ? (s.mcapGdp * 100).toFixed(0) + '% ВВП' : 'нет рынка'),
        stat('Крипта у населения', (s.crypto * 100).toFixed(1) + '%', s.cryptoBan ? ' <span class="dl neg">запрет</span>' : ''),
        stat('Номинал, тек. $', fmtMoney(s.gdp * Math.exp(s.Plog - s.e))),
      ].join('');
      lineChart($('#c-ch4'), [{ data: s.hist.fx, color: '#ffb547', label: 'курс (+ слабее)' }, ...(s.mcapGdp ? [{ data: s.hist.eq, color: '#7cc4ff', label: 'биржа' }] : [])], { zeroLine: true, fmt: v => v.toFixed(0) + '%' });
      $('#c-corp').innerHTML = corps.length ? corps.map(co => {
        const bc = base.corps.find(x => x.k === co.k), d = pc(co.v - (bc?.v ?? co.v));
        return `<div class="rel"><span>${esc(co.name)} <span class="sub2">${SECTORS[co.sector] || co.sector} · $${(co.mcap / 1e9).toFixed(0)} млрд${co.relocated != null ? ' · 🏭→' + esc(world.countries[co.relocated].nameRu) : ''}</span></span><span class="rv">${pc(co.v) > 0 ? '+' : ''}${pc(co.v).toFixed(0)}%${Math.abs(d) > 0.05 ? ` <span class="dl ${d >= 0 ? 'pos' : 'neg'}">${d > 0 ? '+' : ''}${d.toFixed(1)}</span>` : ''}</span></div>`;
      }).join('') : '<div class="hint">Среди крупнейших компаний мира нет компаний этой страны.</div>';
      const ex = world.partners[i].map(j => ({ j, x: world.X[i * N + j], m: world.X[j * N + i] })).sort((p, q) => q.x + q.m - p.x - p.m).slice(0, 6);
      const st = j => [sim.T[j * N + i] ? `🛃${sim.T[j * N + i].toFixed(0)}%` : '', (sim.San[i * N + j] | sim.San[j * N + i]) ? '⛔' : '', sim.warMat[i * N + j] ? '⚔' : ''].filter(Boolean).join(' ');
      $('#c-trade').innerHTML = `<div class="stats" style="margin-bottom:8px">${stat('Экспорт к контрфакт.', ((s.expIdx - 1) * 100 > 0 ? '+' : '') + ((s.expIdx - 1) * 100).toFixed(1) + '%')}${stat('Ср. пошлина на импорт', (s.tauImp * 100).toFixed(1) + '%')}</div>
        <table class="tbl"><tr><th>Партнёр</th><th class="n">экспорт</th><th class="n">импорт</th></tr>${ex.map(p => `<tr data-i="${p.j}"><td>${flag(world.countries[p.j].iso2)} ${esc(world.countries[p.j].nameRu)} <span class="hint">${st(p.j)}</span></td><td class="n">${(p.x / 1e3).toFixed(1)}</td><td class="n">${(p.m / 1e3).toFixed(1)}</td></tr>`).join('')}</table>
        <div class="hint" style="margin-top:4px">млрд $ в год, исходные потоки (${c.tradeData ? 'UN Comtrade' : 'гравитационная оценка'}).</div>`;
      this.root.querySelectorAll('#c-trade [data-i]').forEach(e => e.onclick = () => this.app.select(+e.dataset.i));
    }
    if (t === 'po') {
      const bar = (name, v, col = 'var(--acc)') => `<div class="trait"><span>${name}</span><div class="tb"><i style="width:${(v * 100).toFixed(0)}%;background:${col}"></i></div><span>${(v * 100).toFixed(0)}</span></div>`;
      $('#c-gov').innerHTML = bar('Ястребиность', s.hawk, '#ff5c6c') + bar('Кооперативность', s.coop, '#2fd3a7') + bar('Протекционизм', s.protect, '#ffb547')
        + bar('Демократичность', s.dem, '#9ad1ff') + bar('Эффективность', c.ge, '#c792ea')
        + `<div class="hint">Следующие выборы: ${s.dem > 0.5 ? (s.nextElection > sim.t ? 'через ' + (s.nextElection - sim.t) + ' мес.' : 'скоро') : 'нет (авторитарный режим)'}.</div>`;
      const cit = s.cit; let unemp = 0; for (let k = 0; k < cit.n; k++) unemp += cit.emp[k] ? 0 : 1;
      $('#c-cit').innerHTML = `<div class="hint">${cit.n} агентов, каждый представляет ${fmtNum(s.pop / cit.n)} человек.</div>`
        + bar('Безработные', unemp / cit.n, '#ff5c6c') + bar('Протестуют', s.protest, '#ffb547') + bar('Довольны жизнью', s.sent, '#2fd3a7') + bar('Держат крипту', s.crypto, '#f7931a')
        + (Math.abs(s.migNet) > 1000 ? `<div class="hint">Чистая миграция: ${s.migNet > 0 ? '+' : ''}${fmtNum(s.migNet)} чел.</div>` : '');
      const rel = [];
      for (let j = 0; j < N; j++) if (j !== i) rel.push({ j, r: sim.R[i * N + j] });
      const friends = [...rel].sort((x, y) => y.r - x.r).slice(0, 5), foes = [...rel].sort((x, y) => x.r - y.r).slice(0, 5);
      const status = j => [sim.warMat[i * N + j] ? '⚔' : '', sim.San[i * N + j] ? '⛔→' : '', sim.San[j * N + i] ? '⛔←' : '', sim.T[i * N + j] ? `🛃${sim.T[i * N + j].toFixed(0)}%` : '', sim.T[j * N + i] ? `←🛃${sim.T[j * N + i].toFixed(0)}%` : ''].filter(Boolean).join(' ');
      const line = x => `<div class="rel" data-i="${x.j}"><span>${flag(world.countries[x.j].iso2)} ${esc(world.countries[x.j].nameRu)} <span class="hint">${status(x.j)}</span></span><span class="rv ${x.r >= 0 ? 'pos' : 'neg'}">${x.r > 0 ? '+' : ''}${x.r.toFixed(2)}</span></div>`;
      $('#c-rel').innerHTML = '<div class="hint">Союзники и друзья</div>' + friends.map(line).join('') + '<div class="hint" style="margin-top:8px">Недруги</div>' + foes.map(line).join('');
      $('#c-rel').querySelectorAll('[data-i]').forEach(e => e.onclick = () => this.app.select(+e.dataset.i));
    }
  }
}

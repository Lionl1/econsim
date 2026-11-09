// Вкладка «Рынки»: мировой фондовый рынок, биткоин, торговля, отрасли, валюты, биржи стран и корпорации.
import { lineChart } from './charts.js';
import { esc } from './targets.js';
import { SECTORS } from '../sim/equity.js';

const $ = (s, r = document) => r.querySelector(s);
const flag = iso2 => iso2 ? String.fromCodePoint(...[...iso2.toUpperCase()].map(c => 0x1f1a5 + c.charCodeAt(0))) : '';
const pc = x => (Math.exp(x) - 1) * 100;
const sg = (v, d = 1) => `<span class="${v >= 0 ? 'pos' : 'neg'}">${v > 0 ? '+' : ''}${v.toFixed(d)}%</span>`;
const REG = { float: 'плавающий', peg: 'привязка', union: 'валютный союз', dollarized: 'чужая валюта', anchor: 'резервная валюта' };

export function initMarkets(app) {
  const root = $('#tab-mkt');
  root.innerHTML = `
    <div class="stats" id="m-top"></div>
    <h3>Мировые акции и биткоин, % с начала</h3><canvas class="chart" id="m-c1"></canvas>
    <h3>Отрасли (мировой фактор), % с начала</h3><div id="m-sect"></div>
    <h3>Корпорации</h3><div class="hint" style="margin-bottom:6px">Стоимость к старту и к базовому миру. Компании-агенты переносят производство, если барьеры бьют по их рынкам или цепочкам поставок.</div>
    <table class="tbl" id="m-corp"></table>
    <h3>Валюты: сильнее всего ослабли / укрепились к $</h3><div id="m-fx"></div>
    <h3>Биржи стран (в местной валюте)</h3><div id="m-eq"></div>
    <h3>Переносы производства</h3><div id="m-reloc" class="hint">Пока не было.</div>`;

  app.refreshMarkets = force => {
    if (!force && !$('#tab-mkt').classList.contains('on')) return;
    const { sim, base, world } = app, a = sim.agg, b = base.agg, has = sim.scenarios.length > 0;
    const stat = (k, v, dl = '', hero = false) => `<div class="stat${hero ? ' hero' : ''}"><div class="k">${k}</div><div class="v">${v}${dl}</div></div>`;
    const dl = (v, d = 1) => has && Math.abs(v) > 0.005 ? `<span class="dl ${v >= 0 ? 'pos' : 'neg'}">${v > 0 ? '+' : ''}${v.toFixed(d)}%</span>` : '';
    const btc12 = sim.btcHist.length > 1 ? (sim.btc / sim.btcHist[0] - 1) * 100 : 0;
    $('#m-top').innerHTML = [
      stat('Мировой индекс акций', (pc(a.eq) > 0 ? '+' : '') + pc(a.eq).toFixed(1) + '%', dl(pc(a.eq - b.eq)), true),
      stat('Биткоин', '$' + Math.round(sim.btc).toLocaleString('ru'), dl((sim.btc / base.btc - 1) * 100, 0)),
      stat('BTC за 12 мес.', (btc12 > 0 ? '+' : '') + btc12.toFixed(0) + '%'),
      stat('Мировая торговля', ((a.trade - 1) * 100 > 0 ? '+' : '') + ((a.trade - 1) * 100).toFixed(1) + '%', dl((a.trade / b.trade - 1) * 100)),
      stat('Крипта у населения', (a.crypto * 100).toFixed(1) + '%'),
    ].join('');
    const norm = h => h.map(v => (Math.exp(v) - 1) * 100), btcN = h => h.map(v => (v / sim.btc0 - 1) * 100 / 4);
    lineChart($('#m-c1'), [
      ...(has ? [{ data: norm(base.wh.eq), color: '#5f6d87', label: 'база', dash: [4, 3] }] : []),
      { data: norm(sim.wh.eq), color: '#7cc4ff', label: 'акции', width: 2 },
      { data: btcN(sim.wh.btc), color: '#f7931a', label: 'BTC ÷4' },
    ], { height: 100, zeroLine: true, fmt: v => v.toFixed(0) + '%' });

    // отрасли: столбики от нуля
    const sec = Object.entries(SECTORS).map(([k, name]) => ({ name, v: pc(sim.sector[k]) }));
    const mx = Math.max(10, ...sec.map(s => Math.abs(s.v)));
    $('#m-sect').innerHTML = sec.map(s => {
      const w = Math.min(50, Math.abs(s.v) / mx * 50);
      return `<div class="sect"><span>${s.name}</span><div class="sb"><i style="left:${s.v >= 0 ? 50 : 50 - w}%;width:${w}%;background:${s.v >= 0 ? 'var(--good)' : 'var(--bad)'}"></i></div>${sg(s.v, 0)}</div>`;
    }).join('');

    // корпорации
    const corps = [...sim.corps].map(co => ({ co, v: pc(co.v), d: pc(co.v - (base.corps.find(x => x.k === co.k)?.v ?? co.v)) })).sort((x, y) => y.co.mcap - x.co.mcap);
    $('#m-corp').innerHTML = `<tr><th>Компания</th><th class="n">с начала</th>${has ? '<th class="n">к базе</th>' : ''}</tr>` + corps.slice(0, 30).map(({ co, v, d }) => {
      const c = world.countries[co.hq], rel = co.relocated != null ? ` <span title="перенесла производство: ${esc(world.countries[co.relocated].nameRu)}">🏭→${flag(world.countries[co.relocated].iso2)}</span>` : '';
      return `<tr data-i="${co.hq}"><td>${flag(c.iso2)} ${esc(co.name)}${rel}<div class="hint" style="font-size:10.5px">${SECTORS[co.sector] || co.sector} · $${(co.mcap / 1e9).toFixed(0)} млрд</div></td><td class="n">${sg(v, 0)}</td>${has ? `<td class="n">${sg(d, 1)}</td>` : ''}</tr>`;
    }).join('');

    // валюты
    const fx = sim.S.map(s => ({ s, v: pc(s.e) })).filter(x => x.s.regime !== 'anchor' && x.s.gdp > 1e10);
    fx.sort((x, y) => y.v - x.v);
    const fxRow = ({ s, v }) => { const c = world.countries[s.i]; return `<div class="rel" data-i="${s.i}"><span>${flag(c.iso2)} ${esc(c.currency.code)} <span class="sub2">${esc(c.nameRu)} · ${REG[s.regime] || s.regime}</span></span><span class="rv">${sg(-v / (1 + v / 100) , 1)}</span></div>`; };
    $('#m-fx').innerHTML = fx.slice(0, 5).map(fxRow).join('') + '<div style="height:6px"></div>' + fx.slice(-4).reverse().map(fxRow).join('')
      + '<div class="hint" style="margin-top:4px">Число — изменение стоимости валюты в долларах (минус — подешевела).</div>';

    // биржи
    const eq = sim.S.filter(s => s.mcapGdp > 0.15 && s.gdp > 5e10).map(s => ({ s, v: pc(s.eq), usd: pc(s.eq - s.e) })).sort((x, y) => y.usd - x.usd);
    const eqRow = ({ s, v, usd }) => { const c = world.countries[s.i]; return `<div class="rel" data-i="${s.i}"><span>${flag(c.iso2)} ${esc(c.nameRu)} <span class="sub2">кап. ${(s.mcapGdp * 100).toFixed(0)}% ВВП</span></span><span class="rv">${sg(v, 0)} <span class="sub2">в $ ${usd > 0 ? '+' : ''}${usd.toFixed(0)}%</span></span></div>`; };
    $('#m-eq').innerHTML = eq.slice(0, 5).map(eqRow).join('') + '<div style="height:6px"></div>' + eq.slice(-4).reverse().map(eqRow).join('');

    const rel = sim.events.filter(e => e.kind === 'corp').slice(-8).reverse();
    if (rel.length) $('#m-reloc').innerHTML = rel.map(e => `<div class="eff"><span>${esc(e.text)}</span></div>`).join('');
    root.querySelectorAll('[data-i]').forEach(el => el.onclick = () => app.select(+el.dataset.i));
  };
}

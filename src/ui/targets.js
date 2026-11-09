// Справочник целей для сценариев (селекторы) и описания эффектов.
import { BLOC_NAMES } from '../sim/blocs.js';
import { SHOCK_VARS } from '../sim/scenarios.js';

const REGIONS = { Europe: 'Европа', Asia: 'Азия', Africa: 'Африка', Americas: 'Америка', Oceania: 'Океания' };

// экранирование для вставки пользовательского текста в innerHTML
export const esc = s => String(s).replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]);

export function buildTargets(world) {
  const groups = [
    ['Группы', [['all', '🌍 Весь мир'], ['oilExp', 'Экспортёры нефти/топлива'], ['energyImp', 'Импортёры энергии']]],
    ['Регионы', Object.entries(REGIONS).map(([k, v]) => ['region:' + k, v])],
    ['Блоки', Object.entries(BLOC_NAMES).map(([k, v]) => ['bloc:' + k, v])],
    ['Доход', [['income:HIC', 'Богатые страны'], ['income:UMC', 'Выше среднего'], ['income:LMC', 'Ниже среднего'], ['income:LIC', 'Бедные страны']]],
    ['Страны', [...world.countries].sort((a, b) => a.nameRu.localeCompare(b.nameRu, 'ru')).map(c => ['iso:' + c.iso3, c.nameRu])],
  ];
  const label = new Map(groups.flatMap(([, xs]) => xs));
  return { groups, label: sel => (Array.isArray(sel) ? sel : [sel]).map(s => label.get(s) || esc(s)).join(', ') };
}

export function targetSelectHtml(T, id, { exclude, only = null, selected } = {}) {
  return `<select id="${id}">` + T.groups.map(([g, xs]) => {
    const list = xs.filter(([v]) => v !== exclude && (!only || only.includes(g)));
    return list.length ? `<optgroup label="${g}">${list.map(([v, l]) => `<option value="${v}" ${v === selected ? 'selected' : ''}>${l}</option>`).join('')}</optgroup>` : '';
  }).join('') + '</select>';
}

export function describeEffect(T, e) {
  switch (e.kind) {
    case 'shock': return `${T.label(e.targets)}: ${SHOCK_VARS[e.var] || esc(e.var)} ${e.value > 0 ? '+' : ''}${e.value}${e.scale && e.scale !== 'none' ? ` (×${e.scale})` : ''}`;
    case 'oil': return `Цена нефти ${e.value > 0 ? '+' : ''}${Math.round(e.value * 100)}%`;
    case 'tariff': return `Пошлины ${e.value}%: ${T.label(e.from)} → ${T.label(e.to)}`;
    case 'sanction': return `Санкции: ${T.label(e.from)} → ${T.label(e.to)}`;
    case 'war': return `Война: ${T.label(e.a)} ⟷ ${T.label(e.b)}`;
    case 'peace': return `Мирное соглашение: ${T.label(e.a)} (конец войн, снятие санкций и пошлин, запрет новых войн)`;
    case 'relation': return `Отношения ${e.value > 0 ? '+' : ''}${e.value}: ${T.label(e.a)} ↔ ${T.label(e.b)}`;
  }
  return esc(e.kind);
}

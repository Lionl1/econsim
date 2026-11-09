// Библиотека готовых сценариев. Сценарий = набор эффектов во времени.
// Селекторы целей: 'all', 'iso:USA', 'region:Europe', 'subregion:...', 'bloc:NATO', 'oilExp', 'energyImp', 'income:HIC'
// Виды эффектов:
//   shock    {targets, var: growth|infl|unemp|stab|sent|mil|fiscal|level|pop|debt, value, scale?: urban|openness|internet}
//   oil      {value}   — надбавка к цене нефти (1.0 = +100%)
//   tariff   {from, to, value}   — пошлина в %
//   sanction {from, to}
//   war      {a, b}
//   relation {a, b, value}
const GULF = ['iso:IRN', 'iso:SAU', 'iso:ARE', 'iso:KWT', 'iso:QAT', 'iso:BHR', 'iso:OMN', 'iso:IRQ'];
const FRAGILE = ['region:Africa', 'subregion:Southern Asia'];

export const PRESETS = [
  { id: 'oil-shock', icon: '🛢', title: 'Нефтяной шок +100%', duration: 12,
    desc: 'ОПЕК+ резко сокращает добычу, цена нефти вдвое. Импортёры энергии страдают, экспортёры выигрывают.',
    effects: [{ kind: 'oil', value: 1.0 }] },
  { id: 'hormuz', icon: '🚢', title: 'Блокада Ормузского пролива', duration: 6,
    desc: 'Нефть +150%, страны Залива теряют экспорт и растёт напряжённость.',
    effects: [{ kind: 'oil', value: 1.5 }, { kind: 'shock', targets: GULF, var: 'growth', value: -6 }, { kind: 'shock', targets: GULF, var: 'stab', value: -0.08 }] },
  { id: 'pandemic', icon: '🦠', title: 'Глобальная пандемия', duration: 9,
    desc: 'Локдауны и падение спроса: тем сильнее, чем более страна открыта и урбанизирована.',
    effects: [{ kind: 'shock', targets: ['all'], var: 'growth', value: -6, scale: 'urban' }, { kind: 'shock', targets: ['all'], var: 'unemp', value: 3, scale: 'urban' }, { kind: 'shock', targets: ['all'], var: 'sent', value: -0.12 }, { kind: 'shock', targets: ['all'], var: 'fiscal', value: 4 }, { kind: 'shock', targets: ['all'], var: 'level', value: -1.5, scale: 'openness' }] },
  { id: 'us-china-trade-war', icon: '⚔', title: 'Торговая война США ↔ Китай', duration: 48,
    desc: 'Взаимные пошлины 60% на 4 года.',
    effects: [{ kind: 'tariff', from: ['iso:USA'], to: ['iso:CHN'], value: 60 }, { kind: 'tariff', from: ['iso:CHN'], to: ['iso:USA'], value: 60 }] },
  { id: 'sanctions-russia', icon: '⛔', title: 'Санкции против России', duration: 60,
    desc: 'НАТО, ЕС, Япония, Австралия, Корея и др. вводят санкции на 5 лет.',
    effects: [{ kind: 'sanction', from: ['bloc:NATO', 'bloc:EU', 'iso:JPN', 'iso:AUS', 'iso:KOR', 'iso:CHE', 'iso:NZL', 'iso:SGP'], to: ['iso:RUS'] }] },
  { id: 'us-crisis', icon: '🏦', title: 'Финансовый кризис в США', duration: 18,
    desc: 'Лопается пузырь: рецессия в США, кредитный паралич распространяется на мир (сильнее у открытых экономик).',
    effects: [{ kind: 'shock', targets: ['iso:USA'], var: 'growth', value: -5 }, { kind: 'shock', targets: ['iso:USA'], var: 'unemp', value: 4 }, { kind: 'shock', targets: ['iso:USA'], var: 'level', value: -3 }, { kind: 'shock', targets: ['iso:USA'], var: 'stab', value: -0.06 }, { kind: 'shock', targets: ['iso:USA'], var: 'debt', value: 15 },
      { kind: 'shock', targets: ['all'], var: 'growth', value: -2.5, scale: 'openness' }, { kind: 'shock', targets: ['all'], var: 'level', value: -1.5, scale: 'openness' }, { kind: 'shock', targets: ['income:HIC'], var: 'unemp', value: 1.5 }] },
  { id: 'eurozone-debt', icon: '💶', title: 'Долговой кризис еврозоны', duration: 24,
    desc: 'Рынки отказываются покупать облигации стран ЕС: рецессия, рост долгов.',
    effects: [{ kind: 'shock', targets: ['bloc:EU'], var: 'growth', value: -3 }, { kind: 'shock', targets: ['bloc:EU'], var: 'debt', value: 20 }, { kind: 'shock', targets: ['bloc:EU'], var: 'unemp', value: 2.5 }, { kind: 'shock', targets: ['bloc:EU'], var: 'stab', value: -0.05 }] },
  { id: 'taiwan', icon: '🔥', title: 'Война: Китай — Тайвань', duration: 0,
    desc: 'Китай начинает вторжение; союзники Тайваня реагируют, возможны санкции.',
    effects: [{ kind: 'war', a: ['iso:CHN'], b: ['iso:TWN'] }, { kind: 'relation', a: ['iso:USA'], b: ['iso:CHN'], value: -0.4 }] },
  { id: 'india-pakistan', icon: '🔥', title: 'Война: Индия — Пакистан', duration: 0,
    desc: 'Две ядерные державы вступают в конфликт.',
    effects: [{ kind: 'war', a: ['iso:IND'], b: ['iso:PAK'] }] },
  { id: 'russia-ukraine', icon: '🔥', title: 'Война: Россия — Украина', duration: 0,
    desc: 'Открытая война. Реагируют НАТО/ЕС (санкции, помощь, вступление в войну).',
    effects: [{ kind: 'war', a: ['iso:RUS'], b: ['iso:UKR'] }] },
  { id: 'ai-boom', icon: '🤖', title: 'Бум искусственного интеллекта', duration: 60,
    desc: 'Продуктивность растёт в передовых экономиках, но растёт и структурная безработица.',
    effects: [{ kind: 'shock', targets: ['bloc:G7', 'iso:CHN', 'iso:KOR', 'iso:SGP', 'iso:IND', 'iso:ISR'], var: 'growth', value: 1.5, scale: 'internet' }, { kind: 'shock', targets: ['bloc:G7', 'iso:CHN', 'iso:KOR', 'iso:SGP'], var: 'unemp', value: 1.5 }, { kind: 'shock', targets: ['all'], var: 'infl', value: -0.4 }] },
  { id: 'drought', icon: '🌵', title: 'Мегазасуха и неурожай', duration: 18,
    desc: 'Африка, Юго-Восточная и Южная Азия, Южная Америка: падение ВВП, рост цен, миграция.',
    effects: [{ kind: 'shock', targets: [...FRAGILE, 'subregion:South-Eastern Asia', 'subregion:South America'], var: 'level', value: -5 }, { kind: 'shock', targets: FRAGILE, var: 'infl', value: 5 }, { kind: 'shock', targets: FRAGILE, var: 'sent', value: -0.15 }, { kind: 'shock', targets: FRAGILE, var: 'stab', value: -0.08 }] },
  { id: 'free-trade', icon: '🌐', title: 'Мировая торговая либерализация', duration: 36,
    desc: 'G20 договариваются о снижении барьеров: растёт открытость и доверие.',
    effects: [{ kind: 'shock', targets: ['bloc:G20'], var: 'growth', value: 0.8, scale: 'openness' }, { kind: 'relation', a: ['bloc:G20'], b: ['bloc:G20'], value: 0.15 }] },
  { id: 'cold-war', icon: '🧊', title: 'Новая «холодная война»: блоки', duration: 60,
    desc: 'НАТО против Китая, России, Ирана: взаимные пошлины и ухудшение отношений.',
    effects: [{ kind: 'tariff', from: ['bloc:NATO'], to: ['iso:CHN', 'iso:RUS', 'iso:IRN'], value: 25 }, { kind: 'tariff', from: ['iso:CHN', 'iso:RUS', 'iso:IRN'], to: ['bloc:NATO'], value: 25 }, { kind: 'relation', a: ['bloc:NATO'], b: ['bloc:BRICS'], value: -0.3 }] },
];

export const SHOCK_VARS = {
  growth: 'Рост ВВП (п.п./год)', infl: 'Инфляция (п.п.)', unemp: 'Безработица (п.п.)', stab: 'Стабильность (±0..1)',
  sent: 'Настроения населения (±0..1)', mil: 'Военные расходы (% ВВП)', fiscal: 'Фискальный стимул (% ВВП)',
  level: 'Разовое изменение ВВП (%)', pop: 'Население (%)', debt: 'Госдолг (п.п. ВВП)',
};

// Разбор свободного текста («Россия вторгается в Украину», «землетрясение в Японии, −8% ВВП на полгода»)
// в набор эффектов сценария. Правила и словари, без внешних моделей.
const norm = s => s.toLowerCase().replace(/ё/g, 'е');
const GULF = ['iso:IRN', 'iso:SAU', 'iso:ARE', 'iso:KWT', 'iso:QAT', 'iso:BHR', 'iso:OMN', 'iso:IRQ'];
const WEST_SANCTIONERS = ['bloc:NATO', 'bloc:EU', 'iso:JPN', 'iso:AUS', 'iso:KOR', 'iso:CHE', 'iso:NZL'];

// алиасы: префикс слова -> селекторы
const ALIASES = [
  ['сша', ['iso:USA']], ['америк', ['iso:USA']], ['штат', ['iso:USA']], ['вашингтон', ['iso:USA']],
  ['великобритан', ['iso:GBR']], ['британ', ['iso:GBR']], ['англи', ['iso:GBR']],
  ['тайван', ['iso:TWN']], ['кнр', ['iso:CHN']], ['пекин', ['iso:CHN']], ['москв', ['iso:RUS']], ['киев', ['iso:UKR']],
  ['оаэ', ['iso:ARE']], ['эмират', ['iso:ARE']], ['юар', ['iso:ZAF']], ['корея', ['iso:KOR']], ['северной корe', ['iso:PRK']],
  ['нато', ['bloc:NATO']], ['евросоюз', ['bloc:EU']], ['еэс', ['bloc:EU']], ['ес', ['bloc:EU'], true], ['брикс', ['bloc:BRICS']],
  ['асеан', ['bloc:ASEAN']], ['шос', ['bloc:SCO']], ['опек', ['bloc:OPEC']], ['одкб', ['bloc:CSTO']], ['g7', ['bloc:G7']], ['g20', ['bloc:G20']],
  ['семерк', ['bloc:G7']], ['двадцатк', ['bloc:G20']], ['запад', ['bloc:NATO', 'bloc:EU']],
  ['европ', ['region:Europe']], ['азии', ['region:Asia']], ['азия', ['region:Asia']], ['азиат', ['region:Asia']], ['африк', ['region:Africa']],
  ['латинск', ['region:Americas']], ['океани', ['region:Oceania']],
  ['залив', GULF], ['персидск', GULF], ['ближн', GULF], ['ближнего', GULF],
  ['мир', ['all'], true], ['мире', ['all']], ['глобальн', ['all']], ['мировой', ['all']], ['мировая', ['all']], ['мировое', ['all']], ['все страны', ['all']],
  ['богат', ['income:HIC']], ['бедн', ['income:LIC']], ['развив', ['income:LMC', 'income:LIC']],
];

// слово названия -> {word, base}: base без окончания, к нему допускаются падежные окончания из ENDINGS
const STRIP = /(ая|ое|ые|ий|ый|ой|ия|ея|я|а|ь|й|о|и|ы|е)$/;
const ENDINGS = new Set(['', 'а', 'ы', 'е', 'у', 'и', 'ю', 'я', 'й', 'ой', 'ою', 'ей', 'ем', 'ом', 'ии', 'ию', 'ия', 'ией', 'ая', 'ую', 'ые', 'ых', 'ым', 'ыми', 'ого', 'ому', 'ий', 'ый', 'ое', 'ие', 'их', 'им', 'ами', 'ах', 'ам', 'ея', 'еи', 'ее', 'ею', 'еей']);
const wordMatch = (tok, p) => tok === p.word || (p.base.length >= 3 && tok.startsWith(p.base) && ENDINGS.has(tok.slice(p.base.length)));
// алиасы из нескольких слов (префиксы подряд идущих слов)
const PHRASES = [
  [['все', 'стран'], ['all']], [['всех', 'стран'], ['all']], [['весь', 'мир'], ['all']], [['всего', 'мир'], ['all']],
  [['мировое', 'сообществ'], ['all']], [['оон'], ['all']], [['человечеств'], ['all']], [['планет'], ['all']], [['земл'], ['all'], true],
];

function countryIndex(world) {
  return world.countries.map(c => {
    const words = norm(c.nameRu).split(/[\s-]+/).filter(Boolean);
    const parts = words.map(w => ({ word: w, base: w.length > 3 ? w.replace(STRIP, '') : w }));
    return { iso: c.iso3, parts, len: words.join('').length };
  }).sort((a, b) => b.parts.length - a.parts.length || b.len - a.len);
}

// обычные слова, совпадающие с названиями стран: страной считаются только с заглавной буквы
const STOP = new Set(['того']);
// (?<![а-я]) — начало слова: \b в JS не работает с кириллицей

const KW = /(?<![а-я])(война|вторжен|вторга|напад|атак|удар|воюет|обстрел|захват|санкци|эмбарго|изоляц|пошлин|тариф|торгов[а-я]* войн|нефт|землетряс|цунами|ураган|наводнен|стихийн|извержен|засух|неурожай|голод|пандеми|эпидеми|вирус|карантин|кризис|рецесси|крах|банкротств|пузыр|дефолт|переворот|революци|мятеж|восстани|беспорядк|протест|теракт|кибератак|взлом|забастовк|инфляц|безработиц|военн[а-я]* (расход|бюджет)|вооруж|милитариз|бум(?![а-я])|подъем|прорыв|технологическ|стимул|реформ|помощ|грант|союз|сближен|объедин|сотруднич|разоруж|примирен|перемири|дружб|договор|альянс|ссор|конфликт|напряжен|разрыв|эскалац)/;

export function parseEvent(textRaw, world, lab = null) {
  // несколько событий в одной фразе: делим по запятым/«и»/«;», склеивая куски без ключевых слов с предыдущим
  const segs = textRaw.split(/\s*(?:[,;]|(?<![а-я])и(?=\s)|а также|при этом|потом|затем)\s*/i).filter(s => s.trim());
  const units = [];
  for (const sg of segs) {
    const s = norm(sg);
    if (units.length && KW.test(s) && KW.test(norm(units[units.length - 1]))) units.push(sg);
    else if (units.length) units[units.length - 1] += ' и ' + sg; else units.push(sg);
  }
  // каждое событие — отдельный сценарий со своими сроком и задержкой
  const parts = (units.length <= 1 ? [textRaw] : units).map(u => parseOne(u, world, lab)), okp = parts.filter(p => p.ok);
  if (!okp.length) return { ok: false, notes: parts.flatMap(p => p.notes), parts: [] };
  return { ok: true, parts: okp, notes: parts.filter(p => !p.ok).flatMap(p => p.notes.slice(0, -1)) };
}

function parseOne(textRaw, world, lab = null) {
  const text = norm(textRaw);
  const toks = [...text.matchAll(/[a-zа-я0-9]+/g)].map(m => ({ w: m[0], pos: m.index, used: false }));
  const notes = [];
  // ---- сущности ----
  const ents = [];
  const idx = world._nlpIdx ??= countryIndex(world);
  const take = (k, n, sel, label) => { for (let q = 0; q < n; q++) toks[k + q].used = true; ents.push({ pos: toks[k].pos, sel, label }); };
  for (let k = 0; k < toks.length; k++) {
    if (toks[k].used) continue;
    let hit = false;
    for (const c of idx) {          // страны (сначала многословные)
      if (c.parts.length > 1 && c.parts.every((p, q) => toks[k + q] && !toks[k + q].used && wordMatch(toks[k + q].w, p))) { take(k, c.parts.length, ['iso:' + c.iso], c.iso); hit = true; break; }
    }
    if (hit) continue;
    for (const [ws, sel, exact] of PHRASES) {
      if (ws.every((p, q) => toks[k + q] && !toks[k + q].used && (exact ? toks[k + q].w === 'земля' || toks[k + q].w === 'земли' : toks[k + q].w.startsWith(p)))) { take(k, ws.length, sel, ws.join(' ')); hit = true; break; }
    }
    if (hit) continue;
    for (const [pre, sel, exact] of ALIASES) {
      const w = toks[k].w;
      if (exact ? w === pre : w.startsWith(pre)) { take(k, 1, sel, pre); hit = true; break; }
    }
    if (hit) continue;
    for (const c of idx) if (c.parts.length === 1 && !(STOP.has(toks[k].w) && !/^[А-ЯЁ]/.test(textRaw.slice(toks[k].pos, toks[k].pos + 1))) && wordMatch(toks[k].w, c.parts[0])) { take(k, 1, ['iso:' + c.iso], c.iso); hit = true; break; }
  }
  const sorted = ents.sort((a, b) => a.pos - b.pos);
  const labels = [...new Set(sorted.map(e => (lab ? lab(e.sel) : e.label)))];
  const proPos = (() => { const t = toks.find(t => t.w === 'против'); return t ? t.pos : -1; })();
  let A = null, B = null;
  const group = list => (list.length ? { pos: list[0].pos, sel: [...new Set(list.flatMap(e => e.sel))] } : null);
  if (proPos >= 0) { B = group(sorted.filter(e => e.pos > proPos)); A = group(sorted.filter(e => e.pos < proPos)); }
  else { A = sorted[0]; B = sorted[1]; }
  const one = sorted[0];

  // ---- числа и интенсивность ----
  const pctM = text.match(/([+\-−]?\s?\d+(?:[.,]\d+)?)\s*(%|процент|п\.п)/);
  const pct = pctM ? Math.abs(parseFloat(pctM[1].replace(',', '.').replace(/\s/g, ''))) : null;
  let duration = null, delay = 0;
  const dM = [...text.matchAll(/(\d+)\s*(месяц|мес|год|лет)/g)].find(m => !/через\s*$/.test(text.slice(0, m.index)));
  if (dM) { duration = +dM[1] * (dM[2].startsWith('м') ? 1 : 12); }
  else if (/полгода|полугод/.test(text)) duration = 6;
  else if (/(на|течение|около)\s+(один\s+|одного\s+)?(год|года)(?![а-я])/.test(text)) duration = 12;
  const dl = text.match(/через\s+(\d+)\s*(месяц|мес|год|лет)/);
  if (dl) delay = +dl[1] * (dl[2].startsWith('м') ? 1 : 12);
  const strong = /(сильн|мощн|катастроф|масштабн|разрушительн|тяжел|глубок)/.test(text) ? 1.6 : /(небольш|слаб|легк|незначит|умерен)/.test(text) ? 0.5 : 1;
  const sh = (targets, v, value, extra = {}) => ({ kind: 'shock', targets, var: v, value: +(value).toFixed(2), ...extra });
  const effects = []; let dur = 0; let title = null; const recognized = [];
  const evText = text.replace(/(?<![а-я])(с|при) помощ[а-я]*/g, m => ' '.repeat(m.length));   // «с помощью» — не событие
  const has = re => re.test(evText);
  const targetOf = e => e ? e.sel : ['all'];

  // ---- события ----
  const R = (name, fn) => { recognized.push(name); fn(); };
  if (has(/нефт/)) R('цена нефти', () => {
    const down = has(/(?<![а-я])(пад|упад|обвал|дешев|снизи|удешев|подешев|рухн|сниж|слом)/) && !has(/сокращ.*добыч/);
    let v = has(/вдвое|в два раза|удвои/) ? 1 : has(/втрое|в три раза|утрои/) ? 2 : pct != null ? pct / 100 : 0.4 * strong;
    effects.push({ kind: 'oil', value: down ? -Math.min(v, 0.7) : v }); dur = dur || 12; title = `Нефть ${down ? '−' : '+'}${Math.round(Math.min(v, down ? 0.7 : 9) * 100)}%`;
  });
  const WAR = /(?<![а-я])(война|войну|войной|вторжен|вторга|напад|атак|удар|воюет|воевать|обстрел|захват)/;
  if (has(WAR) && !has(/торгов[а-я]* войн|гражданск[а-я]* войн|(прекращ|конец|конча|окончан|заверш|без|останов)[а-я]* войн/)) R('война', () => {
    // кто до глагола — нападающие, кто после — цель («Россия с помощью Ирана нападает на Украину»)
    const kw = evText.search(WAR), before = sorted.filter(e => e.pos < kw), after = sorted.filter(e => e.pos > kw);
    const [wa, wb] = proPos < 0 && before.length && after.length ? [group(before), group(after)] : [A, B];
    if (wa && wb && wa !== wb) { effects.push({ kind: 'war', a: wa.sel, b: wb.sel }); dur = duration ?? 0; title = 'Война'; }
    else notes.push('Для войны нужны две стороны (например «Россия нападает на Украину»).');
  });
  if (has(/санкци|эмбарго|изоляц/)) R('санкции', () => {
    const tgt = proPos >= 0 ? B : (sorted.length > 1 ? B : one);
    const src = proPos >= 0 ? A : (sorted.length > 1 ? A : null);
    if (tgt) { effects.push({ kind: 'sanction', from: src ? src.sel : WEST_SANCTIONERS, to: tgt.sel }); dur = dur || 36; title = 'Санкции'; }
    else notes.push('Против кого санкции? Укажите страну или блок.');
  });
  if (has(/пошлин|тариф|торговая война|торговой войн|торговую войну|импортн[а-я]* налог/)) R('пошлины', () => {
    const val = pct ?? 25 * strong;
    const A2 = A, B2 = sorted.length > 1 || proPos >= 0 ? B : null;
    if (!A2 && !B2) { notes.push('Кто вводит пошлины и против кого?'); return; }
    const from = proPos >= 0 && !A2 ? ['all'] : (A2 ? A2.sel : ['all']);
    effects.push({ kind: 'tariff', from, to: B2 ? B2.sel : ['all'], value: Math.round(val) });
    if (has(/торговая война|торговой войн|торговую войну|ответ|взаимн/) && B2 && A2) effects.push({ kind: 'tariff', from: B2.sel, to: A2.sel, value: Math.round(val) });
    dur = dur || 36; title = 'Пошлины';
  });
  const T1 = targetOf(one);
  const shockEvent = (re, name, ttl, eff, d) => { if (has(re)) R(name, () => { eff(); dur = dur || d; title ??= ttl; }); };
  const dir = has(/(?<![а-я])(сниз|сниж|пад|упад|уменьш|замедл|сократ|спад)/) ? -1 : 1;
  const gro = (dflt) => pct != null ? Math.min(pct, 25) : dflt * strong;
  shockEvent(/землетряс|цунами|ураган|наводнен|лесн[а-я]* пожар|стихийн|извержен|катастроф/, 'стихийное бедствие', 'Стихийное бедствие', () => {
    effects.push(sh(T1, 'growth', -gro(4)), sh(T1, 'level', -1.5 * strong), sh(T1, 'stab', -0.03 * strong), sh(T1, 'fiscal', 1.5));
  }, 6);
  shockEvent(/засух|неурожай|голод/, 'засуха', 'Засуха', () => { effects.push(sh(T1, 'growth', -gro(3)), sh(T1, 'infl', 3 * strong), sh(T1, 'stab', -0.04)); }, 12);
  shockEvent(/пандеми|эпидеми|вирус|карантин|локдаун/, 'пандемия', 'Пандемия', () => {
    effects.push(sh(T1, 'growth', -gro(6), { scale: 'urban' }), sh(T1, 'unemp', 3 * strong, { scale: 'urban' }), sh(T1, 'sent', -0.12), sh(T1, 'fiscal', 4), sh(T1, 'level', -1.5, { scale: 'openness' }));
  }, 9);
  shockEvent(/кризис|рецесси|крах|банкротств|схлопыван|лопнул|пузыр/, 'кризис', 'Кризис', () => {
    effects.push(sh(T1, 'growth', -gro(5)), sh(T1, 'unemp', 3 * strong), sh(T1, 'level', -2 * strong), sh(T1, 'stab', -0.05));
    if (has(/долг|финанс|банк/)) effects.push(sh(T1, 'debt', 15));
  }, 18);
  shockEvent(/дефолт/, 'дефолт', 'Дефолт', () => { effects.push(sh(T1, 'growth', -gro(4)), sh(T1, 'infl', 8 * strong), sh(T1, 'stab', -0.12), sh(T1, 'level', -3), sh(T1, 'debt', -15)); }, 12);
  shockEvent(/переворот|революци|мятеж|восстани|гражданск[а-я]* войн|беспорядк|протест/, 'политическая нестабильность', 'Политический кризис', () => {
    effects.push(sh(T1, 'stab', -0.25 * strong), sh(T1, 'sent', -0.2 * strong), sh(T1, 'growth', -gro(3)));
  }, 12);
  shockEvent(/теракт|кибератак|взлом|диверси|саботаж/, 'теракт/кибератака', 'Теракт / кибератака', () => { effects.push(sh(T1, 'growth', -gro(1.2)), sh(T1, 'stab', -0.05 * strong), sh(T1, 'sent', -0.05)); }, 3);
  shockEvent(/забастовк/, 'забастовка', 'Забастовка', () => { effects.push(sh(T1, 'growth', -gro(1.5)), sh(T1, 'infl', 1)); }, 3);
  shockEvent(/гиперинфляц|инфляц|рост цен/, 'инфляция', dir < 0 ? 'Снижение инфляции' : 'Инфляционный шок', () => { effects.push(sh(T1, 'infl', has(/гипер/) ? 15 : dir * (pct ?? 4) * strong), sh(T1, 'sent', -0.05 * dir)); }, 12);
  shockEvent(/безработиц/, 'безработица', dir < 0 ? 'Снижение безработицы' : 'Рост безработицы', () => { effects.push(sh(T1, 'unemp', dir * (pct ?? 3) * strong)); }, 12);
  shockEvent(/военн[а-я]* (расход|бюджет)|вооруж|милитариз|перевооруж/, 'рост армии', 'Милитаризация', () => { effects.push(sh(T1, 'mil', (pct ?? 2) * strong)); }, 36);
  shockEvent(/бум(?![а-я])|подъем|подъём|прорыв|технологическ|искусственн[а-я]* интеллект|стимулир|стимул|реформ|инвестицион[а-я]* (бум|приток)/, 'подъём', 'Экономический подъём', () => {
    effects.push(sh(T1, 'growth', gro(3)), sh(T1, 'level', 2 * strong), sh(T1, 'sent', 0.1), sh(T1, 'stab', 0.03));
  }, 24);
  shockEvent(/помощ|кредит[а-я]* (от|для)|инвестиц[а-я]* в|грант|план маршалла/, 'помощь', 'Помощь', () => {
    const rec = B || one; if (!rec) return;
    effects.push(sh(rec.sel, 'growth', gro(1.5)), sh(rec.sel, 'stab', 0.03)); if (A && B) effects.push({ kind: 'relation', a: A.sel, b: B.sel, value: 0.3 });
  }, 12);
  const PEACE = /(?<![а-я])(объедин|сотруднич|разоруж|мир во всем мире|всеобщ[а-я]* мир|мирн[а-я]* (договор|соглашен|процесс|урегулир)|прекращ[а-я]* (войн|огня|конфликт)|конец войн|без войн|решить[а-я]* (все )?(глобальн[а-я]* )?проблем|глобальн[а-я]* (договор|соглашен|сотрудн)|солидарн)/;
  const peaceHere = has(PEACE) || (/(?<![а-я])мир(?![а-я])/.test(evText) && !sorted.some(e => e.label !== 'мир') && !has(WAR));
  if (peaceHere) R('мир и сотрудничество', () => {
    const grp = sorted.length ? { sel: [...new Set(sorted.flatMap(e => e.sel))] } : { sel: ['all'] };
    const g = grp.sel.length === 1 && grp.sel[0].startsWith('iso:') && !(A && B) ? { sel: ['all'] } : grp;   // одна страна «объединилась» — со всеми
    effects.push({ kind: 'peace', a: g.sel }, sh(g.sel, 'growth', gro(1)), sh(g.sel, 'stab', 0.06 * strong), sh(g.sel, 'sent', 0.08 * strong));
    if (has(/разоруж|сократ[а-я]* (арми|вооруж|военн)/)) effects.push(sh(g.sel, 'mil', -1));
    dur = dur || 60; title ??= g.sel.includes('all') ? 'Глобальный мир и сотрудничество' : 'Мирное соглашение';
  });
  if (!peaceHere && has(/(?<![а-я])(союз|сближен|примирен|перемири|дружб|мирн[а-я]* договор|нормализац|альянс)/)) R('сближение', () => {
    if (A && B) { effects.push({ kind: 'relation', a: A.sel, b: B.sel, value: +(0.5 * strong).toFixed(2) }); dur = dur || 1; title ??= 'Сближение'; } else notes.push('Сближение: нужны две стороны.');
  });
  if (has(/(?<![а-я])(ссор|конфликт|напряжен|разрыв|враждеб|эскалац|дипломатическ[а-я]* (скандал|кризис))/) && !has(/(?<![а-я])(война|вторжен|напад|атак)/)) R('ухудшение отношений', () => {
    if (A && B) { effects.push({ kind: 'relation', a: A.sel, b: B.sel, value: -0.5 * strong }); dur = dur || 1; title ??= 'Обострение'; } else notes.push('Обострение: нужны две стороны.');
  });

  if (!effects.length) return { ok: false, notes: [...notes, 'Не смогла распознать событие. Упомяните страны/блоки и тип события: война, санкции, пошлины, нефть, землетрясение, кризис, пандемия, переворот, бум, помощь, сближение…'], entities: labels };
  const finalDur = duration ?? dur;
  // нефть/шок на «всех», если сущностей нет, — уже учтено (T1 = all)
  return { ok: true, title: (title || 'Событие') + (labels.length ? ': ' + labels.slice(0, 3).join(', ') : ''), duration: finalDur, delay, effects, notes, recognized, entities: labels };
}

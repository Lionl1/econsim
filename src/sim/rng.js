// Счётчиковый ГСЧ: одинаковые (seed, страна, тик, слот) -> одинаковое число.
// Благодаря этому основной и «базовый» прогоны получают одни и те же случайные шоки,
// и разница между ними отражает только сценарий.
export function hash(a, b, c, d) {
  let h = 2166136261 ^ a;
  h = Math.imul(h ^ b, 16777619);
  h = Math.imul(h ^ c, 2246822519);
  h = Math.imul(h ^ d, 3266489917);
  h ^= h >>> 15; h = Math.imul(h, 2246822507);
  h ^= h >>> 13; h = Math.imul(h, 3266489917);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}
export function gauss(a, b, c, d) {
  const u1 = Math.max(1e-9, hash(a, b, c, d));
  const u2 = hash(a, b, c, d + 7919);
  return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
}

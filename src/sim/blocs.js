// Блоки, союзы, ядерные державы и соперничества (по данным Wikipedia; упрощённо).
export const BLOCS = {
  NATO: 'ALB BEL BGR CAN HRV CZE DNK EST FIN FRA DEU GRC HUN ISL ITA LVA LTU LUX MNE NLD MKD NOR POL PRT ROU SVK SVN ESP SWE TUR GBR USA'.split(' '),
  EU: 'AUT BEL BGR HRV CYP CZE DNK EST FIN FRA DEU GRC HUN IRL ITA LVA LTU LUX MLT NLD POL PRT ROU SVK SVN ESP SWE'.split(' '),
  BRICS: 'BRA RUS IND CHN ZAF EGY ETH IRN ARE IDN'.split(' '),
  ASEAN: 'BRN KHM IDN LAO MYS MMR PHL SGP THA VNM TLS'.split(' '),
  SCO: 'CHN RUS KAZ KGZ TJK UZB IND PAK IRN BLR'.split(' '),
  OPEC: 'SAU IRN IRQ KWT ARE VEN NGA LBY DZA GAB GNQ COG RUS'.split(' '),
  G7: 'USA JPN DEU GBR FRA ITA CAN'.split(' '),
  G20: 'ARG AUS BRA CAN CHN FRA DEU IND IDN ITA JPN KOR MEX RUS SAU ZAF TUR GBR USA'.split(' '),
  CSTO: 'RUS BLR ARM KAZ KGZ TJK'.split(' '),
};
export const BLOC_NAMES = { NATO: 'НАТО', EU: 'ЕС', BRICS: 'БРИКС', ASEAN: 'АСЕАН', SCO: 'ШОС', OPEC: 'ОПЕК+', G7: 'G7', G20: 'G20', CSTO: 'ОДКБ' };
// блоки с обязательствами взаимной обороны
export const DEFENSE_BLOCS = ['NATO', 'CSTO'];
export const NUCLEAR = new Set('USA RUS CHN FRA GBR IND PAK ISR PRK'.split(' '));
// двусторонние союзы: [a, b]
export const ALLIES = [
  ['USA', 'JPN'], ['USA', 'KOR'], ['USA', 'PHL'], ['USA', 'AUS'], ['USA', 'ISR'], ['USA', 'SAU'],
  ['RUS', 'BLR'], ['CHN', 'PRK'], ['CHN', 'PAK'], ['RUS', 'IRN'], ['RUS', 'SYR'], ['GBR', 'AUS'], ['FRA', 'MAR'],
];
// соперничества: [a, b, базовые отношения]
export const RIVALRIES = [
  ['USA', 'RUS', -0.5], ['USA', 'CHN', -0.35], ['USA', 'IRN', -0.8], ['USA', 'PRK', -0.9], ['RUS', 'UKR', -0.9],
  ['IND', 'PAK', -0.75], ['ISR', 'IRN', -0.9], ['CHN', 'TWN', -0.75], ['CHN', 'IND', -0.4], ['KOR', 'PRK', -0.85],
  ['JPN', 'PRK', -0.7], ['ARM', 'AZE', -0.65], ['ETH', 'ERI', -0.4], ['SAU', 'IRN', -0.55], ['GRC', 'TUR', -0.35],
  ['MAR', 'DZA', -0.5], ['CHN', 'JPN', -0.35], ['CHN', 'PHL', -0.4], ['CHN', 'VNM', -0.3], ['RUS', 'POL', -0.55],
  ['RUS', 'EST', -0.5], ['RUS', 'LVA', -0.5], ['RUS', 'LTU', -0.5], ['RUS', 'FIN', -0.4], ['RUS', 'GEO', -0.5],
  ['ISR', 'LBN', -0.6], ['ISR', 'SYR', -0.6], ['ISR', 'PSE', -0.8], ['SDN', 'SSD', -0.4], ['RWA', 'COD', -0.5],
  ['EGY', 'ETH', -0.35], ['AFG', 'PAK', -0.45], ['VEN', 'GUY', -0.45], ['KOR', 'JPN', -0.15], ['IND', 'BGD', -0.1],
  ['RUS', 'GBR', -0.5], ['RUS', 'DEU', -0.35], ['RUS', 'FRA', -0.35], ['RUS', 'USA', -0.5], ['TUR', 'CYP', -0.3],
];
// противостояние НАТО и «восточного блока»
export const NATO_ADVERSARIES = ['RUS', 'BLR', 'IRN', 'PRK'];

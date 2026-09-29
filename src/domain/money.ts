/**
 * Montants.
 *
 * Tout montant circule en **centimes entiers**. Les flottants binaires ne représentent
 * pas exactement 0,10 € : additionner des loyers en flottants dérive, et une dérive
 * invisible dans une liste devient visible dans un total annuel.
 *
 * Le formatage est écrit à la main plutôt que confié à `Intl` : le rendu doit être
 * identique dans Hermes (sur l'appareil) et dans Node (dans les tests). `Intl` dépend
 * des données de locale embarquées, qui ne sont pas les mêmes des deux côtés.
 */

export type Cents = number;

/** Espace fine insécable, séparateur de milliers en français. */
const THIN_SPACE = '\u202F';

export function eurosToCents(euros: number): Cents {
  return Math.round(euros * 100);
}

export function centsToEuros(cents: Cents): number {
  return cents / 100;
}

/**
 * Lit un montant saisi et rend des centimes entiers, ou `null` si la saisie n'est pas un
 * nombre.
 *
 * ## Pourquoi ne pas passer par `Number` puis multiplier
 *
 * `Number('1,005')` n'existe pas, et surtout `Number('1.005') * 100` vaut `100.49999…` :
 * arrondi, cela donne **100 centimes** au lieu de 101. Un centime perdu à la saisie se
 * retrouve dans un total annuel, et il est alors introuvable. On sépare donc la partie
 * entière de la partie décimale **sur le texte**, et on compose les centimes en entiers.
 *
 * Accepte la virgule comme le point, les espaces de groupement, et le signe « € ». Une
 * saisie vide, un simple signe ou une suite de lettres rendent `null` — jamais zéro, qui
 * serait un montant valide et donc indiscernable d'une absence.
 */
export function parseMoneyToCents(text: string): Cents | null {
  const cleaned = text
    .replace(/[\s\u00A0\u202F]/g, '')
    .replace(/€/g, '')
    .replace(',', '.');

  const match = /^(-?)(\d*)(?:\.(\d*))?$/.exec(cleaned);
  if (match === null) return null;

  const sign = match[1] === '-' ? -1 : 1;
  const whole = match[2] ?? '';
  const decimals = match[3] ?? '';
  if (whole === '' && decimals === '') return null;

  // Au-delà de deux décimales, on tronque plutôt que d'arrondir : sur une saisie, la
  // troisième décimale est une faute de frappe, et l'arrondi ferait apparaître un montant
  // que l'utilisateur n'a pas écrit.
  const cents = decimals.slice(0, 2).padEnd(2, '0');
  const value = Number(whole === '' ? '0' : whole) * 100 + Number(cents);
  return sign * value;
}

/** Lit un entier saisi (kilomètres, mois, jours). `null` si la saisie n'est pas un entier. */
export function parseInteger(text: string): number | null {
  const cleaned = text.replace(/[\s\u00A0\u202F]/g, '').replace(',', '.');
  if (!/^-?\d+(?:\.\d+)?$/.test(cleaned)) return null;
  const value = Number(cleaned);
  return Number.isFinite(value) ? Math.round(value) : null;
}

function groupThousands(digits: string): string {
  return digits.replace(/\B(?=(\d{3})+(?!\d))/g, THIN_SPACE);
}

/** « 1 234,56 € ». `signed` préfixe les montants positifs d'un « + ». */
export function formatMoney(cents: Cents, options: { currency?: string; signed?: boolean } = {}): string {
  const currency = options.currency ?? '€';
  const negative = cents < 0;
  const absolute = Math.abs(Math.round(cents));
  const units = Math.floor(absolute / 100);
  const decimals = absolute % 100;
  const body = `${groupThousands(String(units))},${String(decimals).padStart(2, '0')}`;
  const sign = negative ? '−' : options.signed ? '+' : '';
  return `${sign}${body}${THIN_SPACE}${currency}`;
}

/** Sans décimales : utile pour les grands totaux et les tuiles du tableau de bord. */
export function formatMoneyRounded(cents: Cents, options: { currency?: string; signed?: boolean } = {}): string {
  const currency = options.currency ?? '€';
  const negative = cents < 0;
  const absolute = Math.abs(Math.round(cents));
  const rounded = Math.round(absolute / 100);
  const sign = negative ? '−' : options.signed ? '+' : '';
  return `${sign}${groupThousands(String(rounded))}${THIN_SPACE}${currency}`;
}

/** « 15,3 k€ » au-delà de 10 000 € — pour les graphiques et les tuiles compactes. */
export function formatMoneyCompact(cents: Cents, options: { currency?: string } = {}): string {
  const currency = options.currency ?? '€';
  const euros = Math.abs(cents) / 100;
  const sign = cents < 0 ? '−' : '';
  if (euros >= 1_000_000) return `${sign}${(euros / 1_000_000).toFixed(1).replace('.', ',')}${THIN_SPACE}M${currency}`;
  if (euros >= 10_000) return `${sign}${(euros / 1000).toFixed(1).replace('.', ',')}${THIN_SPACE}k${currency}`;
  return `${sign}${groupThousands(String(Math.round(euros)))}${THIN_SPACE}${currency}`;
}

/** « 51,6 % ». `digits` fixe le nombre de décimales. */
export function formatPercent(value: number, digits = 1): string {
  return `${value.toFixed(digits).replace('.', ',')}${THIN_SPACE}%`;
}

/** « 121 850 km ». */
export function formatKm(km: number): string {
  return `${groupThousands(String(Math.round(km)))}${THIN_SPACE}km`;
}

/**
 * « 125 400 » — entier groupé à la française, sans unité.
 *
 * Écrit ici plutôt que laissé à `toLocaleString` : le séparateur de milliers dépend des
 * données de locale embarquées, qui diffèrent entre Hermes (sur l'appareil) et Node (dans
 * les tests). Un libellé qui change de caractère selon l'environnement fait échouer un
 * test pour une raison qui ne parle pas du sujet.
 */
export function formatNumberFr(value: number): string {
  const rounded = Math.round(value);
  const sign = rounded < 0 ? '−' : '';
  return `${sign}${groupThousands(String(Math.abs(rounded)))}`;
}

/**
 * Part d'un montant, en pourcentage. Renvoie `null` quand le dénominateur est nul :
 * « récupéré à 0 % » et « on ne sait pas » ne veulent pas dire la même chose.
 */
export function ratioPercent(part: number, whole: number): number | null {
  if (whole === 0) return null;
  return (part / whole) * 100;
}

export function sumCents(values: readonly Cents[]): Cents {
  let total = 0;
  for (const value of values) total += Math.round(value);
  return total;
}

/** Répartit un montant en `count` parts égales ; le reste est ajouté à la dernière part. */
export function splitEvenly(total: Cents, count: number): Cents[] {
  if (count <= 0) return [];
  const base = Math.floor(total / count);
  const parts = new Array<Cents>(count).fill(base);
  parts[count - 1] = base + (total - base * count);
  return parts;
}

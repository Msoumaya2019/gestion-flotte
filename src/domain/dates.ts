/**
 * Arithmétique des dates métier.
 *
 * Une date métier est un **jour**, écrit « AAAA-MM-JJ ». On ne construit jamais un `Date`
 * depuis cette chaîne avec `new Date(chaine)` : le moteur y lit minuit **UTC**, ce qui
 * décale d'un jour dès que le fuseau local est en retard sur UTC. On découpe donc la
 * chaîne et on construit une date **locale**.
 *
 * Toutes les fonctions sont pures ; celles qui ont besoin de « maintenant » reçoivent
 * l'instant en paramètre, pour rester vérifiables à toute heure de la journée.
 */

export type IsoDate = string;

const DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

export function isIsoDate(value: string): boolean {
  const parts = DATE_PATTERN.exec(value);
  if (parts === null) return false;
  const [, y, m, d] = parts;
  const year = Number(y);
  const month = Number(m);
  const day = Number(d);
  if (month < 1 || month > 12 || day < 1) return false;
  return day <= daysInMonth(year, month);
}

/**
 * Lit une date saisie à la main et rend sa forme canonique « AAAA-MM-JJ », ou `null`.
 *
 * Trois écritures sont acceptées, parce que ce sont les trois qu'on tape réellement sur un
 * clavier de téléphone : `28/09/2026`, `28-09-2026`, `2026-09-28`. Une date
 * **inexistante** — 31 février, 45/13/2026 — rend `null` au lieu d'être reportée au mois
 * suivant par le moteur de dates, ce qui produirait une échéance silencieusement fausse.
 *
 * L'année sur deux chiffres est refusée : « 26 » peut vouloir dire 1926 ou 2026, et un
 * contrat de location porte sur des dates proches — mieux vaut une saisie à refaire qu'une
 * date interprétée.
 */
export function parseDateInput(text: string): IsoDate | null {
  const cleaned = text.trim().replace(/[\s\u00A0\u202F]/g, '');
  if (cleaned === '') return null;

  // Forme ISO d'abord : c'est celle que produit l'application elle-même.
  if (isIsoDate(cleaned)) return cleaned;

  const french = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/.exec(cleaned);
  if (french === null) return null;

  const day = Number(french[1]);
  const month = Number(french[2]);
  const year = Number(french[3]);
  if (month < 1 || month > 12 || day < 1 || day > daysInMonth(year, month)) return null;

  return fromParts(year, month, day);
}

function parts(iso: IsoDate): { year: number; month: number; day: number } {
  const match = DATE_PATTERN.exec(iso);
  if (match === null) {
    throw new Error(`Date invalide : « ${iso} » (attendu AAAA-MM-JJ)`);
  }
  return { year: Number(match[1]), month: Number(match[2]), day: Number(match[3]) };
}

export function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

export function daysInMonth(year: number, month: number): number {
  const lengths = [31, isLeapYear(year) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return lengths[month - 1] ?? 31;
}

function pad(value: number, width = 2): string {
  return String(value).padStart(width, '0');
}

export function toIsoDate(date: Date): IsoDate {
  return `${pad(date.getFullYear(), 4)}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** Construit une date **locale** à minuit, sans passer par l'interprétation UTC. */
export function toLocalDate(iso: IsoDate): Date {
  const { year, month, day } = parts(iso);
  return new Date(year, month - 1, day);
}

export function todayIso(now: Date = new Date()): IsoDate {
  return toIsoDate(now);
}

/** Instant courant au format ISO 8601 complet (UTC) — pour les horodatages. */
export function nowIso(now: Date = new Date()): string {
  return now.toISOString();
}

export function fromParts(year: number, month: number, day: number): IsoDate {
  return `${pad(year, 4)}-${pad(month)}-${pad(day)}`;
}

export function addDays(iso: IsoDate, days: number): IsoDate {
  const { year, month, day } = parts(iso);
  const date = new Date(year, month - 1, day + days);
  return toIsoDate(date);
}

/** Ajoute des mois en ramenant le jour au dernier jour du mois cible (31 janvier + 1 mois → 28/29 février). */
export function addMonths(iso: IsoDate, months: number): IsoDate {
  const { year, month, day } = parts(iso);
  const total = (year * 12 + (month - 1)) + months;
  const targetYear = Math.floor(total / 12);
  const targetMonth = (total % 12 + 12) % 12 + 1;
  const targetDay = Math.min(day, daysInMonth(targetYear, targetMonth));
  return fromParts(targetYear, targetMonth, targetDay);
}

/** Nombre de jours entiers de `from` à `to` (négatif si `to` précède `from`). */
export function daysBetween(from: IsoDate, to: IsoDate): number {
  const a = toLocalDate(from).getTime();
  const b = toLocalDate(to).getTime();
  return Math.round((b - a) / 86_400_000);
}

export function compareIso(a: IsoDate, b: IsoDate): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

export function isBefore(a: IsoDate, b: IsoDate): boolean {
  return a < b;
}

export function isAfter(a: IsoDate, b: IsoDate): boolean {
  return a > b;
}

export function isSameOrBefore(a: IsoDate, b: IsoDate): boolean {
  return a <= b;
}

/** Jour de la semaine au sens ISO : 1 = lundi … 7 = dimanche. */
export function isoWeekday(iso: IsoDate): number {
  const jsDay = toLocalDate(iso).getDay();
  return jsDay === 0 ? 7 : jsDay;
}

export function startOfMonth(iso: IsoDate): IsoDate {
  const { year, month } = parts(iso);
  return fromParts(year, month, 1);
}

export function endOfMonth(iso: IsoDate): IsoDate {
  const { year, month } = parts(iso);
  return fromParts(year, month, daysInMonth(year, month));
}

export function startOfYear(iso: IsoDate): IsoDate {
  const { year } = parts(iso);
  return fromParts(year, 1, 1);
}

export function endOfYear(iso: IsoDate): IsoDate {
  const { year } = parts(iso);
  return fromParts(year, 12, 31);
}

/** « AAAA-MM » — clé de regroupement mensuel. */
export function monthKey(iso: IsoDate): string {
  return iso.slice(0, 7);
}

export function isSameMonth(a: IsoDate, b: IsoDate): boolean {
  return monthKey(a) === monthKey(b);
}

/** Premier jour du mois précédent. */
export function previousMonth(iso: IsoDate): IsoDate {
  return addMonths(startOfMonth(iso), -1);
}

/** Liste des premiers jours des `count` derniers mois, du plus ancien au plus récent. */
export function lastMonths(endIso: IsoDate, count: number): IsoDate[] {
  const last = startOfMonth(endIso);
  const months: IsoDate[] = [];
  for (let i = count - 1; i >= 0; i -= 1) {
    months.push(addMonths(last, -i));
  }
  return months;
}

const MONTHS_FR = [
  'janvier',
  'février',
  'mars',
  'avril',
  'mai',
  'juin',
  'juillet',
  'août',
  'septembre',
  'octobre',
  'novembre',
  'décembre',
];

const WEEKDAYS_FR = ['lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi', 'dimanche'];

export function monthLabelFr(iso: IsoDate): string {
  const { year, month } = parts(iso);
  return `${MONTHS_FR[month - 1]} ${year}`;
}

export function monthShortLabelFr(iso: IsoDate): string {
  const { month } = parts(iso);
  return (MONTHS_FR[month - 1] ?? '').slice(0, 4);
}

export function weekdayLabelFr(weekday: number): string {
  return WEEKDAYS_FR[((weekday - 1) % 7 + 7) % 7] ?? '';
}

/** « 05/10/2026 ». */
export function formatFr(iso: IsoDate): string {
  const { year, month, day } = parts(iso);
  return `${pad(day)}/${pad(month)}/${pad(year, 4)}`;
}

/** « 5 octobre 2026 ». */
export function formatLongFr(iso: IsoDate): string {
  const { year, month, day } = parts(iso);
  return `${day} ${MONTHS_FR[month - 1]} ${year}`;
}

/** « 05/10/2026 à 14:32 » à partir d'un horodatage complet. */
export function formatDateTimeFr(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return `${pad(date.getDate())}/${pad(date.getMonth() + 1)}/${date.getFullYear()} à ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/**
 * Traduit un écart en jours en phrase lisible.
 * `days > 0` : à venir. `days === 0` : aujourd'hui. `days < 0` : dépassé.
 */
export function relativeDaysLabel(days: number): string {
  if (days === 0) return "aujourd'hui";
  if (days === 1) return 'demain';
  if (days === -1) return 'hier';
  if (days > 0) return `dans ${days} jours`;
  return `il y a ${Math.abs(days)} jours`;
}

/** Nombre de jours dans une durée exprimée en mois, à partir d'une date de départ. */
export function daysForMonths(from: IsoDate, months: number): number {
  return daysBetween(from, addMonths(from, months));
}

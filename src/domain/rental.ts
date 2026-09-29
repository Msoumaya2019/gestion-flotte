/**
 * Locations : échéancier, statuts d'échéance, soldes, kilométrage.
 *
 * Deux règles structurantes :
 *
 * 1. **La fréquence de loyer est libre.** Un loyer n'est pas mensuel par nature. On
 *    engendre les échéances depuis une fréquence (7, 14, `intervalDays`, ou mensuelle)
 *    et un jour d'ancrage.
 * 2. **L'échéancier se calcule depuis l'ancre, jamais depuis l'échéance précédente.**
 *    Additionner un mois à une date déjà ramenée au dernier jour du mois dérive : partir
 *    du 31 janvier donnerait 28 février, puis 28 mars. En repartant toujours de l'ancre,
 *    on obtient 31 janvier, 28 février, 31 mars — le comportement attendu.
 */

import {
  addDays,
  addMonths,
  compareIso,
  daysBetween,
  daysInMonth,
  fromParts,
  isoWeekday,
  weekdayLabelFr,
} from './dates';
import type { Cents, IsoDate, Payment, PaymentFrequency, PaymentStatus, Rental, RentalStatus } from './types';

export interface ScheduleInput {
  startDate: IsoDate;
  endDate: IsoDate | null;
  openEnded: boolean;
  frequency: PaymentFrequency;
  /** Renseigné quand `frequency === 'personnalisee'`. */
  intervalDays: number | null;
  /** 1 = lundi … 7 = dimanche, pour les fréquences hebdomadaires. */
  dueWeekday: number | null;
  /** Jour du mois (1–31) pour la fréquence mensuelle. */
  dueDayOfMonth: number | null;
  /** Borne haute quand la location n'a pas de date de fin. */
  until?: IsoDate | null;
  /** Garde-fou : au-delà, on considère que la saisie est aberrante. */
  maxOccurrences?: number;
}

/** Pas en jours, ou `null` pour un pas mensuel. */
export function stepDays(frequency: PaymentFrequency, intervalDays: number | null): number | null {
  switch (frequency) {
    case 'hebdomadaire':
      return 7;
    case 'bimensuel':
      return 14;
    case 'personnalisee':
      return intervalDays !== null && intervalDays > 0 ? Math.round(intervalDays) : null;
    case 'mensuel':
      return null;
  }
}

/** Premier jour portant ce jour de la semaine, à partir de `iso` inclus. */
export function firstWeekdayOnOrAfter(iso: IsoDate, weekday: number): IsoDate {
  const delta = ((weekday - isoWeekday(iso)) % 7 + 7) % 7;
  return addDays(iso, delta);
}

/** Premier jour du mois portant ce quantième, à partir de `iso` inclus (ramené au dernier jour si trop grand). */
export function firstDayOfMonthOnOrAfter(iso: IsoDate, day: number): IsoDate {
  const year = Number(iso.slice(0, 4));
  const month = Number(iso.slice(5, 7));
  const current = Number(iso.slice(8, 10));
  const clamped = Math.min(day, daysInMonth(year, month));
  if (clamped >= current) return fromParts(year, month, clamped);
  const next = addMonths(iso, 1);
  const nextYear = Number(next.slice(0, 4));
  const nextMonth = Number(next.slice(5, 7));
  return fromParts(nextYear, nextMonth, Math.min(day, daysInMonth(nextYear, nextMonth)));
}

/**
 * Dates d'échéance d'une location.
 *
 * Le jour d'ancrage prime sur la date de début : une location démarrée un mercredi avec
 * une échéance « tous les lundis » voit sa première échéance le lundi suivant. Sans jour
 * d'ancrage, la première échéance tombe le jour du début.
 */
export function scheduleDueDates(input: ScheduleInput): IsoDate[] {
  const limit = input.endDate ?? input.until ?? addMonths(input.startDate, 12);
  if (compareIso(limit, input.startDate) < 0) return [];

  const step = stepDays(input.frequency, input.intervalDays);
  let anchor: IsoDate;
  if (step !== null) {
    anchor = input.dueWeekday === null ? input.startDate : firstWeekdayOnOrAfter(input.startDate, input.dueWeekday);
  } else {
    anchor =
      input.dueDayOfMonth === null ? input.startDate : firstDayOfMonthOnOrAfter(input.startDate, input.dueDayOfMonth);
  }

  const max = input.maxOccurrences ?? 520;
  const dates: IsoDate[] = [];
  for (let index = 0; index < max; index += 1) {
    const date = step !== null ? addDays(anchor, step * index) : addMonths(anchor, index);
    if (compareIso(date, limit) > 0) break;
    dates.push(date);
  }
  return dates;
}

/** Date de fin d'engagement d'une location sans terme : 12 mois après le début. */
export function openEndedHorizon(startDate: IsoDate, months = 12): IsoDate {
  return addMonths(startDate, months);
}

export interface PaymentBalance {
  /** Reste à payer sur cette échéance. */
  remainingCents: Cents;
  /** Trop-perçu éventuel. */
  overpaidCents: Cents;
  settled: boolean;
}

export function paymentBalance(payment: Pick<Payment, 'expectedCents' | 'receivedCents'>): PaymentBalance {
  const remaining = Math.max(0, Math.round(payment.expectedCents) - Math.round(payment.receivedCents));
  const overpaid = Math.max(0, Math.round(payment.receivedCents) - Math.round(payment.expectedCents));
  return { remainingCents: remaining, overpaidCents: overpaid, settled: remaining === 0 };
}

/**
 * Statut réellement affiché.
 *
 * Le statut stocké ne porte que les décisions humaines — « annulé », « impayé ». Tout le
 * reste se déduit des montants et de la date : stocker « en retard » obligerait à
 * réécrire la base chaque nuit pour que l'affichage reste juste.
 */
export function effectivePaymentStatus(
  payment: Pick<Payment, 'expectedCents' | 'receivedCents' | 'dueDate' | 'status'>,
  today: IsoDate,
): PaymentStatus {
  if (payment.status === 'annule') return 'annule';
  if (payment.status === 'impaye') return 'impaye';

  const { settled } = paymentBalance(payment);
  if (settled) return 'paye';

  const late = compareIso(payment.dueDate, today) < 0;
  const partial = payment.receivedCents > 0;
  if (late) return 'retard';
  return partial ? 'partiel' : 'a_venir';
}

export interface RentalTotals {
  /** Somme facturée sur les échéances échues (hors annulées). */
  dueCents: Cents;
  /** Somme facturée sur l'ensemble des échéances actives. */
  expectedCents: Cents;
  receivedCents: Cents;
  /** Reste dû sur les échéances déjà échues : c'est le chiffre qui compte pour relancer. */
  lateCents: Cents;
  lateCount: number;
  paidCount: number;
  partialCount: number;
}

export function rentalPaymentTotals(
  payments: readonly Pick<Payment, 'expectedCents' | 'receivedCents' | 'dueDate' | 'status'>[],
  today: IsoDate,
): RentalTotals {
  let due = 0;
  let expected = 0;
  let received = 0;
  let late = 0;
  let lateCount = 0;
  let paidCount = 0;
  let partialCount = 0;

  for (const payment of payments) {
    if (payment.status === 'annule') continue;
    const status = effectivePaymentStatus(payment, today);
    expected += Math.round(payment.expectedCents);
    received += Math.round(payment.receivedCents);
    if (compareIso(payment.dueDate, today) <= 0) due += Math.round(payment.expectedCents);
    if (status === 'retard') {
      late += paymentBalance(payment).remainingCents;
      lateCount += 1;
    } else if (status === 'paye') {
      paidCount += 1;
    } else if (status === 'partiel') {
      partialCount += 1;
    }
  }

  return {
    dueCents: due,
    expectedCents: expected,
    receivedCents: received,
    lateCents: late,
    lateCount,
    paidCount,
    partialCount,
  };
}

/** Première échéance non soldée, dans l'ordre chronologique. */
export function nextUnsettledPayment<T extends Pick<Payment, 'expectedCents' | 'receivedCents' | 'dueDate' | 'status'>>(
  payments: readonly T[],
  today: IsoDate,
): T | null {
  const candidates = payments
    .filter((payment) => effectivePaymentStatus(payment, today) !== 'paye' && payment.status !== 'annule')
    .sort((a, b) => compareIso(a.dueDate, b.dueDate));
  return candidates[0] ?? null;
}

export function rentalDurationDays(rental: Pick<Rental, 'startDate' | 'endDate'>, today: IsoDate): number {
  const end = rental.endDate ?? today;
  return Math.max(0, daysBetween(rental.startDate, end));
}

export interface RentalKmUsage {
  startKm: number;
  currentKm: number;
  drivenKm: number;
  allowedKm: number | null;
  remainingKm: number | null;
  exceededKm: number;
  /** Montant du dépassement facturable, en centimes. */
  excessCostCents: Cents;
  percentUsed: number | null;
}

export function rentalKmUsage(
  rental: Pick<Rental, 'startMileageKm' | 'allowedKm' | 'excessKmPriceCents'>,
  currentKm: number,
): RentalKmUsage {
  const driven = Math.max(0, currentKm - rental.startMileageKm);
  const allowed = rental.allowedKm;
  const exceeded = allowed === null ? 0 : Math.max(0, driven - allowed);
  return {
    startKm: rental.startMileageKm,
    currentKm,
    drivenKm: driven,
    allowedKm: allowed,
    remainingKm: allowed === null ? null : Math.max(0, allowed - driven),
    exceededKm: exceeded,
    excessCostCents: exceeded * Math.round(rental.excessKmPriceCents),
    percentUsed: allowed === null || allowed === 0 ? null : (driven / allowed) * 100,
  };
}

/** Une location est active tant qu'elle est marquée active et non terminée. */
export function isRentalRunning(rental: Pick<Rental, 'status'>, today: IsoDate): boolean {
  void today;
  return rental.status === 'active';
}

/** Statuts de véhicule induits par une location qui démarre ou s'achève. */
export function vehicleStatusForRentalStatus(status: RentalStatus): 'loue' | 'disponible' | null {
  switch (status) {
    case 'active':
      return 'loue';
    case 'terminee':
    case 'annulee':
    case 'prevue':
      return 'disponible';
  }
}

/**
 * Jour d'échéance écrit en toutes lettres : « chaque lundi », « le 5 de chaque mois »,
 * « tous les 7 jours ».
 *
 * Cette phrase part dans le contrat, où elle a une portée : elle doit correspondre
 * exactement à l'échéancier engendré par `scheduleDueDates`. Les deux lisent les mêmes
 * champs, mais c'est un test qui garantit qu'elles restent d'accord — sans quoi un contrat
 * pourrait annoncer un lundi que l'échéancier placerait le mardi.
 */
export function scheduleLabel(
  rental: Pick<Rental, 'frequency' | 'intervalDays' | 'dueWeekday' | 'dueDayOfMonth'>,
): string {
  switch (rental.frequency) {
    case 'hebdomadaire':
      return rental.dueWeekday === null ? 'chaque semaine' : `chaque ${weekdayLabelFr(rental.dueWeekday)}`;
    case 'bimensuel':
      return rental.dueWeekday === null
        ? 'toutes les deux semaines'
        : `un ${weekdayLabelFr(rental.dueWeekday)} sur deux`;
    case 'mensuel':
      return rental.dueDayOfMonth === null ? 'chaque mois' : `le ${rental.dueDayOfMonth} de chaque mois`;
    case 'personnalisee':
      return rental.intervalDays === null
        ? 'à intervalle libre'
        : `tous les ${Math.round(rental.intervalDays)} jours`;
  }
}

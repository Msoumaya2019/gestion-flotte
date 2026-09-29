/**
 * Agrégations du tableau de bord et des bilans.
 *
 * Un seul point d'entrée, `computeDashboard`, alimente l'écran d'accueil : il reçoit les
 * listes brutes et la fenêtre de temps choisie, et rend tous les indicateurs affichés.
 * Les écrans n'additionnent jamais eux-mêmes : un total calculé à deux endroits finit
 * toujours par diverger de l'autre.
 */

import {
  compareIso,
  endOfMonth,
  endOfYear,
  lastMonths,
  monthKey,
  previousMonth,
  startOfMonth,
  startOfYear,
} from './dates';
import { monthlySeries, type MonthlyPoint } from './finance';
import { ratioPercent, sumCents } from './money';
import { effectivePaymentStatus, paymentBalance } from './rental';
import type { Cents, Expense, IsoDate, Payment, Rental, Vehicle } from './types';

export const PERIOD_FILTERS = ['ce_mois', 'mois_precedent', 'cette_annee', 'depuis_debut', 'personnalise'] as const;
export type PeriodFilter = (typeof PERIOD_FILTERS)[number];

export interface PeriodRange {
  from: IsoDate | null;
  to: IsoDate | null;
  label: string;
  /** Clé de regroupement, ou `null` quand la période n'est pas un mois unique. */
  month: string | null;
}

export function periodRange(filter: PeriodFilter, today: IsoDate, custom?: { from: IsoDate; to: IsoDate }): PeriodRange {
  switch (filter) {
    case 'ce_mois':
      return { from: startOfMonth(today), to: endOfMonth(today), label: 'Ce mois', month: monthKey(today) };
    case 'mois_precedent': {
      const previous = previousMonth(today);
      return { from: startOfMonth(previous), to: endOfMonth(previous), label: 'Mois précédent', month: monthKey(previous) };
    }
    case 'cette_annee':
      return { from: startOfYear(today), to: endOfYear(today), label: 'Cette année', month: null };
    case 'depuis_debut':
      return { from: null, to: null, label: 'Depuis le début', month: null };
    case 'personnalise':
      return {
        from: custom?.from ?? null,
        to: custom?.to ?? null,
        label: 'Période choisie',
        month: null,
      };
  }
}

export function inRange(date: IsoDate, range: PeriodRange): boolean {
  if (range.from !== null && compareIso(date, range.from) < 0) return false;
  if (range.to !== null && compareIso(date, range.to) > 0) return false;
  return true;
}

export interface VehicleRankingEntry {
  vehicleId: string;
  label: string;
  plate: string;
  revenueCents: Cents;
  expenseCents: Cents;
  netCents: Cents;
  investmentCents: Cents;
  recoveredPercent: number | null;
}

export interface DashboardMetrics {
  range: PeriodRange;
  /** Revenus encaissés sur la période (argent réellement reçu). */
  revenueCents: Cents;
  /** Revenus facturés sur la période. */
  billedCents: Cents;
  expenseCents: Cents;
  netCents: Cents;
  /** Reste dû sur des échéances non encore échues. */
  pendingRentCents: Cents;
  /** Reste dû sur des échéances échues. */
  lateRentCents: Cents;
  lateCount: number;
  rentedVehicles: number;
  availableVehicles: number;
  totalVehicles: number;
  maintenanceVehicles: number;
  fleetRevenueCents: Cents;
  fleetExpenseCents: Cents;
  fleetNetCents: Cents;
  fleetInvestmentCents: Cents;
  fleetRecoveredCents: Cents;
  fleetRecoveredPercent: number | null;
  /** Série mensuelle sur 12 mois glissants, pour les graphiques. */
  monthly: MonthlyPoint[];
  ranking: VehicleRankingEntry[];
}

export interface DashboardInput {
  vehicles: readonly Vehicle[];
  rentals: readonly Rental[];
  payments: readonly Payment[];
  expenses: readonly Expense[];
  today: IsoDate;
  range: PeriodRange;
  /** Restreint l'ensemble du tableau de bord à un véhicule. `null` = toute la flotte. */
  vehicleId: string | null;
  /** Nombre de mois affichés dans la série glissante. */
  seriesMonths?: number;
}

function selectVehicle<T extends { vehicleId: string }>(items: readonly T[], vehicleId: string | null): readonly T[] {
  return vehicleId === null ? items : items.filter((item) => item.vehicleId === vehicleId);
}

export function computeDashboard(input: DashboardInput): DashboardMetrics {
  const { today, range, vehicleId } = input;

  const vehicles = vehicleId === null ? input.vehicles : input.vehicles.filter((v) => v.id === vehicleId);
  const payments = selectVehicle(input.payments, vehicleId);
  const expenses = selectVehicle(input.expenses, vehicleId);
  const rentals = vehicleId === null ? input.rentals : input.rentals.filter((r) => r.vehicleId === vehicleId);

  const periodPayments = payments.filter((p) => p.status !== 'annule' && inRange(p.dueDate, range));
  const periodExpenses = expenses.filter((e) => inRange(e.date, range));

  const revenue = sumCents(periodPayments.map((p) => p.receivedCents));
  const billed = sumCents(periodPayments.map((p) => p.expectedCents));
  const expense = sumCents(periodExpenses.map((e) => e.amountCents));

  let pending = 0;
  let late = 0;
  let lateCount = 0;
  for (const payment of payments) {
    const status = effectivePaymentStatus(payment, today);
    if (status === 'paye' || status === 'annule' || status === 'impaye') continue;
    const remaining = paymentBalance(payment).remainingCents;
    if (compareIso(payment.dueDate, today) < 0) {
      late += remaining;
      lateCount += 1;
    } else {
      pending += remaining;
    }
  }

  const activeRentals = rentals.filter((rental) => rental.status === 'active');
  const rentedIds = new Set(activeRentals.map((rental) => rental.vehicleId));

  const monthly = monthlySeries(lastMonths(today, input.seriesMonths ?? 12), payments, expenses);

  const ranking: VehicleRankingEntry[] = vehicles.map((vehicle) => {
    const vehiclePayments = input.payments.filter((p) => p.vehicleId === vehicle.id && p.status !== 'annule');
    const vehicleExpenses = input.expenses.filter((e) => e.vehicleId === vehicle.id);
    const vehicleRevenue = sumCents(vehiclePayments.map((p) => p.receivedCents));
    const vehicleExpense = sumCents(vehicleExpenses.map((e) => e.amountCents));
    const investment = Math.round(vehicle.purchasePriceCents) + Math.round(vehicle.purchaseFeesCents);
    const net = vehicleRevenue - vehicleExpense;
    return {
      vehicleId: vehicle.id,
      label: [vehicle.brand, vehicle.model].filter((part) => part !== '').join(' '),
      plate: vehicle.plate,
      revenueCents: vehicleRevenue,
      expenseCents: vehicleExpense,
      netCents: net,
      investmentCents: investment,
      recoveredPercent: ratioPercent(net, investment),
    };
  });
  ranking.sort((a, b) => b.netCents - a.netCents);

  const fleetRevenue = sumCents(input.payments.filter((p) => p.status !== 'annule').map((p) => p.receivedCents));
  const fleetExpense = sumCents(input.expenses.map((e) => e.amountCents));
  const fleetNet = fleetRevenue - fleetExpense;
  const fleetInvestment = sumCents(
    input.vehicles.map((v) => Math.round(v.purchasePriceCents) + Math.round(v.purchaseFeesCents)),
  );
  const fleetRecovered = Math.max(0, Math.min(fleetNet, fleetInvestment));

  return {
    range,
    revenueCents: revenue,
    billedCents: billed,
    expenseCents: expense,
    netCents: revenue - expense,
    pendingRentCents: pending,
    lateRentCents: late,
    lateCount,
    rentedVehicles: rentedIds.size,
    availableVehicles: vehicles.filter((v) => v.status === 'disponible').length,
    totalVehicles: vehicles.length,
    maintenanceVehicles: vehicles.filter((v) => v.status === 'entretien' || v.status === 'reparation').length,
    fleetRevenueCents: fleetRevenue,
    fleetExpenseCents: fleetExpense,
    fleetNetCents: fleetNet,
    fleetInvestmentCents: fleetInvestment,
    fleetRecoveredCents: fleetRecovered,
    fleetRecoveredPercent: ratioPercent(fleetNet, fleetInvestment),
    monthly,
    ranking,
  };
}

/** Libellés d'une période, utilisés dans les en-têtes et les noms de fichier exporté. */
export function periodSlug(range: PeriodRange, today: IsoDate): string {
  if (range.month !== null) return range.month;
  if (range.from === null || range.to === null) return `depuis-${today}`;
  return `${range.from}_${range.to}`;
}

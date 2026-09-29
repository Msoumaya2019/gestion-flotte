/**
 * Calculs financiers : amortissement, récupération de l'investissement, rentabilité.
 *
 * Ce module ne connaît ni base de données ni interface. Il reçoit des listes et rend des
 * nombres. C'est ce qui permet de l'éprouver par des tests unitaires sur des cas chiffrés
 * vérifiables à la main.
 *
 * Deux notions sont volontairement **séparées**, parce qu'elles répondent à deux questions
 * différentes :
 *
 * - **Amortissement** : « combien ce véhicule a perdu de valeur ? » — une écriture
 *   comptable, étalée sur une durée choisie.
 * - **Récupération de l'investissement** : « combien de mon argent est rentré ? » — un
 *   flux de trésorerie, qui ne suit pas du tout la même courbe.
 */

import { addMonths, compareIso, daysBetween, monthKey, startOfMonth } from './dates';
import { ratioPercent, sumCents } from './money';
import type {
  AmortizationMethod,
  Cents,
  Expense,
  IsoDate,
  Km,
  Payment,
  Vehicle,
} from './types';

// ---------------------------------------------------------------------------
// Amortissement
// ---------------------------------------------------------------------------

export interface AmortizationInput {
  purchasePriceCents: Cents;
  purchaseFeesCents: Cents;
  /** Durée choisie librement : en mois. */
  durationMonths: number;
  method: AmortizationMethod;
  /** Point de départ : date d'achat, ou date de mise en service. */
  startDate: IsoDate;
  today: IsoDate;
}

export interface AmortizationResult {
  /** Base amortissable = prix d'achat + frais d'acquisition. */
  basisCents: Cents;
  /** Dotation d'amortissement du mois en cours. */
  monthlyCents: Cents;
  /** Mois révolus depuis le début, bornés à la durée. */
  elapsedMonths: number;
  cumulativeCents: Cents;
  remainingCents: Cents;
  endDate: IsoDate;
  finished: boolean;
  /** Part amortie, en pourcentage de la base. */
  progressPercent: number;
}

/**
 * Poids mensuels d'un amortissement dégressif (somme des chiffres de la durée).
 * Le mois `i` (1-indexé) pèse `(n - i + 1)`, le total des poids valant `n(n+1)/2`.
 */
export function degressiveWeights(months: number): number[] {
  const total = (months * (months + 1)) / 2;
  const weights: number[] = [];
  for (let i = 1; i <= months; i += 1) {
    weights.push((months - i + 1) / total);
  }
  return weights;
}

export function computeAmortization(input: AmortizationInput): AmortizationResult {
  const basis = Math.max(0, Math.round(input.purchasePriceCents) + Math.round(input.purchaseFeesCents));
  const months = Math.max(1, Math.round(input.durationMonths));
  const endDate = addMonths(input.startDate, months);

  const rawElapsed = monthsBetween(input.startDate, input.today);
  const elapsed = Math.min(Math.max(0, rawElapsed), months);

  let cumulative: number;
  let monthly: number;

  if (input.method === 'degressif') {
    const weights = degressiveWeights(months);
    let sum = 0;
    for (let i = 0; i < elapsed; i += 1) sum += weights[i] ?? 0;
    cumulative = Math.round(basis * sum);
    monthly = Math.round(basis * (weights[Math.min(elapsed, months - 1)] ?? 0));
  } else {
    monthly = Math.round(basis / months);
    cumulative = Math.min(basis, monthly * elapsed);
  }

  // Au terme de la durée choisie, la base est amortie **en totalité** : l'écart
  // d'arrondi de la dotation mensuelle est absorbé par la dernière échéance. Sans cela,
  // un plan de 60 mois laissait 20 centimes non amortis, et « reste à amortir » ne
  // tombait jamais à zéro.
  if (elapsed >= months) cumulative = basis;
  cumulative = Math.min(cumulative, basis);
  const remaining = Math.max(0, basis - cumulative);

  return {
    basisCents: basis,
    monthlyCents: monthly,
    elapsedMonths: elapsed,
    cumulativeCents: cumulative,
    remainingCents: remaining,
    endDate,
    finished: elapsed >= months,
    progressPercent: ratioPercent(cumulative, basis) ?? 0,
  };
}

/** Nombre de mois entiers écoulés entre deux dates, arrondi au mois le plus proche. */
export function monthsBetween(from: IsoDate, to: IsoDate): number {
  const days = daysBetween(from, to);
  return Math.round(days / 30.4375);
}

/** Amortissement en années, ramené en mois — l'interface laisse choisir l'unité. */
export function yearsToMonths(years: number): number {
  return Math.round(years * 12);
}

// ---------------------------------------------------------------------------
// Récupération de l'investissement
// ---------------------------------------------------------------------------

export interface RecoveryResult {
  /** Investissement total = prix d'achat + frais initiaux. */
  investmentCents: Cents;
  revenueCents: Cents;
  expenseCents: Cents;
  /** Résultat net : ce qui a effectivement remboursé l'investissement. */
  netCents: Cents;
  recoveredCents: Cents;
  remainingCents: Cents;
  /** Pourcentage réel, qui peut dépasser 100 quand l'investissement est plus que remboursé. */
  recoveredPercent: number | null;
  /** Pourcentage borné à 100, pour une barre de progression. */
  progressPercent: number;
  recovered: boolean;
}

export function computeRecovery(input: {
  investmentCents: Cents;
  revenueCents: Cents;
  expenseCents: Cents;
}): RecoveryResult {
  const investment = Math.max(0, Math.round(input.investmentCents));
  const revenue = Math.round(input.revenueCents);
  const expense = Math.round(input.expenseCents);
  const net = revenue - expense;
  // On ne récupère que ce qui est effectivement gagné : un résultat net négatif ne fait
  // pas *reculer* le montant récupéré, et il ne fait pas non plus *gonfler* le reste à
  // récupérer au-delà de l'investissement. C'est le piège que masquait `investment - net`.
  const earned = Math.max(0, net);
  const recovered = Math.min(earned, investment);
  const remaining = Math.max(0, investment - earned);

  return {
    investmentCents: investment,
    revenueCents: revenue,
    expenseCents: expense,
    netCents: net,
    recoveredCents: recovered,
    remainingCents: remaining,
    recoveredPercent: ratioPercent(earned, investment),
    progressPercent: ratioPercent(recovered, investment) ?? (investment === 0 ? 100 : 0),
    recovered: investment > 0 && net >= investment,
  };
}

// ---------------------------------------------------------------------------
// Rentabilité d'un véhicule
// ---------------------------------------------------------------------------

export interface VehicleFinancials {
  vehicleId: string;
  revenueCents: Cents;
  expenseCents: Cents;
  /** Bénéfice brut = revenus encaissés. */
  grossCents: Cents;
  /** Bénéfice net = revenus − dépenses. */
  netCents: Cents;
  maintenanceCents: Cents;
  /** Nombre de jours couverts par l'activité du véhicule. */
  activeDays: number;
  activeMonths: number;
  monthlyRevenueCents: Cents;
  monthlyExpenseCents: Cents;
  monthlyNetCents: Cents;
  kmDriven: Km;
  /** Coût d'exploitation au kilomètre, en centimes. */
  costPerKmCents: number;
  /** Rendement net rapporté au prix d'achat, sur la période observée. */
  yieldOnPurchasePercent: number | null;
  /** Rendement annualisé, pour comparer des véhicules d'anciennetés différentes. */
  annualizedYieldPercent: number | null;
  recovery: RecoveryResult;
  amortization: AmortizationResult;
}

export interface VehicleFinancialsInput {
  vehicle: Vehicle;
  payments: readonly Payment[];
  expenses: readonly Expense[];
  /** Identifiants de catégories considérées comme de l'entretien. */
  maintenanceCategoryIds: readonly string[];
  today: IsoDate;
}

/** Revenus encaissés : on compte l'argent réellement reçu, pas ce qui est facturé. */
export function paidRevenueCents(payments: readonly Payment[]): Cents {
  return sumCents(payments.filter((p) => p.status !== 'annule').map((p) => p.receivedCents));
}

/** Revenus facturés : utile pour mesurer un impayé. */
export function billedRevenueCents(payments: readonly Payment[]): Cents {
  return sumCents(payments.filter((p) => p.status !== 'annule').map((p) => p.expectedCents));
}

export function expenseTotalCents(expenses: readonly Expense[]): Cents {
  return sumCents(expenses.map((e) => e.amountCents));
}

export function computeVehicleFinancials(input: VehicleFinancialsInput): VehicleFinancials {
  const { vehicle, payments, expenses, today } = input;

  const revenue = paidRevenueCents(payments);
  const expense = expenseTotalCents(expenses);
  const maintenanceSet = new Set(input.maintenanceCategoryIds);
  const maintenance = sumCents(
    expenses.filter((e) => maintenanceSet.has(e.categoryId)).map((e) => e.amountCents),
  );

  const activityDates = [
    ...payments.map((p) => p.dueDate),
    ...expenses.map((e) => e.date),
  ].sort(compareIso);
  const firstDate = activityDates[0] ?? vehicle.purchaseDate ?? today;
  const lastDate = activityDates[activityDates.length - 1] ?? today;
  const activeDays = Math.max(1, daysBetween(firstDate, lastDate) + 1);
  const activeMonths = Math.max(1, activeDays / 30.4375);

  const kmDriven = Math.max(0, vehicle.currentMileageKm - vehicle.purchaseMileageKm);
  const net = revenue - expense;

  const investment = Math.round(vehicle.purchasePriceCents) + Math.round(vehicle.purchaseFeesCents);

  return {
    vehicleId: vehicle.id,
    revenueCents: revenue,
    expenseCents: expense,
    grossCents: revenue,
    netCents: net,
    maintenanceCents: maintenance,
    activeDays,
    activeMonths,
    monthlyRevenueCents: Math.round(revenue / activeMonths),
    monthlyExpenseCents: Math.round(expense / activeMonths),
    monthlyNetCents: Math.round(net / activeMonths),
    kmDriven,
    costPerKmCents: kmDriven > 0 ? expense / kmDriven : 0,
    yieldOnPurchasePercent: ratioPercent(net, vehicle.purchasePriceCents),
    annualizedYieldPercent: ratioPercent((net / activeMonths) * 12, vehicle.purchasePriceCents),
    recovery: computeRecovery({ investmentCents: investment, revenueCents: revenue, expenseCents: expense }),
    amortization: computeAmortization({
      purchasePriceCents: vehicle.purchasePriceCents,
      purchaseFeesCents: vehicle.purchaseFeesCents,
      durationMonths: vehicle.amortizationMonths,
      method: vehicle.amortizationMethod,
      startDate: vehicle.purchaseDate ?? today,
      today,
    }),
  };
}

// ---------------------------------------------------------------------------
// Séries mensuelles (graphiques)
// ---------------------------------------------------------------------------

export interface MonthlyPoint {
  month: IsoDate;
  key: string;
  revenueCents: Cents;
  expenseCents: Cents;
  netCents: Cents;
}

/** Série mensuelle sur une fenêtre donnée : les mois sans mouvement valent zéro, pas absence. */
export function monthlySeries(
  months: readonly IsoDate[],
  payments: readonly Payment[],
  expenses: readonly Expense[],
): MonthlyPoint[] {
  const buckets = new Map<string, MonthlyPoint>();
  for (const month of months) {
    const key = monthKey(month);
    buckets.set(key, { month: startOfMonth(month), key, revenueCents: 0, expenseCents: 0, netCents: 0 });
  }
  for (const payment of payments) {
    if (payment.status === 'annule') continue;
    const bucket = buckets.get(monthKey(payment.dueDate));
    if (bucket !== undefined) bucket.revenueCents += Math.round(payment.receivedCents);
  }
  for (const expense of expenses) {
    const bucket = buckets.get(monthKey(expense.date));
    if (bucket !== undefined) bucket.expenseCents += Math.round(expense.amountCents);
  }
  for (const bucket of buckets.values()) {
    bucket.netCents = bucket.revenueCents - bucket.expenseCents;
  }
  return [...buckets.values()].sort((a, b) => compareIso(a.month, b.month));
}

/** Cumul de la rentabilité : la courbe qui montre quand l'investissement se rembourse. */
export function cumulativeSeries(points: readonly MonthlyPoint[]): { key: string; cumulativeCents: Cents }[] {
  let running = 0;
  return points.map((point) => {
    running += point.netCents;
    return { key: point.key, cumulativeCents: running };
  });
}

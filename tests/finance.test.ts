import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  computeAmortization,
  computeRecovery,
  computeVehicleFinancials,
  cumulativeSeries,
  degressiveWeights,
  expenseTotalCents,
  billedRevenueCents,
  monthsBetween,
  monthlySeries,
  paidRevenueCents,
  yearsToMonths,
} from '@/domain/finance';
import type { Expense, Payment, Vehicle } from '@/domain/types';

function vehicle(overrides: Partial<Vehicle> = {}): Vehicle {
  return {
    id: 'v1',
    createdAt: '2024-03-15T10:00:00.000Z',
    updatedAt: '2024-03-15T10:00:00.000Z',
    archivedAt: null,
    brand: 'Toyota',
    model: 'Corolla',
    trim: 'Touring Sports',
    year: 2021,
    plate: 'GK-482-LM',
    vin: 'SB1KZ3JE00E123456',
    fuelType: 'hybride',
    status: 'loue',
    purchaseDate: '2024-03-15',
    purchasePriceCents: 1_500_000,
    purchaseFeesCents: 50_000,
    purchaseMileageKm: 78_000,
    currentMileageKm: 125_400,
    amortizationMonths: 60,
    amortizationMethod: 'lineaire',
    photoFileId: null,
    notes: '',
    ...overrides,
  };
}

function payment(overrides: Partial<Payment> = {}): Payment {
  return {
    id: 'p1',
    createdAt: '2026-09-01T00:00:00.000Z',
    updatedAt: '2026-09-01T00:00:00.000Z',
    archivedAt: null,
    rentalId: 'r1',
    vehicleId: 'v1',
    tenantId: 't1',
    dueDate: '2026-09-07',
    expectedCents: 30_000,
    receivedCents: 30_000,
    paidDate: '2026-09-07',
    methodId: null,
    payerType: 'locataire',
    payerName: '',
    comment: '',
    proofFileId: null,
    status: 'paye',
    ...overrides,
  };
}

function expense(overrides: Partial<Expense> = {}): Expense {
  return {
    id: 'e1',
    createdAt: '2026-09-01T00:00:00.000Z',
    updatedAt: '2026-09-01T00:00:00.000Z',
    archivedAt: null,
    vehicleId: 'v1',
    rentalId: null,
    date: '2026-09-02',
    amountCents: 10_000,
    categoryId: 'cat-entretien',
    mileageKm: null,
    supplier: '',
    comment: '',
    invoiceFileId: null,
    photoFileId: null,
    maintenanceRecordId: null,
    damageId: null,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Amortissement
// ---------------------------------------------------------------------------

test('l’amortissement linéaire étale la base sur la durée choisie', () => {
  // L'exemple de référence : 15 000 € de véhicule, 60 mois, soit 250 € par mois.
  const result = computeAmortization({
    purchasePriceCents: 1_500_000,
    purchaseFeesCents: 0,
    durationMonths: 60,
    method: 'lineaire',
    startDate: '2024-03-15',
    today: '2026-03-15',
  });
  assert.equal(result.basisCents, 1_500_000);
  assert.equal(result.monthlyCents, 25_000);
  assert.equal(result.elapsedMonths, 24);
  assert.equal(result.cumulativeCents, 600_000);
  assert.equal(result.remainingCents, 900_000);
  assert.equal(result.endDate, '2029-03-15');
  assert.equal(result.finished, false);
  assert.equal(result.progressPercent, 40);
});

test('les frais d’acquisition entrent dans la base amortissable', () => {
  const result = computeAmortization({
    purchasePriceCents: 1_500_000,
    purchaseFeesCents: 50_000,
    durationMonths: 60,
    method: 'lineaire',
    startDate: '2024-03-15',
    today: '2024-03-15',
  });
  assert.equal(result.basisCents, 1_550_000);
  assert.equal(result.monthlyCents, 25_833);
  assert.equal(result.elapsedMonths, 0);
  assert.equal(result.cumulativeCents, 0);
});

test('un amortissement arrivé à terme ne dépasse jamais la base', () => {
  const result = computeAmortization({
    purchasePriceCents: 1_500_000,
    purchaseFeesCents: 50_000,
    durationMonths: 60,
    method: 'lineaire',
    startDate: '2020-01-01',
    today: '2030-01-01',
  });
  assert.equal(result.elapsedMonths, 60);
  assert.equal(result.cumulativeCents, 1_550_000);
  assert.equal(result.remainingCents, 0);
  assert.equal(result.finished, true);
  assert.equal(result.progressPercent, 100);
});

test('l’amortissement dégressif pèse plus lourd au début, et retombe sur la même base', () => {
  const weights = degressiveWeights(4);
  assert.equal(weights.length, 4);
  assert.ok((weights[0] ?? 0) > (weights[3] ?? 0), 'le premier mois pèse plus que le dernier');
  assert.ok(Math.abs(weights.reduce((sum, w) => sum + w, 0) - 1) < 1e-9, 'la somme des poids vaut 1');

  const early = computeAmortization({
    purchasePriceCents: 1_500_000,
    purchaseFeesCents: 0,
    durationMonths: 60,
    method: 'degressif',
    startDate: '2024-01-01',
    today: '2024-07-01',
  });
  const linear = computeAmortization({
    purchasePriceCents: 1_500_000,
    purchaseFeesCents: 0,
    durationMonths: 60,
    method: 'lineaire',
    startDate: '2024-01-01',
    today: '2024-07-01',
  });
  assert.ok(
    early.cumulativeCents > linear.cumulativeCents,
    'en dégressif, plus de valeur est amortie les premières années',
  );
});

test('l’unité de durée se convertit sans perdre de mois', () => {
  assert.equal(yearsToMonths(5), 60);
  assert.equal(yearsToMonths(2.5), 30);
  assert.equal(monthsBetween('2024-03-15', '2026-03-15'), 24);
});

// ---------------------------------------------------------------------------
// Récupération de l'investissement
// ---------------------------------------------------------------------------

test('la récupération de l’investissement reproduit l’exemple de référence', () => {
  // 15 500 € investis, 10 000 € encaissés, 2 000 € dépensés : 51,6 % récupérés, 7 500 € restants.
  const recovery = computeRecovery({
    investmentCents: 1_550_000,
    revenueCents: 1_000_000,
    expenseCents: 200_000,
  });
  assert.equal(recovery.netCents, 800_000);
  assert.equal(recovery.recoveredCents, 800_000);
  assert.equal(recovery.remainingCents, 750_000);
  assert.equal(recovery.recoveredPercent?.toFixed(1), '51.6');
  assert.equal(recovery.recovered, false);
});

test('un investissement plus que remboursé dépasse 100 %, et la barre reste bornée', () => {
  const recovery = computeRecovery({
    investmentCents: 1_000_000,
    revenueCents: 1_500_000,
    expenseCents: 100_000,
  });
  assert.equal(recovery.recoveredPercent, 140);
  assert.equal(recovery.progressPercent, 100, 'la barre de progression ne dépasse pas 100');
  assert.equal(recovery.remainingCents, 0);
  assert.equal(recovery.recovered, true);
});

test('un résultat net négatif ne fait pas reculer l’investissement récupéré', () => {
  const recovery = computeRecovery({
    investmentCents: 1_000_000,
    revenueCents: 200_000,
    expenseCents: 500_000,
  });
  assert.equal(recovery.netCents, -300_000);
  assert.equal(recovery.recoveredCents, 0);
  assert.equal(recovery.remainingCents, 1_000_000);
  assert.equal(recovery.progressPercent, 0);
});

// ---------------------------------------------------------------------------
// Rentabilité d'un véhicule
// ---------------------------------------------------------------------------

test('les revenus comptent l’argent reçu, pas l’argent facturé', () => {
  const payments = [
    payment({ expectedCents: 30_000, receivedCents: 30_000 }),
    payment({ expectedCents: 30_000, receivedCents: 20_000 }),
    payment({ expectedCents: 30_000, receivedCents: 0, status: 'impaye' }),
    payment({ expectedCents: 30_000, receivedCents: 30_000, status: 'annule' }),
  ];
  assert.equal(paidRevenueCents(payments), 50_000);
  assert.equal(billedRevenueCents(payments), 90_000, 'l’échéance annulée n’est pas facturée');
});

test('la rentabilité d’un véhicule sépare le brut du net et isole l’entretien', () => {
  const payments = [
    payment({ dueDate: '2026-01-05', receivedCents: 30_000 }),
    payment({ dueDate: '2026-02-02', receivedCents: 30_000 }),
    payment({ dueDate: '2026-03-02', receivedCents: 30_000 }),
  ];
  const expenses = [
    expense({ date: '2026-01-20', amountCents: 14_500, categoryId: 'cat-entretien' }),
    expense({ date: '2026-02-10', amountCents: 5_000, categoryId: 'cat-nettoyage' }),
  ];

  const result = computeVehicleFinancials({
    vehicle: vehicle({ currentMileageKm: 118_000 }),
    payments,
    expenses,
    maintenanceCategoryIds: ['cat-entretien'],
    today: '2026-03-15',
  });

  assert.equal(result.revenueCents, 90_000);
  assert.equal(result.expenseCents, 19_500);
  assert.equal(result.grossCents, 90_000, 'le bénéfice brut, ce sont les revenus');
  assert.equal(result.netCents, 70_500);
  assert.equal(result.maintenanceCents, 14_500);
  assert.equal(result.kmDriven, 40_000);
  assert.equal(result.costPerKmCents, 19_500 / 40_000);
});

test('sans kilomètre parcouru, le coût au kilomètre vaut zéro au lieu d’être infini', () => {
  const result = computeVehicleFinancials({
    vehicle: vehicle({ currentMileageKm: 78_000 }),
    payments: [],
    expenses: [expense()],
    maintenanceCategoryIds: [],
    today: '2026-09-28',
  });
  assert.equal(result.kmDriven, 0);
  assert.equal(result.costPerKmCents, 0);
  assert.equal(result.netCents, -10_000);
});

test('les dépenses et revenus se répartissent par mois, mois vides compris', () => {
  const months = ['2026-01-01', '2026-02-01', '2026-03-01'];
  const payments = [
    payment({ dueDate: '2026-01-05', receivedCents: 30_000 }),
    payment({ dueDate: '2026-03-02', receivedCents: 30_000 }),
    payment({ dueDate: '2026-03-09', receivedCents: 10_000 }),
  ];
  const expenses = [expense({ date: '2026-02-10', amountCents: 5_000 })];

  const series = monthlySeries(months, payments, expenses);
  assert.equal(series.length, 3, 'un mois sans mouvement apparaît quand même');
  assert.equal(series[0]?.revenueCents, 30_000);
  assert.equal(series[1]?.revenueCents, 0);
  assert.equal(series[1]?.expenseCents, 5_000);
  assert.equal(series[1]?.netCents, -5_000);
  assert.equal(series[2]?.revenueCents, 40_000);

  const cumulative = cumulativeSeries(series);
  assert.equal(cumulative[0]?.cumulativeCents, 30_000);
  assert.equal(cumulative[1]?.cumulativeCents, 25_000);
  assert.equal(cumulative[2]?.cumulativeCents, 65_000);
});

test('un mois hors fenêtre n’entre pas dans la série', () => {
  const series = monthlySeries(['2026-09-01'], [payment({ dueDate: '2026-08-31' })], []);
  assert.equal(series[0]?.revenueCents, 0);
});

test('expenseTotalCents additionne en centimes', () => {
  assert.equal(expenseTotalCents([expense({ amountCents: 1_999 }), expense({ amountCents: 1 })]), 2_000);
});

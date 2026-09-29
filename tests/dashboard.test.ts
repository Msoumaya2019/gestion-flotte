import assert from 'node:assert/strict';
import { test } from 'node:test';

import { computeDashboard, inRange, periodRange, periodSlug } from '@/domain/dashboard';
import type { Expense, Payment, Rental, Vehicle } from '@/domain/types';

const TODAY = '2026-09-28';

function vehicle(id: string, status: Vehicle['status'], price = 1_500_000, fees = 50_000): Vehicle {
  return {
    id,
    createdAt: '2024-01-01T00:00:00.000Z',
    updatedAt: '2024-01-01T00:00:00.000Z',
    archivedAt: null,
    brand: 'Toyota',
    model: `Modèle ${id}`,
    trim: '',
    year: 2021,
    plate: `PL-${id}`,
    vin: '',
    fuelType: 'hybride',
    status,
    purchaseDate: '2024-01-01',
    purchasePriceCents: price,
    purchaseFeesCents: fees,
    purchaseMileageKm: 0,
    currentMileageKm: 50_000,
    amortizationMonths: 60,
    amortizationMethod: 'lineaire',
    photoFileId: null,
    notes: '',
  };
}

function payment(id: string, vehicleId: string, dueDate: string, expected: number, received: number): Payment {
  return {
    id,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    archivedAt: null,
    rentalId: `r-${vehicleId}`,
    vehicleId,
    tenantId: 't1',
    dueDate,
    expectedCents: expected,
    receivedCents: received,
    paidDate: received > 0 ? dueDate : null,
    methodId: null,
    payerType: 'locataire',
    payerName: '',
    comment: '',
    proofFileId: null,
    status: received >= expected ? 'paye' : 'a_venir',
  };
}

function expense(id: string, vehicleId: string, date: string, amount: number): Expense {
  return {
    id,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    archivedAt: null,
    vehicleId,
    rentalId: null,
    date,
    amountCents: amount,
    categoryId: 'cat',
    mileageKm: null,
    supplier: '',
    comment: '',
    invoiceFileId: null,
    photoFileId: null,
    maintenanceRecordId: null,
    damageId: null,
  };
}

function rental(vehicleId: string, status: Rental['status']): Rental {
  return {
    id: `r-${vehicleId}`,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    archivedAt: null,
    vehicleId,
    tenantId: 't1',
    startDate: '2026-07-06',
    endDate: null,
    openEnded: true,
    rentAmountCents: 30_000,
    frequency: 'hebdomadaire',
    intervalDays: null,
    dueWeekday: 1,
    dueDayOfMonth: null,
    paymentTiming: 'debut',
    depositCents: 60_000,
    startMileageKm: 0,
    endMileageKm: null,
    allowedKm: null,
    excessKmPriceCents: 0,
    feesCents: 0,
    status,
    activatedAt: '2026-07-06T09:00:00.000Z',
    endedAt: null,
    depositOutcome: null,
    depositReturnedCents: 0,
    notes: '',
  };
}

const VEHICLES = [vehicle('a', 'loue'), vehicle('b', 'loue'), vehicle('c', 'disponible')];
const RENTALS = [rental('a', 'active'), rental('b', 'active')];
const PAYMENTS = [
  // Septembre : deux encaissements complets, un partiel échu, un à venir.
  payment('p1', 'a', '2026-09-07', 30_000, 30_000),
  payment('p2', 'a', '2026-09-14', 30_000, 20_000),
  payment('p3', 'a', '2026-09-28', 30_000, 0),
  payment('p4', 'b', '2026-09-21', 30_000, 30_000),
  // Août : hors de la période « ce mois ».
  payment('p5', 'a', '2026-08-31', 30_000, 30_000),
];
const EXPENSES = [
  expense('e1', 'a', '2026-09-02', 10_000),
  expense('e2', 'b', '2026-09-15', 5_000),
  expense('e3', 'a', '2026-08-15', 7_000),
];

const BASE = {
  vehicles: VEHICLES,
  rentals: RENTALS,
  payments: PAYMENTS,
  expenses: EXPENSES,
  today: TODAY,
  vehicleId: null,
};

test('periodRange traduit chaque filtre en bornes de dates', () => {
  assert.deepEqual(periodRange('ce_mois', TODAY), {
    from: '2026-09-01',
    to: '2026-09-30',
    label: 'Ce mois',
    month: '2026-09',
  });
  assert.equal(periodRange('mois_precedent', TODAY).from, '2026-08-01');
  assert.equal(periodRange('cette_annee', TODAY).from, '2026-01-01');
  assert.equal(periodRange('cette_annee', TODAY).to, '2026-12-31');
  assert.deepEqual(periodRange('depuis_debut', TODAY), {
    from: null,
    to: null,
    label: 'Depuis le début',
    month: null,
  });
  assert.equal(periodRange('personnalise', TODAY, { from: '2026-03-01', to: '2026-03-31' }).from, '2026-03-01');
});

test('inRange inclut les bornes et accepte une fenêtre ouverte', () => {
  const month = periodRange('ce_mois', TODAY);
  assert.equal(inRange('2026-09-01', month), true);
  assert.equal(inRange('2026-09-30', month), true);
  assert.equal(inRange('2026-08-31', month), false);
  assert.equal(inRange('1900-01-01', periodRange('depuis_debut', TODAY)), true);
});

test('le tableau de bord du mois sépare revenus, dépenses et résultat', () => {
  const metrics = computeDashboard({ ...BASE, range: periodRange('ce_mois', TODAY) });
  assert.equal(metrics.revenueCents, 80_000, '30 000 + 20 000 + 30 000 encaissés en septembre');
  assert.equal(metrics.billedCents, 120_000, 'quatre échéances de 30 000 facturées');
  assert.equal(metrics.expenseCents, 15_000);
  assert.equal(metrics.netCents, 65_000);
});

test('les loyers en attente et en retard sont distingués', () => {
  const metrics = computeDashboard({ ...BASE, range: periodRange('ce_mois', TODAY) });
  assert.equal(metrics.pendingRentCents, 30_000, 'échéance du 28 septembre, pas encore échue');
  assert.equal(metrics.lateRentCents, 10_000, 'reste dû sur l’échéance partielle du 14 septembre');
  assert.equal(metrics.lateCount, 1);
});

test('les compteurs de flotte reflètent les statuts et les locations actives', () => {
  const metrics = computeDashboard({ ...BASE, range: periodRange('ce_mois', TODAY) });
  assert.equal(metrics.totalVehicles, 3);
  assert.equal(metrics.rentedVehicles, 2);
  assert.equal(metrics.availableVehicles, 1);
  assert.equal(metrics.maintenanceVehicles, 0);
});

test('les totaux de flotte couvrent toute l’histoire, pas la période affichée', () => {
  const metrics = computeDashboard({ ...BASE, range: periodRange('ce_mois', TODAY) });
  assert.equal(metrics.fleetRevenueCents, 110_000, 'y compris l’encaissement du 31 août');
  assert.equal(metrics.fleetExpenseCents, 22_000);
  assert.equal(metrics.fleetNetCents, 88_000);
  assert.equal(metrics.fleetInvestmentCents, 3 * 1_550_000);
  assert.equal(metrics.fleetRecoveredCents, 88_000);
  assert.equal(metrics.fleetRecoveredPercent?.toFixed(2), ((88_000 / 4_650_000) * 100).toFixed(2));
});

test('le tableau de bord se restreint à un véhicule', () => {
  const metrics = computeDashboard({ ...BASE, range: periodRange('ce_mois', TODAY), vehicleId: 'b' });
  assert.equal(metrics.revenueCents, 30_000);
  assert.equal(metrics.expenseCents, 5_000);
  assert.equal(metrics.totalVehicles, 1);
  assert.equal(metrics.rentedVehicles, 1);
  assert.equal(metrics.ranking.length, 1);
});

test('le classement place le véhicule le plus rentable en tête', () => {
  const metrics = computeDashboard({ ...BASE, range: periodRange('ce_mois', TODAY) });
  assert.equal(metrics.ranking.length, 3);
  // Le classement est **cumulé depuis l'origine**, pas borné à la période affichée :
  // comparer la rentabilité de deux véhicules sur un mois isolé ne veut rien dire.
  assert.equal(metrics.ranking[0]?.vehicleId, 'a', '80 000 encaissés − 17 000 dépensés = 63 000');
  assert.equal(metrics.ranking[0]?.netCents, 63_000);
  assert.equal(metrics.ranking[1]?.vehicleId, 'b', '30 000 − 5 000 = 25 000');
  assert.equal(metrics.ranking[1]?.netCents, 25_000);
  assert.equal(metrics.ranking[2]?.vehicleId, 'c', 'aucun mouvement : 0, pas absent du classement');
  assert.equal(metrics.ranking[2]?.netCents, 0);
});

test('la série mensuelle couvre douze mois, même sans mouvement', () => {
  const metrics = computeDashboard({ ...BASE, range: periodRange('ce_mois', TODAY) });
  assert.equal(metrics.monthly.length, 12);
  const septembre = metrics.monthly[metrics.monthly.length - 1];
  assert.equal(septembre?.key, '2026-09');
  assert.equal(septembre?.revenueCents, 80_000);
  const aout = metrics.monthly[metrics.monthly.length - 2];
  assert.equal(aout?.key, '2026-08');
  assert.equal(aout?.revenueCents, 30_000);
});

test('le filtre « mois précédent » ne retient que le mois d’avant', () => {
  const metrics = computeDashboard({ ...BASE, range: periodRange('mois_precedent', TODAY) });
  assert.equal(metrics.revenueCents, 30_000);
  assert.equal(metrics.expenseCents, 7_000);
});

test('periodSlug nomme la période pour les fichiers exportés', () => {
  assert.equal(periodSlug(periodRange('ce_mois', TODAY), TODAY), '2026-09');
  assert.equal(periodSlug(periodRange('depuis_debut', TODAY), TODAY), 'depuis-2026-09-28');
  assert.equal(
    periodSlug(periodRange('personnalise', TODAY, { from: '2026-01-01', to: '2026-06-30' }), TODAY),
    '2026-01-01_2026-06-30',
  );
});

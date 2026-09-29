import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  effectivePaymentStatus,
  firstDayOfMonthOnOrAfter,
  firstWeekdayOnOrAfter,
  nextUnsettledPayment,
  paymentBalance,
  rentalKmUsage,
  rentalPaymentTotals,
  scheduleDueDates,
  stepDays,
} from '@/domain/rental';
import type { Payment } from '@/domain/types';

function payment(overrides: Partial<Payment>): Pick<Payment, 'expectedCents' | 'receivedCents' | 'dueDate' | 'status'> {
  return {
    expectedCents: 30_000,
    receivedCents: 0,
    dueDate: '2026-09-14',
    status: 'a_venir',
    ...overrides,
  };
}

test('stepDays traduit chaque fréquence, y compris personnalisée', () => {
  assert.equal(stepDays('hebdomadaire', null), 7);
  assert.equal(stepDays('bimensuel', null), 14);
  assert.equal(stepDays('personnalisee', 10), 10);
  assert.equal(stepDays('personnalisee', 0), null, 'un pas nul est refusé, pas divisé');
  assert.equal(stepDays('mensuel', null), null, 'la fréquence mensuelle n’a pas de pas en jours');
});

test('l’échéancier hebdomadaire engendre les lundis, en partant du jour du début', () => {
  // L'exemple de référence : 300 € par semaine, tous les lundis, à partir du 5 octobre 2026.
  const dates = scheduleDueDates({
    startDate: '2026-10-05',
    endDate: '2026-11-02',
    openEnded: false,
    frequency: 'hebdomadaire',
    intervalDays: null,
    dueWeekday: 1,
    dueDayOfMonth: null,
  });
  assert.deepEqual(dates, [
    '2026-10-05',
    '2026-10-12',
    '2026-10-19',
    '2026-10-26',
    '2026-11-02',
  ]);
});

test('un jour d’échéance différent du début décale la première échéance', () => {
  // Début un mercredi, échéance le lundi : la première tombe le lundi suivant.
  const dates = scheduleDueDates({
    startDate: '2026-10-07',
    endDate: '2026-10-26',
    openEnded: false,
    frequency: 'hebdomadaire',
    intervalDays: null,
    dueWeekday: 1,
    dueDayOfMonth: null,
  });
  assert.deepEqual(dates, ['2026-10-12', '2026-10-19', '2026-10-26']);
});

test('l’échéancier mensuel ne dérive pas depuis un 31', () => {
  const dates = scheduleDueDates({
    startDate: '2026-01-31',
    endDate: '2026-05-31',
    openEnded: false,
    frequency: 'mensuel',
    intervalDays: null,
    dueWeekday: null,
    dueDayOfMonth: 31,
  });
  assert.deepEqual(dates, ['2026-01-31', '2026-02-28', '2026-03-31', '2026-04-30', '2026-05-31']);
});

test('l’échéancier d’une location sans fin s’arrête à la borne demandée', () => {
  const dates = scheduleDueDates({
    startDate: '2026-09-07',
    endDate: null,
    openEnded: true,
    frequency: 'hebdomadaire',
    intervalDays: null,
    dueWeekday: 1,
    dueDayOfMonth: null,
    until: '2026-09-28',
  });
  assert.deepEqual(dates, ['2026-09-07', '2026-09-14', '2026-09-21', '2026-09-28']);
});

test('une borne antérieure au début ne produit aucune échéance', () => {
  assert.deepEqual(
    scheduleDueDates({
      startDate: '2026-09-07',
      endDate: '2026-08-01',
      openEnded: false,
      frequency: 'hebdomadaire',
      intervalDays: null,
      dueWeekday: null,
      dueDayOfMonth: null,
    }),
    [],
  );
});

test('une fréquence personnalisée invalide retombe sur un pas mensuel, sans boucle infinie', () => {
  const dates = scheduleDueDates({
    startDate: '2026-01-15',
    endDate: '2026-04-15',
    openEnded: false,
    frequency: 'personnalisee',
    intervalDays: null,
    dueWeekday: null,
    dueDayOfMonth: null,
  });
  assert.equal(dates.length, 4);
});

test('firstWeekdayOnOrAfter ne recule jamais', () => {
  assert.equal(firstWeekdayOnOrAfter('2026-09-28', 1), '2026-09-28', 'déjà un lundi');
  assert.equal(firstWeekdayOnOrAfter('2026-09-28', 3), '2026-09-30');
  assert.equal(firstWeekdayOnOrAfter('2026-09-28', 7), '2026-10-04');
});

test('firstDayOfMonthOnOrAfter ramène au dernier jour quand le quantième n’existe pas', () => {
  assert.equal(firstDayOfMonthOnOrAfter('2026-01-10', 31), '2026-01-31');
  assert.equal(firstDayOfMonthOnOrAfter('2026-01-31', 15), '2026-02-15');
  // Le quantième 31 n'existe pas en février : on retombe sur le dernier jour du mois.
  assert.equal(firstDayOfMonthOnOrAfter('2026-02-01', 31), '2026-02-28');
  // Mais un début qui tombe déjà sur le quantième demandé n'est pas repoussé d'un mois.
  assert.equal(firstDayOfMonthOnOrAfter('2026-01-31', 31), '2026-01-31');
});

// ---------------------------------------------------------------------------
// Statuts d'échéance
// ---------------------------------------------------------------------------

test('le statut affiché se déduit des montants et de la date', () => {
  const today = '2026-09-28';

  assert.equal(
    effectivePaymentStatus(payment({ dueDate: '2026-10-05' }), today),
    'a_venir',
    'rien reçu, pas encore échu',
  );
  assert.equal(
    effectivePaymentStatus(payment({ dueDate: '2026-10-05', receivedCents: 10_000 }), today),
    'partiel',
    'partiellement payé, pas encore échu',
  );
  assert.equal(
    effectivePaymentStatus(payment({ dueDate: '2026-09-14', receivedCents: 20_000 }), today),
    'retard',
    'partiellement payé et échu : c’est un retard, pas un partiel',
  );
  assert.equal(effectivePaymentStatus(payment({ dueDate: '2026-09-14' }), today), 'retard');
  assert.equal(
    effectivePaymentStatus(payment({ dueDate: '2026-09-14', receivedCents: 30_000 }), today),
    'paye',
  );
});

test('le statut manuel prime : annulé et impayé ne sont pas recalculés', () => {
  const today = '2026-09-28';
  assert.equal(effectivePaymentStatus(payment({ status: 'annule', dueDate: '2026-01-01' }), today), 'annule');
  assert.equal(effectivePaymentStatus(payment({ status: 'impaye', dueDate: '2026-01-01' }), today), 'impaye');
  assert.equal(
    effectivePaymentStatus(payment({ status: 'annule', receivedCents: 30_000, dueDate: '2026-01-01' }), today),
    'annule',
    'une échéance annulée reste annulée même si un montant traîne',
  );
});

test('le solde d’une échéance sépare le reste dû du trop-perçu', () => {
  assert.deepEqual(paymentBalance({ expectedCents: 30_000, receivedCents: 25_000 }), {
    remainingCents: 5_000,
    overpaidCents: 0,
    settled: false,
  });
  assert.deepEqual(paymentBalance({ expectedCents: 30_000, receivedCents: 30_000 }), {
    remainingCents: 0,
    overpaidCents: 0,
    settled: true,
  });
  assert.deepEqual(paymentBalance({ expectedCents: 30_000, receivedCents: 32_000 }), {
    remainingCents: 0,
    overpaidCents: 2_000,
    settled: true,
  });
});

test('un paiement partiel laisse un solde visible, et il compte dans les sommes dues', () => {
  const today = '2026-09-28';
  const payments = [
    payment({ dueDate: '2026-09-14', receivedCents: 20_000 }),
    payment({ dueDate: '2026-09-21', receivedCents: 30_000 }),
    payment({ dueDate: '2026-09-28', receivedCents: 0 }),
    payment({ dueDate: '2026-10-05', receivedCents: 0 }),
    payment({ dueDate: '2026-09-07', receivedCents: 0, status: 'annule' }),
  ];

  const totals = rentalPaymentTotals(payments, today);
  assert.equal(totals.expectedCents, 30_000 * 4, 'l’échéance annulée est écartée');
  assert.equal(totals.receivedCents, 50_000);
  assert.equal(totals.lateCents, 10_000, 'reste dû sur l’échéance partielle du 14');
  assert.equal(totals.lateCount, 1);
  assert.equal(totals.paidCount, 1);
});

test('la prochaine échéance non soldée est la plus ancienne', () => {
  const today = '2026-09-28';
  const payments = [
    payment({ dueDate: '2026-09-28' }),
    payment({ dueDate: '2026-09-14', receivedCents: 10_000 }),
    payment({ dueDate: '2026-09-21', receivedCents: 30_000 }),
  ];
  const next = nextUnsettledPayment(payments, today);
  assert.equal(next?.dueDate, '2026-09-14');
});

test('le kilométrage d’une location calcule le dépassement et son coût', () => {
  const usage = rentalKmUsage({ startMileageKm: 61_000, allowedKm: 12_000, excessKmPriceCents: 25 }, 74_500);
  assert.equal(usage.drivenKm, 13_500);
  assert.equal(usage.remainingKm, 0);
  assert.equal(usage.exceededKm, 1_500);
  assert.equal(usage.excessCostCents, 37_500, '1 500 km × 0,25 €');
  assert.equal(usage.percentUsed, (13_500 / 12_000) * 100);
});

test('un kilométrage illimité ne facture aucun dépassement', () => {
  const usage = rentalKmUsage({ startMileageKm: 0, allowedKm: null, excessKmPriceCents: 25 }, 200_000);
  assert.equal(usage.exceededKm, 0);
  assert.equal(usage.excessCostCents, 0);
  assert.equal(usage.remainingKm, null);
  assert.equal(usage.percentUsed, null, 'illimité n’est pas « 0 % utilisé »');
});

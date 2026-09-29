/**
 * Banc du cycle de vie d'une location : activation et restitution.
 *
 * ## Pourquoi ce banc existe
 *
 * Activer une location écrit dans **trois** tables — la location, le véhicule, l'échéancier
 * — et la restitution en écrit autant. Un banc qui ne vérifierait que le résultat heureux
 * laisserait passer le défaut le plus coûteux : une activation interrompue au milieu laisse
 * une location active **sans échéances**. Rien ne le signale à l'écran ; le tableau de bord
 * annonce simplement zéro loyer attendu sur un véhicule occupé, et on ne s'en aperçoit
 * qu'à la fin du mois, quand l'argent manque.
 *
 * ## Comment l'échec est provoqué
 *
 * Le cinquième cas fait buter la génération sur la clé primaire d'une échéance, **après**
 * que la location et le véhicule ont déjà été mis à jour. La collision est fabriquée : elle
 * ne reproduit pas un scénario de l'utilisateur, elle met l'opération dans l'état qu'on
 * veut observer — une écriture faite, la suivante qui échoue — pour vérifier que rien n'en
 * réchappe. Sans ce cas, la transaction n'est qu'une intention.
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';

import { bootstrapDatabase } from '@/data/bootstrap';
import type { Repositories } from '@/data/repositories';
import { addDays, addMonths, isoWeekday } from '@/domain/dates';
import { scheduleLabel } from '@/domain/rental';
import type { Payment, Rental, Tenant, Vehicle } from '@/domain/types';
import { openTestDatabase, sequentialIds } from './helpers/sqlite';

const NOW = '2026-09-28T20:00:00.000Z';
const TODAY = '2026-09-28';
const START = '2026-10-01';

interface Fixture {
  repositories: Repositories;
  close(): void;
  count(table: string): number;
  vehicleId: string;
  tenantId: string;
}

/** Base neuve avec ses catalogues, un véhicule et un locataire. Sans données de démonstration. */
async function fixture(): Promise<Fixture> {
  const engine = openTestDatabase();
  const { repositories } = await bootstrapDatabase(engine.db, {
    newId: sequentialIds('fix'),
    now: NOW,
    today: TODAY,
    withDemoData: false,
  });

  const vehicle: Vehicle = {
    id: 'veh-1',
    createdAt: NOW,
    updatedAt: NOW,
    archivedAt: null,
    brand: 'Toyota',
    model: 'Corolla',
    trim: 'Touring Sports',
    year: 2021,
    plate: 'AB-123-CD',
    vin: 'SB1KZ3JE00E123456',
    fuelType: 'hybride',
    status: 'disponible',
    purchaseDate: '2024-03-01',
    purchasePriceCents: 1_850_000,
    purchaseFeesCents: 120_000,
    purchaseMileageKm: 42_000,
    currentMileageKm: 118_000,
    amortizationMonths: 48,
    amortizationMethod: 'lineaire',
    photoFileId: null,
    notes: '',
  };

  const tenant: Tenant = {
    id: 'loc-1',
    createdAt: NOW,
    updatedAt: NOW,
    archivedAt: null,
    firstName: 'Amina',
    lastName: 'Belkacem',
    birthDate: '1988-04-12',
    address: '12 rue des Lilas, 95360 Montmagny',
    phone: '06 12 34 56 78',
    email: 'amina@example.fr',
    licenseNumber: '750123456789',
    licenseDate: '2010-06-30',
    vtcNumber: 'VTC-2024-77812',
    notes: '',
  };

  await repositories.vehicles.insert(vehicle);
  await repositories.tenants.insert(tenant);

  return {
    repositories,
    close: () => engine.close(),
    count: (table) => engine.count(table),
    vehicleId: vehicle.id,
    tenantId: tenant.id,
  };
}

function rentalOf(overrides: Partial<Rental> = {}): Rental {
  return {
    id: 'rent-1',
    createdAt: NOW,
    updatedAt: NOW,
    archivedAt: null,
    vehicleId: 'veh-1',
    tenantId: 'loc-1',
    startDate: START,
    endDate: null,
    openEnded: true,
    rentAmountCents: 30_000,
    frequency: 'mensuel',
    intervalDays: null,
    dueWeekday: null,
    dueDayOfMonth: 5,
    paymentTiming: 'debut',
    depositCents: 100_000,
    startMileageKm: 118_000,
    endMileageKm: null,
    allowedKm: null,
    excessKmPriceCents: 25,
    feesCents: 0,
    status: 'prevue',
    activatedAt: null,
    endedAt: null,
    depositOutcome: null,
    depositReturnedCents: 0,
    notes: '',
    ...overrides,
  };
}

function paymentOf(overrides: Partial<Payment> & Pick<Payment, 'id' | 'rentalId' | 'dueDate'>): Payment {
  return {
    createdAt: NOW,
    updatedAt: NOW,
    archivedAt: null,
    vehicleId: 'veh-1',
    tenantId: 'loc-1',
    expectedCents: 30_000,
    receivedCents: 0,
    paidDate: null,
    methodId: null,
    payerType: 'locataire',
    payerName: '',
    comment: '',
    proofFileId: null,
    status: 'a_venir',
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Activation
// ---------------------------------------------------------------------------

test('l’activation engendre l’échéancier, passe la location en cours et le véhicule en loué', async () => {
  const f = await fixture();
  const rental = rentalOf();
  await f.repositories.rentals.insert(rental);

  const created = await f.repositories.rentals.activate({
    id: rental.id,
    until: addMonths(START, 3),
    methodId: null,
    now: NOW,
  });

  assert.equal(created.length, 3, 'un loyer mensuel au 5 sur trois mois');

  const reloaded = await f.repositories.rentals.get(rental.id);
  assert.equal(reloaded?.status, 'active');
  assert.equal(reloaded?.activatedAt, NOW);

  const vehicle = await f.repositories.vehicles.get(f.vehicleId);
  assert.equal(vehicle?.status, 'loue', 'le véhicule doit sortir des disponibles');

  // Chaque échéance porte le loyer et le locataire de la location : une échéance orpheline
  // apparaîtrait comme un montant dû sans débiteur.
  const stored = await f.repositories.payments.forRental(rental.id);
  assert.equal(stored.length, 3);
  for (const payment of stored) {
    assert.equal(payment.expectedCents, rental.rentAmountCents);
    assert.equal(payment.tenantId, f.tenantId);
    assert.equal(payment.vehicleId, f.vehicleId);
    assert.equal(payment.receivedCents, 0);
    assert.equal(payment.status, 'a_venir');
  }

  f.close();
});

test('l’échéancier engendré suit la fréquence choisie, et le libellé du contrat la décrit', async () => {
  const f = await fixture();
  // Un loyer hebdomadaire du lundi : le contrat doit annoncer « chaque lundi », et les
  // échéances doivent tomber un lundi. Un écart entre les deux ferait signer un contrat
  // faux — c'est le seul endroit de l'application où une erreur a une portée juridique.
  const rental = rentalOf({
    id: 'rent-hebdo',
    frequency: 'hebdomadaire',
    dueWeekday: 1,
    dueDayOfMonth: null,
  });
  await f.repositories.rentals.insert(rental);

  await f.repositories.rentals.activate({
    id: rental.id,
    until: addDays(START, 28),
    methodId: null,
    now: NOW,
  });

  const payments = await f.repositories.payments.forRental(rental.id);
  const dates = payments.map((payment) => payment.dueDate).sort();
  assert.equal(dates.length, 4, `échéances : ${dates.join(', ')}`);
  assert.equal(scheduleLabel(rental), 'chaque lundi');

  for (const date of dates) {
    assert.equal(isoWeekday(date), 1, `${date} n’est pas un lundi`);
  }

  f.close();
});

test('relancer l’activation ne duplique aucune échéance', async () => {
  const f = await fixture();
  const rental = rentalOf();
  await f.repositories.rentals.insert(rental);

  await f.repositories.rentals.activate({
    id: rental.id,
    until: addMonths(START, 3),
    methodId: null,
    now: NOW,
  });
  const second = await f.repositories.rentals.activate({
    id: rental.id,
    until: addMonths(START, 3),
    methodId: null,
    now: NOW,
  });

  assert.equal(second.length, 0, 'la seconde activation ne crée rien');
  assert.equal(await f.repositories.payments.count(), 3);

  f.close();
});

test('l’activation d’une location inconnue refuse, sans rien écrire', async () => {
  const f = await fixture();

  await assert.rejects(
    () =>
      f.repositories.rentals.activate({ id: 'absente', until: START, methodId: null, now: NOW }),
    /introuvable/,
  );
  assert.equal(await f.repositories.payments.count(), 0);

  f.close();
});

test('si l’échéancier échoue, l’activation est annulée entièrement', async () => {
  const f = await fixture();
  const rental = rentalOf();
  await f.repositories.rentals.insert(rental);

  // Une échéance porte l'identifiant `location:date`. On installe d'avance, sous une
  // **autre** location, une ligne qui portera l'un de ces identifiants : la génération ne
  // la voit pas — elle ne lit que les échéances de la location activée — et bute donc sur
  // la clé primaire, après que la location et le véhicule ont déjà été mis à jour.
  const other = rentalOf({ id: 'rent-2', startDate: '2026-11-01' });
  await f.repositories.rentals.insert(other);
  await f.repositories.payments.insert(
    paymentOf({ id: `${rental.id}:2026-10-05`, rentalId: other.id, dueDate: '2026-12-05' }),
  );

  await assert.rejects(
    () =>
      f.repositories.rentals.activate({
        id: rental.id,
        until: addMonths(START, 3),
        methodId: null,
        now: NOW,
      }),
    'l’insertion doit buter sur la clé primaire',
  );

  const reloaded = await f.repositories.rentals.get(rental.id);
  assert.equal(reloaded?.status, 'prevue', 'la location ne doit pas rester active');
  assert.equal(reloaded?.activatedAt, null);

  const vehicle = await f.repositories.vehicles.get(f.vehicleId);
  assert.equal(vehicle?.status, 'disponible', 'le véhicule doit rester disponible');
  assert.equal(await f.repositories.payments.count(), 1, 'aucune échéance de plus');

  f.close();
});

// ---------------------------------------------------------------------------
// Restitution
// ---------------------------------------------------------------------------

test('la restitution clôt la location, rend le véhicule et enregistre le compteur', async () => {
  const f = await fixture();
  const rental = rentalOf();
  await f.repositories.rentals.insert(rental);
  await f.repositories.rentals.activate({
    id: rental.id,
    until: addMonths(START, 3),
    methodId: null,
    now: NOW,
  });

  await f.repositories.rentals.close({
    id: rental.id,
    endDate: '2026-11-15',
    endMileageKm: 121_450,
    depositOutcome: 'partielle',
    depositReturnedCents: 80_000,
    vehicleStatus: 'disponible',
    mileageRecordId: 'releve-1',
    now: NOW,
  });

  const reloaded = await f.repositories.rentals.get(rental.id);
  assert.equal(reloaded?.status, 'terminee');
  assert.equal(reloaded?.endDate, '2026-11-15');
  assert.equal(reloaded?.endMileageKm, 121_450);
  assert.equal(reloaded?.endedAt, NOW);
  assert.equal(reloaded?.depositOutcome, 'partielle');
  assert.equal(reloaded?.depositReturnedCents, 80_000);

  const vehicle = await f.repositories.vehicles.get(f.vehicleId);
  assert.equal(vehicle?.status, 'disponible');
  assert.equal(vehicle?.currentMileageKm, 121_450);

  const record = await f.repositories.mileageRecords.latestForVehicle(f.vehicleId);
  assert.equal(record?.km, 121_450);
  assert.equal(record?.source, 'location');
  assert.equal(record?.rentalId, rental.id);

  f.close();
});

test('la restitution ne fait pas reculer le compteur, mais rend quand même le véhicule', async () => {
  const f = await fixture();
  const rental = rentalOf();
  await f.repositories.rentals.insert(rental);
  await f.repositories.rentals.activate({
    id: rental.id,
    until: addMonths(START, 3),
    methodId: null,
    now: NOW,
  });
  // Le compteur a été relevé entre-temps par un autre écran, plus haut que la restitution.
  await f.repositories.vehicles.updateMileage(f.vehicleId, 125_000, NOW);

  await f.repositories.rentals.close({
    id: rental.id,
    endDate: '2026-11-15',
    endMileageKm: 121_450,
    depositOutcome: 'restituee',
    depositReturnedCents: 100_000,
    vehicleStatus: 'entretien',
    mileageRecordId: 'releve-2',
    now: NOW,
  });

  const vehicle = await f.repositories.vehicles.get(f.vehicleId);
  // Le statut suit la décision de l'utilisateur même si le kilométrage recule : sans la
  // seconde écriture, un retour saisi avec un compteur plus bas laisserait le véhicule
  // marqué « loué » pour toujours.
  assert.equal(vehicle?.currentMileageKm, 125_000, 'le compteur ne recule pas');
  assert.equal(vehicle?.status, 'entretien', 'le statut suit quand même');

  f.close();
});

test('la restitution d’une location inconnue n’écrit aucun relevé', async () => {
  const f = await fixture();

  await assert.rejects(
    () =>
      f.repositories.rentals.close({
        id: 'absente',
        endDate: '2026-11-15',
        endMileageKm: 121_450,
        depositOutcome: 'restituee',
        depositReturnedCents: 0,
        vehicleStatus: 'disponible',
        mileageRecordId: 'releve-3',
        now: NOW,
      }),
    /introuvable/,
  );
  assert.equal(await f.repositories.mileageRecords.count(), 0);

  f.close();
});

test('les échéances d’une location sans date de fin s’arrêtent à l’horizon demandé', async () => {
  const f = await fixture();
  const rental = rentalOf({ frequency: 'hebdomadaire', dueWeekday: null, dueDayOfMonth: null });
  await f.repositories.rentals.insert(rental);

  const created = await f.repositories.rentals.activate({
    id: rental.id,
    until: addDays(START, 21),
    methodId: null,
    now: NOW,
  });

  // Du 1er octobre au 22 : quatre échéances, pas une de plus.
  assert.deepEqual(
    created.map((payment) => payment.dueDate).sort(),
    ['2026-10-01', '2026-10-08', '2026-10-15', '2026-10-22'],
  );

  f.close();
});

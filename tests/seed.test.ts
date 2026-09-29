import assert from 'node:assert/strict';
import { test } from 'node:test';

import { DEFAULT_EXPENSE_CATEGORIES, DEFAULT_MAINTENANCE_TYPES, DEFAULT_DOCUMENT_TYPES } from '@/domain/catalog';
import { effectivePaymentStatus, scheduleDueDates } from '@/domain/rental';
import { buildSeedData, type SeedContext } from '@/domain/seed';
import { checkRentalEligibility } from '@/domain/eligibility';

const TODAY = '2026-09-28';

function context(): SeedContext {
  let counter = 0;
  const categoryIds: Record<string, string> = {};
  for (const category of DEFAULT_EXPENSE_CATEGORIES) categoryIds[category.label] = `cat-${category.label}`;
  const maintenanceTypeIds: Record<string, string> = {};
  for (const type of DEFAULT_MAINTENANCE_TYPES) maintenanceTypeIds[type.label] = `mt-${type.label}`;
  const documentTypeIds: Record<string, string> = {};
  for (const type of DEFAULT_DOCUMENT_TYPES) documentTypeIds[type.label] = `dt-${type.label}`;
  return {
    newId: () => {
      counter += 1;
      return `id-${String(counter).padStart(4, '0')}`;
    },
    now: '2026-09-28T20:00:00.000Z',
    today: TODAY,
    categoryIds,
    methodIds: { Virement: 'pm-virement', Carte: 'pm-carte', Espèces: 'pm-especes', Chèque: 'pm-cheque' },
    maintenanceTypeIds,
    documentTypeIds,
  };
}

const seed = buildSeedData(context());

test('le jeu de démonstration contient les véhicules et locataires annoncés', () => {
  assert.equal(seed.vehicles.length, 3);
  const labels = seed.vehicles.map((vehicle) => `${vehicle.brand} ${vehicle.model}`);
  assert.deepEqual(labels, ['Toyota Corolla', 'Toyota C-HR', 'Toyota Prius+']);
  assert.equal(seed.tenants.length, 3);
  assert.equal(seed.vehicles.filter((vehicle) => vehicle.status === 'disponible').length, 1, 'le Prius+ est disponible');
  assert.equal(seed.vehicles.filter((vehicle) => vehicle.status === 'loue').length, 2);
});

test('les prix d’achat et kilométrages correspondent aux valeurs de référence', () => {
  const corolla = seed.vehicles[0];
  assert.equal(corolla?.purchasePriceCents, 1_500_000);
  assert.equal(corolla?.purchaseMileageKm, 78_000);
  assert.equal(corolla?.currentMileageKm, 125_400);

  const chr = seed.vehicles[1];
  assert.equal(chr?.purchasePriceCents, 1_650_000);

  const corollaRental = seed.rentals.find((rental) => rental.vehicleId === corolla?.id);
  assert.equal(corollaRental?.rentAmountCents, 30_000, '300 € par semaine');
  assert.equal(corollaRental?.frequency, 'hebdomadaire');
  assert.equal(corollaRental?.dueWeekday, 1, 'paiement le lundi');
});

test('les échéances de démonstration sont exactement celles qu’engendre la règle de production', () => {
  const corolla = seed.vehicles[0];
  const rental = seed.rentals.find((item) => item.vehicleId === corolla?.id);
  assert.ok(rental !== undefined);

  const expected = scheduleDueDates({
    startDate: rental.startDate,
    endDate: rental.endDate,
    openEnded: rental.openEnded,
    frequency: rental.frequency,
    intervalDays: rental.intervalDays,
    dueWeekday: rental.dueWeekday,
    dueDayOfMonth: rental.dueDayOfMonth,
    until: '2026-11-28',
  });
  const actual = seed.payments
    .filter((payment) => payment.rentalId === rental.id)
    .map((payment) => payment.dueDate)
    .sort();

  for (const date of expected) {
    assert.ok(actual.includes(date), `l’échéance ${date} manque`);
  }
  assert.ok(actual.includes('2026-07-06'), 'la première échéance est le jour du début');
  assert.ok(actual.includes('2026-09-28'), 'le jour courant est une échéance');
});

test('le jeu de démonstration contient un paiement partiel et un impayé, donc des retards', () => {
  const corolla = seed.vehicles[0];
  const payments = seed.payments.filter((payment) => payment.vehicleId === corolla?.id);

  const partial = payments.find((payment) => payment.dueDate === '2026-09-14');
  assert.equal(partial?.expectedCents, 30_000);
  assert.equal(partial?.receivedCents, 20_000);
  assert.equal(effectivePaymentStatus(partial!, TODAY), 'retard', 'partiel et échu : en retard');
  assert.equal(30_000 - (partial?.receivedCents ?? 0), 10_000, '10 000 centimes restent dus');

  const chr = seed.vehicles[1];
  const writtenOff = seed.payments.find((payment) => payment.vehicleId === chr?.id && payment.dueDate === '2026-09-21');
  assert.equal(writtenOff?.status, 'impaye');
  assert.equal(effectivePaymentStatus(writtenOff!, TODAY), 'impaye');
});

test('chaque paiement est un entier, et son montant reçu ne dépasse jamais ce qui est dû', () => {
  for (const payment of seed.payments) {
    assert.equal(Number.isInteger(payment.expectedCents), true);
    assert.equal(Number.isInteger(payment.receivedCents), true);
    assert.ok(payment.receivedCents <= payment.expectedCents, `paiement ${payment.id} : trop-perçu inattendu`);
    assert.ok(payment.receivedCents >= 0);
  }
});

test('les documents de démonstration montrent les trois états utiles', () => {
  const ahmed = seed.tenants[0];
  assert.ok(ahmed !== undefined);
  const documents = seed.tenantDocuments.filter((document) => document.tenantId === ahmed.id);

  // Le cas de référence : permis, pièce d'identité et carte VTC valides, assurance absente.
  const report = checkRentalEligibility({
    requirements: [
      { typeId: 'dt-Permis de conduire', label: 'Permis de conduire' },
      { typeId: "dt-Pièce d'identité", label: "Pièce d'identité" },
      { typeId: 'dt-Carte VTC', label: 'Carte VTC' },
      { typeId: "dt-Attestation d'assurance", label: "Attestation d'assurance" },
    ],
    documents: documents.map((document) => ({
      id: document.id,
      typeId: document.typeId,
      expiryDate: document.expiryDate,
    })),
    today: TODAY,
    warningDays: 30,
  });

  assert.equal(report.satisfied, false);
  assert.deepEqual(report.missing, ["Attestation d'assurance"]);
  assert.equal(report.message, "Impossible de valider complètement le dossier : attestation d'assurance manquant.");

  const expiring = documents.find((document) => document.typeId === 'dt-Carte VTC');
  assert.ok((expiring?.expiryDate ?? '') > TODAY, 'la carte VTC n’est pas encore expirée');
});

test('le jeu de démonstration contient un document expiré', () => {
  const karim = seed.tenants[2];
  const expired = seed.tenantDocuments.find(
    (document) => document.tenantId === karim?.id && (document.expiryDate ?? '') < TODAY,
  );
  assert.ok(expired !== undefined, 'un document expiré doit exister pour montrer l’état rouge');
});

test('aucun fichier n’est inventé : les documents de démonstration n’ont pas de pièce jointe', () => {
  // Créer des chemins de fichiers fictifs ferait afficher des vignettes vides et
  // laisserait croire à un défaut de l’application.
  for (const document of [...seed.tenantDocuments, ...seed.vehicleDocuments]) {
    assert.equal(document.fileId, null);
    assert.equal(document.fileName, '');
  }
  for (const vehicle of seed.vehicles) assert.equal(vehicle.photoFileId, null);
});

test('toutes les clés étrangères du jeu de démonstration désignent une ligne existante', () => {
  const vehicleIds = new Set(seed.vehicles.map((vehicle) => vehicle.id));
  const tenantIds = new Set(seed.tenants.map((tenant) => tenant.id));
  const rentalIds = new Set(seed.rentals.map((rental) => rental.id));
  const planIds = new Set(seed.maintenancePlans.map((plan) => plan.id));
  const inspectionIds = new Set(seed.inspections.map((inspection) => inspection.id));

  for (const rental of seed.rentals) {
    assert.ok(vehicleIds.has(rental.vehicleId), `location ${rental.id} : véhicule inconnu`);
    assert.ok(tenantIds.has(rental.tenantId), `location ${rental.id} : locataire inconnu`);
  }
  for (const payment of seed.payments) {
    assert.ok(rentalIds.has(payment.rentalId), `paiement ${payment.id} : location inconnue`);
    assert.ok(vehicleIds.has(payment.vehicleId));
    assert.ok(tenantIds.has(payment.tenantId));
  }
  for (const expense of seed.expenses) {
    assert.ok(vehicleIds.has(expense.vehicleId));
    assert.notEqual(expense.categoryId, '', 'chaque dépense porte une catégorie');
  }
  for (const record of seed.maintenanceRecords) {
    assert.ok(vehicleIds.has(record.vehicleId));
    if (record.planId !== null) assert.ok(planIds.has(record.planId));
  }
  for (const damage of seed.damages) {
    assert.ok(vehicleIds.has(damage.vehicleId));
    if (damage.inspectionId !== null) assert.ok(inspectionIds.has(damage.inspectionId));
  }
  for (const contract of seed.contracts) {
    assert.ok(rentalIds.has(contract.rentalId));
  }
});

test('les plans d’entretien couvrent des cas d’état différents', () => {
  const corolla = seed.vehicles[0];
  const plans = seed.maintenancePlans.filter((plan) => plan.vehicleId === corolla?.id);
  assert.ok(plans.length >= 4, 'plusieurs entretiens suivis sur la Corolla');

  const vidange = plans.find((plan) => plan.typeId === 'mt-Vidange');
  assert.equal(vidange?.intervalMode, 'mixte');
  assert.equal(vidange?.intervalKm, 20_000);
  assert.equal(vidange?.lastKm, 110_000, 'prochaine vidange à 130 000 km');

  const habitacle = plans.find((plan) => plan.typeId === 'mt-Filtre habitacle');
  assert.equal(habitacle?.lastKm, 105_000, 'prochaine échéance à 125 000 km, donc dépassée');
});

test('les identifiants du jeu de démonstration sont uniques', () => {
  const all = [
    ...seed.vehicles,
    ...seed.tenants,
    ...seed.rentals,
    ...seed.contracts,
    ...seed.payments,
    ...seed.expenses,
    ...seed.maintenancePlans,
    ...seed.maintenanceRecords,
    ...seed.mileageRecords,
    ...seed.inspections,
    ...seed.damages,
    ...seed.insurances,
    ...seed.tenantDocuments,
    ...seed.vehicleDocuments,
  ];
  const ids = all.map((entity) => entity.id);
  assert.equal(ids.length, new Set(ids).size, 'aucun doublon d’identifiant');
});

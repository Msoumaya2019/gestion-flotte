/**
 * Banc d'intégration : migrations, amorçage et dépôts sur un moteur SQLite **réel**.
 *
 * Ce banc ne vérifie pas des intentions, il exécute. Une colonne renommée dans le schéma
 * mais pas dans le mappeur, une clé étrangère oubliée, un `NOT NULL` violé par une donnée
 * de démonstration : tout cela échoue ici, et non sur l'écran de l'utilisateur.
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';

import { bootstrapDatabase, META_KEYS } from '@/data/bootstrap';
import { LATEST_VERSION, MIGRATIONS, runMigrations, TABLES } from '@/data/migrations';
import { createRepositories } from '@/data/repositories';
import { compareIso, todayIso } from '@/domain/dates';
import { effectivePaymentStatus, paymentBalance } from '@/domain/rental';
import { openTestDatabase, sequentialIds } from './helpers/sqlite';

const NOW = '2026-09-28T20:00:00.000Z';
const TODAY = '2026-09-28';

/** Amorce une base neuve avec les données de démonstration. */
async function bootstrapWithDemo() {
  const engine = openTestDatabase();
  const result = await bootstrapDatabase(engine.db, {
    newId: sequentialIds('demo'),
    now: NOW,
    today: TODAY,
    withDemoData: true,
  });
  return { engine, result };
}

// ---------------------------------------------------------------------------
// Migrations
// ---------------------------------------------------------------------------

test('les migrations créent toutes les tables déclarées', async () => {
  const engine = openTestDatabase();
  await runMigrations(engine.db, MIGRATIONS);

  for (const table of TABLES) {
    const row = engine.get("SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?", table);
    assert.notEqual(row, null, `table absente : ${table}`);
  }

  engine.close();
});

test('la version du schéma est inscrite dans la base', async () => {
  const engine = openTestDatabase();
  const version = await runMigrations(engine.db, MIGRATIONS);

  assert.equal(version, LATEST_VERSION);
  const row = engine.get('PRAGMA user_version');
  assert.equal(Number(row?.user_version), LATEST_VERSION);

  engine.close();
});

test('rejouer les migrations ne réapplique rien', async () => {
  const engine = openTestDatabase();
  await runMigrations(engine.db, MIGRATIONS);
  // Une seconde exécution ne doit ni lever — les `CREATE TABLE` échoueraient — ni remettre
  // la version à zéro.
  const again = await runMigrations(engine.db, MIGRATIONS);

  assert.equal(again, LATEST_VERSION);
  const row = engine.get('PRAGMA user_version');
  assert.equal(Number(row?.user_version), LATEST_VERSION);

  engine.close();
});

// ---------------------------------------------------------------------------
// Amorçage
// ---------------------------------------------------------------------------

test('l’amorçage installe les catalogues et les données de démonstration', async () => {
  const { engine, result } = await bootstrapWithDemo();

  assert.equal(result.demoInstalled, true);
  assert.ok(engine.count('expense_categories') >= 15, 'catégories de dépense');
  assert.ok(engine.count('payment_methods') >= 5, 'modes de paiement');
  assert.ok(engine.count('maintenance_types') >= 14, 'types d’entretien');
  assert.ok(engine.count('document_types') >= 10, 'types de documents');
  assert.ok(engine.count('clauses') >= 10, 'clauses de contrat');

  assert.equal(engine.count('vehicles'), 3);
  assert.equal(engine.count('tenants'), 3);
  assert.ok(engine.count('rentals') >= 3, 'locations');
  assert.ok(engine.count('payments') >= 8, 'loyers');
  assert.ok(engine.count('expenses') >= 20, 'dépenses');

  engine.close();
});

test('un second amorçage ne double pas les données de démonstration', async () => {
  const engine = openTestDatabase();
  const options = {
    newId: sequentialIds('demo'),
    now: NOW,
    today: TODAY,
    withDemoData: true,
  };

  const first = await bootstrapDatabase(engine.db, options);
  const vehiclesAfterFirst = engine.count('vehicles');
  const second = await bootstrapDatabase(engine.db, options);

  assert.equal(first.demoInstalled, true);
  assert.equal(second.demoInstalled, false, 'le jeu d’essai ne doit pas revenir');
  assert.equal(engine.count('vehicles'), vehiclesAfterFirst);

  engine.close();
});

test('sans données de démonstration, la base reste vide mais les catalogues sont là', async () => {
  const engine = openTestDatabase();
  await bootstrapDatabase(engine.db, {
    newId: sequentialIds('vierge'),
    now: NOW,
    today: TODAY,
    withDemoData: false,
  });

  assert.equal(engine.count('vehicles'), 0);
  assert.equal(engine.count('tenants'), 0);
  assert.ok(engine.count('expense_categories') > 0, 'les catalogues sont indispensables à la saisie');

  engine.close();
});

// ---------------------------------------------------------------------------
// Dépôts : aller-retour
// ---------------------------------------------------------------------------

test('un véhicule relu est identique à celui écrit, centimes compris', async () => {
  const { engine, result } = await bootstrapWithDemo();
  const { vehicles } = result.repositories;

  const original = (await vehicles.list())[0];
  assert.ok(original !== undefined);
  const reread = await vehicles.get(original.id);

  assert.notEqual(reread, null);
  assert.deepEqual(reread, original);

  engine.close();
});

test('les montants ne dérivent pas : ils sont stockés en centimes entiers', async () => {
  const { engine, result } = await bootstrapWithDemo();
  const row = engine.get('SELECT purchasePriceCents FROM vehicles ORDER BY purchasePriceCents DESC LIMIT 1');

  // 16 500 € doit valoir 1 650 000, et non 1 649 999,9999… comme le ferait un flottant.
  assert.equal(row?.purchasePriceCents, 1_650_000);
  const stored = engine.get('SELECT typeof(purchasePriceCents) AS kind FROM vehicles LIMIT 1');
  assert.equal(stored?.kind, 'integer');

  engine.close();
});

test('un champ absent reste nul et n’est pas confondu avec zéro', async () => {
  const { engine, result } = await bootstrapWithDemo();
  const { vehicles } = result.repositories;

  const vehicle = (await vehicles.list())[0];
  assert.ok(vehicle !== undefined);

  // On vide trois champs nullables, on relit, puis on les remplit et on relit encore. Un
  // `null` relu comme `0` ferait afficher « 0 € » au lieu de « non renseigné », et un
  // `null` relu comme `''` ferait disparaître la distinction entre absence et vide.
  await vehicles.update({ ...vehicle, year: null, purchaseDate: null, photoFileId: null });
  const emptied = await vehicles.get(vehicle.id);
  assert.equal(emptied?.year, null);
  assert.equal(emptied?.purchaseDate, null);
  assert.equal(emptied?.photoFileId, null);

  await vehicles.update({ ...vehicle, year: 2021, purchaseDate: '2024-03-15', photoFileId: 'fichier-1' });
  const filled = await vehicles.get(vehicle.id);
  assert.equal(filled?.year, 2021);
  assert.equal(filled?.purchaseDate, '2024-03-15');
  assert.equal(filled?.photoFileId, 'fichier-1');

  engine.close();
});

// ---------------------------------------------------------------------------
// Dépôts : archive et suppression
// ---------------------------------------------------------------------------

test('archiver retire de la liste sans effacer la ligne', async () => {
  const { engine, result } = await bootstrapWithDemo();
  const { vehicles } = result.repositories;

  const before = await vehicles.count();
  const target = (await vehicles.list())[0];
  assert.ok(target !== undefined);

  await vehicles.archive(target.id, NOW);

  assert.equal(await vehicles.count(), before - 1, 'la liste sans archives se réduit');
  assert.equal(await vehicles.count({ includeArchived: true }), before, 'la ligne est toujours là');
  assert.equal(engine.count('vehicles'), before, 'rien n’a été supprimé');

  const restored = await vehicles.restore(target.id);
  void restored;
  assert.equal(await vehicles.count(), before, 'restaurer remet le véhicule dans la liste');

  engine.close();
});

test('une clé étrangère empêche de supprimer un véhicule encore référencé', async () => {
  const { engine, result } = await bootstrapWithDemo();
  const { vehicles } = result.repositories;

  const rented = (await vehicles.list())[0];
  assert.ok(rented !== undefined);

  // `ON DELETE RESTRICT` doit refuser : la suppression est la seule opération que le
  // schéma interdit, et c'est celle qu'un écran de gestion propose le plus volontiers.
  await assert.rejects(() => vehicles.remove(rented.id));

  engine.close();
});

// ---------------------------------------------------------------------------
// Réglages et méta
// ---------------------------------------------------------------------------

test('les réglages se relisent avec leurs valeurs par défaut pour les clés absentes', async () => {
  const { engine, result } = await bootstrapWithDemo();
  const { settings } = result.repositories;

  const loaded = await settings.load();
  assert.equal(loaded.lockDelaySeconds, 60, 'valeur par défaut conservée');
  assert.ok(loaded.requiredDocumentTypeIds.length > 0, 'les documents obligatoires sont pré-remplis');
  assert.equal(loaded.seedVersion, 1, 'la version du jeu d’essai est inscrite');

  engine.close();
});

test('une modification partielle de réglage ne perd pas les autres valeurs', async () => {
  const { engine, result } = await bootstrapWithDemo();
  const { settings } = result.repositories;

  const before = await settings.load();
  const patched = await settings.patch({ lockDelaySeconds: 300 }, NOW);
  const reread = await settings.load();

  assert.equal(patched.lockDelaySeconds, 300);
  assert.equal(reread.lockDelaySeconds, 300);
  assert.deepEqual(reread.owner, before.owner, 'le profil du loueur est intact');
  assert.deepEqual(reread.requiredDocumentTypeIds, before.requiredDocumentTypeIds);

  engine.close();
});

test('la méta conserve et supprime une valeur', async () => {
  const { engine, result } = await bootstrapWithDemo();
  const { meta } = result.repositories;

  assert.equal(await meta.get(META_KEYS.pinHash), null);
  await meta.set(META_KEYS.pinHash, '{"algorithm":"pbkdf2-sha256"}');
  assert.equal(await meta.get(META_KEYS.pinHash), '{"algorithm":"pbkdf2-sha256"}');
  await meta.remove(META_KEYS.pinHash);
  assert.equal(await meta.get(META_KEYS.pinHash), null);

  engine.close();
});

// ---------------------------------------------------------------------------
// Cohérence du jeu d'essai
// ---------------------------------------------------------------------------

test('le jeu d’essai reste cohérent : chaque loyer pointe une location existante', async () => {
  const { engine, result } = await bootstrapWithDemo();
  const orphans = engine.all(
    'SELECT p.id FROM payments p LEFT JOIN rentals r ON r.id = p.rentalId WHERE r.id IS NULL',
  );
  assert.deepEqual(orphans, []);

  const { payments } = result.repositories;
  assert.ok((await payments.list()).length > 0);

  engine.close();
});

test('le jeu d’essai contient un loyer partiel, déduit des montants et non stocké', async () => {
  const { engine, result } = await bootstrapWithDemo();
  const { payments } = result.repositories;

  const all = await payments.list();

  // Le statut « partiel » n'est **jamais** écrit en base : le statut stocké ne porte que les
  // décisions humaines. Un loyer à moitié encaissé est donc stocké `a_venir` avec des
  // montants qui ne concordent pas, et c'est le calcul qui le dit. L'assertion porte donc
  // sur les montants ET sur le statut dérivé — vérifier seulement le statut stocké
  // reviendrait à ne rien vérifier.
  const partial = all.filter(
    (payment) => payment.receivedCents > 0 && payment.receivedCents < payment.expectedCents,
  );
  assert.ok(partial.length >= 1, 'un encaissement partiel est nécessaire pour éprouver le reste dû');

  const stored = engine.get(
    'SELECT status FROM payments WHERE receivedCents > 0 AND receivedCents < expectedCents LIMIT 1',
  );
  assert.equal(stored?.status, 'a_venir', 'le statut stocké ne doit pas figer « partiel »');

  // Sur la date de référence du jeu d'essai, ce loyer est échu : il doit donc apparaître
  // en retard, avec un reste dû exact.
  const reference = partial[0];
  assert.ok(reference !== undefined);
  const balance = paymentBalance(reference);
  assert.equal(balance.settled, false);
  assert.ok(balance.remainingCents > 0);
  assert.equal(
    effectivePaymentStatus(reference, TODAY),
    compareIso(reference.dueDate, TODAY) < 0 ? 'retard' : 'partiel',
  );

  const unpaid = all.filter((payment) => effectivePaymentStatus(payment, TODAY) === 'impaye');
  assert.ok(unpaid.length >= 1, 'un impayé est nécessaire pour éprouver le badge rouge');

  engine.close();
});

test('la base de démonstration est datée d’aujourd’hui, pas d’une date figée', async () => {
  const engine = openTestDatabase();
  // Le jeu d'essai doit rester crédible quel que soit le jour où il est installé : une
  // location de démonstration qui se terminerait dans le passé donnerait un tableau de
  // bord vide, et l'utilisateur croirait l'application cassée.
  await bootstrapDatabase(engine.db, {
    newId: sequentialIds('date'),
    now: NOW,
    today: todayIso(),
    withDemoData: true,
  });

  const repositories = createRepositories(engine.db);
  const rentals = await repositories.rentals.list();
  const active = rentals.filter((rental) => rental.status === 'active');
  assert.ok(active.length >= 1, 'au moins une location doit être en cours');
  assert.ok(active.every((rental) => rental.startDate <= todayIso()));

  engine.close();
});

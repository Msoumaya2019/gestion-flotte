/**
 * Le comptage des références, sur un moteur SQLite réel.
 *
 * Deux choses se prouvent ici, et la seconde est la plus importante :
 *
 * 1. Les comptes correspondent à ce que contient la base, table par table.
 * 2. **La base refuse d'elle-même** de détruire une fiche référencée. C'est le socle de
 *    toute la fonction : si `ON DELETE RESTRICT` ne s'appliquait pas, un `DELETE` distrait
 *    emporterait l'historique sans que rien ne le dise, et le comptage ne serait qu'un
 *    ornement.
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';

import { MIGRATIONS, runMigrations } from '@/data/migrations';
import { createRepositories } from '@/data/repositories';
import { openTestDatabase, type TestDatabase } from './helpers/sqlite';

const NOW = '2026-09-28T20:00:00.000Z';
const TODAY = '2026-09-28';

/** Insère une ligne minimale : le schéma porte les valeurs par défaut du reste. */
async function inserer(db: TestDatabase['db'], sql: string, ...params: string[]): Promise<void> {
  await db.runAsync(sql, ...params);
}

/**
 * Une base peuplée d'**une ligne dans chacune des tables** qui désignent un véhicule.
 *
 * Un véhicule et un locataire, puis tout ce qui peut s'y rattacher. Chaque famille est
 * représentée une fois : si une table manque à l'appel dans la requête de comptage, le
 * total de `autres` baisse et le test le dit.
 */
async function basePeuplee(): Promise<{ engine: TestDatabase; v: string; t: string; r: string }> {
  const engine = openTestDatabase();
  await runMigrations(engine.db, MIGRATIONS);
  const db = engine.db;

  const v = 'v-1';
  const t = 't-1';
  const r = 'r-1';

  await inserer(db, 'INSERT INTO vehicles (id, createdAt, updatedAt) VALUES (?, ?, ?)', v, NOW, NOW);
  await inserer(db, 'INSERT INTO tenants (id, createdAt, updatedAt) VALUES (?, ?, ?)', t, NOW, NOW);
  await inserer(db, 'INSERT INTO maintenance_types (id, createdAt, updatedAt, label) VALUES (?, ?, ?, ?)', 'mt-1', NOW, NOW, 'Vidange');
  await inserer(db, 'INSERT INTO document_types (id, createdAt, updatedAt, label) VALUES (?, ?, ?, ?)', 'dt-1', NOW, NOW, 'Permis');
  await inserer(db, 'INSERT INTO expense_categories (id, createdAt, updatedAt, label) VALUES (?, ?, ?, ?)', 'ec-1', NOW, NOW, 'Carburant');

  await inserer(db, 'INSERT INTO rentals (id, createdAt, updatedAt, vehicleId, tenantId, startDate, status) VALUES (?, ?, ?, ?, ?, ?, ?)', r, NOW, NOW, v, t, TODAY, 'active');
  await inserer(db, 'INSERT INTO payments (id, createdAt, updatedAt, rentalId, vehicleId, tenantId, dueDate) VALUES (?, ?, ?, ?, ?, ?, ?)', 'p-1', NOW, NOW, r, v, t, TODAY);
  await inserer(db, 'INSERT INTO contracts (id, createdAt, updatedAt, rentalId, reference) VALUES (?, ?, ?, ?, ?)', 'c-1', NOW, NOW, r, 'CT-2026-001');
  await inserer(db, 'INSERT INTO expenses (id, createdAt, updatedAt, vehicleId, date, categoryId) VALUES (?, ?, ?, ?, ?, ?)', 'e-1', NOW, NOW, v, TODAY, 'ec-1');
  await inserer(db, 'INSERT INTO maintenance_plans (id, createdAt, updatedAt, vehicleId, typeId) VALUES (?, ?, ?, ?, ?)', 'mp-1', NOW, NOW, v, 'mt-1');
  await inserer(db, 'INSERT INTO maintenance_records (id, createdAt, updatedAt, vehicleId, typeId, date) VALUES (?, ?, ?, ?, ?, ?)', 'mr-1', NOW, NOW, v, 'mt-1', TODAY);
  await inserer(db, 'INSERT INTO mileage_records (id, createdAt, updatedAt, vehicleId, date) VALUES (?, ?, ?, ?, ?)', 'km-1', NOW, NOW, v, TODAY);
  await inserer(db, 'INSERT INTO inspections (id, createdAt, updatedAt, rentalId, vehicleId, date) VALUES (?, ?, ?, ?, ?, ?)', 'i-1', NOW, NOW, r, v, TODAY);
  await inserer(db, 'INSERT INTO damages (id, createdAt, updatedAt, vehicleId, date) VALUES (?, ?, ?, ?, ?)', 'd-1', NOW, NOW, v, TODAY);
  await inserer(db, 'INSERT INTO insurances (id, createdAt, updatedAt, vehicleId) VALUES (?, ?, ?, ?)', 'as-1', NOW, NOW, v);
  await inserer(db, 'INSERT INTO vehicle_documents (id, createdAt, updatedAt, vehicleId, typeId) VALUES (?, ?, ?, ?, ?)', 'vd-1', NOW, NOW, v, 'dt-1');
  await inserer(db, 'INSERT INTO tenant_documents (id, createdAt, updatedAt, tenantId, typeId) VALUES (?, ?, ?, ?, ?)', 'td-1', NOW, NOW, t, 'dt-1');

  return { engine, v, t, r };
}

test('un véhicule neuf ne porte rien', async () => {
  const engine = openTestDatabase();
  await runMigrations(engine.db, MIGRATIONS);
  await engine.db.runAsync('INSERT INTO vehicles (id, createdAt, updatedAt) VALUES (?, ?, ?)', 'v-1', NOW, NOW);
  const { liens } = createRepositories(engine.db);
  assert.deepEqual(await liens.pourVehicule('v-1'), {
    locationsEnCours: 0,
    locations: 0,
    echeances: 0,
    depenses: 0,
    entretiens: 0,
    documents: 0,
    autres: 0,
  });
  engine.close();
});

test('chaque famille rattachée à un véhicule est comptée', async () => {
  const { engine, v } = await basePeuplee();
  const { liens } = createRepositories(engine.db);
  assert.deepEqual(await liens.pourVehicule(v), {
    locationsEnCours: 1,
    locations: 1,
    echeances: 1,
    depenses: 1,
    entretiens: 1,
    documents: 1,
    // Plan, relevé, état des lieux, dommage, assurance : les cinq tables de `autres`.
    autres: 5,
  });
  engine.close();
});

test('un locataire ne porte ni dépense ni entretien', async () => {
  const { engine, t } = await basePeuplee();
  const { liens } = createRepositories(engine.db);
  // Les dépenses et les entretiens désignent un véhicule, jamais un locataire : les
  // compter ici ferait refuser un retrait pour une raison qui n'existe pas.
  assert.deepEqual(await liens.pourLocataire(t), {
    locationsEnCours: 1,
    locations: 1,
    echeances: 1,
    depenses: 0,
    entretiens: 0,
    documents: 1,
    autres: 0,
  });
  engine.close();
});

test('une location archivée n’est plus « en cours », mais reste comptée', async () => {
  const { engine, v, r } = await basePeuplee();
  await engine.db.runAsync('UPDATE rentals SET archivedAt = ? WHERE id = ?', NOW, r);
  const { liens } = createRepositories(engine.db);
  const compte = await liens.pourVehicule(v);
  // Sinon une location annulée bloquerait à jamais le retrait du véhicule.
  assert.equal(compte.locationsEnCours, 0);
  // Mais la ligne existe toujours, et elle désigne encore le véhicule.
  assert.equal(compte.locations, 1);
  engine.close();
});

test('une location terminée n’est plus « en cours », et reste comptée', async () => {
  const { engine, v, r } = await basePeuplee();
  await engine.db.runAsync('UPDATE rentals SET status = ? WHERE id = ?', 'terminee', r);
  const { liens } = createRepositories(engine.db);
  const compte = await liens.pourVehicule(v);
  assert.equal(compte.locationsEnCours, 0);
  assert.equal(compte.locations, 1);
  engine.close();
});

test('une location archivée ne bloque plus le retrait d’un locataire', async () => {
  const { engine, t, r } = await basePeuplee();
  await engine.db.runAsync('UPDATE rentals SET archivedAt = ? WHERE id = ?', NOW, r);
  const { liens } = createRepositories(engine.db);
  const compte = await liens.pourLocataire(t);
  // Le même piège que côté véhicule, et il se paie de la même façon : une location
  // annulée qui bloquerait à jamais le retrait d'une fiche.
  assert.equal(compte.locationsEnCours, 0);
  assert.equal(compte.locations, 1);
  engine.close();
});

test('la base refuse de supprimer un véhicule référencé', async () => {
  const { engine, v } = await basePeuplee();
  // C'est la garantie qui double le comptage. Si cette assertion tombait, tout le
  // dispositif ne reposerait plus que sur la politesse de l'interface.
  await assert.rejects(
    () => engine.db.runAsync('DELETE FROM vehicles WHERE id = ?', v),
    /FOREIGN KEY|constraint/i,
  );
  assert.equal(engine.get('SELECT COUNT(*) AS n FROM vehicles')?.n, 1);
  engine.close();
});

test('la base refuse de supprimer un locataire référencé', async () => {
  const { engine, t } = await basePeuplee();
  await assert.rejects(
    () => engine.db.runAsync('DELETE FROM tenants WHERE id = ?', t),
    /FOREIGN KEY|constraint/i,
  );
  assert.equal(engine.get('SELECT COUNT(*) AS n FROM tenants')?.n, 1);
  engine.close();
});

test('un véhicule sans aucune référence est réellement supprimable', async () => {
  const engine = openTestDatabase();
  await runMigrations(engine.db, MIGRATIONS);
  await engine.db.runAsync('INSERT INTO vehicles (id, createdAt, updatedAt) VALUES (?, ?, ?)', 'v-seul', NOW, NOW);
  // Le pendant du test précédent : la contrainte ne bloque pas tout, seulement ce qui est
  // désigné. Sans ce cas, un `RESTRICT` trop large passerait pour un fonctionnement normal.
  await engine.db.runAsync('DELETE FROM vehicles WHERE id = ?', 'v-seul');
  assert.equal(engine.get('SELECT COUNT(*) AS n FROM vehicles')?.n, 0);
  engine.close();
});

test('l’inventaire compte chaque table déclarée et somme juste', async () => {
  const { engine } = await basePeuplee();
  const { liens } = createRepositories(engine.db);
  const inventaire = await liens.inventaire();

  const parCle = new Map(inventaire.lignes.map((ligne) => [ligne.cle, ligne.nombre]));
  assert.equal(parCle.get('vehicules'), 1);
  assert.equal(parCle.get('locataires'), 1);
  assert.equal(parCle.get('locations'), 1);
  assert.equal(parCle.get('echeances'), 1);
  assert.equal(parCle.get('depenses'), 1);
  assert.equal(parCle.get('entretiens'), 1);
  assert.equal(parCle.get('plans'), 1);
  assert.equal(parCle.get('kilometrages'), 1);
  assert.equal(parCle.get('assurances'), 1);
  assert.equal(parCle.get('etatsDesLieux'), 1);
  assert.equal(parCle.get('dommages'), 1);
  assert.equal(parCle.get('documents'), 1);
  assert.equal(parCle.get('documentsVehicule'), 1);
  assert.equal(parCle.get('contrats'), 1);

  assert.equal(
    inventaire.total,
    inventaire.lignes.reduce((somme, ligne) => somme + ligne.nombre, 0),
  );
  assert.equal(inventaire.total, 14);
  engine.close();
});

test('l’inventaire d’une base vide annonce zéro, et ses libellés sont accordés', async () => {
  const engine = openTestDatabase();
  await runMigrations(engine.db, MIGRATIONS);
  const { liens } = createRepositories(engine.db);
  const inventaire = await liens.inventaire();
  assert.equal(inventaire.total, 0);
  // Zéro prend le singulier en français : « 0 véhicule », jamais « 0 véhicules ».
  assert.equal(inventaire.lignes[0]?.libelle, '0 véhicule');
  assert.equal(
    inventaire.lignes.find((ligne) => ligne.cle === 'etatsDesLieux')?.libelle,
    '0 état des lieux',
  );
  // Chaque ligne annonce bien son compte, sans exception.
  assert.ok(inventaire.lignes.every((ligne) => ligne.libelle.startsWith('0 ')));
  engine.close();
});

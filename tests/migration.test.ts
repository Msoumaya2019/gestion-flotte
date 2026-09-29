/**
 * Banc de migration : une base **ancienne et remplie** doit rejoindre la forme d'une base neuve.
 *
 * ## Pourquoi ce banc existe, et pourquoi il arrive avec la version 2
 *
 * Tant que le schéma n'avait qu'une version, il n'y avait rien à migrer : une base neuve
 * jouait tout, et c'était tout. La version 2 ajoute une colonne à `rentals`, et c'est le
 * premier changement qui doit traverser une base **déjà installée**.
 *
 * Ce que la relecture ne voit pas : une base neuve se construit bien, les tests passent, et le
 * défaut n'apparaît que sur un appareil qui a déjà servi — c'est-à-dire partout sauf sur la
 * machine où le code est écrit. Une migration est donc l'un des rares endroits où il faut une
 * vieille base, remplie, migrée pour de vrai.
 *
 * ## Le contrôle décisif n'est pas « les données sont encore là »
 *
 * C'est « la base migrée a la **même forme** qu'une base neuve ». Une colonne oubliée par la
 * migration passe le premier contrôle et échoue au second. La forme se lit sur `PRAGMA
 * table_info` — colonnes **et leur ordre** — plus `sqlite_master` pour les index.
 *
 * ## Trois gardes contre le faux vert
 *
 * 1. la base de départ ne doit **pas** déjà porter la colonne — sinon le banc migre une base à
 *    jour et reste vert sans rien mesurer ;
 * 2. la table visée ne doit pas être **vide** — `ALTER TABLE` réussit aussi bien sur une table
 *    sans lignes, et la reprise de données ne serait alors pas éprouvée ;
 * 3. le nombre de tables doit correspondre à `TABLES` — une table ajoutée sans y figurer
 *    survivrait à une remise à zéro.
 */

import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, test } from 'node:test';

import { LATEST_VERSION, MIGRATIONS, runMigrations, TABLES } from '@/data/migrations';
import { openTestDatabaseAt, type TestDatabase } from './helpers/sqlite';

const NOW = '2026-09-28T20:00:00.000Z';

/** La version dont on part : celle d'avant la dernière, quelle qu'elle soit. */
const AVANT = LATEST_VERSION - 1;

/**
 * Le dossier des bases temporaires.
 *
 * Deux bases **distinctes** sont nécessaires — l'ancienne et la neuve — et `:memory:` ne le
 * permet pas : deux connexions sur cette valeur désignent la même base, et le banc comparerait
 * une base à elle-même.
 */
const DOSSIER = mkdtempSync(join(tmpdir(), 'gestion-flotte-migration-'));
after(() => {
  // Sous Windows, un fichier encore ouvert ne se supprime pas : les bases sont fermées par
  // chaque cas avant d'arriver ici.
  try {
    rmSync(DOSSIER, { recursive: true, force: true });
  } catch {
    // Un résidu de dossier temporaire ne doit pas faire échouer la suite.
  }
});

/** Construit une base à la version `AVANT`, en jouant les migrations une par une. */
async function baseAncienne(nom: string): Promise<TestDatabase> {
  const engine = openTestDatabaseAt(join(DOSSIER, `${nom}.sqlite`));
  for (const migration of MIGRATIONS.filter((m) => m.version <= AVANT)) {
    for (const statement of migration.statements) {
      await engine.db.execAsync(statement);
    }
    await engine.db.execAsync(`PRAGMA user_version = ${migration.version};`);
  }
  return engine;
}

/** Construit une base neuve, par **toutes** les migrations : c'est la forme de référence. */
async function baseNeuve(nom: string): Promise<TestDatabase> {
  const engine = openTestDatabaseAt(join(DOSSIER, `${nom}.sqlite`));
  await runMigrations(engine.db, MIGRATIONS);
  return engine;
}

/**
 * La forme d'une base : tables, colonnes **dans l'ordre**, et index.
 *
 * Les tables sont comptées par leur propre requête, et non en découpant des lignes qui
 * mélangeraient tables et index : ce découpage s'était déjà trompé sur un schéma pourtant juste.
 */
function forme(engine: TestDatabase): string[] {
  const lignes: string[] = [];

  const tables = engine.all(
    "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name",
  ) as { name: string }[];
  for (const { name } of tables) {
    const colonnes = engine.all(`PRAGMA table_info(${name})`) as { name: string }[];
    lignes.push(`${name}(${colonnes.map((c) => c.name).join(', ')})`);
  }

  const index = engine.all(
    "SELECT name FROM sqlite_master WHERE type = 'index' AND name NOT LIKE 'sqlite_%' ORDER BY name",
  ) as { name: string }[];
  lignes.push(`index(${index.map((i) => i.name).join(', ')})`);

  return lignes;
}

/**
 * Remplit la base ancienne.
 *
 * Les colonnes omises sont celles qui portent un `DEFAULT` : n'énumérer que le nécessaire
 * garde le jeu d'essai lisible, et c'est la forme du schéma ancien qui compte, pas l'exhaustivité.
 */
async function remplir(engine: TestDatabase): Promise<void> {
  const q = async (sql: string, ...params: (string | number | null)[]) => {
    await engine.db.runAsync(sql, ...params);
  };

  await q(
    `INSERT INTO vehicles (id, createdAt, updatedAt, brand, model, plate, currentMileageKm)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    'veh-1', NOW, NOW, 'Toyota', 'Corolla', 'AB-123-CD', 118_000,
  );
  await q(
    `INSERT INTO vehicles (id, createdAt, updatedAt, archivedAt, brand, model, plate)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    'veh-2', NOW, NOW, NOW, 'Citroën', 'C5', 'EF-456-GH',
  );
  await q(
    `INSERT INTO tenants (id, createdAt, updatedAt, firstName, lastName, phone)
     VALUES (?, ?, ?, ?, ?, ?)`,
    'loc-1', NOW, NOW, 'Ahmed', 'Benali', '06 12 34 56 78',
  );

  // La location qui porte l'enjeu : hebdomadaire, ancrée au lundi. C'est sur elle que la
  // colonne ajoutée change quelque chose.
  await q(
    `INSERT INTO rentals (id, createdAt, updatedAt, vehicleId, tenantId, startDate, rentAmountCents, frequency, dueWeekday, status)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    'rent-1', NOW, NOW, 'veh-1', 'loc-1', '2026-07-06', 30_000, 'hebdomadaire', 1, 'active',
  );
  await q(
    `INSERT INTO payments (id, createdAt, updatedAt, rentalId, vehicleId, tenantId, dueDate, expectedCents, receivedCents, status)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    'rent-1:2026-07-06', NOW, NOW, 'rent-1', 'veh-1', 'loc-1', '2026-07-06', 30_000, 30_000, 'paye',
  );
}

// ---------------------------------------------------------------------------
// Les gardes : le décor doit être ce qu'on croit
// ---------------------------------------------------------------------------

test('la base de départ est bien antérieure, et ne porte pas encore la colonne', async () => {
  const engine = await baseAncienne('garde-colonne');
  const colonnes = engine.all('PRAGMA table_info(rentals)') as { name: string }[];
  const noms = colonnes.map((c) => c.name);

  assert.equal(noms.includes('paymentTiming'), false, 'la base ancienne porte déjà la colonne : le banc ne mesurerait rien');
  assert.equal(Number(engine.get('PRAGMA user_version')?.user_version), AVANT);

  engine.close();
});

test('la table visée n’est pas vide avant la migration', async () => {
  const engine = await baseAncienne('garde-vide');
  await remplir(engine);

  // `ALTER TABLE` réussit aussi bien sur une table sans lignes : sans cette garde, la reprise
  // de données ne serait pas éprouvée, et le banc serait vert pour la mauvaise raison.
  assert.ok(engine.count('rentals') > 0, 'la table rentals doit porter des lignes');
  assert.ok(engine.count('payments') > 0);
  assert.ok(engine.count('vehicles') > 0);

  engine.close();
});

test('le nombre de tables correspond à la constante TABLES', async () => {
  const engine = await baseNeuve('garde-tables');
  const tables = engine.all(
    "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'",
  ) as { name: string }[];

  assert.equal(tables.length, TABLES.length, 'une table échapperait à une remise à zéro');

  engine.close();
});

// ---------------------------------------------------------------------------
// La migration elle-même
// ---------------------------------------------------------------------------

test('la base ancienne migrée a la même forme qu’une base neuve', async () => {
  const ancienne = await baseAncienne('forme-ancienne');
  await remplir(ancienne);
  const atteinte = await runMigrations(ancienne.db, MIGRATIONS);

  const neuve = await baseNeuve('forme-neuve');

  assert.equal(atteinte, LATEST_VERSION);
  assert.deepEqual(forme(ancienne), forme(neuve));

  ancienne.close();
  neuve.close();
});

test('les locations déjà enregistrées survivent et prennent le paiement d’avance', async () => {
  const engine = await baseAncienne('reprise');
  await remplir(engine);
  await runMigrations(engine.db, MIGRATIONS);

  const rental = engine.get('SELECT * FROM rentals WHERE id = ?', 'rent-1');
  assert.notEqual(rental, null);
  assert.equal(rental?.startDate, '2026-07-06');
  assert.equal(rental?.rentAmountCents, 30_000);
  assert.equal(rental?.frequency, 'hebdomadaire');
  assert.equal(rental?.dueWeekday, 1);

  // Le défaut de la colonne est le comportement d'avant : une location existante continue
  // d'être payée le premier jour. Sans ce `DEFAULT`, la colonne serait `NULL` et l'échéancier
  // changerait de sens en silence.
  assert.equal(rental?.paymentTiming, 'debut');

  engine.close();
});

test('une ligne archivée reste archivée après la migration', async () => {
  const engine = await baseAncienne('pierre-tombale');
  await remplir(engine);
  await runMigrations(engine.db, MIGRATIONS);

  const archive = engine.get('SELECT archivedAt FROM vehicles WHERE id = ?', 'veh-2');
  assert.equal(archive?.archivedAt, NOW, 'une suppression logique doit rester morte');

  engine.close();
});

test('les lignes dépendantes ne sont pas perdues', async () => {
  const engine = await baseAncienne('dependances');
  await remplir(engine);
  await runMigrations(engine.db, MIGRATIONS);

  assert.equal(engine.count('payments'), 1);
  const payment = engine.get('SELECT * FROM payments WHERE id = ?', 'rent-1:2026-07-06');
  assert.equal(payment?.receivedCents, 30_000);
  assert.equal(payment?.status, 'paye');

  engine.close();
});

test('rejouer les migrations sur une base déjà à jour ne fait rien', async () => {
  const engine = await baseAncienne('idempotence');
  await remplir(engine);
  await runMigrations(engine.db, MIGRATIONS);

  // `ALTER TABLE ... ADD COLUMN` sur une colonne existante lèverait `duplicate column name` :
  // c'est ce que la garde de version empêche, et c'est ce que ce cas vérifie.
  const seconde = await runMigrations(engine.db, MIGRATIONS);
  assert.equal(seconde, LATEST_VERSION);
  assert.equal(engine.count('rentals'), 1);

  engine.close();
});

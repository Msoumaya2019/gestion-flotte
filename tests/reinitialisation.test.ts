/**
 * Vider les données, et tout remettre à zéro — sur une base **réellement peuplée**.
 *
 * Un effacement ne se prouve pas sur une base vide : tout y est déjà à zéro, et le banc
 * serait vert même si la liste des tables était fausse. Le jeu de démonstration sert donc
 * de matière : il remplit quatorze tables, et c'est leur vidage qu'on mesure.
 *
 * La couverture est éprouvée à part, et c'est le contrôle le plus important du fichier :
 * une table ajoutée au schéma et oubliée dans les listes survivrait à un « tout
 * supprimer » sans que rien ne le dise.
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';

import { bootstrapDatabase } from '@/data/bootstrap';
import { TABLES } from '@/data/migrations';
import { DEFAULT_SETTINGS } from '@/domain/settings';
import {
  remettreAZero,
  TABLES_CONFIGURATION,
  TABLES_REFERENCE,
  TABLES_VIDEES,
  viderLesDonnees,
} from '@/services/reinitialisation';
import { openTestDatabase, sequentialIds } from './helpers/sqlite';

const NOW = '2026-09-28T20:00:00.000Z';
const TODAY = '2026-09-28';

/** Les tables que le jeu de démonstration remplit réellement. */
const PEUPLÉES_PAR_LA_DÉMO = TABLES_VIDEES.filter(
  (table) => table !== 'notifications' && table !== 'files',
);

async function baseDemo() {
  const engine = openTestDatabase();
  const result = await bootstrapDatabase(engine.db, {
    newId: sequentialIds('demo'),
    now: NOW,
    today: TODAY,
    withDemoData: true,
  });
  return { engine, result };
}

test('les trois listes recouvrent toutes les tables, une fois chacune', () => {
  const toutes = [...TABLES_VIDEES, ...TABLES_REFERENCE, ...TABLES_CONFIGURATION];
  assert.equal(new Set(toutes).size, toutes.length, 'une table est classée deux fois');
  assert.deepEqual(
    [...toutes].sort(),
    [...TABLES].sort(),
    'une table du schéma n’est classée nulle part : elle survivrait à un « tout supprimer »',
  );
});

test('le jeu de démonstration remplit bien les tables que le banc mesure', async () => {
  const { engine } = await baseDemo();
  // Sans cette vérification, les tests suivants seraient verts sur une base vide et ne
  // mesureraient rien.
  const vides = PEUPLÉES_PAR_LA_DÉMO.filter((table) => engine.count(table) === 0);
  assert.deepEqual(vides, [], `tables laissées vides par la démonstration : ${vides.join(', ')}`);
  engine.close();
});

test('vider les données efface l’exploitation et laisse les catalogues et les réglages', async () => {
  const { engine, result } = await baseDemo();
  const metaAvant = engine.count('meta');

  await viderLesDonnees(engine.db, result.repositories, null);

  for (const table of TABLES_VIDEES) {
    assert.equal(engine.count(table), 0, `table non vidée : ${table}`);
  }
  for (const table of TABLES_REFERENCE) {
    assert.ok(engine.count(table) > 0, `catalogue vidé à tort : ${table}`);
  }
  // Les réglages survivent, code compris : « vider » n'oblige pas à tout reconfigurer.
  assert.equal(engine.count('settings'), 1);
  assert.equal(engine.count('meta'), metaAvant, 'la méta n’est pas touchée');
  engine.close();
});

test('vider les données laisse le code en place', async () => {
  const { engine, result } = await baseDemo();
  await result.repositories.meta.set('security.pinHash', 'empreinte');
  await viderLesDonnees(engine.db, result.repositories, null);
  // Un simple ménage ne doit pas déverrouiller l'application.
  assert.equal(engine.get("SELECT value FROM meta WHERE key = 'security.pinHash'")?.value, 'empreinte');
  engine.close();
});

test('tout remettre à zéro réamorce les catalogues et remet les réglages par défaut', async () => {
  const { engine, result } = await baseDemo();
  await result.repositories.meta.set('security.pinHash', 'empreinte');
  await result.repositories.settings.patch({ owner: { ...DEFAULT_SETTINGS.owner, firstName: 'Amine' } }, NOW);

  await remettreAZero(engine.db, result.repositories, null, {
    newId: sequentialIds('neuf'),
    now: NOW,
    today: TODAY,
  });

  for (const table of TABLES_VIDEES) {
    assert.equal(engine.count(table), 0, `table non vidée : ${table}`);
  }
  // Les catalogues ne sont pas laissés vides : une application sans type de document ni
  // moyen de paiement ne serait plus utilisable.
  for (const table of TABLES_REFERENCE) {
    assert.ok(engine.count(table) > 0, `catalogue non réamorcé : ${table}`);
  }
  // L'empreinte du code a disparu : la remise à zéro redemande un code.
  assert.equal(engine.get("SELECT COUNT(*) AS n FROM meta WHERE key = 'security.pinHash'")?.n, 0);

  const settings = await result.repositories.settings.load();
  assert.equal(settings.owner.firstName, '', 'le profil du loueur est revenu à vide');
  assert.equal(settings.pinEnabled, false);
  assert.deepEqual(settings.reminderDays, DEFAULT_SETTINGS.reminderDays);
  // La liste des documents obligatoires est recalculée sur les types réamorcés.
  assert.ok(settings.requiredDocumentTypeIds.length > 0);
  engine.close();
});

test('tout remettre à zéro ne réinstalle pas les données de démonstration', async () => {
  const { engine, result } = await baseDemo();
  await remettreAZero(engine.db, result.repositories, null, {
    newId: sequentialIds('neuf'),
    now: NOW,
    today: TODAY,
  });
  // C'est la promesse de `bootstrap` : un jeu d'essai ne revient pas chez quelqu'un qui
  // vient d'effacer ses données.
  assert.equal(engine.count('vehicles'), 0);
  assert.equal(engine.count('tenants'), 0);
  const settings = await result.repositories.settings.load();
  assert.equal(settings.seedVersion, DEFAULT_SETTINGS.seedVersion);
  engine.close();
});

test('les tables sont vidées dans un ordre que les clés étrangères acceptent', async () => {
  const { engine, result } = await baseDemo();
  // Le désordre se paierait ici : `DELETE FROM vehicles` avant `rentals` lève, et
  // l'effacement s'arrêterait à mi-chemin. Le test ne fait rien de plus que vider — mais
  // il le fait sur une base où les onze références existent.
  await assert.doesNotReject(() => viderLesDonnees(engine.db, result.repositories, null));
  engine.close();
});

test('une base déjà vide se vide sans erreur', async () => {
  const engine = openTestDatabase();
  const result = await bootstrapDatabase(engine.db, { newId: sequentialIds('vide'), now: NOW, today: TODAY });
  // Sans jeu de démonstration : c'est le cas d'une application fraîchement installée.
  await assert.doesNotReject(() => viderLesDonnees(engine.db, result.repositories, null));
  for (const table of TABLES_REFERENCE) {
    assert.ok(engine.count(table) > 0, `catalogue perdu : ${table}`);
  }
  engine.close();
});

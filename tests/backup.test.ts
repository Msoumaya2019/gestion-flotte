/**
 * Sauvegarde et restauration : l'archive fait-elle le tour sans rien perdre ?
 *
 * ## Pourquoi ce banc compte plus que les autres
 *
 * La restauration **efface toutes les tables** avant de réinsérer. Une erreur ici ne se
 * traduit pas par un écran vide : elle se traduit par la disparition des données de
 * l'utilisateur. C'est le seul endroit du projet où un défaut est irréversible, et c'est
 * donc le seul où un banc mérite d'être écrit avant de s'y fier.
 *
 * ## Ce qui est éprouvé pour de bon
 *
 * Les migrations, le dump et la restauration s'exécutent contre un **vrai moteur SQLite**
 * (`node:sqlite`), avec les clés étrangères actives. Une archive dont une ligne violerait
 * une contrainte est donc réellement refusée, et non supposée refusée.
 *
 * ## Ce qui ne l'est pas
 *
 * Le chiffrement est éprouvé par `crypto.test.ts` ; ici on l'emploie avec un petit nombre
 * d'itérations, pour que la suite reste rapide. Ce qui est vérifié ici, c'est que
 * l'**enveloppe** porte bien de quoi redériver la clé, et qu'un mauvais mot de passe est
 * refusé.
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { META_KEYS, bootstrapDatabase } from '@/data/bootstrap';
import { TABLES } from '@/data/migrations';
import type { Row } from '@/data/sql';
import { seededRandomBytes } from '@/domain/ids';
import {
  MIN_BACKUP_PASSWORD,
  assertPasswordAcceptable,
  buildBackupPayload,
  createBackupFile,
  openBackupEnvelope,
  restoreBackup,
  sealBackupPayload,
  summarizeBackup,
  type BackupPayload,
} from '@/services/backup';
import { bytesToUtf8, createVaultKey, utf8Bytes } from '@/services/crypto';
import { createVaultFileStore, type FilePort } from '@/services/file-store';
import { openTestDatabase, sequentialIds, type TestDatabase } from './helpers/sqlite';

const NOW = '2026-09-28T20:00:00.000Z';
const TODAY = '2026-09-28';
const PASSWORD = 'mot-de-passe-de-sauvegarde';

/** Itérations réduites : le chiffrement est éprouvé ailleurs, ici on veut de la vitesse. */
const FAST_KDF = { iterations: 500 };

interface Bench {
  test: TestDatabase;
  db: TestDatabase['db'];
}

async function bench(withDemoData: boolean): Promise<Bench> {
  const test = openTestDatabase();
  await bootstrapDatabase(test.db, {
    newId: sequentialIds('id'),
    now: NOW,
    today: TODAY,
    withDemoData,
  });
  return { test, db: test.db };
}

/**
 * Port de coffre en mémoire.
 *
 * Le coffre est éprouvé à travers son port, sans disque : c'est la raison d'être de cette
 * abstraction. Le contenu écrit ici n'est pas le contenu en clair — `seal` est bien
 * appliqué — ce que le test du contenu le vérifie explicitement.
 */
function memoryPort(): FilePort & { raw(): Map<string, Uint8Array> } {
  const files = new Map<string, Uint8Array>();
  return {
    async ensureDirectory(): Promise<void> {
      return undefined;
    },
    async write(relativePath: string, bytes: Uint8Array): Promise<void> {
      files.set(relativePath, Uint8Array.from(bytes));
    },
    async read(relativePath: string): Promise<Uint8Array> {
      const found = files.get(relativePath);
      if (found === undefined) throw new Error(`Fichier absent : ${relativePath}`);
      return Uint8Array.from(found);
    },
    async remove(relativePath: string): Promise<void> {
      files.delete(relativePath);
    },
    async exists(relativePath: string): Promise<boolean> {
      return files.has(relativePath);
    },
    async readExternal(uri: string): Promise<Uint8Array> {
      const found = files.get(uri);
      if (found === undefined) throw new Error(`Fichier externe absent : ${uri}`);
      return Uint8Array.from(found);
    },
    raw: () => files,
  };
}

function makeVault(seed: number): { vault: ReturnType<typeof createVaultFileStore>; port: ReturnType<typeof memoryPort> } {
  const port = memoryPort();
  const vault = createVaultFileStore({
    port,
    key: createVaultKey(seededRandomBytes(seed)),
    random: seededRandomBytes(seed + 1),
    newId: sequentialIds(`f${seed}`),
    now: () => NOW,
  });
  return { vault, port };
}

/** Passe l'archive par le disque : c'est ainsi qu'elle voyage réellement. */
async function roundTrip(payload: BackupPayload, password = PASSWORD): Promise<BackupPayload> {
  const envelope = await sealBackupPayload(payload, password, seededRandomBytes(7), NOW, FAST_KDF);
  return openBackupEnvelope(utf8Bytes(JSON.stringify(envelope)), password);
}

function dumpOf(payload: BackupPayload, table: string): Row[] {
  const dump = payload.tables.find((candidate) => candidate.table === table);
  assert.ok(dump !== undefined, `table ${table} absente du dump`);
  return dump.rows;
}

function clone(payload: BackupPayload): BackupPayload {
  return JSON.parse(JSON.stringify(payload)) as BackupPayload;
}

// ---------------------------------------------------------------------------

describe('sauvegarde — contenu du dump', () => {
  it('couvre toutes les tables déclarées, dans l’ordre du schéma', async () => {
    const source = await bench(true);
    const payload = await buildBackupPayload(source.db, null, NOW);
    assert.deepEqual(
      payload.tables.map((dump) => dump.table),
      [...TABLES],
    );
    source.test.close();
  });

  it('emporte les lignes archivées, pas seulement les lignes vivantes', async () => {
    const source = await bench(true);
    const vehicle = source.test.get('SELECT id FROM vehicles ORDER BY id LIMIT 1');
    assert.ok(vehicle !== null, 'le jeu d’essai doit contenir au moins un véhicule');
    const id = String(vehicle.id);

    await source.db.runAsync('UPDATE vehicles SET archivedAt = ? WHERE id = ?', NOW, id);
    const payload = await buildBackupPayload(source.db, null, NOW);
    const archived = dumpOf(payload, 'vehicles').filter((row) => row.archivedAt !== null);
    assert.equal(archived.length, 1, 'une ligne archivée doit figurer au dump');

    const manifest = summarizeBackup(payload);
    assert.equal(
      manifest.tables.find((entry) => entry.table === 'vehicles')?.rows,
      source.test.count('vehicles'),
    );
    source.test.close();
  });

  it('signale un fichier illisible au lieu d’interrompre la sauvegarde', async () => {
    const source = await bench(true);
    // Une ligne de fichier sans contenu sur le disque : le cas d'un coffre dont la clé a
    // changé. Le reste des données doit partir quand même.
    await source.db.runAsync(
      `INSERT INTO files (id, createdAt, updatedAt, archivedAt, kind, fileName, mimeType,
         sizeBytes, relativePath, encrypted, sha256, notes)
       VALUES ('f-absent', ?, ?, NULL, 'permis', 'permis.pdf', 'application/pdf', 0,
         'coffre/f-absent', 1, NULL, '')`,
      NOW,
      NOW,
    );

    const { vault } = makeVault(3);
    const payload = await buildBackupPayload(source.db, vault, NOW);
    const entry = payload.files.find((candidate) => candidate.id === 'f-absent');
    assert.ok(entry !== undefined);
    assert.equal(entry.contentBase64, null);
    assert.equal(summarizeBackup(payload).missingFiles, 1);
    source.test.close();
  });
});

describe('sauvegarde — chiffrement de l’archive', () => {
  it('refuse un mot de passe trop court', () => {
    assert.throws(() => assertPasswordAcceptable('court'), new RegExp(String(MIN_BACKUP_PASSWORD)));
    assert.doesNotThrow(() => assertPasswordAcceptable('assez-long'));
  });

  it('refuse un mot de passe incorrect', async () => {
    const source = await bench(false);
    const payload = await buildBackupPayload(source.db, null, NOW);
    const envelope = await sealBackupPayload(payload, PASSWORD, seededRandomBytes(7), NOW, FAST_KDF);
    const bytes = utf8Bytes(JSON.stringify(envelope));

    await assert.rejects(() => openBackupEnvelope(bytes, 'un-autre-mot-de-passe'), /Déchiffrement impossible/);
    source.test.close();
  });

  it('refuse un fichier qui n’est pas une archive', async () => {
    await assert.rejects(
      () => openBackupEnvelope(utf8Bytes('{"bonjour": true}'), PASSWORD),
      /pas une archive de sauvegarde/,
    );
    await assert.rejects(() => openBackupEnvelope(utf8Bytes('pas du json'), PASSWORD), /lisible/);
  });

  it('refuse une archive d’une autre version', async () => {
    const source = await bench(false);
    const payload = await buildBackupPayload(source.db, null, NOW);
    const envelope = await sealBackupPayload(payload, PASSWORD, seededRandomBytes(7), NOW, FAST_KDF);
    const bumped = { ...envelope, version: 99 };
    await assert.rejects(
      () => openBackupEnvelope(utf8Bytes(JSON.stringify(bumped)), PASSWORD),
      /version 99/,
    );
    source.test.close();
  });

  it('écrit dans l’en-tête de quoi redériver la clé', async () => {
    const source = await bench(false);
    const payload = await buildBackupPayload(source.db, null, NOW);
    const envelope = await sealBackupPayload(payload, PASSWORD, seededRandomBytes(7), NOW, FAST_KDF);
    assert.equal(envelope.kdf.algorithm, 'pbkdf2-sha256');
    assert.equal(envelope.kdf.iterations, FAST_KDF.iterations);
    assert.ok(envelope.kdf.salt.length > 0);
    // Le contenu de l'archive n'apparaît nulle part en clair dans l'enveloppe.
    assert.ok(!envelope.payload.includes('vehicles'));
    source.test.close();
  });
});

describe('restauration — fidélité', () => {
  it('reproduit toutes les tables dans une base neuve', async () => {
    const source = await bench(true);
    const target = await bench(false);

    const payload = await buildBackupPayload(source.db, null, NOW);
    const reopened = await roundTrip(payload);
    await restoreBackup(target.db, null, reopened, NOW);

    // `meta` est la seule table dont le compte peut légitimement différer : la restauration
    // y inscrit sa propre date. Comparer `meta` à l'identique obligerait à renoncer à cette
    // trace, ou à faire semblant qu'elle n'existe pas. Elle est vérifiée à part.
    for (const table of TABLES) {
      if (table === 'meta') continue;
      assert.equal(
        target.test.count(table),
        source.test.count(table),
        `nombre de lignes différent pour ${table}`,
      );
    }
    source.test.close();
    target.test.close();
  });

  it('inscrit sa date dans `meta`, et c’est la seule ligne qui s’ajoute', async () => {
    const source = await bench(true);
    const target = await bench(false);

    const payload = await buildBackupPayload(source.db, null, NOW);
    await restoreBackup(target.db, null, await roundTrip(payload), NOW);

    assert.equal(source.test.count('meta'), 0, 'la source ne doit avoir aucune ligne meta');
    assert.equal(target.test.count('meta'), 1, 'la restauration doit laisser exactement une trace');
    const keys = target.test.all('SELECT key FROM meta').map((row) => String(row.key));
    assert.deepEqual(keys, [META_KEYS.lastRestoreAt]);

    source.test.close();
    target.test.close();
  });

  it('reproduit une ligne champ par champ', async () => {
    const source = await bench(true);
    const target = await bench(false);

    const before = source.test.get('SELECT * FROM vehicles ORDER BY id LIMIT 1');
    assert.ok(before !== null);

    const payload = await buildBackupPayload(source.db, null, NOW);
    await restoreBackup(target.db, null, await roundTrip(payload), NOW);

    const after = target.test.get('SELECT * FROM vehicles WHERE id = ?', String(before.id));
    assert.ok(after !== null, 'le véhicule restauré doit exister');
    assert.deepEqual(after, before);
    source.test.close();
    target.test.close();
  });

  it('remplace les données en place au lieu de les fusionner', async () => {
    const source = await bench(true);
    const target = await bench(true);

    const intruder: Row = {
      id: 'vehicule-intrus',
      createdAt: NOW,
      updatedAt: NOW,
      archivedAt: null,
      brand: 'Intrus',
      model: 'X',
      trim: '',
      year: null,
      plate: 'AA-000-AA',
      vin: '',
      fuelType: 'essence',
      status: 'disponible',
      purchaseDate: null,
      purchasePriceCents: 0,
      purchaseFeesCents: 0,
      purchaseMileageKm: 0,
      currentMileageKm: 0,
      amortizationMonths: 60,
      amortizationMethod: 'lineaire',
      photoFileId: null,
      notes: '',
    };
    await target.db.runAsync(
      `INSERT INTO vehicles (${Object.keys(intruder).join(', ')})
       VALUES (${Object.keys(intruder).map(() => '?').join(', ')})`,
      ...Object.values(intruder),
    );

    const payload = await buildBackupPayload(source.db, null, NOW);
    await restoreBackup(target.db, null, await roundTrip(payload), NOW);

    assert.equal(target.test.get('SELECT * FROM vehicles WHERE id = ?', 'vehicule-intrus'), null);
    assert.equal(target.test.count('vehicles'), source.test.count('vehicles'));
    source.test.close();
    target.test.close();
  });

  it('laisse une trace datée de la restauration', async () => {
    const source = await bench(false);
    const target = await bench(false);
    const payload = await buildBackupPayload(source.db, null, NOW);
    await restoreBackup(target.db, null, await roundTrip(payload), NOW);

    const row = target.test.get('SELECT value FROM meta WHERE key = ?', META_KEYS.lastRestoreAt);
    assert.equal(row?.value, NOW);
    source.test.close();
    target.test.close();
  });
});

describe('restauration — refus', () => {
  it('ne touche à rien si une ligne porte une valeur impossible', async () => {
    const source = await bench(true);
    const target = await bench(true);
    const before = target.test.count('vehicles');

    const payload = await buildBackupPayload(source.db, null, NOW);
    const broken = clone(payload);
    // Un objet dans une colonne texte : le schéma ne le permet pas. Le refus doit avoir
    // lieu **avant** la transaction, sans quoi la base serait vidée pour rien.
    const row = dumpOf(broken, 'vehicles')[0];
    assert.ok(row !== undefined);
    (row as Record<string, unknown>).brand = { piege: true };

    await assert.rejects(() => restoreBackup(target.db, null, broken, NOW), /Valeur inattendue/);
    assert.equal(target.test.count('vehicles'), before, 'la base ne doit pas avoir été vidée');
    source.test.close();
    target.test.close();
  });

  it('ignore une colonne inconnue au lieu de l’injecter dans la requête', async () => {
    const source = await bench(true);
    const target = await bench(false);

    const payload = await buildBackupPayload(source.db, null, NOW);
    const hostile = clone(payload);
    const row = dumpOf(hostile, 'vehicles')[0];
    assert.ok(row !== undefined);
    (row as Record<string, unknown>)['id); DROP TABLE vehicles;--'] = 'charge utile';

    await restoreBackup(target.db, null, hostile, NOW);

    // La table existe encore : le nom de colonne n'a pas été recopié dans le SQL.
    assert.ok(target.test.count('vehicles') > 0);
    const columns = target.test.all('PRAGMA table_info(vehicles)').map((entry) => String(entry.name));
    assert.equal(columns.includes('id); DROP TABLE vehicles;--'), false);
    source.test.close();
    target.test.close();
  });

  it('refuse un chemin de fichier qui sortirait du coffre', async () => {
    const source = await bench(true);
    const target = await bench(false);
    const before = target.test.count('vehicles');

    const payload = await buildBackupPayload(source.db, null, NOW);
    const hostile = clone(payload);
    hostile.files.push({ id: 'f-1', relativePath: '../../hors-du-coffre', contentBase64: 'AAAA' });

    await assert.rejects(() => restoreBackup(target.db, null, hostile, NOW), /Chemin de fichier refusé/);
    assert.equal(target.test.count('vehicles'), before);
    source.test.close();
    target.test.close();
  });

  it('signale les tables inconnues sans échouer', async () => {
    const source = await bench(false);
    const target = await bench(false);
    const payload = await buildBackupPayload(source.db, null, NOW);
    const augmented = clone(payload);
    augmented.tables.push({ table: 'table_du_futur', rows: [{ id: 'x' }] });

    const report = await restoreBackup(target.db, null, augmented, NOW);
    assert.deepEqual(report.unknownTables, ['table_du_futur']);
    source.test.close();
    target.test.close();
  });
});

describe('restauration — fichiers du coffre', () => {
  it('rend un document lisible après un changement d’appareil', async () => {
    const source = await bench(true);
    const target = await bench(false);

    // Coffre de l'appareil d'origine.
    const origin = makeVault(11);
    const content = 'scan du permis de conduire';
    const stored = await origin.vault.save({
      kind: 'permis',
      fileName: 'permis.pdf',
      mimeType: 'application/pdf',
      bytes: utf8Bytes(content),
    });
    await source.db.runAsync(
      `INSERT INTO files (id, createdAt, updatedAt, archivedAt, kind, fileName, mimeType,
         sizeBytes, relativePath, encrypted, sha256, notes)
       VALUES (?, ?, ?, NULL, ?, ?, ?, ?, ?, 1, ?, '')`,
      stored.id,
      NOW,
      NOW,
      stored.kind,
      stored.fileName,
      stored.mimeType,
      stored.sizeBytes,
      stored.relativePath,
      stored.sha256,
    );

    const payload = await buildBackupPayload(source.db, origin.vault, NOW);
    assert.equal(payload.files.length, 1);
    assert.ok(payload.files[0]?.contentBase64 !== null);

    // Coffre d'un autre appareil : clé différente, donc conteneurs différents.
    const destination = makeVault(22);
    const report = await restoreBackup(target.db, destination.vault, await roundTrip(payload), NOW);
    assert.equal(report.filesRestored, 1);
    assert.equal(report.filesMissing, 0);

    const restoredRow = target.test.get('SELECT * FROM files WHERE id = ?', stored.id);
    assert.ok(restoredRow !== null);
    assert.equal(String(restoredRow.relativePath), stored.relativePath);

    const readBack = await destination.vault.read({
      relativePath: String(restoredRow.relativePath),
      fileName: String(restoredRow.fileName),
    });
    assert.equal(bytesToUtf8(readBack), content);

    // Le conteneur sur le disque n'est pas le contenu en clair, et il diffère de celui de
    // l'appareil d'origine : la clé du coffre a changé, donc le chiffrement aussi.
    const onDisk = destination.port.raw().get(String(restoredRow.relativePath));
    assert.ok(onDisk !== undefined);
    assert.equal(bytesToUtf8(onDisk).includes(content), false);
    assert.notDeepEqual(
      Array.from(onDisk),
      Array.from(origin.port.raw().get(stored.relativePath) ?? new Uint8Array()),
    );

    source.test.close();
    target.test.close();
  });

  it('compte un fichier manquant sans faire échouer la restauration', async () => {
    const source = await bench(true);
    const target = await bench(false);
    const destination = makeVault(33);

    const payload = await buildBackupPayload(source.db, null, NOW);
    payload.files.push({ id: 'f-perdu', relativePath: 'coffre/f-perdu', contentBase64: null });

    const report = await restoreBackup(target.db, destination.vault, payload, NOW);
    assert.equal(report.filesMissing, 1);
    assert.equal(report.filesRestored, 0);
    source.test.close();
    target.test.close();
  });
});

describe('production du fichier d’archive', () => {
  it('écrit un fichier non vide et rend un inventaire', async () => {
    const source = await bench(true);
    const { file, manifest } = await createBackupFile(
      source.db,
      null,
      PASSWORD,
      seededRandomBytes(5),
      NOW,
      { iterations: FAST_KDF.iterations },
    );

    assert.ok(file.sizeBytes > 0, 'le fichier d’archive doit contenir quelque chose');
    assert.equal(file.name, 'sauvegarde-flotte-2026-09-28.flottebackup');
    assert.equal(manifest.tables.length, TABLES.length);
    assert.ok((manifest.tables.find((entry) => entry.table === 'vehicles')?.rows ?? 0) > 0);
    source.test.close();
  });
});

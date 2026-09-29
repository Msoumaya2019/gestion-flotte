/**
 * Sauvegarde et restauration.
 *
 * ## Pourquoi une sauvegarde manuelle, et pas une synchronisation
 *
 * L'application ne parle à aucun serveur : il n'y a donc rien qui protège d'une perte ou
 * d'un remplacement de téléphone. C'est le prix de la confidentialité, et il est assumé —
 * mais il doit être payé jusqu'au bout, par une archive que l'utilisateur déclenche et
 * range où il veut.
 *
 * ## Ce que contient une archive
 *
 * **Toutes les tables, telles quelles.** Pas les entités converties : les lignes brutes,
 * colonne par colonne. Réénumérer les champs un par un obligerait à les reporter aussi au
 * retour, et le premier champ ajouté sans être reporté disparaîtrait d'une sauvegarde en
 * silence. C'est exactement le défaut qu'on ne découvre qu'au moment de restaurer, c'est-à-
 * dire trop tard.
 *
 * **Les fichiers du coffre, déchiffrés puis rechiffrés.** Une archive doit être lisible sur
 * un autre appareil, dont la clé de coffre est différente : elle ne peut donc pas recopier
 * les conteneurs tels quels. Le contenu est remis en clair dans l'archive, qui est
 * elle-même chiffrée par le mot de passe — c'est la clé de sauvegarde qui protège, pas la
 * clé du coffre.
 *
 * ## Le mot de passe est obligatoire
 *
 * Une archive contient des permis de conduire, des cartes grises et des contrats. La
 * laisser en clair parce que l'utilisateur n'a pas voulu choisir de mot de passe serait une
 * décision prise à sa place, et la mauvaise. Huit caractères au minimum.
 *
 * ## La restauration est tout ou rien
 *
 * Elle s'exécute dans **une seule transaction** : une archive refusée à mi-parcours laisse
 * la base exactement dans son état antérieur. Une restauration partielle serait pire que
 * pas de restauration du tout — elle produirait une base incohérente, avec des loyers
 * rattachés à des locations disparues.
 */

import { META_KEYS } from '@/data/bootstrap';
import { TABLES } from '@/data/migrations';
import { insertStatement, transaction, type Row, type SqlDatabase, type SqlValue } from '@/data/sql';
import { safeFileName } from '@/domain/csv';
import {
  bytesToUtf8,
  deriveKey,
  fromBase64,
  open,
  seal,
  toBase64,
  utf8Bytes,
  SALT_BYTES,
  type RandomBytes,
} from './crypto';
import { writeBytesOutput, type OutputFile } from './output';
import { isSafeRelativePath, type VaultFileStore } from './file-store';

export const BACKUP_FORMAT = 'flotte-backup';
export const BACKUP_VERSION = 1;
export const ENVELOPE_FORMAT = 'flotte-backup-enveloppe';

/**
 * Itérations de la dérivation du mot de passe de sauvegarde.
 *
 * Plus élevé que pour le code de déverrouillage : une sauvegarde est produite rarement, et
 * une archive volée peut être attaquée hors ligne sans limite de temps ni de tentatives.
 */
export const BACKUP_ITERATIONS = 250_000;

export const MIN_BACKUP_PASSWORD = 8;

export interface BackupFileEntry {
  id: string;
  relativePath: string;
  /** Contenu déchiffré, en base64. `null` si le fichier manquait déjà au moment du dump. */
  contentBase64: string | null;
}

export interface BackupTableDump {
  table: string;
  rows: Row[];
}

export interface BackupPayload {
  format: typeof BACKUP_FORMAT;
  version: number;
  createdAt: string;
  tables: BackupTableDump[];
  files: BackupFileEntry[];
}

export interface BackupEnvelope {
  format: typeof ENVELOPE_FORMAT;
  version: number;
  createdAt: string;
  kdf: { algorithm: 'pbkdf2-sha256'; iterations: number; salt: string };
  /** Conteneur chiffré, en base64. */
  payload: string;
}

/** Ce qu'une archive contient, en clair : sert à rassurer avant d'écraser quoi que ce soit. */
export interface BackupManifest {
  createdAt: string;
  tables: { table: string; rows: number }[];
  fileCount: number;
  missingFiles: number;
  /** Somme des contenus de fichiers, en octets. */
  fileBytes: number;
}

// ---------------------------------------------------------------------------
// Dump
// ---------------------------------------------------------------------------

/** Colonnes réelles d'une table, lues au schéma. Sert de liste blanche à la restauration. */
async function columnsOf(db: SqlDatabase, table: string): Promise<Set<string>> {
  const rows = await db.getAllAsync<{ name: string }>(`PRAGMA table_info(${table})`);
  return new Set(rows.map((row) => String(row.name)));
}

async function dumpTables(db: SqlDatabase): Promise<BackupTableDump[]> {
  const dumps: BackupTableDump[] = [];
  for (const table of TABLES) {
    const rows = await db.getAllAsync<Row>(`SELECT * FROM ${table}`);
    dumps.push({ table, rows });
  }
  return dumps;
}

async function dumpFiles(db: SqlDatabase, vault: VaultFileStore | null): Promise<BackupFileEntry[]> {
  const rows = await db.getAllAsync<Row>('SELECT id, relativePath FROM files');
  const entries: BackupFileEntry[] = [];

  for (const row of rows) {
    const id = typeof row.id === 'string' ? row.id : '';
    const relativePath = typeof row.relativePath === 'string' ? row.relativePath : '';
    if (id === '' || relativePath === '') continue;

    if (vault === null) {
      entries.push({ id, relativePath, contentBase64: null });
      continue;
    }

    try {
      const bytes = await vault.read({ relativePath, fileName: id });
      entries.push({ id, relativePath, contentBase64: toBase64(bytes) });
    } catch {
      // Un contenu illisible — clé de coffre changée, fichier effacé — est signalé plutôt
      // que d'interrompre la sauvegarde : le reste des données doit partir quand même, et
      // l'utilisateur saura précisément ce qui manque.
      entries.push({ id, relativePath, contentBase64: null });
    }
  }

  return entries;
}

export async function buildBackupPayload(
  db: SqlDatabase,
  vault: VaultFileStore | null,
  now: string,
): Promise<BackupPayload> {
  return {
    format: BACKUP_FORMAT,
    version: BACKUP_VERSION,
    createdAt: now,
    tables: await dumpTables(db),
    files: await dumpFiles(db, vault),
  };
}

export function summarizeBackup(payload: BackupPayload): BackupManifest {
  let fileBytes = 0;
  let missingFiles = 0;
  for (const entry of payload.files) {
    if (entry.contentBase64 === null) {
      missingFiles += 1;
      continue;
    }
    // Taille réelle du contenu, sans décoder : chaque 4 caractères de base64 valent
    // 3 octets, et le remplissage final se retire.
    const padding = entry.contentBase64.endsWith('==') ? 2 : entry.contentBase64.endsWith('=') ? 1 : 0;
    fileBytes += (entry.contentBase64.length / 4) * 3 - padding;
  }

  return {
    createdAt: payload.createdAt,
    tables: payload.tables.map((dump) => ({ table: dump.table, rows: dump.rows.length })),
    fileCount: payload.files.length,
    missingFiles,
    fileBytes,
  };
}

// ---------------------------------------------------------------------------
// Chiffrement de l'archive
// ---------------------------------------------------------------------------

export function assertPasswordAcceptable(password: string): void {
  if (password.length < MIN_BACKUP_PASSWORD) {
    throw new Error(
      `Le mot de passe de sauvegarde doit comporter au moins ${MIN_BACKUP_PASSWORD} caractères : ` +
        "c'est lui, et lui seul, qui protège les documents de l'archive.",
    );
  }
}

export async function sealBackupPayload(
  payload: BackupPayload,
  password: string,
  random: RandomBytes,
  now: string,
  options: { iterations?: number } = {},
): Promise<BackupEnvelope> {
  assertPasswordAcceptable(password);
  // Le nombre d'itérations est écrit dans l'en-tête de l'archive : le lecteur n'a donc pas
  // besoin de le connaître, et un banc peut en employer un petit nombre pour rester rapide
  // sans que le comportement livré change.
  const iterations = options.iterations ?? BACKUP_ITERATIONS;
  const salt = random(SALT_BYTES);
  const key = await deriveKey(password, salt, iterations);
  const container = seal(key, utf8Bytes(JSON.stringify(payload)), random);

  return {
    format: ENVELOPE_FORMAT,
    version: BACKUP_VERSION,
    createdAt: now,
    kdf: { algorithm: 'pbkdf2-sha256', iterations, salt: toBase64(salt) },
    payload: toBase64(container),
  };
}

export async function openBackupEnvelope(bytes: Uint8Array, password: string): Promise<BackupPayload> {
  let envelope: unknown;
  try {
    envelope = JSON.parse(bytesToUtf8(bytes));
  } catch {
    throw new Error("Ce fichier n'est pas une archive de sauvegarde lisible.");
  }

  if (typeof envelope !== 'object' || envelope === null) {
    throw new Error("Ce fichier n'est pas une archive de sauvegarde lisible.");
  }
  const candidate = envelope as Partial<BackupEnvelope>;
  if (candidate.format !== ENVELOPE_FORMAT) {
    throw new Error("Ce fichier n'est pas une archive de sauvegarde reconnue.");
  }
  if (candidate.version !== BACKUP_VERSION) {
    throw new Error(
      `Archive en version ${String(candidate.version)} : cette version de l'application lit la version ${BACKUP_VERSION}.`,
    );
  }
  const kdf = candidate.kdf;
  if (kdf === undefined || typeof kdf.salt !== 'string' || typeof kdf.iterations !== 'number') {
    throw new Error("L'en-tête de l'archive est incomplet.");
  }
  if (typeof candidate.payload !== 'string') {
    throw new Error("L'archive ne contient aucune donnée.");
  }

  const key = await deriveKey(password, fromBase64(kdf.salt), kdf.iterations);

  let plain: Uint8Array;
  try {
    plain = open(key, fromBase64(candidate.payload));
  } catch {
    // GCM ne distingue pas un mot de passe faux d'un contenu altéré, et il a raison : les
    // deux produisent la même impossibilité de déchiffrer. Le message le dit.
    throw new Error(
      'Déchiffrement impossible. Le mot de passe est probablement incorrect, ou le fichier a été modifié.',
    );
  }

  const payload: unknown = JSON.parse(bytesToUtf8(plain));
  if (typeof payload !== 'object' || payload === null) {
    throw new Error("Le contenu de l'archive est illisible.");
  }
  const parsed = payload as Partial<BackupPayload>;
  if (parsed.format !== BACKUP_FORMAT || !Array.isArray(parsed.tables) || !Array.isArray(parsed.files)) {
    throw new Error("Le contenu de l'archive n'a pas le format attendu.");
  }

  return {
    format: BACKUP_FORMAT,
    version: parsed.version ?? BACKUP_VERSION,
    createdAt: typeof parsed.createdAt === 'string' ? parsed.createdAt : '',
    tables: parsed.tables,
    files: parsed.files,
  };
}

// ---------------------------------------------------------------------------
// Production du fichier
// ---------------------------------------------------------------------------

export async function createBackupFile(
  db: SqlDatabase,
  vault: VaultFileStore | null,
  password: string,
  random: RandomBytes,
  now: string,
  options: { iterations?: number } = {},
): Promise<{ file: OutputFile; manifest: BackupManifest }> {
  assertPasswordAcceptable(password);
  const payload = await buildBackupPayload(db, vault, now);
  const manifest = summarizeBackup(payload);
  const envelope = await sealBackupPayload(payload, password, random, now, options);

  const stamp = now.slice(0, 10);
  const file = writeBytesOutput(
    `sauvegarde-flotte-${stamp}`,
    'flottebackup',
    utf8Bytes(JSON.stringify(envelope, null, 2)),
  );

  return { file, manifest };
}

// ---------------------------------------------------------------------------
// Restauration
// ---------------------------------------------------------------------------

export interface RestoreReport {
  tables: { table: string; rows: number }[];
  filesRestored: number;
  filesMissing: number;
  /** Tables présentes dans l'archive mais inconnues de cette version : ignorées. */
  unknownTables: string[];
}

/** Ne garde que des colonnes qui existent réellement, et des valeurs scalaires. */
function sanitizeRow(row: Row, allowed: ReadonlySet<string>): Row {
  const clean: Row = {};
  for (const [key, value] of Object.entries(row)) {
    if (!allowed.has(key)) continue;
    if (value === null || typeof value === 'string' || typeof value === 'number') {
      clean[key] = value as SqlValue;
      continue;
    }
    // Un objet ou un tableau dans une colonne n'a aucun sens ici : le schéma ne stocke que
    // du texte, des entiers et des nuls. On refuse plutôt que de convertir en « [object] ».
    throw new Error(`Valeur inattendue pour la colonne « ${key} ».`);
  }
  return clean;
}

export async function restoreBackup(
  db: SqlDatabase,
  vault: VaultFileStore | null,
  payload: BackupPayload,
  now: string,
): Promise<RestoreReport> {
  const known = new Set<string>(TABLES);
  const unknownTables = payload.tables.filter((dump) => !known.has(dump.table)).map((dump) => dump.table);
  const retained = payload.tables.filter((dump) => known.has(dump.table));

  // Les colonnes sont lues **avant** la transaction : `PRAGMA table_info` ne modifie rien,
  // et une archive dont une table ne correspond pas doit être refusée avant d'avoir
  // supprimé quoi que ce soit.
  const columns = new Map<string, Set<string>>();
  for (const table of TABLES) {
    columns.set(table, await columnsOf(db, table));
  }

  const prepared = retained.map((dump) => {
    const allowed = columns.get(dump.table);
    if (allowed === undefined) throw new Error(`Table inconnue : ${dump.table}`);
    return { table: dump.table, rows: dump.rows.map((row) => sanitizeRow(row, allowed)) };
  });

  // Les chemins de fichiers sont validés **avant** la transaction : une archive qui
  // désignerait `../` doit être refusée avant qu'on ait vidé quoi que ce soit. Une fois la
  // base effacée, il n'est plus temps de discuter.
  for (const entry of payload.files) {
    if (entry.contentBase64 === null) continue;
    if (!isSafeRelativePath(entry.relativePath)) {
      throw new Error(`Chemin de fichier refusé dans l'archive : « ${entry.relativePath} ».`);
    }
  }

  await transaction(db, async () => {
    // Suppression des enfants avant les parents, insertion dans l'ordre inverse : l'ordre
    // de `TABLES` est celui des dépendances, donc l'inverser suffit pour le vidage.
    for (const table of [...TABLES].reverse()) {
      await db.runAsync(`DELETE FROM ${table}`);
    }
    for (const dump of prepared) {
      for (const row of dump.rows) {
        const statement = insertStatement(dump.table, row);
        await db.runAsync(statement.sql, ...statement.params);
      }
    }
  });

  // Les fichiers viennent après la base : si le disque refuse un contenu, les métadonnées
  // sont déjà en place et la ligne signalera un fichier manquant, au lieu d'exister sans
  // rien pour la référencer.
  let filesRestored = 0;
  let filesMissing = 0;
  for (const entry of payload.files) {
    if (entry.contentBase64 === null) {
      filesMissing += 1;
      continue;
    }
    if (vault === null) {
      filesMissing += 1;
      continue;
    }
    try {
      // Écriture au chemin **décrit par l'archive** : la ligne `files` restaurée désigne ce
      // chemin, et le contenu est rechiffré avec la clé du coffre de cet appareil-ci.
      await vault.saveAt(entry.relativePath, fromBase64(entry.contentBase64));
      filesRestored += 1;
    } catch {
      filesMissing += 1;
    }
  }

  // Trace de la restauration. Elle est écrite **après** le vidage, donc elle survit à une
  // restauration réussie, et elle ne l'est pas si la transaction a été annulée — ce qui est
  // exactement le comportement voulu : une date qui mentirait sur une restauration qui n'a
  // pas eu lieu serait pire que pas de date du tout.
  await db.runAsync(
    `INSERT INTO meta (key, value) VALUES (?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
    META_KEYS.lastRestoreAt,
    now,
  );

  return {
    tables: prepared.map((dump) => ({ table: dump.table, rows: dump.rows.length })),
    filesRestored,
    filesMissing,
    unknownTables,
  };
}

/** Nom de fichier proposé pour une sauvegarde, sans écrire quoi que ce soit. */
export function suggestedBackupName(now: string): string {
  return safeFileName(`sauvegarde-flotte-${now.slice(0, 10)}`, 'flottebackup');
}

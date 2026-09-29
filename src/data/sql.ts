/**
 * Port d'accès SQL.
 *
 * Les dépôts ne connaissent pas `expo-sqlite` : ils parlent à cette interface, dont la
 * forme est **structurellement identique** à celle de `SQLiteDatabase` d'expo-sqlite
 * (mêmes noms, même variadique de paramètres). L'objet réel s'y branche donc sans
 * adaptateur, et un moteur SQLite compilé en WebAssembly s'y branche dans les tests.
 *
 * C'est ce qui permet d'**exécuter réellement** les migrations et les requêtes dans un
 * banc Node : une erreur de nom de colonne, une contrainte violée ou une requête mal
 * formée se voit alors avant l'appareil, au lieu de se manifester par un écran vide.
 */

export type SqlValue = string | number | null;
export type SqlParams = readonly SqlValue[];
export type Row = Record<string, SqlValue>;

export interface SqlRunResult {
  changes: number;
  lastInsertRowId: number;
}

export interface SqlDatabase {
  execAsync(sql: string): Promise<void>;
  runAsync(sql: string, ...params: SqlValue[]): Promise<SqlRunResult>;
  getAllAsync<T>(sql: string, ...params: SqlValue[]): Promise<T[]>;
  getFirstAsync<T>(sql: string, ...params: SqlValue[]): Promise<T | null>;
  withTransactionAsync?(task: () => Promise<void>): Promise<void>;
}

/** Convertit un booléen en entier, dans le sens de SQLite. */
export function toInt(value: boolean): number {
  return value ? 1 : 0;
}

export function fromInt(value: SqlValue): boolean {
  return value === 1 || value === '1';
}

/** Lit un entier nullable sans confondre `0` et `null`. */
export function nullableInt(value: SqlValue): number | null {
  return typeof value === 'number' ? value : null;
}

export function text(value: SqlValue): string {
  return typeof value === 'string' ? value : value === null ? '' : String(value);
}

export function integer(value: SqlValue): number {
  return typeof value === 'number' ? value : Number(value ?? 0);
}

export function nullableText(value: SqlValue): string | null {
  return typeof value === 'string' && value !== '' ? value : null;
}

/** Relit une liste stockée en JSON. Une valeur corrompue rend une liste vide plutôt que de lever. */
export function jsonArray<T>(value: SqlValue): T[] {
  if (typeof value !== 'string' || value.trim() === '') return [];
  try {
    const parsed: unknown = JSON.parse(value);
    return Array.isArray(parsed) ? (parsed as T[]) : [];
  } catch {
    return [];
  }
}

// ---------------------------------------------------------------------------
// Fabrique de requêtes
// ---------------------------------------------------------------------------

export interface Statement {
  sql: string;
  params: SqlValue[];
}

/**
 * `INSERT` construit depuis les clés d'un objet.
 *
 * Les noms de colonnes viennent de l'objet, pas d'une liste recopiée : une colonne
 * ajoutée au mappeur ne peut pas être oubliée dans la requête, et une colonne renommée
 * côté schéma casse immédiatement plutôt que silencieusement.
 */
export function insertStatement(table: string, row: Readonly<Record<string, SqlValue>>): Statement {
  const columns = Object.keys(row);
  if (columns.length === 0) throw new Error(`insertStatement : ligne vide pour ${table}`);
  const placeholders = columns.map(() => '?').join(', ');
  return {
    sql: `INSERT INTO ${table} (${columns.join(', ')}) VALUES (${placeholders})`,
    params: columns.map((column) => row[column] ?? null),
  };
}

/** `UPDATE` par identifiant, même principe. La colonne `id` n'est jamais réécrite. */
export function updateStatement(
  table: string,
  id: string,
  row: Readonly<Record<string, SqlValue>>,
): Statement {
  const columns = Object.keys(row).filter((column) => column !== 'id');
  if (columns.length === 0) throw new Error(`updateStatement : rien à mettre à jour pour ${table}`);
  const assignments = columns.map((column) => `${column} = ?`).join(', ');
  return {
    sql: `UPDATE ${table} SET ${assignments} WHERE id = ?`,
    params: [...columns.map((column) => row[column] ?? null), id],
  };
}

/** Clause `IN (?, ?, …)` avec le bon nombre de marqueurs. */
export function inClause(column: string, values: readonly string[]): Statement {
  if (values.length === 0) {
    // `IN ()` n'est pas du SQL valide : on rend une condition toujours fausse.
    return { sql: '0 = 1', params: [] };
  }
  return {
    sql: `${column} IN (${values.map(() => '?').join(', ')})`,
    params: [...values],
  };
}

/** Concatène des conditions avec `AND`, en ignorant les fragments vides. */
export function whereClause(parts: readonly string[]): string {
  const kept = parts.filter((part) => part.trim() !== '');
  return kept.length === 0 ? '' : ` WHERE ${kept.join(' AND ')}`;
}

/** Exécute `task` dans une transaction, avec annulation en cas d'erreur. */
export async function transaction<T>(db: SqlDatabase, task: () => Promise<T>): Promise<T> {
  await db.execAsync('BEGIN;');
  try {
    const result = await task();
    await db.execAsync('COMMIT;');
    return result;
  } catch (error) {
    await db.execAsync('ROLLBACK;');
    throw error;
  }
}

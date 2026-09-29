/**
 * Dépôt générique adossé à une table.
 *
 * Toutes les entités partagent le même cycle de vie : lister, lire, insérer, mettre à
 * jour, **archiver**, restaurer. Écrire ce bloc une fois évite la faute de recopie qui
 * oublie un `WHERE archivedAt IS NULL` sur une seule table — et fait alors réapparaître un
 * véhicule vendu dans la liste des véhicules en service.
 *
 * La suppression réelle (`remove`) existe, mais n'est appelée que pour les fichiers et les
 * brouillons : les données financières s'archivent.
 */

import type { Entity } from '@/domain/types';
import { insertStatement, updateStatement, type Row, type SqlDatabase, type SqlValue } from '../sql';

export interface TableMapper<T extends Entity> {
  table: string;
  toRow(entity: T): Record<string, SqlValue>;
  fromRow(row: Row): T;
  /** Ordonnancement par défaut. Une valeur fixe, jamais construite depuis une saisie. */
  defaultOrder?: string;
}

export interface ListOptions {
  includeArchived?: boolean;
  limit?: number;
}

export interface TableRepository<T extends Entity> {
  readonly table: string;
  list(options?: ListOptions): Promise<T[]>;
  listArchived(): Promise<T[]>;
  get(id: string): Promise<T | null>;
  getMany(ids: readonly string[]): Promise<T[]>;
  findBy(column: string, value: SqlValue, options?: ListOptions): Promise<T[]>;
  query(sql: string, params?: readonly SqlValue[]): Promise<T[]>;
  insert(entity: T): Promise<void>;
  insertMany(entities: readonly T[]): Promise<void>;
  update(entity: T): Promise<void>;
  archive(id: string, at: string): Promise<void>;
  restore(id: string): Promise<void>;
  remove(id: string): Promise<void>;
  count(options?: { includeArchived?: boolean }): Promise<number>;
}

/** Colonnes autorisées dans `findBy` : liste blanche, pour ne pas composer un `WHERE`
 *  à partir d'une chaîne venue de l'extérieur. */
function assertSafeColumn(column: string): void {
  if (!/^[A-Za-z][A-Za-z0-9_]*$/.test(column)) {
    throw new Error(`Nom de colonne refusé : « ${column} »`);
  }
}

export function createTableRepository<T extends Entity>(
  db: SqlDatabase,
  mapper: TableMapper<T>,
): TableRepository<T> {
  const { table, toRow, fromRow } = mapper;
  const order = mapper.defaultOrder ?? 'createdAt ASC';

  function limitClause(options: ListOptions): string {
    if (options.limit === undefined) return '';
    const value = Math.max(0, Math.floor(options.limit));
    return ` LIMIT ${value}`;
  }

  return {
    table,

    async list(options: ListOptions = {}): Promise<T[]> {
      const where = options.includeArchived === true ? '' : ' WHERE archivedAt IS NULL';
      const rows = await db.getAllAsync<Row>(`SELECT * FROM ${table}${where} ORDER BY ${order}${limitClause(options)}`);
      return rows.map(fromRow);
    },

    async listArchived(): Promise<T[]> {
      const rows = await db.getAllAsync<Row>(
        `SELECT * FROM ${table} WHERE archivedAt IS NOT NULL ORDER BY archivedAt DESC`,
      );
      return rows.map(fromRow);
    },

    async get(id: string): Promise<T | null> {
      const row = await db.getFirstAsync<Row>(`SELECT * FROM ${table} WHERE id = ?`, id);
      return row === null ? null : fromRow(row);
    },

    async getMany(ids: readonly string[]): Promise<T[]> {
      if (ids.length === 0) return [];
      const placeholders = ids.map(() => '?').join(', ');
      const rows = await db.getAllAsync<Row>(`SELECT * FROM ${table} WHERE id IN (${placeholders})`, ...ids);
      return rows.map(fromRow);
    },

    async findBy(column: string, value: SqlValue, options: ListOptions = {}): Promise<T[]> {
      assertSafeColumn(column);
      const where = options.includeArchived === true ? '' : ' AND archivedAt IS NULL';
      const rows = await db.getAllAsync<Row>(
        `SELECT * FROM ${table} WHERE ${column} = ?${where} ORDER BY ${order}${limitClause(options)}`,
        value,
      );
      return rows.map(fromRow);
    },

    async query(sql: string, params: readonly SqlValue[] = []): Promise<T[]> {
      const rows = await db.getAllAsync<Row>(sql, ...params);
      return rows.map(fromRow);
    },

    async insert(entity: T): Promise<void> {
      const statement = insertStatement(table, toRow(entity));
      await db.runAsync(statement.sql, ...statement.params);
    },

    async insertMany(entities: readonly T[]): Promise<void> {
      for (const entity of entities) {
        const statement = insertStatement(table, toRow(entity));
        await db.runAsync(statement.sql, ...statement.params);
      }
    },

    async update(entity: T): Promise<void> {
      const statement = updateStatement(table, entity.id, toRow(entity));
      await db.runAsync(statement.sql, ...statement.params);
    },

    async archive(id: string, at: string): Promise<void> {
      await db.runAsync(`UPDATE ${table} SET archivedAt = ?, updatedAt = ? WHERE id = ?`, at, at, id);
    },

    async restore(id: string): Promise<void> {
      const now = new Date().toISOString();
      await db.runAsync(`UPDATE ${table} SET archivedAt = NULL, updatedAt = ? WHERE id = ?`, now, id);
    },

    async remove(id: string): Promise<void> {
      await db.runAsync(`DELETE FROM ${table} WHERE id = ?`, id);
    },

    async count(options: { includeArchived?: boolean } = {}): Promise<number> {
      const where = options.includeArchived === true ? '' : ' WHERE archivedAt IS NULL';
      const row = await db.getFirstAsync<{ total: number }>(`SELECT COUNT(*) AS total FROM ${table}${where}`);
      return row?.total ?? 0;
    },
  };
}

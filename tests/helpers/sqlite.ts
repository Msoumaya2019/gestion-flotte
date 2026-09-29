/**
 * Moteur SQLite réel pour les bancs, adossé à `node:sqlite`.
 *
 * ## Pourquoi un vrai moteur
 *
 * Une requête mal écrite — colonne renommée, `JOIN` oublié, contrainte violée — ne se voit
 * pas dans un test qui ne fait que comparer des chaînes SQL. Elle se voit à l'exécution,
 * c'est-à-dire chez l'utilisateur, sous la forme d'un écran vide. `node:sqlite` est
 * embarqué dans Node : on obtient un moteur **réel**, sans ajouter une seule dépendance, et
 * les migrations comme les dépôts s'exécutent pour de bon.
 *
 * ## Ce que ce banc ne prouve pas
 *
 * Le moteur de Node n'est pas celui d'iOS. Une différence de version de SQLite ou un
 * comportement propre à la plateforme ne seront pas vus ici. Le banc attrape les erreurs de
 * **schéma et de requête**, qui sont de loin les plus fréquentes ; il ne remplace pas un
 * essai sur appareil.
 *
 * ## L'adaptation
 *
 * `DatabaseSync` est synchrone, `SqlDatabase` est asynchrone. L'adaptateur enveloppe des
 * appels synchrones dans des promesses : la forme attendue par les dépôts est respectée, et
 * rien n'est simulé — seule l'asynchronie est ajoutée.
 *
 * ## Une seule connexion
 *
 * Les lectures synchrones (`all`, `get`, `count`) et les méthodes asynchrones passent par
 * le **même** handle natif. Deux handles sur une base `:memory:` seraient deux bases
 * distinctes : le banc écrirait dans l'une et lirait dans l'autre, en annonçant zéro ligne.
 */

import { DatabaseSync } from 'node:sqlite';
import type { Row, SqlDatabase, SqlRunResult, SqlValue } from '@/data/sql';

export interface TestDatabase {
  /** Interface vue par les dépôts, identique à celle de l'application. */
  db: SqlDatabase;
  /** Lecture synchrone, pour les vérifications de banc. */
  all(sql: string, ...params: SqlValue[]): Row[];
  get(sql: string, ...params: SqlValue[]): Row | null;
  /** Nombre de lignes d'une table. */
  count(table: string): number;
  close(): void;
}

/**
 * Ouvre une base en mémoire.
 *
 * `foreign_keys` est activé comme dans l'application : sans ce pragma, SQLite ignore les
 * clés étrangères, et un banc qui ne l'active pas validerait un schéma que l'application
 * refuserait à l'exécution.
 */
export function openTestDatabase(): TestDatabase {
  const native = new DatabaseSync(':memory:');
  native.exec('PRAGMA foreign_keys = ON;');

  return {
    db: {
      async execAsync(sql: string): Promise<void> {
        native.exec(sql);
      },

      async runAsync(sql: string, ...params: SqlValue[]): Promise<SqlRunResult> {
        const result = native.prepare(sql).run(...params);
        return {
          changes: Number(result.changes),
          // Node nomme la propriété `lastInsertRowid` (d minuscule), expo-sqlite la nomme
          // `lastInsertRowId` (I majuscule). Lire le mauvais nom ne lève pas : cela rend
          // `undefined`, donc `NaN` — un identifiant faux qui ne se voit qu'en aval. Le
          // nommage du port est celui d'expo-sqlite ; c'est ici qu'on traduit.
          lastInsertRowId: Number(result.lastInsertRowid),
        };
      },

      async getAllAsync<T>(sql: string, ...params: SqlValue[]): Promise<T[]> {
        return native.prepare(sql).all(...params) as T[];
      },

      async getFirstAsync<T>(sql: string, ...params: SqlValue[]): Promise<T | null> {
        const row = native.prepare(sql).get(...params);
        return row === undefined ? null : (row as T);
      },
    },

    all(sql: string, ...params: SqlValue[]): Row[] {
      return native.prepare(sql).all(...params) as Row[];
    },

    get(sql: string, ...params: SqlValue[]): Row | null {
      const row = native.prepare(sql).get(...params);
      return row === undefined ? null : (row as Row);
    },

    count(table: string): number {
      const row = native.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get() as Row;
      return Number(row.n ?? 0);
    },

    close(): void {
      native.close();
    },
  };
}

/** Générateur d'identifiants déterministes, pour que deux exécutions produisent le même état. */
export function sequentialIds(prefix = 'id'): () => string {
  let counter = 0;
  return () => {
    counter += 1;
    return `${prefix}-${String(counter).padStart(4, '0')}`;
  };
}

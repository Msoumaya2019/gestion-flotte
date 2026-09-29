/**
 * Dépôts système : réglages, notifications programmées, méta.
 *
 * Les réglages forment un objet unique et petit : ils sont stockés en **JSON dans une
 * seule ligne**, contrainte par `CHECK (id = 1)`. Une colonne par réglage aurait exigé une
 * migration à chaque nouveau paramètre ; ici, un réglage ajouté est relu avec sa valeur par
 * défaut, sans toucher au schéma.
 *
 * Le dépôt des **fichiers** vit dans `documents.ts`, pas ici : il porte des requêtes que
 * seul ce module-là connaît (`orphans`, qui croise toutes les tables porteuses de fichiers).
 * Deux déclarations de `files` auraient laissé l'étalement de `createRepositories` désigner
 * la plus pauvre, et `orphans()` aurait disparu sans qu'aucun contrôle ne le signale.
 */

import { DEFAULT_SETTINGS } from '@/domain/settings';
import type { AppSettings, ScheduledNotification } from '@/domain/types';
import { notificationFromRow, notificationToRow } from '../mappers';
import { insertStatement, type Row, type SqlDatabase } from '../sql';
import { createTableRepository, type TableRepository } from './base';

export interface SystemRepositories {
  settings: {
    load(): Promise<AppSettings>;
    save(settings: AppSettings, now: string): Promise<void>;
    patch(partial: Partial<AppSettings>, now: string): Promise<AppSettings>;
  };
  notifications: TableRepository<ScheduledNotification> & {
    pendingAfter(iso: string): Promise<ScheduledNotification[]>;
    forRelated(relatedType: string, relatedId: string): Promise<ScheduledNotification[]>;
    replaceAll(notifications: readonly ScheduledNotification[], now: string): Promise<void>;
    removeForRelated(relatedType: string, relatedId: string): Promise<void>;
  };
  meta: {
    get(key: string): Promise<string | null>;
    set(key: string, value: string): Promise<void>;
    remove(key: string): Promise<void>;
  };
}

export function createSystemRepositories(db: SqlDatabase): SystemRepositories {
  const baseNotifications = createTableRepository<ScheduledNotification>(db, {
    table: 'notifications',
    toRow: notificationToRow,
    fromRow: notificationFromRow,
    defaultOrder: 'fireDate ASC',
  });

  return {
    settings: {
      async load(): Promise<AppSettings> {
        const row = await db.getFirstAsync<{ payload: string }>('SELECT payload FROM settings WHERE id = 1');
        if (row === null) return { ...DEFAULT_SETTINGS };
        try {
          const parsed: unknown = JSON.parse(row.payload);
          if (typeof parsed !== 'object' || parsed === null) return { ...DEFAULT_SETTINGS };
          // Fusion avec les valeurs par défaut : un réglage ajouté après coup est relu
          // avec sa valeur par défaut au lieu de valoir `undefined`.
          return { ...DEFAULT_SETTINGS, ...(parsed as Partial<AppSettings>) };
        } catch {
          return { ...DEFAULT_SETTINGS };
        }
      },

      async save(settings: AppSettings, now: string): Promise<void> {
        await db.runAsync(
          `INSERT INTO settings (id, payload, updatedAt) VALUES (1, ?, ?)
           ON CONFLICT(id) DO UPDATE SET payload = excluded.payload, updatedAt = excluded.updatedAt`,
          JSON.stringify(settings),
          now,
        );
      },

      async patch(partial: Partial<AppSettings>, now: string): Promise<AppSettings> {
        const row = await db.getFirstAsync<{ payload: string }>('SELECT payload FROM settings WHERE id = 1');
        let current: AppSettings = { ...DEFAULT_SETTINGS };
        if (row !== null) {
          try {
            const parsed: unknown = JSON.parse(row.payload);
            if (typeof parsed === 'object' && parsed !== null) {
              current = { ...DEFAULT_SETTINGS, ...(parsed as Partial<AppSettings>) };
            }
          } catch {
            current = { ...DEFAULT_SETTINGS };
          }
        }
        const merged: AppSettings = { ...current, ...partial };
        await db.runAsync(
          `INSERT INTO settings (id, payload, updatedAt) VALUES (1, ?, ?)
           ON CONFLICT(id) DO UPDATE SET payload = excluded.payload, updatedAt = excluded.updatedAt`,
          JSON.stringify(merged),
          now,
        );
        return merged;
      },
    },

    notifications: {
      ...baseNotifications,

      async pendingAfter(iso: string): Promise<ScheduledNotification[]> {
        const rows = await db.getAllAsync<Row>(
          'SELECT * FROM notifications WHERE archivedAt IS NULL AND enabled = 1 AND fireDate >= ? ORDER BY fireDate ASC',
          iso,
        );
        return rows.map(notificationFromRow);
      },

      async forRelated(relatedType: string, relatedId: string): Promise<ScheduledNotification[]> {
        const rows = await db.getAllAsync<Row>(
          'SELECT * FROM notifications WHERE archivedAt IS NULL AND relatedType = ? AND relatedId = ? ORDER BY fireDate ASC',
          relatedType,
          relatedId,
        );
        return rows.map(notificationFromRow);
      },

      async replaceAll(notifications: readonly ScheduledNotification[], now: string): Promise<void> {
        await db.runAsync('DELETE FROM notifications WHERE enabled = 1');
        for (const notification of notifications) {
          const statement = insertStatement('notifications', notificationToRow(notification));
          await db.runAsync(statement.sql, ...statement.params);
        }
        void now;
      },

      async removeForRelated(relatedType: string, relatedId: string): Promise<void> {
        await db.runAsync('DELETE FROM notifications WHERE relatedType = ? AND relatedId = ?', relatedType, relatedId);
      },
    },

    meta: {
      async get(key: string): Promise<string | null> {
        const row = await db.getFirstAsync<{ value: string }>('SELECT value FROM meta WHERE key = ?', key);
        return row?.value ?? null;
      },
      async set(key: string, value: string): Promise<void> {
        await db.runAsync(
          `INSERT INTO meta (key, value) VALUES (?, ?)
           ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
          key,
          value,
        );
      },
      async remove(key: string): Promise<void> {
        await db.runAsync('DELETE FROM meta WHERE key = ?', key);
      },
    },
  };
}

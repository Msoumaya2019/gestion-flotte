/**
 * Dépôts des catalogues : catégories de dépense, modes de paiement, types d'entretien,
 * types de documents, clauses de contrat.
 *
 * Ces tables sont semées au premier démarrage puis vivent leur vie. Elles ne sont pas
 * archivables au sens des données métier : un type dont on ne veut plus est archivé, ce
 * qui le retire des listes de saisie sans casser les enregistrements qui le référencent.
 */

import type { Clause, DocumentType, ExpenseCategory, MaintenanceType, PaymentMethod } from '@/domain/types';
import {
  clauseFromRow,
  clauseToRow,
  categoryFromRow,
  categoryToRow,
  documentTypeFromRow,
  documentTypeToRow,
  maintenanceTypeFromRow,
  maintenanceTypeToRow,
  methodFromRow,
  methodToRow,
} from '../mappers';
import type { SqlDatabase } from '../sql';
import { createTableRepository, type TableRepository } from './base';

export interface CatalogRepositories {
  expenseCategories: TableRepository<ExpenseCategory>;
  paymentMethods: TableRepository<PaymentMethod>;
  maintenanceTypes: TableRepository<MaintenanceType>;
  documentTypes: TableRepository<DocumentType>;
  clauses: TableRepository<Clause> & {
    listEnabled(): Promise<Clause[]>;
    reorder(ids: readonly string[], now: string): Promise<void>;
  };
}

export function createCatalogRepositories(db: SqlDatabase): CatalogRepositories {
  const expenseCategories = createTableRepository<ExpenseCategory>(db, {
    table: 'expense_categories',
    toRow: categoryToRow,
    fromRow: categoryFromRow,
    defaultOrder: 'label COLLATE NOCASE ASC',
  });

  const paymentMethods = createTableRepository<PaymentMethod>(db, {
    table: 'payment_methods',
    toRow: methodToRow,
    fromRow: methodFromRow,
    defaultOrder: 'label COLLATE NOCASE ASC',
  });

  const maintenanceTypes = createTableRepository<MaintenanceType>(db, {
    table: 'maintenance_types',
    toRow: maintenanceTypeToRow,
    fromRow: maintenanceTypeFromRow,
    defaultOrder: 'label COLLATE NOCASE ASC',
  });

  const documentTypes = createTableRepository<DocumentType>(db, {
    table: 'document_types',
    toRow: documentTypeToRow,
    fromRow: documentTypeFromRow,
    defaultOrder: 'scope ASC, label COLLATE NOCASE ASC',
  });

  const base = createTableRepository<Clause>(db, {
    table: 'clauses',
    toRow: clauseToRow,
    fromRow: clauseFromRow,
    defaultOrder: 'position ASC',
  });

  return {
    expenseCategories,
    paymentMethods,
    maintenanceTypes,
    documentTypes,
    clauses: {
      ...base,
      async listEnabled(): Promise<Clause[]> {
        const rows = await db.getAllAsync<Record<string, never>>(
          'SELECT * FROM clauses WHERE archivedAt IS NULL AND enabled = 1 ORDER BY position ASC',
        );
        return rows.map((row) => clauseFromRow(row as Parameters<typeof clauseFromRow>[0]));
      },
      async reorder(ids: readonly string[], now: string): Promise<void> {
        for (const [index, id] of ids.entries()) {
          await db.runAsync('UPDATE clauses SET position = ?, updatedAt = ? WHERE id = ?', index, now, id);
        }
      },
    },
  };
}

/** Libellé → identifiant, pour retrouver un élément de catalogue par son nom. */
export function byLabel<T extends { id: string }>(
  items: readonly (T & { label: string })[],
): Record<string, string> {
  const map: Record<string, string> = {};
  for (const item of items) map[item.label] = item.id;
  return map;
}

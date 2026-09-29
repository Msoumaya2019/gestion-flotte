/**
 * Dépôt des dépenses.
 *
 * La table est celle qui grossit le plus vite : une dépense par plein, par péage, par
 * réparation. Les agrégats par catégorie et par période sont donc calculés en SQL et non
 * en mémoire, et la somme d'un véhicule ne lit pas toute la table.
 */

import type { Cents, Expense, IsoDate } from '@/domain/types';
import { expenseFromRow, expenseToRow } from '../mappers';
import type { Row, SqlDatabase } from '../sql';
import { createTableRepository, type TableRepository } from './base';

export interface CategoryTotal {
  categoryId: string;
  totalCents: Cents;
  count: number;
}

export interface ExpenseRepository extends TableRepository<Expense> {
  forVehicle(vehicleId: string): Promise<Expense[]>;
  forRental(rentalId: string): Promise<Expense[]>;
  between(from: IsoDate | null, to: IsoDate | null): Promise<Expense[]>;
  totalForVehicle(vehicleId: string): Promise<Cents>;
  totalBetween(from: IsoDate | null, to: IsoDate | null, vehicleId?: string | null): Promise<Cents>;
  totalsByCategory(from: IsoDate | null, to: IsoDate | null, vehicleId?: string | null): Promise<CategoryTotal[]>;
}

function rangeConditions(from: IsoDate | null, to: IsoDate | null, vehicleId?: string | null): {
  where: string;
  params: (string | number | null)[];
} {
  const conditions = ['archivedAt IS NULL'];
  const params: (string | number | null)[] = [];
  if (from !== null) {
    conditions.push('date >= ?');
    params.push(from);
  }
  if (to !== null) {
    conditions.push('date <= ?');
    params.push(to);
  }
  if (vehicleId !== undefined && vehicleId !== null) {
    conditions.push('vehicleId = ?');
    params.push(vehicleId);
  }
  return { where: conditions.join(' AND '), params };
}

export function createExpenseRepository(db: SqlDatabase): ExpenseRepository {
  const base = createTableRepository<Expense>(db, {
    table: 'expenses',
    toRow: expenseToRow,
    fromRow: expenseFromRow,
    defaultOrder: 'date DESC, createdAt DESC',
  });

  return {
    ...base,
    forVehicle: (vehicleId) => base.findBy('vehicleId', vehicleId),
    forRental: (rentalId) => base.findBy('rentalId', rentalId),

    async between(from: IsoDate | null, to: IsoDate | null): Promise<Expense[]> {
      const { where, params } = rangeConditions(from, to);
      const rows = await db.getAllAsync<Row>(`SELECT * FROM expenses WHERE ${where} ORDER BY date DESC`, ...params);
      return rows.map(expenseFromRow);
    },

    async totalForVehicle(vehicleId: string): Promise<Cents> {
      const row = await db.getFirstAsync<{ total: number }>(
        'SELECT COALESCE(SUM(amountCents), 0) AS total FROM expenses WHERE vehicleId = ? AND archivedAt IS NULL',
        vehicleId,
      );
      return row?.total ?? 0;
    },

    async totalBetween(from, to, vehicleId = null): Promise<Cents> {
      const { where, params } = rangeConditions(from, to, vehicleId);
      const row = await db.getFirstAsync<{ total: number }>(
        `SELECT COALESCE(SUM(amountCents), 0) AS total FROM expenses WHERE ${where}`,
        ...params,
      );
      return row?.total ?? 0;
    },

    async totalsByCategory(from, to, vehicleId = null): Promise<CategoryTotal[]> {
      const { where, params } = rangeConditions(from, to, vehicleId);
      const rows = await db.getAllAsync<{ categoryId: string; total: number; count: number }>(
        `SELECT categoryId, COALESCE(SUM(amountCents), 0) AS total, COUNT(*) AS count
           FROM expenses WHERE ${where}
          GROUP BY categoryId
          ORDER BY total DESC`,
        ...params,
      );
      return rows.map((row) => ({ categoryId: row.categoryId, totalCents: row.total, count: row.count }));
    },
  };
}

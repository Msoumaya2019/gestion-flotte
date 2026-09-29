/**
 * Dépôts du parc : véhicules, locataires, assurances.
 *
 * Les recherches fréquentes de l'application sont servies ici, en SQL, plutôt que par un
 * filtrage en mémoire : la plaque, le nom du locataire, la fin d'assurance. Un filtrage
 * en mémoire sur toute la table fonctionne avec trois véhicules et devient gênant avec
 * cinquante.
 */

import type { Insurance, Tenant, Vehicle } from '@/domain/types';
import { insuranceFromRow, insuranceToRow, tenantFromRow, tenantToRow, vehicleFromRow, vehicleToRow } from '../mappers';
import type { Row, SqlDatabase } from '../sql';
import { createTableRepository, type TableRepository } from './base';

export interface FleetRepositories {
  vehicles: TableRepository<Vehicle> & {
    findByPlate(plate: string): Promise<Vehicle | null>;
    updateMileage(id: string, km: number, now: string): Promise<void>;
    setStatus(id: string, status: Vehicle['status'], now: string): Promise<void>;
    withActiveRental(): Promise<Vehicle[]>;
  };
  tenants: TableRepository<Tenant> & {
    fullName(id: string): Promise<string | null>;
    search(term: string): Promise<Tenant[]>;
  };
  insurances: TableRepository<Insurance> & {
    expiringBefore(date: string): Promise<Insurance[]>;
  };
}

export function createFleetRepositories(db: SqlDatabase): FleetRepositories {
  const baseVehicles = createTableRepository<Vehicle>(db, {
    table: 'vehicles',
    toRow: vehicleToRow,
    fromRow: vehicleFromRow,
    defaultOrder: 'brand COLLATE NOCASE ASC, model COLLATE NOCASE ASC',
  });

  const baseTenants = createTableRepository<Tenant>(db, {
    table: 'tenants',
    toRow: tenantToRow,
    fromRow: tenantFromRow,
    defaultOrder: 'lastName COLLATE NOCASE ASC, firstName COLLATE NOCASE ASC',
  });

  const baseInsurances = createTableRepository<Insurance>(db, {
    table: 'insurances',
    toRow: insuranceToRow,
    fromRow: insuranceFromRow,
    defaultOrder: 'endDate ASC',
  });

  return {
    vehicles: {
      ...baseVehicles,
      async findByPlate(plate: string): Promise<Vehicle | null> {
        const normalized = plate.replace(/\s+/g, '').toUpperCase();
        const row = await db.getFirstAsync<Row>(
          `SELECT * FROM vehicles
           WHERE archivedAt IS NULL
             AND UPPER(REPLACE(REPLACE(plate, ' ', ''), '-', '')) = ?
           LIMIT 1`,
          normalized.replace(/-/g, ''),
        );
        return row === null ? null : vehicleFromRow(row);
      },
      async updateMileage(id: string, km: number, now: string): Promise<void> {
        // On ne fait jamais reculer un compteur : une saisie inférieure est ignorée.
        await db.runAsync(
          'UPDATE vehicles SET currentMileageKm = ?, updatedAt = ? WHERE id = ? AND currentMileageKm < ?',
          Math.max(0, Math.round(km)),
          now,
          id,
          Math.max(0, Math.round(km)),
        );
      },
      async setStatus(id: string, status: Vehicle['status'], now: string): Promise<void> {
        await db.runAsync('UPDATE vehicles SET status = ?, updatedAt = ? WHERE id = ?', status, now, id);
      },
      async withActiveRental(): Promise<Vehicle[]> {
        const rows = await db.getAllAsync<Row>(
          `SELECT DISTINCT v.* FROM vehicles v
           INNER JOIN rentals r ON r.vehicleId = v.id
           WHERE r.status = 'active' AND r.archivedAt IS NULL AND v.archivedAt IS NULL
           ORDER BY v.brand COLLATE NOCASE ASC, v.model COLLATE NOCASE ASC`,
        );
        return rows.map(vehicleFromRow);
      },
    },

    tenants: {
      ...baseTenants,
      async fullName(id: string): Promise<string | null> {
        const row = await db.getFirstAsync<{ firstName: string; lastName: string }>(
          'SELECT firstName, lastName FROM tenants WHERE id = ?',
          id,
        );
        if (row === null) return null;
        return `${row.firstName} ${row.lastName}`.trim();
      },
      async search(term: string): Promise<Tenant[]> {
        const pattern = `%${term.trim().toLowerCase()}%`;
        const rows = await db.getAllAsync<Row>(
          `SELECT * FROM tenants
           WHERE archivedAt IS NULL
             AND (LOWER(firstName) LIKE ? OR LOWER(lastName) LIKE ? OR LOWER(email) LIKE ? OR phone LIKE ?)
           ORDER BY lastName COLLATE NOCASE ASC`,
          pattern,
          pattern,
          pattern,
          pattern,
        );
        return rows.map(tenantFromRow);
      },
    },

    insurances: {
      ...baseInsurances,
      async expiringBefore(date: string): Promise<Insurance[]> {
        const rows = await db.getAllAsync<Row>(
          `SELECT * FROM insurances
           WHERE archivedAt IS NULL AND endDate IS NOT NULL AND endDate <= ?
           ORDER BY endDate ASC`,
          date,
        );
        return rows.map(insuranceFromRow);
      },
    },
  };
}

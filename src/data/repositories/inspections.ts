/**
 * Dépôts des états des lieux et des dommages.
 *
 * Un état des lieux se cherche par couple (location, sens) : c'est la clé de l'écran de
 * retour, qui doit retrouver l'état des lieux de départ pour le comparer. La contrainte
 * est posée par un index unique partiel, pour qu'un second état des lieux de départ sur
 * la même location ne puisse pas être créé par inadvertance.
 */

import type { Damage, Inspection } from '@/domain/types';
import { damageFromRow, damageToRow, inspectionFromRow, inspectionToRow } from '../mappers';
import type { Row, SqlDatabase } from '../sql';
import { createTableRepository, type TableRepository } from './base';

export interface InspectionRepositories {
  inspections: TableRepository<Inspection> & {
    forRental(rentalId: string): Promise<Inspection[]>;
    forVehicle(vehicleId: string): Promise<Inspection[]>;
    find(rentalId: string, kind: Inspection['kind']): Promise<Inspection | null>;
  };
  damages: TableRepository<Damage> & {
    forVehicle(vehicleId: string): Promise<Damage[]>;
    forRental(rentalId: string): Promise<Damage[]>;
    forInspection(inspectionId: string): Promise<Damage[]>;
    unrepairedForVehicle(vehicleId: string): Promise<Damage[]>;
  };
}

export function createInspectionRepositories(db: SqlDatabase): InspectionRepositories {
  const baseInspections = createTableRepository<Inspection>(db, {
    table: 'inspections',
    toRow: inspectionToRow,
    fromRow: inspectionFromRow,
    defaultOrder: 'date DESC',
  });

  const baseDamages = createTableRepository<Damage>(db, {
    table: 'damages',
    toRow: damageToRow,
    fromRow: damageFromRow,
    defaultOrder: 'date DESC',
  });

  return {
    inspections: {
      ...baseInspections,
      forRental: (rentalId) => baseInspections.findBy('rentalId', rentalId),
      forVehicle: (vehicleId) => baseInspections.findBy('vehicleId', vehicleId),

      async find(rentalId: string, kind: Inspection['kind']): Promise<Inspection | null> {
        const row = await db.getFirstAsync<Row>(
          'SELECT * FROM inspections WHERE rentalId = ? AND kind = ? AND archivedAt IS NULL ORDER BY date DESC LIMIT 1',
          rentalId,
          kind,
        );
        return row === null ? null : inspectionFromRow(row);
      },
    },

    damages: {
      ...baseDamages,
      forVehicle: (vehicleId) => baseDamages.findBy('vehicleId', vehicleId),
      forRental: (rentalId) => baseDamages.findBy('rentalId', rentalId),
      forInspection: (inspectionId) => baseDamages.findBy('inspectionId', inspectionId),

      async unrepairedForVehicle(vehicleId: string): Promise<Damage[]> {
        const rows = await db.getAllAsync<Row>(
          'SELECT * FROM damages WHERE vehicleId = ? AND repaired = 0 AND archivedAt IS NULL ORDER BY date DESC',
          vehicleId,
        );
        return rows.map(damageFromRow);
      },
    },
  };
}

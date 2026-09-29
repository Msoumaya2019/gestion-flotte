/**
 * Dépôts de l'entretien : plans, interventions, relevés de kilométrage.
 *
 * `upsertPlan` mérite une explication : un plan est unique par couple (véhicule, type),
 * ce qu'un index unique garantit en base. Créer un plan pour une vidange déjà planifiée
 * doit donc **compléter** le plan existant plutôt que d'en créer un second, sans quoi deux
 * échéances concurrentes apparaîtraient pour le même entretien.
 */

import type { Km, MaintenancePlan, MaintenanceRecord, MileageRecord } from '@/domain/types';
import {
  maintenancePlanFromRow,
  maintenancePlanToRow,
  maintenanceRecordFromRow,
  maintenanceRecordToRow,
  mileageFromRow,
  mileageToRow,
} from '../mappers';
import type { Row, SqlDatabase } from '../sql';
import { createTableRepository, type TableRepository } from './base';

export interface MaintenanceRepositories {
  maintenancePlans: TableRepository<MaintenancePlan> & {
    forVehicle(vehicleId: string): Promise<MaintenancePlan[]>;
    forVehicleAndType(vehicleId: string, typeId: string): Promise<MaintenancePlan | null>;
    upsertPlan(plan: MaintenancePlan): Promise<MaintenancePlan>;
    applyIntervention(planId: string, date: string, mileageKm: Km, now: string): Promise<void>;
  };
  maintenanceRecords: TableRepository<MaintenanceRecord> & {
    forVehicle(vehicleId: string): Promise<MaintenanceRecord[]>;
    forPlan(planId: string): Promise<MaintenanceRecord[]>;
    latestForPlan(planId: string): Promise<MaintenanceRecord | null>;
  };
  mileageRecords: TableRepository<MileageRecord> & {
    forVehicle(vehicleId: string): Promise<MileageRecord[]>;
    latestForVehicle(vehicleId: string): Promise<MileageRecord | null>;
  };
}

export function createMaintenanceRepositories(db: SqlDatabase): MaintenanceRepositories {
  const basePlans = createTableRepository<MaintenancePlan>(db, {
    table: 'maintenance_plans',
    toRow: maintenancePlanToRow,
    fromRow: maintenancePlanFromRow,
    defaultOrder: 'createdAt ASC',
  });

  const baseRecords = createTableRepository<MaintenanceRecord>(db, {
    table: 'maintenance_records',
    toRow: maintenanceRecordToRow,
    fromRow: maintenanceRecordFromRow,
    defaultOrder: 'date DESC',
  });

  const baseMileage = createTableRepository<MileageRecord>(db, {
    table: 'mileage_records',
    toRow: mileageToRow,
    fromRow: mileageFromRow,
    defaultOrder: 'date DESC',
  });

  async function findForVehicleAndType(vehicleId: string, typeId: string): Promise<MaintenancePlan | null> {
    const row = await db.getFirstAsync<Row>(
      'SELECT * FROM maintenance_plans WHERE vehicleId = ? AND typeId = ? AND archivedAt IS NULL LIMIT 1',
      vehicleId,
      typeId,
    );
    return row === null ? null : maintenancePlanFromRow(row);
  }

  return {
    maintenancePlans: {
      ...basePlans,
      forVehicle: (vehicleId) => basePlans.findBy('vehicleId', vehicleId),
      forVehicleAndType: findForVehicleAndType,

      async upsertPlan(plan: MaintenancePlan): Promise<MaintenancePlan> {
        const existing = await findForVehicleAndType(plan.vehicleId, plan.typeId);
        if (existing === null) {
          await basePlans.insert(plan);
          return plan;
        }
        const merged: MaintenancePlan = {
          ...existing,
          intervalMode: plan.intervalMode,
          intervalKm: plan.intervalKm,
          intervalMonths: plan.intervalMonths,
          lastKm: plan.lastKm ?? existing.lastKm,
          lastDate: plan.lastDate ?? existing.lastDate,
          active: plan.active,
          notes: plan.notes,
          updatedAt: plan.updatedAt,
        };
        await basePlans.update(merged);
        return merged;
      },

      async applyIntervention(planId: string, date: string, mileageKm: Km, now: string): Promise<void> {
        await db.runAsync(
          'UPDATE maintenance_plans SET lastDate = ?, lastKm = ?, updatedAt = ? WHERE id = ?',
          date,
          Math.max(0, Math.round(mileageKm)),
          now,
          planId,
        );
      },
    },

    maintenanceRecords: {
      ...baseRecords,
      forVehicle: (vehicleId) => baseRecords.findBy('vehicleId', vehicleId),
      forPlan: (planId) => baseRecords.findBy('planId', planId),

      async latestForPlan(planId: string): Promise<MaintenanceRecord | null> {
        const row = await db.getFirstAsync<Row>(
          'SELECT * FROM maintenance_records WHERE planId = ? AND archivedAt IS NULL ORDER BY date DESC, mileageKm DESC LIMIT 1',
          planId,
        );
        return row === null ? null : maintenanceRecordFromRow(row);
      },
    },

    mileageRecords: {
      ...baseMileage,
      forVehicle: (vehicleId) => baseMileage.findBy('vehicleId', vehicleId),

      async latestForVehicle(vehicleId: string): Promise<MileageRecord | null> {
        const row = await db.getFirstAsync<Row>(
          'SELECT * FROM mileage_records WHERE vehicleId = ? AND archivedAt IS NULL ORDER BY date DESC, km DESC LIMIT 1',
          vehicleId,
        );
        return row === null ? null : mileageFromRow(row);
      },
    },
  };
}

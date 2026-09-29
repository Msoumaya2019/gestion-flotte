/**
 * Dépôts des locations, contrats et échéances.
 *
 * `activateRental` est la seule opération qui touche trois tables à la fois : la location
 * passe en cours, le véhicule passe en « loué », et l'échéancier est engendré. Elle est
 * donc transactionnelle — sinon une location active pourrait exister sans échéances, et
 * le tableau de bord annoncerait zéro loyer attendu sur un véhicule occupé.
 */

import { scheduleDueDates } from '@/domain/rental';
import type {
  Cents,
  Contract,
  DepositOutcome,
  IsoDate,
  Km,
  MileageRecord,
  Payment,
  Rental,
  VehicleStatus,
} from '@/domain/types';
import {
  contractFromRow,
  contractToRow,
  mileageToRow,
  paymentFromRow,
  paymentToRow,
  rentalFromRow,
  rentalToRow,
} from '../mappers';
import { insertStatement, transaction, type Row, type SqlDatabase } from '../sql';
import { createTableRepository, type TableRepository } from './base';

export interface GenerateScheduleInput {
  rental: Rental;
  /** Dernière date à couvrir. */
  until: IsoDate;
  tenantId: string;
  methodId: string | null;
}

export interface ActivateRentalInput {
  id: string;
  /** Dernière date à couvrir par l'échéancier. */
  until: IsoDate;
  /** Mode de paiement proposé sur chaque échéance engendrée. */
  methodId: string | null;
  now: string;
}

export interface CloseRentalInput {
  id: string;
  endDate: IsoDate;
  endMileageKm: Km;
  depositOutcome: DepositOutcome;
  depositReturnedCents: Cents;
  /** Statut rendu au véhicule : « disponible » le plus souvent, « entretien » si besoin. */
  vehicleStatus: VehicleStatus;
  /** Identifiant du relevé de compteur créé par la restitution. */
  mileageRecordId: string;
  now: string;
}

export interface RentalRepositories {
  rentals: TableRepository<Rental> & {
    forVehicle(vehicleId: string): Promise<Rental[]>;
    forTenant(tenantId: string): Promise<Rental[]>;
    currentForVehicle(vehicleId: string): Promise<Rental | null>;
    active(): Promise<Rental[]>;
    /**
     * Passe la location en cours, marque le véhicule « loué » et engendre l'échéancier.
     *
     * Les trois écritures sont dans **une seule transaction**. Séparées, une panne au
     * milieu laisserait une location active sans échéances — le tableau de bord annoncerait
     * alors zéro loyer attendu sur un véhicule occupé, et personne ne s'en apercevrait
     * avant la fin du mois.
     *
     * L'opération est **idempotente** : rappelée sur une location déjà active, elle ne
     * réécrit rien et complète seulement les échéances manquantes. C'est ce qui permet de
     * la relancer sans risque après avoir modifié les conditions.
     */
    activate(input: ActivateRentalInput): Promise<Payment[]>;
    /**
     * Clôt la location : statut, kilométrage de fin, sort de la caution, véhicule rendu
     * à un statut choisi, et relevé de compteur. Une seule transaction, pour la même
     * raison que l'activation.
     */
    close(input: CloseRentalInput): Promise<void>;
  };
  contracts: TableRepository<Contract> & {
    forRental(rentalId: string): Promise<Contract[]>;
    nextReference(year: number): Promise<string>;
  };
  payments: TableRepository<Payment> & {
    forRental(rentalId: string): Promise<Payment[]>;
    forVehicle(vehicleId: string): Promise<Payment[]>;
    forTenant(tenantId: string): Promise<Payment[]>;
    /** Échéances dont la date est comprise dans la fenêtre. */
    between(from: IsoDate | null, to: IsoDate | null): Promise<Payment[]>;
    /** Échéances non soldées et déjà échues. */
    overdue(today: IsoDate): Promise<Payment[]>;
    /** Somme reçue sur une échéance donnée. */
    recordPayment(input: {
      id: string;
      receivedCents: Cents;
      paidDate: IsoDate | null;
      methodId: string | null;
      payerType: Payment['payerType'];
      payerName: string;
      comment: string;
      now: string;
    }): Promise<void>;
    generateForRental(input: GenerateScheduleInput): Promise<Payment[]>;
  };
}

export function createRentalRepositories(db: SqlDatabase): RentalRepositories {
  const baseRentals = createTableRepository<Rental>(db, {
    table: 'rentals',
    toRow: rentalToRow,
    fromRow: rentalFromRow,
    defaultOrder: 'startDate DESC',
  });

  const baseContracts = createTableRepository<Contract>(db, {
    table: 'contracts',
    toRow: contractToRow,
    fromRow: contractFromRow,
    defaultOrder: 'createdAt DESC',
  });

  const basePayments = createTableRepository<Payment>(db, {
    table: 'payments',
    toRow: paymentToRow,
    fromRow: paymentFromRow,
    defaultOrder: 'dueDate ASC',
  });

  /**
   * Engendre les échéances manquantes d'une location.
   *
   * Défini hors de l'objet rendu parce que deux appelants en ont besoin : le dépôt des
   * échéances lui-même, et l'activation — qui doit l'exécuter **dans sa transaction**.
   * L'identifiant d'une échéance est `location:date` : rejouer la génération ne crée donc
   * jamais de doublon, même si la lecture préalable était périmée.
   */
  async function generateSchedule(input: GenerateScheduleInput): Promise<Payment[]> {
    const { rental, until } = input;
    const existing = await basePayments.findBy('rentalId', rental.id, { includeArchived: true });
    const known = new Set(existing.map((payment) => payment.dueDate));

    const dates = scheduleDueDates({
      startDate: rental.startDate,
      endDate: rental.endDate,
      openEnded: rental.openEnded,
      frequency: rental.frequency,
      intervalDays: rental.intervalDays,
      dueWeekday: rental.dueWeekday,
      dueDayOfMonth: rental.dueDayOfMonth,
      paymentTiming: rental.paymentTiming,
      until,
    });

    const created: Payment[] = [];
    for (const dueDate of dates) {
      if (known.has(dueDate)) continue;
      const payment: Payment = {
        id: `${rental.id}:${dueDate}`,
        createdAt: rental.createdAt,
        updatedAt: rental.updatedAt,
        archivedAt: null,
        rentalId: rental.id,
        vehicleId: rental.vehicleId,
        tenantId: input.tenantId,
        dueDate,
        expectedCents: rental.rentAmountCents,
        receivedCents: 0,
        paidDate: null,
        methodId: input.methodId,
        payerType: 'locataire',
        payerName: '',
        comment: '',
        proofFileId: null,
        status: 'a_venir',
      };
      const statement = insertStatement('payments', paymentToRow(payment));
      await db.runAsync(statement.sql, ...statement.params);
      created.push(payment);
    }
    return created;
  }

  return {
    rentals: {
      ...baseRentals,
      forVehicle: (vehicleId) => baseRentals.findBy('vehicleId', vehicleId),
      forTenant: (tenantId) => baseRentals.findBy('tenantId', tenantId),
      async currentForVehicle(vehicleId: string): Promise<Rental | null> {
        const row = await db.getFirstAsync<Row>(
          `SELECT * FROM rentals
           WHERE vehicleId = ? AND status = 'active' AND archivedAt IS NULL
           ORDER BY startDate DESC LIMIT 1`,
          vehicleId,
        );
        return row === null ? null : rentalFromRow(row);
      },
      async active(): Promise<Rental[]> {
        const rows = await db.getAllAsync<Row>(
          `SELECT * FROM rentals WHERE status = 'active' AND archivedAt IS NULL ORDER BY startDate DESC`,
        );
        return rows.map(rentalFromRow);
      },

      async activate(input: ActivateRentalInput): Promise<Payment[]> {
        return transaction(db, async () => {
          const row = await db.getFirstAsync<Row>('SELECT * FROM rentals WHERE id = ?', input.id);
          if (row === null) {
            throw new Error(`Location introuvable : « ${input.id} ».`);
          }
          const rental = rentalFromRow(row);

          if (rental.status !== 'active') {
            await db.runAsync(
              `UPDATE rentals SET status = 'active', activatedAt = ?, endedAt = NULL, updatedAt = ?
               WHERE id = ?`,
              input.now,
              input.now,
              input.id,
            );
            // Le véhicule suit la location : c'est ce qui le fait sortir des « disponibles »
            // sans que l'utilisateur ait à y penser.
            await db.runAsync(
              `UPDATE vehicles SET status = 'loue', updatedAt = ? WHERE id = ?`,
              input.now,
              rental.vehicleId,
            );
          }

          return generateSchedule({
            rental: { ...rental, status: 'active', activatedAt: input.now, updatedAt: input.now },
            until: input.until,
            tenantId: rental.tenantId,
            methodId: input.methodId,
          });
        });
      },

      async close(input: CloseRentalInput): Promise<void> {
        await transaction(db, async () => {
          const row = await db.getFirstAsync<Row>('SELECT * FROM rentals WHERE id = ?', input.id);
          if (row === null) {
            throw new Error(`Location introuvable : « ${input.id} ».`);
          }
          const rental = rentalFromRow(row);

          await db.runAsync(
            `UPDATE rentals
               SET status = 'terminee', endDate = ?, endMileageKm = ?, endedAt = ?,
                   depositOutcome = ?, depositReturnedCents = ?, updatedAt = ?
             WHERE id = ?`,
            input.endDate,
            input.endMileageKm,
            input.now,
            input.depositOutcome,
            Math.max(0, Math.round(input.depositReturnedCents)),
            input.now,
            input.id,
          );

          // Le compteur n'avance que s'il avance : une restitution saisie avec un
          // kilométrage inférieur au dernier relevé ne doit pas faire reculer l'odomètre.
          await db.runAsync(
            `UPDATE vehicles SET currentMileageKm = ?, updatedAt = ?
             WHERE id = ? AND currentMileageKm < ?`,
            input.endMileageKm,
            input.now,
            rental.vehicleId,
            input.endMileageKm,
          );
          // Le statut, lui, change dans tous les cas : sans cette seconde requête, une
          // restitution au même kilométrage laisserait le véhicule marqué « loué ».
          await db.runAsync(
            `UPDATE vehicles SET status = ?, updatedAt = ? WHERE id = ?`,
            input.vehicleStatus,
            input.now,
            rental.vehicleId,
          );

          const record: MileageRecord = {
            id: input.mileageRecordId,
            createdAt: input.now,
            updatedAt: input.now,
            archivedAt: null,
            vehicleId: rental.vehicleId,
            date: input.endDate,
            km: input.endMileageKm,
            source: 'location',
            rentalId: rental.id,
            comment: 'Kilométrage à la restitution',
          };
          const statement = insertStatement('mileage_records', mileageToRow(record));
          await db.runAsync(statement.sql, ...statement.params);
        });
      },
    },

    contracts: {
      ...baseContracts,
      forRental: (rentalId) => baseContracts.findBy('rentalId', rentalId),
      async nextReference(year: number): Promise<string> {
        const prefix = `CT-${year}-`;
        const row = await db.getFirstAsync<{ total: number }>(
          'SELECT COUNT(*) AS total FROM contracts WHERE reference LIKE ?',
          `${prefix}%`,
        );
        const sequence = (row?.total ?? 0) + 1;
        return `${prefix}${String(sequence).padStart(4, '0')}`;
      },
    },

    payments: {
      ...basePayments,
      forRental: (rentalId) => basePayments.findBy('rentalId', rentalId),
      forVehicle: (vehicleId) => basePayments.findBy('vehicleId', vehicleId),
      forTenant: (tenantId) => basePayments.findBy('tenantId', tenantId),

      async between(from: IsoDate | null, to: IsoDate | null): Promise<Payment[]> {
        const conditions: string[] = ['archivedAt IS NULL'];
        const params: (string | number | null)[] = [];
        if (from !== null) {
          conditions.push('dueDate >= ?');
          params.push(from);
        }
        if (to !== null) {
          conditions.push('dueDate <= ?');
          params.push(to);
        }
        const rows = await db.getAllAsync<Row>(
          `SELECT * FROM payments WHERE ${conditions.join(' AND ')} ORDER BY dueDate ASC`,
          ...params,
        );
        return rows.map(paymentFromRow);
      },

      async overdue(today: IsoDate): Promise<Payment[]> {
        // Le solde est comparé en SQL pour ne remonter que ce qui est réellement dû :
        // une échéance passée et partiellement réglée reste due.
        const rows = await db.getAllAsync<Row>(
          `SELECT * FROM payments
           WHERE archivedAt IS NULL
             AND status NOT IN ('annule', 'paye', 'impaye')
             AND dueDate < ?
             AND receivedCents < expectedCents
           ORDER BY dueDate ASC`,
          today,
        );
        return rows.map(paymentFromRow);
      },

      async recordPayment(input): Promise<void> {
        await db.runAsync(
          `UPDATE payments
             SET receivedCents = ?, paidDate = ?, methodId = ?, payerType = ?, payerName = ?,
                 comment = ?, updatedAt = ?
           WHERE id = ?`,
          Math.max(0, Math.round(input.receivedCents)),
          input.paidDate,
          input.methodId,
          input.payerType,
          input.payerName,
          input.comment,
          input.now,
          input.id,
        );
      },

      async generateForRental(input: GenerateScheduleInput): Promise<Payment[]> {
        return generateSchedule(input);
      },
    },
  };
}

/** Identifiant d'échéance déterministe : une location et une date désignent une échéance. */
export function paymentId(rentalId: string, dueDate: IsoDate): string {
  return `${rentalId}:${dueDate}`;
}

/**
 * Dépôts des documents et des fichiers locaux.
 *
 * Deux tables distinctes, et c'est volontaire :
 *
 * - la **métadonnée** (type, numéro, dates, commentaire) vit dans `tenant_documents` ou
 *   `vehicle_documents`, et se requête ;
 * - le **fichier** vit dans `files`, et son contenu vit sur le disque, dans le dossier
 *   privé de l'application. La colonne `relativePath` est un chemin **relatif** : une URL
 *   absolue survivrait mal à une réinstallation de l'application, qui change le dossier
 *   racine de son bac à sable.
 */

import type { IsoDate, TenantDocument, VehicleDocument } from '@/domain/types';
import {
  fileFromRow,
  fileToRow,
  tenantDocumentFromRow,
  tenantDocumentToRow,
  vehicleDocumentFromRow,
  vehicleDocumentToRow,
  type StoredFile,
} from '../mappers';
import type { Row, SqlDatabase } from '../sql';
import { createTableRepository, type TableRepository } from './base';

export interface DocumentRepositories {
  tenantDocuments: TableRepository<TenantDocument> & {
    forTenant(tenantId: string): Promise<TenantDocument[]>;
    expiringBefore(date: IsoDate): Promise<TenantDocument[]>;
    /** Documents rattachés à un type, tous locataires confondus. */
    forType(typeId: string): Promise<TenantDocument[]>;
  };
  vehicleDocuments: TableRepository<VehicleDocument> & {
    forVehicle(vehicleId: string): Promise<VehicleDocument[]>;
    expiringBefore(date: IsoDate): Promise<VehicleDocument[]>;
  };
  files: TableRepository<StoredFile> & {
    forKind(kind: string): Promise<StoredFile[]>;
    totalSizeBytes(): Promise<number>;
    /** Fichiers que plus aucun document ne référence : candidats au nettoyage. */
    orphans(): Promise<StoredFile[]>;
  };
}

export function createDocumentRepositories(db: SqlDatabase): DocumentRepositories {
  const baseTenantDocuments = createTableRepository<TenantDocument>(db, {
    table: 'tenant_documents',
    toRow: tenantDocumentToRow,
    fromRow: tenantDocumentFromRow,
    defaultOrder: 'expiryDate ASC',
  });

  const baseVehicleDocuments = createTableRepository<VehicleDocument>(db, {
    table: 'vehicle_documents',
    toRow: vehicleDocumentToRow,
    fromRow: vehicleDocumentFromRow,
    defaultOrder: 'expiryDate ASC',
  });

  const baseFiles = createTableRepository<StoredFile>(db, {
    table: 'files',
    toRow: fileToRow,
    fromRow: fileFromRow,
    defaultOrder: 'createdAt DESC',
  });

  return {
    tenantDocuments: {
      ...baseTenantDocuments,
      forTenant: (tenantId) => baseTenantDocuments.findBy('tenantId', tenantId),
      forType: (typeId) => baseTenantDocuments.findBy('typeId', typeId),

      async expiringBefore(date: IsoDate): Promise<TenantDocument[]> {
        const rows = await db.getAllAsync<Row>(
          `SELECT * FROM tenant_documents
           WHERE archivedAt IS NULL AND expiryDate IS NOT NULL AND expiryDate <= ?
           ORDER BY expiryDate ASC`,
          date,
        );
        return rows.map(tenantDocumentFromRow);
      },
    },

    vehicleDocuments: {
      ...baseVehicleDocuments,
      forVehicle: (vehicleId) => baseVehicleDocuments.findBy('vehicleId', vehicleId),

      async expiringBefore(date: IsoDate): Promise<VehicleDocument[]> {
        const rows = await db.getAllAsync<Row>(
          `SELECT * FROM vehicle_documents
           WHERE archivedAt IS NULL AND expiryDate IS NOT NULL AND expiryDate <= ?
           ORDER BY expiryDate ASC`,
          date,
        );
        return rows.map(vehicleDocumentFromRow);
      },
    },

    files: {
      ...baseFiles,
      forKind: (kind) => baseFiles.findBy('kind', kind),

      async totalSizeBytes(): Promise<number> {
        const row = await db.getFirstAsync<{ total: number }>(
          'SELECT COALESCE(SUM(sizeBytes), 0) AS total FROM files WHERE archivedAt IS NULL',
        );
        return row?.total ?? 0;
      },

      async orphans(): Promise<StoredFile[]> {
        const rows = await db.getAllAsync<Row>(
          `SELECT * FROM files f
           WHERE f.archivedAt IS NULL
             AND NOT EXISTS (SELECT 1 FROM tenant_documents d WHERE d.fileId = f.id)
             AND NOT EXISTS (SELECT 1 FROM vehicle_documents d WHERE d.fileId = f.id)
             AND NOT EXISTS (SELECT 1 FROM vehicles v WHERE v.photoFileId = f.id)
             AND NOT EXISTS (SELECT 1 FROM contracts c WHERE c.pdfFileId = f.id)
             AND NOT EXISTS (SELECT 1 FROM expenses e WHERE e.invoiceFileId = f.id OR e.photoFileId = f.id)
             AND NOT EXISTS (SELECT 1 FROM maintenance_records r WHERE r.invoiceFileId = f.id OR r.photoFileId = f.id)
             AND NOT EXISTS (SELECT 1 FROM damages dm WHERE dm.photoFileId = f.id)
             AND NOT EXISTS (SELECT 1 FROM insurances i WHERE i.documentFileId = f.id)
           ORDER BY f.createdAt ASC`,
        );
        return rows.map(fileFromRow);
      },
    },
  };
}

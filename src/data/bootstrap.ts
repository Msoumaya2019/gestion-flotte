/**
 * Amorçage de la base : migrations, catalogues, données de démonstration.
 *
 * L'amorçage est **idempotent** : appelé à chaque ouverture de l'application, il ne
 * réinstalle rien. Les catalogues ne sont semés que si leurs tables sont vides, et les
 * données de démonstration ne sont installées qu'une fois, la version installée étant
 * inscrite dans les réglages.
 *
 * Les données de démonstration sont **facultatives** et ne reviennent jamais après avoir
 * été supprimées : c'est ce qu'on attend d'un jeu d'essai, et l'inverse ferait réapparaître
 * des véhicules fictifs chez quelqu'un qui les a effacés.
 */

import { todayIso } from '@/domain/dates';
import {
  DEFAULT_CLAUSES,
  DEFAULT_DOCUMENT_TYPES,
  DEFAULT_EXPENSE_CATEGORIES,
  DEFAULT_MAINTENANCE_TYPES,
  DEFAULT_PAYMENT_METHODS,
} from '@/domain/catalog';
import { buildSeedData } from '@/domain/seed';
import type { Clause, DocumentType, ExpenseCategory, MaintenanceType, PaymentMethod } from '@/domain/types';
import { MIGRATIONS, runMigrations } from './migrations';
import { createRepositories, type Repositories } from './repositories';
import { byLabel } from './repositories/catalog';
import { transaction, type SqlDatabase } from './sql';

export interface BootstrapOptions {
  /** Fabrique d'identifiants. L'application passe un générateur fondé sur `expo-crypto`. */
  newId: () => string;
  now?: string;
  today?: string;
  /** Installer les véhicules et locataires fictifs au premier démarrage. */
  withDemoData?: boolean;
}

export interface BootstrapResult {
  repositories: Repositories;
  /**
   * La base ouverte, en accès brut.
   *
   * Réservé à la **sauvegarde et à la restauration**, qui dumpent les tables telles
   * quelles. Tout le reste passe par `repositories`, qui porte les règles métier.
   */
  db: SqlDatabase;
  schemaVersion: number;
  demoInstalled: boolean;
}

const DEMO_SEED_VERSION = 1;

export async function bootstrapDatabase(
  db: SqlDatabase,
  options: BootstrapOptions,
): Promise<BootstrapResult> {
  const now = options.now ?? new Date().toISOString();
  const today = options.today ?? todayIso();
  const schemaVersion = await runMigrations(db, MIGRATIONS);
  const repositories = createRepositories(db);

  // -------------------------------------------------------------------------
  // Catalogues : semés seulement s'ils sont vides.
  // -------------------------------------------------------------------------
  if ((await repositories.expenseCategories.count({ includeArchived: true })) === 0) {
    const categories: ExpenseCategory[] = DEFAULT_EXPENSE_CATEGORIES.map((seed) => ({
      id: options.newId(),
      createdAt: now,
      updatedAt: now,
      archivedAt: null,
      label: seed.label,
      icon: seed.icon,
      isDefault: true,
    }));
    await repositories.expenseCategories.insertMany(categories);

    const methods: PaymentMethod[] = DEFAULT_PAYMENT_METHODS.map((label) => ({
      id: options.newId(),
      createdAt: now,
      updatedAt: now,
      archivedAt: null,
      label,
      isDefault: true,
    }));
    await repositories.paymentMethods.insertMany(methods);

    const maintenanceTypes: MaintenanceType[] = DEFAULT_MAINTENANCE_TYPES.map((seed) => ({
      id: options.newId(),
      createdAt: now,
      updatedAt: now,
      archivedAt: null,
      label: seed.label,
      intervalMode: seed.intervalMode,
      intervalKm: seed.intervalKm,
      intervalMonths: seed.intervalMonths,
      isDefault: true,
    }));
    await repositories.maintenanceTypes.insertMany(maintenanceTypes);

    const documentTypes: DocumentType[] = DEFAULT_DOCUMENT_TYPES.map((seed) => ({
      id: options.newId(),
      createdAt: now,
      updatedAt: now,
      archivedAt: null,
      label: seed.label,
      scope: seed.scope,
      hasExpiry: seed.hasExpiry,
      isDefault: true,
      requiredByDefault: seed.requiredByDefault,
    }));
    await repositories.documentTypes.insertMany(documentTypes);

    const clauses: Clause[] = DEFAULT_CLAUSES.map((seed, index) => ({
      id: options.newId(),
      createdAt: now,
      updatedAt: now,
      archivedAt: null,
      title: seed.title,
      body: seed.body,
      enabled: true,
      position: index,
      isDefault: true,
    }));
    await repositories.clauses.insertMany(clauses);
  }

  // -------------------------------------------------------------------------
  // Réglages : la liste des documents obligatoires suit les valeurs par défaut du catalogue.
  // -------------------------------------------------------------------------
  let settings = await repositories.settings.load();
  if (settings.requiredDocumentTypeIds.length === 0) {
    const documentTypes = await repositories.documentTypes.list();
    settings = await repositories.settings.patch(
      {
        requiredDocumentTypeIds: documentTypes.filter((type) => type.requiredByDefault).map((type) => type.id),
      },
      now,
    );
  }

  // -------------------------------------------------------------------------
  // Données de démonstration, une seule fois.
  // -------------------------------------------------------------------------
  let demoInstalled = false;
  if (options.withDemoData === true && settings.seedVersion < DEMO_SEED_VERSION) {
    const categories = await repositories.expenseCategories.list();
    const methods = await repositories.paymentMethods.list();
    const maintenanceTypes = await repositories.maintenanceTypes.list();
    const documentTypes = await repositories.documentTypes.list();

    const seed = buildSeedData({
      newId: options.newId,
      now,
      today,
      categoryIds: byLabel(categories),
      methodIds: byLabel(methods),
      maintenanceTypeIds: byLabel(maintenanceTypes),
      documentTypeIds: byLabel(documentTypes),
    });

    await transaction(db, async () => {
      await repositories.vehicles.insertMany(seed.vehicles);
      await repositories.tenants.insertMany(seed.tenants);
      await repositories.rentals.insertMany(seed.rentals);
      await repositories.contracts.insertMany(seed.contracts);
      await repositories.payments.insertMany(seed.payments);
      await repositories.expenses.insertMany(seed.expenses);
      await repositories.maintenancePlans.insertMany(seed.maintenancePlans);
      await repositories.maintenanceRecords.insertMany(seed.maintenanceRecords);
      await repositories.mileageRecords.insertMany(seed.mileageRecords);
      await repositories.inspections.insertMany(seed.inspections);
      await repositories.damages.insertMany(seed.damages);
      await repositories.insurances.insertMany(seed.insurances);
      await repositories.tenantDocuments.insertMany(seed.tenantDocuments);
      await repositories.vehicleDocuments.insertMany(seed.vehicleDocuments);
    });

    await repositories.settings.patch({ seedVersion: DEMO_SEED_VERSION }, now);
    demoInstalled = true;
  }

  return { repositories, db, schemaVersion, demoInstalled };
}

/** Clés de `meta` utilisées par l'application. */
export const META_KEYS = {
  pinHash: 'security.pinHash',
  pinSalt: 'security.pinSalt',
  vaultSalt: 'security.vaultSalt',
  lastBackupAt: 'backup.lastAt',
  lastRestoreAt: 'backup.lastRestoreAt',
  installedAt: 'app.installedAt',
} as const;

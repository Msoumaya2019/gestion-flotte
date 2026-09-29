/**
 * Schéma de la base locale, versionné.
 *
 * Principes tenus par le schéma :
 *
 * - **Tout est rattaché à un véhicule**, directement (`vehicleId`) ou par la location.
 * - **Rien n'est supprimé** : `archivedAt` sort une ligne des listes sans la détruire. Les
 *   clés étrangères sont en `RESTRICT`, ce qui rend la suppression accidentelle impossible
 *   même par erreur de code.
 * - **L'argent est un entier** (`INTEGER`, en centimes) et les dates des chaînes
 *   « AAAA-MM-JJ » : comparables directement en SQL, sans conversion de fuseau.
 * - Les listes (photos, identifiants de documents) sont stockées en JSON dans une colonne
 *   texte : elles ne sont jamais interrogées individuellement, seulement relues entières.
 *
 * La version est portée par `PRAGMA user_version`, qui est transactionnel : une migration
 * interrompue laisse la base sur la version précédente, jamais à moitié migrée.
 */

import type { SqlDatabase } from './sql';

export interface Migration {
  version: number;
  name: string;
  statements: readonly string[];
}

const TIMESTAMPS = `
  id TEXT PRIMARY KEY NOT NULL,
  createdAt TEXT NOT NULL,
  updatedAt TEXT NOT NULL,
  archivedAt TEXT
`;

/** Colonnes communes à toutes les tables métier, réutilisées pour rester homogène. */
const SCHEMA_V1: readonly string[] = [
  `CREATE TABLE vehicles (
    ${TIMESTAMPS},
    brand TEXT NOT NULL DEFAULT '',
    model TEXT NOT NULL DEFAULT '',
    trim TEXT NOT NULL DEFAULT '',
    year INTEGER,
    plate TEXT NOT NULL DEFAULT '',
    vin TEXT NOT NULL DEFAULT '',
    fuelType TEXT NOT NULL DEFAULT 'autre',
    status TEXT NOT NULL DEFAULT 'disponible',
    purchaseDate TEXT,
    purchasePriceCents INTEGER NOT NULL DEFAULT 0,
    purchaseFeesCents INTEGER NOT NULL DEFAULT 0,
    purchaseMileageKm INTEGER NOT NULL DEFAULT 0,
    currentMileageKm INTEGER NOT NULL DEFAULT 0,
    amortizationMonths INTEGER NOT NULL DEFAULT 60,
    amortizationMethod TEXT NOT NULL DEFAULT 'lineaire',
    photoFileId TEXT,
    notes TEXT NOT NULL DEFAULT ''
  )`,
  `CREATE INDEX idx_vehicles_status ON vehicles(status)`,
  `CREATE INDEX idx_vehicles_plate ON vehicles(plate)`,

  `CREATE TABLE tenants (
    ${TIMESTAMPS},
    firstName TEXT NOT NULL DEFAULT '',
    lastName TEXT NOT NULL DEFAULT '',
    birthDate TEXT,
    address TEXT NOT NULL DEFAULT '',
    phone TEXT NOT NULL DEFAULT '',
    email TEXT NOT NULL DEFAULT '',
    licenseNumber TEXT NOT NULL DEFAULT '',
    licenseDate TEXT,
    vtcNumber TEXT NOT NULL DEFAULT '',
    notes TEXT NOT NULL DEFAULT ''
  )`,
  `CREATE INDEX idx_tenants_name ON tenants(lastName, firstName)`,

  `CREATE TABLE rentals (
    ${TIMESTAMPS},
    vehicleId TEXT NOT NULL REFERENCES vehicles(id) ON DELETE RESTRICT,
    tenantId TEXT NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
    startDate TEXT NOT NULL,
    endDate TEXT,
    openEnded INTEGER NOT NULL DEFAULT 1,
    rentAmountCents INTEGER NOT NULL DEFAULT 0,
    frequency TEXT NOT NULL DEFAULT 'mensuel',
    intervalDays INTEGER,
    dueWeekday INTEGER,
    dueDayOfMonth INTEGER,
    depositCents INTEGER NOT NULL DEFAULT 0,
    startMileageKm INTEGER NOT NULL DEFAULT 0,
    endMileageKm INTEGER,
    allowedKm INTEGER,
    excessKmPriceCents INTEGER NOT NULL DEFAULT 0,
    feesCents INTEGER NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'prevue',
    activatedAt TEXT,
    endedAt TEXT,
    depositOutcome TEXT,
    depositReturnedCents INTEGER NOT NULL DEFAULT 0,
    notes TEXT NOT NULL DEFAULT ''
  )`,
  `CREATE INDEX idx_rentals_vehicle ON rentals(vehicleId)`,
  `CREATE INDEX idx_rentals_tenant ON rentals(tenantId)`,
  `CREATE INDEX idx_rentals_status ON rentals(status)`,
  `CREATE INDEX idx_rentals_start ON rentals(startDate)`,

  `CREATE TABLE contracts (
    ${TIMESTAMPS},
    rentalId TEXT NOT NULL REFERENCES rentals(id) ON DELETE RESTRICT,
    reference TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'brouillon',
    generatedAt TEXT,
    ownerSnapshot TEXT NOT NULL DEFAULT '{}',
    tenantSnapshot TEXT NOT NULL DEFAULT '{}',
    vehicleSnapshot TEXT NOT NULL DEFAULT '{}',
    rentalSnapshot TEXT NOT NULL DEFAULT '{}',
    clausesSnapshot TEXT NOT NULL DEFAULT '[]',
    documentIds TEXT NOT NULL DEFAULT '[]',
    ownerSignature TEXT,
    tenantSignature TEXT,
    signedAt TEXT,
    pdfFileId TEXT
  )`,
  `CREATE INDEX idx_contracts_rental ON contracts(rentalId)`,
  `CREATE INDEX idx_contracts_reference ON contracts(reference)`,

  `CREATE TABLE payments (
    ${TIMESTAMPS},
    rentalId TEXT NOT NULL REFERENCES rentals(id) ON DELETE RESTRICT,
    vehicleId TEXT NOT NULL REFERENCES vehicles(id) ON DELETE RESTRICT,
    tenantId TEXT NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
    dueDate TEXT NOT NULL,
    expectedCents INTEGER NOT NULL DEFAULT 0,
    receivedCents INTEGER NOT NULL DEFAULT 0,
    paidDate TEXT,
    methodId TEXT,
    payerType TEXT NOT NULL DEFAULT 'locataire',
    payerName TEXT NOT NULL DEFAULT '',
    comment TEXT NOT NULL DEFAULT '',
    proofFileId TEXT,
    status TEXT NOT NULL DEFAULT 'a_venir'
  )`,
  `CREATE INDEX idx_payments_rental ON payments(rentalId)`,
  `CREATE INDEX idx_payments_vehicle ON payments(vehicleId)`,
  `CREATE INDEX idx_payments_due ON payments(dueDate)`,
  `CREATE INDEX idx_payments_status ON payments(status)`,

  `CREATE TABLE expense_categories (
    ${TIMESTAMPS},
    label TEXT NOT NULL,
    icon TEXT NOT NULL DEFAULT 'tag',
    isDefault INTEGER NOT NULL DEFAULT 0
  )`,

  `CREATE TABLE payment_methods (
    ${TIMESTAMPS},
    label TEXT NOT NULL,
    isDefault INTEGER NOT NULL DEFAULT 0
  )`,

  `CREATE TABLE expenses (
    ${TIMESTAMPS},
    vehicleId TEXT NOT NULL REFERENCES vehicles(id) ON DELETE RESTRICT,
    rentalId TEXT REFERENCES rentals(id) ON DELETE RESTRICT,
    date TEXT NOT NULL,
    amountCents INTEGER NOT NULL DEFAULT 0,
    categoryId TEXT NOT NULL,
    mileageKm INTEGER,
    supplier TEXT NOT NULL DEFAULT '',
    comment TEXT NOT NULL DEFAULT '',
    invoiceFileId TEXT,
    photoFileId TEXT,
    maintenanceRecordId TEXT,
    damageId TEXT
  )`,
  `CREATE INDEX idx_expenses_vehicle ON expenses(vehicleId)`,
  `CREATE INDEX idx_expenses_date ON expenses(date)`,
  `CREATE INDEX idx_expenses_category ON expenses(categoryId)`,

  `CREATE TABLE maintenance_types (
    ${TIMESTAMPS},
    label TEXT NOT NULL,
    intervalMode TEXT NOT NULL DEFAULT 'kilometrage',
    intervalKm INTEGER,
    intervalMonths INTEGER,
    isDefault INTEGER NOT NULL DEFAULT 0
  )`,

  `CREATE TABLE maintenance_plans (
    ${TIMESTAMPS},
    vehicleId TEXT NOT NULL REFERENCES vehicles(id) ON DELETE RESTRICT,
    typeId TEXT NOT NULL REFERENCES maintenance_types(id) ON DELETE RESTRICT,
    intervalMode TEXT NOT NULL DEFAULT 'kilometrage',
    intervalKm INTEGER,
    intervalMonths INTEGER,
    lastKm INTEGER,
    lastDate TEXT,
    active INTEGER NOT NULL DEFAULT 1,
    notes TEXT NOT NULL DEFAULT ''
  )`,
  `CREATE INDEX idx_plans_vehicle ON maintenance_plans(vehicleId)`,
  `CREATE UNIQUE INDEX idx_plans_unique ON maintenance_plans(vehicleId, typeId)`,

  `CREATE TABLE maintenance_records (
    ${TIMESTAMPS},
    vehicleId TEXT NOT NULL REFERENCES vehicles(id) ON DELETE RESTRICT,
    planId TEXT REFERENCES maintenance_plans(id) ON DELETE SET NULL,
    typeId TEXT NOT NULL REFERENCES maintenance_types(id) ON DELETE RESTRICT,
    date TEXT NOT NULL,
    mileageKm INTEGER NOT NULL DEFAULT 0,
    amountCents INTEGER NOT NULL DEFAULT 0,
    supplier TEXT NOT NULL DEFAULT '',
    comment TEXT NOT NULL DEFAULT '',
    partsChanged TEXT NOT NULL DEFAULT '',
    invoiceFileId TEXT,
    photoFileId TEXT
  )`,
  `CREATE INDEX idx_records_vehicle ON maintenance_records(vehicleId)`,
  `CREATE INDEX idx_records_date ON maintenance_records(date)`,
  `CREATE INDEX idx_records_plan ON maintenance_records(planId)`,

  `CREATE TABLE mileage_records (
    ${TIMESTAMPS},
    vehicleId TEXT NOT NULL REFERENCES vehicles(id) ON DELETE RESTRICT,
    date TEXT NOT NULL,
    km INTEGER NOT NULL DEFAULT 0,
    source TEXT NOT NULL DEFAULT 'manuel',
    rentalId TEXT REFERENCES rentals(id) ON DELETE SET NULL,
    comment TEXT NOT NULL DEFAULT ''
  )`,
  `CREATE INDEX idx_mileage_vehicle ON mileage_records(vehicleId)`,
  `CREATE INDEX idx_mileage_date ON mileage_records(vehicleId, date)`,

  `CREATE TABLE inspections (
    ${TIMESTAMPS},
    rentalId TEXT NOT NULL REFERENCES rentals(id) ON DELETE RESTRICT,
    vehicleId TEXT NOT NULL REFERENCES vehicles(id) ON DELETE RESTRICT,
    kind TEXT NOT NULL DEFAULT 'depart',
    date TEXT NOT NULL,
    mileageKm INTEGER NOT NULL DEFAULT 0,
    fuelEighths INTEGER NOT NULL DEFAULT 8,
    interiorState TEXT NOT NULL DEFAULT '',
    exteriorState TEXT NOT NULL DEFAULT '',
    observations TEXT NOT NULL DEFAULT '',
    photos TEXT NOT NULL DEFAULT '[]',
    tenantSignature TEXT
  )`,
  `CREATE INDEX idx_inspections_rental ON inspections(rentalId)`,
  `CREATE INDEX idx_inspections_vehicle ON inspections(vehicleId)`,

  `CREATE TABLE damages (
    ${TIMESTAMPS},
    vehicleId TEXT NOT NULL REFERENCES vehicles(id) ON DELETE RESTRICT,
    rentalId TEXT REFERENCES rentals(id) ON DELETE SET NULL,
    inspectionId TEXT REFERENCES inspections(id) ON DELETE SET NULL,
    origin TEXT NOT NULL DEFAULT 'incident',
    type TEXT NOT NULL DEFAULT 'autre',
    zone TEXT NOT NULL DEFAULT '',
    date TEXT NOT NULL,
    comment TEXT NOT NULL DEFAULT '',
    estimatedCostCents INTEGER NOT NULL DEFAULT 0,
    actualCostCents INTEGER NOT NULL DEFAULT 0,
    photoFileId TEXT,
    repaired INTEGER NOT NULL DEFAULT 0
  )`,
  `CREATE INDEX idx_damages_vehicle ON damages(vehicleId)`,
  `CREATE INDEX idx_damages_inspection ON damages(inspectionId)`,

  `CREATE TABLE insurances (
    ${TIMESTAMPS},
    vehicleId TEXT NOT NULL REFERENCES vehicles(id) ON DELETE RESTRICT,
    company TEXT NOT NULL DEFAULT '',
    contractNumber TEXT NOT NULL DEFAULT '',
    amountCents INTEGER NOT NULL DEFAULT 0,
    frequency TEXT NOT NULL DEFAULT 'mensuel',
    startDate TEXT,
    endDate TEXT,
    documentFileId TEXT,
    notes TEXT NOT NULL DEFAULT ''
  )`,
  `CREATE INDEX idx_insurances_vehicle ON insurances(vehicleId)`,
  `CREATE INDEX idx_insurances_end ON insurances(endDate)`,

  `CREATE TABLE document_types (
    ${TIMESTAMPS},
    label TEXT NOT NULL,
    scope TEXT NOT NULL DEFAULT 'locataire',
    hasExpiry INTEGER NOT NULL DEFAULT 1,
    isDefault INTEGER NOT NULL DEFAULT 0,
    requiredByDefault INTEGER NOT NULL DEFAULT 0
  )`,

  `CREATE TABLE tenant_documents (
    ${TIMESTAMPS},
    tenantId TEXT NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
    typeId TEXT NOT NULL REFERENCES document_types(id) ON DELETE RESTRICT,
    number TEXT NOT NULL DEFAULT '',
    issueDate TEXT,
    expiryDate TEXT,
    comment TEXT NOT NULL DEFAULT '',
    fileId TEXT,
    mimeType TEXT NOT NULL DEFAULT '',
    fileName TEXT NOT NULL DEFAULT '',
    sizeBytes INTEGER NOT NULL DEFAULT 0
  )`,
  `CREATE INDEX idx_tenant_docs_tenant ON tenant_documents(tenantId)`,
  `CREATE INDEX idx_tenant_docs_type ON tenant_documents(typeId)`,
  `CREATE INDEX idx_tenant_docs_expiry ON tenant_documents(expiryDate)`,

  `CREATE TABLE vehicle_documents (
    ${TIMESTAMPS},
    vehicleId TEXT NOT NULL REFERENCES vehicles(id) ON DELETE RESTRICT,
    typeId TEXT NOT NULL REFERENCES document_types(id) ON DELETE RESTRICT,
    number TEXT NOT NULL DEFAULT '',
    issueDate TEXT,
    expiryDate TEXT,
    comment TEXT NOT NULL DEFAULT '',
    fileId TEXT,
    mimeType TEXT NOT NULL DEFAULT '',
    fileName TEXT NOT NULL DEFAULT '',
    sizeBytes INTEGER NOT NULL DEFAULT 0
  )`,
  `CREATE INDEX idx_vehicle_docs_vehicle ON vehicle_documents(vehicleId)`,
  `CREATE INDEX idx_vehicle_docs_expiry ON vehicle_documents(expiryDate)`,

  `CREATE TABLE clauses (
    ${TIMESTAMPS},
    title TEXT NOT NULL DEFAULT '',
    body TEXT NOT NULL DEFAULT '',
    enabled INTEGER NOT NULL DEFAULT 1,
    position INTEGER NOT NULL DEFAULT 0,
    isDefault INTEGER NOT NULL DEFAULT 0
  )`,

  `CREATE TABLE notifications (
    ${TIMESTAMPS},
    kind TEXT NOT NULL,
    title TEXT NOT NULL DEFAULT '',
    body TEXT NOT NULL DEFAULT '',
    systemId TEXT,
    fireDate TEXT NOT NULL,
    relatedType TEXT NOT NULL DEFAULT '',
    relatedId TEXT,
    enabled INTEGER NOT NULL DEFAULT 1
  )`,
  `CREATE INDEX idx_notifications_fire ON notifications(fireDate)`,
  `CREATE INDEX idx_notifications_related ON notifications(relatedType, relatedId)`,

  `CREATE TABLE files (
    ${TIMESTAMPS},
    kind TEXT NOT NULL,
    fileName TEXT NOT NULL DEFAULT '',
    mimeType TEXT NOT NULL DEFAULT '',
    sizeBytes INTEGER NOT NULL DEFAULT 0,
    relativePath TEXT NOT NULL,
    encrypted INTEGER NOT NULL DEFAULT 1,
    sha256 TEXT,
    notes TEXT NOT NULL DEFAULT ''
  )`,
  `CREATE INDEX idx_files_kind ON files(kind)`,

  `CREATE TABLE settings (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    payload TEXT NOT NULL,
    updatedAt TEXT NOT NULL
  )`,

  `CREATE TABLE meta (
    key TEXT PRIMARY KEY NOT NULL,
    value TEXT NOT NULL
  )`,
];

export const MIGRATIONS: readonly Migration[] = [
  { version: 1, name: 'schema-initial', statements: SCHEMA_V1 },
];

export const LATEST_VERSION = MIGRATIONS.reduce((max, migration) => Math.max(max, migration.version), 0);

/** Version courante du schéma, lue depuis la base. */
export async function currentVersion(db: SqlDatabase): Promise<number> {
  const row = await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version');
  return row?.user_version ?? 0;
}

/**
 * Applique les migrations manquantes, chacune dans sa transaction.
 * Rend la version atteinte. Une migration en échec annule **sa** transaction et laisse la
 * base sur la version précédente : aucune migration à moitié appliquée.
 */
export async function runMigrations(
  db: SqlDatabase,
  migrations: readonly Migration[] = MIGRATIONS,
): Promise<number> {
  await db.execAsync('PRAGMA foreign_keys = ON;');
  const from = await currentVersion(db);
  let applied = from;

  const ordered = [...migrations].sort((a, b) => a.version - b.version);
  for (const migration of ordered) {
    if (migration.version <= from) continue;
    await db.execAsync('BEGIN;');
    try {
      for (const statement of migration.statements) {
        await db.execAsync(statement);
      }
      // `PRAGMA user_version` accepte une valeur littérale, pas un paramètre lié.
      await db.execAsync(`PRAGMA user_version = ${migration.version};`);
      await db.execAsync('COMMIT;');
    } catch (error) {
      await db.execAsync('ROLLBACK;');
      throw new Error(
        `Migration ${migration.version} « ${migration.name} » annulée : ${error instanceof Error ? error.message : String(error)}`,
      );
    }
    applied = migration.version;
  }

  return applied;
}

/** Tables créées par le schéma, dans l'ordre de déclaration. Utile aux contrôles. */
export const TABLES = [
  'vehicles',
  'tenants',
  'rentals',
  'contracts',
  'payments',
  'expense_categories',
  'payment_methods',
  'expenses',
  'maintenance_types',
  'maintenance_plans',
  'maintenance_records',
  'mileage_records',
  'inspections',
  'damages',
  'insurances',
  'document_types',
  'tenant_documents',
  'vehicle_documents',
  'clauses',
  'notifications',
  'files',
  'settings',
  'meta',
] as const;

export type TableName = (typeof TABLES)[number];

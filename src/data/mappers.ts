/**
 * Correspondance entre les lignes SQL et les entités du domaine.
 *
 * Les colonnes portent exactement les noms des champs : la correspondance est donc
 * mécanique, et une colonne renommée dans le schéma se voit tout de suite ici. Les seules
 * conversions sont celles qui ne peuvent pas être implicites :
 *
 * - booléens ⇄ `0` / `1` ;
 * - listes ⇄ JSON dans une colonne texte ;
 * - `null` conservé partout où l'absence a un sens (pas de date de fin, pas de kilométrage
 *   autorisé) — confondre `0` et « non renseigné » changerait un résultat financier.
 */

import type {
  Clause,
  Contract,
  Damage,
  DocumentType,
  Entity,
  Expense,
  ExpenseCategory,
  Inspection,
  InspectionPhoto,
  Insurance,
  MaintenanceIntervalMode,
  MaintenancePlan,
  MaintenanceRecord,
  MaintenanceType,
  MileageRecord,
  Payment,
  PaymentMethod,
  Rental,
  ScheduledNotification,
  Tenant,
  TenantDocument,
  Vehicle,
  VehicleDocument,
} from '@/domain/types';
import {
  fromInt,
  integer,
  jsonArray,
  nullableInt,
  nullableText,
  text,
  toInt,
  type Row,
  type SqlValue,
} from './sql';

/** Colonnes présentes sur toutes les tables métier. */
function entityRow(entity: Entity): Record<string, SqlValue> {
  return {
    id: entity.id,
    createdAt: entity.createdAt,
    updatedAt: entity.updatedAt,
    archivedAt: entity.archivedAt,
  };
}

function entityFrom(row: Row): Entity {
  return {
    id: text(row.id),
    createdAt: text(row.createdAt),
    updatedAt: text(row.updatedAt),
    archivedAt: nullableText(row.archivedAt),
  };
}

// ---------------------------------------------------------------------------
// Véhicules
// ---------------------------------------------------------------------------

export function vehicleToRow(vehicle: Vehicle): Record<string, SqlValue> {
  return {
    ...entityRow(vehicle),
    brand: vehicle.brand,
    model: vehicle.model,
    trim: vehicle.trim,
    year: nullableInt(vehicle.year),
    plate: vehicle.plate,
    vin: vehicle.vin,
    fuelType: vehicle.fuelType,
    status: vehicle.status,
    purchaseDate: vehicle.purchaseDate,
    purchasePriceCents: vehicle.purchasePriceCents,
    purchaseFeesCents: vehicle.purchaseFeesCents,
    purchaseMileageKm: vehicle.purchaseMileageKm,
    currentMileageKm: vehicle.currentMileageKm,
    amortizationMonths: vehicle.amortizationMonths,
    amortizationMethod: vehicle.amortizationMethod,
    photoFileId: vehicle.photoFileId,
    notes: vehicle.notes,
  };
}

export function vehicleFromRow(row: Row): Vehicle {
  return {
    ...entityFrom(row),
    brand: text(row.brand),
    model: text(row.model),
    trim: text(row.trim),
    year: nullableInt(row.year),
    plate: text(row.plate),
    vin: text(row.vin),
    fuelType: text(row.fuelType) as Vehicle['fuelType'],
    status: text(row.status) as Vehicle['status'],
    purchaseDate: nullableText(row.purchaseDate),
    purchasePriceCents: integer(row.purchasePriceCents),
    purchaseFeesCents: integer(row.purchaseFeesCents),
    purchaseMileageKm: integer(row.purchaseMileageKm),
    currentMileageKm: integer(row.currentMileageKm),
    amortizationMonths: integer(row.amortizationMonths),
    amortizationMethod: text(row.amortizationMethod) as Vehicle['amortizationMethod'],
    photoFileId: nullableText(row.photoFileId),
    notes: text(row.notes),
  };
}

// ---------------------------------------------------------------------------
// Locataires
// ---------------------------------------------------------------------------

export function tenantToRow(tenant: Tenant): Record<string, SqlValue> {
  return {
    ...entityRow(tenant),
    firstName: tenant.firstName,
    lastName: tenant.lastName,
    birthDate: tenant.birthDate,
    address: tenant.address,
    phone: tenant.phone,
    email: tenant.email,
    licenseNumber: tenant.licenseNumber,
    licenseDate: tenant.licenseDate,
    vtcNumber: tenant.vtcNumber,
    notes: tenant.notes,
  };
}

export function tenantFromRow(row: Row): Tenant {
  return {
    ...entityFrom(row),
    firstName: text(row.firstName),
    lastName: text(row.lastName),
    birthDate: nullableText(row.birthDate),
    address: text(row.address),
    phone: text(row.phone),
    email: text(row.email),
    licenseNumber: text(row.licenseNumber),
    licenseDate: nullableText(row.licenseDate),
    vtcNumber: text(row.vtcNumber),
    notes: text(row.notes),
  };
}

// ---------------------------------------------------------------------------
// Locations
// ---------------------------------------------------------------------------

export function rentalToRow(rental: Rental): Record<string, SqlValue> {
  return {
    ...entityRow(rental),
    vehicleId: rental.vehicleId,
    tenantId: rental.tenantId,
    startDate: rental.startDate,
    endDate: rental.endDate,
    openEnded: toInt(rental.openEnded),
    rentAmountCents: rental.rentAmountCents,
    frequency: rental.frequency,
    intervalDays: rental.intervalDays,
    dueWeekday: rental.dueWeekday,
    dueDayOfMonth: rental.dueDayOfMonth,
    depositCents: rental.depositCents,
    startMileageKm: rental.startMileageKm,
    endMileageKm: rental.endMileageKm,
    allowedKm: rental.allowedKm,
    excessKmPriceCents: rental.excessKmPriceCents,
    feesCents: rental.feesCents,
    status: rental.status,
    activatedAt: rental.activatedAt,
    endedAt: rental.endedAt,
    depositOutcome: rental.depositOutcome,
    depositReturnedCents: rental.depositReturnedCents,
    notes: rental.notes,
  };
}

export function rentalFromRow(row: Row): Rental {
  return {
    ...entityFrom(row),
    vehicleId: text(row.vehicleId),
    tenantId: text(row.tenantId),
    startDate: text(row.startDate),
    endDate: nullableText(row.endDate),
    openEnded: fromInt(row.openEnded),
    rentAmountCents: integer(row.rentAmountCents),
    frequency: text(row.frequency) as Rental['frequency'],
    intervalDays: nullableInt(row.intervalDays),
    dueWeekday: nullableInt(row.dueWeekday),
    dueDayOfMonth: nullableInt(row.dueDayOfMonth),
    depositCents: integer(row.depositCents),
    startMileageKm: integer(row.startMileageKm),
    endMileageKm: nullableInt(row.endMileageKm),
    allowedKm: nullableInt(row.allowedKm),
    excessKmPriceCents: integer(row.excessKmPriceCents),
    feesCents: integer(row.feesCents),
    status: text(row.status) as Rental['status'],
    activatedAt: nullableText(row.activatedAt),
    endedAt: nullableText(row.endedAt),
    depositOutcome: nullableText(row.depositOutcome) as Rental['depositOutcome'],
    depositReturnedCents: integer(row.depositReturnedCents),
    notes: text(row.notes),
  };
}

// ---------------------------------------------------------------------------
// Contrats
// ---------------------------------------------------------------------------

export function contractToRow(contract: Contract): Record<string, SqlValue> {
  return {
    ...entityRow(contract),
    rentalId: contract.rentalId,
    reference: contract.reference,
    status: contract.status,
    generatedAt: contract.generatedAt,
    ownerSnapshot: contract.ownerSnapshot,
    tenantSnapshot: contract.tenantSnapshot,
    vehicleSnapshot: contract.vehicleSnapshot,
    rentalSnapshot: contract.rentalSnapshot,
    clausesSnapshot: contract.clausesSnapshot,
    documentIds: JSON.stringify(contract.documentIds),
    ownerSignature: contract.ownerSignature,
    tenantSignature: contract.tenantSignature,
    signedAt: contract.signedAt,
    pdfFileId: contract.pdfFileId,
  };
}

export function contractFromRow(row: Row): Contract {
  return {
    ...entityFrom(row),
    rentalId: text(row.rentalId),
    reference: text(row.reference),
    status: text(row.status) as Contract['status'],
    generatedAt: nullableText(row.generatedAt),
    ownerSnapshot: text(row.ownerSnapshot),
    tenantSnapshot: text(row.tenantSnapshot),
    vehicleSnapshot: text(row.vehicleSnapshot),
    rentalSnapshot: text(row.rentalSnapshot),
    clausesSnapshot: text(row.clausesSnapshot),
    documentIds: jsonArray<string>(row.documentIds),
    ownerSignature: nullableText(row.ownerSignature),
    tenantSignature: nullableText(row.tenantSignature),
    signedAt: nullableText(row.signedAt),
    pdfFileId: nullableText(row.pdfFileId),
  };
}

// ---------------------------------------------------------------------------
// Paiements
// ---------------------------------------------------------------------------

export function paymentToRow(payment: Payment): Record<string, SqlValue> {
  return {
    ...entityRow(payment),
    rentalId: payment.rentalId,
    vehicleId: payment.vehicleId,
    tenantId: payment.tenantId,
    dueDate: payment.dueDate,
    expectedCents: payment.expectedCents,
    receivedCents: payment.receivedCents,
    paidDate: payment.paidDate,
    methodId: payment.methodId,
    payerType: payment.payerType,
    payerName: payment.payerName,
    comment: payment.comment,
    proofFileId: payment.proofFileId,
    status: payment.status,
  };
}

export function paymentFromRow(row: Row): Payment {
  return {
    ...entityFrom(row),
    rentalId: text(row.rentalId),
    vehicleId: text(row.vehicleId),
    tenantId: text(row.tenantId),
    dueDate: text(row.dueDate),
    expectedCents: integer(row.expectedCents),
    receivedCents: integer(row.receivedCents),
    paidDate: nullableText(row.paidDate),
    methodId: nullableText(row.methodId),
    payerType: text(row.payerType) as Payment['payerType'],
    payerName: text(row.payerName),
    comment: text(row.comment),
    proofFileId: nullableText(row.proofFileId),
    status: text(row.status) as Payment['status'],
  };
}

// ---------------------------------------------------------------------------
// Dépenses
// ---------------------------------------------------------------------------

export function expenseToRow(expense: Expense): Record<string, SqlValue> {
  return {
    ...entityRow(expense),
    vehicleId: expense.vehicleId,
    rentalId: expense.rentalId,
    date: expense.date,
    amountCents: expense.amountCents,
    categoryId: expense.categoryId,
    mileageKm: expense.mileageKm,
    supplier: expense.supplier,
    comment: expense.comment,
    invoiceFileId: expense.invoiceFileId,
    photoFileId: expense.photoFileId,
    maintenanceRecordId: expense.maintenanceRecordId,
    damageId: expense.damageId,
  };
}

export function expenseFromRow(row: Row): Expense {
  return {
    ...entityFrom(row),
    vehicleId: text(row.vehicleId),
    rentalId: nullableText(row.rentalId),
    date: text(row.date),
    amountCents: integer(row.amountCents),
    categoryId: text(row.categoryId),
    mileageKm: nullableInt(row.mileageKm),
    supplier: text(row.supplier),
    comment: text(row.comment),
    invoiceFileId: nullableText(row.invoiceFileId),
    photoFileId: nullableText(row.photoFileId),
    maintenanceRecordId: nullableText(row.maintenanceRecordId),
    damageId: nullableText(row.damageId),
  };
}

export function categoryToRow(category: ExpenseCategory): Record<string, SqlValue> {
  return {
    ...entityRow(category),
    label: category.label,
    icon: category.icon,
    isDefault: toInt(category.isDefault),
  };
}

export function categoryFromRow(row: Row): ExpenseCategory {
  return {
    ...entityFrom(row),
    label: text(row.label),
    icon: text(row.icon),
    isDefault: fromInt(row.isDefault),
  };
}

export function methodToRow(method: PaymentMethod): Record<string, SqlValue> {
  return { ...entityRow(method), label: method.label, isDefault: toInt(method.isDefault) };
}

export function methodFromRow(row: Row): PaymentMethod {
  return { ...entityFrom(row), label: text(row.label), isDefault: fromInt(row.isDefault) };
}

// ---------------------------------------------------------------------------
// Entretien
// ---------------------------------------------------------------------------

export function maintenanceTypeToRow(type: MaintenanceType): Record<string, SqlValue> {
  return {
    ...entityRow(type),
    label: type.label,
    intervalMode: type.intervalMode,
    intervalKm: type.intervalKm,
    intervalMonths: type.intervalMonths,
    isDefault: toInt(type.isDefault),
  };
}

export function maintenanceTypeFromRow(row: Row): MaintenanceType {
  return {
    ...entityFrom(row),
    label: text(row.label),
    intervalMode: text(row.intervalMode) as MaintenanceIntervalMode,
    intervalKm: nullableInt(row.intervalKm),
    intervalMonths: nullableInt(row.intervalMonths),
    isDefault: fromInt(row.isDefault),
  };
}

export function maintenancePlanToRow(plan: MaintenancePlan): Record<string, SqlValue> {
  return {
    ...entityRow(plan),
    vehicleId: plan.vehicleId,
    typeId: plan.typeId,
    intervalMode: plan.intervalMode,
    intervalKm: plan.intervalKm,
    intervalMonths: plan.intervalMonths,
    lastKm: plan.lastKm,
    lastDate: plan.lastDate,
    active: toInt(plan.active),
    notes: plan.notes,
  };
}

export function maintenancePlanFromRow(row: Row): MaintenancePlan {
  return {
    ...entityFrom(row),
    vehicleId: text(row.vehicleId),
    typeId: text(row.typeId),
    intervalMode: text(row.intervalMode) as MaintenancePlan['intervalMode'],
    intervalKm: nullableInt(row.intervalKm),
    intervalMonths: nullableInt(row.intervalMonths),
    lastKm: nullableInt(row.lastKm),
    lastDate: nullableText(row.lastDate),
    active: fromInt(row.active),
    notes: text(row.notes),
  };
}

export function maintenanceRecordToRow(record: MaintenanceRecord): Record<string, SqlValue> {
  return {
    ...entityRow(record),
    vehicleId: record.vehicleId,
    planId: record.planId,
    typeId: record.typeId,
    date: record.date,
    mileageKm: record.mileageKm,
    amountCents: record.amountCents,
    supplier: record.supplier,
    comment: record.comment,
    partsChanged: record.partsChanged,
    invoiceFileId: record.invoiceFileId,
    photoFileId: record.photoFileId,
  };
}

export function maintenanceRecordFromRow(row: Row): MaintenanceRecord {
  return {
    ...entityFrom(row),
    vehicleId: text(row.vehicleId),
    planId: nullableText(row.planId),
    typeId: text(row.typeId),
    date: text(row.date),
    mileageKm: integer(row.mileageKm),
    amountCents: integer(row.amountCents),
    supplier: text(row.supplier),
    comment: text(row.comment),
    partsChanged: text(row.partsChanged),
    invoiceFileId: nullableText(row.invoiceFileId),
    photoFileId: nullableText(row.photoFileId),
  };
}

export function mileageToRow(record: MileageRecord): Record<string, SqlValue> {
  return {
    ...entityRow(record),
    vehicleId: record.vehicleId,
    date: record.date,
    km: record.km,
    source: record.source,
    rentalId: record.rentalId,
    comment: record.comment,
  };
}

export function mileageFromRow(row: Row): MileageRecord {
  return {
    ...entityFrom(row),
    vehicleId: text(row.vehicleId),
    date: text(row.date),
    km: integer(row.km),
    source: text(row.source) as MileageRecord['source'],
    rentalId: nullableText(row.rentalId),
    comment: text(row.comment),
  };
}

// ---------------------------------------------------------------------------
// États des lieux, dommages, assurances
// ---------------------------------------------------------------------------

export function inspectionToRow(inspection: Inspection): Record<string, SqlValue> {
  return {
    ...entityRow(inspection),
    rentalId: inspection.rentalId,
    vehicleId: inspection.vehicleId,
    kind: inspection.kind,
    date: inspection.date,
    mileageKm: inspection.mileageKm,
    fuelEighths: inspection.fuelEighths,
    interiorState: inspection.interiorState,
    exteriorState: inspection.exteriorState,
    observations: inspection.observations,
    photos: JSON.stringify(inspection.photos),
    tenantSignature: inspection.tenantSignature,
  };
}

export function inspectionFromRow(row: Row): Inspection {
  return {
    ...entityFrom(row),
    rentalId: text(row.rentalId),
    vehicleId: text(row.vehicleId),
    kind: text(row.kind) as Inspection['kind'],
    date: text(row.date),
    mileageKm: integer(row.mileageKm),
    fuelEighths: integer(row.fuelEighths),
    interiorState: text(row.interiorState),
    exteriorState: text(row.exteriorState),
    observations: text(row.observations),
    photos: jsonArray<InspectionPhoto>(row.photos),
    tenantSignature: nullableText(row.tenantSignature),
  };
}

export function damageToRow(damage: Damage): Record<string, SqlValue> {
  return {
    ...entityRow(damage),
    vehicleId: damage.vehicleId,
    rentalId: damage.rentalId,
    inspectionId: damage.inspectionId,
    origin: damage.origin,
    type: damage.type,
    zone: damage.zone,
    date: damage.date,
    comment: damage.comment,
    estimatedCostCents: damage.estimatedCostCents,
    actualCostCents: damage.actualCostCents,
    photoFileId: damage.photoFileId,
    repaired: toInt(damage.repaired),
  };
}

export function damageFromRow(row: Row): Damage {
  return {
    ...entityFrom(row),
    vehicleId: text(row.vehicleId),
    rentalId: nullableText(row.rentalId),
    inspectionId: nullableText(row.inspectionId),
    origin: text(row.origin) as Damage['origin'],
    type: text(row.type) as Damage['type'],
    zone: text(row.zone),
    date: text(row.date),
    comment: text(row.comment),
    estimatedCostCents: integer(row.estimatedCostCents),
    actualCostCents: integer(row.actualCostCents),
    photoFileId: nullableText(row.photoFileId),
    repaired: fromInt(row.repaired),
  };
}

export function insuranceToRow(insurance: Insurance): Record<string, SqlValue> {
  return {
    ...entityRow(insurance),
    vehicleId: insurance.vehicleId,
    company: insurance.company,
    contractNumber: insurance.contractNumber,
    amountCents: insurance.amountCents,
    frequency: insurance.frequency,
    startDate: insurance.startDate,
    endDate: insurance.endDate,
    documentFileId: insurance.documentFileId,
    notes: insurance.notes,
  };
}

export function insuranceFromRow(row: Row): Insurance {
  return {
    ...entityFrom(row),
    vehicleId: text(row.vehicleId),
    company: text(row.company),
    contractNumber: text(row.contractNumber),
    amountCents: integer(row.amountCents),
    frequency: text(row.frequency) as Insurance['frequency'],
    startDate: nullableText(row.startDate),
    endDate: nullableText(row.endDate),
    documentFileId: nullableText(row.documentFileId),
    notes: text(row.notes),
  };
}

// ---------------------------------------------------------------------------
// Documents
// ---------------------------------------------------------------------------

export function documentTypeToRow(type: DocumentType): Record<string, SqlValue> {
  return {
    ...entityRow(type),
    label: type.label,
    scope: type.scope,
    hasExpiry: toInt(type.hasExpiry),
    isDefault: toInt(type.isDefault),
    requiredByDefault: toInt(type.requiredByDefault),
  };
}

export function documentTypeFromRow(row: Row): DocumentType {
  return {
    ...entityFrom(row),
    label: text(row.label),
    scope: text(row.scope) as DocumentType['scope'],
    hasExpiry: fromInt(row.hasExpiry),
    isDefault: fromInt(row.isDefault),
    requiredByDefault: fromInt(row.requiredByDefault),
  };
}

export function tenantDocumentToRow(document: TenantDocument): Record<string, SqlValue> {
  return {
    ...entityRow(document),
    tenantId: document.tenantId,
    typeId: document.typeId,
    number: document.number,
    issueDate: document.issueDate,
    expiryDate: document.expiryDate,
    comment: document.comment,
    fileId: document.fileId,
    mimeType: document.mimeType,
    fileName: document.fileName,
    sizeBytes: document.sizeBytes,
  };
}

export function tenantDocumentFromRow(row: Row): TenantDocument {
  return {
    ...entityFrom(row),
    tenantId: text(row.tenantId),
    typeId: text(row.typeId),
    number: text(row.number),
    issueDate: nullableText(row.issueDate),
    expiryDate: nullableText(row.expiryDate),
    comment: text(row.comment),
    fileId: nullableText(row.fileId),
    mimeType: text(row.mimeType),
    fileName: text(row.fileName),
    sizeBytes: integer(row.sizeBytes),
  };
}

export function vehicleDocumentToRow(document: VehicleDocument): Record<string, SqlValue> {
  return {
    ...entityRow(document),
    vehicleId: document.vehicleId,
    typeId: document.typeId,
    number: document.number,
    issueDate: document.issueDate,
    expiryDate: document.expiryDate,
    comment: document.comment,
    fileId: document.fileId,
    mimeType: document.mimeType,
    fileName: document.fileName,
    sizeBytes: document.sizeBytes,
  };
}

export function vehicleDocumentFromRow(row: Row): VehicleDocument {
  return {
    ...entityFrom(row),
    vehicleId: text(row.vehicleId),
    typeId: text(row.typeId),
    number: text(row.number),
    issueDate: nullableText(row.issueDate),
    expiryDate: nullableText(row.expiryDate),
    comment: text(row.comment),
    fileId: nullableText(row.fileId),
    mimeType: text(row.mimeType),
    fileName: text(row.fileName),
    sizeBytes: integer(row.sizeBytes),
  };
}

// ---------------------------------------------------------------------------
// Clauses, notifications, fichiers
// ---------------------------------------------------------------------------

export function clauseToRow(clause: Clause): Record<string, SqlValue> {
  return {
    ...entityRow(clause),
    title: clause.title,
    body: clause.body,
    enabled: toInt(clause.enabled),
    position: clause.position,
    isDefault: toInt(clause.isDefault),
  };
}

export function clauseFromRow(row: Row): Clause {
  return {
    ...entityFrom(row),
    title: text(row.title),
    body: text(row.body),
    enabled: fromInt(row.enabled),
    position: integer(row.position),
    isDefault: fromInt(row.isDefault),
  };
}

export function notificationToRow(notification: ScheduledNotification): Record<string, SqlValue> {
  return {
    ...entityRow(notification),
    kind: notification.kind,
    title: notification.title,
    body: notification.body,
    systemId: notification.systemId,
    fireDate: notification.fireDate,
    relatedType: notification.relatedType,
    relatedId: notification.relatedId,
    enabled: toInt(notification.enabled),
  };
}

export function notificationFromRow(row: Row): ScheduledNotification {
  return {
    ...entityFrom(row),
    kind: text(row.kind) as ScheduledNotification['kind'],
    title: text(row.title),
    body: text(row.body),
    systemId: nullableText(row.systemId),
    fireDate: text(row.fireDate),
    relatedType: text(row.relatedType),
    relatedId: nullableText(row.relatedId),
    enabled: fromInt(row.enabled),
  };
}

export interface StoredFile {
  id: string;
  createdAt: string;
  updatedAt: string;
  archivedAt: string | null;
  kind: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  /** Chemin **relatif** au dossier privé de l'application. Jamais une URL publique. */
  relativePath: string;
  encrypted: boolean;
  sha256: string | null;
  notes: string;
}

export function fileToRow(file: StoredFile): Record<string, SqlValue> {
  return {
    ...entityRow(file),
    kind: file.kind,
    fileName: file.fileName,
    mimeType: file.mimeType,
    sizeBytes: file.sizeBytes,
    relativePath: file.relativePath,
    encrypted: toInt(file.encrypted),
    sha256: file.sha256,
    notes: file.notes,
  };
}

export function fileFromRow(row: Row): StoredFile {
  return {
    ...entityFrom(row),
    kind: text(row.kind),
    fileName: text(row.fileName),
    mimeType: text(row.mimeType),
    sizeBytes: integer(row.sizeBytes),
    relativePath: text(row.relativePath),
    encrypted: fromInt(row.encrypted),
    sha256: nullableText(row.sha256),
    notes: text(row.notes),
  };
}

/**
 * Modèles du domaine — gestion de flotte en location.
 *
 * Conventions tenues dans tout le projet :
 * - `Cents` : montant en centimes, **entier**. Aucun flottant ne porte d'argent.
 * - `IsoDate` : « AAAA-MM-JJ », sans heure ni fuseau. Les dates métier sont des jours,
 *   pas des instants : les comparer comme des chaînes suffit et évite tout décalage.
 * - `IsoDateTime` : horodatage ISO 8601 complet, en UTC (création, signature, envoi).
 * - La suppression d'une donnée importante est un **archivage** (`archivedAt`).
 *   Seuls les fichiers locaux sont réellement supprimés.
 * - Toutes les entités sont rattachées à un véhicule, directement ou par une location.
 */

export type Id = string;
/** « AAAA-MM-JJ » */
export type IsoDate = string;
/** ISO 8601 complet, UTC */
export type IsoDateTime = string;
/** Montant en centimes, entier */
export type Cents = number;
/** Kilométrage, entier */
export type Km = number;

export const VEHICLE_STATUSES = [
  'disponible',
  'loue',
  'entretien',
  'reparation',
  'indisponible',
  'vendu',
] as const;
export type VehicleStatus = (typeof VEHICLE_STATUSES)[number];

export const FUEL_TYPES = [
  'essence',
  'diesel',
  'hybride',
  'hybride_rechargeable',
  'electrique',
  'gpl',
  'autre',
] as const;
export type FuelType = (typeof FUEL_TYPES)[number];

export const PAYMENT_FREQUENCIES = ['hebdomadaire', 'bimensuel', 'mensuel', 'personnalisee'] as const;
export type PaymentFrequency = (typeof PAYMENT_FREQUENCIES)[number];

/** Statut **stocké** d'une échéance. Le statut affiché est recalculé : voir `effectivePaymentStatus`. */
export const PAYMENT_STATUSES = ['a_venir', 'paye', 'partiel', 'retard', 'impaye', 'annule'] as const;
export type PaymentStatus = (typeof PAYMENT_STATUSES)[number];

export const PAYER_TYPES = ['locataire', 'societe', 'autre_personne', 'autre'] as const;
export type PayerType = (typeof PAYER_TYPES)[number];

export const RENTAL_STATUSES = ['prevue', 'active', 'terminee', 'annulee'] as const;
export type RentalStatus = (typeof RENTAL_STATUSES)[number];

export const CONTRACT_STATUSES = ['brouillon', 'genere', 'signe'] as const;
export type ContractStatus = (typeof CONTRACT_STATUSES)[number];

export const MAINTENANCE_INTERVAL_MODES = ['kilometrage', 'temps', 'mixte'] as const;
export type MaintenanceIntervalMode = (typeof MAINTENANCE_INTERVAL_MODES)[number];

export const DOCUMENT_STATUSES = ['valide', 'expire_bientot', 'expire', 'sans_echeance'] as const;
export type DocumentStatus = (typeof DOCUMENT_STATUSES)[number];

export const INSPECTION_KINDS = ['depart', 'retour'] as const;
export type InspectionKind = (typeof INSPECTION_KINDS)[number];

export const DAMAGE_TYPES = [
  'rayure',
  'bosse',
  'choc',
  'jante',
  'pare_brise',
  'interieur',
  'autre',
] as const;
export type DamageType = (typeof DAMAGE_TYPES)[number];

/** Provenance d'un dommage : constaté pendant un état des lieux, ou déclaré comme incident. */
export const DAMAGE_ORIGINS = ['etat_des_lieux', 'incident'] as const;
export type DamageOrigin = (typeof DAMAGE_ORIGINS)[number];

export const DEPOSIT_OUTCOMES = ['restituee', 'partielle', 'retenue'] as const;
export type DepositOutcome = (typeof DEPOSIT_OUTCOMES)[number];

export const AMORTIZATION_METHODS = ['lineaire', 'degressif'] as const;
export type AmortizationMethod = (typeof AMORTIZATION_METHODS)[number];

export const NOTIFICATION_KINDS = [
  'loyer_jour',
  'loyer_retard',
  'assurance',
  'controle_technique',
  'document_vehicule',
  'document_locataire',
  'entretien_proche',
  'entretien_depasse',
  'retour_location',
] as const;
export type NotificationKind = (typeof NOTIFICATION_KINDS)[number];

/** Champ commun à toutes les entités persistées. */
export interface Entity {
  id: Id;
  createdAt: IsoDateTime;
  updatedAt: IsoDateTime;
  /** Renseigné quand l'entité est archivée : elle sort des listes mais reste consultable. */
  archivedAt: IsoDateTime | null;
}

// ---------------------------------------------------------------------------
// Véhicule
// ---------------------------------------------------------------------------

export interface Vehicle extends Entity {
  brand: string;
  model: string;
  /** Finition, ex. « Touring Sports ». */
  trim: string;
  year: number | null;
  plate: string;
  vin: string;
  fuelType: FuelType;
  status: VehicleStatus;
  purchaseDate: IsoDate | null;
  purchasePriceCents: Cents;
  /** Frais d'acquisition : carte grise, transport, remise en état initiale. */
  purchaseFeesCents: Cents;
  purchaseMileageKm: Km;
  currentMileageKm: Km;
  /** Durée d'amortissement choisie par le propriétaire. */
  amortizationMonths: number;
  amortizationMethod: AmortizationMethod;
  /** Fichier local de la photo de présentation. */
  photoFileId: Id | null;
  notes: string;
}

// ---------------------------------------------------------------------------
// Locataire
// ---------------------------------------------------------------------------

export interface Tenant extends Entity {
  firstName: string;
  lastName: string;
  birthDate: IsoDate | null;
  address: string;
  phone: string;
  email: string;
  licenseNumber: string;
  licenseDate: IsoDate | null;
  /** Numéro de carte professionnelle VTC, si applicable. */
  vtcNumber: string;
  notes: string;
}

// ---------------------------------------------------------------------------
// Location, contrat
// ---------------------------------------------------------------------------

export interface Rental extends Entity {
  vehicleId: Id;
  tenantId: Id;
  startDate: IsoDate;
  /** `null` = location sans date de fin. */
  endDate: IsoDate | null;
  openEnded: boolean;
  rentAmountCents: Cents;
  frequency: PaymentFrequency;
  /** Utilisé quand `frequency === 'personnalisee'` : nombre de jours entre deux échéances. */
  intervalDays: number | null;
  /** Jour d'échéance : 1 = lundi … 7 = dimanche pour les fréquences hebdomadaires. */
  dueWeekday: number | null;
  /** Jour du mois pour les fréquences mensuelles (1–31, ramené au dernier jour si trop grand). */
  dueDayOfMonth: number | null;
  depositCents: Cents;
  startMileageKm: Km;
  endMileageKm: Km | null;
  /** Kilométrage autorisé sur la durée de la location. `null` = illimité. */
  allowedKm: Km | null;
  /** Prix du kilomètre supplémentaire, en centimes. */
  excessKmPriceCents: Cents;
  /** Frais divers facturés au locataire (mise à disposition, nettoyage…). */
  feesCents: Cents;
  status: RentalStatus;
  activatedAt: IsoDateTime | null;
  endedAt: IsoDateTime | null;
  depositOutcome: DepositOutcome | null;
  depositReturnedCents: Cents;
  notes: string;
}

export interface Contract extends Entity {
  rentalId: Id;
  reference: string;
  status: ContractStatus;
  generatedAt: IsoDateTime | null;
  /** Instantanés : un contrat signé ne doit plus bouger si le locataire est modifié ensuite. */
  ownerSnapshot: string;
  tenantSnapshot: string;
  vehicleSnapshot: string;
  rentalSnapshot: string;
  /** Clauses retenues au moment de la génération, avec leur état actif/inactif. */
  clausesSnapshot: string;
  /** Identifiants des documents du locataire retenus comme justificatifs de ce contrat. */
  documentIds: string[];
  ownerSignature: string | null;
  tenantSignature: string | null;
  signedAt: IsoDateTime | null;
  pdfFileId: Id | null;
}

// ---------------------------------------------------------------------------
// Encaissements, dépenses
// ---------------------------------------------------------------------------

export interface Payment extends Entity {
  rentalId: Id;
  vehicleId: Id;
  tenantId: Id;
  dueDate: IsoDate;
  expectedCents: Cents;
  receivedCents: Cents;
  paidDate: IsoDate | null;
  methodId: Id | null;
  payerType: PayerType;
  payerName: string;
  comment: string;
  proofFileId: Id | null;
  /** Statut manuel (`annule`, `impaye`). Sinon recalculé depuis les montants et la date. */
  status: PaymentStatus;
}

export interface Expense extends Entity {
  vehicleId: Id;
  rentalId: Id | null;
  date: IsoDate;
  amountCents: Cents;
  categoryId: Id;
  mileageKm: Km | null;
  supplier: string;
  comment: string;
  invoiceFileId: Id | null;
  photoFileId: Id | null;
  /** Renseigné quand la dépense naît d'une intervention d'entretien ou d'un sinistre. */
  maintenanceRecordId: Id | null;
  damageId: Id | null;
}

export interface ExpenseCategory extends Entity {
  label: string;
  icon: string;
  isDefault: boolean;
}

export interface PaymentMethod extends Entity {
  label: string;
  isDefault: boolean;
}

// ---------------------------------------------------------------------------
// Entretien
// ---------------------------------------------------------------------------

/** Catalogue des types d'entretien. Le propriétaire peut en ajouter. */
export interface MaintenanceType extends Entity {
  label: string;
  intervalMode: MaintenanceIntervalMode;
  intervalKm: number | null;
  intervalMonths: number | null;
  isDefault: boolean;
}

/** Plan d'entretien d'un véhicule pour un type donné. La fréquence est libre. */
export interface MaintenancePlan extends Entity {
  vehicleId: Id;
  typeId: Id;
  intervalMode: MaintenanceIntervalMode;
  intervalKm: number | null;
  intervalMonths: number | null;
  /** Dernière intervention connue : point de départ du calcul de la prochaine échéance. */
  lastKm: Km | null;
  lastDate: IsoDate | null;
  active: boolean;
  notes: string;
}

export interface MaintenanceRecord extends Entity {
  vehicleId: Id;
  planId: Id | null;
  typeId: Id;
  date: IsoDate;
  mileageKm: Km;
  amountCents: Cents;
  supplier: string;
  comment: string;
  partsChanged: string;
  invoiceFileId: Id | null;
  photoFileId: Id | null;
}

export interface MileageRecord extends Entity {
  vehicleId: Id;
  date: IsoDate;
  km: Km;
  source: 'manuel' | 'entretien' | 'etat_des_lieux' | 'location' | 'achat';
  rentalId: Id | null;
  comment: string;
}

// ---------------------------------------------------------------------------
// États des lieux, dommages, assurance
// ---------------------------------------------------------------------------

export interface InspectionPhoto {
  /** Emplacement suggéré : avant, arriere, gauche, droite, jantes, interieur, compteur, libre… */
  slot: string;
  fileId: Id;
}

export interface Inspection extends Entity {
  rentalId: Id;
  vehicleId: Id;
  kind: InspectionKind;
  date: IsoDate;
  mileageKm: Km;
  /** Niveau de carburant en huitièmes (0–8), comme sur un état des lieux papier. */
  fuelEighths: number;
  interiorState: string;
  exteriorState: string;
  observations: string;
  photos: InspectionPhoto[];
  tenantSignature: string | null;
}

export interface Damage extends Entity {
  vehicleId: Id;
  rentalId: Id | null;
  inspectionId: Id | null;
  origin: DamageOrigin;
  type: DamageType;
  /** Localisation libre : « aile avant droite ». */
  zone: string;
  date: IsoDate;
  comment: string;
  estimatedCostCents: Cents;
  actualCostCents: Cents;
  photoFileId: Id | null;
  repaired: boolean;
}

export interface Insurance extends Entity {
  vehicleId: Id;
  company: string;
  contractNumber: string;
  amountCents: Cents;
  frequency: PaymentFrequency;
  startDate: IsoDate | null;
  endDate: IsoDate | null;
  documentFileId: Id | null;
  notes: string;
}

// ---------------------------------------------------------------------------
// Documents
// ---------------------------------------------------------------------------

/** Catalogue des types de documents. `hasExpiry` pilote l'affichage des dates et des rappels. */
export interface DocumentType extends Entity {
  label: string;
  /** `locataire` ou `vehicule`. */
  scope: 'locataire' | 'vehicule';
  hasExpiry: boolean;
  isDefault: boolean;
  /** Coche par défaut dans « documents obligatoires pour louer ». */
  requiredByDefault: boolean;
}

export interface TenantDocument extends Entity {
  tenantId: Id;
  typeId: Id;
  number: string;
  issueDate: IsoDate | null;
  expiryDate: IsoDate | null;
  comment: string;
  /** Référence du fichier chiffré, stocké uniquement sur l'appareil. */
  fileId: Id | null;
  mimeType: string;
  fileName: string;
  sizeBytes: number;
}

export interface VehicleDocument extends Entity {
  vehicleId: Id;
  typeId: Id;
  number: string;
  issueDate: IsoDate | null;
  expiryDate: IsoDate | null;
  comment: string;
  fileId: Id | null;
  mimeType: string;
  fileName: string;
  sizeBytes: number;
}

/** Clause de contrat, éditable : le texte juridique n'est pas figé dans le code. */
export interface Clause extends Entity {
  title: string;
  body: string;
  enabled: boolean;
  position: number;
  isDefault: boolean;
}

// ---------------------------------------------------------------------------
// Notifications, réglages
// ---------------------------------------------------------------------------

export interface ScheduledNotification extends Entity {
  kind: NotificationKind;
  title: string;
  body: string;
  /** Identifiant rendu par le système, conservé pour pouvoir annuler. */
  systemId: string | null;
  fireDate: IsoDateTime;
  relatedType: string;
  relatedId: Id | null;
  enabled: boolean;
}

export interface OwnerProfile {
  firstName: string;
  lastName: string;
  company: string;
  address: string;
  phone: string;
  email: string;
  siret: string;
  extra: string;
}

export interface AppSettings {
  owner: OwnerProfile;
  /** Types de documents exigés avant d'activer une location. */
  requiredDocumentTypeIds: Id[];
  /** Seuils de rappel d'expiration, en jours avant l'échéance. */
  reminderDays: number[];
  /** Délai de verrouillage automatique, en secondes. `0` = immédiat. */
  lockDelaySeconds: number;
  biometricsEnabled: boolean;
  pinEnabled: boolean;
  currency: string;
  /** Seuils d'alerte entretien. */
  maintenanceWarningKm: number;
  maintenanceCriticalKm: number;
  maintenanceWarningDays: number;
  maintenanceCriticalDays: number;
  /** Un document expire « bientôt » sous ce nombre de jours. */
  documentWarningDays: number;
  /** Seuil d'alerte de dépassement kilométrique d'une location, en kilomètres. */
  rentalKmWarning: number;
  /** Version des données de démonstration déjà installées. `0` = jamais installées. */
  seedVersion: number;
}

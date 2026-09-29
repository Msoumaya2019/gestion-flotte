/**
 * Tables exportables en CSV : une colonne, des lignes, rien d'autre.
 *
 * ## Pourquoi dans le domaine, et pas dans l'écran
 *
 * Le choix des colonnes, l'ordre et le format de chaque cellule sont des décisions
 * vérifiables : « le montant reçu sort-il avec deux décimales ? », « la date est-elle
 * triable ? ». Les écrire dans un composant les rendrait impossibles à éprouver. Ici, ce
 * module ne connaît ni React ni la base : il reçoit des tableaux d'entités et rend un
 * objet que `toCsv` sait écrire.
 *
 * ## Trois partis pris de format, et leurs raisons
 *
 * - **Les dates restent en `AAAA-MM-JJ`.** Un tableur les trie correctement et ne se
 *   trompe pas sur le jour et le mois. Une date « 03/04/2026 » est ambiguë dès qu'elle
 *   change de pays, et un tri alphabétique y classe avril avant mars.
 * - **Les montants passent par `centsToCsv`**, donc en euros avec une virgule décimale.
 *   Un tableur en configuration française les reconnaît comme des nombres ; un montant
 *   laissé en centimes serait lu comme 120 000 au lieu de 1 200,00.
 * - **Les kilométrages sortent en nombre brut.** `formatKm` produit « 120 000 km » : la
 *   cellule deviendrait du texte, et plus aucune somme ne fonctionnerait.
 *
 * Les valeurs absentes sont rendues `null`, que `toCsv` écrit en cellule vide — et non en
 * `0`, qui se confondrait avec une vraie valeur nulle.
 */

import { DOCUMENT_STATUS_LABELS, FREQUENCY_LABELS, FUEL_TYPE_LABELS, INTERVAL_MODE_LABELS, PAYER_TYPE_LABELS, PAYMENT_STATUS_LABELS, RENTAL_STATUS_LABELS, SOURCE_LABELS, VEHICLE_STATUS_LABELS } from './catalog';
import { centsToCsv } from './csv';
import { documentValidity } from './documents';
import { effectivePaymentStatus, paymentBalance, scheduleLabel } from './rental';
import type {
  DocumentType,
  Expense,
  ExpenseCategory,
  IsoDate,
  MaintenanceRecord,
  MaintenanceType,
  MileageRecord,
  Payment,
  PaymentMethod,
  Rental,
  Tenant,
  TenantDocument,
  Vehicle,
  VehicleDocument,
} from './types';

/**
 * Une cellule de tableau.
 *
 * `null` devient une cellule vide à l'écriture — c'est la façon de dire « non renseigné »,
 * à distinguer d'un `0` qui est une valeur. Un `number` est écrit tel quel : c'est ce qu'il
 * faut pour un kilométrage, qu'un tableur doit pouvoir sommer.
 */
export type CsvCell = string | number | null;

/** Une table prête à écrire : `toCsv(table.columns, table.rows)`. */
export interface CsvTable {
  columns: readonly { label: string }[];
  rows: readonly (readonly CsvCell[])[];
}

function columns(...labels: string[]): readonly { label: string }[] {
  return labels.map((label) => ({ label }));
}

/** Nom complet d'un locataire, dans l'ordre où on le cherche dans une liste. */
export function tenantFullName(tenant: Pick<Tenant, 'firstName' | 'lastName'>): string {
  return [tenant.lastName, tenant.firstName].filter((part) => part.trim() !== '').join(' ');
}

/** Désignation d'un véhicule : marque, modèle et plaque, ce qui suffit à le reconnaître. */
export function vehicleLabel(vehicle: Pick<Vehicle, 'brand' | 'model' | 'plate'>): string {
  const name = [vehicle.brand, vehicle.model].filter((part) => part.trim() !== '').join(' ');
  return vehicle.plate.trim() === '' ? name : `${name} (${vehicle.plate})`;
}

function byId<T extends { id: string }>(items: readonly T[]): Map<string, T> {
  return new Map(items.map((item) => [item.id, item]));
}

/**
 * Le statut affiché d'un document, calculé à partir de sa date d'expiration.
 *
 * `documentValidity` rend déjà `sans_echeance` pour un document sans date — on ne décide
 * donc pas ici si le type « doit » porter une échéance. La date est la seule source : un
 * document dont le type n'expire pas mais qui porte une date est bel et bien daté.
 */
function documentStatusCell(expiryDate: IsoDate | null, today: IsoDate, warningDays: number): string {
  return DOCUMENT_STATUS_LABELS[documentValidity(expiryDate, today, warningDays).status].label;
}

// ---------------------------------------------------------------------------
// Véhicules
// ---------------------------------------------------------------------------

export function vehicleTable(vehicles: readonly Vehicle[]): CsvTable {
  return {
    columns: columns(
      'Marque',
      'Modèle',
      'Finition',
      'Année',
      'Immatriculation',
      'VIN',
      'Carburant',
      'Statut',
      'Date d’achat',
      'Prix d’achat',
      'Frais d’acquisition',
      'Investissement total',
      'Km à l’achat',
      'Km actuel',
      'Km parcourus',
      'Amortissement (mois)',
      'Notes',
    ),
    rows: vehicles.map((vehicle) => [
      vehicle.brand,
      vehicle.model,
      vehicle.trim,
      vehicle.year,
      vehicle.plate,
      vehicle.vin,
      FUEL_TYPE_LABELS[vehicle.fuelType] ?? vehicle.fuelType,
      VEHICLE_STATUS_LABELS[vehicle.status].label,
      vehicle.purchaseDate,
      centsToCsv(vehicle.purchasePriceCents),
      centsToCsv(vehicle.purchaseFeesCents),
      centsToCsv(vehicle.purchasePriceCents + vehicle.purchaseFeesCents),
      vehicle.purchaseMileageKm,
      vehicle.currentMileageKm,
      Math.max(0, vehicle.currentMileageKm - vehicle.purchaseMileageKm),
      vehicle.amortizationMonths,
      vehicle.notes,
    ]),
  };
}

// ---------------------------------------------------------------------------
// Locataires
// ---------------------------------------------------------------------------

export function tenantTable(tenants: readonly Tenant[]): CsvTable {
  return {
    columns: columns(
      'Nom',
      'Prénom',
      'Date de naissance',
      'Adresse',
      'Téléphone',
      'E-mail',
      'N° de permis',
      'Date du permis',
      'N° carte VTC',
      'Notes',
    ),
    rows: tenants.map((tenant) => [
      tenant.lastName,
      tenant.firstName,
      tenant.birthDate,
      tenant.address,
      tenant.phone,
      tenant.email,
      tenant.licenseNumber,
      tenant.licenseDate,
      tenant.vtcNumber,
      tenant.notes,
    ]),
  };
}

// ---------------------------------------------------------------------------
// Locations
// ---------------------------------------------------------------------------

export function rentalTable(input: {
  rentals: readonly Rental[];
  vehicles: readonly Vehicle[];
  tenants: readonly Tenant[];
}): CsvTable {
  const vehicles = byId(input.vehicles);
  const tenants = byId(input.tenants);

  return {
    columns: columns(
      'Véhicule',
      'Locataire',
      'Début',
      'Fin',
      'Statut',
      'Loyer',
      'Fréquence',
      'Ancrage de l’échéance',
      'Caution',
      'Km au départ',
      'Km au retour',
      'Km autorisés',
      'Prix du km supplémentaire',
      'Frais',
      'Notes',
    ),
    rows: input.rentals.map((rental) => {
      const vehicle = vehicles.get(rental.vehicleId);
      const tenant = tenants.get(rental.tenantId);
      return [
        vehicle === undefined ? null : vehicleLabel(vehicle),
        tenant === undefined ? null : tenantFullName(tenant),
        rental.startDate,
        rental.endDate,
        RENTAL_STATUS_LABELS[rental.status].label,
        centsToCsv(rental.rentAmountCents),
        FREQUENCY_LABELS[rental.frequency] ?? rental.frequency,
        // Le même libellé que celui du contrat, et non un nombre nu : « chaque lundi »
        // se lit, alors que « 1 » demanderait de savoir que 1 veut dire lundi — et pour
        // une location personnalisée, la valeur utile est le nombre de jours.
        scheduleLabel(rental),
        centsToCsv(rental.depositCents),
        rental.startMileageKm,
        rental.endMileageKm,
        rental.allowedKm,
        centsToCsv(rental.excessKmPriceCents),
        centsToCsv(rental.feesCents),
        rental.notes,
      ];
    }),
  };
}

// ---------------------------------------------------------------------------
// Échéances
// ---------------------------------------------------------------------------

export function paymentTable(input: {
  payments: readonly Payment[];
  vehicles: readonly Vehicle[];
  tenants: readonly Tenant[];
  methods: readonly PaymentMethod[];
  today: IsoDate;
}): CsvTable {
  const vehicles = byId(input.vehicles);
  const tenants = byId(input.tenants);
  const methods = byId(input.methods);

  return {
    columns: columns(
      'Véhicule',
      'Locataire',
      'Échéance',
      'Montant attendu',
      'Montant reçu',
      'Reste dû',
      'Statut',
      'Date de paiement',
      'Moyen de paiement',
      'Qui a payé',
      'Nom du payeur',
      'Commentaire',
    ),
    rows: input.payments.map((payment) => {
      const vehicle = vehicles.get(payment.vehicleId);
      const tenant = tenants.get(payment.tenantId);
      const method = payment.methodId === null ? undefined : methods.get(payment.methodId);
      const balance = paymentBalance(payment);
      // Le statut est recalculé, jamais lu tel quel : `status` ne porte que les décisions
      // humaines (`annule`, `impaye`), le reste dépend de la date du jour.
      const status = effectivePaymentStatus(payment, input.today);
      return [
        vehicle === undefined ? null : vehicleLabel(vehicle),
        tenant === undefined ? null : tenantFullName(tenant),
        payment.dueDate,
        centsToCsv(payment.expectedCents),
        centsToCsv(payment.receivedCents),
        centsToCsv(balance.remainingCents),
        PAYMENT_STATUS_LABELS[status].label,
        payment.paidDate,
        method === undefined ? null : method.label,
        PAYER_TYPE_LABELS[payment.payerType] ?? payment.payerType,
        payment.payerName,
        payment.comment,
      ];
    }),
  };
}

// ---------------------------------------------------------------------------
// Dépenses
// ---------------------------------------------------------------------------

export function expenseTable(input: {
  expenses: readonly Expense[];
  vehicles: readonly Vehicle[];
  categories: readonly ExpenseCategory[];
}): CsvTable {
  const vehicles = byId(input.vehicles);
  const categories = byId(input.categories);

  return {
    columns: columns('Date', 'Véhicule', 'Catégorie', 'Montant', 'Kilométrage', 'Fournisseur', 'Commentaire'),
    rows: input.expenses.map((expense) => {
      const vehicle = vehicles.get(expense.vehicleId);
      const category = categories.get(expense.categoryId);
      return [
        expense.date,
        vehicle === undefined ? null : vehicleLabel(vehicle),
        category === undefined ? null : category.label,
        centsToCsv(expense.amountCents),
        expense.mileageKm,
        expense.supplier,
        expense.comment,
      ];
    }),
  };
}

// ---------------------------------------------------------------------------
// Entretien
// ---------------------------------------------------------------------------

export function maintenanceTable(input: {
  records: readonly MaintenanceRecord[];
  vehicles: readonly Vehicle[];
  types: readonly MaintenanceType[];
}): CsvTable {
  const vehicles = byId(input.vehicles);
  const types = byId(input.types);

  return {
    columns: columns(
      'Date',
      'Véhicule',
      'Type',
      'Kilométrage',
      'Montant',
      'Fournisseur',
      'Pièces changées',
      'Commentaire',
    ),
    rows: input.records.map((record) => {
      const vehicle = vehicles.get(record.vehicleId);
      const type = types.get(record.typeId);
      return [
        record.date,
        vehicle === undefined ? null : vehicleLabel(vehicle),
        type === undefined ? null : `${type.label} (${INTERVAL_MODE_LABELS[type.intervalMode] ?? type.intervalMode})`,
        record.mileageKm,
        centsToCsv(record.amountCents),
        record.supplier,
        record.partsChanged,
        record.comment,
      ];
    }),
  };
}

// ---------------------------------------------------------------------------
// Kilométrage
// ---------------------------------------------------------------------------

export function mileageTable(input: {
  records: readonly MileageRecord[];
  vehicles: readonly Vehicle[];
}): CsvTable {
  const vehicles = byId(input.vehicles);

  return {
    columns: columns('Date', 'Véhicule', 'Kilométrage', 'Origine', 'Commentaire'),
    rows: input.records.map((record) => {
      const vehicle = vehicles.get(record.vehicleId);
      return [
        record.date,
        vehicle === undefined ? null : vehicleLabel(vehicle),
        record.km,
        SOURCE_LABELS[record.source] ?? record.source,
        record.comment,
      ];
    }),
  };
}

// ---------------------------------------------------------------------------
// Documents
// ---------------------------------------------------------------------------

/**
 * Documents des locataires et des véhicules réunis.
 *
 * Les deux familles ont la même forme : une seule table évite de produire deux fichiers
 * que l'utilisateur devrait recoller lui-même. La colonne « Portée » dit de quel côté on
 * se trouve, et « Titulaire » nomme le locataire ou le véhicule.
 *
 * **Le contenu des fichiers n'est pas exporté ici.** Ces documents vivent chiffrés dans le
 * coffre de l'appareil ; ce tableau n'en décrit que les métadonnées. Une sauvegarde
 * complète, elle, les emporte — c'est l'écran « Sauvegarde » qui s'en charge.
 */
export function documentTable(input: {
  tenantDocuments: readonly TenantDocument[];
  vehicleDocuments: readonly VehicleDocument[];
  tenants: readonly Tenant[];
  vehicles: readonly Vehicle[];
  types: readonly DocumentType[];
  today: IsoDate;
  /** Seuil d'alerte, en jours, pris dans les réglages : il décide de « expire bientôt ». */
  warningDays: number;
}): CsvTable {
  const tenants = byId(input.tenants);
  const vehicles = byId(input.vehicles);
  const types = byId(input.types);

  const rows: (readonly CsvCell[])[] = [];

  const push = (
    scope: string,
    holder: string | null,
    document: TenantDocument | VehicleDocument,
  ): void => {
    rows.push([
      scope,
      holder,
      types.get(document.typeId)?.label ?? null,
      document.number,
      document.issueDate,
      document.expiryDate,
      documentStatusCell(document.expiryDate, input.today, input.warningDays),
      document.fileId === null ? 'Sans fichier' : 'Fichier joint',
      document.fileName,
      document.sizeBytes === 0 ? null : document.sizeBytes,
      document.comment,
    ]);
  };

  for (const document of input.tenantDocuments) {
    const tenant = tenants.get(document.tenantId);
    push('Locataire', tenant === undefined ? null : tenantFullName(tenant), document);
  }
  for (const document of input.vehicleDocuments) {
    const vehicle = vehicles.get(document.vehicleId);
    push('Véhicule', vehicle === undefined ? null : vehicleLabel(vehicle), document);
  }

  return {
    columns: columns(
      'Portée',
      'Titulaire',
      'Type',
      'Numéro',
      'Délivré le',
      'Expire le',
      'Statut',
      'Pièce',
      'Nom du fichier',
      'Taille (octets)',
      'Commentaire',
    ),
    rows,
  };
}

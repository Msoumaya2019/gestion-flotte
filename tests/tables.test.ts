import assert from 'node:assert/strict';
import { test } from 'node:test';

import { toCsv } from '@/domain/csv';
import { scheduleLabel } from '@/domain/rental';
import {
  documentTable,
  expenseTable,
  maintenanceTable,
  mileageTable,
  paymentTable,
  rentalTable,
  tenantFullName,
  tenantTable,
  vehicleLabel,
  vehicleTable,
  type CsvCell,
  type CsvTable,
} from '@/domain/tables';
import type {
  DocumentType,
  Expense,
  ExpenseCategory,
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
} from '@/domain/types';

const TODAY = '2026-09-28';
const STAMP = '2026-01-01T00:00:00.000Z';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function vehicle(overrides: Partial<Vehicle> = {}): Vehicle {
  return {
    id: 'v1',
    createdAt: STAMP,
    updatedAt: STAMP,
    archivedAt: null,
    brand: 'Toyota',
    model: 'Corolla',
    trim: 'Touring Sports',
    year: 2021,
    plate: 'AB-123-CD',
    vin: 'VIN0001',
    fuelType: 'hybride',
    status: 'disponible',
    purchaseDate: '2024-01-01',
    purchasePriceCents: 1_200_000,
    purchaseFeesCents: 50_000,
    purchaseMileageKm: 10_000,
    currentMileageKm: 60_000,
    amortizationMonths: 60,
    amortizationMethod: 'lineaire',
    photoFileId: null,
    notes: '',
    ...overrides,
  };
}

function tenant(overrides: Partial<Tenant> = {}): Tenant {
  return {
    id: 't1',
    createdAt: STAMP,
    updatedAt: STAMP,
    archivedAt: null,
    firstName: 'Ahmed',
    lastName: 'Benali',
    birthDate: '1990-05-12',
    address: '1 rue des Lilas',
    phone: '+33 6 12 45 78 90',
    email: 'ahmed@example.org',
    licenseNumber: '751234567890',
    licenseDate: '2010-06-01',
    vtcNumber: '',
    notes: '',
    ...overrides,
  };
}

function rental(overrides: Partial<Rental> = {}): Rental {
  return {
    id: 'r1',
    createdAt: STAMP,
    updatedAt: STAMP,
    archivedAt: null,
    vehicleId: 'v1',
    tenantId: 't1',
    startDate: '2026-09-01',
    endDate: null,
    openEnded: true,
    rentAmountCents: 30_000,
    frequency: 'mensuel',
    intervalDays: null,
    dueWeekday: null,
    dueDayOfMonth: 5,
    paymentTiming: 'debut',
    depositCents: 100_000,
    startMileageKm: 60_000,
    endMileageKm: null,
    allowedKm: null,
    excessKmPriceCents: 25,
    feesCents: 0,
    status: 'active',
    activatedAt: STAMP,
    endedAt: null,
    depositOutcome: null,
    depositReturnedCents: 0,
    notes: '',
    ...overrides,
  };
}

function payment(overrides: Partial<Payment> = {}): Payment {
  return {
    id: 'p1',
    createdAt: STAMP,
    updatedAt: STAMP,
    archivedAt: null,
    rentalId: 'r1',
    vehicleId: 'v1',
    tenantId: 't1',
    dueDate: '2026-09-05',
    expectedCents: 30_000,
    receivedCents: 25_000,
    paidDate: '2026-09-05',
    methodId: 'm1',
    payerType: 'locataire',
    payerName: '',
    comment: '',
    proofFileId: null,
    status: 'partiel',
    ...overrides,
  };
}

function expense(overrides: Partial<Expense> = {}): Expense {
  return {
    id: 'e1',
    createdAt: STAMP,
    updatedAt: STAMP,
    archivedAt: null,
    vehicleId: 'v1',
    rentalId: null,
    date: '2026-09-10',
    amountCents: 4_250,
    categoryId: 'c1',
    mileageKm: null,
    supplier: 'Garage du coin',
    comment: '',
    invoiceFileId: null,
    photoFileId: null,
    maintenanceRecordId: null,
    damageId: null,
    ...overrides,
  };
}

function maintenanceRecord(overrides: Partial<MaintenanceRecord> = {}): MaintenanceRecord {
  return {
    id: 'mr1',
    createdAt: STAMP,
    updatedAt: STAMP,
    archivedAt: null,
    vehicleId: 'v1',
    planId: null,
    typeId: 'mt1',
    date: '2026-09-12',
    mileageKm: 61_000,
    amountCents: 12_000,
    supplier: 'Garage du coin',
    comment: '',
    partsChanged: 'Filtre à huile',
    invoiceFileId: null,
    photoFileId: null,
    ...overrides,
  };
}

function mileageRecord(overrides: Partial<MileageRecord> = {}): MileageRecord {
  return {
    id: 'km1',
    createdAt: STAMP,
    updatedAt: STAMP,
    archivedAt: null,
    vehicleId: 'v1',
    date: '2026-09-20',
    km: 62_500,
    source: 'manuel',
    rentalId: null,
    comment: '',
    ...overrides,
  };
}

function tenantDocument(overrides: Partial<TenantDocument> = {}): TenantDocument {
  return {
    id: 'td1',
    createdAt: STAMP,
    updatedAt: STAMP,
    archivedAt: null,
    tenantId: 't1',
    typeId: 'dt1',
    number: '751234567890',
    issueDate: '2010-06-01',
    expiryDate: '2026-10-15',
    comment: '',
    fileId: 'f1',
    mimeType: 'application/pdf',
    fileName: 'permis.pdf',
    sizeBytes: 123_456,
    ...overrides,
  };
}

function vehicleDocument(overrides: Partial<VehicleDocument> = {}): VehicleDocument {
  return {
    id: 'vd1',
    createdAt: STAMP,
    updatedAt: STAMP,
    archivedAt: null,
    vehicleId: 'v1',
    typeId: 'dt2',
    number: 'CG-001',
    issueDate: null,
    expiryDate: null,
    comment: '',
    fileId: null,
    mimeType: '',
    fileName: '',
    sizeBytes: 0,
    ...overrides,
  };
}

const DOCUMENT_TYPES: DocumentType[] = [
  {
    id: 'dt1',
    createdAt: STAMP,
    updatedAt: STAMP,
    archivedAt: null,
    label: 'Permis de conduire',
    scope: 'locataire',
    hasExpiry: true,
    isDefault: true,
    requiredByDefault: true,
  },
  {
    id: 'dt2',
    createdAt: STAMP,
    updatedAt: STAMP,
    archivedAt: null,
    label: 'Carte grise',
    scope: 'vehicule',
    hasExpiry: false,
    isDefault: true,
    requiredByDefault: false,
  },
];

const MAINTENANCE_TYPES: MaintenanceType[] = [
  {
    id: 'mt1',
    createdAt: STAMP,
    updatedAt: STAMP,
    archivedAt: null,
    label: 'Vidange',
    intervalMode: 'mixte',
    intervalKm: 15_000,
    intervalMonths: 12,
    isDefault: true,
  },
];

const CATEGORIES: ExpenseCategory[] = [
  {
    id: 'c1',
    createdAt: STAMP,
    updatedAt: STAMP,
    archivedAt: null,
    label: 'Entretien',
    icon: 'wrench',
    isDefault: true,
  },
];

const METHODS: PaymentMethod[] = [
  {
    id: 'm1',
    createdAt: STAMP,
    updatedAt: STAMP,
    archivedAt: null,
    label: 'Virement',
    isDefault: true,
  },
];

// ---------------------------------------------------------------------------
// L'accord entre en-têtes et valeurs
// ---------------------------------------------------------------------------

/**
 * Toutes les tables construites ici, avec un jeu minimal mais non vide.
 *
 * C'est ce jeu qui permet le contrôle suivant : une table vide ne révélerait pas qu'une
 * ligne porte une valeur de trop ou de moins.
 */
function everyTable(): { name: string; table: CsvTable }[] {
  return [
    { name: 'véhicules', table: vehicleTable([vehicle()]) },
    { name: 'locataires', table: tenantTable([tenant()]) },
    {
      name: 'locations',
      table: rentalTable({ rentals: [rental()], vehicles: [vehicle()], tenants: [tenant()] }),
    },
    {
      name: 'échéances',
      table: paymentTable({
        payments: [payment()],
        vehicles: [vehicle()],
        tenants: [tenant()],
        methods: METHODS,
        today: TODAY,
      }),
    },
    { name: 'dépenses', table: expenseTable({ expenses: [expense()], vehicles: [vehicle()], categories: CATEGORIES }) },
    {
      name: 'entretien',
      table: maintenanceTable({ records: [maintenanceRecord()], vehicles: [vehicle()], types: MAINTENANCE_TYPES }),
    },
    { name: 'kilométrage', table: mileageTable({ records: [mileageRecord()], vehicles: [vehicle()] }) },
    {
      name: 'documents',
      table: documentTable({
        tenantDocuments: [tenantDocument()],
        vehicleDocuments: [vehicleDocument()],
        tenants: [tenant()],
        vehicles: [vehicle()],
        types: DOCUMENT_TYPES,
        today: TODAY,
        warningDays: 30,
      }),
    },
  ];
}

test('chaque ligne porte exactement autant de valeurs que la table a d’en-têtes', () => {
  // Le défaut que ce contrôle couvre : une valeur ajoutée à une ligne sans son en-tête.
  // Le CSV sort alors décalé d'une colonne, ou avec une colonne sans titre, et rien ne le
  // signale — un tableur se contente de l'afficher.
  for (const { name, table } of everyTable()) {
    assert.ok(table.columns.length > 0, `${name} : aucune colonne`);
    assert.ok(table.rows.length > 0, `${name} : aucune ligne, le contrôle ne prouverait rien`);
    for (const [index, row] of table.rows.entries()) {
      assert.equal(
        row.length,
        table.columns.length,
        `${name}, ligne ${index} : ${row.length} valeurs pour ${table.columns.length} en-têtes`,
      );
    }
  }
});

test('chaque table non vide produit un CSV dont toutes les lignes ont le même nombre de cellules', () => {
  for (const { name, table } of everyTable()) {
    const csv = toCsv(table.columns, table.rows);
    const lines = csv.trimEnd().split('\r\n');
    const expected = table.columns.length;
    for (const [index, line] of lines.entries()) {
      // Le découpage naïf suffit ici : aucune fixture ne contient de séparateur dans une
      // cellule. Ce que ce contrôle mesure, c'est bien le nombre de colonnes produites.
      assert.equal(line.split(';').length, expected, `${name}, ligne ${index} : « ${line} »`);
    }
  }
});

// ---------------------------------------------------------------------------
// Format des cellules
// ---------------------------------------------------------------------------

test('les montants sortent en euros décimaux, jamais en centimes', () => {
  const table = vehicleTable([vehicle()]);
  const row = table.rows[0];
  assert.ok(row !== undefined);
  // Prix d'achat : 12 000,00 € et non 1 200 000.
  assert.equal(row[9], '12000,00');
  assert.equal(row[10], '500,00', 'frais d’acquisition');
  assert.equal(row[11], '12500,00', 'investissement total = prix + frais');
});

test('les dates restent en AAAA-MM-JJ, donc triables', () => {
  const table = vehicleTable([vehicle()]);
  assert.equal(table.rows[0]?.[8], '2024-01-01');
  const tenants = tenantTable([tenant()]);
  assert.equal(tenants.rows[0]?.[2], '1990-05-12');
});

test('les kilométrages sortent en nombre brut, pour que le tableur puisse les sommer', () => {
  const table = mileageTable({ records: [mileageRecord()], vehicles: [vehicle()] });
  const row = table.rows[0];
  assert.ok(row !== undefined);
  // Un « 62 500 km » formaté deviendrait du texte, et la somme cesserait de fonctionner.
  assert.equal(row[2], 62_500);
  assert.equal(typeof row[2], 'number');
});

test('une valeur absente est une cellule vide, jamais un zéro', () => {
  const table = rentalTable({
    rentals: [rental({ endMileageKm: null, allowedKm: null })],
    vehicles: [vehicle()],
    tenants: [tenant()],
  });
  const row = table.rows[0];
  assert.ok(row !== undefined);
  assert.equal(row[3], null, 'date de fin absente');
  assert.equal(row[10], null, 'km de retour absent');
  assert.equal(row[11], null, 'km autorisés absents');

  // Et dans le CSV, ces cellules sont bien vides : deux séparateurs qui se suivent.
  const csv = toCsv(table.columns, table.rows);
  assert.match(csv, /;2026-09-01;;/);
});

test('un texte saisi par l’utilisateur ne peut pas devenir une formule dans le tableur', () => {
  // Le nom d'un locataire est une donnée extérieure. Sans neutralisation, ce nom serait
  // interprété comme une formule à l'ouverture du fichier.
  const table = tenantTable([tenant({ lastName: '=1+1', firstName: '+33' })]);
  const csv = toCsv(table.columns, table.rows);
  assert.match(csv, /'=1\+1/);
  assert.match(csv, /'\+33/);
  assert.doesNotMatch(csv, /;=1\+1/, 'aucune cellule ne commence par un signe égal nu');
});

// ---------------------------------------------------------------------------
// Contenu métier
// ---------------------------------------------------------------------------

test('le statut d’une échéance est recalculé, pas recopié du stockage', () => {
  // Stocké « partiel » avec 250 € reçus sur 300 € attendus : le reste dû doit apparaître,
  // et la date d'échéance dépassée doit faire basculer le statut en retard.
  const table = paymentTable({
    payments: [payment({ dueDate: '2026-09-05', expectedCents: 30_000, receivedCents: 25_000, status: 'partiel' })],
    vehicles: [vehicle()],
    tenants: [tenant()],
    methods: METHODS,
    today: TODAY,
  });
  const row = table.rows[0];
  assert.ok(row !== undefined);
  assert.equal(row[3], '300,00', 'montant attendu');
  assert.equal(row[4], '250,00', 'montant reçu');
  assert.equal(row[5], '50,00', 'reste dû : 300 − 250');
  assert.equal(row[6], 'En retard', 'la date est passée et il reste dû');
  assert.equal(row[8], 'Virement', 'le moyen de paiement est nommé, pas identifié');
});

test('une échéance entièrement payée n’est pas en retard, même dépassée', () => {
  const table = paymentTable({
    payments: [payment({ dueDate: '2026-09-05', expectedCents: 30_000, receivedCents: 30_000, status: 'paye' })],
    vehicles: [vehicle()],
    tenants: [tenant()],
    methods: METHODS,
    today: TODAY,
  });
  assert.equal(table.rows[0]?.[5], '0,00');
  assert.equal(table.rows[0]?.[6], 'Payé');
});

test('l’ancrage de l’échéance est la phrase du contrat, pas un nombre nu', () => {
  const cases: Rental[] = [
    rental({ frequency: 'hebdomadaire', dueWeekday: 1, dueDayOfMonth: null }),
    rental({ frequency: 'bimensuel', dueWeekday: 4, dueDayOfMonth: null }),
    rental({ frequency: 'mensuel', dueDayOfMonth: 5 }),
    rental({ frequency: 'personnalisee', intervalDays: 10, dueDayOfMonth: null }),
  ];
  for (const item of cases) {
    const table = rentalTable({ rentals: [item], vehicles: [vehicle()], tenants: [tenant()] });
    // La même fonction que celle qui engendre l'échéancier : la table et le contrat ne
    // peuvent pas annoncer deux choses différentes.
    assert.equal(table.rows[0]?.[7], scheduleLabel(item));
  }
});

test('le statut d’un document est calculé depuis sa date d’expiration', () => {
  const build = (expiryDate: string | null, warningDays: number): CsvCell | undefined =>
    documentTable({
      tenantDocuments: [tenantDocument({ expiryDate })],
      vehicleDocuments: [],
      tenants: [tenant()],
      vehicles: [vehicle()],
      types: DOCUMENT_TYPES,
      today: TODAY,
      warningDays,
    }).rows[0]?.[6];

  assert.equal(build('2026-10-15', 30), 'Expire bientôt', 'à 17 jours de l’échéance');
  assert.equal(build('2026-09-01', 30), 'Expiré');
  assert.equal(build('2027-06-01', 30), 'Valide');
  assert.equal(build(null, 30), 'Sans échéance', 'un document sans date n’est pas « valide »');
  // Le seuil vient des réglages : le resserrer change le verdict, sans changer la date.
  assert.equal(build('2026-10-15', 5), 'Valide', 'même date, seuil plus étroit');
});

test('la table des documents dit si la pièce est jointe, sans exporter son contenu', () => {
  const table = documentTable({
    tenantDocuments: [tenantDocument()],
    vehicleDocuments: [vehicleDocument({ fileId: null })],
    tenants: [tenant()],
    vehicles: [vehicle()],
    types: DOCUMENT_TYPES,
    today: TODAY,
    warningDays: 30,
  });
  assert.equal(table.rows.length, 2);
  assert.equal(table.rows[0]?.[0], 'Locataire');
  assert.equal(table.rows[0]?.[1], 'Benali Ahmed');
  assert.equal(table.rows[0]?.[2], 'Permis de conduire');
  assert.equal(table.rows[0]?.[7], 'Fichier joint');
  assert.equal(table.rows[1]?.[0], 'Véhicule');
  assert.equal(table.rows[1]?.[1], 'Toyota Corolla (AB-123-CD)');
  assert.equal(table.rows[1]?.[7], 'Sans fichier');
  assert.equal(table.rows[1]?.[9], null, 'une taille nulle n’est pas un zéro');
});

test('une référence absente ne fait pas disparaître la ligne', () => {
  // Un véhicule supprimé du jeu de données laisse une ligne orpheline : elle doit rester
  // visible, sinon une dépense cesse silencieusement d'apparaître dans l'export.
  const table = expenseTable({
    expenses: [expense({ vehicleId: 'inconnu', categoryId: 'inconnue' })],
    vehicles: [vehicle()],
    categories: CATEGORIES,
  });
  assert.equal(table.rows.length, 1);
  assert.equal(table.rows[0]?.[1], null, 'véhicule introuvable');
  assert.equal(table.rows[0]?.[2], null, 'catégorie introuvable');
  assert.equal(table.rows[0]?.[3], '42,50', 'le montant reste exporté');
});

test('le libellé d’un véhicule et le nom d’un locataire se lisent tels quels', () => {
  assert.equal(vehicleLabel(vehicle()), 'Toyota Corolla (AB-123-CD)');
  assert.equal(vehicleLabel(vehicle({ plate: '' })), 'Toyota Corolla', 'sans plaque, pas de parenthèses vides');
  assert.equal(tenantFullName(tenant()), 'Benali Ahmed');
  assert.equal(tenantFullName(tenant({ firstName: '' })), 'Benali', 'pas d’espace de tête');
});

test('une location sans fin sort avec une date de fin vide, pas avec une date inventée', () => {
  const table = rentalTable({
    rentals: [rental({ endDate: null, openEnded: true })],
    vehicles: [vehicle()],
    tenants: [tenant()],
  });
  assert.equal(table.rows[0]?.[3], null);
});

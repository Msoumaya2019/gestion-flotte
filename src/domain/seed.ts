/**
 * Données de démonstration.
 *
 * Ce module est **pur** : il reçoit un contexte (fabrique d'identifiants, date du jour,
 * correspondance libellé → identifiant des catalogues) et rend un jeu complet d'entités.
 * Il est donc exécutable dans un test, ce qui permet de vérifier que les données de
 * démonstration sont cohérentes avec les calculs — un jeu de démonstration faux fait
 * douter de l'application, pas de la démonstration.
 *
 * Les échéances de loyer ne sont pas écrites à la main : elles sont **engendrées** par
 * `scheduleDueDates`, la même fonction que celle utilisée en production. Une donnée de
 * démonstration écrite à la main finit toujours par contredire la règle qu'elle illustre.
 *
 * Aucun fichier n'est créé : les documents de démonstration portent leurs métadonnées avec
 * `fileId: null`. Inventer des chemins de fichiers ferait afficher des vignettes vides,
 * ce qui laisserait croire à un défaut de l'application.
 */

import { addDays, addMonths, compareIso, startOfMonth } from './dates';
import type { SignaturePayload } from './contract';
import { scheduleDueDates } from './rental';
import type {
  Cents,
  Contract,
  Damage,
  Expense,
  Inspection,
  Insurance,
  IsoDate,
  Km,
  MaintenancePlan,
  MaintenanceRecord,
  MileageRecord,
  Payment,
  Rental,
  Tenant,
  TenantDocument,
  Vehicle,
  VehicleDocument,
} from './types';

export interface SeedContext {
  newId: () => string;
  /** Horodatage ISO complet, identique pour toutes les lignes créées. */
  now: string;
  today: IsoDate;
  categoryIds: Readonly<Record<string, string>>;
  methodIds: Readonly<Record<string, string>>;
  maintenanceTypeIds: Readonly<Record<string, string>>;
  documentTypeIds: Readonly<Record<string, string>>;
}

export interface SeedResult {
  vehicles: Vehicle[];
  tenants: Tenant[];
  rentals: Rental[];
  contracts: Contract[];
  payments: Payment[];
  expenses: Expense[];
  maintenancePlans: MaintenancePlan[];
  maintenanceRecords: MaintenanceRecord[];
  mileageRecords: MileageRecord[];
  inspections: Inspection[];
  damages: Damage[];
  insurances: Insurance[];
  tenantDocuments: TenantDocument[];
  vehicleDocuments: VehicleDocument[];
}

function signature(paths: string[]): string {
  const payload: SignaturePayload = { width: 1000, height: 400, paths };
  return JSON.stringify(payload);
}

const OWNER_SIGNATURE = signature([
  'M 180 250 C 210 170 240 300 270 240 C 300 185 320 275 350 245 C 380 218 400 268 430 250',
  'M 470 245 C 520 195 560 285 610 235 C 650 196 690 262 730 240',
]);
const TENANT_SIGNATURE = signature([
  'M 200 265 C 235 175 265 295 300 245 C 330 202 350 280 385 250',
  'M 425 250 C 470 205 505 290 555 240 C 600 196 645 268 700 235 C 740 210 780 250 820 238',
]);

interface VehicleSpec {
  brand: string;
  model: string;
  trim: string;
  year: number;
  plate: string;
  vin: string;
  purchaseDate: IsoDate;
  purchasePriceCents: Cents;
  purchaseFeesCents: Cents;
  purchaseMileageKm: Km;
  currentMileageKm: Km;
  status: Vehicle['status'];
  amortizationMonths: number;
}

const VEHICLE_SPECS: readonly VehicleSpec[] = [
  {
    brand: 'Toyota',
    model: 'Corolla',
    trim: 'Touring Sports 1.8 Hybrid',
    year: 2021,
    plate: 'GK-482-LM',
    vin: 'SB1KZ3JE00E123456',
    purchaseDate: '2024-03-15',
    purchasePriceCents: 1_500_000,
    purchaseFeesCents: 50_000,
    purchaseMileageKm: 78_000,
    currentMileageKm: 125_400,
    status: 'loue',
    amortizationMonths: 60,
  },
  {
    brand: 'Toyota',
    model: 'C-HR',
    trim: '1.8 Hybrid Dynamic',
    year: 2022,
    plate: 'FT-119-RD',
    vin: 'NMTKZ3BX00R098765',
    purchaseDate: '2025-01-10',
    purchasePriceCents: 1_650_000,
    purchaseFeesCents: 40_000,
    purchaseMileageKm: 32_000,
    currentMileageKm: 68_900,
    status: 'loue',
    amortizationMonths: 60,
  },
  {
    brand: 'Toyota',
    model: 'Prius+',
    trim: '1.8 Hybrid Lounge 7 places',
    year: 2019,
    plate: 'DP-736-QS',
    vin: 'JTMBF3BH00D012345',
    purchaseDate: '2023-06-01',
    purchasePriceCents: 1_200_000,
    purchaseFeesCents: 35_000,
    purchaseMileageKm: 96_000,
    currentMileageKm: 148_200,
    status: 'disponible',
    amortizationMonths: 60,
  },
];

function makeVehicle(ctx: SeedContext, spec: VehicleSpec): Vehicle {
  return {
    id: ctx.newId(),
    createdAt: ctx.now,
    updatedAt: ctx.now,
    archivedAt: null,
    brand: spec.brand,
    model: spec.model,
    trim: spec.trim,
    year: spec.year,
    plate: spec.plate,
    vin: spec.vin,
    fuelType: 'hybride',
    status: spec.status,
    purchaseDate: spec.purchaseDate,
    purchasePriceCents: spec.purchasePriceCents,
    purchaseFeesCents: spec.purchaseFeesCents,
    purchaseMileageKm: spec.purchaseMileageKm,
    currentMileageKm: spec.currentMileageKm,
    amortizationMonths: spec.amortizationMonths,
    amortizationMethod: 'lineaire',
    photoFileId: null,
    notes: '',
  };
}

export function buildSeedData(ctx: SeedContext): SeedResult {
  const today = ctx.today;

  // -------------------------------------------------------------------------
  // Véhicules
  // -------------------------------------------------------------------------
  const vehicles = VEHICLE_SPECS.map((spec) => makeVehicle(ctx, spec));
  const corolla = vehicles[0] as Vehicle;
  const chr = vehicles[1] as Vehicle;
  const prius = vehicles[2] as Vehicle;

  // -------------------------------------------------------------------------
  // Locataires
  // -------------------------------------------------------------------------
  const ahmed: Tenant = {
    id: ctx.newId(),
    createdAt: ctx.now,
    updatedAt: ctx.now,
    archivedAt: null,
    firstName: 'Ahmed',
    lastName: 'Benali',
    birthDate: '1988-04-17',
    address: '12 rue des Acacias\n95300 Pontoise',
    phone: '06 12 45 78 90',
    email: 'ahmed.benali@example.fr',
    licenseNumber: '881204517830',
    licenseDate: '2007-06-12',
    vtcNumber: 'VTC-2023-114872',
    notes: 'Chauffeur VTC — travaille principalement sur Roissy et Paris.',
  };

  const claire: Tenant = {
    id: ctx.newId(),
    createdAt: ctx.now,
    updatedAt: ctx.now,
    archivedAt: null,
    firstName: 'Claire',
    lastName: 'Moreau',
    birthDate: '1994-11-02',
    address: '8 allée des Tilleuls\n95200 Sarcelles',
    phone: '07 88 21 34 56',
    email: 'claire.moreau@example.fr',
    licenseNumber: '142209830015',
    licenseDate: '2013-09-24',
    vtcNumber: 'VTC-2024-208311',
    notes: '',
  };

  const karim: Tenant = {
    id: ctx.newId(),
    createdAt: ctx.now,
    updatedAt: ctx.now,
    archivedAt: null,
    firstName: 'Karim',
    lastName: 'Haddad',
    birthDate: '1981-02-25',
    address: '45 avenue du Général Leclerc\n95100 Argenteuil',
    phone: '06 74 90 12 38',
    email: 'karim.haddad@example.fr',
    licenseNumber: '770815293044',
    licenseDate: '2000-03-08',
    vtcNumber: '',
    notes: 'A rendu le véhicule en février 2026, sans dommage constaté.',
  };

  const tenants = [ahmed, claire, karim];

  // -------------------------------------------------------------------------
  // Locations
  // -------------------------------------------------------------------------
  const corollaStart: IsoDate = '2026-07-06'; // un lundi
  const chrStart: IsoDate = '2026-05-04'; // un lundi

  const rentalCorolla: Rental = {
    id: ctx.newId(),
    createdAt: ctx.now,
    updatedAt: ctx.now,
    archivedAt: null,
    vehicleId: corolla.id,
    tenantId: ahmed.id,
    startDate: corollaStart,
    endDate: null,
    openEnded: true,
    rentAmountCents: 30_000,
    frequency: 'hebdomadaire',
    intervalDays: null,
    dueWeekday: 1,
    dueDayOfMonth: null,
    // La démonstration reste au paiement d'avance : c'est le cas le plus courant, et le
    // passer à « fin » décalerait toutes les échéances du jeu d'essai, donc les soldes et les
    // retards que les autres contrôles mesurent. L'option existe dans le formulaire.
    paymentTiming: 'debut',
    depositCents: 60_000,
    startMileageKm: 118_000,
    endMileageKm: null,
    allowedKm: null,
    excessKmPriceCents: 0,
    feesCents: 0,
    status: 'active',
    activatedAt: `${corollaStart}T09:15:00.000Z`,
    endedAt: null,
    depositOutcome: null,
    depositReturnedCents: 0,
    notes: 'Loyer hebdomadaire, paiement le lundi.',
  };

  const rentalChr: Rental = {
    id: ctx.newId(),
    createdAt: ctx.now,
    updatedAt: ctx.now,
    archivedAt: null,
    vehicleId: chr.id,
    tenantId: claire.id,
    startDate: chrStart,
    endDate: null,
    openEnded: true,
    rentAmountCents: 28_000,
    frequency: 'hebdomadaire',
    intervalDays: null,
    dueWeekday: 1,
    dueDayOfMonth: null,
    // La démonstration reste au paiement d'avance : c'est le cas le plus courant, et le
    // passer à « fin » décalerait toutes les échéances du jeu d'essai, donc les soldes et les
    // retards que les autres contrôles mesurent. L'option existe dans le formulaire.
    paymentTiming: 'debut',
    depositCents: 56_000,
    startMileageKm: 61_000,
    endMileageKm: null,
    allowedKm: 12_000,
    excessKmPriceCents: 25,
    feesCents: 5_000,
    status: 'active',
    activatedAt: `${chrStart}T08:00:00.000Z`,
    endedAt: null,
    depositOutcome: null,
    depositReturnedCents: 0,
    notes: 'Kilométrage contractuel de 12 000 km, puis 0,25 € par kilomètre supplémentaire.',
  };

  const rentalPriusEarly: Rental = {
    id: ctx.newId(),
    createdAt: ctx.now,
    updatedAt: ctx.now,
    archivedAt: null,
    vehicleId: prius.id,
    tenantId: karim.id,
    startDate: '2023-07-01',
    endDate: '2025-06-30',
    openEnded: false,
    rentAmountCents: 50_000,
    frequency: 'mensuel',
    intervalDays: null,
    dueWeekday: null,
    dueDayOfMonth: 1,
    paymentTiming: 'debut',
    depositCents: 50_000,
    startMileageKm: 96_000,
    endMileageKm: 118_000,
    allowedKm: null,
    excessKmPriceCents: 0,
    feesCents: 0,
    status: 'terminee',
    activatedAt: '2023-07-01T10:00:00.000Z',
    endedAt: '2025-06-30T17:30:00.000Z',
    depositOutcome: 'restituee',
    depositReturnedCents: 50_000,
    notes: '',
  };

  const rentalPriusLate: Rental = {
    id: ctx.newId(),
    createdAt: ctx.now,
    updatedAt: ctx.now,
    archivedAt: null,
    vehicleId: prius.id,
    tenantId: karim.id,
    startDate: '2025-09-01',
    endDate: '2026-02-28',
    openEnded: false,
    rentAmountCents: 60_000,
    frequency: 'mensuel',
    intervalDays: null,
    dueWeekday: null,
    dueDayOfMonth: 1,
    paymentTiming: 'debut',
    depositCents: 60_000,
    startMileageKm: 118_000,
    endMileageKm: 148_200,
    allowedKm: null,
    excessKmPriceCents: 0,
    feesCents: 0,
    status: 'terminee',
    activatedAt: '2025-09-01T09:00:00.000Z',
    endedAt: '2026-02-28T16:45:00.000Z',
    depositOutcome: 'restituee',
    depositReturnedCents: 60_000,
    notes: '',
  };

  const rentals = [rentalCorolla, rentalChr, rentalPriusEarly, rentalPriusLate];

  // -------------------------------------------------------------------------
  // Échéances — engendrées par la même fonction qu'en production
  // -------------------------------------------------------------------------
  const payments: Payment[] = [];
  const methods = ['Virement', 'Carte', 'Espèces', 'Chèque'];
  const methodList = methods
    .map((label) => ctx.methodIds[label])
    .filter((id): id is string => typeof id === 'string');

  interface PaymentPlan {
    rental: Rental;
    tenant: Tenant;
    vehicle: Vehicle;
    until: IsoDate;
    /** Toutes les échéances dont la date est antérieure ou égale à celle-ci sont soldées. */
    paidThrough: IsoDate | null;
    /** Dates partiellement réglées, avec le montant reçu. */
    partials: Readonly<Record<IsoDate, Cents>>;
    /** Dates explicitement passées en impayé. */
    writtenOff: readonly IsoDate[];
  }

  const plans: readonly PaymentPlan[] = [
    {
      rental: rentalCorolla,
      tenant: ahmed,
      vehicle: corolla,
      until: addMonths(today, 2),
      paidThrough: '2026-09-21',
      partials: { '2026-09-14': 20_000 },
      writtenOff: [],
    },
    {
      rental: rentalChr,
      tenant: claire,
      vehicle: chr,
      until: addMonths(today, 2),
      paidThrough: '2026-09-14',
      partials: {},
      writtenOff: ['2026-09-21'],
    },
    {
      rental: rentalPriusEarly,
      tenant: karim,
      vehicle: prius,
      until: '2025-06-30',
      paidThrough: '2025-06-30',
      partials: {},
      writtenOff: [],
    },
    {
      rental: rentalPriusLate,
      tenant: karim,
      vehicle: prius,
      until: '2026-02-28',
      paidThrough: '2026-02-28',
      partials: {},
      writtenOff: [],
    },
  ];

  for (const plan of plans) {
    const dates = scheduleDueDates({
      startDate: plan.rental.startDate,
      endDate: plan.rental.endDate,
      openEnded: plan.rental.openEnded,
      frequency: plan.rental.frequency,
      intervalDays: plan.rental.intervalDays,
      dueWeekday: plan.rental.dueWeekday,
      dueDayOfMonth: plan.rental.dueDayOfMonth,
      paymentTiming: plan.rental.paymentTiming,
      until: plan.until,
    });

    dates.forEach((dueDate, index) => {
      const expected = plan.rental.rentAmountCents;
      const writtenOff = plan.writtenOff.includes(dueDate);
      const partialAmount = plan.partials[dueDate];
      const isPaid = plan.paidThrough !== null && compareIso(dueDate, plan.paidThrough) <= 0 && partialAmount === undefined;

      let received = 0;
      let paidDate: IsoDate | null = null;
      let status: Payment['status'] = 'a_venir';

      if (isPaid) {
        received = expected;
        paidDate = dueDate;
        status = 'paye';
      } else if (partialAmount !== undefined) {
        received = partialAmount;
        paidDate = addDays(dueDate, 3);
        status = 'a_venir';
      } else if (writtenOff) {
        status = 'impaye';
      }

      payments.push({
        id: ctx.newId(),
        createdAt: ctx.now,
        updatedAt: ctx.now,
        archivedAt: null,
        rentalId: plan.rental.id,
        vehicleId: plan.vehicle.id,
        tenantId: plan.tenant.id,
        dueDate,
        expectedCents: expected,
        receivedCents: received,
        paidDate,
        methodId: received > 0 ? (methodList[index % Math.max(1, methodList.length)] ?? null) : null,
        payerType: plan.tenant.vtcNumber === '' && received > 0 && index % 5 === 4 ? 'societe' : 'locataire',
        payerName: '',
        comment: partialAmount !== undefined ? 'Versement partiel, solde promis la semaine suivante.' : '',
        proofFileId: null,
        status,
      });
    });
  }

  // -------------------------------------------------------------------------
  // Dépenses
  // -------------------------------------------------------------------------
  interface ExpenseSpec {
    vehicle: Vehicle;
    date: IsoDate;
    amountCents: Cents;
    category: string;
    mileageKm: Km | null;
    supplier: string;
    comment: string;
  }

  const expenseSpecs: readonly ExpenseSpec[] = [
    { vehicle: corolla, date: '2024-03-20', amountCents: 21_500, category: 'Carte grise', mileageKm: 78_000, supplier: 'Préfecture du Val-d’Oise', comment: 'Carte grise et démarches.' },
    { vehicle: corolla, date: '2024-04-02', amountCents: 58_900, category: 'Assurance', mileageKm: null, supplier: 'MAIF', comment: 'Assurance tous risques — échéance annuelle.' },
    { vehicle: corolla, date: '2024-11-15', amountCents: 8_500, category: 'Contrôle technique', mileageKm: 92_400, supplier: 'Auto Sécurité Cergy', comment: '' },
    { vehicle: corolla, date: '2025-04-02', amountCents: 61_200, category: 'Assurance', mileageKm: null, supplier: 'MAIF', comment: 'Assurance tous risques — échéance annuelle.' },
    { vehicle: corolla, date: '2025-06-18', amountCents: 42_000, category: 'Pneus', mileageKm: 101_300, supplier: 'Euromaster', comment: 'Quatre pneus toutes saisons.' },
    { vehicle: corolla, date: '2026-01-20', amountCents: 14_500, category: 'Entretien', mileageKm: 110_000, supplier: 'Toyota Cergy', comment: 'Vidange et filtres.' },
    { vehicle: corolla, date: '2026-04-02', amountCents: 63_400, category: 'Assurance', mileageKm: null, supplier: 'MAIF', comment: 'Assurance tous risques — échéance annuelle.' },
    { vehicle: corolla, date: '2026-07-06', amountCents: 4_500, category: 'Nettoyage', mileageKm: 118_000, supplier: 'Clean Auto 95', comment: 'Nettoyage complet avant remise au locataire.' },
    { vehicle: corolla, date: '2026-08-11', amountCents: 32_000, category: 'Mécanique', mileageKm: 122_100, supplier: 'Garage du Nord', comment: 'Remplacement des plaquettes avant.' },
    { vehicle: chr, date: '2025-01-15', amountCents: 18_400, category: 'Carte grise', mileageKm: 32_000, supplier: 'Préfecture du Val-d’Oise', comment: '' },
    { vehicle: chr, date: '2025-02-01', amountCents: 54_800, category: 'Assurance', mileageKm: null, supplier: 'Direct Assurance', comment: '' },
    { vehicle: chr, date: '2025-05-04', amountCents: 3_800, category: 'Nettoyage', mileageKm: 61_000, supplier: 'Clean Auto 95', comment: '' },
    { vehicle: chr, date: '2025-11-12', amountCents: 39_500, category: 'Pneus', mileageKm: 64_200, supplier: 'Norauto', comment: 'Deux pneus avant.' },
    { vehicle: chr, date: '2026-02-01', amountCents: 56_300, category: 'Assurance', mileageKm: null, supplier: 'Direct Assurance', comment: '' },
    { vehicle: chr, date: '2026-06-09', amountCents: 27_600, category: 'Carrosserie', mileageKm: 67_100, supplier: 'Carrosserie Bellevue', comment: 'Reprise de rayures sur l’aile arrière gauche.' },
    { vehicle: prius, date: '2023-06-06', amountCents: 16_900, category: 'Carte grise', mileageKm: 96_000, supplier: 'Préfecture du Val-d’Oise', comment: '' },
    { vehicle: prius, date: '2023-06-20', amountCents: 74_500, category: 'Mécanique', mileageKm: 96_400, supplier: 'Garage du Nord', comment: 'Remise en état à l’achat : distribution et freins.' },
    { vehicle: prius, date: '2023-09-01', amountCents: 49_900, category: 'Assurance', mileageKm: null, supplier: 'MAIF', comment: '' },
    { vehicle: prius, date: '2024-09-01', amountCents: 51_200, category: 'Assurance', mileageKm: null, supplier: 'MAIF', comment: '' },
    { vehicle: prius, date: '2024-12-04', amountCents: 36_800, category: 'Entretien', mileageKm: 121_500, supplier: 'Toyota Argenteuil', comment: 'Révision des 120 000 km.' },
    { vehicle: prius, date: '2025-09-01', amountCents: 52_700, category: 'Assurance', mileageKm: null, supplier: 'MAIF', comment: '' },
    { vehicle: prius, date: '2025-12-18', amountCents: 41_300, category: 'Pneus', mileageKm: 132_400, supplier: 'Euromaster', comment: 'Quatre pneus hiver.' },
    { vehicle: prius, date: '2026-03-02', amountCents: 22_800, category: 'Dépannage', mileageKm: 149_100, supplier: 'Dépannage 95', comment: 'Batterie 12 V remplacée sur place.' },
  ];

  const expenses: Expense[] = expenseSpecs.map((spec) => ({
    id: ctx.newId(),
    createdAt: ctx.now,
    updatedAt: ctx.now,
    archivedAt: null,
    vehicleId: spec.vehicle.id,
    rentalId: null,
    date: spec.date,
    amountCents: spec.amountCents,
    categoryId: ctx.categoryIds[spec.category] ?? '',
    mileageKm: spec.mileageKm,
    supplier: spec.supplier,
    comment: spec.comment,
    invoiceFileId: null,
    photoFileId: null,
    maintenanceRecordId: null,
    damageId: null,
  }));

  // -------------------------------------------------------------------------
  // Entretien
  // -------------------------------------------------------------------------
  interface PlanSpec {
    vehicle: Vehicle;
    type: string;
    intervalKm: number | null;
    intervalMonths: number | null;
    lastKm: Km | null;
    lastDate: IsoDate | null;
    mode: MaintenancePlan['intervalMode'];
  }

  const planSpecs: readonly PlanSpec[] = [
    { vehicle: corolla, type: 'Vidange', mode: 'mixte', intervalKm: 20_000, intervalMonths: 12, lastKm: 110_000, lastDate: '2026-01-20' },
    { vehicle: corolla, type: "Filtre à huile", mode: 'mixte', intervalKm: 20_000, intervalMonths: 12, lastKm: 110_000, lastDate: '2026-01-20' },
    { vehicle: corolla, type: 'Filtre habitacle', mode: 'kilometrage', intervalKm: 20_000, intervalMonths: null, lastKm: 105_000, lastDate: '2025-08-12' },
    { vehicle: corolla, type: 'Pneus', mode: 'kilometrage', intervalKm: 40_000, intervalMonths: null, lastKm: 101_300, lastDate: '2025-06-18' },
    { vehicle: corolla, type: 'Plaquettes', mode: 'kilometrage', intervalKm: 40_000, intervalMonths: null, lastKm: 100_000, lastDate: '2025-05-20' },
    { vehicle: corolla, type: 'Contrôle technique', mode: 'temps', intervalKm: null, intervalMonths: 24, lastKm: 92_400, lastDate: '2024-11-15' },
    { vehicle: chr, type: 'Vidange', mode: 'mixte', intervalKm: 15_000, intervalMonths: 12, lastKm: 61_200, lastDate: '2025-05-06' },
    { vehicle: chr, type: 'Pneus', mode: 'kilometrage', intervalKm: 30_000, intervalMonths: null, lastKm: 64_200, lastDate: '2025-11-12' },
    { vehicle: chr, type: 'Contrôle technique', mode: 'temps', intervalKm: null, intervalMonths: 24, lastKm: 32_000, lastDate: '2025-02-10' },
    { vehicle: prius, type: 'Vidange', mode: 'mixte', intervalKm: 30_000, intervalMonths: 12, lastKm: 121_500, lastDate: '2024-12-04' },
    { vehicle: prius, type: 'Batterie', mode: 'temps', intervalKm: null, intervalMonths: 60, lastKm: 96_000, lastDate: '2023-06-20' },
    { vehicle: prius, type: 'Pneus', mode: 'kilometrage', intervalKm: 40_000, intervalMonths: null, lastKm: 132_400, lastDate: '2025-12-18' },
  ];

  const maintenancePlans: MaintenancePlan[] = planSpecs.map((spec) => ({
    id: ctx.newId(),
    createdAt: ctx.now,
    updatedAt: ctx.now,
    archivedAt: null,
    vehicleId: spec.vehicle.id,
    typeId: ctx.maintenanceTypeIds[spec.type] ?? '',
    intervalMode: spec.mode,
    intervalKm: spec.intervalKm,
    intervalMonths: spec.intervalMonths,
    lastKm: spec.lastKm,
    lastDate: spec.lastDate,
    active: true,
    notes: '',
  }));

  interface RecordSpec {
    vehicle: Vehicle;
    type: string;
    date: IsoDate;
    mileageKm: Km;
    amountCents: Cents;
    supplier: string;
    parts: string;
  }

  const recordSpecs: readonly RecordSpec[] = [
    { vehicle: corolla, type: 'Vidange', date: '2026-01-20', mileageKm: 110_000, amountCents: 14_500, supplier: 'Toyota Cergy', parts: 'Huile 5W30, filtre à huile' },
    { vehicle: corolla, type: 'Plaquettes', date: '2026-08-11', mileageKm: 122_100, amountCents: 32_000, supplier: 'Garage du Nord', parts: 'Plaquettes avant' },
    { vehicle: corolla, type: 'Pneus', date: '2025-06-18', mileageKm: 101_300, amountCents: 42_000, supplier: 'Euromaster', parts: '4 pneus 205/55 R16' },
    { vehicle: corolla, type: 'Contrôle technique', date: '2024-11-15', mileageKm: 92_400, amountCents: 8_500, supplier: 'Auto Sécurité Cergy', parts: '' },
    { vehicle: chr, type: 'Vidange', date: '2025-05-06', mileageKm: 61_200, amountCents: 13_200, supplier: 'Toyota Cergy', parts: 'Huile 0W20, filtre à huile' },
    { vehicle: chr, type: 'Pneus', date: '2025-11-12', mileageKm: 64_200, amountCents: 39_500, supplier: 'Norauto', parts: '2 pneus avant' },
    { vehicle: prius, type: 'Vidange', date: '2024-12-04', mileageKm: 121_500, amountCents: 36_800, supplier: 'Toyota Argenteuil', parts: 'Révision complète, filtres, bougies' },
    { vehicle: prius, type: 'Batterie', date: '2026-03-02', mileageKm: 149_100, amountCents: 22_800, supplier: 'Dépannage 95', parts: 'Batterie 12 V 60 Ah' },
  ];

  const maintenanceRecords: MaintenanceRecord[] = recordSpecs.map((spec) => ({
    id: ctx.newId(),
    createdAt: ctx.now,
    updatedAt: ctx.now,
    archivedAt: null,
    vehicleId: spec.vehicle.id,
    planId:
      maintenancePlans.find(
        (plan) => plan.vehicleId === spec.vehicle.id && plan.typeId === (ctx.maintenanceTypeIds[spec.type] ?? ''),
      )?.id ?? null,
    typeId: ctx.maintenanceTypeIds[spec.type] ?? '',
    date: spec.date,
    mileageKm: spec.mileageKm,
    amountCents: spec.amountCents,
    supplier: spec.supplier,
    comment: '',
    partsChanged: spec.parts,
    invoiceFileId: null,
    photoFileId: null,
  }));

  // -------------------------------------------------------------------------
  // Kilométrage
  // -------------------------------------------------------------------------
  interface MileageSpec {
    vehicle: Vehicle;
    date: IsoDate;
    km: Km;
  }

  const mileageSpecs: readonly MileageSpec[] = [
    { vehicle: corolla, date: '2024-03-15', km: 78_000 },
    { vehicle: corolla, date: '2025-01-10', km: 86_400 },
    { vehicle: corolla, date: '2025-07-01', km: 96_800 },
    { vehicle: corolla, date: '2026-01-20', km: 110_000 },
    { vehicle: corolla, date: '2026-04-30', km: 116_200 },
    { vehicle: corolla, date: '2026-07-06', km: 118_000 },
    { vehicle: corolla, date: '2026-08-01', km: 121_400 },
    { vehicle: corolla, date: '2026-09-01', km: 124_100 },
    { vehicle: corolla, date: '2026-09-15', km: 125_400 },
    { vehicle: chr, date: '2025-01-10', km: 32_000 },
    { vehicle: chr, date: '2025-05-04', km: 61_000 },
    { vehicle: chr, date: '2025-11-12', km: 64_200 },
    { vehicle: chr, date: '2026-05-01', km: 66_900 },
    { vehicle: chr, date: '2026-09-20', km: 68_900 },
    { vehicle: prius, date: '2023-06-01', km: 96_000 },
    { vehicle: prius, date: '2024-12-04', km: 121_500 },
    { vehicle: prius, date: '2025-09-01', km: 118_000 },
    { vehicle: prius, date: '2026-02-28', km: 148_200 },
  ];

  const mileageRecords: MileageRecord[] = mileageSpecs.map((spec) => ({
    id: ctx.newId(),
    createdAt: ctx.now,
    updatedAt: ctx.now,
    archivedAt: null,
    vehicleId: spec.vehicle.id,
    date: spec.date,
    km: spec.km,
    source: spec.km === spec.vehicle.purchaseMileageKm ? 'achat' : 'manuel',
    rentalId: null,
    comment: '',
  }));

  // -------------------------------------------------------------------------
  // États des lieux et dommages
  // -------------------------------------------------------------------------
  const inspectionCorolla: Inspection = {
    id: ctx.newId(),
    createdAt: ctx.now,
    updatedAt: ctx.now,
    archivedAt: null,
    rentalId: rentalCorolla.id,
    vehicleId: corolla.id,
    kind: 'depart',
    date: corollaStart,
    mileageKm: 118_000,
    fuelEighths: 8,
    interiorState: 'Propre, aucun défaut relevé.',
    exteriorState: 'Carrosserie en bon état général, micro-rayures d’usage.',
    observations: 'Remis avec les deux clés et le kit de sécurité.',
    photos: [],
    tenantSignature: TENANT_SIGNATURE,
  };

  const inspectionPriusReturn: Inspection = {
    id: ctx.newId(),
    createdAt: ctx.now,
    updatedAt: ctx.now,
    archivedAt: null,
    rentalId: rentalPriusLate.id,
    vehicleId: prius.id,
    kind: 'retour',
    date: '2026-02-28',
    mileageKm: 148_200,
    fuelEighths: 5,
    interiorState: 'Sellerie à nettoyer côté conducteur.',
    exteriorState: 'État conforme au départ.',
    observations: 'Restitution à l’heure, clés et documents rendus.',
    photos: [],
    tenantSignature: TENANT_SIGNATURE,
  };

  const inspections = [inspectionCorolla, inspectionPriusReturn];

  const damages: Damage[] = [
    {
      id: ctx.newId(),
      createdAt: ctx.now,
      updatedAt: ctx.now,
      archivedAt: null,
      vehicleId: corolla.id,
      rentalId: rentalCorolla.id,
      inspectionId: inspectionCorolla.id,
      origin: 'etat_des_lieux',
      type: 'rayure',
      zone: 'Aile arrière gauche',
      date: corollaStart,
      comment: 'Rayure superficielle constatée avant remise des clés — déjà présente à l’achat.',
      estimatedCostCents: 12_000,
      actualCostCents: 0,
      photoFileId: null,
      repaired: false,
    },
    {
      id: ctx.newId(),
      createdAt: ctx.now,
      updatedAt: ctx.now,
      archivedAt: null,
      vehicleId: chr.id,
      rentalId: rentalChr.id,
      inspectionId: null,
      origin: 'incident',
      type: 'jante',
      zone: 'Jante avant droite',
      date: '2026-06-05',
      comment: 'Frottement contre un trottoir, déclaré par la locataire.',
      estimatedCostCents: 9_000,
      actualCostCents: 27_600,
      photoFileId: null,
      repaired: true,
    },
  ];

  // -------------------------------------------------------------------------
  // Assurances
  // -------------------------------------------------------------------------
  const insurances: Insurance[] = [
    {
      id: ctx.newId(),
      createdAt: ctx.now,
      updatedAt: ctx.now,
      archivedAt: null,
      vehicleId: corolla.id,
      company: 'MAIF',
      contractNumber: 'AS-4471982',
      amountCents: 63_400,
      frequency: 'mensuel',
      startDate: '2024-04-02',
      endDate: '2026-10-20',
      documentFileId: null,
      notes: 'Tous risques, franchise 400 €.',
    },
    {
      id: ctx.newId(),
      createdAt: ctx.now,
      updatedAt: ctx.now,
      archivedAt: null,
      vehicleId: chr.id,
      company: 'Direct Assurance',
      contractNumber: 'DA-99210457',
      amountCents: 56_300,
      frequency: 'mensuel',
      startDate: '2025-02-01',
      endDate: '2027-02-01',
      documentFileId: null,
      notes: '',
    },
    {
      id: ctx.newId(),
      createdAt: ctx.now,
      updatedAt: ctx.now,
      archivedAt: null,
      vehicleId: prius.id,
      company: 'MAIF',
      contractNumber: 'AS-3382014',
      amountCents: 52_700,
      frequency: 'mensuel',
      startDate: '2025-09-01',
      endDate: '2026-09-01',
      documentFileId: null,
      notes: 'Échéance annuelle à surveiller.',
    },
  ];

  // -------------------------------------------------------------------------
  // Documents
  // -------------------------------------------------------------------------
  function tenantDocument(
    tenant: Tenant,
    typeLabel: string,
    fields: Partial<Pick<TenantDocument, 'number' | 'issueDate' | 'expiryDate' | 'comment'>>,
  ): TenantDocument {
    return {
      id: ctx.newId(),
      createdAt: ctx.now,
      updatedAt: ctx.now,
      archivedAt: null,
      tenantId: tenant.id,
      typeId: ctx.documentTypeIds[typeLabel] ?? '',
      number: fields.number ?? '',
      issueDate: fields.issueDate ?? null,
      expiryDate: fields.expiryDate ?? null,
      comment: fields.comment ?? '',
      fileId: null,
      mimeType: '',
      fileName: '',
      sizeBytes: 0,
    };
  }

  const tenantDocuments: TenantDocument[] = [
    // Ahmed : l'assurance manque volontairement — c'est le cas que montre l'écran d'éligibilité.
    tenantDocument(ahmed, 'Permis de conduire', { number: '881204517830', issueDate: '2007-06-12', expiryDate: '2028-04-12' }),
    tenantDocument(ahmed, "Pièce d'identité", { number: 'F845912', issueDate: '2019-03-04', expiryDate: '2031-03-04' }),
    tenantDocument(ahmed, 'Carte VTC', {
      number: 'VTC-2023-114872',
      issueDate: '2023-10-28',
      expiryDate: addDays(today, 30),
      comment: 'Renouvellement à engager.',
    }),
    tenantDocument(ahmed, 'RIB', { comment: 'Compte au Crédit Agricole.' }),

    tenantDocument(claire, 'Permis de conduire', { number: '142209830015', issueDate: '2013-09-24', expiryDate: '2031-09-24' }),
    tenantDocument(claire, "Pièce d'identité", { number: 'G229410', issueDate: '2021-06-11', expiryDate: '2033-06-11' }),
    tenantDocument(claire, 'Carte VTC', { number: 'VTC-2024-208311', issueDate: '2024-02-19', expiryDate: '2029-02-19' }),
    tenantDocument(claire, "Attestation d'assurance", {
      number: 'MAIF-882014',
      issueDate: '2026-05-01',
      expiryDate: addDays(today, 240),
    }),
    tenantDocument(claire, 'Justificatif de domicile', { issueDate: '2026-04-28', expiryDate: addDays(today, 200) }),

    tenantDocument(karim, 'Permis de conduire', { number: '770815293044', issueDate: '2000-03-08', expiryDate: '2027-11-30' }),
    tenantDocument(karim, "Pièce d'identité", { number: 'D118023', issueDate: '2017-01-19', expiryDate: '2029-01-19' }),
    // Document volontairement expiré, pour montrer l'état rouge.
    tenantDocument(karim, "Attestation d'assurance", {
      number: 'MAIF-771233',
      issueDate: '2025-02-01',
      expiryDate: addDays(today, -45),
      comment: 'Contrat résilié à la fin de la location.',
    }),
  ];

  function vehicleDocument(
    vehicle: Vehicle,
    typeLabel: string,
    fields: Partial<Pick<VehicleDocument, 'number' | 'issueDate' | 'expiryDate' | 'comment'>>,
  ): VehicleDocument {
    return {
      id: ctx.newId(),
      createdAt: ctx.now,
      updatedAt: ctx.now,
      archivedAt: null,
      vehicleId: vehicle.id,
      typeId: ctx.documentTypeIds[typeLabel] ?? '',
      number: fields.number ?? '',
      issueDate: fields.issueDate ?? null,
      expiryDate: fields.expiryDate ?? null,
      comment: fields.comment ?? '',
      fileId: null,
      mimeType: '',
      fileName: '',
      sizeBytes: 0,
    };
  }

  const vehicleDocuments: VehicleDocument[] = [
    vehicleDocument(corolla, 'Carte grise', { number: 'GK-482-LM', issueDate: '2024-03-20' }),
    vehicleDocument(corolla, 'Assurance véhicule', { number: 'AS-4471982', issueDate: '2025-10-20', expiryDate: '2026-10-20' }),
    vehicleDocument(corolla, 'Contrôle technique', { number: 'CT-2024-88214', issueDate: '2024-11-15', expiryDate: '2026-11-15' }),
    vehicleDocument(chr, 'Carte grise', { number: 'FT-119-RD', issueDate: '2025-01-15' }),
    vehicleDocument(chr, 'Assurance véhicule', { number: 'DA-99210457', issueDate: '2026-02-01', expiryDate: '2027-02-01' }),
    vehicleDocument(prius, 'Carte grise', { number: 'DP-736-QS', issueDate: '2023-06-06' }),
    vehicleDocument(prius, 'Assurance véhicule', { number: 'AS-3382014', issueDate: '2025-09-01', expiryDate: '2026-09-01' }),
  ];

  // -------------------------------------------------------------------------
  // Contrats
  // -------------------------------------------------------------------------
  const contracts: Contract[] = rentals.map((rental, index) => {
    const vehicle = vehicles.find((v) => v.id === rental.vehicleId) as Vehicle;
    const tenant = tenants.find((t) => t.id === rental.tenantId) as Tenant;
    const signedAt = `${rental.startDate}T10:30:00.000Z`;
    return {
      id: ctx.newId(),
      createdAt: ctx.now,
      updatedAt: ctx.now,
      archivedAt: null,
      rentalId: rental.id,
      reference: `CT-${rental.startDate.slice(0, 4)}-${String(index + 1).padStart(4, '0')}`,
      status: 'signe',
      generatedAt: signedAt,
      ownerSnapshot: JSON.stringify({}),
      tenantSnapshot: JSON.stringify({
        firstName: tenant.firstName,
        lastName: tenant.lastName,
        address: tenant.address,
        phone: tenant.phone,
        email: tenant.email,
        licenseNumber: tenant.licenseNumber,
        vtcNumber: tenant.vtcNumber,
      }),
      vehicleSnapshot: JSON.stringify({
        brand: vehicle.brand,
        model: vehicle.model,
        trim: vehicle.trim,
        year: vehicle.year,
        plate: vehicle.plate,
        vin: vehicle.vin,
        startMileageKm: rental.startMileageKm,
      }),
      rentalSnapshot: JSON.stringify({
        startDate: rental.startDate,
        endDate: rental.endDate,
        openEnded: rental.openEnded,
        rentAmountCents: rental.rentAmountCents,
        frequency: rental.frequency,
        depositCents: rental.depositCents,
        allowedKm: rental.allowedKm,
        excessKmPriceCents: rental.excessKmPriceCents,
      }),
      clausesSnapshot: JSON.stringify([]),
      documentIds: tenantDocuments
        .filter((document) => document.tenantId === tenant.id)
        .map((document) => document.id),
      ownerSignature: OWNER_SIGNATURE,
      tenantSignature: TENANT_SIGNATURE,
      signedAt,
      pdfFileId: null,
    };
  });

  return {
    vehicles,
    tenants,
    rentals,
    contracts,
    payments,
    expenses,
    maintenancePlans,
    maintenanceRecords,
    mileageRecords,
    inspections,
    damages,
    insurances,
    tenantDocuments,
    vehicleDocuments,
  };
}

/** Premier jour du mois courant, exposé pour les tests. */
export function seedMonthStart(today: IsoDate): IsoDate {
  return startOfMonth(today);
}

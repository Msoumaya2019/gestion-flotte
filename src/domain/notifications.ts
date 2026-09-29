/**
 * Planification des rappels.
 *
 * ## Pourquoi un module pur
 *
 * Une notification est un effet : on ne peut pas la relire après coup, et une erreur de
 * date ne se voit qu'une fois le rappel manqué. Toute la décision — *quoi* rappeler,
 * *quand*, avec *quel texte* — est donc prise ici, en fonctions pures, et éprouvée par des
 * tests. Le service ne fait plus que traduire une liste déjà décidée en appels système.
 *
 * ## Le principe : on replanifie tout, à chaque fois
 *
 * Aucun rappel n'est « ajouté » à un ensemble existant. On recalcule la liste complète
 * depuis l'état courant, puis on remplace la précédente. C'est plus simple à raisonner
 * qu'un diff, et surtout plus sûr : un loyer encaissé, un document remplacé ou un
 * entretien fait font disparaître le rappel correspondant **par construction**, sans qu'on
 * ait à se souvenir de l'annuler.
 *
 * ## L'heure de déclenchement
 *
 * Les rappels partent à 9 h, heure locale. Une notification de rappel qui sonne à 3 h du
 * matin est une notification qu'on désactive — et un rappel désactivé ne rappelle rien.
 */

import { addDays, compareIso } from './dates';
import { collectExpiring } from './documents';
import { formatMoney } from './money';
import { maintenanceStatus, nextMaintenanceDue, projectedDateForKm, kmPerDay } from './maintenance';
import { paymentBalance } from './rental';
import type {
  DocumentType,
  Id,
  Insurance,
  IsoDate,
  IsoDateTime,
  Km,
  MaintenancePlan,
  MaintenanceRecord,
  MaintenanceType,
  MileageRecord,
  NotificationKind,
  Payment,
  Rental,
  Tenant,
  TenantDocument,
  Vehicle,
  VehicleDocument,
} from './types';

/** Heure locale des rappels. */
export const REMINDER_HOUR = 9;

/** Un rappel décidé, pas encore confié au système. */
export interface NotificationDraft {
  kind: NotificationKind;
  title: string;
  body: string;
  fireDate: IsoDateTime;
  /** Type de l'entité concernée : `rental`, `vehicle`, `tenant`, `insurance`… */
  relatedType: string;
  relatedId: Id | null;
}

export interface NotificationPlanInput {
  today: IsoDate;
  /** Jours avant échéance auxquels rappeler un document (90, 60, 30, 15, 7…). */
  reminderDays: readonly number[];
  documentWarningDays: number;
  maintenanceWarningKm: number;
  maintenanceCriticalKm: number;
  maintenanceWarningDays: number;
  maintenanceCriticalDays: number;
  vehicles: readonly Vehicle[];
  tenants: readonly Tenant[];
  rentals: readonly Rental[];
  payments: readonly Payment[];
  insurances: readonly Insurance[];
  tenantDocuments: readonly TenantDocument[];
  vehicleDocuments: readonly VehicleDocument[];
  documentTypes: readonly DocumentType[];
  maintenancePlans: readonly MaintenancePlan[];
  maintenanceTypes: readonly MaintenanceType[];
  maintenanceRecords: readonly MaintenanceRecord[];
  mileageRecords: readonly MileageRecord[];
}

// ---------------------------------------------------------------------------
// Outils
// ---------------------------------------------------------------------------

/**
 * Instant de déclenchement, à l'heure locale.
 *
 * On construit la date par ses composantes locales (`new Date(année, mois, jour, heure)`)
 * et non depuis la chaîne ISO : `new Date('2026-09-28T09:00:00Z')` sonnerait à 11 h en
 * été à Paris. Le rappel doit tomber à 9 h pour l'utilisateur, pas à 9 h UTC.
 */
export function fireAt(date: IsoDate, hour: number = REMINDER_HOUR): IsoDateTime {
  const year = Number(date.slice(0, 4));
  const month = Number(date.slice(5, 7));
  const day = Number(date.slice(8, 10));
  return new Date(year, month - 1, day, hour, 0, 0, 0).toISOString();
}

/** Un rappel dont la date est déjà passée ne sert à rien : il ne sonnera jamais. */
function isFuture(draft: NotificationDraft, now: Date): boolean {
  return new Date(draft.fireDate).getTime() > now.getTime();
}

function byFireDate(a: NotificationDraft, b: NotificationDraft): number {
  const delta = compareIso(a.fireDate, b.fireDate);
  if (delta !== 0) return delta;
  return a.kind < b.kind ? -1 : a.kind > b.kind ? 1 : 0;
}

/** Index d'un libellé par identifiant, avec repli sur un texte neutre. */
function labelIndex(types: readonly { id: Id; label: string }[]): Map<Id, string> {
  return new Map(types.map((type) => [type.id, type.label]));
}

function vehicleName(vehicle: Vehicle | undefined): string {
  if (vehicle === undefined) return 'Véhicule';
  const parts = [vehicle.brand, vehicle.model].filter((part) => part.trim() !== '');
  return parts.length === 0 ? (vehicle.plate || 'Véhicule') : parts.join(' ');
}

function tenantName(tenant: Tenant | undefined): string {
  if (tenant === undefined) return 'Locataire';
  const parts = [tenant.firstName, tenant.lastName].filter((part) => part.trim() !== '');
  return parts.length === 0 ? 'Locataire' : parts.join(' ');
}

// ---------------------------------------------------------------------------
// Loyers
// ---------------------------------------------------------------------------

function rentDrafts(input: NotificationPlanInput): NotificationDraft[] {
  const out: NotificationDraft[] = [];
  const rentalsById = new Map(input.rentals.map((rental) => [rental.id, rental]));
  const vehiclesById = new Map(input.vehicles.map((vehicle) => [vehicle.id, vehicle]));
  const tenantsById = new Map(input.tenants.map((tenant) => [tenant.id, tenant]));

  for (const payment of input.payments) {
    if (payment.archivedAt !== null) continue;
    if (payment.status === 'annule') continue;

    const rental = rentalsById.get(payment.rentalId);
    // Un loyer dont la location est terminée ou annulée n'a plus à être réclamé.
    if (rental === undefined || rental.status === 'terminee' || rental.status === 'annulee') continue;

    const balance = paymentBalance(payment);
    if (balance.remainingCents <= 0) continue;

    const label = `${vehicleName(vehiclesById.get(payment.vehicleId))} — ${tenantName(
      tenantsById.get(payment.tenantId),
    )}`;

    // Le jour dit : le loyer est attendu.
    out.push({
      kind: 'loyer_jour',
      title: 'Loyer à encaisser aujourd’hui',
      body: `${label} : ${formatMoney(balance.remainingCents)} attendus.`,
      fireDate: fireAt(payment.dueDate),
      relatedType: 'rental',
      relatedId: payment.rentalId,
    });

    // Le lendemain : toujours rien. Un seul rappel de retard, pas une relance quotidienne —
    // une notification par jour finit par être ignorée, puis désactivée.
    out.push({
      kind: 'loyer_retard',
      title: 'Loyer en retard',
      body: `${label} : ${formatMoney(balance.remainingCents)} non encaissés depuis le ${payment.dueDate}.`,
      fireDate: fireAt(addDays(payment.dueDate, 1)),
      relatedType: 'rental',
      relatedId: payment.rentalId,
    });
  }

  // Fin de location prévue : prévenir la veille, pour préparer l'état des lieux de retour.
  for (const rental of input.rentals) {
    if (rental.archivedAt !== null) continue;
    if (rental.status !== 'active') continue;
    if (rental.endDate === null || rental.openEnded) continue;

    out.push({
      kind: 'retour_location',
      title: 'Retour de véhicule prévu demain',
      body: `${vehicleName(vehiclesById.get(rental.vehicleId))} — ${tenantName(
        tenantsById.get(rental.tenantId),
      )}. Pensez à l’état des lieux et au relevé du compteur.`,
      fireDate: fireAt(addDays(rental.endDate, -1)),
      relatedType: 'rental',
      relatedId: rental.id,
    });
  }

  return out;
}

// ---------------------------------------------------------------------------
// Documents à échéance
// ---------------------------------------------------------------------------

/**
 * Rappels d'échéance d'un document.
 *
 * Les dates de rappel déjà passées sont écartées — elles ne sonneraient pas —, sauf celle
 * du jour même, qui reste utile. Le jour de l'échéance lui-même est toujours rappelé : à
 * ce stade, ce n'est plus un avertissement mais une échéance.
 */
function expiryDrafts(options: {
  kind: NotificationKind;
  relatedType: string;
  relatedId: Id;
  documentLabel: string;
  subject: string;
  expiryDate: IsoDate;
  today: IsoDate;
  reminderDays: readonly number[];
  fireDateOf: (date: IsoDate) => IsoDateTime;
}): NotificationDraft[] {
  const out: NotificationDraft[] = [];
  const days = [...options.reminderDays].filter((day) => day > 0).sort((a, b) => b - a);

  for (const day of days) {
    const date = addDays(options.expiryDate, -day);
    if (compareIso(date, options.today) < 0) continue;
    out.push({
      kind: options.kind,
      title: `${options.documentLabel} : échéance dans ${day} jours`,
      body: `${options.subject} — valable jusqu’au ${options.expiryDate}.`,
      fireDate: options.fireDateOf(date),
      relatedType: options.relatedType,
      relatedId: options.relatedId,
    });
  }

  if (compareIso(options.expiryDate, options.today) >= 0) {
    out.push({
      kind: options.kind,
      title: `${options.documentLabel} : échéance aujourd’hui`,
      body: `${options.subject} — dernier jour de validité.`,
      fireDate: options.fireDateOf(options.expiryDate),
      relatedType: options.relatedType,
      relatedId: options.relatedId,
    });
  }

  return out;
}

function documentDrafts(input: NotificationPlanInput): NotificationDraft[] {
  const out: NotificationDraft[] = [];
  const tenantsById = new Map(input.tenants.map((tenant) => [tenant.id, tenant]));
  const vehiclesById = new Map(input.vehicles.map((vehicle) => [vehicle.id, vehicle]));
  const documentTypeLabels = labelIndex(input.documentTypes);

  for (const document of input.tenantDocuments) {
    if (document.archivedAt !== null || document.expiryDate === null) continue;
    const typeLabel = documentTypeLabels.get(document.typeId) ?? 'Document';
    out.push(
      ...expiryDrafts({
        kind: 'document_locataire',
        relatedType: 'tenant',
        relatedId: document.tenantId,
        documentLabel: typeLabel,
        subject: tenantName(tenantsById.get(document.tenantId)),
        expiryDate: document.expiryDate,
        today: input.today,
        reminderDays: input.reminderDays,
        fireDateOf: (date) => fireAt(date),
      }),
    );
  }

  for (const document of input.vehicleDocuments) {
    if (document.archivedAt !== null || document.expiryDate === null) continue;
    const typeLabel = documentTypeLabels.get(document.typeId) ?? 'Document du véhicule';
    // Le contrôle technique a sa propre nature de rappel : c'est le seul document du
    // véhicule dont l'échéance est légale, et l'utilisateur doit pouvoir n'en couper qu'un.
    const kind: NotificationKind = /contr[oô]le technique/i.test(typeLabel)
      ? 'controle_technique'
      : 'document_vehicule';
    out.push(
      ...expiryDrafts({
        kind,
        relatedType: 'vehicle',
        relatedId: document.vehicleId,
        documentLabel: typeLabel,
        subject: vehicleName(vehiclesById.get(document.vehicleId)),
        expiryDate: document.expiryDate,
        today: input.today,
        reminderDays: input.reminderDays,
        fireDateOf: (date) => fireAt(date),
      }),
    );
  }

  for (const insurance of input.insurances) {
    if (insurance.archivedAt !== null || insurance.endDate === null) continue;
    const company = insurance.company.trim() === '' ? 'Assurance' : insurance.company;
    out.push(
      ...expiryDrafts({
        kind: 'assurance',
        relatedType: 'insurance',
        relatedId: insurance.id,
        documentLabel: 'Assurance',
        subject: `${vehicleName(vehiclesById.get(insurance.vehicleId))} — ${company}`,
        expiryDate: insurance.endDate,
        today: input.today,
        reminderDays: input.reminderDays,
        fireDateOf: (date) => fireAt(date),
      }),
    );
  }

  return out;
}

// ---------------------------------------------------------------------------
// Entretien
// ---------------------------------------------------------------------------

function maintenanceDrafts(input: NotificationPlanInput): NotificationDraft[] {
  const out: NotificationDraft[] = [];
  const vehiclesById = new Map(input.vehicles.map((vehicle) => [vehicle.id, vehicle]));
  const typeLabels = labelIndex(input.maintenanceTypes);

  // Consommation par véhicule, pour dater une échéance exprimée en kilomètres.
  const mileageByVehicle = new Map<Id, { date: IsoDate; km: Km }[]>();
  for (const record of input.mileageRecords) {
    if (record.archivedAt !== null) continue;
    const list = mileageByVehicle.get(record.vehicleId) ?? [];
    list.push({ date: record.date, km: record.km });
    mileageByVehicle.set(record.vehicleId, list);
  }

  for (const plan of input.maintenancePlans) {
    if (plan.archivedAt !== null || !plan.active) continue;

    const vehicle = vehiclesById.get(plan.vehicleId);
    if (vehicle === undefined) continue;
    // Un véhicule vendu ne consomme plus d'entretien.
    if (vehicle.status === 'vendu') continue;

    const due = nextMaintenanceDue(plan);
    const status = maintenanceStatus(due, vehicle.currentMileageKm, input.today, {
      warningKm: input.maintenanceWarningKm,
      criticalKm: input.maintenanceCriticalKm,
      warningDays: input.maintenanceWarningDays,
      criticalDays: input.maintenanceCriticalDays,
    });

    if (status.state === 'inconnu' || status.state === 'ok') continue;

    const typeLabel = typeLabels.get(plan.typeId) ?? 'Entretien';
    const name = vehicleName(vehicle);

    if (status.state === 'depasse') {
      out.push({
        kind: 'entretien_depasse',
        title: `${typeLabel} à faire`,
        body:
          status.kmRemaining !== null && status.kmRemaining <= 0
            ? `${name} : dépassé de ${Math.abs(Math.round(status.kmRemaining))} km.`
            : `${name} : échéance dépassée depuis ${Math.abs(status.daysRemaining ?? 0)} jours.`,
        // Dépassé : on rappelle dès demain matin, et non à une date passée qui ne sonnerait pas.
        fireDate: fireAt(addDays(input.today, 1)),
        relatedType: 'vehicle',
        relatedId: plan.vehicleId,
      });
      continue;
    }

    // « Proche » : on date le rappel si on peut, sinon on rappelle dans une semaine.
    const rate = kmPerDay(mileageByVehicle.get(plan.vehicleId) ?? []);
    const projected =
      status.kmRemaining !== null && rate !== null
        ? projectedDateForKm(status.kmRemaining, rate, input.today)
        : null;
    const candidate = projected ?? (due.nextDate !== null ? addDays(due.nextDate, -input.maintenanceWarningDays) : null);
    const fireDate = candidate !== null && compareIso(candidate, input.today) > 0 ? candidate : addDays(input.today, 7);

    const detail =
      status.kmRemaining !== null
        ? `${Math.round(status.kmRemaining)} km restants`
        : `${status.daysRemaining ?? 0} jours restants`;

    out.push({
      kind: 'entretien_proche',
      title: `${typeLabel} bientôt`,
      body: `${name} : ${detail}.`,
      fireDate: fireAt(fireDate),
      relatedType: 'vehicle',
      relatedId: plan.vehicleId,
    });
  }

  return out;
}

// ---------------------------------------------------------------------------
// Entrée publique
// ---------------------------------------------------------------------------

/**
 * Construit la liste complète des rappels, triée par date.
 *
 * `now` sert uniquement à écarter ce qui est déjà passé ; il est injectable pour que les
 * tests ne dépendent pas de l'horloge.
 */
export function planNotifications(
  input: NotificationPlanInput,
  now: Date = new Date(),
): NotificationDraft[] {
  const drafts = [
    ...rentDrafts(input),
    ...documentDrafts(input),
    ...maintenanceDrafts(input),
  ];

  // Un même rappel peut naître de deux chemins — par exemple une assurance dont la date de
  // fin et un document de véhicule portent la même échéance. On dédoublonne sur la clé
  // (nature, entité, instant) pour ne pas notifier deux fois la même chose.
  const seen = new Set<string>();
  const unique: NotificationDraft[] = [];
  for (const draft of drafts) {
    const key = `${draft.kind}|${draft.relatedType}|${draft.relatedId ?? ''}|${draft.fireDate}`;
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(draft);
  }

  return unique.filter((draft) => isFuture(draft, now)).sort(byFireDate);
}

/** Résumé d'un plan, pour l'écran de réglages. */
export function summarizePlan(drafts: readonly NotificationDraft[]): {
  total: number;
  byKind: Map<NotificationKind, number>;
} {
  const byKind = new Map<NotificationKind, number>();
  for (const draft of drafts) {
    byKind.set(draft.kind, (byKind.get(draft.kind) ?? 0) + 1);
  }
  return { total: drafts.length, byKind };
}

/** Rappels déjà dus : ce que l'application doit montrer **maintenant**, sans attendre le système. */
export function dueReminders(
  drafts: readonly NotificationDraft[],
  now: Date = new Date(),
): NotificationDraft[] {
  const horizon = new Date(now.getTime());
  horizon.setHours(23, 59, 59, 999);
  return drafts.filter((draft) => new Date(draft.fireDate).getTime() <= horizon.getTime());
}

export { collectExpiring };

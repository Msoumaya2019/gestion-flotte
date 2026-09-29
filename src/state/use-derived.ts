/**
 * Dérivations partagées.
 *
 * ## Pourquoi un endroit unique
 *
 * « Quelles catégories comptent comme de l'entretien », « quel est le locataire en cours
 * d'un véhicule » : ces questions reviennent sur plusieurs écrans. Y répondre une fois ici
 * évite que la fiche véhicule et l'écran d'entretien ne comptent pas les mêmes dépenses —
 * un écart qu'on ne remarque que le jour où un chiffre est contesté.
 *
 * ## Le calcul est refait, pas mémorisé
 *
 * Ces fonctions s'exécutent à chaque rendu. Sur une flotte de quelques dizaines de
 * véhicules et quelques milliers de lignes, c'est de l'ordre de la milliseconde. Mettre en
 * cache demanderait de savoir quand invalider — et une invalidation oubliée affiche un
 * chiffre périmé, ce qui est bien plus coûteux qu'un recalcul.
 */

import { useMemo } from 'react';

import { MAINTENANCE_CATEGORY_LABELS, VEHICLE_STATUS_LABELS } from '@/domain/catalog';
import { formatFr, todayIso } from '@/domain/dates';
import { documentValidity } from '@/domain/documents';
import { computeVehicleFinancials, type VehicleFinancials } from '@/domain/finance';
import { maintenanceStatus, nextMaintenanceDue, type MaintenanceStatus } from '@/domain/maintenance';
import { formatKm, formatMoney } from '@/domain/money';
import type { NotificationPlanInput } from '@/domain/notifications';
import { effectivePaymentStatus, paymentBalance } from '@/domain/rental';
import type { SearchDocument } from '@/domain/search';
import type { AppData } from './app-context';

/**
 * Catégories de dépense qui relèvent de l'entretien.
 *
 * On les reconnaît à leur **libellé**, parce qu'un utilisateur peut renommer une catégorie
 * ou en créer une (« Mécanique », « Pneus »). Le rapprochement est volontairement large :
 * compter une dépense d'entretien en trop fausse un coût d'exploitation, l'oublier fausse
 * le même coût dans l'autre sens.
 */
export function maintenanceCategoryIds(data: AppData): string[] {
  const known = new Set(MAINTENANCE_CATEGORY_LABELS.map((label) => label.toLowerCase()));
  return data.expenseCategories
    .filter((category) => known.has(category.label.trim().toLowerCase()))
    .map((category) => category.id);
}

/** Indicateurs financiers d'un véhicule, sur toute son histoire. */
export function vehicleFinancials(data: AppData, vehicleId: string): VehicleFinancials | null {
  const vehicle = data.vehicles.find((candidate) => candidate.id === vehicleId);
  if (vehicle === undefined) return null;

  return computeVehicleFinancials({
    vehicle,
    payments: data.payments.filter((payment) => payment.vehicleId === vehicleId),
    expenses: data.expenses.filter((expense) => expense.vehicleId === vehicleId),
    maintenanceCategoryIds: maintenanceCategoryIds(data),
    today: todayIso(),
  });
}

/** Location en cours d'un véhicule, s'il y en a une. */
export function currentRentalForVehicle(data: AppData, vehicleId: string) {
  return (
    data.rentals.find((rental) => rental.vehicleId === vehicleId && rental.status === 'active') ?? null
  );
}

export interface VehicleAlert {
  kind: 'loyer' | 'document' | 'entretien';
  tone: 'warn' | 'danger';
  message: string;
}

/**
 * Ce qui ne va pas sur un véhicule, en une phrase par problème.
 *
 * Sert à la fois de pastille dans la liste et de liste de courses dans la fiche : un
 * véhicule sans alerte ne doit rien afficher du tout, plutôt qu'un « RAS » qui occupe une
 * ligne pour ne rien dire.
 */
export function vehicleAlerts(data: AppData, vehicleId: string): VehicleAlert[] {
  const today = todayIso();
  const out: VehicleAlert[] = [];

  for (const payment of data.payments) {
    if (payment.vehicleId !== vehicleId) continue;
    const status = effectivePaymentStatus(payment, today);
    if (status !== 'retard' && status !== 'impaye') continue;
    const balance = paymentBalance(payment);
    out.push({
      kind: 'loyer',
      tone: 'danger',
      message: `Loyer en retard de ${(balance.remainingCents / 100).toFixed(2).replace('.', ',')} €`,
    });
    break;
  }

  const expired = data.vehicleDocuments.filter((document) => {
    if (document.vehicleId !== vehicleId || document.expiryDate === null) return false;
    return document.expiryDate < today;
  });
  for (const document of expired) {
    const type = data.documentTypes.find((candidate) => candidate.id === document.typeId);
    out.push({
      kind: 'document',
      tone: 'danger',
      message: `${type?.label ?? 'Document'} expiré`,
    });
  }

  const vehicle = data.vehicles.find((candidate) => candidate.id === vehicleId);
  if (vehicle !== undefined && vehicle.status !== 'vendu') {
    for (const plan of data.maintenancePlans) {
      if (plan.vehicleId !== vehicleId || !plan.active) continue;
      const status = maintenanceStatus(nextMaintenanceDue(plan), vehicle.currentMileageKm, today, {
        warningKm: data.settings.maintenanceWarningKm,
        criticalKm: data.settings.maintenanceCriticalKm,
        warningDays: data.settings.maintenanceWarningDays,
        criticalDays: data.settings.maintenanceCriticalDays,
      });
      if (status.state !== 'proche' && status.state !== 'depasse') continue;
      const type = data.maintenanceTypes.find((candidate) => candidate.id === plan.typeId);
      out.push({
        kind: 'entretien',
        tone: status.state === 'depasse' ? 'danger' : 'warn',
        message: `${type?.label ?? 'Entretien'} ${status.state === 'depasse' ? 'dépassé' : 'à prévoir'}`,
      });
    }
  }

  return out;
}

/** État d'entretien d'un plan, pour la fiche véhicule et l'onglet Entretien. */
export interface MaintenancePlanStatus {
  planId: string;
  vehicleId: string;
  vehicleLabel: string;
  typeLabel: string;
  status: MaintenanceStatus;
  nextKm: number | null;
  nextDate: string | null;
}

export function maintenancePlanStatuses(data: AppData): MaintenancePlanStatus[] {
  const today = todayIso();
  const out: MaintenancePlanStatus[] = [];

  for (const plan of data.maintenancePlans) {
    if (!plan.active) continue;
    const vehicle = data.vehicles.find((candidate) => candidate.id === plan.vehicleId);
    if (vehicle === undefined) continue;

    const due = nextMaintenanceDue(plan);
    const type = data.maintenanceTypes.find((candidate) => candidate.id === plan.typeId);

    out.push({
      planId: plan.id,
      vehicleId: plan.vehicleId,
      vehicleLabel: `${vehicle.brand} ${vehicle.model}`.trim(),
      typeLabel: type?.label ?? 'Entretien',
      status: maintenanceStatus(due, vehicle.currentMileageKm, today, {
        warningKm: data.settings.maintenanceWarningKm,
        criticalKm: data.settings.maintenanceCriticalKm,
        warningDays: data.settings.maintenanceWarningDays,
        criticalDays: data.settings.maintenanceCriticalDays,
      }),
      nextKm: due.nextKm,
      nextDate: due.nextDate,
    });
  }

  // Les plus urgents d'abord : dépassé, puis proche, puis inconnu.
  const order = { depasse: 0, proche: 1, inconnu: 2, ok: 3 } as const;
  return out.sort((a, b) => order[a.status.state] - order[b.status.state]);
}

/** Nom complet d'un locataire, ou un texte neutre. */
export function tenantName(data: AppData, tenantId: string): string {
  const tenant = data.tenants.find((candidate) => candidate.id === tenantId);
  if (tenant === undefined) return 'Locataire';
  const name = `${tenant.firstName} ${tenant.lastName}`.trim();
  return name === '' ? 'Locataire' : name;
}

/** Nom court d'un véhicule : « Corolla Touring Sports », ou la plaque en dernier recours. */
export function vehicleName(data: AppData, vehicleId: string): string {
  const vehicle = data.vehicles.find((candidate) => candidate.id === vehicleId);
  if (vehicle === undefined) return 'Véhicule';
  const name = `${vehicle.brand} ${vehicle.model}`.trim();
  return name === '' ? vehicle.plate || 'Véhicule' : name;
}

/** Regroupe des éléments par clé, en préservant l'ordre d'apparition. */
export function groupBy<T, K extends string>(items: readonly T[], key: (item: T) => K): Map<K, T[]> {
  const map = new Map<K, T[]>();
  for (const item of items) {
    const group = key(item);
    const list = map.get(group);
    if (list === undefined) map.set(group, [item]);
    else list.push(item);
  }
  return map;
}

/** Mémoïse un calcul coûteux sur les données. */
export function useDerived<T>(compute: () => T, dependencies: readonly unknown[]): T {
  // eslint-disable-next-line react-hooks/exhaustive-deps
  return useMemo(compute, dependencies);
}

/**
 * Entrée du planificateur de rappels, construite depuis les données.
 *
 * Elle est écrite une seule fois, ici, parce que deux endroits en ont besoin : l'écran qui
 * montre les rappels à venir et l'écran qui les repose. Deux constructions séparées
 * finiraient par diverger, et l'utilisateur verrait une liste différente de celle qui
 * sonne réellement — le genre d'écart qu'on ne remarque qu'après avoir manqué une échéance.
 */
export function notificationPlanInput(data: AppData, today: string): NotificationPlanInput {
  const { settings } = data;
  return {
    today,
    reminderDays: settings.reminderDays,
    documentWarningDays: settings.documentWarningDays,
    maintenanceWarningKm: settings.maintenanceWarningKm,
    maintenanceCriticalKm: settings.maintenanceCriticalKm,
    maintenanceWarningDays: settings.maintenanceWarningDays,
    maintenanceCriticalDays: settings.maintenanceCriticalDays,
    vehicles: data.vehicles,
    tenants: data.tenants,
    rentals: data.rentals,
    payments: data.payments,
    insurances: data.insurances,
    tenantDocuments: data.tenantDocuments,
    vehicleDocuments: data.vehicleDocuments,
    documentTypes: data.documentTypes,
    maintenancePlans: data.maintenancePlans,
    maintenanceTypes: data.maintenanceTypes,
    maintenanceRecords: data.maintenanceRecords,
    mileageRecords: data.mileageRecords,
  };
}

/**
 * Corpus de la recherche globale.
 *
 * ## Pourquoi il est construit ici
 *
 * Il aplatit sept familles d'entités en objets indexables, et cette mise à plat encode des
 * choix : ce qui est cherché (une plaque, un numéro de permis, un fournisseur), ce qui est
 * montré, et la route à ouvrir. Deux écrans qui construiraient leur propre corpus
 * finiraient par ne plus trouver la même chose — et un résultat introuvable est
 * indistinguable d'une donnée absente.
 *
 * ## Les dépenses ne pointent pas vers leur formulaire
 *
 * `/ajout/depense` ne sait qu'**enregistrer une nouvelle dépense** : il ne lit pas
 * d'identifiant et présélectionne le premier véhicule de la flotte. Y envoyer un résultat
 * de recherche créerait donc une dépense en double sur le mauvais véhicule — un dégât
 * silencieux, découvert des semaines plus tard dans les comptes. Le résultat pointe vers la
 * fiche du véhicule, où la dépense est lisible et où les chiffres restent justes.
 *
 * Les champs indexés sont volontairement larges : on cherche un fournisseur, une plaque
 * partielle, un numéro de contrat. Un index trop strict ne trouve pas ce qu'on sait présent.
 */
export function buildSearchCorpus(data: AppData): SearchDocument[] {
  const out: SearchDocument[] = [];

  for (const vehicle of data.vehicles) {
    const name = `${vehicle.brand} ${vehicle.model} ${vehicle.trim}`.trim();
    out.push({
      kind: 'vehicule',
      id: vehicle.id,
      title: name === '' ? 'Véhicule sans nom' : name,
      subtitle: `${vehicle.plate} · ${VEHICLE_STATUS_LABELS[vehicle.status].label} · ${formatKm(vehicle.currentMileageKm)}`,
      href: `/vehicule/${vehicle.id}`,
      fields: [vehicle.plate, vehicle.vin, vehicle.brand, vehicle.model, vehicle.trim, vehicle.notes],
    });
  }

  for (const tenant of data.tenants) {
    const name = `${tenant.firstName} ${tenant.lastName}`.trim();
    out.push({
      kind: 'locataire',
      id: tenant.id,
      title: name === '' ? 'Locataire sans nom' : name,
      subtitle: [tenant.phone, tenant.email].filter((part) => part.trim() !== '').join(' · '),
      href: `/locataire/${tenant.id}`,
      fields: [
        tenant.firstName,
        tenant.lastName,
        tenant.phone,
        tenant.email,
        tenant.address,
        tenant.licenseNumber,
        tenant.vtcNumber,
        tenant.notes,
      ],
    });
  }

  for (const rental of data.rentals) {
    out.push({
      kind: 'location',
      id: rental.id,
      title: `${vehicleName(data, rental.vehicleId)} — ${tenantName(data, rental.tenantId)}`,
      subtitle:
        rental.endDate === null
          ? `Depuis le ${formatFr(rental.startDate)} · ${formatMoney(rental.rentAmountCents)}`
          : `Du ${formatFr(rental.startDate)} au ${formatFr(rental.endDate)}`,
      href: `/location/${rental.id}`,
      fields: [rental.notes, String(rental.rentAmountCents)],
    });
  }

  for (const contract of data.contracts) {
    if (contract.archivedAt !== null) continue;
    const rental = data.rentals.find((candidate) => candidate.id === contract.rentalId);
    out.push({
      kind: 'contrat',
      id: contract.id,
      title: contract.reference,
      subtitle:
        rental === undefined
          ? 'Contrat de location'
          : `${vehicleName(data, rental.vehicleId)} — ${tenantName(data, rental.tenantId)}`,
      href: `/contrat/${contract.rentalId}`,
      fields: [contract.reference],
    });
  }

  for (const payment of data.payments) {
    const label = paymentBalance(payment).remainingCents > 0 ? 'Reste dû' : 'Encaissé';
    out.push({
      kind: 'paiement',
      id: payment.id,
      title: `${label} ${formatMoney(payment.expectedCents)}`,
      subtitle: `Échéance du ${formatFr(payment.dueDate)} · ${vehicleName(data, payment.vehicleId)}`,
      href: `/ajout/paiement?id=${payment.id}`,
      fields: [payment.comment, payment.payerName, String(payment.receivedCents)],
    });
  }

  for (const expense of data.expenses) {
    const category = data.expenseCategories.find((candidate) => candidate.id === expense.categoryId);
    out.push({
      kind: 'depense',
      id: expense.id,
      title: `${category?.label ?? 'Dépense'} ${formatMoney(expense.amountCents)}`,
      subtitle: `${formatFr(expense.date)} · ${vehicleName(data, expense.vehicleId)}`,
      // Voir l'en-tête : `/ajout/depense` est en création seule, donc on ouvre la fiche
      // du véhicule plutôt que de risquer une dépense en double.
      href: `/vehicule/${expense.vehicleId}`,
      fields: [expense.supplier, expense.comment, category?.label ?? ''],
    });
  }

  for (const record of data.maintenanceRecords) {
    const type = data.maintenanceTypes.find((candidate) => candidate.id === record.typeId);
    out.push({
      kind: 'entretien',
      id: record.id,
      title: `${type?.label ?? 'Entretien'} — ${vehicleName(data, record.vehicleId)}`,
      subtitle: `${formatFr(record.date)} · ${formatKm(record.mileageKm)} · ${formatMoney(record.amountCents)}`,
      href: `/ajout/entretien?id=${record.id}`,
      fields: [record.supplier, record.comment, record.partsChanged],
    });
  }

  for (const document of data.tenantDocuments) {
    if (document.archivedAt !== null) continue;
    const type = data.documentTypes.find((candidate) => candidate.id === document.typeId);
    const validity = documentValidity(document.expiryDate, todayIso(), data.settings.documentWarningDays);
    out.push({
      kind: 'document',
      id: document.id,
      title: `${type?.label ?? 'Document'} — ${tenantName(data, document.tenantId)}`,
      subtitle:
        document.expiryDate === null
          ? document.number
          : `Jusqu’au ${formatFr(document.expiryDate)} (${validity.daysRemaining} j)`,
      href: `/ajout/document?id=${document.id}`,
      fields: [document.number, document.comment, document.fileName],
    });
  }

  for (const document of data.vehicleDocuments) {
    if (document.archivedAt !== null) continue;
    const type = data.documentTypes.find((candidate) => candidate.id === document.typeId);
    out.push({
      kind: 'document',
      id: document.id,
      title: `${type?.label ?? 'Document'} — ${vehicleName(data, document.vehicleId)}`,
      subtitle:
        document.expiryDate === null
          ? document.number
          : `Jusqu’au ${formatFr(document.expiryDate)}`,
      href: `/ajout/document?id=${document.id}`,
      fields: [document.number, document.comment, document.fileName],
    });
  }

  return out;
}

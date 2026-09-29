/**
 * Entretien : échéances calculées depuis le plan du véhicule.
 *
 * Aucune fréquence n'est imposée par le code. Le plan porte l'intervalle voulu par le
 * propriétaire, dans l'une des trois formes :
 *
 * - `kilometrage` : « tous les 20 000 km » ;
 * - `temps` : « tous les 12 mois » ;
 * - `mixte` : « 20 000 km **ou** 12 mois, au premier des deux atteint ».
 *
 * La prochaine échéance se calcule **depuis la dernière intervention connue**, jamais
 * depuis la date du jour : c'est ce qui fait qu'un véhicule peu roulant ne voit pas son
 * échéance glisser indéfiniment.
 */

import { addDays, addMonths, compareIso, daysBetween } from './dates';
import { formatNumberFr } from './money';
import type { IsoDate, Km, MaintenanceIntervalMode, MaintenancePlan } from './types';

export interface NextDue {
  nextKm: Km | null;
  nextDate: IsoDate | null;
}

/** Prochaine échéance d'un plan, en kilomètres et/ou en date. */
export function nextMaintenanceDue(
  plan: Pick<MaintenancePlan, 'intervalMode' | 'intervalKm' | 'intervalMonths' | 'lastKm' | 'lastDate'>,
): NextDue {
  const usesKm = plan.intervalMode === 'kilometrage' || plan.intervalMode === 'mixte';
  const usesTime = plan.intervalMode === 'temps' || plan.intervalMode === 'mixte';

  const nextKm =
    usesKm && plan.lastKm !== null && plan.intervalKm !== null ? plan.lastKm + plan.intervalKm : null;
  const nextDate =
    usesTime && plan.lastDate !== null && plan.intervalMonths !== null
      ? addMonths(plan.lastDate, plan.intervalMonths)
      : null;

  return { nextKm, nextDate };
}

export type MaintenanceState = 'inconnu' | 'ok' | 'proche' | 'depasse';

export interface MaintenanceStatus {
  state: MaintenanceState;
  /** Kilomètres restants avant l'échéance (négatif si dépassée). */
  kmRemaining: number | null;
  /** Jours restants avant l'échéance (négatif si dépassée). */
  daysRemaining: number | null;
  /** Ce qui déclenche l'état : le kilométrage, la date, ou les deux. */
  triggeredBy: 'kilometrage' | 'temps' | 'aucun';
}

export interface MaintenanceThresholds {
  warningKm: number;
  criticalKm: number;
  warningDays: number;
  criticalDays: number;
}

/**
 * État d'un plan d'entretien.
 *
 * En mode mixte, le premier des deux seuils atteint commande : un véhicule qui n'a pas
 * roulé doit quand même passer en entretien au bout d'un an.
 */
export function maintenanceStatus(
  due: NextDue,
  currentKm: Km,
  today: IsoDate,
  thresholds: MaintenanceThresholds,
): MaintenanceStatus {
  const kmRemaining = due.nextKm === null ? null : due.nextKm - currentKm;
  const daysRemaining = due.nextDate === null ? null : daysBetween(today, due.nextDate);

  if (kmRemaining === null && daysRemaining === null) {
    return { state: 'inconnu', kmRemaining: null, daysRemaining: null, triggeredBy: 'aucun' };
  }

  const kmOverdue = kmRemaining !== null && kmRemaining <= 0;
  const kmCritical = kmRemaining !== null && kmRemaining <= thresholds.criticalKm;
  const kmWarning = kmRemaining !== null && kmRemaining <= thresholds.warningKm;

  const dateOverdue = daysRemaining !== null && daysRemaining <= 0;
  const dateCritical = daysRemaining !== null && daysRemaining <= thresholds.criticalDays;
  const dateWarning = daysRemaining !== null && daysRemaining <= thresholds.warningDays;

  if (kmOverdue || dateOverdue) {
    return {
      state: 'depasse',
      kmRemaining,
      daysRemaining,
      triggeredBy: kmOverdue && dateOverdue ? 'kilometrage' : kmOverdue ? 'kilometrage' : 'temps',
    };
  }
  if (kmCritical || dateCritical) {
    return {
      state: 'proche',
      kmRemaining,
      daysRemaining,
      triggeredBy: kmCritical ? 'kilometrage' : 'temps',
    };
  }
  if (kmWarning || dateWarning) {
    return {
      state: 'proche',
      kmRemaining,
      daysRemaining,
      triggeredBy: kmWarning ? 'kilometrage' : 'temps',
    };
  }
  return { state: 'ok', kmRemaining, daysRemaining, triggeredBy: 'aucun' };
}

/**
 * Distance restante en kilomètres, projetée depuis la consommation récente.
 * Sert à dire « à ce rythme, l'échéance tombe vers le 12 mars ».
 */
export function projectedDateForKm(
  kmRemaining: number,
  kmPerDay: number,
  today: IsoDate,
): IsoDate | null {
  if (kmPerDay <= 0 || kmRemaining <= 0) return null;
  const days = Math.round(kmRemaining / kmPerDay);
  return addDays(today, days);
}

/** Consommation moyenne en kilomètres par jour, sur une suite de relevés triés. */
export function kmPerDay(
  records: readonly { date: IsoDate; km: Km }[],
): number | null {
  if (records.length < 2) return null;
  const sorted = [...records].sort((a, b) => compareIso(a.date, b.date));
  const first = sorted[0];
  const last = sorted[sorted.length - 1];
  if (first === undefined || last === undefined) return null;
  const days = daysBetween(first.date, last.date);
  if (days <= 0) return null;
  return (last.km - first.km) / days;
}

/** Intervalle résumé en une phrase : « tous les 20 000 km ou tous les 12 mois ». */
export function intervalLabel(
  mode: MaintenanceIntervalMode,
  intervalKm: number | null,
  intervalMonths: number | null,
): string {
  const kmPart = intervalKm === null ? null : `tous les ${formatNumberFr(intervalKm)} km`;
  const timePart = intervalMonths === null ? null : `tous les ${formatNumberFr(intervalMonths)} mois`;
  if (mode === 'kilometrage') return kmPart ?? 'intervalle non défini';
  if (mode === 'temps') return timePart ?? 'intervalle non défini';
  if (kmPart !== null && timePart !== null) return `${kmPart} ou ${timePart}`;
  return kmPart ?? timePart ?? 'intervalle non défini';
}

/**
 * Nouveau point de départ d'un plan après une intervention.
 * Le kilométrage retenu est celui de l'intervention, pas le kilométrage courant du
 * véhicule : une intervention saisie en retard ne doit pas décaler l'échéance suivante.
 */
export function applyIntervention(
  plan: Pick<MaintenancePlan, 'intervalMode' | 'intervalKm' | 'intervalMonths' | 'lastKm' | 'lastDate'>,
  intervention: { date: IsoDate; mileageKm: Km },
): NextDue {
  return nextMaintenanceDue({
    ...plan,
    lastKm: intervention.mileageKm,
    lastDate: intervention.date,
  });
}

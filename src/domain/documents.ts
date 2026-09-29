/**
 * Validité des documents et rappels d'expiration.
 *
 * Un document sans date d'expiration n'est pas « valide » : il est **sans échéance**.
 * Confondre les deux ferait croire à une conformité qu'on n'a pas vérifiée.
 */

import { addDays, compareIso, daysBetween } from './dates';
import type { DocumentStatus, IsoDate } from './types';

export interface DocumentValidity {
  status: DocumentStatus;
  /** Jours avant expiration (négatif si dépassé). `null` si le document n'expire pas. */
  daysRemaining: number | null;
}

export function documentValidity(
  expiryDate: IsoDate | null,
  today: IsoDate,
  warningDays: number,
): DocumentValidity {
  if (expiryDate === null || expiryDate === '') {
    return { status: 'sans_echeance', daysRemaining: null };
  }
  const remaining = daysBetween(today, expiryDate);
  if (remaining < 0) return { status: 'expire', daysRemaining: remaining };
  if (remaining <= warningDays) return { status: 'expire_bientot', daysRemaining: remaining };
  return { status: 'valide', daysRemaining: remaining };
}

/** Un document est utilisable s'il est valide ou sans échéance. */
export function isUsable(status: DocumentStatus): boolean {
  return status === 'valide' || status === 'sans_echeance';
}

/**
 * Dates auxquelles poser un rappel avant l'expiration.
 * Les seuils déjà passés sont écartés : programmer une notification dans le passé la
 * ferait tirer immédiatement, ce qui n'aide personne.
 */
export function reminderDates(
  expiryDate: IsoDate,
  thresholdsDays: readonly number[],
  today: IsoDate,
): IsoDate[] {
  return thresholdsDays
    .map((days) => addDays(expiryDate, -Math.abs(days)))
    .filter((date) => compareIso(date, today) >= 0)
    .sort(compareIso);
}

/**
 * Documents à surveiller, du plus urgent au moins urgent.
 *
 * La fonction est **générique** : elle rend chaque entrée d'origine enrichie de son échéance,
 * au lieu de ne recopier que les champs qu'elle connaît. L'appelant peut donc joindre ce
 * dont il a besoin — la route à ouvrir, le nom du titulaire — et le retrouver tel quel.
 *
 * Auparavant elle rendait une forme figée, et l'écran d'accueil devait rechercher la route
 * par identifiant après coup. Ce contournement perdait le nom du titulaire, qui n'était pas
 * dans la forme figée : le sous-titre de la ligne restait vide.
 */
export function collectExpiring<T extends { id: string; label: string; expiryDate: IsoDate | null }>(
  documents: readonly T[],
  today: IsoDate,
  warningDays: number,
): (T & { daysRemaining: number; status: DocumentStatus })[] {
  const out: (T & { daysRemaining: number; status: DocumentStatus })[] = [];
  for (const document of documents) {
    if (document.expiryDate === null) continue;
    const validity = documentValidity(document.expiryDate, today, warningDays);
    if (validity.status === 'valide' || validity.daysRemaining === null) continue;
    out.push({ ...document, daysRemaining: validity.daysRemaining, status: validity.status });
  }
  return out.sort((a, b) => a.daysRemaining - b.daysRemaining);
}

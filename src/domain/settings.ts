/**
 * Réglages par défaut.
 *
 * Ils sont fusionnés avec ce qui est lu en base : un réglage ajouté après coup prend sa
 * valeur par défaut au lieu de valoir `undefined`. C'est ce qui évite d'avoir à écrire une
 * migration pour chaque nouveau paramètre.
 */

import type { AppSettings } from './types';

export const DEFAULT_SETTINGS: AppSettings = {
  owner: {
    firstName: '',
    lastName: '',
    company: '',
    address: '',
    phone: '',
    email: '',
    siret: '',
    extra: '',
  },
  requiredDocumentTypeIds: [],
  /** Seuils proposés dans les paramètres ; l'utilisateur peut les modifier. */
  reminderDays: [90, 60, 30, 15, 7],
  /** Verrouillage automatique : une minute après la mise en arrière-plan. */
  lockDelaySeconds: 60,
  biometricsEnabled: true,
  pinEnabled: false,
  currency: '€',
  maintenanceWarningKm: 2000,
  maintenanceCriticalKm: 500,
  maintenanceWarningDays: 45,
  maintenanceCriticalDays: 15,
  documentWarningDays: 30,
  rentalKmWarning: 1000,
  seedVersion: 0,
};

export interface LockDelayOption {
  label: string;
  seconds: number;
}

export const LOCK_DELAY_OPTIONS: readonly LockDelayOption[] = [
  { label: 'Immédiatement', seconds: 0 },
  { label: 'Après 1 minute', seconds: 60 },
  { label: 'Après 5 minutes', seconds: 300 },
  { label: 'Après 15 minutes', seconds: 900 },
  { label: 'Jamais', seconds: -1 },
];

export const REMINDER_PRESETS: readonly number[] = [90, 60, 30, 15, 7];

/** Un réglage est-il encore à sa valeur par défaut ? Sert à décider d'afficher une aide. */
export function ownerProfileIsEmpty(settings: AppSettings): boolean {
  const { owner } = settings;
  return (
    owner.firstName.trim() === '' &&
    owner.lastName.trim() === '' &&
    owner.company.trim() === '' &&
    owner.address.trim() === '' &&
    owner.phone.trim() === '' &&
    owner.email.trim() === ''
  );
}

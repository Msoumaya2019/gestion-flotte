/**
 * Primitives liées à l'appareil.
 *
 * Trois choses seulement, et volontairement pas plus : des octets aléatoires, un
 * identifiant, l'heure. Tout le reste du code reçoit ces valeurs en paramètre plutôt que
 * d'aller les chercher — c'est ce qui permet de rejouer un calcul financier à une date
 * fixée au lieu de dépendre du jour où le test tourne.
 */

import * as Crypto from 'expo-crypto';
import { nowIso, todayIso } from '@/domain/dates';
import { createId } from '@/domain/ids';
import type { RandomBytes } from './crypto';

/**
 * Octets aléatoires du système.
 *
 * `getRandomBytes` est **synchrone** et puise dans le générateur cryptographique de la
 * plateforme. On ne l'enveloppe pas dans une promesse : le chiffrement en a besoin de
 * façon synchrone, et une source « presque aléatoire » ne serait pas acceptable pour une
 * clé de coffre.
 */
export const deviceRandomBytes: RandomBytes = (length) => Crypto.getRandomBytes(length);

/** Identifiant unique, au format UUID v4, tiré du générateur système. */
export function newId(): string {
  return createId(deviceRandomBytes);
}

/** Horodatage UTC, au format ISO 8601. */
export function deviceNow(): string {
  return nowIso();
}

/** Date locale du jour, au format `AAAA-MM-JJ`. */
export function deviceToday(): string {
  return todayIso();
}

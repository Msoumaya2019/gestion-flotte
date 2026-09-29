/**
 * Ouverture de la base locale.
 *
 * La base vit dans le dossier privé de l'application, sous `flotte.db`. Elle ne quitte
 * jamais l'appareil : il n'y a ni serveur, ni synchronisation, ni compte. C'est ce qui
 * permet à l'application de fonctionner entièrement hors ligne — et c'est aussi pourquoi
 * la sauvegarde manuelle existe.
 *
 * ## Deux pragmas, et pourquoi ils sont posés à chaque ouverture
 *
 * - `foreign_keys = ON` : SQLite ne les applique **pas** par défaut. Sans ce pragma, la
 *   contrainte `ON DELETE RESTRICT` qui empêche de supprimer un véhicule encore loué ne
 *   servirait à rien — elle serait écrite dans le schéma et ignorée à l'exécution.
 * - `journal_mode = WAL` : une écriture n'attend plus la fin des lectures. Utile quand un
 *   écran de liste se rafraîchit pendant qu'un paiement est enregistré.
 *
 * Ces deux pragmas ne sont pas persistants : ils valent pour la connexion, pas pour le
 * fichier. Il faut donc les reposer à chaque ouverture, et non une seule fois.
 */

import * as SQLite from 'expo-sqlite';
import { bootstrapDatabase, type BootstrapResult } from '@/data/bootstrap';
import { newId } from './device';

export const DATABASE_NAME = 'flotte.db';

/**
 * Installer les véhicules et locataires fictifs au tout premier démarrage.
 *
 * L'amorçage est idempotent et gardé par `seedVersion` : ce jeu d'essai ne revient jamais
 * une fois supprimé. Le passer à `false` livre une application vide.
 */
export const INSTALL_DEMO_DATA = true;

let pending: Promise<BootstrapResult> | null = null;

/**
 * Ouvre la base, la migre et l'amorce. **Une seule fois par processus.**
 *
 * L'ouverture est mémorisée, y compris sa promesse : deux écrans qui se montent en même
 * temps au démarrage partagent donc la même ouverture, au lieu de lancer deux migrations
 * concurrentes sur le même fichier.
 */
export function openAppDatabase(): Promise<BootstrapResult> {
  pending ??= openOnce();
  return pending;
}

/** Force une nouvelle ouverture — réservé à la restauration d'une sauvegarde. */
export function resetDatabaseHandle(): void {
  pending = null;
}

async function openOnce(): Promise<BootstrapResult> {
  const db = await SQLite.openDatabaseAsync(DATABASE_NAME);

  await db.execAsync('PRAGMA journal_mode = WAL;');
  await db.execAsync('PRAGMA foreign_keys = ON;');

  return bootstrapDatabase(db, { newId, withDemoData: INSTALL_DEMO_DATA });
}

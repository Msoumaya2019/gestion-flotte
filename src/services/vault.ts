/**
 * Clé du coffre : le secret qui rend les documents illisibles hors de l'application.
 *
 * Elle vit dans le trousseau du système (`expo-secure-store`), **pas** dans la base. C'est
 * la raison d'être de cette séparation : une copie du fichier SQLite — extraite par une
 * sauvegarde iCloud, un outil de débogage ou un accès au conteneur de l'application — ne
 * contient alors que des chemins et des métadonnées, jamais de quoi lire un permis de
 * conduire ou une carte grise.
 *
 * ## Le choix d'accessibilité, et ce qu'il coûte
 *
 * L'élément est posé en `WHEN_UNLOCKED_THIS_DEVICE_ONLY`. Deux conséquences, assumées :
 *
 * - la clé n'est **pas** synchronisée par le trousseau iCloud, donc elle ne quitte pas
 *   l'appareil ;
 * - si l'appareil est restauré depuis une sauvegarde iCloud, les fichiers du coffre
 *   reviennent mais **pas** la clé : les documents déjà enregistrés deviennent
 *   définitivement illisibles.
 *
 * Le second point est un vrai coût, et c'est pour cela que la sauvegarde manuelle
 * (`backup.ts`) existe : c'est elle qui protège d'une perte d'appareil, avec un mot de
 * passe que l'utilisateur détient. Le coffre, lui, protège de la fuite.
 */

import * as SecureStore from 'expo-secure-store';
import { createVaultKey, decodeVaultKey, encodeVaultKey, type RandomBytes } from './crypto';

/** Nom de l'élément de trousseau. La version est dans le nom : une clé v2 ne se lira pas comme une v1. */
const VAULT_KEY_ITEM = 'flotte.vaultKey.v1';

const SECURE_STORE_OPTIONS: SecureStore.SecureStoreOptions = {
  keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
};

/** Le trousseau est-il utilisable sur cet appareil ? */
export async function vaultIsAvailable(): Promise<boolean> {
  return SecureStore.isAvailableAsync();
}

/** Une clé est-elle déjà posée ? Ne la lit pas, ne la crée pas. */
export async function vaultKeyExists(): Promise<boolean> {
  return (await SecureStore.getItemAsync(VAULT_KEY_ITEM, SECURE_STORE_OPTIONS)) !== null;
}

/**
 * Rend la clé du coffre, en la créant au premier appel.
 *
 * Une clé présente mais **illisible** lève, et n'est jamais remplacée en silence : la
 * remplacer rendrait les nouveaux fichiers lisibles tout en perdant définitivement les
 * anciens, sans que rien ne le signale. Mieux vaut un message clair qu'une perte muette.
 */
export async function loadOrCreateVaultKey(random: RandomBytes): Promise<Uint8Array> {
  const stored = await SecureStore.getItemAsync(VAULT_KEY_ITEM, SECURE_STORE_OPTIONS);

  if (stored !== null) {
    try {
      return decodeVaultKey(stored);
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      throw new Error(
        `La clé du coffre est présente dans le trousseau mais illisible (${detail}). ` +
          'Les documents déjà enregistrés ne peuvent pas être ouverts. ' +
          'Une sauvegarde restaurée sur cet appareil rétablit l’accès ; sinon, il faut repartir d’un coffre vide.',
      );
    }
  }

  const key = createVaultKey(random);
  await SecureStore.setItemAsync(VAULT_KEY_ITEM, encodeVaultKey(key), SECURE_STORE_OPTIONS);
  return key;
}

/**
 * Oublie la clé. Les fichiers deviennent illisibles — c'est le but, et cela ne se fait
 * que sur une demande explicite, jamais au cours d'une réparation.
 */
export async function forgetVaultKey(): Promise<void> {
  await SecureStore.deleteItemAsync(VAULT_KEY_ITEM, SECURE_STORE_OPTIONS);
}

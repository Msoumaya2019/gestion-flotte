/**
 * Doublure de `expo-secure-store`.
 *
 * Le trousseau est simulé par une table en mémoire. Elle permet d'éprouver la logique du
 * coffre — création au premier appel, refus de remplacer une clé illisible, oubli explicite
 * — sans appareil.
 *
 * Ce que la doublure ne dit pas : que le trousseau du système refuse réellement de
 * synchroniser un élément posé en `WHEN_UNLOCKED_THIS_DEVICE_ONLY`. Cela relève d'iOS.
 */

const store = new Map();

export const WHEN_UNLOCKED = 'whenUnlocked';
export const WHEN_UNLOCKED_THIS_DEVICE_ONLY = 'whenUnlockedThisDeviceOnly';
export const AFTER_FIRST_UNLOCK = 'afterFirstUnlock';

export async function isAvailableAsync() {
  return true;
}

export async function getItemAsync(key) {
  return store.has(key) ? store.get(key) : null;
}

export async function setItemAsync(key, value) {
  store.set(key, value);
}

export async function deleteItemAsync(key) {
  store.delete(key);
}

export async function getItem(key) {
  return store.has(key) ? store.get(key) : null;
}

export function setItem(key, value) {
  store.set(key, value);
}

export function __resetKeychain() {
  store.clear();
}

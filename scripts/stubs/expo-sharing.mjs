/**
 * Doublure de `expo-sharing`.
 *
 * Elle enregistre les partages demandés au lieu d'ouvrir une feuille de partage : un test
 * peut ainsi vérifier **ce qui aurait été partagé**, sans dialogue système.
 */

const shared = [];

export async function isAvailableAsync() {
  return true;
}

export async function shareAsync(url, options = {}) {
  shared.push({ url, ...options });
}

/** Partages enregistrés depuis le dernier appel à `__resetShared`. */
export function __shared() {
  return [...shared];
}

export function __resetShared() {
  shared.length = 0;
}

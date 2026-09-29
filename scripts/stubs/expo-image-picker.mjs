/**
 * Doublure de `expo-image-picker`.
 *
 * Même principe que la doublure du sélecteur de documents : le résultat est piloté depuis
 * le test, y compris l'annulation.
 */

let next = { canceled: true, assets: null };

export const MediaTypeOptions = { Images: 'Images', All: 'All' };

export async function launchImageLibraryAsync() {
  return next;
}

export async function launchCameraAsync() {
  return next;
}

export async function requestCameraPermissionsAsync() {
  return { granted: true, status: 'granted' };
}

export async function requestMediaLibraryPermissionsAsync() {
  return { granted: true, status: 'granted' };
}

/** `null` simule une annulation. */
export function __setNextResult(asset) {
  next = asset === null ? { canceled: true, assets: null } : { canceled: false, assets: [asset] };
}

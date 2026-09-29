/**
 * Doublure de `expo-document-picker`.
 *
 * Aucun sélecteur ne peut s'ouvrir dans un processus Node. Le résultat est piloté depuis le
 * test par `__setNextResult`, ce qui permet d'éprouver le traitement d'un choix — et le
 * traitement d'une annulation, qui est le cas qu'on oublie.
 */

let next = { canceled: true, assets: null };

export async function getDocumentAsync() {
  return next;
}

/** `null` simule une annulation. */
export function __setNextResult(asset) {
  next = asset === null ? { canceled: true, assets: null } : { canceled: false, assets: [asset] };
}

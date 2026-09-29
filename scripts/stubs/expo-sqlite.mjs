/**
 * Doublure de `expo-sqlite`.
 *
 * Elle ne fournit **aucun moteur** : elle lève. Les tests de base de données n'utilisent
 * pas `expo-sqlite` — ils passent par `tests/helpers/sqlite.ts`, qui branche le
 * `node:sqlite` intégré sur le même port `SqlDatabase`. C'est ce qui fait que les
 * migrations et les requêtes sont réellement exécutées par un moteur SQLite.
 *
 * Cette doublure existe pour que le graphe de modules se charge, pas pour remplacer un
 * moteur. Un test qui l'appellerait échouerait bruyamment, et c'est voulu.
 */

export async function openDatabaseAsync() {
  throw new Error(
    'expo-sqlite n’est pas doublé : les tests doivent passer par tests/helpers/sqlite.ts (node:sqlite).',
  );
}

export async function openDatabaseSync() {
  throw new Error(
    'expo-sqlite n’est pas doublé : les tests doivent passer par tests/helpers/sqlite.ts (node:sqlite).',
  );
}

export async function deleteDatabaseAsync() {
  return undefined;
}

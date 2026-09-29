/**
 * Doublure de `expo-print`.
 *
 * Le rendu HTML → PDF est fait par un moteur natif : il ne peut pas s'exécuter dans un
 * processus Node. `printToFileAsync` écrit donc un PDF factice d'un octet dans le disque
 * simulé et rend son URI, ce qui permet d'éprouver le **chemin de sortie** — nommage,
 * déplacement, partage — sans prétendre avoir composé une page.
 *
 * Un test qui vérifie ici le contenu du PDF ne vérifie rien : la composition A4 est du
 * ressort du moteur du système, et seul un appareil peut en juger.
 */

import { Directory, File, Paths } from './expo-file-system.mjs';

let counter = 0;

export async function printToFileAsync() {
  counter += 1;
  const directory = new Directory(Paths.cache.uri, 'Print');
  if (!directory.exists) directory.create();
  const file = new File(directory.uri, `Print-${String(counter).padStart(4, '0')}.pdf`);
  file.create();
  file.write(new Uint8Array([0x25, 0x50, 0x44, 0x46])); // « %PDF »
  return { uri: file.uri, numberOfPages: 1 };
}

export async function printAsync() {
  return undefined;
}

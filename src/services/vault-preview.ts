/**
 * Sortir un fichier du coffre, le temps de le montrer.
 *
 * ## Le problème
 *
 * Les documents sont chiffrés sur le disque. Un composant `Image`, la visionneuse du
 * système ou une feuille de partage ne savent lire qu'un fichier en clair, à une URI. Il
 * faut donc **déchiffrer vers un fichier temporaire** pour afficher ou transmettre.
 *
 * ## Ce que cela coûte, dit franchement
 *
 * Pendant la durée de l'aperçu, une copie en clair existe dans le dossier cache de
 * l'application. C'est une brèche réelle dans la garantie du coffre, et elle est assumée :
 * sans elle, il n'y aurait aucun moyen de relire un permis de conduire. Trois mesures la
 * limitent :
 *
 * - le fichier est écrit dans le dossier **cache**, jamais dans un dossier exposé ;
 * - il est supprimé dès que l'aperçu se ferme, et son nom porte un préfixe reconnaissable
 *   pour qu'un reste éventuel soit identifiable ;
 * - la suppression est aussi tentée à l'ouverture suivante, pour le cas où l'application
 *   aurait été tuée pendant un aperçu.
 *
 * Un document n'est jamais déchiffré « au cas où » : seulement sur une action explicite.
 */

import { File, Paths } from 'expo-file-system';

import type { StoredFile } from '@/data/mappers';
import { safeFileName } from '@/domain/csv';
import type { VaultFileStore } from './file-store';

/** Préfixe des copies temporaires : permet de reconnaître — et de nettoyer — un reste. */
export const PREVIEW_PREFIX = 'apercu-';

export interface PreviewFile {
  uri: string;
  name: string;
  sizeBytes: number;
  /** Supprime la copie en clair. À appeler dès que l'aperçu est terminé. */
  discard(): void;
}

/**
 * Déchiffre un fichier du coffre vers le cache et rend son URI.
 *
 * Lève si le déchiffrement échoue — clé de coffre différente, fichier altéré. L'appelant
 * doit afficher le message : c'est le seul moment où l'utilisateur peut comprendre que ses
 * anciens documents ne sont plus lisibles sur cet appareil.
 */
export async function materializeForPreview(
  vault: VaultFileStore,
  file: Pick<StoredFile, 'id' | 'fileName' | 'relativePath'>,
): Promise<PreviewFile> {
  const bytes = await vault.read(file);

  const extension = file.fileName.includes('.') ? (file.fileName.split('.').pop() ?? '') : '';
  const base = extension === '' ? file.fileName : file.fileName.slice(0, -(extension.length + 1));
  const name = safeFileName(`${PREVIEW_PREFIX}${base || file.id}`, extension === '' ? 'bin' : extension);

  const target = new File(Paths.cache, name);
  if (target.exists) target.delete();
  target.create();
  target.write(bytes);

  return {
    uri: target.uri,
    name,
    sizeBytes: bytes.length,
    discard(): void {
      if (target.exists) target.delete();
    },
  };
}

/**
 * Efface les copies temporaires laissées par une session précédente.
 *
 * Sans cela, un aperçu interrompu par une fermeture brutale de l'application laisserait un
 * document en clair dans le cache jusqu'à ce que le système décide de faire de la place —
 * c'est-à-dire peut-être jamais.
 */
export function purgePreviews(): number {
  // `Paths.cache` est déjà un `Directory` : l'emballer dans un `File` donnerait un objet
  // qui n'a pas de `list()` — et le nettoyage ne ferait rien, en silence.
  const cache = Paths.cache;
  if (!cache.exists) return 0;
  let removed = 0;
  try {
    for (const entry of cache.list()) {
      if (!(entry instanceof File)) continue;
      if (!entry.name.startsWith(PREVIEW_PREFIX)) continue;
      entry.delete();
      removed += 1;
    }
  } catch {
    // Le cache est un confort : son nettoyage ne doit jamais empêcher l'application de
    // démarrer. Un échec ici est sans conséquence pour les données.
    return removed;
  }
  return removed;
}

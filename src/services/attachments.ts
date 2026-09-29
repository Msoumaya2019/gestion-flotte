/**
 * Dépôt et retrait d'une pièce jointe.
 *
 * ## Pourquoi ce module existe
 *
 * Cinq écrans déposent un fichier dans le coffre — photo de véhicule, document de
 * locataire, document de véhicule, photo d'incident, photo d'état des lieux — et trois en
 * retirent. Écrire ces quelques lignes cinq fois, c'est se donner cinq occasions d'inverser
 * l'ordre, ou d'oublier une étape. Or l'ordre compte :
 *
 * 1. on **écrit le contenu** dans le coffre, chiffré ;
 * 2. on **insère la ligne** qui le décrit ;
 * 3. et si l'insertion échoue, on **retire le contenu**.
 *
 * ## Ce que coûte un désordre
 *
 * Une ligne insérée sans contenu donne un document qui s'ouvre sur une erreur de
 * déchiffrement : l'utilisateur croit son permis enregistré, et il ne l'est pas. Un contenu
 * écrit sans ligne ne se voit pas du tout — il occupe simplement de la place, sans que rien
 * ne le signale, jusqu'à ce qu'un vidage de la base le rende définitivement orphelin.
 *
 * Le premier cas est le plus grave : il ment. C'est donc celui que l'ordre ci-dessus
 * écarte, et le nettoyage du second est fait au mieux — un échec de suppression ne doit pas
 * faire échouer un enregistrement qui, lui, a réussi.
 */

import type { Repositories } from '@/data/repositories';
import type { StoredFile } from '@/data/mappers';
import type { VaultFileStore } from './file-store';

/** Natures de fichier acceptées. Une valeur libre ferait diverger le nettoyage des orphelins. */
export type AttachmentKind = 'photo' | 'document' | 'contrat' | 'recu' | 'sauvegarde';

export interface StoreFromUriInput {
  vault: VaultFileStore;
  repositories: Repositories;
  kind: AttachmentKind;
  /** URI du fichier choisi hors du coffre : sélecteur de documents, photothèque. */
  uri: string;
  fileName: string;
  mimeType: string;
  notes?: string;
}

/**
 * Enregistre un fichier venu de l'extérieur et rend sa ligne, insérée en base.
 *
 * Le nom d'origine est conservé tel quel : c'est ce que l'utilisateur reconnaîtra dans une
 * liste. Il ne sert **pas** à nommer le fichier sur le disque — le coffre nomme par
 * identifiant, sans extension (voir `file-store`).
 */
export async function storeAttachmentFromUri(input: StoreFromUriInput): Promise<StoredFile> {
  const stored = await input.vault.saveFromUri({
    kind: input.kind,
    fileName: input.fileName,
    mimeType: input.mimeType,
    uri: input.uri,
    notes: input.notes,
  });
  return commitAttachment(input.repositories, input.vault, stored);
}

export interface StoreBytesInput {
  vault: VaultFileStore;
  repositories: Repositories;
  kind: AttachmentKind;
  bytes: Uint8Array;
  fileName: string;
  mimeType: string;
  notes?: string;
}

/** Même chose, pour un contenu déjà en mémoire — un PDF engendré, un CSV exporté. */
export async function storeAttachmentFromBytes(input: StoreBytesInput): Promise<StoredFile> {
  const stored = await input.vault.save({
    kind: input.kind,
    fileName: input.fileName,
    mimeType: input.mimeType,
    bytes: input.bytes,
    notes: input.notes,
  });
  return commitAttachment(input.repositories, input.vault, stored);
}

/**
 * Insère la ligne, et défait l'écriture du contenu si elle échoue.
 *
 * L'échec de l'insertion est propagé : l'appelant doit savoir que rien n'a été enregistré.
 * L'échec du nettoyage, lui, ne l'est pas — il ne change rien à ce que l'utilisateur doit
 * faire, et un message d'erreur en plus masquerait l'erreur réelle.
 */
async function commitAttachment(
  repositories: Repositories,
  vault: VaultFileStore,
  stored: StoredFile,
): Promise<StoredFile> {
  try {
    await repositories.files.insert(stored);
  } catch (error) {
    try {
      await vault.remove(stored);
    } catch {
      // Le contenu reste sur le disque sans ligne : invisible, et sans effet sur les
      // données. Le retirer à moitié vaudrait moins qu'un orphelin silencieux.
    }
    throw error;
  }
  return stored;
}

/**
 * Retire un fichier et archive sa ligne.
 *
 * La ligne est **archivée**, pas supprimée : un document retiré par erreur doit pouvoir
 * être rétabli, et l'historique d'un contrat signé peut désigner une pièce qui n'est plus
 * là. Seul le contenu disparaît vraiment — c'est lui qui occupait de la place.
 */
export async function removeAttachment(input: {
  vault: VaultFileStore;
  repositories: Repositories;
  file: Pick<StoredFile, 'id' | 'relativePath'>;
  now: string;
}): Promise<void> {
  await input.vault.remove(input.file);
  await input.repositories.files.archive(input.file.id, input.now);
}

/**
 * Retire le contenu de plusieurs fichiers devenus inutiles.
 *
 * Appelé au nettoyage : les lignes orphelines — qu'aucun document ne référence — gardent
 * un contenu que personne ne peut atteindre. On ne touche qu'au contenu ; les lignes sont
 * archivées par l'appelant, qui sait à quoi elles se rattachaient.
 */
export async function purgeOrphanContents(
  vault: VaultFileStore,
  files: readonly Pick<StoredFile, 'relativePath'>[],
): Promise<number> {
  let removed = 0;
  for (const file of files) {
    try {
      await vault.remove(file);
      removed += 1;
    } catch {
      // Un fichier déjà absent n'est pas un échec : le but est qu'il ne soit plus là.
    }
  }
  return removed;
}

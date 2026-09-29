/**
 * Ouvrir une pièce du coffre.
 *
 * ## Le chemin
 *
 * Le contenu est chiffré sur le disque ; une application ne sait pas lire un conteneur
 * AES-GCM. On le déchiffre donc vers le cache, on remet le fichier en clair au système par
 * la feuille de partage — qui propose « Aperçu », « Enregistrer dans Fichiers », une
 * application de lecture de PDF — puis on **supprime la copie en clair** dès que la feuille
 * est refermée.
 *
 * ## Ce que cela coûte, et pourquoi c'est acceptable
 *
 * Pendant l'aperçu, une copie non chiffrée existe dans le cache de l'application. C'est
 * inévitable : le système ne sait pas déchiffrer à notre place. Ce qui est maîtrisé, c'est
 * sa durée de vie — le temps de la consultation, et pas au-delà. Les restes d'une
 * consultation interrompue sont balayés à l'ouverture suivante (voir `vault-preview`).
 *
 * ## Ce que cela ne fait pas
 *
 * Aucun fichier n'est copié vers un dossier public, aucune URL n'est produite, rien n'est
 * envoyé à un serveur. La feuille de partage est un choix de l'utilisateur : s'il décide
 * d'envoyer son permis par courriel, c'est sa décision — l'application, elle, ne l'a pas
 * fait sortir toute seule.
 */

import type { Repositories } from '@/data/repositories';
import type { VaultFileStore } from './file-store';
import { shareOutput } from './output';
import { materializeForPreview } from './vault-preview';

export interface OpenAttachmentInput {
  vault: VaultFileStore | null;
  repositories: Repositories | null;
  fileId: string | null;
  /** Titre de la feuille de partage : « Permis de conduire — Amina Belkacem ». */
  dialogTitle: string;
}

/**
 * Déchiffre une pièce et la remet au système.
 *
 * Lève un message explicite dans les trois cas qui ne sont pas des bogues : pas de coffre
 * sur cet appareil, pas de fichier rattaché, fichier introuvable dans le coffre. Les
 * confondre laisserait l'utilisateur devant un écran qui ne réagit pas.
 */
export async function openAttachment(input: OpenAttachmentInput): Promise<void> {
  if (input.fileId === null) {
    throw new Error('Aucun fichier n’est rattaché à ce document.');
  }
  if (input.vault === null || input.repositories === null) {
    throw new Error(
      'Le coffre de cet appareil est indisponible : le document ne peut pas être ouvert.',
    );
  }

  const stored = await input.repositories.files.get(input.fileId);
  if (stored === null) {
    throw new Error('Le fichier n’a pas été trouvé dans la base.');
  }

  const preview = await materializeForPreview(input.vault, stored);
  try {
    await shareOutput(
      { uri: preview.uri, name: preview.name, sizeBytes: preview.sizeBytes },
      input.dialogTitle,
    );
  } finally {
    // Dans tous les cas, y compris si le partage échoue : une copie en clair qui survit à
    // une erreur est exactement ce qu'il ne faut pas laisser derrière soi.
    preview.discard();
  }
}

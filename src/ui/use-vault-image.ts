/**
 * Afficher une image du coffre.
 *
 * Un composant `Image` ne sait lire qu'une URI en clair. Le crochet déchiffre donc le
 * fichier vers le cache, le temps de l'aperçu, et **le supprime au démontage** — sans quoi
 * la copie en clair survivrait à l'écran qui l'a demandée.
 *
 * Le déchiffrement échoue si la clé du coffre de cet appareil ne correspond plus au fichier
 * (restauration iCloud, changement d'appareil). Ce n'est pas une erreur de programmation :
 * l'erreur est donc rendue, à charge de l'écran de la montrer.
 */

import { useEffect, useState } from 'react';

import { useApp } from '@/state/app-context';
import { materializeForPreview, type PreviewFile } from '@/services/vault-preview';

export interface VaultImageState {
  uri: string | null;
  error: string | null;
  loading: boolean;
}

export function useVaultImage(fileId: string | null): VaultImageState {
  const { vault, repositories } = useApp();
  const [state, setState] = useState<VaultImageState>({ uri: null, error: null, loading: false });

  useEffect(() => {
    let cancelled = false;
    let preview: PreviewFile | null = null;

    async function run(): Promise<void> {
      if (fileId === null || vault === null || repositories === null) {
        setState({ uri: null, error: null, loading: false });
        return;
      }

      setState({ uri: null, error: null, loading: true });

      try {
        const stored = await repositories.files.get(fileId);
        if (stored === null) {
          if (!cancelled) setState({ uri: null, error: 'Fichier introuvable.', loading: false });
          return;
        }
        preview = await materializeForPreview(vault, stored);
        if (cancelled) {
          preview.discard();
          return;
        }
        setState({ uri: preview.uri, error: null, loading: false });
      } catch (error) {
        if (!cancelled) {
          setState({
            uri: null,
            error: error instanceof Error ? error.message : String(error),
            loading: false,
          });
        }
      }
    }

    void run();

    return () => {
      cancelled = true;
      // La copie en clair est retirée dès que l'écran disparaît, et non à la prochaine
      // ouverture de l'application : c'est la seule garantie qui ne dépende pas d'un
      // nettoyage ultérieur.
      preview?.discard();
    };
  }, [fileId, vault, repositories]);

  return state;
}

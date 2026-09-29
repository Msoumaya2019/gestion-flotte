/**
 * Charger les lignes archivées d'une table.
 *
 * ## Pourquoi elles ne sont pas dans l'état global
 *
 * `loadEverything` lit chaque table avec `list()`, qui **exclut** les archivés. C'est
 * délibéré : les archivés ne doivent compter ni dans un total, ni dans une liste
 * déroulante de saisie, ni dans un tableau de bord. Les charger dans `data` ferait
 * réapparaître un véhicule vendu dans le sélecteur d'une nouvelle location.
 *
 * Mais une liste qui archive sans jamais montrer ce qu'elle a archivé rend le geste
 * irréversible en pratique. D'où ce chargement **à part**, propre à l'écran qui affiche
 * les archivés, et rafraîchi quand les données changent.
 *
 * ## Pourquoi `quand`
 *
 * Le compte change après chaque archivage ou restauration. `refresh()` remplace le
 * tableau concerné, et c'est cette **nouvelle identité** qui relance la lecture : un
 * simple compteur de rendus relancerait la requête à chaque frappe.
 */

import { useEffect, useRef, useState } from 'react';

export function useArchived<T>(charger: (() => Promise<T[]>) | null, quand: unknown): readonly T[] {
  const [lignes, setLignes] = useState<readonly T[]>([]);
  const chargeur = useRef(charger);
  chargeur.current = charger;

  useEffect(() => {
    let annule = false;
    const lire = chargeur.current;
    if (lire === null) {
      setLignes([]);
      return;
    }
    void lire()
      .then((resultat) => {
        if (!annule) setLignes(resultat);
      })
      .catch(() => {
        // Un échec de lecture des archivés ne doit pas vider l'écran principal : on
        // montre simplement une liste d'archivés vide, et le reste continue de marcher.
        if (!annule) setLignes([]);
      });
    return () => {
      annule = true;
    };
  }, [quand]);

  return lignes;
}

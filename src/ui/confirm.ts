/**
 * Confirmation sous forme de promesse.
 *
 * `Alert.alert` ne rend rien : il faut passer une fonction de rappel pour savoir ce que
 * l'utilisateur a répondu. Cela oblige à imbriquer la suite dans le rappel, ce qui rend
 * illisible une action qui enchaîne — compter, demander, archiver, recharger. Enveloppé
 * dans une promesse, l'enchaînement s'écrit à plat.
 *
 * ## Le cas qui compte : la fermeture sans réponse
 *
 * Sur Android, la boîte se ferme au bouton « retour » sans qu'aucun bouton soit touché.
 * Sans `onDismiss`, la promesse ne se résoudrait **jamais** : le geste resterait en
 * attente, la ligne ouverte, et rien ne le dirait.
 */

import { Alert } from 'react-native';

export interface Confirmation {
  titre: string;
  message: string;
  /** Libellé du bouton qui confirme. Un verbe, jamais « OK ». */
  libelle: string;
  /** Libellé du bouton qui renonce. */
  annuler?: string;
  /** Rouge sur iOS quand l'action retire ou détruit. Vrai par défaut. */
  destructeur?: boolean;
}

export function confirmer(confirmation: Confirmation): Promise<boolean> {
  return new Promise<boolean>((resoudre) => {
    let repondu = false;
    const repondre = (valeur: boolean): void => {
      if (repondu) return;
      repondu = true;
      resoudre(valeur);
    };

    Alert.alert(
      confirmation.titre,
      confirmation.message,
      [
        { text: confirmation.annuler ?? 'Annuler', style: 'cancel', onPress: () => repondre(false) },
        {
          text: confirmation.libelle,
          style: confirmation.destructeur === false ? 'default' : 'destructive',
          onPress: () => repondre(true),
        },
      ],
      { cancelable: true, onDismiss: () => repondre(false) },
    );
  });
}

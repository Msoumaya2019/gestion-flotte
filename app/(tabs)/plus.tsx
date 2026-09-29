/**
 * Onglet « + ».
 *
 * Cette route n'affiche rien : son appui est intercepté dans la barre d'onglets, qui ouvre
 * la feuille de saisie. Elle existe parce qu'expo-router exige qu'un onglet déclaré
 * corresponde à un fichier — mais si elle est atteinte malgré tout (par un lien profond,
 * par exemple), elle redirige au lieu d'afficher un écran blanc.
 */

import type { ReactElement } from 'react';
import { Redirect } from 'expo-router';

export default function PlusTab(): ReactElement {
  return <Redirect href="/ajout" />;
}

/**
 * Vérifie qu'un paquet livré contient bien le code de l'application.
 *
 * ## Pourquoi
 *
 * Un paquet qui compile n'est pas un paquet juste. Deux défauts se ressemblent et ne se
 * voient ni l'un ni l'autre dans un journal de compilation :
 *
 * - un binaire **vide de l'application** — mauvais point d'entrée, écran de gabarit à la
 *   place de l'application. C'est arrivé sur ce projet : `"main": "index.ts"` montait le
 *   gabarit Expo, et l'application entière était du code mort derrière un écran de démo.
 *   Rien dans `tsc`, rien dans les tests, rien dans la compilation ne le disait ;
 * - un binaire dont la **configuration** manque, quand une variable `EXPO_PUBLIC_*` n'a pas
 *   été inlinée au *bundling*. Il s'installe parfaitement et n'affiche aucune donnée.
 *
 * Ce projet-ci est entièrement **hors ligne** : il n'a aucune variable `EXPO_PUBLIC_*`. Le
 * contrôle porte donc sur la présence du **code** — les chemins de routes, qui n'existent
 * que si les écrans ont été empaquetés.
 *
 * ## Les deux encodages, et pourquoi les deux
 *
 * Le bundle de release est du bytecode **Hermes**. Une chaîne purement ASCII y est rangée
 * en ASCII, mais une chaîne contenant **un seul caractère hors ASCII** est rangée en
 * **UTF-16LE**. Une recherche en UTF-8 seul conclut donc à tort à une absence dans une
 * application française — et l'absence est exactement ce que ce contrôle refuse.
 *
 * Les témoins choisis ici sont **sans accent**, ce qui les met à l'abri de cette question.
 * La recherche teste malgré tout les deux encodages : c'est une assurance pour le jour où
 * quelqu'un ajoutera un témoin accentué sans y penser.
 *
 * ## Ce qu'il ne prouve pas
 *
 * Que l'écran s'affiche, ni qu'il réagit. Que les ressources se chargent. Que la base
 * accepte les appels. Il prouve que **le code de l'application est dans le paquet**.
 *
 * Usage :
 *   node scripts/verifier-contenu-paquet.mjs <bundle> [<témoin>...]
 */

import { readFileSync, statSync } from 'node:fs';

/**
 * Les témoins par défaut : des **chemins de routes** d'`expo-router`.
 *
 * Chacun n'existe que si l'écran correspondant a été empaqueté, et ils sont sans accent —
 * donc à l'abri de la question d'encodage. En choisir un par domaine fonctionnel plutôt que
 * trois du même écran : c'est ce qui distingue « le paquet contient l'application » de
 * « le paquet contient un écran ».
 *
 * **L'identifiant du paquet n'est pas un témoin du bundle JS.** `fr.gestionflotte.app` a
 * d'abord figuré ici, et l'essai sur un vrai export Hermes l'a écarté : il vit dans le
 * manifeste Android et l'`Info.plist` d'iOS, pas dans le JavaScript. Le chercher ici
 * faisait échouer un paquet parfaitement correct — mesuré, quatre témoins trouvés, le
 * cinquième absent. Ce que l'identifiant prouve se vérifie sur le projet natif généré,
 * à un autre endroit du flux.
 */
const TEMOINS_PAR_DEFAUT = [
  'etat-lieux/[rentalId]',
  'contrat/[id]',
  'sauvegarde',
  'vehicule/[id]',
  'locataire/[id]',
  'retour/[id]',
];

function chercher(fichier, temoin) {
  const utf8 = fichier.indexOf(Buffer.from(temoin, 'utf8'));
  // UTF-16LE : chaque caractère suivi d'un octet nul. Pour de l'ASCII, cela revient à
  // espacer les octets — c'est la forme que Hermes emploie dès qu'un caractère non ASCII
  // voisine dans la même chaîne.
  const utf16 = fichier.indexOf(Buffer.from(temoin, 'utf16le'));
  return { utf8: utf8 !== -1, utf16: utf16 !== -1 };
}

function main() {
  const chemin = process.argv[2];
  if (chemin === undefined) {
    console.error('[usage] node scripts/verifier-contenu-paquet.mjs <bundle> [<témoin>...]');
    process.exit(1);
  }

  const temoins = process.argv.length > 3 ? process.argv.slice(3) : TEMOINS_PAR_DEFAUT;

  let fichier;
  try {
    fichier = readFileSync(chemin);
  } catch (erreur) {
    console.error(`[bundle-illisible] ${chemin} : ${erreur.message}`);
    process.exit(1);
  }

  const taille = statSync(chemin).size;
  if (taille === 0) {
    console.error(`[bundle-vide] ${chemin} fait zéro octet : il n'y a rien à inspecter.`);
    process.exit(1);
  }

  const absents = [];
  for (const temoin of temoins) {
    const trouve = chercher(fichier, temoin);
    const ou = trouve.utf8 ? 'UTF-8' : trouve.utf16 ? 'UTF-16LE' : null;
    if (ou === null) {
      absents.push(temoin);
      console.error(`[temoin-absent] ${temoin}`);
    } else {
      console.log(`ok — ${temoin} (${ou})`);
    }
  }

  if (absents.length > 0) {
    console.error(
      `\n${absents.length} témoin(s) absent(s) sur ${temoins.length}, dans ${chemin} (${taille} octets).\n` +
        "Le paquet ne contient pas le code attendu : ne pas le livrer.",
    );
    process.exit(1);
  }

  console.log(
    `\n${temoins.length} témoin(s) trouvé(s) sur ${temoins.length} dans ${chemin} (${taille} octets).`,
  );
}

main();
